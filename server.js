require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const manifestHandler = require('./src/handlers/manifestHandler');
const catalogHandler = require('./src/handlers/catalogHandler');
const metaHandler = require('./src/handlers/metaHandler');
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

logEnvVar('TVDB_API_KEY', process.env.TVDB_API_KEY, { required: true, sensitive: true });
logEnvVar('OMDB_API_KEY', process.env.OMDB_API_KEY, { fallback: 'Cinemeta only' });
logEnvVar('ADMIN_API_KEY', process.env.ADMIN_API_KEY, { sensitive: true });
logEnvVar('PORT', process.env.PORT, { fallback: 3000 });
logEnvVar('BASE_URL', process.env.BASE_URL, { fallback: 'auto-detect from request headers' });
logEnvVar('MONGODB_URI', process.env.MONGODB_URI);

// Initialize catalog configuration and log status
const catalogConfig = require('./src/config/catalogConfig');
catalogConfig.logStatus(logger);

CacheFactory.displayCacheInfo();
const cacheService = CacheFactory.createCache(logger);

let ratingService = null;
try {
    ratingService = new RatingService(cacheService, process.env.OMDB_API_KEY);
    logger.info(`🎬 Ratings: ${process.env.OMDB_API_KEY ? 'OMDB enabled, Cinemeta fallback' : 'Cinemeta only'}`);
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
app.use('/assets', express.static(path.join(__dirname, 'frontend', 'dist', 'assets')));
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// API routes for Vue frontend
app.get('/api/languages', (req, res) => {
    const { getLanguageOptions } = require('./src/utils/languageMap');
    res.json(getLanguageOptions());
});

app.get('/api/app-config', (req, res) => {
    const appConfig = catalogConfig.getAppConfig(req);
    res.json(appConfig);
});

// Configuration page. Clients derive these from the transport URL, so both forms must answer.
const configurePage = (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
app.get('/configure', configurePage);
app.get('/:language/configure', configurePage);

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

if (require.main === module) {
    const server = app.listen(PORT, async () => {
        const baseUrl = process.env.BASE_URL;
        const mockReq = { protocol: 'http', get: () => `localhost:${PORT}` };
        const { getBaseUrl } = require('./src/utils/urlBuilder');
        const rootUrl = baseUrl && baseUrl.trim() ? getBaseUrl(mockReq) : `http://localhost:${PORT}`;
        logger.info(`🚀 Server on port ${PORT} · ${process.env.NODE_ENV || 'development'}`);
        logger.info(`📋 Manifest: ${rootUrl}/manifest.json`);
        try {
            await tvdbService.start();
        } catch (error) {
            logger.error('❌ Failed to start TVDB service:', error.message);
        }
        logger.ready();
    });

    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully...');
        tvdbService.stop();
        server.close(() => {
            logger.info('Process terminated');
        });
    });
}

module.exports = app;
