/**
 * Extract TVDB language code from URL parameter
 * @param {object} req - Express request object
 * @returns {string} - TVDB 3-character language code (e.g., 'fra', 'spa', 'eng')
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
 * Handle metadata requests for specific content
 * Route: /meta/:type/:id.json
 */
async function metaHandler(req, res, tvdbService, logger) {
    try {
        const { type, id } = req.params;

        if (!['movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }

        let tvdbId;

        if (id.startsWith('tvdb-')) {
            tvdbId = id.replace('tvdb-', '');
            if (!tvdbId || isNaN(tvdbId)) {
                return res.status(400).json({ error: 'Invalid TVDB ID' });
            }
        } else if (/^tt\d{7,}$/.test(id)) {
            tvdbId = await tvdbService.getTvdbIdFromImdbId(id, type);
            if (!tvdbId) {
                logger?.debug?.(`No TVDB ${type} found for IMDb ID ${id}`);
                return res.status(404).json({ error: 'Content not found by IMDb ID' });
            }
            logger?.debug?.(`Resolved IMDb ID ${id} to TVDB ${type} ${tvdbId}`);
        } else {
            return res.status(400).json({ error: 'Invalid ID format. Use tvdb-123456 or tt1234567 format' });
        }

        const userLanguage = getLanguagePreference(req);

        let detailedData = null;
        let seasonsData = null;

        if (type === 'movie') {
            detailedData = await tvdbService.getMovieDetails(tvdbId);
        } else if (type === 'series') {
            detailedData = await tvdbService.getSeriesExtended(tvdbId);
            seasonsData = detailedData?.seasons || [];
        }

        if (!detailedData) {
            return res.status(404).json({ error: 'Content not found' });
        }

        const meta = await tvdbService.transformDetailedToStremioMeta(detailedData, type, seasonsData, userLanguage);
        
        if (!meta) {
            return res.status(500).json({ error: 'Failed to process metadata' });
        }

        res.json({ meta });

    } catch (error) {
        logger?.error?.('Meta handler error:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
}

module.exports = metaHandler;
