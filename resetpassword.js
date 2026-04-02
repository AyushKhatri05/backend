require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASSWORD),
});

async function resetPassword() {
    const newPassword = 'Password123!';
    const hash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
        `UPDATE users 
         SET password_hash = $1, 
             failed_attempts = 0, 
             locked_until = NULL,
             is_active = true
         WHERE email = 'admin@erplite.com'`,
        [hash]
    );
    
    console.log('Password reset successful!');
    console.log('Email:    admin@erplite.com');
    console.log('Password: Password123!');
    pool.end();
}

resetPassword();