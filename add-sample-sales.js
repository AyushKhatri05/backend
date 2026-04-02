// backend/add-sample-sales.js
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'erp_lite',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function addSampleSales() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🛍️  Adding sample sales data...\n');
        
        // Get admin user ID
        const adminResult = await client.query('SELECT id FROM users WHERE email = $1', ['admin@erplite.com']);
        if (adminResult.rows.length === 0) {
            console.log('❌ Admin user not found! Creating admin user...');
            
            const hashedPassword = await bcrypt.hash('Password@123', 10);
            await client.query(
                `INSERT INTO users (email, username, password_hash, role, is_active, created_at) 
                 VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
                ['admin@erplite.com', 'admin', hashedPassword, 'admin', true]
            );
            
            const newAdmin = await client.query('SELECT id FROM users WHERE email = $1', ['admin@erplite.com']);
            adminId = newAdmin.rows[0].id;
        }
        
        const adminId = adminResult.rows[0].id;
        
        // Get some products
        const productsResult = await client.query('SELECT id, unit_price FROM products LIMIT 10');
        const products = productsResult.rows;
        
        if (products.length === 0) {
            console.log('❌ No products found! Creating sample products...');
            
            // Create sample products
            const sampleProducts = [
                ['Laptop Pro', 'LAP-001', 'High-performance laptop', 1299.99, 50],
                ['Wireless Mouse', 'MOU-001', 'Ergonomic wireless mouse', 29.99, 200],
                ['Desk Chair', 'CHR-001', 'Office chair', 299.99, 30],
                ['Notebook', 'NBK-001', 'Spiral notebook', 4.99, 500],
                ['Printer Paper', 'PAP-001', 'A4 paper pack', 12.99, 300],
                ['USB-C Cable', 'USB-001', '6ft charging cable', 15.99, 150],
                ['Monitor 24"', 'MON-001', 'Full HD monitor', 199.99, 25],
                ['Keyboard', 'KEY-001', 'Mechanical keyboard', 89.99, 75],
                ['Desk Lamp', 'LMP-001', 'LED desk lamp', 45.99, 60],
                ['Whiteboard', 'WBD-001', 'Magnetic whiteboard', 79.99, 20]
            ];
            
            for (const prod of sampleProducts) {
                await client.query(
                    `INSERT INTO products (name, sku, description, category, unit_price, current_stock, minimum_stock, created_by, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                    [prod[0], prod[1], prod[2], 'General', prod[3], prod[4], 10, adminId]
                );
            }
            
            const newProducts = await client.query('SELECT id, unit_price FROM products');
            products.push(...newProducts.rows);
        }
        
        console.log(`Found ${products.length} products\n`);
        
        // Customer names for variety
        const customers = [
            { name: 'John Doe', email: 'john@example.com' },
            { name: 'Jane Smith', email: 'jane@example.com' },
            { name: 'Bob Johnson', email: 'bob@example.com' },
            { name: 'Alice Brown', email: 'alice@example.com' },
            { name: 'Charlie Wilson', email: 'charlie@example.com' },
            { name: null, email: null }, // Walk-in customer
            { name: 'Diana Prince', email: 'diana@example.com' },
            { name: 'Bruce Wayne', email: 'bruce@example.com' },
            { name: 'Clark Kent', email: 'clark@example.com' },
            { name: 'Peter Parker', email: 'peter@example.com' },
        ];
        
        const paymentMethods = ['cash', 'card', 'bank_transfer'];
        const statuses = ['completed', 'completed', 'completed', 'refunded', 'completed'];
        
        console.log('Creating 50 sample sales...');
        
        // Create 50 sales over the last 30 days
        for (let i = 1; i <= 50; i++) {
            const invoiceNumber = `INV-2024-${String(1000 + i).padStart(5, '0')}`;
            
            // Random customer (70% have customer info, 30% walk-in)
            const customer = customers[Math.floor(Math.random() * customers.length)];
            
            // Random date within last 30 days
            const daysAgo = Math.floor(Math.random() * 30);
            const createdDate = new Date();
            createdDate.setDate(createdDate.getDate() - daysAgo);
            
            // Calculate random sale amount
            const numItems = Math.floor(Math.random() * 4) + 1; // 1-4 items
            let subtotal = 0;
            const saleItems = [];
            
            for (let j = 0; j < numItems; j++) {
                const product = products[Math.floor(Math.random() * products.length)];
                const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 quantity
                const itemTotal = product.unit_price * quantity;
                subtotal += itemTotal;
                
                saleItems.push({
                    productId: product.id,
                    quantity,
                    unitPrice: product.unit_price,
                    totalPrice: itemTotal
                });
            }
            
            const tax = subtotal * 0.1; // 10% tax
            const totalAmount = subtotal + tax;
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            
            // Insert sale
            const saleResult = await client.query(
                `INSERT INTO sales (
                    invoice_number, customer_name, customer_email, subtotal, tax, 
                    total_amount, payment_method, payment_status, created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
                [
                    invoiceNumber,
                    customer.name,
                    customer.email,
                    subtotal,
                    tax,
                    totalAmount,
                    paymentMethod,
                    status,
                    adminId,
                    createdDate
                ]
            );
            
            const saleId = saleResult.rows[0].id;
            
            // Insert sale items
            for (const item of saleItems) {
                await client.query(
                    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [saleId, item.productId, item.quantity, item.unitPrice, item.totalPrice]
                );
                
                // Update product stock (reduce for completed sales)
                if (status === 'completed') {
                    await client.query(
                        `UPDATE products SET current_stock = current_stock - $1 WHERE id = $2`,
                        [item.quantity, item.productId]
                    );
                }
            }
            
            // Log progress
            if (i % 10 === 0) {
                console.log(`  Created ${i} sales...`);
            }
        }
        
        console.log('\n✅ Created 50 sample sales successfully!');
        
        // Get summary
        const summary = await client.query(`
            SELECT 
                COUNT(*) as total_sales,
                SUM(total_amount) as total_revenue,
                COUNT(DISTINCT customer_email) as unique_customers
            FROM sales
        `);
        
        console.log('\n📊 Sales Summary:');
        console.log(`   Total Sales: ${summary.rows[0].total_sales}`);
        console.log(`   Total Revenue: $${parseFloat(summary.rows[0].total_revenue || 0).toFixed(2)}`);
        console.log(`   Unique Customers: ${summary.rows[0].unique_customers}`);
        
        // Get today's sales
        const today = new Date().toISOString().split('T')[0];
        const todaySales = await client.query(
            `SELECT COUNT(*) as count, SUM(total_amount) as revenue 
             FROM sales WHERE DATE(created_at) = $1`,
            [today]
        );
        
        console.log(`\n📈 Today's Sales (${today}):`);
        console.log(`   Transactions: ${todaySales.rows[0].count || 0}`);
        console.log(`   Revenue: $${parseFloat(todaySales.rows[0].revenue || 0).toFixed(2)}`);
        
        await client.query('COMMIT');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error adding sample sales:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

addSampleSales();