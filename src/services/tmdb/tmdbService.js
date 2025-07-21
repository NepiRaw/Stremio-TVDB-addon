/**
 * TMDB Service
 * Handles The Movie Database API integration for catalog data
 * Optimized for performance with longer cache TTL and parallelized requests
 */

const axios = require('axios');
const CATALOG_CONFIG = require('../../config/catalogConfig');

class TMDBService {
    constructor(cacheService) {
        this.baseURL = 'https://api.themoviedb.org/3';
        this.apiKey = process.env.TMDB_API_KEY;
        this.cacheService = cacheService;
        
        if (!this.apiKey) {
            throw new Error('TMDB_API_KEY environment variable is required');
        }
        
        // Debug cache service
        if (!this.cacheService) {
            console.error('❌ TMDBService: cacheService is undefined!');
        } else {
            console.log(`✅ TMDBService: cacheService initialized (type: ${typeof this.cacheService})`);
        }
        
        // Rate limiting configuration for better performance
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.maxRequestsPerSecond = 40; // TMDB allows 40 requests per 10 seconds
        this.requestInterval = 250; // 250ms between requests (4 per second)
        
        // Statistics tracking
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0,
            startTime: Date.now()
        };
    }

    /**
     * Build TMDB API URL with authentication
     */
    buildUrl(endpoint, params = {}) {
        const url = new URL(`${this.baseURL}${endpoint}`);
        url.searchParams.set('api_key', this.apiKey);
        url.searchParams.set('language', 'en-US');
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value);
            }
        }
        
        return url.toString();
    }

    /**
     * Make authenticated request to TMDB API with error handling and rate limiting
     */
    async makeRequest(endpoint, params = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                endpoint,
                params,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            this.processQueue();
        });
    }

    /**
     * Process request queue with rate limiting for optimal performance
     */
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();
            
            try {
                const url = this.buildUrl(request.endpoint, request.params);
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Stremio-TVDB-Addon/1.0'
                    }
                });
                
                this.stats.totalRequests++;
                request.resolve(response.data);
                
            } catch (error) {
                this.stats.errors++;
                
                if (error.response) {
                    console.error(`TMDB API error ${error.response.status}:`, error.response.data);
                    request.reject(new Error(`TMDB API error: ${error.response.status}`));
                } else if (error.code === 'ECONNABORTED') {
                    console.error('TMDB API timeout');
                    request.reject(new Error('TMDB API timeout'));
                } else {
                    console.error('TMDB API request failed:', error.message);
                    request.reject(new Error('TMDB API request failed'));
                }
            }

            // Rate limiting delay
            if (this.requestQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.requestInterval));
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Get catalog data with parallelized processing for better performance
     */
    async getCatalog(type, category, page = 1, limit = 20) {
        // Validate inputs
        if (!['movie', 'tv'].includes(type)) {
            throw new Error('Invalid type. Must be "movie" or "tv"');
        }

        const validCategories = ['popular', 'trending', 'top_rated', 'latest', 'discover'];
        if (!validCategories.includes(category)) {
            throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        }

        // Generate cache key
        const cacheKey = `tmdb:catalog:${type}:${category}:page:${page}`;
        
        // Check cache first
        const cached = await this.getCachedData(cacheKey);
        if (cached) {
            console.log(`💾 TMDB catalog cache HIT for ${type}:${category}:${page}`);
            this.stats.cacheHits++;
            return cached;
        }

        this.stats.cacheMisses++;

        try {
            let endpoint, params = { page };
            
            // Map categories to TMDB endpoints
            switch (category) {
                case 'popular':
                    endpoint = type === 'movie' ? '/movie/popular' : '/tv/popular';
                    break;
                case 'trending':
                    endpoint = `/trending/${type}/week`;
                    break;
                case 'top_rated':
                    endpoint = type === 'movie' ? '/movie/top_rated' : '/tv/top_rated';
                    break;
                case 'latest':
                    endpoint = type === 'movie' ? '/movie/now_playing' : '/tv/airing_today';
                    break;
                case 'discover':
                    endpoint = type === 'movie' ? '/discover/movie' : '/discover/tv';
                    params.sort_by = 'popularity.desc';
                    break;
                default:
                    throw new Error(`Unsupported category: ${category}`);
            }

            console.log(`🎬 Fetching TMDB catalog: ${type}:${category}:${page}`);
            const data = await this.makeRequest(endpoint, params);
            
            // Limit results to requested amount
            if (data.results && data.results.length > limit) {
                data.results = data.results.slice(0, limit);
            }

            // Cache the results with optimized TTL
            const ttl = this.getCacheTTL(category);
            await this.setCachedData(cacheKey, data, ttl);
            
            console.log(`✅ TMDB catalog fetched: ${data.results?.length || 0} items`);
            return data;

        } catch (error) {
            console.error(`Failed to fetch TMDB catalog ${type}:${category}:`, error.message);
            
            // Try to return stale cached data if available
            const staleData = await this.getCachedData(cacheKey, true);
            if (staleData) {
                console.log(`🔄 Returning stale TMDB catalog data for ${type}:${category}`);
                return staleData;
            }
            
            throw error;
        }
    }

    /**
     * Get external IDs for multiple TMDB items in parallel for better performance
     */
    async getExternalIdsBatch(items) {
        const promises = items.map(item => 
            this.getExternalIds(item.media_type || 'movie', item.id)
                .catch(error => {
                    console.warn(`Failed to get external IDs for ${item.id}:`, error.message);
                    return null;
                })
        );

        const results = await Promise.allSettled(promises);
        return results.map((result, index) => ({
            tmdbId: items[index].id,
            externalIds: result.status === 'fulfilled' ? result.value : null
        }));
    }

    /**
     * Get external IDs for a TMDB item (including TVDB ID)
     */
    async getExternalIds(type, tmdbId) {
        // Validate inputs
        if (!['movie', 'tv'].includes(type)) {
            throw new Error('Invalid type. Must be "movie" or "tv"');
        }

        if (!tmdbId || isNaN(tmdbId)) {
            throw new Error('Valid TMDB ID is required');
        }

        // Generate cache key with longer TTL for stable data
        const cacheKey = `tmdb:external:${type}:${tmdbId}`;
        
        // Check cache first
        const cached = await this.getCachedData(cacheKey);
        if (cached) {
            console.log(`💾 TMDB external IDs cache HIT for ${type}:${tmdbId}`);
            this.stats.cacheHits++;
            return cached;
        }

        this.stats.cacheMisses++;

        try {
            const endpoint = `/${type}/${tmdbId}/external_ids`;
            console.log(`🔗 Fetching TMDB external IDs: ${type}:${tmdbId}`);
            
            const data = await this.makeRequest(endpoint);
            
            // Cache with 24 hour TTL (external IDs are very stable)
            await this.setCachedData(cacheKey, data, 24 * 60 * 60 * 1000);
            
            console.log(`✅ TMDB external IDs fetched for ${type}:${tmdbId}:`, {
                tvdb_id: data.tvdb_id,
                imdb_id: data.imdb_id
            });
            
            return data;

        } catch (error) {
            console.error(`Failed to fetch TMDB external IDs for ${type}:${tmdbId}:`, error.message);
            
            // Try to return stale cached data
            const staleData = await this.getCachedData(cacheKey, true);
            if (staleData) {
                console.log(`🔄 Returning stale external IDs for ${type}:${tmdbId}`);
                return staleData;
            }
            
            throw error;
        }
    }

    /**
     * Get optimized cache TTL based on category using shared configuration
     */
    getCacheTTL(category) {
        // Use shared configuration for cache TTL
        const categoryConfig = CATALOG_CONFIG.categories[category];
        if (categoryConfig && categoryConfig.cacheTTL) {
            return categoryConfig.cacheTTL;
        }
        
        // Fallback to 12 hours for unknown categories
        return 12 * 60 * 60 * 1000;
    }

    /**
     * Cache abstraction for different cache implementations
     */
    async getCachedData(key, allowStale = false) {
        try {
            if (!this.cacheService) {
                console.error('Cache get error: cacheService is undefined');
                return null;
            }
            
            if (this.cacheService.getCachedData) {
                // Hybrid cache implementation
                return await this.cacheService.getCachedData('tmdb', key, allowStale);
            } else if (this.cacheService.getImdbValidation) {
                // Legacy cache fallback
                return await this.cacheService.getCachedData('tmdb', key, allowStale);
            } else {
                console.error('Cache get error: No valid cache method found on cacheService');
                return null;
            }
        } catch (error) {
            console.error('Cache get error:', error.message);
        }
        
        return null;
    }

    /**
     * Set cached data with TTL
     */
    async setCachedData(key, data, ttl) {
        try {
            if (!this.cacheService) {
                console.error('Cache set error: cacheService is undefined');
                return;
            }
            
            if (this.cacheService.setCachedData) {
                // Hybrid cache implementation
                await this.cacheService.setCachedData('tmdb', key, data, ttl);
            } else if (this.cacheService.setImdbValidation) {
                // Legacy cache fallback - use appropriate cache method
                await this.cacheService.setCachedData('tmdb', key, data, ttl);
            } else {
                console.error('Cache set error: No valid cache method found on cacheService');
            }
        } catch (error) {
            console.error('Cache set error:', error.message);
        }
    }

    /**
     * Get service statistics for monitoring
     */
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        const cacheHitRate = this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100;
        
        return {
            name: 'TMDB Service',
            uptime: Math.round(uptime / 1000),
            requests: {
                total: this.stats.totalRequests,
                errors: this.stats.errors,
                successRate: ((this.stats.totalRequests - this.stats.errors) / this.stats.totalRequests * 100).toFixed(1) + '%'
            },
            cache: {
                hits: this.stats.cacheHits,
                misses: this.stats.cacheMisses,
                hitRate: isNaN(cacheHitRate) ? '0.0%' : cacheHitRate.toFixed(1) + '%'
            },
            queue: {
                pending: this.requestQueue.length,
                processing: this.isProcessingQueue
            }
        };
    }
}

module.exports = TMDBService;
