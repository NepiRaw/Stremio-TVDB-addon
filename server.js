const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const manifestHandler = require('./src/handlers/manifestHandler');
const catalogHandler = require('./src/handlers/catalogHandler');
const metaHandler = require('./src/handlers/metaHandler');
const installationPageHandler = require('./src/handlers/installationPageHandler');
const tvdbService = require('./src/services/tvdbService');
const { errorHandler } = require('./src/utils/errorHandler');
const { requestLogger } = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve static files (excluding public directory which contains templates)
app.use('/static', express.static(path.join(__dirname, 'src', 'static')));

// Routes
app.get('/', installationPageHandler);

// Language-specific routes
app.get('/:language/manifest.json', manifestHandler);
app.get('/:language/catalog/:type/:id/:extra?.json', catalogHandler);
app.get('/:language/meta/:type/:id.json', metaHandler);

// Default routes (English)
app.get('/manifest.json', manifestHandler);
app.get('/catalog/:type/:id/:extra?.json', catalogHandler);
app.get('/meta/:type/:id.json', metaHandler);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Admin authentication middleware
const adminAuth = (req, res, next) => {
    const adminKey = process.env.ADMIN_API_KEY;
    
    // If no admin key configured, disable admin endpoints
    if (!adminKey) {
        return res.status(503).json({ 
            success: false, 
            error: 'Admin endpoints disabled - ADMIN_API_KEY not configured' 
        });
    }
    
    const providedKey = req.headers['x-admin-key'] || req.query.key;
    
    if (!providedKey || providedKey !== adminKey) {
        return res.status(401).json({ 
            success: false, 
            error: 'Unauthorized - Invalid admin key' 
        });
    }
    
    next();
};

// Rate limiting for admin endpoints
const adminRateLimit = new Map();
const ADMIN_RATE_LIMIT = 10; // Max 10 requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

const rateLimitMiddleware = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!adminRateLimit.has(clientIP)) {
        adminRateLimit.set(clientIP, { count: 1, resetTime: now + RATE_WINDOW });
        return next();
    }
    
    const clientData = adminRateLimit.get(clientIP);
    
    if (now > clientData.resetTime) {
        // Reset the counter
        adminRateLimit.set(clientIP, { count: 1, resetTime: now + RATE_WINDOW });
        return next();
    }
    
    if (clientData.count >= ADMIN_RATE_LIMIT) {
        return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded - max 10 requests per minute'
        });
    }
    
    clientData.count++;
    next();
};

// Admin/Debug routes for updates service (secured)
app.get('/admin/updates/status', adminAuth, rateLimitMiddleware, (req, res) => {
    try {
        const status = tvdbService.updatesService.getStatus();
        res.json({
            success: true,
            status: status
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.post('/admin/updates/trigger', adminAuth, rateLimitMiddleware, async (req, res) => {
    try {
        await tvdbService.updatesService.triggerManualCheck();
        res.json({ 
            success: true, 
            message: 'Manual updates check triggered' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/admin/cache/stats', adminAuth, rateLimitMiddleware, (req, res) => {
    try {
        const cacheService = require('./src/services/cacheService');
        const stats = cacheService.getStats();
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, async () => {
    console.log(`🚀 TVDB Stremio Addon server running on port ${PORT}`);
    console.log(`📱 Installation page: http://localhost:${PORT}`);
    console.log(`📋 Manifest: http://localhost:${PORT}/manifest.json`);
    
    // Start TVDB service with updates monitoring
    try {
        await tvdbService.start();
    } catch (error) {
        console.error('❌ Failed to start TVDB service:', error.message);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    tvdbService.stop();
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;
