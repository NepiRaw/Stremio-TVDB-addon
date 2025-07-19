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
async function metaHandler(req, res, tvdbService) {
    try {
        const { type, id } = req.params;

        // Validate type
        if (!['movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }

        // Validate and extract ID - support both TVDB and IMDb formats
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
            
            // Search for TVDB ID using IMDb ID
            console.log(`🔍 Looking up TVDB ID for IMDb ID: ${imdbId}`);
            
            try {
                const searchResults = await tvdbService.search(`"${imdbId}"`, type);
                console.log(`🔍 Search results for "${imdbId}":`, searchResults?.length, 'items');
                if (searchResults && searchResults.length > 0) {
                    // Log first result structure for debugging
                    console.log(`🔍 First search result structure:`, JSON.stringify(searchResults[0], null, 2));
                    
                    // Find exact match by IMDb ID
                    const exactMatch = searchResults.find(result => {
                        const resultImdbId = tvdbService.contentFetcher.extractImdbId(result);
                        console.log(`🔍 Checking result ID ${result.id}: extracted IMDb ID = ${resultImdbId}`);
                        return resultImdbId === imdbId;
                    });
                    
                    if (exactMatch) {
                        // Extract numeric ID from the search result ID (e.g., "series-79168" -> "79168")
                        const rawTvdbId = exactMatch.id.toString();
                        tvdbId = tvdbService.contentFetcher.extractNumericId(rawTvdbId);
                        console.log(`✅ Found TVDB ID ${tvdbId} for IMDb ID ${imdbId}`);
                    } else {
                        console.log(`❌ No exact IMDb match found for ${imdbId}`);
                        return res.status(404).json({ error: 'Content not found by IMDb ID' });
                    }
                } else {
                    console.log(`❌ No search results found for IMDb ID ${imdbId}`);
                    return res.status(404).json({ error: 'Content not found by IMDb ID' });
                }
            } catch (searchError) {
                console.error(`Search error for IMDb ID ${imdbId}:`, searchError.message);
                return res.status(500).json({ error: 'Failed to lookup content by IMDb ID' });
            }
        } else {
            return res.status(400).json({ error: 'Invalid ID format. Use tvdb-123456 or tt1234567 format' });
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
