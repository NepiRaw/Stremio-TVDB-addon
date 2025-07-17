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

// Admin/Debug routes for updates service
app.get('/admin/updates/status', (req, res) => {
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

app.post('/admin/updates/trigger', async (req, res) => {
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

app.get('/admin/cache/stats', (req, res) => {
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
