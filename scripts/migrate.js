const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runMigrations() {
    const client = await pool.connect();
    
    try {
        console.log('Starting database migrations...');
        
        // Create migrations table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // Get list of migration files
        const migrationsDir = path.join(__dirname, '../database/migrations');
        
        // Create migrations directory if it doesn't exist
        if (!fs.existsSync(migrationsDir)) {
            fs.mkdirSync(migrationsDir, { recursive: true });
        }
        
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();
        
        console.log(`Found ${migrationFiles.length} migration files`);
        
        // Get executed migrations
        const executed = await client.query('SELECT name FROM migrations');
        const executedNames = executed.rows.map(r => r.name);
        
        // Run pending migrations
        for (const file of migrationFiles) {
            if (!executedNames.includes(file)) {
                console.log(`Running migration: ${file}`);
                
                const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
                
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
                    await client.query('COMMIT');
                    console.log(`✓ Migration ${file} completed`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(`✗ Migration ${file} failed:`, error.message);
                    throw error;
                }
            } else {
                console.log(`Skipping ${file} (already executed)`);
            }
        }
        
        console.log('All migrations completed successfully');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
