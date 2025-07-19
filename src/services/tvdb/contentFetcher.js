/**
 * TVDB Content Fetcher
 * Unified content fetching for movies and series with shared logic
 */

// Note: This will be replaced by dependency injection in the constructor

class ContentFetcher {
    constructor(apiClient, cacheService) {
        this.apiClient = apiClient;
        this.cacheService = cacheService;
    }

    /**
     * Get detailed content information (unified for movies/series) with enhanced error handling
     */
    async getContentDetails(contentType, contentId) {
        try {
            // Extract numeric ID from prefixed format (e.g., "movie-15778" -> "15778")
            const numericId = this.extractNumericId(contentId);
            
            // Check cache first
            const cachedMetadata = await this.cacheService.getMetadata(contentType, numericId);
            if (cachedMetadata) {
                console.log(`💾 Metadata cache HIT for ${contentType} ${numericId}`);
                return cachedMetadata;
            }

            const endpoint = contentType === 'movie' ? 'movies' : 'series';
            
            // Use Promise.allSettled to handle failures gracefully
            const [basicResult, extendedResult] = await Promise.allSettled([
                this.apiClient.makeRequest(`/${endpoint}/${numericId}`),
                this.apiClient.makeRequest(`/${endpoint}/${numericId}/extended`)
            ]);
            
            // Extract data from successful requests
            const basic = basicResult.status === 'fulfilled' ? basicResult.value : null;
            const extended = extendedResult.status === 'fulfilled' ? extendedResult.value : null;
            
            const result = extended?.data || basic?.data || null;
            
            // Cache the metadata
            await this.cacheService.setMetadata(contentType, numericId, null, result);
            
            if (result) {
                console.log(`📋 Cached metadata for ${contentType} ${numericId}`);
            }
            
            return result;
        } catch (error) {
            console.error(`${contentType} details error for ID ${contentId}:`, error.message);
            // Cache negative result to avoid repeated failures
            await this.cacheService.setMetadata(contentType, this.extractNumericId(contentId), null, null);
            return null;
        }
    }

    /**
     * Extract numeric ID from TVDB ID format
     */
    extractNumericId(id) {
        if (typeof id === 'string') {
            // Handle formats like "movie-15778", "series-81189", or just "15778"
            const match = id.match(/(\d+)$/);
            return match ? match[1] : id;
        }
        return id;
    }

    /**
     * Get movie details (wrapper for unified method)
     */
    async getMovieDetails(movieId) {
        return this.getContentDetails('movie', movieId);
    }

    /**
     * Get series details (wrapper for unified method)
     */
    async getSeriesDetails(seriesId) {
        return this.getContentDetails('series', seriesId);
    }

    /**
     * Get series seasons using extended endpoint
     */
    async getSeriesSeasons(seriesId) {
        try {
            // Check cache first
            const cachedSeasons = await this.cacheService.getSeasonData(seriesId);
            if (cachedSeasons) {
                console.log(`💾 Seasons cache HIT for series ${seriesId}`);
                return cachedSeasons;
            }

            const response = await this.apiClient.makeRequest(`/series/${seriesId}/extended`);
            const seasons = response?.data?.seasons || [];
            
            // Cache the seasons data
            await this.cacheService.setSeasonData(seriesId, null, seasons);
            
            if (seasons.length > 0) {
                console.log(`📺 Got ${seasons.length} seasons for series ${seriesId} (cached)`);
            }
            return seasons;
        } catch (error) {
            console.error(`Series seasons error for ID ${seriesId}:`, error.message);
            // Cache negative result
            await this.cacheService.setSeasonData(seriesId, null, []);
            return [];
        }
    }

    /**
     * Get series episodes
     */
    async getSeriesEpisodes(seriesId, seasonType = 'default') {
        try {
            // Check cache first - cache by series and season type
            const cacheKey = `episodes:${seasonType}`;
            const cachedEpisodes = await this.cacheService.getSeasonData(seriesId, cacheKey);
            if (cachedEpisodes) {
                console.log(`💾 Episodes cache HIT for series ${seriesId} (${seasonType})`);
                return cachedEpisodes;
            }

            const response = await this.apiClient.makeRequest(`/series/${seriesId}/episodes/${seasonType}`, { page: 0 });
            const episodes = response?.data?.episodes || [];
            
            // Cache the episodes data
            await this.cacheService.setSeasonData(seriesId, cacheKey, episodes);
            
            console.log(`📺 Got ${episodes.length} episodes for series ${seriesId} (${seasonType}) - cached`);
            return episodes;
        } catch (error) {
            console.error(`Series episodes error for ID ${seriesId}:`, error.message);
            // Cache negative result
            await this.cacheService.setSeasonData(seriesId, `episodes:${seasonType}`, []);
            return [];
        }
    }

    /**
     * Get series extended information
     */
    async getSeriesExtended(seriesId) {
        try {
            const response = await this.apiClient.makeRequest(`/series/${seriesId}/extended`);
            return response.data;
        } catch (error) {
            console.error(`Series extended error for ID ${seriesId}:`, error.message);
            return null;
        }
    }

    /**
     * Extract IMDB ID from content data
     */
    extractImdbId(item) {
        if (item.remoteIds && Array.isArray(item.remoteIds)) {
            const imdbRemote = item.remoteIds.find(remote => 
                remote.sourceName?.toLowerCase() === 'imdb' || 
                remote.type === 2 || 
                (remote.id && remote.id.startsWith('tt'))
            );
            
            if (imdbRemote && imdbRemote.id) {
                return imdbRemote.id.startsWith('tt') ? imdbRemote.id : `tt${imdbRemote.id}`;
            }
        }
        
        // Fallback: check for direct imdb field
        if (item.imdb && typeof item.imdb === 'string') {
            return item.imdb.startsWith('tt') ? item.imdb : `tt${item.imdb}`;
        }
        
        return null;
    }

    /**
     * Extract all external IDs from content data for cross-referencing
     * This helps link content across different Stremio addons
     */
    extractExternalIds(item) {
        const externalIds = {
            tvdb_id: item.id ? item.id.toString() : null
        };
        
        if (item.remoteIds && Array.isArray(item.remoteIds)) {
            item.remoteIds.forEach(remote => {
                const sourceName = remote.sourceName?.toLowerCase();
                const remoteId = remote.id;
                
                if (!remoteId) return;
                
                switch (sourceName) {
                    case 'imdb':
                        externalIds.imdb_id = remoteId.startsWith('tt') ? remoteId : `tt${remoteId}`;
                        break;
                    case 'themoviedb':
                    case 'tmdb':
                        externalIds.tmdb_id = remoteId.toString();
                        break;
                    case 'thetvdb':
                        externalIds.thetvdb_id = remoteId.toString();
                        break;
                    default:
                        // Store any other external IDs with their source name
                        if (sourceName && remoteId) {
                            externalIds[`${sourceName}_id`] = remoteId.toString();
                        }
                }
            });
        }
        
        // Fallback: check for direct fields
        if (item.imdb && typeof item.imdb === 'string') {
            externalIds.imdb_id = item.imdb.startsWith('tt') ? item.imdb : `tt${item.imdb}`;
        }
        
        return externalIds;
    }

    /**
     * Filter valid seasons (aired content only)
     */
    filterValidSeasons(seasonsData) {
        if (!Array.isArray(seasonsData)) return [];
        
        return seasonsData.filter(season => {
            // Only include official "Aired Order" seasons
            if (season.type?.type !== 'official') return false;
            
            const seasonNumber = season.number;
            // Include Season 0 (specials) and numbered seasons (1+)
            return seasonNumber === 0 || seasonNumber >= 1;
        }).sort((a, b) => {
            const aNum = a.number || 0;
            const bNum = b.number || 0;
            
            // Season 0 goes to the end
            if (aNum === 0 && bNum !== 0) return 1;
            if (bNum === 0 && aNum !== 0) return -1;
            
            return aNum - bNum;
        });
    }

    /**
     * Filter episodes with valid air dates (including aired + future episodes for Stremio's upcoming feature)
     */
    filterAiredEpisodes(episodes) {
        return episodes.filter(episode => {
            // Must have an air date to be valid
            if (!episode.aired) return false;
            
            // Include all episodes with valid dates (past AND future)
            // Stremio will automatically show future episodes as "upcoming" with hourglass icon
            const airDate = new Date(episode.aired);
            if (isNaN(airDate.getTime())) return false;
            
            // Only filter out specials with negative season numbers
            return episode.seasonNumber >= 0;
        });
    }

    /**
     * Group episodes by season
     */
    groupEpisodesBySeason(episodes) {
        const episodesBySeason = {};
        episodes.forEach(episode => {
            if (!episodesBySeason[episode.seasonNumber]) {
                episodesBySeason[episode.seasonNumber] = [];
            }
            episodesBySeason[episode.seasonNumber].push(episode);
        });
        return episodesBySeason;
    }
}

module.exports = ContentFetcher;

