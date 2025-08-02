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
        let isImdbId = false;
        
        if (id.startsWith('tvdb-')) {
            // TVDB format: tvdb-123456
            tvdbId = id.replace('tvdb-', '');
            if (!tvdbId || isNaN(tvdbId)) {
                return res.status(400).json({ error: 'Invalid TVDB ID' });
            }
        } else if (id.startsWith('tt') && /^tt\d{7,}$/.test(id)) {
            // IMDb format: tt1234567
            isImdbId = true;
            const imdbId = id;
            
            logger?.debug?.(`Looking up TVDB ID for IMDb ID: ${imdbId}`);
            
            try {
                const searchResults = await tvdbService.search(`"${imdbId}"`, type);
                logger?.debug?.(`Search results for "${imdbId}": ${searchResults?.length} items`);
                if (searchResults && searchResults.length > 0) {
                    logger?.debug?.(`First search result structure: ${JSON.stringify(searchResults[0], null, 2)}`);
                    
                    const exactMatch = searchResults.find(result => {
                        const resultImdbId = tvdbService.contentFetcher.extractImdbId(result);
                        logger?.debug?.(`Checking result ID ${result.id}: extracted IMDb ID = ${resultImdbId}`);
                        return resultImdbId === imdbId;
                    });
                    
                    if (exactMatch) {
                        tvdbId = exactMatch.id.toString();
                        logger?.debug?.(`Found TVDB ID ${tvdbId} for IMDb ID ${imdbId}`);
                    } else {
                        logger?.debug?.(`No exact IMDb match found for ${imdbId}`);
                        return res.status(404).json({ error: 'Content not found by IMDb ID' });
                    }
                } else {
                    logger?.debug?.(`No search results found for IMDb ID ${imdbId}`);
                    return res.status(404).json({ error: 'Content not found by IMDb ID' });
                }
            } catch (searchError) {
                logger?.error?.(`Search error for IMDb ID ${imdbId}: ${searchError.message}`);
                return res.status(500).json({ error: 'Failed to lookup content by IMDb ID' });
            }
        } else {
            return res.status(400).json({ error: 'Invalid ID format. Use tvdb-123456 or tt1234567 format' });
        }

        const userLanguage = getLanguagePreference(req);

        let detailedData = null;
        let seasonsData = null;

        if (type === 'movie') {
            detailedData = await tvdbService.getMovieDetails(tvdbId);
        } else if (type === 'series') {
            const [seriesDetails, seasons, extendedData] = await Promise.all([
                tvdbService.getSeriesDetails(tvdbId),
                tvdbService.getSeriesSeasons(tvdbId),
                tvdbService.getSeriesExtended(tvdbId).catch(() => null)
            ]);
            
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
