// backend/debug-login.js
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

async function debugLogin() {
    console.log('🔍 DEBUGGING LOGIN ISSUE\n');
    
    const testEmail = 'admin@erplite.com';
    const testPassword = 'Password@123';
    
    try {
        // 1. Check if user exists
        console.log('1. Checking if user exists...');
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [testEmail]);
        
        if (userResult.rows.length === 0) {
            console.log('❌ User not found in database!');
            console.log('\nCreating test user...');
            
            // Create test user
            const hashedPassword = await bcrypt.hash(testPassword, 10);
            await pool.query(
                `INSERT INTO users (email, username, password_hash, role, is_active, created_at) 
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [testEmail, 'admin', hashedPassword, 'admin', true]
            );
            console.log('✅ Test user created');
            
            // Fetch the newly created user
            const newUser = await pool.query('SELECT * FROM users WHERE email = $1', [testEmail]);
            const user = newUser.rows[0];
            
            console.log('\n2. User details from database:');
            console.log('   ID:', user.id);
            console.log('   Email:', user.email);
            console.log('   Username:', user.username);
            console.log('   Role:', user.role);
            console.log('   Password Hash:', user.password_hash.substring(0, 30) + '...');
            
            // 3. Test password comparison
            console.log('\n3. Testing password comparison...');
            const isValid = await bcrypt.compare(testPassword, user.password_hash);
            console.log('   bcrypt.compare result:', isValid);
            
            if (isValid) {
                console.log('✅ Password is correct!');
            } else {
                console.log('❌ Password is incorrect!');
                
                // Try different password variations
                console.log('\n4. Testing password variations...');
                const variations = [
                    testPassword,
                    testPassword.toLowerCase(),
                    testPassword.toUpperCase(),
                    'password@123',
                    'admin123'
                ];
                
                for (const pwd of variations) {
                    const result = await bcrypt.compare(pwd, user.password_hash);
                    console.log(`   Testing "${pwd}": ${result ? '✅' : '❌'}`);
                }
            }
        } else {
            const user = userResult.rows[0];
            
            console.log('2. User found in database:');
            console.log('   ID:', user.id);
            console.log('   Email:', user.email);
            console.log('   Username:', user.username);
            console.log('   Role:', user.role);
            console.log('   Is Active:', user.is_active);
            console.log('   Locked Until:', user.locked_until);
            console.log('   Failed Attempts:', user.failed_attempts);
            console.log('   Password Hash:', user.password_hash ? user.password_hash.substring(0, 30) + '...' : '❌ No hash');
            
            // 3. Check if account is locked
            if (user.locked_until && new Date(user.locked_until) > new Date()) {
                console.log('\n⚠️  Account is locked until:', user.locked_until);
            }
            
            // 4. Test password comparison
            console.log('\n3. Testing password comparison...');
            console.log('   Input password:', testPassword);
            console.log('   Hash format valid:', user.password_hash.startsWith('$2b$'));
            
            const isValid = await bcrypt.compare(testPassword, user.password_hash);
            console.log('   bcrypt.compare result:', isValid);
            
            if (isValid) {
                console.log('✅ Password is correct!');
            } else {
                console.log('❌ Password is incorrect!');
                
                // Let's see what the hash looks like
                console.log('\n4. Hash details:');
                console.log('   Full hash:', user.password_hash);
                
                // Test by hashing the password again
                console.log('\n5. Generating new hash for same password:');
                const newHash = await bcrypt.hash(testPassword, 10);
                console.log('   New hash:', newHash);
                
                // Compare new hash with stored hash
                console.log('\n6. Comparing new hash with stored hash:');
                console.log('   They are', newHash === user.password_hash ? 'the same' : 'different');
                
                // Try to verify with new hash
                const verifyWithNew = await bcrypt.compare(testPassword, newHash);
                console.log('   Verification with new hash:', verifyWithNew);
            }
        }
        
        // 5. List all users in database
        console.log('\n📋 All users in database:');
        const allUsers = await pool.query('SELECT id, email, role, is_active FROM users');
        allUsers.rows.forEach(u => {
            console.log(`   - ${u.email} (${u.role}) [${u.is_active ? 'active' : 'inactive'}]`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

debugLogin();