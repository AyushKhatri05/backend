// backend/check-schema.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'erp_lite',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
});

async function checkSchema() {
    try {
        console.log('🔍 Checking database schema...\n');
        
        // Check products table columns
        const productsColumns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'products'
            ORDER BY ordinal_position;
        `);
        
        console.log('📦 Products table columns:');
        if (productsColumns.rows.length === 0) {
            console.log('   Products table does not exist!');
        } else {
            productsColumns.rows.forEach(col => {
                console.log(`   - ${col.column_name} (${col.data_type})`);
            });
        }
        
        // Check sales table columns
        const salesColumns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'sales'
            ORDER BY ordinal_position;
        `);
        
        console.log('\n💰 Sales table columns:');
        if (salesColumns.rows.length === 0) {
            console.log('   Sales table does not exist!');
        } else {
            salesColumns.rows.forEach(col => {
                console.log(`   - ${col.column_name} (${col.data_type})`);
            });
        }
        
        // Check users table columns
        const usersColumns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
            ORDER BY ordinal_position;
        `);
        
        console.log('\n👥 Users table columns:');
        if (usersColumns.rows.length === 0) {
            console.log('   Users table does not exist!');
        } else {
            usersColumns.rows.forEach(col => {
                console.log(`   - ${col.column_name} (${col.data_type})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkSchema();