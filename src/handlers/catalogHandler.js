const { logger } = require('../utils/logger');

/**
 * Extract TVDB language code from URL parameter (e.g., /fra/catalog/...)
 */
function getLanguagePreference(req) {
    if (req.params.language) {
        const urlLang = req.params.language;
        if (/^[a-z]{3}$/.test(urlLang)) {
            return urlLang;
        }
    }
    
    return 'eng';
}

/**
 * Handle catalog requests - provides search-based catalog results
 * Route: /catalog/:type/:id/:extra?.json
 */
async function catalogHandler(req, res, tvdbService, logger = null) {
    const startTime = Date.now();
    try {
        const { type, id, extra } = req.params;
        let extraParams = {};
        if (extra) {
            const decodedExtra = decodeURIComponent(extra);
            extraParams = parseExtraParams(decodedExtra, logger);
        } else {
            extraParams = req.query || {};
        }
        if (!['movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }
        const validCatalogIds = ['tvdb-movies', 'tvdb-series'];
        if (!validCatalogIds.includes(id)) {
            return res.status(400).json({ error: 'Invalid catalog ID' });
        }
        if (!extraParams.search || extraParams.search.trim() === '') {
            return res.json({ metas: [] });
        }
        const userLanguage = getLanguagePreference(req);
        logger?.debug(`🔍 Searching ${type} for: "${extraParams.search}" (language: ${userLanguage})`);
        const searchStart = Date.now();
        const searchResults = await tvdbService.search(extraParams.search, type, 20, userLanguage);
        const searchTime = Date.now() - searchStart;
        logger?.debug(`Search API call completed in ${searchTime}ms`);
        const transformStart = Date.now();
        const metas = await tvdbService.transformSearchResults(searchResults, type, userLanguage);
        const transformTime = Date.now() - transformStart;
        const totalTime = Date.now() - startTime;
        logger?.debug(`Transform completed in ${transformTime}ms (Total: ${totalTime}ms, Results: ${metas.length})`);
        res.json({ metas });
    } catch (error) {
        const totalTime = Date.now() - startTime;
        logger?.error(`Catalog handler error after ${totalTime}ms:`, error);
        res.json({ metas: [] });
    }
}

function parseExtraParams(extra, logger = null) {
    const params = {};
    try {
        if (extra.startsWith('{')) {
            return JSON.parse(extra);
        } else {
            const pairs = extra.split('&');
            for (const pair of pairs) {
                const [key, value] = pair.split('=');
                if (key && value !== undefined) {
                    params[key] = decodeURIComponent(value);
                }
            }
        }
    } catch (error) {
        logger?.error('Error parsing extra params:', error);
    }
    return params;
}

module.exports = catalogHandler;
