// backend/src/routes/userRoutes.js
// COMPLETE – all User Management & Profile buttons wired

const express = require('express');
const router  = express.Router();
const { body } = require('express-validator');
const { authMiddleware }  = require('../middleware/authMiddleware');
const { rbacGuard }       = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const userController      = require('../controllers/userController');

// ── Profile routes (no RBAC guard – any authenticated user) ─────────────────
router.get('/profile/me', authMiddleware, userController.getMyProfile);
router.put('/profile/me', authMiddleware,
    validateRequest([
        body('email').optional().isEmail().normalizeEmail(),
        body('username').optional().trim().isLength({ min: 3, max: 50 }),
    ]),
    userController.updateMyProfile
);

// ── Audit logs  (Admin only) ─────────────────────────────────────────────────
router.get('/audit/logs', authMiddleware, rbacGuard('audit', 'view'), userController.getAuditLogs);

// ── User CRUD  (Admin only) ──────────────────────────────────────────────────
router.get('/', authMiddleware, rbacGuard('users', 'read'), userController.getUsers);
router.get('/:id', authMiddleware, rbacGuard('users', 'read'), userController.getUserById);
router.put('/:id', authMiddleware, rbacGuard('users', 'update'),
    validateRequest([
        body('email').optional().isEmail().normalizeEmail(),
        body('username').optional().trim().isLength({ min: 3, max: 50 }),
        body('role').optional().isIn(['admin', 'inventory_manager', 'sales_staff']).withMessage('Invalid role'),
    ]),
    userController.updateUser
);
router.delete('/:id', authMiddleware, rbacGuard('users', 'delete'), userController.deleteUser);

// ── Toggle active status  ("Enable/Disable User" button) ─────────────────────
router.post('/:id/toggle-status', authMiddleware, rbacGuard('users', 'update'), userController.toggleUserStatus);

module.exports = router;
