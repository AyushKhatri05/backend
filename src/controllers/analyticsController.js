const { pool } = require('../utils/database');
const analyticsService = require('../services/analyticsService');

const analyticsController = {
    getDemandForecast: async (req, res) => {
        try {
            const { productId } = req.params;
            const forecast = await analyticsService.getDemandForecast(productId, req.query);
            res.json({ success: true, data: forecast });
        } catch (error) {
            console.error('Error in getDemandForecast:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    getReorderAlerts: async (req, res) => {
        try {
            const alerts = await analyticsService.getReorderAlerts();
            res.json({ success: true, data: alerts });
        } catch (error) {
            console.error('Error in getReorderAlerts:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
        }
    },

    acknowledgeReorderAlert: async (req, res) => {
        try {
            const { id } = req.params;
            const result = await pool.query(
                'UPDATE reorder_alerts SET status = $1, acknowledged_by = $2, acknowledged_at = NOW() WHERE id = $3 RETURNING *',
                ['acknowledged', req.user.id, id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Alert not found' });
            }
            
            res.json({ success: true, message: 'Alert acknowledged', data: result.rows[0] });
        } catch (error) {
            console.error('Error in acknowledgeReorderAlert:', error);
            res.status(500).json({ success: false, message: 'Failed to acknowledge alert' });
        }
    },

    getInventoryVelocity: async (req, res) => {
        try {
            const velocity = await analyticsService.getInventoryVelocity();
            res.json({ success: true, data: velocity });
        } catch (error) {
            console.error('Error in getInventoryVelocity:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch inventory velocity' });
        }
    },

    getABCAnalysis: async (req, res) => {
        try {
            const analysis = await analyticsService.getABCAnalysis();
            res.json({ success: true, data: analysis });
        } catch (error) {
            console.error('Error in getABCAnalysis:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch ABC analysis' });
        }
    },

    getSalesTrends: async (req, res) => {
        try {
            const trends = await analyticsService.getSalesTrends(req.query.period);
            res.json({ success: true, data: trends });
        } catch (error) {
            console.error('Error in getSalesTrends:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch sales trends' });
        }
    },

    getDashboardKPIs: async (req, res) => {
        try {
            const kpis = await analyticsService.getDashboardKPIs();
            res.json({ success: true, data: kpis });
        } catch (error) {
            console.error('Error in getDashboardKPIs:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch KPIs' });
        }
    },

    getDashboardCharts: async (req, res) => {
        try {
            const charts = await analyticsService.getDashboardCharts();
            res.json({ success: true, data: charts });
        } catch (error) {
            console.error('Error in getDashboardCharts:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch charts' });
        }
    }
};

module.exports = analyticsController;