const rolePermissions = {
    admin: {
        dashboard: ['view'],
        users: ['create', 'read', 'update', 'delete'],
        products: ['create', 'read', 'update', 'delete'],
        inventory: ['create', 'read', 'update', 'delete', 'adjust'],
        sales: ['create', 'read', 'update', 'delete', 'refund'],
        analytics: ['view', 'export'],
        audit: ['view', 'export'],
        settings: ['view', 'update']
    },
    inventory_manager: {
        dashboard: ['view'],
        products: ['create', 'read', 'update'],
        inventory: ['create', 'read', 'update', 'adjust'],
        sales: ['read'],
        analytics: ['view'],
        reorder_alerts: ['view', 'acknowledge']
    },
    sales_staff: {
        dashboard: ['view'],
        products: ['read'],
        inventory: ['read'],
        sales: ['create', 'read'],
        customers: ['create', 'read', 'update'],
        invoices: ['create', 'read', 'print']
    }
};

const rbacMiddleware = (requiredResource, requiredAction) => {
    return (req, res, next) => {
        try {
            const user = req.user;
            if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });

            const { role } = user;
            if (!rolePermissions[role]) return res.status(403).json({ success: false, message: 'Invalid role' });
            if (!rolePermissions[role][requiredResource]) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Access denied: ${role} cannot access ${requiredResource}` 
                });
            }

            const allowedActions = rolePermissions[role][requiredResource];
            if (!allowedActions.includes(requiredAction) && !allowedActions.includes('*')) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Access denied: ${role} cannot ${requiredAction} on ${requiredResource}` 
                });
            }

            next();
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    };
};

// Add rbacGuard as an alias for rbacMiddleware
const rbacGuard = rbacMiddleware;

// Add checkPermission function
const checkPermission = (user, resource, action) => {
    if (!user || !user.role) return false;
    const permissions = rolePermissions[user.role];
    if (!permissions || !permissions[resource]) return false;
    return permissions[resource].includes(action) || permissions[resource].includes('*');
};

module.exports = { 
    rbacMiddleware, 
    rbacGuard, 
    checkPermission,
    rolePermissions 
};