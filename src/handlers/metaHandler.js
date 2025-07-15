const tvdbService = require('../services/tvdbService');

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

        console.log(`📋 Getting metadata for ${type} ID: ${tvdbId}`);

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
        const meta = tvdbService.transformDetailedToStremioMeta(detailedData, type, seasonsData);
        
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
