// backend/test-db.js
const { Pool } = require('pg');
require('dotenv').config();

async function testConnection() {
    console.log('🔍 Testing database connection...\n');
    
    // Log environment variables (without showing full password)
    console.log('Environment variables:');
    console.log('  DB_USER:', process.env.DB_USER || 'postgres (default)');
    console.log('  DB_HOST:', process.env.DB_HOST || 'localhost (default)');
    console.log('  DB_NAME:', process.env.DB_NAME || 'erp_lite (default)');
    console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '****** (set)' : 'not set');
    console.log('  DB_PORT:', process.env.DB_PORT || '5432 (default)');
    
    // Create connection config
    const config = {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'erp_lite',
        password: process.env.DB_PASSWORD || 'postgres',
        port: parseInt(process.env.DB_PORT) || 5432,
    };
    
    console.log('\n📦 Connection config:', {
        ...config,
        password: config.password ? '******' : 'not set'
    });
    
    const pool = new Pool(config);
    
    try {
        // Test connection
        const client = await pool.connect();
        console.log('\n✅ Successfully connected to database!');
        
        // Test query
        const result = await client.query('SELECT NOW() as current_time');
        console.log('  Server time:', result.rows[0].current_time);
        
        // Check if users table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            );
        `);
        
        if (tableCheck.rows[0].exists) {
            console.log('  ✅ Users table exists');
            
            // Count users
            const userCount = await client.query('SELECT COUNT(*) FROM users');
            console.log(`  📊 Total users: ${userCount.rows[0].count}`);
            
            // Show users
            const users = await client.query('SELECT id, email, role, is_active FROM users LIMIT 5');
            if (users.rows.length > 0) {
                console.log('\n  👤 Sample users:');
                users.rows.forEach(user => {
                    console.log(`    - ${user.email} (${user.role})`);
                });
            }
        } else {
            console.log('  ❌ Users table does not exist');
            console.log('\n  Run the migration script to create tables:');
            console.log('  node scripts/fix-auth-schema.js');
        }
        
        client.release();
        await pool.end();
        
    } catch (error) {
        console.error('\n❌ Connection failed:');
        console.error('  Error:', error.message);
        
        if (error.message.includes('password')) {
            console.error('\n🔧 Fix: Check your database password in .env file');
            console.error('  Current password in .env:', process.env.DB_PASSWORD ? 'is set' : 'is NOT set');
            console.error('\n  Try connecting manually:');
            console.error(`  psql -U ${config.user} -h ${config.host} -p ${config.port} -d ${config.database}`);
        } else if (error.message.includes('does not exist')) {
            console.error('\n🔧 Fix: Create the database first:');
            console.error(`  createdb -U ${config.user} ${config.database}`);
        } else if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
            console.error('\n🔧 Fix: Make sure PostgreSQL is running:');
            console.error('  Windows: Check if PostgreSQL service is running');
            console.error('  Mac/Linux: Run "sudo service postgresql start"');
        } else if (error.message.includes('database')) {
            console.error('\n🔧 Fix: Database might not exist. Create it:');
            console.error(`  createdb -U ${config.user} ${config.database}`);
        }
        
        await pool.end();
        process.exit(1);
    }
}

// Run the test
testConnection().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});