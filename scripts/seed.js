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

async function seed() {
    const client = await pool.connect();
    
    try {
        console.log('Starting database seeding...');
        
        const seedsDir = path.join(__dirname, '../database/seeds');
        
        // Create seeds directory if it doesn't exist
        if (!fs.existsSync(seedsDir)) {
            fs.mkdirSync(seedsDir, { recursive: true });
        }
        
        const seedFiles = fs.readdirSync(seedsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();
        
        for (const file of seedFiles) {
            console.log(`Running seed: ${file}`);
            const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
            await client.query(sql);
        }
        
        console.log('Seeding completed successfully');
        
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();