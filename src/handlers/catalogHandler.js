const tvdbService = require('../services/tvdbService');

/**
 * Extract preferred language from Accept-Language header
 * @param {string} acceptLanguage - Accept-Language header value
 * @returns {string|null} - Preferred language code (e.g., 'fr', 'es', 'de') or null
 */
function extractPreferredLanguage(acceptLanguage) {
    if (!acceptLanguage) return null;
    
    // Parse Accept-Language header (e.g., "fr-FR,fr;q=0.9,en;q=0.8")
    const languages = acceptLanguage
        .split(',')
        .map(lang => {
            const parts = lang.trim().split(';');
            const code = parts[0].trim();
            const quality = parts[1] ? parseFloat(parts[1].split('=')[1]) : 1.0;
            return { code, quality };
        })
        .sort((a, b) => b.quality - a.quality);
    
    // Get the highest priority language that's not English (since English is our fallback)
    const preferredLang = languages.find(lang => {
        const langCode = lang.code.toLowerCase();
        return !langCode.startsWith('en') && langCode !== 'en-us' && langCode !== 'en-gb';
    });
    
    if (preferredLang) {
        // Convert to 2-letter language code if needed (e.g., 'fr-FR' -> 'fr')
        return preferredLang.code.split('-')[0].toLowerCase();
    }
    
    return null;
}

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

        // Extract user's preferred language from Accept-Language header
        const acceptLanguage = req.headers['accept-language'];
        const userLanguage = extractPreferredLanguage(acceptLanguage);

        console.log(`🔍 Searching ${type} for: "${extraParams.search}"${userLanguage ? ` (user language: ${userLanguage})` : ''}`);

        // Search TVDB
        const searchResults = await tvdbService.search(extraParams.search, type);
        
        // Transform results to Stremio format with user language preference
        const metas = await tvdbService.transformSearchResults(searchResults, type, userLanguage);
        
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
