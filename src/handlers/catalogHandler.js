const tvdbService = require('../services/tvdbService');

/**
 * Extract language preference from URL parameter or Accept-Language header
 * @param {object} req - Express request object
 * @returns {string} - Language code (e.g., 'fr-FR', 'es-ES')
 */
function getLanguagePreference(req) {
    // First priority: URL parameter (e.g., /es-ES/catalog/...)
    if (req.params.language) {
        const urlLang = req.params.language;
        if (/^[a-z]{2}-[A-Z]{2}$/.test(urlLang)) {
            return urlLang;
        }
    }
    
    // Second priority: Accept-Language header
    const acceptLanguage = req.headers['accept-language'];
    if (acceptLanguage) {
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
        
        // Get the highest priority language
        const preferredLang = languages[0];
        if (preferredLang) {
            // Normalize to full language code
            const langCode = preferredLang.code.toLowerCase();
            if (langCode.includes('-')) {
                const [lang, country] = langCode.split('-');
                return `${lang}-${country.toUpperCase()}`;
            } else {
                // Map common 2-letter codes to full codes
                const langMap = {
                    'en': 'en-US',
                    'es': 'es-ES',
                    'fr': 'fr-FR',
                    'de': 'de-DE',
                    'it': 'it-IT',
                    'pt': 'pt-BR',
                    'ja': 'ja-JP',
                    'ko': 'ko-KR',
                    'zh': 'zh-CN',
                    'ru': 'ru-RU'
                };
                return langMap[langCode] || 'en-US';
            }
        }
    }
    
    // Default: English
    return 'en-US';
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

        // Extract user's preferred language
        const userLanguage = getLanguagePreference(req);

        console.log(`🔍 Searching ${type} for: "${extraParams.search}" (language: ${userLanguage})`);

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
