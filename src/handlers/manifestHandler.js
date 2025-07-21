const { getManifest } = require('../utils/manifest');

/**
 * Handle manifest.json requests with optional TVDB language parameter
 */
async function manifestHandler(req, res, catalogService) {
    try {
        // Extract TVDB language code from URL parameter (e.g., /fra/manifest.json)
        const tvdbLanguage = req.params.language || 'eng';
        
        // Extract configuration from query parameters
        const configString = req.query.config;
        
        const manifest = getManifest(tvdbLanguage, req, catalogService, configString);
        res.json(manifest);
    } catch (error) {
        console.error('Error serving manifest:', error);
        res.status(500).json({ error: 'Failed to generate manifest' });
    }
}

module.exports = manifestHandler;
