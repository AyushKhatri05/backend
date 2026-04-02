const xss = require('xss');

const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return xss(input.trim());
    } else if (Array.isArray(input)) {
        return input.map(item => sanitizeInput(item));
    } else if (typeof input === 'object' && input !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(input)) {
            sanitized[key] = sanitizeInput(value);
        }
        return sanitized;
    }
    return input;
};

const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
};

const validatePhone = (phone) => {
    const re = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    return re.test(phone);
};

module.exports = { sanitizeInput, validateEmail, validatePhone };