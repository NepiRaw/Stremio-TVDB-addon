/**
 * Extract TVDB language code from URL parameter
 * @param {object} req - Express request object  
 * @returns {string} - TVDB 3-character language code (e.g., 'fra', 'spa', 'eng')
 */
function getLanguagePreference(req) {
    // Language comes from URL parameter (e.g., /fra/catalog/...)
    if (req.params.language) {
        const urlLang = req.params.language;
        // Validate it's a 3-character TVDB language code
        if (/^[a-z]{3}$/.test(urlLang)) {
            return urlLang;
        }
    }
    
    // Default: English
    return 'eng';
}

/**
 * Handle catalog requests - provides search-based catalog results
 * Route: /catalog/:type/:id/:extra?.json
 */
async function catalogHandler(req, res, tvdbService) {
    const startTime = Date.now();
    
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

        // Extract user's preferred language
        const userLanguage = getLanguagePreference(req);

        console.log(`🔍 Searching ${type} for: "${extraParams.search}" (language: ${userLanguage})`);

        const searchStart = Date.now();
        
        // Search TVDB with language for caching
        const searchResults = await tvdbService.search(extraParams.search, type, 20, userLanguage);
        
        const searchTime = Date.now() - searchStart;
        console.log(`⚡ Search API call completed in ${searchTime}ms`);
        
        const transformStart = Date.now();
        
        // Transform results to Stremio format with user language preference
        const metas = await tvdbService.transformSearchResults(searchResults, type, userLanguage);

        const transformTime = Date.now() - transformStart;
        const totalTime = Date.now() - startTime;
        
        console.log(`⚡ Transform completed in ${transformTime}ms (Total: ${totalTime}ms, Results: ${metas.length})`);

        res.json({ metas });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`Catalog handler error after ${totalTime}ms:`, error);
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
