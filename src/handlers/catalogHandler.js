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
 * Handle catalog requests - provides both search-based and browsable catalog results
 * Route: /catalog/:type/:id/:extra?.json
 */
async function catalogHandler(req, res, tvdbService, catalogService) {
    const startTime = Date.now();
    
    try {
        const { type, id, extra } = req.params;
        
        // Parse extra parameters from path (Stremio protocol) or query parameters (user-friendly)
        let extraParams = {};
        if (extra) {
            // Path parameter format: /catalog/series/tvdb-series/search=friends.json
            const decodedExtra = decodeURIComponent(extra);
            extraParams = parseExtraParams(decodedExtra);
        } else {
            // Query parameter format: /catalog/series/tvdb-series.json?search=friends
            extraParams = req.query || {};
        }

        // Validate type
        if (!['movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }

        // Extract user's preferred language
        const userLanguage = getLanguagePreference(req);

        // Check if this is a search-based catalog (legacy TVDB catalogs)
        const isSearchCatalog = ['tvdb-movies', 'tvdb-series'].includes(id);
        
        if (isSearchCatalog) {
            // Handle legacy search-based catalogs
            return await handleSearchCatalog(req, res, tvdbService, type, id, extraParams, userLanguage, startTime);
        }

        // Handle browsable catalogs (TMDB-based)
        if (catalogService && catalogService.isCatalogEnabled(id)) {
            return await handleBrowsableCatalog(req, res, catalogService, type, id, extraParams, userLanguage, startTime);
        }

        // Unknown catalog ID
        return res.status(404).json({ error: 'Catalog not found' });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`Catalog handler error after ${totalTime}ms:`, error);
        // Return empty results on error to avoid breaking Stremio
        res.json({ metas: [] });
    }
}

/**
 * Handle legacy search-based catalogs (TVDB)
 */
async function handleSearchCatalog(req, res, tvdbService, type, id, extraParams, userLanguage, startTime) {
    // Search is required for search-based catalogs
    if (!extraParams.search || extraParams.search.trim() === '') {
        return res.json({ metas: [] });
    }

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
}

/**
 * Handle browsable catalogs (TMDB-based)
 */
async function handleBrowsableCatalog(req, res, catalogService, type, id, extraParams, userLanguage, startTime) {
    // Parse pagination parameters
    const skip = parseInt(extraParams.skip) || 0;
    const limit = 20; // Fixed page size for consistency
    const page = Math.floor(skip / limit) + 1;

    console.log(`📋 Loading ${id} catalog (page ${page}, language: ${userLanguage})`);

    const catalogStart = Date.now();
    
    // Get catalog data from TMDB with TVDB enrichment
    const catalogData = await catalogService.getCatalog(id, userLanguage, page, limit);
    
    const catalogTime = Date.now() - catalogStart;
    const totalTime = Date.now() - startTime;
    
    console.log(`⚡ Catalog loaded in ${catalogTime}ms (Total: ${totalTime}ms, Results: ${catalogData.metas.length})`);

    // Return in Stremio format
    res.json({ 
        metas: catalogData.metas,
        cacheMaxAge: 3600 // Cache for 1 hour
    });
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
