/**
 * Enhanced In-Memory Cache Service
 * Provides comprehensive caching for all TVDB data types
 * Future-proof design for MongoDB migration
 */

class CacheService {
    constructor() {
        // Different caches for different data types
        this.searchCache = new Map();           // Search results
        this.imdbCache = new Map();            // IMDB validation
        this.artworkCache = new Map();         // Artwork data (posters, backgrounds, etc.)
        this.translationCache = new Map();     // Language translations
        this.metadataCache = new Map();        // Full content metadata
        this.seasonCache = new Map();          // Season/episode data
        this.staticCache = new Map();          // Genres, types, etc.
        
        // Cache TTL configurations (optimized for different data types)
        this.CACHE_TTLS = {
            search: 2 * 60 * 60 * 1000,        // 2 hours - searches are popular, but results can change
            imdb: 7 * 24 * 60 * 60 * 1000,     // 7 days - IMDB IDs + metadata rarely change
            artwork: 14 * 24 * 60 * 60 * 1000, // 14 days - artwork is very static
            translation: 3 * 24 * 60 * 60 * 1000, // 3 days - translations rarely update
            metadata: 12 * 60 * 60 * 1000,     // 12 hours - basic metadata updates infrequently
            season: 6 * 60 * 60 * 1000,        // 6 hours - episodes update occasionally
            static: 30 * 24 * 60 * 60 * 1000   // 30 days - genres/types are very static
        };
        
        // Future /updates endpoint configuration
        this.UPDATES_CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours - adjustable sync interval
        
        // Start cleanup interval
        this.startCleanupInterval();
    }

    /**
     * Generic cache getter (future-proof for MongoDB)
     */
    getCachedData(cacheMap, key) {
        const cached = cacheMap.get(key);
        
        if (cached && Date.now() < cached.expiry) {
            console.log(`💾 Cache HIT: ${key}`);
            return cached.data;
        }
        
        if (cached) {
            cacheMap.delete(key); // Remove expired entry
        }
        
        console.log(`🔍 Cache MISS: ${key}`);
        return null;
    }

    /**
     * Generic cache setter (future-proof for MongoDB)
     */
    setCachedData(cacheMap, key, data, ttl) {
        const entry = {
            data: data,
            expiry: Date.now() + ttl,
            timestamp: Date.now(),
            type: this.getCacheTypeFromKey(key)
        };
        
        cacheMap.set(key, entry);
        console.log(`💾 Cached data: ${key} (TTL: ${Math.round(ttl / 60000)}min)`);
    }

    /**
     * Helper to identify cache type from key (useful for MongoDB migration)
     */
    getCacheTypeFromKey(key) {
        return key.split(':')[0];
    }

    // ==================== SEARCH CACHE ====================

    /**
     * Generate cache key for search queries
     */
    generateSearchKey(query, type, language = 'eng') {
        return `search:${type}:${language}:${query.toLowerCase().trim()}`;
    }

    /**
     * Get cached search results
     */
    getSearchResults(query, type, language = 'eng') {
        const key = this.generateSearchKey(query, type, language);
        return this.getCachedData(this.searchCache, key);
    }

    /**
     * Cache search results
     */
    setSearchResults(query, type, language = 'eng', results) {
        const key = this.generateSearchKey(query, type, language);
        this.setCachedData(this.searchCache, key, results, this.CACHE_TTLS.search);
    }

    // ==================== IMDB CACHE ====================

    /**
     * Generate cache key for IMDB validation
     */
    generateImdbKey(contentType, contentId) {
        return `imdb:${contentType}:${contentId}`;
    }

    /**
     * Get cached IMDB validation result
     */
    getImdbValidation(contentType, contentId) {
        const key = this.generateImdbKey(contentType, contentId);
        return this.getCachedData(this.imdbCache, key);
    }

    /**
     * Cache IMDB validation result
     */
    setImdbValidation(contentType, contentId, isValid, detailData = null) {
        const key = this.generateImdbKey(contentType, contentId);
        this.setCachedData(this.imdbCache, key, { isValid, detailData }, this.CACHE_TTLS.imdb);
    }

    // ==================== ARTWORK CACHE ====================

    /**
     * Generate cache key for artwork
     */
    generateArtworkKey(contentType, contentId, artworkType = 'all') {
        return `artwork:${contentType}:${contentId}:${artworkType}`;
    }

    /**
     * Get cached artwork data
     */
    getArtwork(contentType, contentId, artworkType = 'all') {
        const key = this.generateArtworkKey(contentType, contentId, artworkType);
        return this.getCachedData(this.artworkCache, key);
    }

    /**
     * Cache artwork data
     */
    setArtwork(contentType, contentId, artworkType = 'all', artworkData) {
        const key = this.generateArtworkKey(contentType, contentId, artworkType);
        this.setCachedData(this.artworkCache, key, artworkData, this.CACHE_TTLS.artwork);
    }

    // ==================== TRANSLATION CACHE ====================

    /**
     * Generate cache key for translations
     */
    generateTranslationKey(contentType, contentId, language, dataType = 'all') {
        return `translation:${contentType}:${contentId}:${language}:${dataType}`;
    }

    /**
     * Get cached translation data
     */
    getTranslation(contentType, contentId, language, dataType = 'all') {
        const key = this.generateTranslationKey(contentType, contentId, language, dataType);
        return this.getCachedData(this.translationCache, key);
    }

    /**
     * Cache translation data
     */
    setTranslation(contentType, contentId, language, dataType = 'all', translationData) {
        const key = this.generateTranslationKey(contentType, contentId, language, dataType);
        this.setCachedData(this.translationCache, key, translationData, this.CACHE_TTLS.translation);
    }

    // ==================== METADATA CACHE ====================

    /**
     * Generate cache key for metadata
     */
    generateMetadataKey(contentType, contentId, language = null) {
        return language ? `metadata:${contentType}:${contentId}:${language}` : `metadata:${contentType}:${contentId}`;
    }

    /**
     * Get cached metadata
     */
    getMetadata(contentType, contentId, language = null) {
        const key = this.generateMetadataKey(contentType, contentId, language);
        return this.getCachedData(this.metadataCache, key);
    }

    /**
     * Cache metadata
     */
    setMetadata(contentType, contentId, language = null, metadata) {
        const key = this.generateMetadataKey(contentType, contentId, language);
        this.setCachedData(this.metadataCache, key, metadata, this.CACHE_TTLS.metadata);
    }

    // ==================== SEASON CACHE ====================

    /**
     * Generate cache key for season data
     */
    generateSeasonKey(seriesId, seasonNumber = null) {
        return seasonNumber ? `season:${seriesId}:${seasonNumber}` : `seasons:${seriesId}`;
    }

    /**
     * Get cached season data
     */
    getSeasonData(seriesId, seasonNumber = null) {
        const key = this.generateSeasonKey(seriesId, seasonNumber);
        return this.getCachedData(this.seasonCache, key);
    }

    /**
     * Cache season data
     */
    setSeasonData(seriesId, seasonNumber = null, seasonData) {
        const key = this.generateSeasonKey(seriesId, seasonNumber);
        this.setCachedData(this.seasonCache, key, seasonData, this.CACHE_TTLS.season);
    }

    // ==================== STATIC CACHE ====================

    /**
     * Generate cache key for static data
     */
    generateStaticKey(dataType) {
        return `static:${dataType}`;
    }

    /**
     * Get cached static data
     */
    getStaticData(dataType) {
        const key = this.generateStaticKey(dataType);
        return this.getCachedData(this.staticCache, key);
    }

    /**
     * Cache static data
     */
    setStaticData(dataType, data) {
        const key = this.generateStaticKey(dataType);
        this.setCachedData(this.staticCache, key, data, this.CACHE_TTLS.static);
    }

    // ==================== CACHE MANAGEMENT ====================

    /**
     * Clear all caches
     */
    clearAll() {
        const counts = {
            search: this.searchCache.size,
            imdb: this.imdbCache.size,
            artwork: this.artworkCache.size,
            translation: this.translationCache.size,
            metadata: this.metadataCache.size,
            season: this.seasonCache.size,
            static: this.staticCache.size
        };
        
        this.searchCache.clear();
        this.imdbCache.clear();
        this.artworkCache.clear();
        this.translationCache.clear();
        this.metadataCache.clear();
        this.seasonCache.clear();
        this.staticCache.clear();
        
        console.log(`🗑️ Cleared all caches:`, counts);
    }

    /**
     * Clear cache entries by pattern (useful for selective invalidation)
     */
    clearByPattern(pattern) {
        let totalRemoved = 0;
        
        const cacheTypes = [
            { name: 'search', map: this.searchCache },
            { name: 'imdb', map: this.imdbCache },
            { name: 'artwork', map: this.artworkCache },
            { name: 'translation', map: this.translationCache },
            { name: 'metadata', map: this.metadataCache },
            { name: 'season', map: this.seasonCache },
            { name: 'static', map: this.staticCache }
        ];

        cacheTypes.forEach(cache => {
            const keysToDelete = [];
            for (const key of cache.map.keys()) {
                if (key.startsWith(pattern)) {
                    keysToDelete.push(key);
                }
            }
            
            keysToDelete.forEach(key => {
                cache.map.delete(key);
                totalRemoved++;
            });
            
            if (keysToDelete.length > 0) {
                console.log(`🧹 Cleared ${keysToDelete.length} entries from ${cache.name} cache matching pattern: ${pattern}`);
            }
        });

        return totalRemoved;
    }

    /**
     * Clear specific cache type
     */
    clearCacheType(cacheType) {
        const cacheMap = this.getCacheMap(cacheType);
        if (cacheMap) {
            const count = cacheMap.size;
            cacheMap.clear();
            console.log(`🗑️ Cleared ${cacheType} cache: ${count} entries`);
        }
    }

    /**
     * Get cache map by type (helper for cache management)
     */
    getCacheMap(cacheType) {
        const cacheMappers = {
            'search': this.searchCache,
            'imdb': this.imdbCache,
            'artwork': this.artworkCache,
            'translation': this.translationCache,
            'metadata': this.metadataCache,
            'season': this.seasonCache,
            'static': this.staticCache
        };
        return cacheMappers[cacheType];
    }

    /**
     * Get comprehensive cache statistics
     */
    getStats() {
        return {
            searchEntries: this.searchCache.size,
            imdbEntries: this.imdbCache.size,
            artworkEntries: this.artworkCache.size,
            translationEntries: this.translationCache.size,
            metadataEntries: this.metadataCache.size,
            seasonEntries: this.seasonCache.size,
            staticEntries: this.staticCache.size,
            totalEntries: this.searchCache.size + this.imdbCache.size + this.artworkCache.size + 
                         this.translationCache.size + this.metadataCache.size + this.seasonCache.size + this.staticCache.size,
            cacheTTLs: this.CACHE_TTLS
        };
    }

    /**
     * Clean up expired entries from all caches
     */
    cleanup() {
        const now = Date.now();
        let totalRemoved = 0;
        
        const cacheTypes = [
            { name: 'search', map: this.searchCache },
            { name: 'imdb', map: this.imdbCache },
            { name: 'artwork', map: this.artworkCache },
            { name: 'translation', map: this.translationCache },
            { name: 'metadata', map: this.metadataCache },
            { name: 'season', map: this.seasonCache },
            { name: 'static', map: this.staticCache }
        ];

        cacheTypes.forEach(cache => {
            let removed = 0;
            for (const [key, entry] of cache.map.entries()) {
                if (now >= entry.expiry) {
                    cache.map.delete(key);
                    removed++;
                }
            }
            if (removed > 0) {
                console.log(`🧹 Cleaned ${cache.name} cache: ${removed} expired entries`);
            }
            totalRemoved += removed;
        });

        if (totalRemoved > 0) {
            console.log(`🧹 Total cleanup: ${totalRemoved} expired entries removed`);
        }
    }

    /**
     * Start automatic cleanup interval
     */
    startCleanupInterval() {
        // Clean up every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
        console.log('🕐 Enhanced cache cleanup interval started (5 minutes)');
    }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
