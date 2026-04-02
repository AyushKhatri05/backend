const { validationResult } = require('express-validator');
const { sanitizeInput } = require('../utils/validators');

const validateRequest = (validations) => {
    return async (req, res, next) => {
        req.body = sanitizeInput(req.body);
        req.query = sanitizeInput(req.query);
        req.params = sanitizeInput(req.params);

        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (errors.isEmpty()) return next();

        const extractedErrors = errors.array().map(err => ({ field: err.param, message: err.msg }));
        return res.status(400).json({ success: false, errors: extractedErrors });
    };
};

module.exports = { validateRequest };