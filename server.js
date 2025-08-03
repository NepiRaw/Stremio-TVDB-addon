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
const { requestLogger, logger } = require('./src/utils/logger');
const CacheFactory = require('./src/services/cache/cacheFactory');


// =====================
// ENVIRONMENT CHECKS
// =====================
function logEnvVar(name, value, opts = {}) {
    if (value === undefined || value === null || value === "") {
        if (opts.required) {
            logger.error(`❌ Required environment variable ${name} is missing!`);
        } else if (opts.fallback) {
            logger.warn(`⚠️  ${name} not set. Using fallback: ${opts.fallback}`);
        } else {
            logger.info(`ℹ️  Optional environment variable ${name} not set.`);
        }
    } else {
        if (name === 'OMDB_API_KEY') {
            logger.info(`🔑 OMDB_API_KEY is set [hidden]`);
        } else if (name === 'MONGODB_URI') {
            const uri = value;
            const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@(.+)$/);
            if (match) {
                const safeUri = `${match[1]}[hidden]:[hidden]@${match[4]}`;
                logger.info(`🔧 MONGODB_URI = ${safeUri}`);
            } else {
                logger.info(`🔧 MONGODB_URI = [hidden or invalid format]`);
            }
        } else if (opts.sensitive) {
            logger.info(`🔑 ${name} is set [hidden]`);
        } else {
            logger.info(`🔧 ${name} = ${value}`);
        }
    }
}

// TVDB_API_KEY (required)
logEnvVar('TVDB_API_KEY', process.env.TVDB_API_KEY, { required: true, sensitive: true });
// OMDB_API_KEY (optional, always hidden)
logEnvVar('OMDB_API_KEY', process.env.OMDB_API_KEY, { fallback: 'imdbapi.dev fallback' });
// BASE_URL (optional)
logEnvVar('BASE_URL', process.env.BASE_URL, { fallback: 'auto-detect from request headers' });
// PORT (optional, default 3000)
logEnvVar('PORT', process.env.PORT, { fallback: 3000 });
// ADMIN_API_KEY (optional, but disables admin endpoints if missing)
logEnvVar('ADMIN_API_KEY', process.env.ADMIN_API_KEY, { sensitive: true });
// MONGODB_URI (optional, but required for hybrid/mongodb cache, always hide credentials)
logEnvVar('MONGODB_URI', process.env.MONGODB_URI);
// CACHE_TYPE (optional, default memory)
logEnvVar('CACHE_TYPE', process.env.CACHE_TYPE, { fallback: 'memory' });

// Initialize catalog configuration and log status
const catalogConfig = require('./src/config/catalogConfig');
catalogConfig.logStatus(logger);

CacheFactory.displayCacheInfo();
const cacheService = CacheFactory.createCache(logger);

let ratingService = null;
try {
    ratingService = new RatingService(cacheService, process.env.OMDB_API_KEY);
    if (process.env.OMDB_API_KEY) {
        logger.info('🎬 Rating service initialized with OMDB API - IMDb ratings will be enhanced');
    } else {
        logger.info('🎬 Rating service initialized with imdbapi.dev fallback - IMDb ratings will be enhanced');
    }
} catch (error) {
    logger.error('❌ Failed to initialize Rating service:', error.message);
}

const tvdbService = new TVDBService(cacheService, ratingService, logger);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.use('/static', express.static(path.join(__dirname, 'src', 'static')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// API routes for Vue frontend
app.get('/api/languages', (req, res) => {
    const { getLanguageOptions } = require('./src/utils/languageMap');
    res.json(getLanguageOptions());
});

app.get('/api/catalog-defaults', (req, res) => {
    const defaults = catalogConfig.getDefaultToggles();
    res.json(defaults);
});

app.get('/api/app-config', (req, res) => {
    const appConfig = catalogConfig.getAppConfig(req);
    res.json(appConfig);
});

app.get('/api/config', (req, res) => {
    const isTmdbConfigured = !!(process.env.TMDB_API_KEY && process.env.TMDB_API_KEY.trim() !== '');
    
    const userConfig = {
        language: req.query.language || 'eng',
        isTmdbConfigured: isTmdbConfigured,
        enabledCatalogs: {
            movies: ['tmdb-popular', 'tmdb-trending'],
            series: ['tvdb-popular', 'tvdb-trending'],
            anime: ['kitsu-trending', 'kitsu-popular']
        },
        preferences: {
            showAdultContent: false,
            preferredRegion: 'US',
            maxResults: 20
        }
    };
    res.json(userConfig);
});

app.post('/api/config', express.json(), (req, res) => {
    res.json({ success: true, message: 'Configuration saved successfully' });
});

// Routes
app.get('/', (req, res) => installationPageHandler(req, res, logger));

// Language-specific routes
app.get('/:language/manifest.json', (req, res) => manifestHandler(req, res, logger));
app.get('/:language/catalog/:type/:id/:extra?.json', (req, res) => catalogHandler(req, res, tvdbService, logger));
app.get('/:language/catalog/:type/:id.json', (req, res) => catalogHandler(req, res, tvdbService, logger));
app.get('/:language/meta/:type/:id.json', (req, res) => metaHandler(req, res, tvdbService, logger));

// Default routes (English)
app.get('/manifest.json', (req, res) => manifestHandler(req, res, logger));
app.get('/catalog/:type/:id/:extra?.json', (req, res) => catalogHandler(req, res, tvdbService, logger));
app.get('/catalog/:type/:id.json', (req, res) => catalogHandler(req, res, tvdbService, logger));
app.get('/meta/:type/:id.json', (req, res) => metaHandler(req, res, tvdbService, logger));

app.get('/health', async (req, res) => {
    try {
        const startTime = Date.now();
        
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: require('./package.json').version
        };
        
        try {
            await tvdbService.ensureValidToken();
            health.tvdb = { status: 'connected', hasValidToken: true };
        } catch (error) {
            health.tvdb = { status: 'error', error: error.message };
            health.status = 'degraded';
        }
        
        try {
            const cacheStats = await cacheService.getStats();
            health.cache = { 
                status: 'ok', 
                type: cacheStats.type || 'unknown',
                totalEntries: cacheStats.totalEntries || 0
            };
        } catch (error) {
            health.cache = { status: 'error', error: error.message };
            health.status = 'degraded';
        }
        
        health.responseTime = `${Date.now() - startTime}ms`;
        
        const statusCode = health.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(health);
        
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

const adminAuth = (req, res, next) => {
    const adminKey = process.env.ADMIN_API_KEY;
    
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

app.use(errorHandler);

app.use('*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, async () => {
    logger.info(`🚀 TVDB Stremio Addon server running on port ${PORT}`);
    const baseUrl = process.env.BASE_URL;
    if (baseUrl && baseUrl.trim()) {
        const mockReq = { protocol: 'http', get: () => `localhost:${PORT}` };
        const { getBaseUrl } = require('./src/utils/urlBuilder');
        const actualBaseUrl = getBaseUrl(mockReq);
        logger.info(`📱 Installation page: ${actualBaseUrl}/`);
        logger.info(`📋 Manifest: ${actualBaseUrl}/manifest.json`);
        logger.info(`🌐 Production deployment detected`);
    } else {
        logger.info(`📱 Installation page: http://localhost:${PORT}`);
        logger.info(`📋 Manifest: http://localhost:${PORT}/manifest.json`);
        logger.info(`🔧 Development mode (auto-detect URLs from requests)`);
    }
    try {
        await tvdbService.start();
    } catch (error) {
        logger.error('❌ Failed to start TVDB service:', error.message);
    }
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    tvdbService.stop();
    server.close(() => {
        logger.info('Process terminated');
    });
});

module.exports = app;
