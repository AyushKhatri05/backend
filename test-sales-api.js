// backend/test-sales-api.js
const axios = require('axios');

async function testSalesAPI() {
    try {
        console.log('🔍 Testing Sales API...\n');
        
        // First, login to get token
        console.log('1. Logging in...');
        const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'admin@erplite.com',
            password: 'Password@123'
        });
        
        const token = loginResponse.data.token;
        console.log('✅ Login successful, token received\n');
        
        // Test sales endpoint
        console.log('2. Fetching sales...');
        const salesResponse = await axios.get('http://localhost:5000/api/sales', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log('✅ Sales API responded');
        console.log('   Status:', salesResponse.status);
        console.log('   Success:', salesResponse.data.success);
        console.log('   Total sales:', salesResponse.data.pagination?.total || 'N/A');
        console.log('   Data count:', salesResponse.data.data?.length || 0);
        
        if (salesResponse.data.data && salesResponse.data.data.length > 0) {
            console.log('\n📊 First sale:');
            console.log('   Invoice:', salesResponse.data.data[0].invoice_number);
            console.log('   Amount:', salesResponse.data.data[0].total_amount);
            console.log('   Date:', salesResponse.data.data[0].created_at);
        }
        
    } catch (error) {
        console.error('❌ Error testing sales API:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        } else {
            console.error('   Message:', error.message);
        }
    }
}

testSalesAPI();