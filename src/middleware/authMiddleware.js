const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const { pool } = require('../utils/database');
const { decrypt } = require('../utils/encryption');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // FIXED: Correct SQL syntax - removed the SET command that was causing the error
        const result = await pool.query(
            'SELECT id, email, username, role, two_factor_enabled, is_active, locked_until FROM users WHERE id = $1',
            [decoded.userId]
        );
        
        const user = result.rows[0];

        if (!user || !user.is_active) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found or inactive' 
            });
        }
        
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account is locked. Please try again later.' 
            });
        }

        req.user = user;
        
        // FIXED: This was causing the error - removed the SET LOCAL command
        // If you need to set session variables, do it in a separate query
        // await pool.query('SET LOCAL app.current_user_id = $1', [user.id]);
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token' 
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Token expired' 
            });
        }
        console.error('Auth middleware error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
};

const loginHandler = async (req, res) => {
    const { email, password, twoFactorCode } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    try {
        // Get user by email
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            await pool.query(
                'INSERT INTO audit_logs (action, entity_type, old_values, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
                ['LOGIN_FAILED', 'auth', JSON.stringify({ reason: 'user_not_found', email }), ipAddress, userAgent]
            );
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const lockoutTimeLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(403).json({ 
                success: false, 
                message: `Account is locked. Try again in ${lockoutTimeLeft} minutes.` 
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            const newFailedAttempts = (user.failed_attempts || 0) + 1;
            let lockedUntil = null;
            
            if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
                lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
            }

            await pool.query(
                'UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3',
                [newFailedAttempts, lockedUntil, user.id]
            );
            
            await pool.query(
                'INSERT INTO audit_logs (user_id, action, entity_type, old_values, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
                [user.id, 'LOGIN_FAILED', 'auth', JSON.stringify({ 
                    reason: 'invalid_password', 
                    attempts: newFailedAttempts 
                }), ipAddress, userAgent]
            );

            const attemptsRemaining = MAX_FAILED_ATTEMPTS - newFailedAttempts;
            
            if (lockedUntil) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Account has been locked due to too many failed attempts. Try again in 15 minutes.' 
                });
            } else {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid email or password',
                    attemptsRemaining 
                });
            }
        }

        if (user.two_factor_enabled) {
            if (!twoFactorCode) {
                return res.json({ 
                    success: true, 
                    requiresTwoFactor: true, 
                    userId: user.id 
                });
            }

            try {
                const decryptedSecret = decrypt(user.two_factor_secret);
                const verified = speakeasy.totp.verify({ 
                    secret: decryptedSecret, 
                    encoding: 'base32', 
                    token: twoFactorCode, 
                    window: 1 
                });

                if (!verified) {
                    await pool.query(
                        'INSERT INTO audit_logs (user_id, action, entity_type, old_values, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
                        [user.id, '2FA_FAILED', 'auth', JSON.stringify({ reason: 'invalid_2fa_code' }), ipAddress, userAgent]
                    );
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Invalid 2FA code' 
                    });
                }
            } catch (error) {
                console.error('2FA verification error:', error);
                return res.status(500).json({ 
                    success: false, 
                    message: '2FA verification failed' 
                });
            }
        }

        await pool.query(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email, 
                role: user.role 
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: process.env.JWT_EXPIRY || '8h' }
        );

        await pool.query(
            'INSERT INTO audit_logs (user_id, action, entity_type, new_values, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
            [user.id, 'LOGIN_SUCCESS', 'auth', JSON.stringify({ 
                method: user.two_factor_enabled ? '2FA' : 'password' 
            }), ipAddress, userAgent]
        );

        const userData = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            twoFactorEnabled: user.two_factor_enabled
        };

        return res.json({ 
            success: true, 
            message: 'Login successful', 
            token, 
            user: userData 
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal server error. Please try again.' 
        });
    }
};

// Role-based access control middleware
const rbacMiddleware = (requiredResource, requiredAction) => {
    return (req, res, next) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Authentication required' 
                });
            }

            const { role } = user;
            
            const rolePermissions = {
                admin: {
                    dashboard: ['view'],
                    users: ['create', 'read', 'update', 'delete'],
                    products: ['create', 'read', 'update', 'delete'],
                    inventory: ['create', 'read', 'update', 'delete', 'adjust'],
                    sales: ['create', 'read', 'update', 'delete', 'refund'],
                    analytics: ['view', 'export'],
                    audit: ['view', 'export'],
                    settings: ['view', 'update']
                },
                inventory_manager: {
                    dashboard: ['view'],
                    products: ['create', 'read', 'update'],
                    inventory: ['create', 'read', 'update', 'adjust'],
                    sales: ['read'],
                    analytics: ['view'],
                    reorder_alerts: ['view', 'acknowledge']
                },
                sales_staff: {
                    dashboard: ['view'],
                    products: ['read'],
                    inventory: ['read'],
                    sales: ['create', 'read'],
                    customers: ['create', 'read', 'update'],
                    invoices: ['create', 'read', 'print']
                }
            };

            if (!rolePermissions[role]) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Invalid role' 
                });
            }

            if (!rolePermissions[role][requiredResource]) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Access denied: ${role} cannot access ${requiredResource}` 
                });
            }

            const allowedActions = rolePermissions[role][requiredResource];
            if (!allowedActions.includes(requiredAction) && !allowedActions.includes('*')) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Access denied: ${role} cannot ${requiredAction} on ${requiredResource}` 
                });
            }

            next();
        } catch (error) {
            console.error('RBAC error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Internal server error' 
            });
        }
    };
};

module.exports = { 
    authMiddleware, 
    loginHandler,
    rbacMiddleware 
};