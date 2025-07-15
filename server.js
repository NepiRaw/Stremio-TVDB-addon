const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const manifestHandler = require('./src/handlers/manifestHandler');
const catalogHandler = require('./src/handlers/catalogHandler');
const metaHandler = require('./src/handlers/metaHandler');
const installationPageHandler = require('./src/handlers/installationPageHandler');
const { errorHandler } = require('./src/utils/errorHandler');
const { requestLogger } = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'src', 'static')));

// Routes
app.get('/', installationPageHandler);
app.get('/manifest.json', manifestHandler);
app.get('/catalog/:type/:id/:extra?.json', catalogHandler);
app.get('/meta/:type/:id.json', metaHandler);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, () => {
    console.log(`🚀 TVDB Stremio Addon server running on port ${PORT}`);
    console.log(`📱 Installation page: http://localhost:${PORT}`);
    console.log(`📋 Manifest: http://localhost:${PORT}/manifest.json`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;
