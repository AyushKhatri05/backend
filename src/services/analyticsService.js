// backend/src/services/analyticsService.js
// COMPLETE – all analytics computed from real PostgreSQL data

const { pool } = require('../utils/database');

const analyticsService = {

    // ── Dashboard KPIs  →  4 stat cards on Dashboard ────────────────────────
    getDashboardKPIs: async () => {
        const today     = new Date().toISOString().split('T')[0];
        const monthAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [
            salesToday, salesMonth, products, lowStock,
            revenueToday, revenueMonth,
        ] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) AS count FROM sales
                 WHERE DATE(created_at) = $1 AND payment_status = 'completed'`,
                [today]
            ),
            pool.query(
                `SELECT COUNT(*) AS count FROM sales
                 WHERE created_at >= $1 AND payment_status = 'completed'`,
                [monthAgo]
            ),
            pool.query('SELECT COUNT(*) AS count FROM products WHERE is_active = true'),
            pool.query(
                `SELECT COUNT(*) AS count FROM products
                 WHERE current_stock <= minimum_stock AND is_active = true`
            ),
            pool.query(
                `SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales
                 WHERE DATE(created_at) = $1 AND payment_status = 'completed'`,
                [today]
            ),
            pool.query(
                `SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales
                 WHERE created_at >= $1 AND payment_status = 'completed'`,
                [monthAgo]
            ),
        ]);

        return {
            todaySales:     parseInt(salesToday.rows[0].count),
            monthlySales:   parseInt(salesMonth.rows[0].count),
            totalProducts:  parseInt(products.rows[0].count),
            lowStockCount:  parseInt(lowStock.rows[0].count),
            todayRevenue:   parseFloat(revenueToday.rows[0].total),
            monthlyRevenue: parseFloat(revenueMonth.rows[0].total),
        };
    },

    // ── Dashboard charts  →  Revenue bar chart + stock pie chart ────────────
    getDashboardCharts: async () => {
        const [revenueChart, categoryStock, topProducts] = await Promise.all([
            // Last 7 days revenue
            pool.query(
                `SELECT
                    TO_CHAR(DATE(created_at), 'Mon DD') AS label,
                    COALESCE(SUM(total_amount), 0)::float AS revenue,
                    COUNT(*) AS orders
                 FROM sales
                 WHERE created_at >= NOW() - INTERVAL '7 days'
                   AND payment_status = 'completed'
                 GROUP BY DATE(created_at)
                 ORDER BY DATE(created_at)`
            ),
            // Stock value by category
            pool.query(
                `SELECT category,
                        SUM(current_stock * unit_price)::float AS value,
                        COUNT(*) AS products
                 FROM products
                 WHERE is_active = true AND category IS NOT NULL
                 GROUP BY category
                 ORDER BY value DESC
                 LIMIT 8`
            ),
            // Top 5 products by revenue this month
            pool.query(
                `SELECT p.name, SUM(si.total_price)::float AS revenue, SUM(si.quantity)::int AS qty
                 FROM sale_items si
                 JOIN products p ON si.product_id = p.id
                 JOIN sales    s ON si.sale_id     = s.id
                 WHERE s.created_at >= NOW() - INTERVAL '30 days'
                   AND s.payment_status = 'completed'
                 GROUP BY p.id, p.name
                 ORDER BY revenue DESC
                 LIMIT 5`
            ),
        ]);

        return {
            revenueChart:  revenueChart.rows,
            categoryStock: categoryStock.rows,
            topProducts:   topProducts.rows,
        };
    },

    // ── Demand forecast  →  "View Forecast" button per product ──────────────
    getDemandForecast: async (productId) => {
        const [product, salesHistory] = await Promise.all([
            pool.query('SELECT * FROM products WHERE id = $1', [productId]),
            pool.query(
                `SELECT
                    DATE_TRUNC('week', s.created_at) AS week,
                    SUM(si.quantity)::int AS quantity_sold
                 FROM sale_items si
                 JOIN sales s ON si.sale_id = s.id
                 WHERE si.product_id = $1
                   AND s.payment_status = 'completed'
                   AND s.created_at >= NOW() - INTERVAL '12 weeks'
                 GROUP BY week
                 ORDER BY week`,
                [productId]
            ),
        ]);

        if (product.rows.length === 0) throw new Error('Product not found');

        const p          = product.rows[0];
        const history    = salesHistory.rows;
        const avgWeekly  = history.length > 0
            ? history.reduce((s, r) => s + r.quantity_sold, 0) / history.length
            : 0;

        const weeksOfStock = avgWeekly > 0 ? (p.current_stock / avgWeekly).toFixed(1) : null;

        // Project next 4 weeks
        const forecast = [1, 2, 3, 4].map(w => ({
            week: `Week +${w}`,
            projected_demand: Math.round(avgWeekly),
        }));

        return {
            product: {
                id: p.id, name: p.name, sku: p.sku,
                current_stock: p.current_stock,
                minimum_stock: p.minimum_stock,
            },
            history,
            forecast,
            summary: {
                avg_weekly_demand: parseFloat(avgWeekly.toFixed(2)),
                weeks_of_stock:    weeksOfStock ? parseFloat(weeksOfStock) : null,
                reorder_suggested: p.current_stock <= p.minimum_stock,
                suggested_reorder_qty: Math.max(0, Math.round(avgWeekly * 4) - p.current_stock),
            },
        };
    },

    // ── Reorder alerts  →  Alerts table on Analytics page ───────────────────
    getReorderAlerts: async () => {
        const result = await pool.query(
            `SELECT ra.*, p.name AS product_name, p.sku, p.category,
                    u.username AS acknowledged_by_name
             FROM reorder_alerts ra
             JOIN products p ON ra.product_id = p.id
             LEFT JOIN users u ON ra.acknowledged_by = u.id
             ORDER BY ra.status ASC, ra.created_at DESC`
        );
        return result.rows;
    },

    // ── Inventory velocity  →  Velocity chart on Analytics page ─────────────
    getInventoryVelocity: async () => {
        const result = await pool.query(
            `SELECT
                p.id, p.name, p.sku, p.category,
                p.current_stock,
                COALESCE(SUM(si.quantity), 0)::int AS units_sold_30d,
                COALESCE(SUM(si.total_price), 0)::float AS revenue_30d,
                CASE
                    WHEN p.current_stock = 0 THEN 0
                    WHEN COALESCE(SUM(si.quantity), 0) = 0 THEN NULL
                    ELSE ROUND((p.current_stock::decimal / COALESCE(SUM(si.quantity), 1)) * 30, 1)
                END AS days_of_stock,
                CASE
                    WHEN COALESCE(SUM(si.quantity), 0) > 50 THEN 'fast'
                    WHEN COALESCE(SUM(si.quantity), 0) > 10 THEN 'medium'
                    ELSE 'slow'
                END AS velocity_class
             FROM products p
             LEFT JOIN sale_items si ON si.product_id = p.id
             LEFT JOIN sales      s  ON si.sale_id = s.id
                AND s.created_at >= NOW() - INTERVAL '30 days'
                AND s.payment_status = 'completed'
             WHERE p.is_active = true
             GROUP BY p.id, p.name, p.sku, p.category, p.current_stock
             ORDER BY units_sold_30d DESC`
        );
        return result.rows;
    },

    // ── ABC analysis  →  ABC table on Analytics page ─────────────────────────
    getABCAnalysis: async () => {
        const result = await pool.query(
            `WITH product_revenue AS (
                SELECT
                    p.id, p.name, p.sku, p.category,
                    COALESCE(SUM(si.total_price), 0)::float AS revenue
                FROM products p
                LEFT JOIN sale_items si ON si.product_id = p.id
                LEFT JOIN sales      s  ON si.sale_id = s.id
                    AND s.payment_status = 'completed'
                WHERE p.is_active = true
                GROUP BY p.id, p.name, p.sku, p.category
            ),
            ranked AS (
                SELECT *,
                    SUM(revenue) OVER () AS total_revenue,
                    SUM(revenue) OVER (ORDER BY revenue DESC
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_revenue
                FROM product_revenue
            )
            SELECT *,
                CASE
                    WHEN total_revenue = 0 THEN 'C'
                    WHEN (cumulative_revenue / NULLIF(total_revenue, 0)) <= 0.70 THEN 'A'
                    WHEN (cumulative_revenue / NULLIF(total_revenue, 0)) <= 0.90 THEN 'B'
                    ELSE 'C'
                END AS abc_class,
                ROUND((revenue / NULLIF(total_revenue, 0)) * 100, 2)::float AS revenue_pct
            FROM ranked
            ORDER BY revenue DESC`
        );
        return result.rows;
    },

    // ── Sales trends  →  Period filter buttons on Analytics page ─────────────
    getSalesTrends: async (period = 'month') => {
        let interval, groupBy, labelFn;

        if (period === 'week') {
            interval = '7 days';
            groupBy  = "DATE(created_at)";
            labelFn  = "TO_CHAR(DATE(created_at), 'Mon DD')";
        } else if (period === 'year') {
            interval = '365 days';
            groupBy  = "DATE_TRUNC('month', created_at)";
            labelFn  = "TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY')";
        } else {
            // month (default)
            interval = '30 days';
            groupBy  = "DATE(created_at)";
            labelFn  = "TO_CHAR(DATE(created_at), 'Mon DD')";
        }

        const result = await pool.query(
            `SELECT
                ${labelFn} AS label,
                COUNT(*)::int AS orders,
                COALESCE(SUM(total_amount), 0)::float AS revenue,
                COALESCE(AVG(total_amount), 0)::float AS avg_order_value
             FROM sales
             WHERE created_at >= NOW() - INTERVAL '${interval}'
               AND payment_status = 'completed'
             GROUP BY ${groupBy}
             ORDER BY ${groupBy}`
        );

        return result.rows;
    },
};

module.exports = analyticsService;
