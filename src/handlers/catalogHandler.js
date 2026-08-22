const { context } = require('../utils/logger');

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
const CACHED = 'from cache';

function describeCalls() {
    const calls = context.current()?.calls ?? 0;
    if (calls === 0) return CACHED;
    return `${calls} call${calls === 1 ? '' : 's'}`;
}

async function catalogHandler(req, res, tvdbService, rootLogger = null) {
    const logger = rootLogger?.child ? rootLogger.child('SEARCH') : rootLogger;
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
        context.begin({ category: 'SEARCH', subject: `${type} "${extraParams.search}" ${userLanguage}` });

        const searchResults = await tvdbService.search(extraParams.search, type, 20, userLanguage);
        const metas = await tvdbService.transformSearchResults(searchResults, type, userLanguage);

        const via = describeCalls();
        context.note({
            marker: metas.length ? (via === CACHED ? 'cache' : 'ok') : 'empty',
            outcome: metas.length ? `${metas.length} results · ${via}` : `no results · ${via}`
        });
        res.json({ metas });
    } catch (error) {
        context.note({ outcome: `failed → ${error.message}`, marker: 'error' });
        logger?.error(`catalog failed after ${Date.now() - startTime}ms → ${error.message}`);
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
