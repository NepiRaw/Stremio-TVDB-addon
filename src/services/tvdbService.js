const axios = require('axios');
const ContentFetcher = require('./tvdb/contentFetcher');
const TranslationService = require('./tvdb/translationService');
const ArtworkHandler = require('./tvdb/artworkHandler');
const CatalogTransformer = require('./tvdb/catalogTransformer');
const MetadataTransformer = require('./tvdb/metadataTransformer');
const UpdatesService = require('./tvdb/updatesService');
const { getEnhancedReleaseInfo } = require('../utils/theatricalStatus');
const { rankSearchResults } = require('../utils/searchRanking');
const { context } = require('../utils/logger');

class TVDBService {
    constructor(cacheService, ratingService = null, logger = null) {
        this.baseURL = 'https://api4.thetvdb.com/v4';
        this.cacheService = cacheService;
        this.ratingService = ratingService;
        this.logger = logger || {
            info: console.log,
            error: console.error,
            warn: console.warn,
            debug: console.log
        };
        this.apiKey = process.env.TVDB_API_KEY;
        this.token = null;
        this.tokenExpiry = null;
        
        if (!this.apiKey) {
            this.logger.error('❌ TVDB_API_KEY is missing! Please set it in your .env file. The addon cannot function without it.');
            throw new Error('TVDB_API_KEY environment variable is required');
        }

        // Healthy TVDB calls land under 300 ms, so this only fires on a connection that stopped answering.
        this.http = axios.create({
            timeout: Number(process.env.TVDB_REQUEST_TIMEOUT_MS) || 5000,
            headers: { 'Accept': 'application/json' }
        });

        const at = category => this.logger.child ? this.logger.child(category) : this.logger;
        this.metaLogger = at('META');
        this.tvdbLogger = at('TVDB');

        this.contentFetcher = new ContentFetcher(this, this.cacheService, at('TVDB'));
        this.translationService = new TranslationService(this, this.cacheService, at('TVDB'));
        this.artworkHandler = new ArtworkHandler(this, this.cacheService, at('TVDB'));
        this.catalogTransformer = new CatalogTransformer(this.contentFetcher, this.translationService, this.artworkHandler, this.cacheService, at('SEARCH'));
        this.metadataTransformer = new MetadataTransformer(
            this.contentFetcher,
            this.translationService,
            this.artworkHandler,
            at('META')
        );

        this.updatesService = new UpdatesService(this, this.cacheService, at('UPDATES'));
    }

    /**
     * Start the TVDB service including updates monitoring
     */
    async start() {
        await this.ensureValidToken();
        
        this.updatesService.start();
        
        this.logger.info(`✅ TVDB authenticated, updates every ${Math.round(this.updatesService.updateInterval / 3600000)}h`);
    }

    stop() {
        this.logger.info('🛑 Stopping TVDB service...');
        this.updatesService.stop();
        this.logger.info('✅ TVDB service stopped');
    }

    async authenticate() {
        try {
            const response = await this.http.post(`${this.baseURL}/login`, {
                apikey: this.apiKey
            });

            this.token = response.data.data.token;
            this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            
            this.tvdbLogger.debug('authenticated with TVDB');
            return this.token;
        } catch (error) {
            this.tvdbLogger.error(`TVDB authentication failed → ${error.response?.data?.message || error.message}`);
            throw new Error('Failed to authenticate with TVDB API');
        }
    }

    async ensureValidToken() {
        if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) return this.token;

        if (!this.authInFlight) {
            this.authInFlight = this.authenticate().finally(() => { this.authInFlight = null; });
        }
        await this.authInFlight;
        return this.token;
    }

    traceCall(endpoint, params, outcome, started) {
        const query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
        const message = `GET ${endpoint}${query ? `?${query}` : ''} → ${outcome}`;
        if (this.tvdbLogger.event) {
            this.tvdbLogger.event({ level: 'debug', ms: Date.now() - started, message });
        } else {
            this.tvdbLogger.debug(message);
        }
    }

    async makeRequest(endpoint, params = {}) {
        await this.ensureValidToken();
        context.countCall();
        const started = Date.now();

        const send = () => this.http.get(`${this.baseURL}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/json'
            },
            params
        });

        try {
            const response = await send();
            this.traceCall(endpoint, params, response.status, started);
            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                this.tvdbLogger.info('🔄 Token expired, refreshing...');
                await this.authenticate();

                const retryResponse = await send();
                this.traceCall(endpoint, params, `${retryResponse.status} after refresh`, started);
                return retryResponse.data;
            }

            if (error.response?.status === 404) {
                this.traceCall(endpoint, params, 404, started);
            } else {
                const detail = error.response?.data?.message || error.message;
                const message = `TVDB API error for ${endpoint} → ${detail}`;
                if (this.tvdbLogger.event) {
                    this.tvdbLogger.event({ level: 'error', marker: 'error', ms: Date.now() - started, message });
                } else {
                    this.tvdbLogger.error(message);
                }
            }
            throw error;
        }
    }

    async search(query, type = null, limit = 20, userLanguage = 'eng') {
        const cacheKey = `search:${type || 'all'}:${userLanguage}:${query.toLowerCase().trim()}`;
        
        let cachedResults;
        if (this.cacheService.getCachedData) {
            cachedResults = await this.cacheService.getCachedData('search', cacheKey);
        } else {
            cachedResults = this.cacheService.getSearchResults(query, type || 'all', userLanguage);
        }
        
        if (cachedResults) {
            return cachedResults;
        }

        const params = {
            query: query.trim(),
            limit
        };

        if (type && (type === 'movie' || type === 'series')) {
            params.type = type;
        }

        try {
            const response = await this.makeRequest('/search', params);
            // TVDB returns no relevance order, so rank before caching: warm searches pay nothing.
            const results = rankSearchResults(response.data || [], query);
            
            if (this.cacheService.setCachedData) {
                const cacheTTL = 2 * 60 * 60 * 1000; // 2 hours
                await this.cacheService.setCachedData('search', cacheKey, results, cacheTTL);
            } else {
                this.cacheService.setSearchResults(query, type || 'all', userLanguage, results);
            }
            
            return results;
        } catch (error) {
            this.logger.error('Search error:', error.message);
            return [];
        }
    }

    async searchBoth(query, limit = 20, userLanguage = 'eng') {
        try {
            const [movieResults, seriesResults] = await Promise.all([
                this.search(query, 'movie', limit, userLanguage),
                this.search(query, 'series', limit, userLanguage)
            ]);

            return {
                movies: movieResults,
                series: seriesResults,
                total: movieResults.length + seriesResults.length
            };
        } catch (error) {
            this.logger.error('Parallel search error:', error.message);
            return { movies: [], series: [], total: 0 };
        }
    }

    clearCache() {
        if (this.cacheService.clearAll) {
            this.cacheService.clearAll();
        } else if (this.cacheService.clearByPattern) {
            this.cacheService.clearByPattern('');
        }
    }

    getCacheStats() {
        return this.cacheService.getStats();
    }

    async getMovieDetails(movieId) {
        return this.contentFetcher.getMovieDetails(movieId);
    }

    async getSeriesDetails(seriesId) {
        return this.contentFetcher.getSeriesDetails(seriesId);
    }

    async getSeriesSeasons(seriesId) {
        return this.contentFetcher.getSeriesSeasons(seriesId);
    }

    async getSeriesEpisodes(seriesId, seasonType = 'default') {
        return this.contentFetcher.getSeriesEpisodes(seriesId, seasonType);
    }

    async getSeriesExtended(seriesId) {
        return this.contentFetcher.getSeriesExtended(seriesId);
    }

    extractImdbId(item) {
        return this.contentFetcher.extractImdbId(item);
    }

    async getTvdbIdFromImdbId(imdbId, contentType) {
        return this.contentFetcher.getTvdbIdFromImdbId(imdbId, contentType);
    }

    async getArtwork(entityType, entityId, language = 'eng') {
        return this.artworkHandler.getArtwork(entityType, entityId, language);
    }

    async getTranslation(entityType, entityId, tvdbLanguage) {
        return this.translationService.getTranslation(entityType, entityId, tvdbLanguage);
    }

    mapToTvdbLanguage(userLanguage) {
        return this.translationService.mapToTvdbLanguage(userLanguage);
    }

    selectPreferredTranslationFromObject(translationsObj, userLanguage = null) {
        return this.translationService.selectPreferredTranslation(translationsObj, userLanguage);
    }

    async transformSearchResults(results, type, userLanguage = null) {
        const metas = this.catalogTransformer.transformSearchResults(results, type, userLanguage);
        return this.catalogTransformer.upgradePosters(metas, type, userLanguage);
    }

    transformToStremioMeta(item, userLanguage = null) {
        return this.catalogTransformer.buildMetaFromSearchItem(item, userLanguage);
    }

    async transformDetailedToStremioMeta(item, type, seasonsData = null, tvdbLanguage = 'eng') {
        
        const itemId = item.id || item.tvdb_id;
        const cacheKey = `meta:enhanced:${itemId}:${type}:${tvdbLanguage}`;
        
        try {
            const cachedMeta = await this.cacheService.getCachedData('metadata', cacheKey);
            if (cachedMeta && !cachedMeta.notFound) {
                return cachedMeta;
            }
        } catch (error) {
            this.logger.error(`Cache error for enhanced metadata: ${error.message}`);
        }
        
        const meta = await this.metadataTransformer.transformDetailedToStremioMeta(item, type, seasonsData, tvdbLanguage);
        
        if (!meta) {
            return null;
        }
        
        if (this.ratingService && meta && meta.imdb_id) {
            try {
                const ratingData = await this.ratingService.getImdbRating(meta.imdb_id, type);
                if (ratingData && !ratingData.notFound) {
                    if (ratingData.imdb_rating) {
                        meta.imdbRating = String(ratingData.imdb_rating);
                    }
                    if (!meta.votes && ratingData.imdb_votes) {
                        meta.votes = ratingData.imdb_votes;
                    }
                    if (ratingData.metascore) {
                        meta.metascore = ratingData.metascore;
                    }
                    if (ratingData.rotten_tomatoes) {
                        meta.rottenTomatoes = ratingData.rotten_tomatoes;
                    }
                    if (ratingData.plot && (!meta.description || meta.description.length < 100)) {
                        meta.description = ratingData.plot;
                    }
                    if (!meta.runtime && ratingData.runtime) {
                        meta.runtime = ratingData.runtime;
                    }
                    if (!meta.genre && ratingData.genre) {
                        meta.genre = ratingData.genre.split(', ');
                    }
                    if (!meta.director && ratingData.director) {
                        meta.director = ratingData.director.split(', ');
                    }
                    if (ratingData.awards) {
                        meta.awards = ratingData.awards;
                    }
                    if (ratingData.external_ids) {
                        meta.external_ids = { ...meta.external_ids, ...ratingData.external_ids };
                    }
                } else {
                    this.metaLogger.debug(`ℹ️  No IMDb rating data found for ${meta.imdb_id}`);
                }
            } catch (error) {
                this.logger.error(`failed to enrich ratings for ${meta.imdb_id} → ${error.message}`);
            }
        }
        
        // Cache the enhanced metadata (longer TTL since it includes external data)
        const TTL = 24 * 60 * 60 * 1000; // 24 hours in ms
        try {
            await this.cacheService.setCachedData('metadata', cacheKey, meta, TTL);
        } catch (error) {
            this.logger.error(`Failed to cache enhanced metadata: ${error.message}`);
        }
        
        return meta;
    }

}

module.exports = TVDBService;

