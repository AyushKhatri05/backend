// backend/fix-database-schema.js
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

async function fixDatabaseSchema() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log('🔧 Fixing database schema...\n');
        
        // Drop existing tables if they exist (be careful with this in production!)
        console.log('Dropping existing tables...');
        await client.query('DROP TABLE IF EXISTS sale_items CASCADE');
        await client.query('DROP TABLE IF EXISTS sales CASCADE');
        await client.query('DROP TABLE IF EXISTS inventory_transactions CASCADE');
        await client.query('DROP TABLE IF EXISTS products CASCADE');
        await client.query('DROP TABLE IF EXISTS users CASCADE');
        await client.query('DROP TABLE IF EXISTS audit_logs CASCADE');
        console.log('✅ Tables dropped\n');
        
        // Create users table
        console.log('Creating users table...');
        await client.query(`
            CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'sales_staff',
                two_factor_enabled BOOLEAN DEFAULT FALSE,
                two_factor_secret TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                failed_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP,
                last_login TIMESTAMP,
                reset_token VARCHAR(255),
                reset_expires TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Users table created\n');
        
        // Create products table
        console.log('Creating products table...');
        await client.query(`
            CREATE TABLE products (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                sku VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                category VARCHAR(100),
                unit_price DECIMAL(10,2) NOT NULL,
                cost_price DECIMAL(10,2),
                current_stock INTEGER DEFAULT 0,
                minimum_stock INTEGER DEFAULT 10,
                location VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                created_by UUID REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Products table created\n');
        
        // Create sales table
        console.log('Creating sales table...');
        await client.query(`
            CREATE TABLE sales (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                invoice_number VARCHAR(50) UNIQUE NOT NULL,
                customer_name VARCHAR(255),
                customer_email VARCHAR(255),
                customer_phone VARCHAR(50),
                subtotal DECIMAL(10,2) NOT NULL,
                tax DECIMAL(10,2) DEFAULT 0,
                discount DECIMAL(10,2) DEFAULT 0,
                total_amount DECIMAL(10,2) NOT NULL,
                payment_method VARCHAR(50),
                payment_status VARCHAR(50) DEFAULT 'pending',
                created_by UUID REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Sales table created\n');
        
        // Create sale_items table
        console.log('Creating sale_items table...');
        await client.query(`
            CREATE TABLE sale_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
                product_id UUID REFERENCES products(id),
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                total_price DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Sale_items table created\n');
        
        // Create inventory_transactions table
        console.log('Creating inventory_transactions table...');
        await client.query(`
            CREATE TABLE inventory_transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID REFERENCES products(id),
                transaction_type VARCHAR(20) NOT NULL,
                quantity INTEGER NOT NULL,
                previous_stock INTEGER,
                new_stock INTEGER,
                reference_type VARCHAR(50),
                reference_id UUID,
                notes TEXT,
                created_by UUID REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Inventory_transactions table created\n');
        
        // Create audit_logs table
        console.log('Creating audit_logs table...');
        await client.query(`
            CREATE TABLE audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id),
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(50),
                entity_id UUID,
                old_values JSONB,
                new_values JSONB,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Audit_logs table created\n');
        
        // Create indexes
        console.log('Creating indexes...');
        await client.query('CREATE INDEX idx_users_email ON users(email)');
        await client.query('CREATE INDEX idx_products_sku ON products(sku)');
        await client.query('CREATE INDEX idx_sales_invoice ON sales(invoice_number)');
        await client.query('CREATE INDEX idx_sales_created ON sales(created_at)');
        await client.query('CREATE INDEX idx_audit_logs_user ON audit_logs(user_id)');
        await client.query('CREATE INDEX idx_audit_logs_created ON audit_logs(created_at)');
        console.log('✅ Indexes created\n');
        
        await client.query('COMMIT');
        console.log('✅ Database schema fixed successfully!\n');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error fixing schema:', error);
    } finally {
        client.release();
    }
}

fixDatabaseSchema();