/**
 * Enhanced In-Memory Cache Service
 * Provides comprehensive caching for all TVDB data types
 * Future-proof design for MongoDB migration
 */

class CacheService {
    constructor(logger = null) {
        this.logger = logger;
        this.searchCache = new Map();
        this.imdbCache = new Map();
        this.artworkCache = new Map();
        this.translationCache = new Map();
        this.metadataCache = new Map();
        this.seasonCache = new Map();
        
        this.CACHE_TTLS = {
            search: 2 * 60 * 60 * 1000,             // 2 hours - searches are popular, but results can change
            imdb: 7 * 24 * 60 * 60 * 1000,          // 7 days - IMDB IDs + metadata rarely change
            artwork: 14 * 24 * 60 * 60 * 1000,      // 14 days - artwork is very static
            translation: 3 * 24 * 60 * 60 * 1000,   // 3 days - translations rarely update
            metadata: 12 * 60 * 60 * 1000,          // 12 hours - basic metadata updates infrequently
            season: 6 * 60 * 60 * 1000              // 6 hours - episodes update occasionally
        };
        
        // Future /updates endpoint configuration
        this.UPDATES_CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours - adjustable sync interval
        
        this.startCleanupInterval();
    }

    getCachedData(cacheMap, key) {
        const cached = cacheMap.get(key);
        const now = Date.now();
        if (cached) {
            this.logger?.debug(`⏱️ Checking cache for key: ${key} | now: ${now} | expiry: ${cached.expiry} | ttl(ms) left: ${cached.expiry - now}`);
        }
        if (cached && now < cached.expiry) {
            this.logger?.debug(`💾 Cache:HIT: ${key}`);
            return cached.data;
        }
        if (cached) {
            this.logger?.debug(`🗑️ Cache EXPIRED: ${key} | now: ${now} | expiry: ${cached.expiry}`);
            cacheMap.delete(key);
        }
        this.logger?.debug(`🔍 Cache:MISS: ${key}`);
        return null;
    }

    setCachedData(cacheMap, key, data, ttl) {
        const now = Date.now();
        const expiry = now + ttl;
        const entry = {
            data: data,
            expiry: expiry,
            timestamp: now,
            type: this.getCacheTypeFromKey(key)
        };
        cacheMap.set(key, entry);
        this.logger?.debug(`💾 Cached data: ${key} | now: ${now} | expiry: ${expiry} | ttl(ms): ${ttl} | ttl(min): ${Math.round(ttl / 60000)}`);
    }

    getCacheTypeFromKey(key) {
        return key.split(':')[0];
    }

    // ==================== SEARCH CACHE ====================

    generateSearchKey(query, type, language = 'eng') {
        return `search:${type}:${language}:${query.toLowerCase().trim()}`;
    }

    getSearchResults(query, type, language = 'eng') {
        const key = this.generateSearchKey(query, type, language);
        return this.getCachedData(this.searchCache, key);
    }

    setSearchResults(query, type, language = 'eng', results) {
        const key = this.generateSearchKey(query, type, language);
        this.setCachedData(this.searchCache, key, results, this.CACHE_TTLS.search);
    }

    // ==================== IMDB CACHE ====================

    generateImdbKey(contentType, contentId) {
        return `imdb:${contentType}:${contentId}`;
    }

    getImdbValidation(contentType, contentId) {
        const key = this.generateImdbKey(contentType, contentId);
        return this.getCachedData(this.imdbCache, key);
    }

    setImdbValidation(contentType, contentId, isValid, detailData = null) {
        const key = this.generateImdbKey(contentType, contentId);
        this.setCachedData(this.imdbCache, key, { isValid, detailData }, this.CACHE_TTLS.imdb);
    }

    // ==================== ARTWORK CACHE ====================

    generateArtworkKey(contentType, contentId, artworkType = 'all') {
        return `artwork:${contentType}:${contentId}:${artworkType}`;
    }

    getArtwork(contentType, contentId, artworkType = 'all') {
        const key = this.generateArtworkKey(contentType, contentId, artworkType);
        return this.getCachedData(this.artworkCache, key);
    }

    setArtwork(contentType, contentId, artworkType = 'all', artworkData) {
        const key = this.generateArtworkKey(contentType, contentId, artworkType);
        this.setCachedData(this.artworkCache, key, artworkData, this.CACHE_TTLS.artwork);
    }

    // ==================== TRANSLATION CACHE ====================

    generateTranslationKey(contentType, contentId, language, dataType = 'all') {
        return `translation:${contentType}:${contentId}:${language}:${dataType}`;
    }

    getTranslation(contentType, contentId, language, dataType = 'all') {
        const key = this.generateTranslationKey(contentType, contentId, language, dataType);
        return this.getCachedData(this.translationCache, key);
    }

    setTranslation(contentType, contentId, language, dataType = 'all', translationData) {
        const key = this.generateTranslationKey(contentType, contentId, language, dataType);
        this.setCachedData(this.translationCache, key, translationData, this.CACHE_TTLS.translation);
    }

    // ==================== METADATA CACHE ====================

    generateMetadataKey(contentType, contentId, language = null) {
        return language ? `metadata:${contentType}:${contentId}:${language}` : `metadata:${contentType}:${contentId}`;
    }

    getMetadata(contentType, contentId, language = null) {
        const key = this.generateMetadataKey(contentType, contentId, language);
        return this.getCachedData(this.metadataCache, key);
    }

    setMetadata(contentType, contentId, language = null, metadata) {
        const key = this.generateMetadataKey(contentType, contentId, language);
        this.setCachedData(this.metadataCache, key, metadata, this.CACHE_TTLS.metadata);
    }

    // ==================== SEASON CACHE ====================

    generateSeasonKey(seriesId, seasonNumber = null) {
        return seasonNumber ? `season:${seriesId}:${seasonNumber}` : `seasons:${seriesId}`;
    }

    getSeasonData(seriesId, seasonNumber = null) {
        const key = this.generateSeasonKey(seriesId, seasonNumber);
        return this.getCachedData(this.seasonCache, key);
    }

    setSeasonData(seriesId, seasonNumber = null, seasonData) {
        const key = this.generateSeasonKey(seriesId, seasonNumber);
        this.setCachedData(this.seasonCache, key, seasonData, this.CACHE_TTLS.season);
    }

    // ==================== CACHE MANAGEMENT ====================

    clearAll() {
        const counts = {
            search: this.searchCache.size,
            imdb: this.imdbCache.size,
            artwork: this.artworkCache.size,
            translation: this.translationCache.size,
            metadata: this.metadataCache.size,
            season: this.seasonCache.size
        };
        
        this.searchCache.clear();
        this.imdbCache.clear();
        this.artworkCache.clear();
        this.translationCache.clear();
        this.metadataCache.clear();
        this.seasonCache.clear();
        
        this.logger?.info(`🗑️ Cleared all caches:`, counts);
    }

    clearByPattern(pattern) {
        let totalRemoved = 0;
        
        const cacheTypes = [
            { name: 'search', map: this.searchCache },
            { name: 'imdb', map: this.imdbCache },
            { name: 'artwork', map: this.artworkCache },
            { name: 'translation', map: this.translationCache },
            { name: 'metadata', map: this.metadataCache },
            { name: 'season', map: this.seasonCache }
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
                this.logger?.info(`🧹 Cleared ${keysToDelete.length} entries from ${cache.name} cache matching pattern: ${pattern}`);
            }
        });

        return totalRemoved;
    }

    clearCacheType(cacheType) {
        const cacheMap = this.getCacheMap(cacheType);
        if (cacheMap) {
            const count = cacheMap.size;
            cacheMap.clear();
            this.logger?.info(`🗑️ Cleared ${cacheType} cache: ${count} entries`);
        }
    }

    getCacheMap(cacheType) {
        const cacheMappers = {
            'search': this.searchCache,
            'imdb': this.imdbCache,
            'artwork': this.artworkCache,
            'translation': this.translationCache,
            'metadata': this.metadataCache,
            'season': this.seasonCache
        };
        return cacheMappers[cacheType];
    }

    getStats() {
        return {
            searchEntries: this.searchCache.size,
            imdbEntries: this.imdbCache.size,
            artworkEntries: this.artworkCache.size,
            translationEntries: this.translationCache.size,
            metadataEntries: this.metadataCache.size,
            seasonEntries: this.seasonCache.size,
            totalEntries: this.searchCache.size + this.imdbCache.size + this.artworkCache.size + 
                         this.translationCache.size + this.metadataCache.size + this.seasonCache.size,
            cacheTTLs: this.CACHE_TTLS
        };
    }

    cleanup() {
        const now = Date.now();
        let totalRemoved = 0;

        const cacheTypes = [
            { name: 'search', map: this.searchCache },
            { name: 'imdb', map: this.imdbCache },
            { name: 'artwork', map: this.artworkCache },
            { name: 'translation', map: this.translationCache },
            { name: 'metadata', map: this.metadataCache },
            { name: 'season', map: this.seasonCache }
        ];

        cacheTypes.forEach(cache => {
            let removed = 0;
            let expiredKeys = [];
            for (const [key, entry] of cache.map.entries()) {
                if (now >= entry.expiry) {
                    expiredKeys.push({ key, expiry: entry.expiry, setAt: entry.timestamp });
                    cache.map.delete(key);
                    removed++;
                }
            }
            if (removed > 0) {
                expiredKeys.forEach(info => {
                    this.logger?.debug(`🧹 [CLEANUP] Expired key: ${info.key} | expiry: ${info.expiry} | setAt: ${info.setAt} | now: ${now} | cache: ${cache.name}`);
                });
                this.logger?.debug(`🧹 Cleaned ${cache.name} cache: ${removed} expired entries`);
            }
            totalRemoved += removed;
        });

        if (totalRemoved > 0) {
            this.logger?.info(`🧹 Total cleanup: ${totalRemoved} expired entries removed`);
        }
    }

    startCleanupInterval() {
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
        this.logger?.info('🕐 Enhanced cache cleanup interval started (5 minutes)');
    }
}

module.exports = CacheService;
