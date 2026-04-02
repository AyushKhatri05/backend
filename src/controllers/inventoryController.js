const { pool } = require('../utils/database');
const inventoryService = require('../services/inventoryService');

const inventoryController = {
    getProducts: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const offset = (page - 1) * limit;
            const search = req.query.search;

            let query = 'SELECT * FROM products WHERE is_active = true';
            const params = [];
            if (search) {
                query += ' AND (name ILIKE $1 OR sku ILIKE const { pool } = require('../utils/database');

const inventoryController = {
    // GET /api/inventory/products - Get all products with pagination
    getProducts: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';

            let query = 'SELECT * FROM products WHERE is_active = true';
            let countQuery = 'SELECT COUNT(*) FROM products WHERE is_active = true';
            const params = [];
            
            if (search) {
                query += ' AND (name ILIKE $1 OR sku ILIKE $1)';
                countQuery += ' AND (name ILIKE $1 OR sku ILIKE $1)';
                params.push(`%${search}%`);
            }
            
            query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            
            const result = await pool.query(query, [...params, limit, offset]);
            const countResult = await pool.query(countQuery, params);
            
            const total = parseInt(countResult.rows[0].count);

            res.json({
                success: true,
                data: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('Error in getProducts:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch products' 
            });
        }
    },

    // GET /api/inventory/products/search - Search products
    searchProducts: async (req, res) => {
        try {
            const { q } = req.query;
            
            if (!q) {
                return res.json({ success: true, data: [] });
            }
            
            const result = await pool.query(
                'SELECT id, sku, name, unit_price, current_stock FROM products WHERE is_active = true AND (name ILIKE $1 OR sku ILIKE $1) LIMIT 20',
                [`%${q}%`]
            );
            
            res.json({
                success: true,
                data: result.rows
            });
        } catch (error) {
            console.error('Error in searchProducts:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to search products' 
            });
        }
    },

    // GET /api/inventory/products/:id - Get single product
    getProductById: async (req, res) => {
        try {
            const { id } = req.params;
            
            const result = await pool.query(
                'SELECT * FROM products WHERE id = $1 AND is_active = true',
                [id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Product not found' 
                });
            }
            
            res.json({
                success: true,
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Error in getProductById:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch product' 
            });
        }
    },

    // POST /api/inventory/products - Create new product
    createProduct: async (req, res) => {
        try {
            const { 
                name, 
                sku, 
                description, 
                category, 
                unit_price, 
                cost_price, 
                current_stock, 
                minimum_stock, 
                location 
            } = req.body;
            
            // Check if SKU already exists
            const existing = await pool.query(
                'SELECT id FROM products WHERE sku = $1',
                [sku]
            );
            
            if (existing.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Product with this SKU already exists'
                });
            }
            
            const result = await pool.query(
                `INSERT INTO products (
                    name, sku, description, category, unit_price, cost_price, 
                    current_stock, minimum_stock, location, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
                [name, sku, description, category, unit_price, cost_price, 
                 current_stock || 0, minimum_stock || 10, location, req.user.id]
            );
            
            // Log to audit
            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [req.user.id, 'CREATE_PRODUCT', 'product', result.rows[0].id, 
                 JSON.stringify(result.rows[0]), req.ip]
            );
            
            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Error in createProduct:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to create product' 
            });
        }
    },

    // PUT /api/inventory/products/:id - Update product
    updateProduct: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            // Get old values for audit
            const oldProduct = await pool.query(
                'SELECT * FROM products WHERE id = $1',
                [id]
            );
            
            if (oldProduct.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found'
                });
            }
            
            // Build dynamic update query
            const setClause = Object.keys(updates)
                .map((key, i) => `${key} = $${i + 1}`)
                .join(', ');
            
            const values = [...Object.values(updates), id];
            
            const result = await pool.query(
                `UPDATE products SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
                values
            );
            
            // Log to audit
            await pool.query(
                `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [req.user.id, 'UPDATE_PRODUCT', 'product', id, 
                 JSON.stringify(oldProduct.rows[0]), JSON.stringify(result.rows[0]), req.ip]
            );
            
            res.json({
                success: true,
                message: 'Product updated successfully',
                data: result.rows[0]
            });
        } catch (error) {
            console.error('Error in updateProduct:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to update product' 
            });
        }
    },

    // DELETE /api/inventory/products/:id - Soft delete product
    deleteProduct: async (req, res) => {
        try {
           