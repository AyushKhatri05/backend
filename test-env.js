// backend/test-env.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('🔍 Testing environment variables...\n');

console.log('Current directory:', __dirname);
console.log('.env file path:', path.join(__dirname, '.env'));

console.log('\nEnvironment variables from .env:');
console.log('  DB_USER:', process.env.DB_USER || '❌ Not set');
console.log('  DB_HOST:', process.env.DB_HOST || '❌ Not set');
console.log('  DB_NAME:', process.env.DB_NAME || '❌ Not set');
console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set' : '❌ Not set');
console.log('  DB_PORT:', process.env.DB_PORT || '❌ Not set');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Not set');

if (!process.env.DB_PASSWORD) {
    console.log('\n⚠️  DB_PASSWORD is not set!');
    console.log('\nMake sure your backend/.env file contains:');
    console.log('DB_USER=postgres');
    console.log('DB_HOST=localhost');
    console.log('DB_NAME=erp_lite');
    console.log('DB_PASSWORD=postgres');
    console.log('DB_PORT=5432');
} else {
    console.log('\n✅ Environment variables loaded successfully!');
}