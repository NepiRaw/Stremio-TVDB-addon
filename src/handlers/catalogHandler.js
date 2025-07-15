const tvdbService = require('../services/tvdbService');

/**
 * Handle catalog requests - provides search-based catalog results
 * Route: /catalog/:type/:id/:extra?.json
 */
async function catalogHandler(req, res) {
    try {
        const { type, id, extra } = req.params;
        
        // Parse extra parameters
        let extraParams = {};
        if (extra) {
            const decodedExtra = decodeURIComponent(extra);
            extraParams = parseExtraParams(decodedExtra);
        }

        // Validate type
        if (!['movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }

        // Validate catalog ID
        const validCatalogIds = ['tvdb-movies', 'tvdb-series'];
        if (!validCatalogIds.includes(id)) {
            return res.status(400).json({ error: 'Invalid catalog ID' });
        }

        // Search is required for our catalogs
        if (!extraParams.search || extraParams.search.trim() === '') {
            return res.json({ metas: [] });
        }

        console.log(`🔍 Searching ${type} for: "${extraParams.search}"`);

        // Search TVDB
        const searchResults = await tvdbService.search(extraParams.search, type);
        
        // Transform results to Stremio format
        const metas = tvdbService.transformSearchResults(searchResults, type);
        
        console.log(`📊 Found ${metas.length} results for "${extraParams.search}"`);

        res.json({ metas });

    } catch (error) {
        console.error('Catalog handler error:', error);
        // Return empty results on error to avoid breaking Stremio
        res.json({ metas: [] });
    }
}

/**
 * Parse extra parameters from URL
 */
function parseExtraParams(extra) {
    const params = {};
    
    try {
        // Handle both URL-encoded and JSON formats
        if (extra.startsWith('{')) {
            // JSON format
            return JSON.parse(extra);
        } else {
            // URL parameter format: search=query&skip=0
            const pairs = extra.split('&');
            for (const pair of pairs) {
                const [key, value] = pair.split('=');
                if (key && value !== undefined) {
                    params[key] = decodeURIComponent(value);
                }
            }
        }
    } catch (error) {
        console.error('Error parsing extra params:', error);
    }
    
    return params;
}

module.exports = catalogHandler;
