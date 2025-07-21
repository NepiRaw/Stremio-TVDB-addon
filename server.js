// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const manifestHandler = require('./src/handlers/manifestHandler');
const catalogHandler = require('./src/handlers/catalogHandler');
const metaHandler = require('./src/handlers/metaHandler');
const installationPageHandler = require('./src/handlers/installationPageHandler');
const TVDBService = require('./src/services/tvdbService');
const RatingService = require('./src/services/ratingService');
const { errorHandler } = require('./src/utils/errorHandler');
const { requestLogger } = require('./src/utils/logger');
const CacheFactory = require('./src/services/cache/cacheFactory');

// Initialize cache system
CacheFactory.displayCacheInfo();
const cacheService = CacheFactory.createCache();

// Initialize Rating service (OMDB + imdbapi.dev fallback)
let ratingService = null;
try {
    ratingService = new RatingService(cacheService, process.env.OMDB_API_KEY);
    if (process.env.OMDB_API_KEY) {
        console.log('🎬 Rating service initialized with OMDB API - IMDb ratings will be enhanced');
    } else {
        console.log('🎬 Rating service initialized with imdbapi.dev fallback - IMDb ratings will be enhanced');
    }
} catch (error) {
    console.error('❌ Failed to initialize Rating service:', error.message);
}

// Create TVDB service instance with cache service and optional rating service
const tvdbService = new TVDBService(cacheService, ratingService);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve built Vue frontend at root
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve static files (excluding public directory which contains templates)
app.use('/static', express.static(path.join(__dirname, 'src', 'static')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Language-specific routes
app.get('/:language/manifest.json', manifestHandler);
app.get('/:language/catalog/:type/:id/:extra?.json', (req, res) => catalogHandler(req, res, tvdbService));
app.get('/:language/catalog/:type/:id.json', (req, res) => catalogHandler(req, res, tvdbService)); // Query parameter support
app.get('/:language/meta/:type/:id.json', (req, res) => metaHandler(req, res, tvdbService));

// Default routes (English)
app.get('/manifest.json', manifestHandler);
app.get('/catalog/:type/:id/:extra?.json', (req, res) => catalogHandler(req, res, tvdbService));
app.get('/catalog/:type/:id.json', (req, res) => catalogHandler(req, res, tvdbService)); // Query parameter support
app.get('/meta/:type/:id.json', (req, res) => metaHandler(req, res, tvdbService));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API endpoint to expose server configuration to the frontend
app.get('/api/config', (req, res) => {
    res.json({
        isTmdbConfigured: !!process.env.TMDB_API_KEY
    });
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

app.get('/admin/cache/stats', adminAuth, rateLimitMiddleware, async (req, res) => {
    try {
        const stats = await cacheService.getStats();
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
    
    // Show deployment information
    const baseUrl = process.env.BASE_URL;
    if (baseUrl && baseUrl.trim()) {
        // Use the actual URL builder logic to get correct URL with port
        const mockReq = { protocol: 'http', get: () => `localhost:${PORT}` };
        const { getBaseUrl } = require('./src/utils/urlBuilder');
        const actualBaseUrl = getBaseUrl(mockReq);
        
        console.log(`📱 Installation page: ${actualBaseUrl}/`);
        console.log(`📋 Manifest: ${actualBaseUrl}/manifest.json`);
        console.log(`🌐 Production deployment detected`);
    } else {
        console.log(`📱 Installation page: http://localhost:${PORT}`);
        console.log(`📋 Manifest: http://localhost:${PORT}/manifest.json`);
        console.log(`🔧 Development mode (auto-detect URLs from requests)`);
    }
    
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
