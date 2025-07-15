const { getManifest } = require('../utils/manifest');

/**
 * Handle manifest.json requests
 */
async function manifestHandler(req, res) {
    try {
        const manifest = getManifest();
        res.json(manifest);
    } catch (error) {
        console.error('Error serving manifest:', error);
        res.status(500).json({ error: 'Failed to generate manifest' });
    }
}

module.exports = manifestHandler;
