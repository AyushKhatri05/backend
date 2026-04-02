const { pool } = require('../utils/database');

class InventoryService {
    async processInward(productId, quantity, referenceType, referenceId, userId, notes = '') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const product = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
            if (product.rows.length === 0) throw new Error('Product not found');
            
            const previousStock = product.rows[0].current_stock;
            const newStock = previousStock + quantity;
            
            await client.query('UPDATE products SET current_stock = $1 WHERE id = $2', [newStock, productId]);
            
            const transaction = await client.query(
                'INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, reference_type, reference_id, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
                [productId, 'inward', quantity, previousStock, newStock, referenceType, referenceId, notes, userId]
            );
            
            await client.query('COMMIT');
            return transaction.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async processOutward(productId, quantity, referenceType, referenceId, userId, notes = '') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const product = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
            if (product.rows.length === 0) throw new Error('Product not found');
            if (product.rows[0].current_stock < quantity) throw new Error('Insufficient stock');
            
            const previousStock = product.rows[0].current_stock;
            const newStock = previousStock - quantity;
            
            await client.query('UPDATE products SET current_stock = $1 WHERE id = $2', [newStock, productId]);
            
            const transaction = await client.query(
                'INSERT INTO inventory_transactions (product_id, transaction_type, quantity, previous_stock, new_stock, reference_type, reference_id, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
                [productId, 'outward', quantity, previousStock, newStock, referenceType, referenceId, notes, userId]
            );
            
            await client.query('COMMIT');
            return transaction.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async processSale(saleData, items, userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const invoiceNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*10000)).padStart(5,'0')}`;
            
            const sale = await client.query(
                'INSERT INTO sales (invoice_number, customer_name, customer_email, customer_phone, subtotal, tax, discount, total_amount, payment_method, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
                [invoiceNumber, saleData.customerName, saleData.customerEmail, saleData.customerPhone,
                 saleData.subtotal, saleData.tax, saleData.discount, saleData.totalAmount, saleData.paymentMethod, userId]
            );
            
            for (const item of items) {
                await client.query(
                    'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)',
                    [sale.rows[0].id, item.productId, item.quantity, item.unitPrice, item.totalPrice]
                );
                
                await this.processOutward(item.productId, item.quantity, 'sale', sale.rows[0].id, userId, `Sale #${invoiceNumber}`);
            }
            
            await client.query('COMMIT');
            return sale.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new InventoryService();