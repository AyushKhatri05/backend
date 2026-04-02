// backend/fix-account.js
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

async function fixAccount() {
    try {
        console.log('🔧 FIXING ACCOUNT ISSUES\n');
        
        const password = 'Password@123';
        
        // Generate a new proper hash
        console.log('1. Generating new password hash...');
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('   New hash:', hashedPassword);
        
        // Verify the new hash works
        const testVerify = await bcrypt.compare(password, hashedPassword);
        console.log('   New hash verification:', testVerify ? '✅' : '❌');
        
        if (!testVerify) {
            console.log('❌ Hash generation failed!');
            return;
        }
        
        // Update all users with issues
        console.log('\n2. Updating users...');
        
        // First, unlock all accounts and reset failed attempts
        const unlockResult = await pool.query(
            `UPDATE users 
             SET locked_until = NULL, 
                 failed_attempts = 0 
             WHERE locked_until IS NOT NULL 
             RETURNING email`
        );
        
        console.log(`   Unlocked ${unlockResult.rowCount} locked accounts`);
        
        // Update admin password
        const adminResult = await pool.query(
            `UPDATE users 
             SET password_hash = $1,
                 failed_attempts = 0,
                 locked_until = NULL
             WHERE email = $2 
             RETURNING id, email, role`,
            [hashedPassword, 'admin@erplite.com']
        );
        
        if (adminResult.rows.length > 0) {
            console.log(`   ✅ Updated password for admin@erplite.com`);
            
            // Verify the new password works
            const verifyNew = await bcrypt.compare(password, hashedPassword);
            console.log(`   Password verification: ${verifyNew ? '✅' : '❌'}`);
        }
        
        // Update manager password
        const managerResult = await pool.query(
            `UPDATE users 
             SET password_hash = $1,
                 failed_attempts = 0,
                 locked_until = NULL
             WHERE email = $2 
             RETURNING id, email, role`,
            [hashedPassword, 'manager@erplite.com']
        );
        
        if (managerResult.rows.length > 0) {
            console.log(`   ✅ Updated password for manager@erplite.com`);
        }
        
        // Update staff password
        const staffResult = await pool.query(
            `UPDATE users 
             SET password_hash = $1,
                 failed_attempts = 0,
                 locked_until = NULL
             WHERE email = $2 
             RETURNING id, email, role`,
            [hashedPassword, 'staff@erplite.com']
        );
        
        if (staffResult.rows.length > 0) {
            console.log(`   ✅ Updated password for staff@erplite.com`);
        }
        
        // Verify all users
        console.log('\n3. Verifying all users:');
        const users = await pool.query(
            'SELECT email, role, is_active, failed_attempts, locked_until FROM users'
        );
        
        for (const user of users.rows) {
            console.log(`\n   ${user.email}:`);
            console.log(`      Role: ${user.role}`);
            console.log(`      Active: ${user.is_active}`);
            console.log(`      Failed Attempts: ${user.failed_attempts}`);
            console.log(`      Locked: ${user.locked_until ? 'Yes' : 'No'}`);
            
            // Test login for admin
            if (user.email === 'admin@erplite.com') {
                const userRecord = await pool.query('SELECT password_hash FROM users WHERE email = $1', [user.email]);
                const testLogin = await bcrypt.compare(password, userRecord.rows[0].password_hash);
                console.log(`      Login test with "${password}": ${testLogin ? '✅' : '❌'}`);
            }
        }
        
        console.log('\n✅ All fixes applied!');
        console.log('\n🔑 All users now have password:', password);
        console.log('\nTry logging in now with:');
        console.log('   Email: admin@erplite.com');
        console.log('   Password: Password@123');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

fixAccount();