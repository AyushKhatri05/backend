// backend/src/routes/inventoryRoutes.js
// COMPLETE integration: all buttons wired to real backend logic

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { authMiddleware } = require('../middleware/authMiddleware');
const { rbacMiddleware } = require('../middleware/rbacMiddleware');
const { validateRequest } = require('../middleware/validationMiddleware');
const { pool } = require('../utils/database');

// ─────────────────────────────────────────────
// All routes require authentication
// ─────────────────────────────────────────────
router.use(authMiddleware);

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────

// GET /api/inventory/products  →  Product List page: initial load + pagination + search
router.get('/products',
    rbacMiddleware('products', 'read'),
    async (req, res) => {
        try {
            const page  = parseInt(req.query.page)  || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';

            let query = 'SELECT * FROM products WHERE is_active = true';
            let countQuery = 'SELECT COUNT(*) FROM products WHERE is_active = true';
            const params = [];

            if (search) {
                query      += ' AND (name ILIKE $1 OR sku ILIKE $1 OR category ILIKE $1)';
                countQuery += ' AND (name ILIKE $1 OR sku ILIKE $1 OR category ILIKE $1)';
                params.push(`%${search}%`);
            }

            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

            const [result, countResult] = await Promise.all([
                pool.query(query, [...params, limit, offset]),
                pool.query(countQuery, params),
            ]);

            const total = parseInt(countResult.rows[0].count);

            res.json({
                success: true,
                data: result.rows,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err) {
            console.error('getProducts error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch products' });
        }
    }
);

// GET /api/inventory/products/search  →  New Sale page: product search typeahead
router.get('/products/search',
    rbacMiddleware('products', 'read'),
    async (req, res) => {
        try {
            const { q = '' } = req.query;
            if (!q) return res.json({ success: true, data: [] });

            const result = await pool.query(
                `SELECT id, sku, name, unit_price, current_stock, category
                 FROM products
                 WHERE is_active = true
                   AND (name ILIKE $1 OR sku ILIKE $1)
                 ORDER BY name
                 LIMIT 20`,
                [`%${q}%`]
            );

            res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('searchProducts error:', err);
            res.status(500).json({ success: false, message: 'Failed to search products' });
        }
    }
);

// GET /api/inventory/products/:id  →  Edit Product modal: pre-fill form
router.get('/products/:id',
    rbacMiddleware('products', 'read'),
    async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT * FROM products WHERE id = $1 AND is_active = true',
                [req.params.id]
            );
            if (result.rows.length === 0)
                return res.status(404).json({ success: false, message: 'Product not found' });

            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            console.error('getProductById error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch product' });
        }
    }
);

// POST /api/inventory/products  →  "Add Product" button submit
router.post('/products',
    rbacMiddleware('products', 'create'),
    validateRequest([
        body('name').trim().notEmpty().withMessage('Product name is required'),
        body('sku').trim().notEmpty().withMessage('SKU is required'),
        body('unit_price').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
        body('cost_price').optional().isFloat({ min: 0 }),
        body('current_stock').optional().isInt({ min: 0 }),
        body('minimum_stock').optional().isInt({ min: 0 }),
    ]),
    async (req, res) => {
        try {
            const {
                name, sku, description, category,
                unit_price, cost_price,
                current_stock = 0, minimum_stock = 10, location
            } = req.body;

            // Duplicate SKU check
            const dup = await pool.query('SELECT id FROM products WHERE sku = $1', [sku]);
            if (dup.rows.length > 0)
                return res.status(400).json({ success: false, message: 'A product with this SKU already exists' });

            const result = await pool.query(
                `INSERT INTO products
                    (name, sku, description, category, unit_price, cost_price,
                     current_stock, minimum_stock, location, created_by, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
                 RETURNING *`,
                [name, sku, description, category, unit_price, cost_price || null,
                 current_stock, minimum_stock, location, req.user.id]
            );

            const product = result.rows[0];

            // Audit log
            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES ($1,'CREATE_PRODUCT','product',$2,$3,$4)`,
                [req.user.id, product.id, JSON.stringify(product), req.ip]
            );

            // Create initial stock transaction if stock > 0
            if (parseInt(current_stock) > 0) {
                await pool.query(
                    `INSERT INTO inventory_transactions
                        (product_id, transaction_type, quantity, previous_stock, new_stock,
                         reference_type, notes, created_by, created_at)
                     VALUES ($1,'inward',$2,0,$3,'initial_stock','Initial stock on product creation',$4,NOW())`,
                    [product.id, current_stock, current_stock, req.user.id]
                );
            }

            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                data: product,
            });
        } catch (err) {
            console.error('createProduct error:', err);
            res.status(500).json({ success: false, message: 'Failed to create product' });
        }
    }
);

// PUT /api/inventory/products/:id  →  "Save Changes" in Edit Product modal
router.put('/products/:id',
    rbacMiddleware('products', 'update'),
    validateRequest([
        body('name').optional().trim().notEmpty(),
        body('unit_price').optional().isFloat({ min: 0 }),
        body('cost_price').optional().isFloat({ min: 0 }),
        body('minimum_stock').optional().isInt({ min: 0 }),
    ]),
    async (req, res) => {
        try {
            const { id } = req.params;

            const old = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
            if (old.rows.length === 0)
                return res.status(404).json({ success: false, message: 'Product not found' });

            const allowed = ['name','sku','description','category','unit_price','cost_price',
                             'minimum_stock','maximum_stock','location'];
            const updates = {};
            allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

            if (Object.keys(updates).length === 0)
                return res.status(400).json({ success: false, message: 'No valid fields to update' });

            const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
            const values     = [...Object.values(updates), id];

            const result = await pool.query(
                `UPDATE products SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
                values
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
                 VALUES ($1,'UPDATE_PRODUCT','product',$2,$3,$4,$5)`,
                [req.user.id, id, JSON.stringify(old.rows[0]), JSON.stringify(result.rows[0]), req.ip]
            );

            res.json({ success: true, message: 'Product updated successfully', data: result.rows[0] });
        } catch (err) {
            console.error('updateProduct error:', err);
            res.status(500).json({ success: false, message: 'Failed to update product' });
        }
    }
);

// DELETE /api/inventory/products/:id  →  "Delete" button (soft delete)
router.delete('/products/:id',
    rbacMiddleware('products', 'delete'),
    async (req, res) => {
        try {
            const { id } = req.params;

            const existing = await pool.query('SELECT * FROM products WHERE id = $1 AND is_active = true', [id]);
            if (existing.rows.length === 0)
                return res.status(404).json({ success: false, message: 'Product not found' });

            await pool.query(
                'UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1',
                [id]
            );

            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, ip_address)
                 VALUES ($1,'DELETE_PRODUCT','product',$2,$3,$4)`,
                [req.user.id, id, JSON.stringify(existing.rows[0]), req.ip]
            );

            res.json({ success: true, message: 'Product deleted successfully' });
        } catch (err) {
            console.error('deleteProduct error:', err);
            res.status(500).json({ success: false, message: 'Failed to delete product' });
        }
    }
);

// ─────────────────────────────────────────────
// STOCK MANAGEMENT
// ─────────────────────────────────────────────

// GET /api/inventory/stock/low  →  Dashboard low-stock alert widget + Inventory index page
router.get('/stock/low',
    rbacMiddleware('inventory', 'read'),
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, sku, name, category, current_stock, minimum_stock,
                        (minimum_stock - current_stock) AS deficit
                 FROM products
                 WHERE current_stock <= minimum_stock AND is_active = true
                 ORDER BY deficit DESC`
            );
            res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('getLowStock error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch low stock products' });
        }
    }
);

// GET /api/inventory/transactions  →  Transactions tab on Inventory page
router.get('/transactions',
    rbacMiddleware('inventory', 'read'),
    async (req, res) => {
        try {
            const page  = parseInt(req.query.page)  || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;
            const productId = req.query.product_id;
            const type      = req.query.type;

            let where  = 'WHERE 1=1';
            const params = [];

            if (productId) { params.push(productId); where += ` AND it.product_id = $${params.length}`; }
            if (type)      { params.push(type);       where += ` AND it.transaction_type = $${params.length}`; }

            const result = await pool.query(
                `SELECT it.*, p.name AS product_name, p.sku,
                        u.username AS created_by_name
                 FROM inventory_transactions it
                 LEFT JOIN products p ON it.product_id = p.id
                 LEFT JOIN users   u ON it.created_by  = u.id
                 ${where}
                 ORDER BY it.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            );

            const countResult = await pool.query(
                `SELECT COUNT(*) FROM inventory_transactions it ${where}`,
                params
            );

            const total = parseInt(countResult.rows[0].count);
            res.json({
                success: true,
                data: result.rows,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err) {
            console.error('getTransactions error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
        }
    }
);

// POST /api/inventory/transactions/inward  →  "Add Stock" / Stock Inward button
router.post('/transactions/inward',
    rbacMiddleware('inventory', 'create'),
    validateRequest([
        body('productId').notEmpty().withMessage('Product ID is required'),
        body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
        body('notes').optional().isLength({ max: 500 }),
    ]),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { productId, quantity, notes, referenceType = 'manual_inward', referenceId = null } = req.body;

            // Lock row for update
            const product = await client.query(
                'SELECT id, name, current_stock, minimum_stock FROM products WHERE id = $1 AND is_active = true FOR UPDATE',
                [productId]
            );
            if (product.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            const previousStock = product.rows[0].current_stock;
            const newStock      = previousStock + parseInt(quantity);

            await client.query(
                'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
                [newStock, productId]
            );

            const txResult = await client.query(
                `INSERT INTO inventory_transactions
                    (product_id, transaction_type, quantity, previous_stock, new_stock,
                     reference_type, reference_id, notes, created_by, created_at)
                 VALUES ($1,'inward',$2,$3,$4,$5,$6,$7,$8,NOW())
                 RETURNING *`,
                [productId, quantity, previousStock, newStock, referenceType, referenceId, notes, req.user.id]
            );

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: `Stock increased by ${quantity}. New stock: ${newStock}`,
                data: txResult.rows[0],
            });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('inward error:', err);
            res.status(500).json({ success: false, message: 'Failed to process stock inward' });
        } finally {
            client.release();
        }
    }
);

// POST /api/inventory/transactions/outward  →  "Remove Stock" / Stock Outward button
router.post('/transactions/outward',
    rbacMiddleware('inventory', 'create'),
    validateRequest([
        body('productId').notEmpty().withMessage('Product ID is required'),
        body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
        body('notes').optional().isLength({ max: 500 }),
    ]),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { productId, quantity, notes, referenceType = 'manual_outward', referenceId = null } = req.body;

            const product = await client.query(
                'SELECT id, name, current_stock, minimum_stock FROM products WHERE id = $1 AND is_active = true FOR UPDATE',
                [productId]
            );
            if (product.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            const previousStock = product.rows[0].current_stock;
            const qty = parseInt(quantity);

            if (qty > previousStock) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock. Available: ${previousStock}, Requested: ${qty}`,
                });
            }

            const newStock = previousStock - qty;

            await client.query(
                'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
                [newStock, productId]
            );

            const txResult = await client.query(
                `INSERT INTO inventory_transactions
                    (product_id, transaction_type, quantity, previous_stock, new_stock,
                     reference_type, reference_id, notes, created_by, created_at)
                 VALUES ($1,'outward',$2,$3,$4,$5,$6,$7,$8,NOW())
                 RETURNING *`,
                [productId, qty, previousStock, newStock, referenceType, referenceId, notes, req.user.id]
            );

            // Refresh reorder alert if stock falls at/below minimum
            if (newStock <= product.rows[0].minimum_stock) {
                const suggestedQty = product.rows[0].minimum_stock * 2;
                await client.query(
                    `INSERT INTO reorder_alerts
                        (product_id, current_stock, minimum_stock, suggested_order_quantity, status, created_at)
                     VALUES ($1,$2,$3,$4,'pending',NOW())
                     ON CONFLICT (product_id)
                     DO UPDATE SET current_stock = $2, status = 'pending', created_at = NOW()`,
                    [productId, newStock, product.rows[0].minimum_stock, suggestedQty]
                );
            }

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: `Stock reduced by ${qty}. New stock: ${newStock}`,
                data: txResult.rows[0],
            });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('outward error:', err);
            res.status(500).json({ success: false, message: 'Failed to process stock outward' });
        } finally {
            client.release();
        }
    }
);

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────

// GET /api/inventory/categories  →  Category filter dropdown in Products page
router.get('/categories',
    rbacMiddleware('products', 'read'),
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT DISTINCT category FROM products
                 WHERE category IS NOT NULL AND is_active = true
                 ORDER BY category`
            );
            res.json({ success: true, data: result.rows.map(r => r.category) });
        } catch (err) {
            console.error('getCategories error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch categories' });
        }
    }
);

// GET /api/inventory/stock/value  →  Stock value report on Inventory page
router.get('/stock/value',
    rbacMiddleware('inventory', 'read'),
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    COUNT(*) AS total_products,
                    SUM(current_stock * unit_price) AS total_retail_value,
                    SUM(current_stock * COALESCE(cost_price, 0)) AS total_cost_value,
                    SUM(CASE WHEN current_stock <= minimum_stock THEN 1 ELSE 0 END) AS low_stock_count,
                    SUM(current_stock) AS total_units
                 FROM products
                 WHERE is_active = true`
            );
            res.json({ success: true, data: result.rows[0] });
        } catch (err) {
            console.error('getStockValue error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch stock value' });
        }
    }
);

module.exports = router;
