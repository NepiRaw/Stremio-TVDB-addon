/**
 * TVDB API Service - Refactored Core
 * Clean, modular service with delegated responsibilities
 */

const axios = require('axios');
const ContentFetcher = require('./tvdb/contentFetcher');
const TranslationService = require('./tvdb/translationService');
const ArtworkHandler = require('./tvdb/artworkHandler');
const CatalogTransformer = require('./tvdb/catalogTransformer');
const MetadataTransformer = require('./tvdb/metadataTransformer');
const { getEnhancedReleaseInfo } = require('../utils/theatricalStatus');

class TVDBService {
    constructor() {
        this.baseURL = process.env.TVDB_BASE_URL || 'https://api4.thetvdb.com/v4';
        this.apiKey = process.env.TVDB_API_KEY;
        this.token = null;
        this.tokenExpiry = null;
        
        if (!this.apiKey) {
            throw new Error('TVDB_API_KEY environment variable is required');
        }

        // Initialize modular services
        this.contentFetcher = new ContentFetcher(this);
        this.translationService = new TranslationService(this);
        this.artworkHandler = new ArtworkHandler(this);
        this.catalogTransformer = new CatalogTransformer(this.contentFetcher, this.translationService, this.artworkHandler);
        this.metadataTransformer = new MetadataTransformer(
            this.contentFetcher, 
            this.translationService, 
            this.artworkHandler
        );
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
     * Search for content in TVDB
     */
    async search(query, type = null, limit = 20) {
        const params = {
            query: query.trim(),
            limit
        };

        if (type && (type === 'movie' || type === 'series')) {
            params.type = type;
        }

        try {
            const response = await this.makeRequest('/search', params);
            return response.data || [];
        } catch (error) {
            console.error('Search error:', error.message);
            return [];
        }
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

module.exports = new TVDBService();
