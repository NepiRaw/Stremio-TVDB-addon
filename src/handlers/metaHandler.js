const tvdbService = require('../services/tvdbService');

/**
 * Extract language preference from URL parameter or Accept-Language header
 * @param {object} req - Express request object
 * @returns {string} - Language code (e.g., 'fr-FR', 'es-ES')
 */
function getLanguagePreference(req) {
    // First priority: URL parameter (e.g., /es-ES/meta/...)
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
 * Handle metadata requests for specific content
 * Route: /meta/:type/:id.json
 */
async function metaHandler(req, res) {
    try {
        const { type, id } = req.params;

        // Validate type
        if (!['movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }

        // Validate and extract TVDB ID
        if (!id.startsWith('tvdb-')) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        const tvdbId = id.replace('tvdb-', '');
        if (!tvdbId || isNaN(tvdbId)) {
            return res.status(400).json({ error: 'Invalid TVDB ID' });
        }

        // Extract user's preferred language
        const userLanguage = getLanguagePreference(req);
        
        console.log(`📋 Getting metadata for ${type} ID: ${tvdbId} (language: ${userLanguage})`);

        let detailedData = null;
        let seasonsData = null;

        // Fetch detailed information based on type
        if (type === 'movie') {
            detailedData = await tvdbService.getMovieDetails(tvdbId);
        } else if (type === 'series') {
            // For series, get both series details and seasons with extended data
            const [seriesDetails, seasons, extendedData] = await Promise.all([
                tvdbService.getSeriesDetails(tvdbId),
                tvdbService.getSeriesSeasons(tvdbId),
                tvdbService.getSeriesExtended(tvdbId).catch(() => null)
            ]);
            
            // Merge extended data if available
            if (extendedData && seriesDetails) {
                detailedData = { ...seriesDetails, ...extendedData };
            } else {
                detailedData = seriesDetails;
            }
            
            seasonsData = seasons;
            
            // Log season data for debugging
            if (seasons && seasons.length > 0) {
                console.log(`📺 Found ${seasons.length} seasons for series ${tvdbId}`);
            } else {
                console.log(`⚠️ No seasons found for series ${tvdbId}`);
            }
        }

        if (!detailedData) {
            return res.status(404).json({ error: 'Content not found' });
        }

        // Transform to Stremio meta format (now async)
        const meta = await tvdbService.transformDetailedToStremioMeta(detailedData, type, seasonsData, userLanguage);
        
        if (!meta) {
            return res.status(500).json({ error: 'Failed to process metadata' });
        }

        console.log(`✅ Metadata retrieved for: ${meta.name}`);

        res.json({ meta });

    } catch (error) {
        console.error('Meta handler error:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
}

module.exports = metaHandler;
