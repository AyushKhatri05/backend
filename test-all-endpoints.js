// backend/test-all-endpoints.js
const axios = require('axios');

async function testEndpoints() {
    const baseURL = 'http://localhost:5000/api';
    
    console.log('🔍 Testing all sales endpoints...\n');
    
    try {
        // Login first
        console.log('1. Logging in...');
        const login = await axios.post(`${baseURL}/auth/login`, {
            email: 'admin@erplite.com',
            password: 'Password@123'
        });
        
        const token = login.data.token;
        console.log('✅ Login successful\n');
        
        const headers = { Authorization: `Bearer ${token}` };
        
        // Test 1: GET /sales
        console.log('2. Testing GET /sales');
        try {
            const response = await axios.get(`${baseURL}/sales`, { headers });
            console.log(`   ✅ Success - Found ${response.data.data?.length || 0} sales`);
            console.log(`   Total in database: ${response.data.pagination?.total || 0}`);
        } catch (error) {
            console.log('   ❌ Failed:', error.response?.data?.message || error.message);
        }
        
        // Test 2: GET /sales/test
        console.log('\n3. Testing GET /sales/test');
        try {
            const response = await axios.get(`${baseURL}/sales/test`, { headers });
            console.log('   ✅ Success -', response.data.message);
        } catch (error) {
            console.log('   ❌ Failed:', error.response?.data?.message || error.message);
        }
        
        // Test 3: GET /sales/stats/summary
        console.log('\n4. Testing GET /sales/stats/summary');
        try {
            const response = await axios.get(`${baseURL}/sales/stats/summary`, { headers });
            console.log('   ✅ Success');
            console.log(`   Total Revenue: $${response.data.data?.overall?.total_revenue || 0}`);
        } catch (error) {
            console.log('   ❌ Failed:', error.response?.data?.message || error.message);
        }
        
        // Test 4: GET /sales/reports/daily
        console.log('\n5. Testing GET /sales/reports/daily');
        try {
            const response = await axios.get(`${baseURL}/sales/reports/daily`, { headers });
            console.log('   ✅ Success');
            console.log(`   Today's Sales: ${response.data.data?.transactions || 0}`);
        } catch (error) {
            console.log('   ❌ Failed:', error.response?.data?.message || error.message);
        }
        
    } catch (error) {
        console.error('❌ Login failed:', error.response?.data?.message || error.message);
    }
}

testEndpoints();