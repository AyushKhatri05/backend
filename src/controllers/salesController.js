// backend/src/controllers/salesController.js
// COMPLETE – every Sales button has a matching, transaction-safe implementation

const { pool } = require('../utils/database');

const salesController = {

    // ── GET /api/sales  →  Sales Dashboard page: table list ─────────────────
    getSales: async (req, res) => {
        try {
            const page   = parseInt(req.query.page)   || 1;
            const limit  = parseInt(req.query.limit)  || 20;
            const offset = (page - 1) * limit;
            const status = req.query.status; // optional filter

            let where  = 'WHERE 1=1';
            const params = [];

            if (status) { params.push(status); where += ` AND s.payment_status = $${params.length}`; }

            const [result, countResult] = await Promise.all([
                pool.query(
                    `SELECT
                        s.id, s.invoice_number, s.customer_name, s.customer_email,
                        s.customer_phone, s.subtotal, s.tax, s.discount,
                        s.total_amount, s.payment_method, s.payment_status,
                        s.created_at, u.username AS created_by_name
                     FROM sales s
                     LEFT JOIN users u ON s.created_by = u.id
                     ${where}
                     ORDER BY s.created_at DESC
                     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                    [...params, limit, offset]
                ),
                pool.query(`SELECT COUNT(*) FROM sales s ${where}`, params),
            ]);

            const total = parseInt(countResult.rows[0].count);
            res.json({
                success: true,
                data: result.rows,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err) {
            console.error('getSales error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch sales' });
        }
    },

    // ── GET /api/sales/:id  →  Sale detail / invoice modal ──────────────────
    getSaleById: async (req, res) => {
        try {
            const { id } = req.params;

            const [saleResult, itemsResult] = await Promise.all([
                pool.query(
                    `SELECT s.*, u.username AS created_by_name
                     FROM sales s
                     LEFT JOIN users u ON s.created_by = u.id
                     WHERE s.id = $1`,
                    [id]
                ),
                pool.query(
                    `SELECT si.*, p.name AS product_name, p.sku AS product_sku
                     FROM sale_items si
                     LEFT JOIN products p ON si.product_id = p.id
                     WHERE si.sale_id = $1`,
                    [id]
                ),
            ]);

            if (saleResult.rows.length === 0)
                return res.status(404).json({ success: false, message: 'Sale not found' });

            const sale  = saleResult.rows[0];
            sale.items  = itemsResult.rows;

            res.json({ success: true, data: sale });
        } catch (err) {
            console.error('getSaleById error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch sale' });
        }
    },

    // ── GET /api/sales/search  →  Search bar in Sales Dashboard ─────────────
    searchSales: async (req, res) => {
        try {
            const { q } = req.query;
            if (!q) return res.json({ success: true, data: [] });

            const result = await pool.query(
                `SELECT s.id, s.invoice_number, s.customer_name, s.customer_email,
                        s.total_amount, s.payment_status, s.created_at
                 FROM sales s
                 WHERE s.invoice_number ILIKE $1
                    OR s.customer_name  ILIKE $1
                    OR s.customer_email ILIKE $1
                 ORDER BY s.created_at DESC
                 LIMIT 20`,
                [`%${q}%`]
            );

            res.json({ success: true, data: result.rows });
        } catch (err) {
            console.error('searchSales error:', err);
            res.status(500).json({ success: false, message: 'Failed to search sales' });
        }
    },

    // ── POST /api/sales  →  "Checkout" button in /sales/new ─────────────────
    // Uses a DB transaction: sale + sale_items + stock deduction are atomic.
    createSale: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                customerName, customerEmail, customerPhone,
                paymentMethod, subtotal, tax = 0, discount = 0,
                totalAmount, items,
            } = req.body;
            const userId = req.user.id;

            // ── 1. Validate stock availability for every item ─────────────
            for (const item of items) {
                const productResult = await client.query(
                    'SELECT id, name, current_stock FROM products WHERE id = $1 AND is_active = true FOR UPDATE',
                    [item.productId]
                );
                if (productResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ success: false, message: `Product ID ${item.productId} not found` });
                }
                const product = productResult.rows[0];
                if (product.current_stock < item.quantity) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for "${product.name}". Available: ${product.current_stock}, Requested: ${item.quantity}`,
                    });
                }
            }

            // ── 2. Generate unique invoice number ─────────────────────────
            const year    = new Date().getFullYear();
            const month   = String(new Date().getMonth() + 1).padStart(2, '0');
            const seq     = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
            const invoiceNumber = `INV-${year}${month}-${seq}`;

            // ── 3. Insert sale record ─────────────────────────────────────
            const saleResult = await client.query(
                `INSERT INTO sales
                    (invoice_number, customer_name, customer_email, customer_phone,
                     subtotal, tax, discount, total_amount, payment_method,
                     payment_status, created_by, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'completed',$10,NOW(),NOW())
                 RETURNING *`,
                [invoiceNumber, customerName || null, customerEmail || null,
                 customerPhone || null, subtotal, tax, discount, totalAmount,
                 paymentMethod, userId]
            );
            const sale = saleResult.rows[0];

            // ── 4. Insert sale items + deduct stock ───────────────────────
            for (const item of items) {
                // Insert line item
                await client.query(
                    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [sale.id, item.productId, item.quantity, item.unitPrice, item.totalPrice]
                );

                // Deduct stock
                const updated = await client.query(
                    `UPDATE products
                     SET current_stock = current_stock - $1, updated_at = NOW()
                     WHERE id = $2
                     RETURNING current_stock, minimum_stock`,
                    [item.quantity, item.productId]
                );

                const { current_stock: newStock, minimum_stock: minStock } = updated.rows[0];

                // Record inventory transaction
                await client.query(
                    `INSERT INTO inventory_transactions
                        (product_id, transaction_type, quantity, previous_stock, new_stock,
                         reference_type, reference_id, notes, created_by, created_at)
                     VALUES ($1,'outward',$2,$3,$4,'sale',$5,$6,$7,NOW())`,
                    [item.productId, item.quantity,
                     newStock + item.quantity, newStock,
                     sale.id, `Sale: ${invoiceNumber}`, userId]
                );

                // Raise reorder alert if stock hits minimum
                if (newStock <= minStock) {
                    await client.query(
                        `INSERT INTO reorder_alerts
                            (product_id, current_stock, minimum_stock,
                             suggested_order_quantity, status, created_at)
                         VALUES ($1,$2,$3,$4,'pending',NOW())
                         ON CONFLICT (product_id)
                         DO UPDATE SET current_stock = $2, status = 'pending', created_at = NOW()`,
                        [item.productId, newStock, minStock, minStock * 2]
                    );
                }
            }

            // ── 5. Audit log ──────────────────────────────────────────────
            await client.query(
                `INSERT INTO audit_logs
                    (user_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES ($1,'CREATE_SALE','sale',$2,$3,$4)`,
                [userId, sale.id, JSON.stringify({ invoiceNumber, totalAmount, itemCount: items.length }), req.ip]
            );

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: 'Sale completed successfully',
                data: sale,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('createSale error:', err);
            res.status(500).json({ success: false, message: err.message || 'Failed to create sale' });
        } finally {
            client.release();
        }
    },

    // ── GET /api/sales/:id/invoice  →  "View Invoice" / "Print" button ──────
    generateInvoice: async (req, res) => {
        try {
            const { id } = req.params;

            const result = await pool.query(
                `SELECT
                    s.*,
                    u.username AS created_by_name,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id',            si.id,
                                'product_name',  p.name,
                                'product_sku',   p.sku,
                                'quantity',      si.quantity,
                                'unit_price',    si.unit_price,
                                'total_price',   si.total_price
                            )
                        ) FILTER (WHERE si.id IS NOT NULL),
                        '[]'::json
                    ) AS items
                 FROM sales s
                 LEFT JOIN users      u  ON s.created_by    = u.id
                 LEFT JOIN sale_items si ON si.sale_id       = s.id
                 LEFT JOIN products   p  ON si.product_id    = p.id
                 WHERE s.id = $1
                 GROUP BY s.id, u.username`,
                [id]
            );

            if (result.rows.length === 0)
                return res.status(404).json({ success: false, message: 'Sale not found' });

            const sale    = result.rows[0];
            const invoice = {
                invoiceNumber: sale.invoice_number,
                date:          sale.created_at,
                customer: {
                    name:  sale.customer_name  || 'Walk-in Customer',
                    email: sale.customer_email || null,
                    phone: sale.customer_phone || null,
                },
                items:         sale.items,
                subtotal:      parseFloat(sale.subtotal),
                tax:           parseFloat(sale.tax),
                discount:      parseFloat(sale.discount || 0),
                total:         parseFloat(sale.total_amount),
                paymentMethod: sale.payment_method,
                paymentStatus: sale.payment_status,
                createdBy:     sale.created_by_name,
            };

            res.json({ success: true, data: invoice });
        } catch (err) {
            console.error('generateInvoice error:', err);
            res.status(500).json({ success: false, message: 'Failed to generate invoice' });
        }
    },

    // ── POST /api/sales/:id/refund  →  "Refund" button in Sales table ────────
    refundSale: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id }     = req.params;
            const { reason } = req.body;

            // Lock the sale
            const saleResult = await client.query(
                'SELECT * FROM sales WHERE id = $1 FOR UPDATE',
                [id]
            );
            if (saleResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Sale not found' });
            }
            if (saleResult.rows[0].payment_status === 'refunded') {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Sale has already been refunded' });
            }

            // Mark sale as refunded
            await client.query(
                "UPDATE sales SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1",
                [id]
            );

            // Restore stock for each item
            const items = await client.query(
                'SELECT product_id, quantity FROM sale_items WHERE sale_id = $1',
                [id]
            );
            for (const item of items.rows) {
                const updated = await client.query(
                    `UPDATE products
                     SET current_stock = current_stock + $1, updated_at = NOW()
                     WHERE id = $2
                     RETURNING current_stock`,
                    [item.quantity, item.product_id]
                );

                const newStock = updated.rows[0].current_stock;

                await client.query(
                    `INSERT INTO inventory_transactions
                        (product_id, transaction_type, quantity, previous_stock, new_stock,
                         reference_type, reference_id, notes, created_by, created_at)
                     VALUES ($1,'inward',$2,$3,$4,'refund',$5,$6,$7,NOW())`,
                    [item.product_id, item.quantity,
                     newStock - item.quantity, newStock,
                     id, reason || 'Sale refunded', req.user.id]
                );
            }

            // Audit
            await client.query(
                `INSERT INTO audit_logs
                    (user_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES ($1,'REFUND_SALE','sale',$2,$3,$4)`,
                [req.user.id, id, JSON.stringify({ reason }), req.ip]
            );

            await client.query('COMMIT');

            res.json({ success: true, message: 'Sale refunded and stock restored successfully' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('refundSale error:', err);
            res.status(500).json({ success: false, message: 'Failed to refund sale' });
        } finally {
            client.release();
        }
    },

    // ── GET /api/sales/reports/daily  →  Stat cards on Sales Dashboard ───────
    getDailySalesReport: async (req, res) => {
        try {
            const date       = req.query.date || new Date().toISOString().split('T')[0];
            const yesterDate = new Date(date);
            yesterDate.setDate(yesterDate.getDate() - 1);
            const yesterday  = yesterDate.toISOString().split('T')[0];

            const [today, yester] = await Promise.all([
                pool.query(
                    `SELECT
                        COUNT(*) AS transactions,
                        COALESCE(SUM(total_amount), 0) AS revenue,
                        COALESCE(AVG(total_amount), 0) AS avg_order_value,
                        COUNT(DISTINCT customer_email) AS unique_customers
                     FROM sales
                     WHERE DATE(created_at) = $1 AND payment_status = 'completed'`,
                    [date]
                ),
                pool.query(
                    `SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS transactions
                     FROM sales
                     WHERE DATE(created_at) = $1 AND payment_status = 'completed'`,
                    [yesterday]
                ),
            ]);

            const todayRev  = parseFloat(today.rows[0].revenue);
            const yesterRev = parseFloat(yester.rows[0].revenue);
            const revenueChange = yesterRev > 0 ? (((todayRev - yesterRev) / yesterRev) * 100).toFixed(1) : null;

            res.json({
                success: true,
                data: {
                    date,
                    transactions:     parseInt(today.rows[0].transactions),
                    revenue:          todayRev,
                    avg_order_value:  parseFloat(today.rows[0].avg_order_value),
                    unique_customers: parseInt(today.rows[0].unique_customers),
                    revenueChange:    revenueChange ? `${revenueChange > 0 ? '+' : ''}${revenueChange}%` : null,
                },
            });
        } catch (err) {
            console.error('getDailySalesReport error:', err);
            res.status(500).json({ success: false, message: 'Failed to generate daily report' });
        }
    },

    // ── GET /api/sales/reports/top-products  →  Analytics page ──────────────
    getTopProducts: async (req, res) => {
        try {
            const period  = req.query.period  || 'month';
            const limit   = parseInt(req.query.limit) || 10;
            const interval = period === 'week' ? '7 days' : period === 'year' ? '365 days' : '30 days';

            const result = await pool.query(
                `SELECT
                    p.id, p.name, p.sku, p.category,
                    SUM(si.quantity)::int   AS quantity_sold,
                    SUM(si.total_price)     AS revenue,
                    COUNT(DISTINCT s.id)::int AS transaction_count
                 FROM sale_items si
                 JOIN products p ON si.product_id = p.id
                 JOIN sales    s ON si.sale_id     = s.id
                 WHERE s.created_at >= NOW() - $1::interval
                   AND s.payment_status = 'completed'
                 GROUP BY p.id, p.name, p.sku, p.category
                 ORDER BY revenue DESC
                 LIMIT $2`,
                [interval, limit]
            );

            res.json({
                success: true,
                data: result.rows.map(r => ({
                    ...r,
                    revenue: parseFloat(r.revenue),
                })),
            });
        } catch (err) {
            console.error('getTopProducts error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch top products' });
        }
    },
};

module.exports = salesController;
