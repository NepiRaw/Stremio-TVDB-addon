const tvdbService = require('../services/tvdbService');

/**
 * Extract TVDB language code from URL parameter
 * @param {object} req - Express request object
 * @returns {string} - TVDB 3-character language code (e.g., 'fra', 'spa', 'eng')
 */
function getLanguagePreference(req) {
    // Language comes from URL parameter (e.g., /fra/meta/...)
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
        }

        if (!detailedData) {
            return res.status(404).json({ error: 'Content not found' });
        }

        // Transform to Stremio meta format (now async)
        const meta = await tvdbService.transformDetailedToStremioMeta(detailedData, type, seasonsData, userLanguage);
        
        if (!meta) {
            return res.status(500).json({ error: 'Failed to process metadata' });
        }

        res.json({ meta });

    } catch (error) {
        console.error('Meta handler error:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
}

module.exports = metaHandler;
