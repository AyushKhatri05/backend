// backend/scripts/update-auth-schema.js
const { pool } = require('../src/utils/database');
const bcrypt = require('bcrypt');

async function updateAuthSchema() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Check if salt column exists and remove it
        const saltColumnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'salt'
        `);
        
        if (saltColumnExists.rows.length > 0) {
            console.log('Removing salt column from users table...');
            await client.query('ALTER TABLE users DROP COLUMN salt');
        }
        
        // Add password reset columns if they don't exist
        const resetTokenExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'reset_token'
        `);
        
        if (resetTokenExists.rows.length === 0) {
            console.log('Adding reset_token column...');
            await client.query('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255)');
        }
        
        const resetExpiresExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'reset_expires'
        `);
        
        if (resetExpiresExists.rows.length === 0) {
            console.log('Adding reset_expires column...');
            await client.query('ALTER TABLE users ADD COLUMN reset_expires TIMESTAMP');
        }
        
        // Update any existing users to have properly hashed passwords
        // This is just for development - in production you'd want to handle this differently
        if (process.env.NODE_ENV === 'development') {
            console.log('Updating existing user passwords for development...');
            
            const users = await client.query('SELECT id, email, password_hash FROM users');
            
            for (const user of users.rows) {
                // Check if password needs to be rehashed (if it doesn't start with bcrypt prefix)
                if (user.password_hash && !user.password_hash.startsWith('$2b$')) {
                    console.log(`Fixing password for user: ${user.email}`);
                    
                    // For development, set a default password
                    const defaultPassword = 'Password@123';
                    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
                    
                    await client.query(
                        'UPDATE users SET password_hash = $1 WHERE id = $2',
                        [hashedPassword, user.id]
                    );
                    
                    console.log(`Updated password for ${user.email} to default: ${defaultPassword}`);
                }
            }
        }
        
        await client.query('COMMIT');
        console.log('Auth schema updated successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating auth schema:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

updateAuthSchema();