const axios = require('axios');
const ContentFetcher = require('./tvdb/contentFetcher');
const TranslationService = require('./tvdb/translationService');
const ArtworkHandler = require('./tvdb/artworkHandler');
const CatalogTransformer = require('./tvdb/catalogTransformer');
const MetadataTransformer = require('./tvdb/metadataTransformer');
const UpdatesService = require('./tvdb/updatesService');
const { getEnhancedReleaseInfo } = require('../utils/theatricalStatus');

class TVDBService {
    constructor(cacheService, ratingService = null) {
        this.baseURL = process.env.TVDB_BASE_URL || 'https://api4.thetvdb.com/v4';
        this.cacheService = cacheService;
        this.ratingService = ratingService; // Optional rating service for IMDb ratings enhancement
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
            this.artworkHandler,
            this.ratingService
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
        const catalogResults = await this.catalogTransformer.transformSearchResults(results, type, userLanguage);
        
        return catalogResults;
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
     * Transform TVDB detailed data to Stremio meta format and enrich with IMDb ratings
     */
    async transformDetailedToStremioMeta(item, type, seasonsData = null, tvdbLanguage = 'eng') {
        // Create cache key based on item ID, type, and language
        const itemId = item.id || item.tvdb_id;
        const cacheKey = `meta:enhanced:${itemId}:${type}:${tvdbLanguage}`;
        
        // Try to get from cache first
        try {
            const cachedMeta = await this.cacheService.getCachedData('metadata', cacheKey);
            if (cachedMeta && !cachedMeta.notFound) {
                console.log(`✅ Enhanced metadata cache hit for ${item.name || itemId}`);
                return cachedMeta;
            }
        } catch (error) {
            console.error(`Cache error for enhanced metadata: ${error.message}`);
        }
        
        // Get the base metadata from the transformer
        const meta = await this.metadataTransformer.transformDetailedToStremioMeta(item, type, seasonsData, tvdbLanguage);
        
        if (!meta) {
            return null;
        }
        
        // Enrich with IMDb ratings if available
        if (this.ratingService && meta && meta.imdb_id) {
            try {
                console.log(`🎬 Enriching ${meta.name} (${meta.imdb_id}) with IMDb ratings...`);
                
                const ratingData = await this.ratingService.getImdbRating(meta.imdb_id, type);
                
                if (ratingData && !ratingData.notFound) {
                    // Add IMDb rating data to the meta object
                    if (ratingData.imdb_rating) {
                        meta.imdbRating = ratingData.imdb_rating;
                    }
                    
                    // Add vote count if available and not already present
                    if (!meta.votes && ratingData.imdb_votes) {
                        meta.votes = ratingData.imdb_votes;
                    }
                    
                    // Add additional metadata if available
                    if (ratingData.metascore) {
                        meta.metascore = ratingData.metascore;
                    }
                    
                    if (ratingData.rotten_tomatoes) {
                        meta.rottenTomatoes = ratingData.rotten_tomatoes;
                    }
                    
                    // Enhance description with plot if available and current description is short
                    if (ratingData.plot && (!meta.description || meta.description.length < 100)) {
                        meta.description = ratingData.plot;
                    }
                    
                    // Add runtime if not present
                    if (!meta.runtime && ratingData.runtime) {
                        meta.runtime = ratingData.runtime;
                    }
                    
                    // Add genre if not present
                    if (!meta.genre && ratingData.genre) {
                        meta.genre = ratingData.genre.split(', ');
                    }
                    
                    // Add director if not present
                    if (!meta.director && ratingData.director) {
                        meta.director = ratingData.director.split(', ');
                    }
                    
                    // Add awards if available
                    if (ratingData.awards) {
                        meta.awards = ratingData.awards;
                    }
                    
                    // Merge external IDs from rating service
                    if (ratingData.external_ids) {
                        meta.external_ids = { ...meta.external_ids, ...ratingData.external_ids };
                    }
                    
                    console.log(`✨ IMDb enhanced: ${meta.name} - Rating: ${ratingData.imdb_rating}/10 (${ratingData.imdb_votes} votes) via ${ratingData.source}`);
                } else {
                    console.log(`ℹ️  No IMDb rating data found for ${meta.imdb_id}`);
                }
            } catch (error) {
                console.error(`❌ Failed to enrich metadata with IMDb ratings for ${meta.imdb_id}:`, error.message);
                // Don't fail the entire request if rating enhancement fails
            }
        }
        
        // Cache the enhanced metadata (longer TTL since it includes external data)
        const TTL = 24 * 60 * 60; // 24 hours
        try {
            await this.cacheService.setCachedData('metadata', cacheKey, meta, TTL);
            console.log(`📦 Cached enhanced metadata for ${meta.name || itemId} (24h TTL)`);
        } catch (error) {
            console.error(`Failed to cache enhanced metadata: ${error.message}`);
        }
        
        return meta;
    }

}

module.exports = TVDBService;

