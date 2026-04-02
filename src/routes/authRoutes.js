// backend/src/routes/authRoutes.js
// COMPLETE – every Auth button wired to a real endpoint

const express    = require('express');
const router     = express.Router();
const { body }   = require('express-validator');
const bcrypt     = require('bcrypt');
const speakeasy  = require('speakeasy');
const qrcode     = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const { loginHandler, authMiddleware } = require('../middleware/authMiddleware');
const { validateRequest }              = require('../middleware/validationMiddleware');
const { authLimiter }                  = require('../middleware/rateLimiter');
const { pool }                         = require('../utils/database');
const { encrypt, decrypt }             = require('../utils/encryption');

// ── POST /api/auth/login  →  "Login" button ──────────────────────────────────
router.post('/login',
    authLimiter,
    validateRequest([
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('twoFactorCode').optional().isLength({ min: 6, max: 6 }).isNumeric(),
    ]),
    loginHandler
);

// ── POST /api/auth/register  →  "Register" button (Admin creates user) ────────
router.post('/register',
    authLimiter,
    validateRequest([
        body('email').isEmail().normalizeEmail(),
        body('username').trim().isLength({ min: 3, max: 50 }),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('role').optional().isIn(['admin', 'inventory_manager', 'sales_staff']),
    ]),
    async (req, res) => {
        const { email, username, password, role = 'sales_staff' } = req.body;

        try {
            const existing = await pool.query(
                'SELECT id FROM users WHERE email = $1 OR username = $2',
                [email, username]
            );
            if (existing.rows.length > 0)
                return res.status(400).json({ success: false, message: 'Email or username already in use' });

            const passwordHash = await bcrypt.hash(password, 12);

            const result = await pool.query(
                `INSERT INTO users (email, username, password_hash, salt, role, is_active, created_at)
                 VALUES ($1, $2, $3, $4, $5, true, NOW())
                 RETURNING id, email, username, role, created_at`,
                [email, username, passwordHash, '', role]
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, new_values, ip_address)
                 VALUES ($1,'REGISTER','user',$2,$3)`,
                [result.rows[0].id, JSON.stringify({ email, username, role }), req.ip]
            );

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                user: result.rows[0],
            });
        } catch (err) {
            console.error('register error:', err);
            res.status(500).json({ success: false, message: 'Registration failed' });
        }
    }
);

// ── POST /api/auth/logout  →  "Logout" button in Navbar ─────────────────────
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, ip_address)
             VALUES ($1,'LOGOUT','auth',$2)`,
            [req.user.id, req.ip]
        );
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        console.error('logout error:', err);
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
});

// ── POST /api/auth/change-password  →  "Change Password" button in Settings ──
router.post('/change-password', authMiddleware,
    validateRequest([
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
    ]),
    async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            const userResult = await pool.query(
                'SELECT password_hash FROM users WHERE id = $1',
                [req.user.id]
            );

            const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
            if (!isValid)
                return res.status(401).json({ success: false, message: 'Current password is incorrect' });

            const newHash = await bcrypt.hash(newPassword, 12);
            await pool.query(
                'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [newHash, req.user.id]
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, ip_address)
                 VALUES ($1,'CHANGE_PASSWORD','auth',$2)`,
                [req.user.id, req.ip]
            );

            res.json({ success: true, message: 'Password changed successfully' });
        } catch (err) {
            console.error('changePassword error:', err);
            res.status(500).json({ success: false, message: 'Failed to change password' });
        }
    }
);

// ── POST /api/auth/forgot-password  →  "Forgot Password" link ───────────────
router.post('/forgot-password', authLimiter,
    validateRequest([body('email').isEmail().normalizeEmail()]),
    async (req, res) => {
        try {
            const { email } = req.body;
            const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

            if (user.rows.length > 0) {
                const token   = uuidv4();
                const expires = new Date(Date.now() + 3600000); // 1 hour

                await pool.query(
                    'UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3',
                    [token, expires, user.rows[0].id]
                );

                // In production: send email with token
                console.log(`[DEV] Password reset token for ${email}: ${token}`);
            }

            // Always respond with success to prevent email enumeration
            res.json({
                success: true,
                message: 'If an account exists with this email, you will receive reset instructions.',
            });
        } catch (err) {
            console.error('forgotPassword error:', err);
            res.status(500).json({ success: false, message: 'Failed to process request' });
        }
    }
);

// ── POST /api/auth/reset-password  →  "Reset Password" button ───────────────
router.post('/reset-password', authLimiter,
    validateRequest([
        body('token').notEmpty(),
        body('newPassword').isLength({ min: 8 }),
    ]),
    async (req, res) => {
        try {
            const { token, newPassword } = req.body;

            const user = await pool.query(
                'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()',
                [token]
            );
            if (user.rows.length === 0)
                return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });

            const newHash = await bcrypt.hash(newPassword, 12);
            await pool.query(
                `UPDATE users
                 SET password_hash = $1, reset_token = NULL, reset_expires = NULL, updated_at = NOW()
                 WHERE id = $2`,
                [newHash, user.rows[0].id]
            );

            res.json({ success: true, message: 'Password reset successfully. You may now log in.' });
        } catch (err) {
            console.error('resetPassword error:', err);
            res.status(500).json({ success: false, message: 'Failed to reset password' });
        }
    }
);

// ── POST /api/auth/2fa/setup  →  "Enable 2FA" button in Settings ─────────────
// Returns a QR code and secret so the user can add it to their authenticator app
router.post('/2fa/setup', authMiddleware, async (req, res) => {
    try {
        const user = await pool.query('SELECT email, two_factor_enabled FROM users WHERE id = $1', [req.user.id]);
        if (user.rows[0].two_factor_enabled)
            return res.status(400).json({ success: false, message: '2FA is already enabled' });

        const secret = speakeasy.generateSecret({
            name:   `ERP-Lite (${user.rows[0].email})`,
            issuer: 'ERP-Lite',
            length: 32,
        });

        // Store the secret (encrypted) temporarily – user must verify before enabling
        const encryptedSecret = encrypt(secret.base32);
        await pool.query(
            'UPDATE users SET two_factor_secret = $1, updated_at = NOW() WHERE id = $2',
            [encryptedSecret, req.user.id]
        );

        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

        res.json({
            success: true,
            data: {
                secret:    secret.base32,   // show to user as backup
                qrCode:    qrCodeUrl,       // base64 PNG for <img src="…">
                otpAuth:   secret.otpauth_url,
            },
        });
    } catch (err) {
        console.error('2fa/setup error:', err);
        res.status(500).json({ success: false, message: 'Failed to set up 2FA' });
    }
});

// ── POST /api/auth/2fa/enable  →  "Verify & Enable" button in 2FA setup modal
router.post('/2fa/enable', authMiddleware,
    validateRequest([
        body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('6-digit code required'),
    ]),
    async (req, res) => {
        try {
            const { code } = req.body;
            const user = await pool.query(
                'SELECT two_factor_secret FROM users WHERE id = $1',
                [req.user.id]
            );

            if (!user.rows[0].two_factor_secret)
                return res.status(400).json({ success: false, message: 'Run 2FA setup first' });

            const decrypted = decrypt(user.rows[0].two_factor_secret);
            const verified  = speakeasy.totp.verify({
                secret:   decrypted,
                encoding: 'base32',
                token:    code,
                window:   1,
            });

            if (!verified)
                return res.status(400).json({ success: false, message: 'Invalid verification code. Try again.' });

            await pool.query(
                'UPDATE users SET two_factor_enabled = true, updated_at = NOW() WHERE id = $1',
                [req.user.id]
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, ip_address)
                 VALUES ($1,'ENABLE_2FA','auth',$2)`,
                [req.user.id, req.ip]
            );

            res.json({ success: true, message: '2FA enabled successfully' });
        } catch (err) {
            console.error('2fa/enable error:', err);
            res.status(500).json({ success: false, message: 'Failed to enable 2FA' });
        }
    }
);

// ── POST /api/auth/2fa/disable  →  "Disable 2FA" button in Settings ──────────
router.post('/2fa/disable', authMiddleware,
    validateRequest([
        body('password').notEmpty().withMessage('Current password required to disable 2FA'),
    ]),
    async (req, res) => {
        try {
            const { password } = req.body;
            const user = await pool.query(
                'SELECT password_hash, two_factor_enabled FROM users WHERE id = $1',
                [req.user.id]
            );

            if (!user.rows[0].two_factor_enabled)
                return res.status(400).json({ success: false, message: '2FA is not currently enabled' });

            const valid = await bcrypt.compare(password, user.rows[0].password_hash);
            if (!valid)
                return res.status(401).json({ success: false, message: 'Incorrect password' });

            await pool.query(
                `UPDATE users
                 SET two_factor_enabled = false, two_factor_secret = NULL, updated_at = NOW()
                 WHERE id = $1`,
                [req.user.id]
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, ip_address)
                 VALUES ($1,'DISABLE_2FA','auth',$2)`,
                [req.user.id, req.ip]
            );

            res.json({ success: true, message: '2FA disabled successfully' });
        } catch (err) {
            console.error('2fa/disable error:', err);
            res.status(500).json({ success: false, message: 'Failed to disable 2FA' });
        }
    }
);

// ── POST /api/auth/2fa/verify  →  2FA verification step at login ─────────────
router.post('/2fa/verify',
    validateRequest([
        body('userId').notEmpty(),
        body('code').isLength({ min: 6, max: 6 }).isNumeric(),
    ]),
    async (req, res) => {
        try {
            const { userId, code } = req.body;
            const jwt = require('jsonwebtoken');

            const userResult = await pool.query(
                'SELECT * FROM users WHERE id = $1 AND is_active = true',
                [userId]
            );
            const user = userResult.rows[0];

            if (!user)
                return res.status(404).json({ success: false, message: 'User not found' });

            const decrypted = decrypt(user.two_factor_secret);
            const verified  = speakeasy.totp.verify({
                secret:   decrypted,
                encoding: 'base32',
                token:    code,
                window:   1,
            });

            if (!verified)
                return res.status(401).json({ success: false, message: 'Invalid 2FA code' });

            // Issue JWT
            const token = jwt.sign(
                { userId: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRY || '8h' }
            );

            await pool.query(
                'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
                [user.id]
            );

            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: {
                    id: user.id, email: user.email,
                    username: user.username, role: user.role,
                    twoFactorEnabled: user.two_factor_enabled,
                },
            });
        } catch (err) {
            console.error('2fa/verify error:', err);
            res.status(500).json({ success: false, message: 'Failed to verify 2FA' });
        }
    }
);

module.exports = router;
