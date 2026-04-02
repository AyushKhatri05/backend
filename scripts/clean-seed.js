// backend/scripts/seed.js
const { pool } = require('../src/utils/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function seed() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Clear existing data (optional - be careful in production!)
        await client.query('DELETE FROM audit_logs');
        await client.query('DELETE FROM sale_items');
        await client.query('DELETE FROM sales');
        await client.query('DELETE FROM inventory_transactions');
        await client.query('DELETE FROM products');
        await client.query('DELETE FROM users');
        
        console.log('Creating users with proper bcrypt hashing...');
        
        // Create users with properly hashed passwords
        const users = [
            {
                email: 'admin@erplite.com',
                username: 'admin',
                password: 'Password@123',
                role: 'admin'
            },
            {
                email: 'manager@erplite.com',
                username: 'manager',
                password: 'Password@123',
                role: 'inventory_manager'
            },
            {
                email: 'staff@erplite.com',
                username: 'staff',
                password: 'Password@123',
                role: 'sales_staff'
            }
        ];
        
        for (const user of users) {
            const hashedPassword = await bcrypt.hash(user.password, 10);
            
            await client.query(
                `INSERT INTO users (email, username, password_hash, role, is_active, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [user.email, user.username, hashedPassword, user.role, true]
            );
            
            console.log(`Created user: ${user.email} with role: ${user.role}`);
        }
        
        // Get user IDs
        const adminResult = await client.query('SELECT id FROM users WHERE email = $1', ['admin@erplite.com']);
        const adminId = adminResult.rows[0].id;
        
        // Create sample products
        console.log('Creating sample products...');
        
        const products = [
            ['Laptop Pro', 'LAP-001', 'High-performance laptop', 'Electronics', 1299.99, 999.99, 10, 'Aisle-1'],
            ['Wireless Mouse', 'MOU-001', 'Ergonomic wireless mouse', 'Electronics', 29.99, 15.99, 50, 'Aisle-2'],
            ['Desk Chair', 'CHR-001', 'Ergonomic office chair', 'Furniture', 299.99, 199.99, 15, 'Aisle-3'],
            ['Notebook', 'NBK-001', 'Spiral notebook', 'Stationery', 4.99, 2.50, 200, 'Aisle-4'],
            ['Printer Paper', 'PAP-001', 'A4 printer paper, 500 sheets', 'Stationery', 12.99, 8.99, 100, 'Aisle-4'],
            ['USB-C Cable', 'USB-001', '6ft USB-C charging cable', 'Electronics', 15.99, 8.99, 150, 'Aisle-2'],
            ['Monitor 24"', 'MON-001', '24" Full HD monitor', 'Electronics', 199.99, 149.99, 20, 'Aisle-1'],
            ['Keyboard', 'KEY-001', 'Mechanical keyboard', 'Electronics', 89.99, 59.99, 30, 'Aisle-2'],
            ['Desk Lamp', 'LMP-001', 'LED desk lamp', 'Furniture', 45.99, 29.99, 25, 'Aisle-3'],
            ['Whiteboard', 'WBD-001', 'Magnetic whiteboard', 'Office', 79.99, 49.99, 10, 'Aisle-3']
        ];
        
        for (const product of products) {
            await client.query(
                `INSERT INTO products (name, sku, description, category, unit_price, cost_price, current_stock, minimum_stock, location, created_by, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
                [...product, adminId]
            );
        }
        
        console.log('Created 10 sample products');
        
        // Create sample sales
        console.log('Creating sample sales...');
        
        const productIds = await client.query('SELECT id, unit_price FROM products LIMIT 5');
        
        for (let i = 1; i <= 10; i++) {
            const invoiceNumber = `INV-2024-${String(1000 + i).padStart(5, '0')}`;
            const totalAmount = Math.floor(Math.random() * 500) + 100;
            const createdDaysAgo = Math.floor(Math.random() * 30);
            const createdDate = new Date();
            createdDate.setDate(createdDate.getDate() - createdDaysAgo);
            
            const saleResult = await client.query(
                `INSERT INTO sales (invoice_number, customer_name, customer_email, subtotal, tax, total_amount, payment_method, payment_status, created_by, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
                [
                    invoiceNumber,
                    i % 3 === 0 ? null : `Customer ${i}`,
                    i % 3 === 0 ? null : `customer${i}@example.com`,
                    totalAmount * 0.9,
                    totalAmount * 0.1,
                    totalAmount,
                    ['cash', 'card', 'bank_transfer'][Math.floor(Math.random() * 3)],
                    ['completed', 'completed', 'completed', 'refunded'][Math.floor(Math.random() * 4)],
                    adminId,
                    createdDate
                ]
            );
            
            // Add sale items
            const numItems = Math.floor(Math.random() * 3) + 1;
            for (let j = 0; j < numItems; j++) {
                const product = productIds.rows[Math.floor(Math.random() * productIds.rows.length)];
                const quantity = Math.floor(Math.random() * 3) + 1;
                const totalPrice = product.unit_price * quantity;
                
                await client.query(
                    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [saleResult.rows[0].id, product.id, quantity, product.unit_price, totalPrice]
                );
            }
        }
        
        console.log('Created 10 sample sales');
        
        await client.query('COMMIT');
        console.log('\n✅ Database seeded successfully!');
        console.log('\nTest credentials:');
        console.log('-------------------');
        console.log('Admin: admin@erplite.com / Password@123');
        console.log('Manager: manager@erplite.com / Password@123');
        console.log('Staff: staff@erplite.com / Password@123');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error seeding database:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();