// backend/src/controllers/userController.js
// COMPLETE – all User Management page buttons wired

const { pool } = require('../utils/database');

const userController = {

    // ── GET /api/users  →  User list table (Admin only) ─────────────────────
    getUsers: async (req, res) => {
        try {
            const page   = parseInt(req.query.page)   || 1;
            const limit  = parseInt(req.query.limit)  || 20;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const role   = req.query.role;

            let where  = 'WHERE 1=1';
            const params = [];

            if (search) {
                params.push(`%${search}%`);
                where += ` AND (username ILIKE $${params.length} OR email ILIKE $${params.length})`;
            }
            if (role) {
                params.push(role);
                where += ` AND role = $${params.length}`;
            }

            const [result, countResult] = await Promise.all([
                pool.query(
                    `SELECT id, email, username, role,
                            two_factor_enabled, is_active,
                            last_login, created_at
                     FROM users ${where}
                     ORDER BY created_at DESC
                     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                    [...params, limit, offset]
                ),
                pool.query(`SELECT COUNT(*) FROM users ${where}`, params),
            ]);

            res.json({
                success: true,
                data: result.rows,
                pagination: {
                    page, limit,
                    total: parseInt(countResult.rows[0].count),
                    pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
                },
            });
        } catch (err) {
            console.error('getUsers error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch users' });
        }
    },

    // ── GET /api/users/:id  →  Edit User modal: pre-fill data ───────────────
    getUserById: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, email, username, role,
                        two_factor_enabled, is_active, last_login, created_at
                 FROM users WHERE id = $1`,
                [req.params.id]
            );
            if (result.rows.length === 0)
                return res.status(404).json({ success: false, message: 'User not found' });

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            console.error('getUserById error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch user' });
        }
    },

    // ── PUT /api/users/:id  →  "Save" in Edit User modal ────────────────────
    updateUser: async (req, res) => {
        try {
            const { id }                      = req.params;
            const { email, username, role }   = req.body;

            // Prevent admin from downgrading themselves
            if (req.user.id === id && role && role !== 'admin') {
                return res.status(400).json({
                    success: false,
                    message: 'You cannot change your own role',
                });
            }

            const result = await pool.query(
                `UPDATE users
                 SET email = COALESCE($1, email),
                     username = COALESCE($2, username),
                     role = COALESCE($3, role),
                     updated_at = NOW()
                 WHERE id = $4
                 RETURNING id, email, username, role, is_active`,
                [email || null, username || null, role || null, id]
            );

            if (result.rows.length === 0)
                return res.status(404).json({ success: false, message: 'User not found' });

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES ($1,'UPDATE_USER','user',$2,$3,$4)`,
                [req.user.id, id, JSON.stringify({ email, username, role }), req.ip]
            );

            res.json({ success: true, message: 'User updated successfully', data: result.rows[0] });
        } catch (err) {
            console.error('updateUser error:', err);
            res.status(500).json({ success: false, message: 'Failed to update user' });
        }
    },

    // ── DELETE /api/users/:id  →  "Delete User" button (soft delete) ─────────
    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;

            if (req.user.id === id)
                return res.status(400).json({ success: false, message: 'You cannot delete your own account' });

            await pool.query(
                'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
                [id]
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
                 VALUES ($1,'DELETE_USER','user',$2,$3)`,
                [req.user.id, id, req.ip]
            );

            res.json({ success: true, message: 'User deactivated successfully' });
        } catch (err) {
            console.error('deleteUser error:', err);
            res.status(500).json({ success: false, message: 'Failed to delete user' });
        }
    },

    // ── POST /api/users/:id/toggle-status  →  "Enable/Disable" toggle button ─
    toggleUserStatus: async (req, res) => {
        try {
            const { id } = req.params;

            if (req.user.id === id)
                return res.status(400).json({ success: false, message: 'You cannot disable your own account' });

            const result = await pool.query(
                `UPDATE users
                 SET is_active = NOT is_active, updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, username, is_active`,
                [id]
            );

            if (result.rows.length === 0)
                return res.status(404).json({ success: false, message: 'User not found' });

            const { is_active, username } = result.rows[0];

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES ($1,$2,'user',$3,$4,$5)`,
                [req.user.id,
                 is_active ? 'ENABLE_USER' : 'DISABLE_USER',
                 id,
                 JSON.stringify({ is_active }),
                 req.ip]
            );

            res.json({
                success: true,
                message: `User "${username}" has been ${is_active ? 'activated' : 'deactivated'}`,
                data: result.rows[0],
            });
        } catch (err) {
            console.error('toggleUserStatus error:', err);
            res.status(500).json({ success: false, message: 'Failed to toggle user status' });
        }
    },

    // ── GET /api/users/profile/me  →  Profile page load ─────────────────────
    getMyProfile: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, email, username, role,
                        two_factor_enabled, last_login, created_at
                 FROM users WHERE id = $1`,
                [req.user.id]
            );
            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            console.error('getMyProfile error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch profile' });
        }
    },

    // ── PUT /api/users/profile/me  →  "Update Profile" button ──────────────
    updateMyProfile: async (req, res) => {
        try {
            const { email, username } = req.body;

            // Check for duplicates
            if (email || username) {
                const dup = await pool.query(
                    `SELECT id FROM users
                     WHERE (email = $1 OR username = $2) AND id != $3`,
                    [email || '', username || '', req.user.id]
                );
                if (dup.rows.length > 0)
                    return res.status(400).json({ success: false, message: 'Email or username already in use' });
            }

            const result = await pool.query(
                `UPDATE users
                 SET email    = COALESCE($1, email),
                     username = COALESCE($2, username),
                     updated_at = NOW()
                 WHERE id = $3
                 RETURNING id, email, username, role`,
                [email || null, username || null, req.user.id]
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES ($1,'UPDATE_PROFILE','user',$1,$2,$3)`,
                [req.user.id, JSON.stringify({ email, username }), req.ip]
            );

            res.json({ success: true, message: 'Profile updated successfully', data: result.rows[0] });
        } catch (err) {
            console.error('updateMyProfile error:', err);
            res.status(500).json({ success: false, message: 'Failed to update profile' });
        }
    },

    // ── GET /api/users/audit/logs  →  Audit Log tab (Admin only) ────────────
    getAuditLogs: async (req, res) => {
        try {
            const page   = parseInt(req.query.page)   || 1;
            const limit  = parseInt(req.query.limit)  || 20;
            const offset = (page - 1) * limit;
            const action = req.query.action;

            let where  = 'WHERE 1=1';
            const params = [];

            if (action) { params.push(action); where += ` AND al.action = $${params.length}`; }

            const [result, countResult] = await Promise.all([
                pool.query(
                    `SELECT al.*, u.username
                     FROM audit_logs al
                     LEFT JOIN users u ON al.user_id = u.id
                     ${where}
                     ORDER BY al.created_at DESC
                     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                    [...params, limit, offset]
                ),
                pool.query(`SELECT COUNT(*) FROM audit_logs al ${where}`, params),
            ]);

            res.json({
                success: true,
                data: result.rows,
                pagination: {
                    page, limit,
                    total: parseInt(countResult.rows[0].count),
                    pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
                },
            });
        } catch (err) {
            console.error('getAuditLogs error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
        }
    },
};

module.exports = userController;
