/**
 * TVDB Content Fetcher
 * Unified content fetching for movies and series with shared logic
 */
const { fetchAllEpisodePages } = require('../../utils/episodePager');

class ContentFetcher {
    constructor(apiClient, cacheService, logger) {
        this.apiClient = apiClient;
        this.cacheService = cacheService;
        this.logger = logger;
    }

    async getContentDetails(contentType, contentId) {
        try {
            const numericId = this.extractNumericId(contentId);
            const cachedMetadata = await this.cacheService.getMetadata(contentType, numericId);
            if (cachedMetadata) {
                this.logger?.debug?.(`Metadata cache HIT for ${contentType} ${numericId}`);
                return cachedMetadata;
            }

            const endpoint = contentType === 'movie' ? 'movies' : 'series';
            const [basicResult, extendedResult] = await Promise.allSettled([
                this.apiClient.makeRequest(`/${endpoint}/${numericId}`),
                this.apiClient.makeRequest(`/${endpoint}/${numericId}/extended`)
            ]);
            const basic = basicResult.status === 'fulfilled' ? basicResult.value : null;
            const extended = extendedResult.status === 'fulfilled' ? extendedResult.value : null;
            const result = extended?.data || basic?.data || null;
            await this.cacheService.setMetadata(contentType, numericId, null, result);
            if (result) {
                this.logger?.debug?.(`Cached metadata for ${contentType} ${numericId}`);
            }
            return result;
        } catch (error) {
            this.logger?.error?.(`${contentType} details error for ID ${contentId}:`, error.message);
            await this.cacheService.setMetadata(contentType, this.extractNumericId(contentId), null, null);
            return null;
        }
    }

    extractNumericId(id) {
        if (typeof id === 'string') {
            const match = id.match(/(\d+)$/);
            return match ? match[1] : id;
        }
        return id;
    }

    async getMovieDetails(movieId) {
        return this.getContentDetails('movie', movieId);
    }

    async getSeriesDetails(seriesId) {
        return this.getContentDetails('series', seriesId);
    }

    async getSeriesSeasons(seriesId) {
        try {
            const cachedSeasons = await this.cacheService.getSeasonData(seriesId);
            if (cachedSeasons) {
                this.logger?.debug?.(`Seasons cache HIT for series ${seriesId}`);
                return cachedSeasons;
            }

            const response = await this.apiClient.makeRequest(`/series/${seriesId}/extended`);
            const seasons = response?.data?.seasons || [];
            await this.cacheService.setSeasonData(seriesId, null, seasons);
            if (seasons.length > 0) {
                this.logger?.debug?.(`Got ${seasons.length} seasons for series ${seriesId} (cached)`);
            }
            return seasons;
        } catch (error) {
            this.logger?.error?.(`Series seasons error for ID ${seriesId}:`, error.message);
            await this.cacheService.setSeasonData(seriesId, null, []);
            return [];
        }
    }

    async getSeriesEpisodes(seriesId, seasonType = 'default') {
        try {
            const cacheKey = `episodes:${seasonType}`;
            const cachedEpisodes = await this.cacheService.getSeasonData(seriesId, cacheKey);
            if (cachedEpisodes) {
                this.logger?.debug?.(`Episodes cache HIT for series ${seriesId} (${seasonType})`);
                return cachedEpisodes;
            }

            const allEpisodes = await fetchAllEpisodePages(this.apiClient, `/series/${seriesId}/episodes/${seasonType}`);

            await this.cacheService.setSeasonData(seriesId, cacheKey, allEpisodes);
            this.logger?.debug?.(`Got ${allEpisodes.length} episodes for series ${seriesId} (${seasonType}) - cached`);
            return allEpisodes;
        } catch (error) {
            this.logger?.error?.(`Series episodes error for ID ${seriesId}:`, error.message);
            await this.cacheService.setSeasonData(seriesId, `episodes:${seasonType}`, []);
            return [];
        }
    }

    // Shares the metadata cache with getContentDetails, so a later meta request reuses it.
    async getMovieExtended(movieId) {
        const numericId = this.extractNumericId(movieId);
        try {
            const cached = await this.cacheService.getMetadata('movie', numericId);
            if (cached) return cached;

            const response = await this.apiClient.makeRequest(`/movies/${numericId}/extended`);
            const result = response?.data || null;
            if (result) {
                await this.cacheService.setMetadata('movie', numericId, null, result);
            }
            return result;
        } catch (error) {
            this.logger?.error?.(`Movie extended error for ID ${movieId}:`, error.message);
            return null;
        }
    }

    // TVDB indexes external ids under /search/remoteid
    async getTvdbIdFromImdbId(imdbId, contentType) {
        const cacheKey = `imdb:remote:${contentType}:${imdbId}`;
        try {
            const cached = await this.cacheService.getCachedData('imdb', cacheKey);
            if (cached) return cached.tvdbId;

            const response = await this.apiClient.makeRequest(`/search/remoteid/${encodeURIComponent(imdbId)}`);
            const wanted = contentType === 'movie' ? 'movie' : 'series';
            const match = (response?.data || []).find(entry => entry?.[wanted]?.id);
            const tvdbId = match ? String(match[wanted].id) : null;

            await this.cacheService.setCachedData('imdb', cacheKey, { tvdbId }, this.cacheService.CACHE_TTLS.imdb);
            return tvdbId;
        } catch (error) {
            this.logger?.error?.(`Remote id lookup error for ${imdbId}:`, error.message);
            return null;
        }
    }

    // The extended record is a superset of /series/{id} and carries seasons
    async getSeriesExtended(seriesId) {
        const numericId = this.extractNumericId(seriesId);
        try {
            const cached = await this.cacheService.getMetadata('series', numericId);
            if (cached && Array.isArray(cached.seasons)) return cached;

            const response = await this.apiClient.makeRequest(`/series/${numericId}/extended`);
            const result = response?.data || null;
            if (result) {
                await this.cacheService.setMetadata('series', numericId, null, result);
            }
            return result;
        } catch (error) {
            this.logger?.error?.(`Series extended error for ID ${seriesId}:`, error.message);
            return null;
        }
    }

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
        
        if (item.imdb && typeof item.imdb === 'string') {
            return item.imdb.startsWith('tt') ? item.imdb : `tt${item.imdb}`;
        }
        
        return null;
    }

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
                    case 'themoviedb.com':
                    case 'tmdb':
                        externalIds.tmdb_id = remoteId.toString();
                        break;
                    case 'thetvdb':
                        externalIds.thetvdb_id = remoteId.toString();
                        break;
                    default:
                        if (sourceName && remoteId) {
                            const key = sourceName.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
                            if (key) externalIds[`${key}_id`] = remoteId.toString();
                        }
                }
            });
        }
        
        if (item.imdb && typeof item.imdb === 'string') {
            externalIds.imdb_id = item.imdb.startsWith('tt') ? item.imdb : `tt${item.imdb}`;
        }
        
        return externalIds;
    }

    filterValidSeasons(seasonsData) {
        if (!Array.isArray(seasonsData)) return [];
        
        return seasonsData.filter(season => {
            if (season.type?.type !== 'official') return false;
            
            const seasonNumber = season.number;
            return seasonNumber === 0 || seasonNumber >= 1;
        }).sort((a, b) => {
            const aNum = a.number || 0;
            const bNum = b.number || 0;
            
            if (aNum === 0 && bNum !== 0) return 1;
            if (bNum === 0 && aNum !== 0) return -1;
            
            return aNum - bNum;
        });
    }

    filterAiredEpisodes(episodes) {
        return episodes.filter(episode => {
            // Must have an air date to be valid
            if (!episode.aired) return false;
            
            // Include all episodes with valid dates (past AND future)
            // Stremio will automatically show future episodes as "upcoming" with hourglass icon
            const airDate = new Date(episode.aired);
            if (isNaN(airDate.getTime())) return false;
            
            return episode.seasonNumber >= 0;
        });
    }

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

