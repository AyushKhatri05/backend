// backend/scripts/fix-auth-schema.js
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixAuthSchema() {
    console.log('🚀 Starting auth schema fix...\n');
    
    // Log connection details (without password)
    console.log('Database connection:');
    console.log(`  Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`  Port: ${process.env.DB_PORT || 5432}`);
    console.log(`  User: ${process.env.DB_USER || 'postgres'}`);
    console.log(`  Database: ${process.env.DB_NAME || 'erp_lite'}`);
    console.log(`  Password: ${process.env.DB_PASSWORD ? '✓ Set' : '✗ Not set'}\n`);
    
    if (!process.env.DB_PASSWORD) {
        console.error('❌ ERROR: Database password is not set in .env file!');
        console.log('\nPlease add this to your backend/.env file:');
        console.log('DB_PASSWORD=postgres');
        process.exit(1);
    }
    
    const pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'erp_lite',
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT) || 5432,
    });
    
    const client = await pool.connect();
    
    try {
        console.log('📦 Connected to database\n');
        
        // Check if database exists and has tables
        const dbCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);
        
        if (!dbCheck.rows[0].exists) {
            console.log('⚠️  Users table does not exist. Creating tables...');
            
            // Create users table
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
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
                );
            `);
            
            console.log('✅ Users table created');
        }
        
        // Check if salt column exists and remove it
        const saltColumnResult = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'salt'
        `);
        
        if (saltColumnResult.rows.length > 0) {
            console.log('Removing salt column from users table...');
            await client.query('ALTER TABLE users DROP COLUMN salt');
            console.log('✅ Salt column removed');
        }
        
        // Add password reset columns if they don't exist
        const columns = ['reset_token', 'reset_expires'];
        for (const column of columns) {
            const exists = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = $1
            `, [column]);
            
            if (exists.rows.length === 0) {
                const type = column === 'reset_expires' ? 'TIMESTAMP' : 'VARCHAR(255)';
                console.log(`Adding ${column} column...`);
                await client.query(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
                console.log(`✅ ${column} column added`);
            }
        }
        
        // Get all users
        const users = await client.query('SELECT id, email, password_hash FROM users');
        
        if (users.rows.length > 0) {
            console.log(`\n📊 Found ${users.rows.length} users to check...`);
            
            for (const user of users.rows) {
                // Check if password needs to be rehashed
                if (!user.password_hash) {
                    console.log(`\n⚠️  User ${user.email} has no password hash`);
                } else if (!user.password_hash.startsWith('$2b$')) {
                    console.log(`\n⚠️  User ${user.email} has old password format`);
                    console.log('   Setting default password for development: Password@123');
                    
                    const hashedPassword = await bcrypt.hash('Password@123', 10);
                    
                    await client.query(
                        'UPDATE users SET password_hash = $1 WHERE id = $2',
                        [hashedPassword, user.id]
                    );
                    
                    console.log(`   ✅ Updated password for ${user.email}`);
                } else {
                    console.log(`✓ User ${user.email} has correct password format`);
                }
            }
        } else {
            console.log('\n📊 No users found in database');
            console.log('Creating default users...');
            
            const defaultUsers = [
                { email: 'admin@erplite.com', username: 'admin', role: 'admin', password: 'Password@123' },
                { email: 'manager@erplite.com', username: 'manager', role: 'inventory_manager', password: 'Password@123' },
                { email: 'staff@erplite.com', username: 'staff', role: 'sales_staff', password: 'Password@123' }
            ];
            
            for (const user of defaultUsers) {
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await client.query(
                    `INSERT INTO users (email, username, password_hash, role, is_active, created_at, updated_at) 
                     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                    [user.email, user.username, hashedPassword, user.role, true]
                );
                console.log(`  ✅ Created user: ${user.email}`);
            }
        }
        
        console.log('\n✅ Auth schema fix completed successfully!');
        console.log('\n🔑 Test credentials:');
        console.log('  admin@erplite.com / Password@123');
        console.log('  manager@erplite.com / Password@123');
        console.log('  staff@erplite.com / Password@123');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.message.includes('password')) {
            console.error('\n🔧 Database password issue!');
            console.error('Make sure:');
            console.error('1. PostgreSQL is running');
            console.error('2. The password in .env is correct');
            console.error('3. You can connect with: psql -U postgres -d erp_lite');
        }
    } finally {
        client.release();
        await pool.end();
    }
}

fixAuthSchema().catch(console.error);