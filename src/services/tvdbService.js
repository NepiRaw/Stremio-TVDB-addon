const axios = require('axios');
const ContentFetcher = require('./tvdb/contentFetcher');
const TranslationService = require('./tvdb/translationService');
const ArtworkHandler = require('./tvdb/artworkHandler');
const CatalogTransformer = require('./tvdb/catalogTransformer');
const MetadataTransformer = require('./tvdb/metadataTransformer');
const UpdatesService = require('./tvdb/updatesService');
const { getEnhancedReleaseInfo } = require('../utils/theatricalStatus');

class TVDBService {
    constructor(cacheService) {
        this.baseURL = process.env.TVDB_BASE_URL || 'https://api4.thetvdb.com/v4';
        this.cacheService = cacheService;
        this.apiKey = process.env.TVDB_API_KEY;
        this.token = null;
        this.tokenExpiry = null;
        
        if (!this.apiKey) {
            throw new Error('TVDB_API_KEY environment variable is required');
        }

        // Initialize modular services
        this.contentFetcher = new ContentFetcher(this, this.cacheService);
        this.translationService = new TranslationService(this, this.cacheService);
        this.artworkHandler = new ArtworkHandler(this, this.cacheService);
        this.catalogTransformer = new CatalogTransformer(this.contentFetcher, this.translationService, this.artworkHandler, this.cacheService);
        this.metadataTransformer = new MetadataTransformer(
            this.contentFetcher, 
            this.translationService, 
            this.artworkHandler
        );
        
        // Initialize updates service for intelligent cache invalidation
        this.updatesService = new UpdatesService(this, this.cacheService);
    }

    /**
     * Start the TVDB service including updates monitoring
     */
    async start() {
        console.log('🚀 Starting TVDB service...');
        
        // Ensure authentication
        await this.ensureValidToken();
        
        // Start updates monitoring
        this.updatesService.start();
        
        console.log('✅ TVDB service started with updates monitoring');
    }

    /**
     * Stop the TVDB service
     */
    stop() {
        console.log('🛑 Stopping TVDB service...');
        this.updatesService.stop();
        console.log('✅ TVDB service stopped');
    }

    /**
     * Authenticate with TVDB API and get JWT token
     */
    async authenticate() {
        try {
            const response = await axios.post(`${this.baseURL}/login`, {
                apikey: this.apiKey
            });

            this.token = response.data.data.token;
            this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            
            console.log('✅ TVDB authentication successful');
            return this.token;
        } catch (error) {
            console.error('❌ TVDB authentication failed:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with TVDB API');
        }
    }

    /**
     * Check if current token is valid and refresh if needed
     */
    async ensureValidToken() {
        if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
            await this.authenticate();
        }
        return this.token;
    }

    /**
     * Make authenticated API request to TVDB
     */
    async makeRequest(endpoint, params = {}) {
        await this.ensureValidToken();

        try {
            const response = await axios.get(`${this.baseURL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                },
                params
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('🔄 Token expired, refreshing...');
                await this.authenticate();
                
                const retryResponse = await axios.get(`${this.baseURL}${endpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/json'
                    },
                    params
                });
                
                return retryResponse.data;
            }
            
            console.error(`❌ TVDB API error for ${endpoint}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Search for content in TVDB with enhanced performance and caching
     */
    async search(query, type = null, limit = 20, userLanguage = 'eng') {
        // Generate cache key
        const cacheKey = `search:${type || 'all'}:${userLanguage}:${query.toLowerCase().trim()}`;
        
        // Check cache first - handle both in-memory and hybrid cache
        let cachedResults;
        if (this.cacheService.getCachedData) {
            // Hybrid cache
            cachedResults = await this.cacheService.getCachedData('search', cacheKey);
        } else {
            // In-memory cache
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
            const results = response.data || [];
            
            // Cache the results - handle both in-memory and hybrid cache
            if (this.cacheService.setCachedData) {
                // Hybrid cache
                const cacheTTL = 2 * 60 * 60 * 1000; // 2 hours
                await this.cacheService.setCachedData('search', cacheKey, results, cacheTTL);
            } else {
                // In-memory cache
                this.cacheService.setSearchResults(query, type || 'all', userLanguage, results);
            }
            
            return results;
        } catch (error) {
            console.error('Search error:', error.message);
            return [];
        }
    }

    /**
     * Search both movies and series in parallel for unified results with caching
     */
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
            console.error('Parallel search error:', error.message);
            return { movies: [], series: [], total: 0 };
        }
    }

    /**
     * Clear all caches (for testing and debugging)
     */
    clearCache() {
        if (this.cacheService.clearAll) {
            this.cacheService.clearAll();
        } else if (this.cacheService.clearByPattern) {
            // Hybrid cache - clear all patterns
            this.cacheService.clearByPattern('');
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.cacheService.getStats();
    }

    // Delegated methods for backward compatibility and clean API

    /**
     * Get movie details (delegated to ContentFetcher)
     */
    async getMovieDetails(movieId) {
        return this.contentFetcher.getMovieDetails(movieId);
    }

    /**
     * Get series details (delegated to ContentFetcher)
     */
    async getSeriesDetails(seriesId) {
        return this.contentFetcher.getSeriesDetails(seriesId);
    }

    /**
     * Get series seasons (delegated to ContentFetcher)
     */
    async getSeriesSeasons(seriesId) {
        return this.contentFetcher.getSeriesSeasons(seriesId);
    }

    /**
     * Get series episodes (delegated to ContentFetcher)
     */
    async getSeriesEpisodes(seriesId, seasonType = 'default') {
        return this.contentFetcher.getSeriesEpisodes(seriesId, seasonType);
    }

    /**
     * Get series extended (delegated to ContentFetcher)
     */
    async getSeriesExtended(seriesId) {
        return this.contentFetcher.getSeriesExtended(seriesId);
    }

    /**
     * Extract IMDB ID (delegated to ContentFetcher)
     */
    extractImdbId(item) {
        return this.contentFetcher.extractImdbId(item);
    }

    /**
     * Get artwork (delegated to ArtworkHandler)
     */
    async getArtwork(entityType, entityId, language = 'eng') {
        return this.artworkHandler.getArtwork(entityType, entityId, language);
    }

    /**
     * Get translation (delegated to TranslationService)
     */
    async getTranslation(entityType, entityId, tvdbLanguage) {
        return this.translationService.getTranslation(entityType, entityId, tvdbLanguage);
    }

    /**
     * Map to TVDB language (delegated to TranslationService)
     */
    mapToTvdbLanguage(userLanguage) {
        return this.translationService.mapToTvdbLanguage(userLanguage);
    }

    /**
     * Select preferred translation (delegated to TranslationService)
     */
    selectPreferredTranslationFromObject(translationsObj, userLanguage = null) {
        return this.translationService.selectPreferredTranslation(translationsObj, userLanguage);
    }

    /**
     * Transform search results (delegated to CatalogTransformer)
     */
    async transformSearchResults(results, type, userLanguage = null) {
        return this.catalogTransformer.transformSearchResults(results, type, userLanguage);
    }

    /**
     * Transform search item to Stremio meta (delegated to CatalogTransformer)
     */
    transformSearchItemToStremioMeta(item, userLanguage = null) {
        return this.catalogTransformer.transformSearchItemToStremioMeta(item, userLanguage);
    }

    /**
     * Transform to Stremio meta (backward compatibility)
     */
    transformToStremioMeta(item, userLanguage = null) {
        return this.catalogTransformer.transformSearchItemToStremioMeta(item, userLanguage);
    }

    /**
     * Transform detailed to Stremio meta (delegated to MetadataTransformer)
     */
    async transformDetailedToStremioMeta(item, type, seasonsData = null, tvdbLanguage = 'eng') {
        return this.metadataTransformer.transformDetailedToStremioMeta(item, type, seasonsData, tvdbLanguage);
    }

}

module.exports = TVDBService;

