/**
 * TVDB Content Fetcher
 * Unified content fetching for movies and series with shared logic
 */

class ContentFetcher {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    /**
     * Get detailed content information (unified for movies/series) with enhanced error handling
     */
    async getContentDetails(contentType, contentId) {
        try {
            // Extract numeric ID from prefixed format (e.g., "movie-15778" -> "15778")
            const numericId = this.extractNumericId(contentId);
            const endpoint = contentType === 'movie' ? 'movies' : 'series';
            
            // Use Promise.allSettled to handle failures gracefully
            const [basicResult, extendedResult] = await Promise.allSettled([
                this.apiClient.makeRequest(`/${endpoint}/${numericId}`),
                this.apiClient.makeRequest(`/${endpoint}/${numericId}/extended`)
            ]);
            
            // Extract data from successful requests
            const basic = basicResult.status === 'fulfilled' ? basicResult.value : null;
            const extended = extendedResult.status === 'fulfilled' ? extendedResult.value : null;
            
            return extended?.data || basic?.data || null;
        } catch (error) {
            console.error(`${contentType} details error for ID ${contentId}:`, error.message);
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
            const response = await this.apiClient.makeRequest(`/series/${seriesId}/extended`);
            const seasons = response?.data?.seasons || [];
            
            if (seasons.length > 0) {
                console.log(`📺 Got ${seasons.length} seasons for series ${seriesId}`);
            }
            return seasons;
        } catch (error) {
            console.error(`Series seasons error for ID ${seriesId}:`, error.message);
            return [];
        }
    }

    /**
     * Get series episodes
     */
    async getSeriesEpisodes(seriesId, seasonType = 'default') {
        try {
            const response = await this.apiClient.makeRequest(`/series/${seriesId}/episodes/${seasonType}`, { page: 0 });
            const episodes = response?.data?.episodes || [];
            
            console.log(`📺 Got ${episodes.length} episodes for series ${seriesId}`);
            return episodes;
        } catch (error) {
            console.error(`Series episodes error for ID ${seriesId}:`, error.message);
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
