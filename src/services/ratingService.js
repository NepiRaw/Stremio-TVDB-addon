const axios = require('axios');
const { logger } = require('../utils/logger');
class RatingService {
    constructor(cacheService, omdbApiKey = null) {
        this.cacheService = cacheService;
        this.omdbApiKey = omdbApiKey;
        this.omdbBaseUrl = 'http://www.omdbapi.com';
        this.imdbApiDevBaseUrl = 'https://api.imdbapi.dev';
        this.rateLimitHit = false;
        this.rateLimitResetTime = null;
        
        logger.info(`RatingService initialized with OMDB: ${omdbApiKey ? 'enabled' : 'disabled'}, fallback: imdbapi.dev`);
    }

    /**
     * Fetches IMDb rating using OMDB API
     * @param {string} imdbId - The IMDb ID (e.g., 'tt0111161')
     * @returns {Object|null} Rating data or null if not found/failed
     */
    async getOMDbRating(imdbId) {
        if (!this.omdbApiKey) {
            logger.debug('OMDB API key not available, skipping OMDB');
            return null;
        }

        if (this.rateLimitHit && this.rateLimitResetTime && new Date() < this.rateLimitResetTime) {
            logger.debug('OMDB rate limit still active, skipping');
            return null;
        }

        const url = `${this.omdbBaseUrl}/?i=${imdbId}&apikey=${this.omdbApiKey}`;
        
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                logger.debug(`OMDB attempt ${attempt + 1} for ${imdbId}`);
                
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Stremio-TVDB-Addon/1.0'
                    }
                });

                const data = response.data;
                
                if (data.Response === "True") {
                    const ratingData = {
                        source: 'omdb',
                        imdb_rating: data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : null,
                        imdb_votes: data.imdbVotes !== 'N/A' ? data.imdbVotes.replace(/,/g, '') : null,
                        metascore: data.Metascore !== 'N/A' ? parseInt(data.Metascore) : null,
                        rotten_tomatoes: data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || null,
                        plot: data.Plot !== 'N/A' ? data.Plot : null,
                        runtime: data.Runtime !== 'N/A' ? data.Runtime : null,
                        genre: data.Genre !== 'N/A' ? data.Genre : null,
                        director: data.Director !== 'N/A' ? data.Director : null,
                        awards: data.Awards !== 'N/A' ? data.Awards : null,
                        
                        external_ids: this.extractOMDbExternalIds(data),
                        
                        fetched_at: new Date().toISOString()
                    };
                    
                    logger.debug(`OMDB rating fetched for ${imdbId}: ${ratingData.imdb_rating}/10`);
                    return ratingData;
                } else {
                    logger.debug(`OMDB API error for ${imdbId}: ${data.Error}`);
                    return null;
                }
            } catch (error) {
                if (error.response?.status === 429) {
                    logger.warn('OMDB rate limit hit');
                    this.rateLimitHit = true;
                    this.rateLimitResetTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Reset after 24 hours
                    return null;
                }
                
                logger.debug(`OMDB attempt ${attempt + 1} failed for ${imdbId}: ${error.message}`);
                
                if (attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }
        
        logger.error(`OMDB failed after 3 attempts for ${imdbId}`);
        return null;
    }

    /**
     * Fetches IMDb rating using imdbapi.dev as fallback
     * @param {string} imdbId - The IMDb ID (e.g., 'tt0111161')
     * @param {string} contentType - Either 'movie' or 'series' for search fallback
     * @returns {Object|null} Rating data or null if not found/failed
     */
    async getIMDbApiDevRating(imdbId, contentType = 'movie') {
        const directUrl = `${this.imdbApiDevBaseUrl}/titles/${imdbId}`;
        
        try {
            logger.debug(`IMDbAPI.dev direct lookup for ${imdbId}`);
            
            const response = await axios.get(directUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Stremio-TVDB-Addon/1.0'
                }
            });

            const data = response.data;
            
            if (data.rating?.aggregateRating) {
                const ratingData = {
                    source: 'imdbapi.dev',
                    imdb_rating: parseFloat(data.rating.aggregateRating),
                    imdb_votes: data.rating.ratingCount || null,
                    plot: data.plot || null,
                    runtime: data.runtimeMinutes ? `${data.runtimeMinutes} min` : null,
                    genre: data.genres?.join(', ') || null,
                    director: data.directors?.map(d => d.name).join(', ') || null,
                    fetched_at: new Date().toISOString()
                };
                
                logger.debug(`IMDbAPI.dev rating fetched for ${imdbId}: ${ratingData.imdb_rating}/10`);
                return ratingData;
            }
        } catch (error) {
            logger.debug(`IMDbAPI.dev direct lookup failed for ${imdbId}: ${error.message}`);
        }

        try {
            const searchType = contentType === 'series' ? 'TV_SERIES' : 'MOVIE';
            const searchUrl = `${this.imdbApiDevBaseUrl}/v2/search/titles?query=${imdbId}&types=${searchType}`;
            
            logger.debug(`IMDbAPI.dev search fallback for ${imdbId}`);
            
            const searchResponse = await axios.get(searchUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Stremio-TVDB-Addon/1.0'
                }
            });

            const searchData = searchResponse.data;
            const result = searchData.titles?.find(title => title.id === imdbId);
            
            if (result?.rating?.aggregateRating) {
                const ratingData = {
                    source: 'imdbapi.dev',
                    imdb_rating: parseFloat(result.rating.aggregateRating),
                    imdb_votes: result.rating.ratingCount || null,
                    fetched_at: new Date().toISOString()
                };
                
                logger.debug(`IMDbAPI.dev search rating fetched for ${imdbId}: ${ratingData.imdb_rating}/10`);
                return ratingData;
            }
        } catch (error) {
            logger.debug(`IMDbAPI.dev search failed for ${imdbId}: ${error.message}`);
        }

        logger.debug(`No rating found via IMDbAPI.dev for ${imdbId}`);
        return null;
    }

    /**
     * Fetches IMDb rating data using OMDB (primary) or imdbapi.dev (fallback)
     * @param {string} imdbId - The IMDb ID (e.g., 'tt0111161')
     * @param {string} contentType - Either 'movie' or 'series'
     * @returns {Object|null} Rating data or null if not found
     */
    async getImdbRating(imdbId, contentType = 'movie') {
        if (!imdbId || !imdbId.startsWith('tt')) {
            logger.debug(`Invalid IMDB ID format: ${imdbId}`);
            return null;
        }

        const cacheKey = `rating:${imdbId}`;
        
        try {
            const cachedData = await this.cacheService.getCachedData('metadata', cacheKey);
            if (cachedData) {
                logger.debug(`Rating cache hit for ${imdbId} (source: ${cachedData.source || 'unknown'})`);
                return cachedData.notFound ? null : cachedData;
            }
        } catch (error) {
            logger.error(`Cache error for rating: ${error.message}`);
        }

        let ratingData = await this.getOMDbRating(imdbId);
        
        if (!ratingData) {
            ratingData = await this.getIMDbApiDevRating(imdbId, contentType);
        }

        const TTL = ratingData ? (7 * 24 * 60 * 60) : (60 * 60); // 7 days for success, 1 hour for failure
        
        if (ratingData) {
            await this.cacheService.setCachedData('metadata', cacheKey, ratingData, TTL);
            logger.debug(`Cached rating for ${imdbId}: ${ratingData.imdb_rating}/10 (source: ${ratingData.source})`);
            
            if (ratingData.external_ids) {
                await this.cacheExternalIds(ratingData.external_ids, imdbId, 30 * 24 * 60 * 60); // 30 days
            }
        } else {
            const emptyResult = { notFound: true };
            await this.cacheService.setCachedData('metadata', cacheKey, emptyResult, TTL);
            logger.debug(`Cached negative result for ${imdbId}`);
        }

        return ratingData;
    }

    /**
     * Batch fetch ratings for multiple IMDb IDs
     * @param {Array} imdbIds - Array of IMDb IDs
     * @param {string} contentType - Either 'movie' or 'series'
     * @returns {Object} Map of imdbId to rating data
     */
    async batchGetRatings(imdbIds, contentType = 'movie') {
        const results = {};
        
        const concurrencyLimit = 3; 
        const chunks = [];
        
        for (let i = 0; i < imdbIds.length; i += concurrencyLimit) {
            chunks.push(imdbIds.slice(i, i + concurrencyLimit));
        }
        
        for (const chunk of chunks) {
            const promises = chunk.map(async (imdbId) => {
                const rating = await this.getImdbRating(imdbId, contentType);
                return { imdbId, rating };
            });
            
            const chunkResults = await Promise.all(promises);
            chunkResults.forEach(({ imdbId, rating }) => {
                results[imdbId] = rating;
            });
            
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        return results;
    }

    /**
     * Extract external IDs from OMDB response data
     * @param {Object} data - OMDB API response data
     * @returns {Object} External IDs object
     */
    extractOMDbExternalIds(data) {
        const externalIds = {};
        
        if (data.imdbID) {
            externalIds.imdb_id = data.imdbID;
        }
        
        if (data.Type) {
            externalIds.content_type = data.Type; // movie, series, episode
        }
        
        if (data.Year) {
            externalIds.year = data.Year;
        }
        
        if (data.Country) {
            externalIds.country = data.Country;
        }
        
        if (data.Language) {
            externalIds.language = data.Language;
        }
        
        return externalIds;
    }

    /**
     * Cache external IDs separately for cross-referencing
     * @param {Object} externalIds - External IDs object
     * @param {string} primaryId - Primary ID (IMDb ID)
     * @param {number} ttl - Time to live in seconds
     */
    async cacheExternalIds(externalIds, primaryId, ttl = 30 * 24 * 60 * 60) { // 30 days default
        if (!externalIds || !primaryId) return;
        
        const cacheKey = `external_ids:${primaryId}`;
        
        try {
            await this.cacheService.setCachedData('metadata', cacheKey, externalIds, ttl);
            logger.debug(`Cached external IDs for ${primaryId}: ${Object.keys(externalIds).join(', ')}`);
        } catch (error) {
            logger.error(`Failed to cache external IDs for ${primaryId}: ${error.message}`);
        }
    }

    /**
     * Get cached external IDs
     * @param {string} primaryId - Primary ID (IMDb ID)
     * @returns {Object|null} External IDs or null if not found
     */
    async getCachedExternalIds(primaryId) {
        if (!primaryId) return null;
        
        const cacheKey = `external_ids:${primaryId}`;
        
        try {
            const cachedData = await this.cacheService.getCachedData('metadata', cacheKey);
            if (cachedData && !cachedData.notFound) {
                logger.debug(`External IDs cache hit for ${primaryId}`);
                return cachedData;
            }
        } catch (error) {
            logger.error(`Cache error for external IDs: ${error.message}`);
        }
        
        return null;
    }
}

module.exports = RatingService;
