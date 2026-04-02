const { pool } = require('../utils/database');

const auditLogger = (action, entityType) => {
    return async (req, res, next) => {
        const originalJson = res.json;
        let responseBody;

        res.json = function(body) {
            responseBody = body;
            originalJson.call(this, body);
        };

        res.on('finish', async () => {
            if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
                try {
                    await pool.query(
                        'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                        [req.user.id, action || req.method, entityType || req.baseUrl.split('/').pop(), req.params.id || null,
                         req.originalOldValues ? JSON.stringify(req.originalOldValues) : null,
                         req.body ? JSON.stringify(req.body) : null, req.ip, req.get('User-Agent')]
                    );
                } catch (error) {
                    console.error('Audit log error:', error);
                }
            }
        });
        next();
    };
};

module.exports = { auditLogger };