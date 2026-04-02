// backend/test-login.js
const bcrypt = require('bcrypt');

async function testLogin() {
    const password = 'Password@123';
    
    // Test 1: Hash a password
    console.log('Test 1: Hashing password...');
    const hash = await bcrypt.hash(password, 10);
    console.log('Generated hash:', hash);
    console.log('Hash format valid:', hash.startsWith('$2b$'));
    
    // Test 2: Verify correct password
    console.log('\nTest 2: Verifying correct password...');
    const isValid = await bcrypt.compare(password, hash);
    console.log('Password valid:', isValid);
    
    // Test 3: Verify wrong password
    console.log('\nTest 3: Verifying wrong password...');
    const isWrongValid = await bcrypt.compare('wrongpassword', hash);
    console.log('Wrong password valid:', isWrongValid);
    
    // Test 4: Compare with stored hash from seed
    console.log('\nTest 4: Testing with stored hash format...');
    const storedHash = await bcrypt.hash(password, 10);
    const isStoredValid = await bcrypt.compare(password, storedHash);
    console.log('Stored hash valid:', isStoredValid);
    
    // Test 5: Multiple hashes of same password
    console.log('\nTest 5: Multiple hashes of same password...');
    const hash1 = await bcrypt.hash(password, 10);
    const hash2 = await bcrypt.hash(password, 10);
    console.log('Hash 1:', hash1);
    console.log('Hash 2:', hash2);
    console.log('Hashes are different:', hash1 !== hash2);
    
    const compare1 = await bcrypt.compare(password, hash1);
    const compare2 = await bcrypt.compare(password, hash2);
    console.log('Both verify correctly:', compare1 && compare2);
}

testLogin().catch(console.error);