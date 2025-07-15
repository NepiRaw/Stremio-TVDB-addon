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

        // Extract user's preferred language from Accept-Language header
        const acceptLanguage = req.headers['accept-language'];
        const userLanguage = extractPreferredLanguage(acceptLanguage);
        
        console.log(`📋 Getting metadata for ${type} ID: ${tvdbId}${userLanguage ? ` (user language: ${userLanguage})` : ''}`);

        let detailedData = null;
        let seasonsData = null;

        // Fetch detailed information based on type
        if (type === 'movie') {
            detailedData = await tvdbService.getMovieDetails(tvdbId);
        } else if (type === 'series') {
            // For series, get both series details and seasons
            const [seriesDetails, seasons] = await Promise.all([
                tvdbService.getSeriesDetails(tvdbId),
                tvdbService.getSeriesSeasons(tvdbId)
            ]);
            
            detailedData = seriesDetails;
            seasonsData = seasons;
        }

        if (!detailedData) {
            return res.status(404).json({ error: 'Content not found' });
        }

        // Transform to Stremio meta format
        const meta = tvdbService.transformDetailedToStremioMeta(detailedData, type, seasonsData, userLanguage);
        
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
