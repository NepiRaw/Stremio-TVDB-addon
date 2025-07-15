const { getManifest } = require('../utils/manifest');

/**
 * Handle manifest.json requests with optional language parameter
 */
async function manifestHandler(req, res) {
    try {
        // Extract language from URL parameter (e.g., /es-ES/manifest.json)
        const language = req.params.language || 'en-US';
        
        const manifest = getManifest(language);
        res.json(manifest);
    } catch (error) {
        console.error('Error serving manifest:', error);
        res.status(500).json({ error: 'Failed to generate manifest' });
    }
}

module.exports = manifestHandler;
