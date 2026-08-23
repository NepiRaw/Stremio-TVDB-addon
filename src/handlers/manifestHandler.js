const { getManifest } = require('../utils/manifest');

async function manifestHandler(req, res, logger = null) {
    try {
        const manifest = getManifest(req.params.language, req);
        res.json(manifest);
    } catch (error) {
        logger?.error('Error serving manifest:', error);
        res.status(500).json({ error: 'Failed to generate manifest' });
    }
}

module.exports = manifestHandler;
