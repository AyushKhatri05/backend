// backend/add-sample-data-fixed.js
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

async function addSampleData() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🚀 Adding sample data...\n');
        
        // Create users
        console.log('Creating users...');
        const users = [
            { email: 'admin@erplite.com', username: 'admin', role: 'admin', password: 'Password@123' },
            { email: 'manager@erplite.com', username: 'manager', role: 'inventory_manager', password: 'Password@123' },
            { email: 'staff@erplite.com', username: 'staff', role: 'sales_staff', password: 'Password@123' }
        ];
        
        const userIds = {};
        
        for (const user of users) {
            const hashedPassword = await bcrypt.hash(user.password, 10);
            const result = await client.query(
                `INSERT INTO users (email, username, password_hash, role, is_active, created_at) 
                 VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
                [user.email, user.username, hashedPassword, user.role, true]
            );
            userIds[user.role] = result.rows[0].id;
            console.log(`  ✅ Created: ${user.email}`);
        }
        
        const adminId = userIds['admin'];
        
        // Create products
        console.log('\nCreating products...');
        const products = [
            ['Laptop Pro', 'LAP-001', 'High-performance laptop', 'Electronics', 1299.99, 999.99, 50, 10, 'Aisle-1'],
            ['Wireless Mouse', 'MOU-001', 'Ergonomic wireless mouse', 'Electronics', 29.99, 15.99, 200, 20, 'Aisle-2'],
            ['Desk Chair', 'CHR-001', 'Ergonomic office chair', 'Furniture', 299.99, 199.99, 30, 5, 'Aisle-3'],
            ['Notebook', 'NBK-001', 'Spiral notebook', 'Stationery', 4.99, 2.50, 500, 50, 'Aisle-4'],
            ['Printer Paper', 'PAP-001', 'A4 printer paper, 500 sheets', 'Stationery', 12.99, 8.99, 300, 30, 'Aisle-4'],
            ['USB-C Cable', 'USB-001', '6ft USB-C charging cable', 'Electronics', 15.99, 8.99, 150, 25, 'Aisle-2'],
            ['Monitor 24"', 'MON-001', '24" Full HD monitor', 'Electronics', 199.99, 149.99, 25, 5, 'Aisle-1'],
            ['Keyboard', 'KEY-001', 'Mechanical keyboard', 'Electronics', 89.99, 59.99, 75, 10, 'Aisle-2'],
            ['Desk Lamp', 'LMP-001', 'LED desk lamp', 'Furniture', 45.99, 29.99, 60, 8, 'Aisle-3'],
            ['Whiteboard', 'WBD-001', 'Magnetic whiteboard', 'Office', 79.99, 49.99, 20, 3, 'Aisle-3']
        ];
        
        const productIds = [];
        
        for (const prod of products) {
            const result = await client.query(
                `INSERT INTO products (name, sku, description, category, unit_price, cost_price, current_stock, minimum_stock, location, created_by, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) RETURNING id`,
                [...prod, adminId]
            );
            productIds.push({ id: result.rows[0].id, unit_price: prod[4] });
            console.log(`  ✅ Created: ${prod[0]}`);
        }
        
        // Create sales
        console.log('\nCreating sales...');
        
        const customers = [
            { name: 'John Doe', email: 'john@example.com' },
            { name: 'Jane Smith', email: 'jane@example.com' },
            { name: 'Bob Johnson', email: 'bob@example.com' },
            { name: 'Alice Brown', email: 'alice@example.com' },
            { name: 'Charlie Wilson', email: 'charlie@example.com' },
            { name: null, email: null },
            { name: 'Diana Prince', email: 'diana@example.com' },
            { name: 'Bruce Wayne', email: 'bruce@example.com' },
        ];
        
        const paymentMethods = ['cash', 'card', 'bank_transfer'];
        const statuses = ['completed', 'completed', 'completed', 'refunded'];
        
        for (let i = 1; i <= 50; i++) {
            const invoiceNumber = `INV-2024-${String(1000 + i).padStart(5, '0')}`;
            const customer = customers[Math.floor(Math.random() * customers.length)];
            
            // Random date within last 30 days
            const daysAgo = Math.floor(Math.random() * 30);
            const createdDate = new Date();
            createdDate.setDate(createdDate.getDate() - daysAgo);
            
            const numItems = Math.floor(Math.random() * 4) + 1;
            let subtotal = 0;
            const saleItems = [];
            
            for (let j = 0; j < numItems; j++) {
                const product = productIds[Math.floor(Math.random() * productIds.length)];
                const quantity = Math.floor(Math.random() * 3) + 1;
                const itemTotal = product.unit_price * quantity;
                subtotal += itemTotal;
                
                saleItems.push({
                    productId: product.id,
                    quantity,
                    unitPrice: product.unit_price,
                    totalPrice: itemTotal
                });
            }
            
            const tax = subtotal * 0.1;
            const totalAmount = subtotal + tax;
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            
            const saleResult = await client.query(
                `INSERT INTO sales (invoice_number, customer_name, customer_email, subtotal, tax, total_amount, payment_method, payment_status, created_by, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
                [invoiceNumber, customer.name, customer.email, subtotal, tax, totalAmount, paymentMethod, status, adminId, createdDate]
            );
            
            const saleId = saleResult.rows[0].id;
            
            for (const item of saleItems) {
                await client.query(
                    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [saleId, item.productId, item.quantity, item.unitPrice, item.totalPrice]
                );
            }
            
            if (i % 10 === 0) {
                console.log(`  Created ${i} sales...`);
            }
        }
        
        console.log('  ✅ Created 50 sales');
        
        await client.query('COMMIT');
        
        console.log('\n✅ Sample data added successfully!');
        console.log('\n📊 Summary:');
        console.log(`   Users: 3`);
        console.log(`   Products: ${products.length}`);
        console.log(`   Sales: 50`);
        
        console.log('\n🔑 Login credentials:');
        console.log('   admin@erplite.com / Password@123');
        console.log('   manager@erplite.com / Password@123');
        console.log('   staff@erplite.com / Password@123');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

addSampleData();