// backend/src/routes/salesRoutes.js
// COMPLETE integration – every Sales UI button wired to real backend logic

const express = require('express');
const router  = express.Router();
const { body } = require('express-validator');
const { authMiddleware }    = require('../middleware/authMiddleware');
const { rbacMiddleware }    = require('../middleware/rbacMiddleware');
const { validateRequest }   = require('../middleware/validationMiddleware');
const salesController       = require('../controllers/salesController');

router.use(authMiddleware);

// ── List + Pagination  (Sales Dashboard page load) ──────────────────────────
router.get('/',
    rbacMiddleware('sales', 'read'),
    salesController.getSales
);

// ── Search sales  ("Search" bar in Sales Dashboard) ─────────────────────────
// NOTE: must be before /:id to avoid route collision
router.get('/search',
    rbacMiddleware('sales', 'read'),
    salesController.searchSales
);

// ── Daily report  (Sales Dashboard stat cards) ──────────────────────────────
router.get('/reports/daily',
    rbacMiddleware('analytics', 'view'),
    salesController.getDailySalesReport
);

// ── Top products report  (Analytics page) ───────────────────────────────────
router.get('/reports/top-products',
    rbacMiddleware('analytics', 'view'),
    salesController.getTopProducts
);

// ── Single sale detail  (invoice.jsx + sale detail modal) ───────────────────
router.get('/:id',
    rbacMiddleware('sales', 'read'),
    salesController.getSaleById
);

// ── Create sale  ("Checkout" button in /sales/new) ──────────────────────────
router.post('/',
    rbacMiddleware('sales', 'create'),
    validateRequest([
        body('customerName').optional().trim().isLength({ max: 255 }),
        body('customerEmail').optional().isEmail().normalizeEmail(),
        body('customerPhone').optional().trim().isLength({ max: 50 }),
        body('paymentMethod').isIn(['cash', 'card', 'bank_transfer']).withMessage('Invalid payment method'),
        body('items').isArray({ min: 1 }).withMessage('Cart must have at least one item'),
        body('items.*.productId').notEmpty().withMessage('Product ID required for each item'),
        body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be ≥ 1'),
        body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be positive'),
        body('subtotal').isFloat({ min: 0 }),
        body('tax').isFloat({ min: 0 }),
        body('totalAmount').isFloat({ min: 0 }),
    ]),
    salesController.createSale
);

// ── Generate invoice  ("View Invoice" / "Generate Invoice" button) ───────────
router.get('/:id/invoice',
    rbacMiddleware('invoices', 'read'),
    salesController.generateInvoice
);

// ── Refund sale  ("Refund" button in Sales table) ───────────────────────────
router.post('/:id/refund',
    rbacMiddleware('sales', 'refund'),
    validateRequest([
        body('reason').optional().trim().isLength({ max: 500 }),
    ]),
    salesController.refundSale
);

module.exports = router;
