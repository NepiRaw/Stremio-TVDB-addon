/**
 * Simple In-Memory Cache Service
 * Provides temporary caching for search results and IMDB validation
 */

class CacheService {
    constructor() {
        this.searchCache = new Map();
        this.imdbCache = new Map();
        
        // Cache configurations (in milliseconds)
        this.SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        this.IMDB_CACHE_TTL = 60 * 60 * 1000;  // 1 hour
        
        // Start cleanup interval
        this.startCleanupInterval();
    }

    /**
     * Generate cache key for search queries
     */
    generateSearchKey(query, type, language = 'eng') {
        return `search:${type}:${language}:${query.toLowerCase().trim()}`;
    }

    /**
     * Generate cache key for IMDB validation
     */
    generateImdbKey(contentType, contentId) {
        return `imdb:${contentType}:${contentId}`;
    }

    /**
     * Get cached search results
     */
    getSearchResults(query, type, language = 'eng') {
        const key = this.generateSearchKey(query, type, language);
        const cached = this.searchCache.get(key);
        
        if (cached && Date.now() < cached.expiry) {
            console.log(`💾 Cache HIT for search: ${key}`);
            return cached.data;
        }
        
        if (cached) {
            this.searchCache.delete(key); // Remove expired entry
        }
        
        console.log(`🔍 Cache MISS for search: ${key}`);
        return null;
    }

    /**
     * Cache search results
     */
    setSearchResults(query, type, language = 'eng', results) {
        const key = this.generateSearchKey(query, type, language);
        this.searchCache.set(key, {
            data: results,
            expiry: Date.now() + this.SEARCH_CACHE_TTL,
            timestamp: Date.now()
        });
        console.log(`💾 Cached search results: ${key} (${results.length} items)`);
    }

    /**
     * Get cached IMDB validation result
     */
    getImdbValidation(contentType, contentId) {
        const key = this.generateImdbKey(contentType, contentId);
        const cached = this.imdbCache.get(key);
        
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }
        
        if (cached) {
            this.imdbCache.delete(key); // Remove expired entry
        }
        
        return null;
    }

    /**
     * Cache IMDB validation result
     */
    setImdbValidation(contentType, contentId, isValid, detailData = null) {
        const key = this.generateImdbKey(contentType, contentId);
        this.imdbCache.set(key, {
            data: { isValid, detailData },
            expiry: Date.now() + this.IMDB_CACHE_TTL,
            timestamp: Date.now()
        });
    }

    /**
     * Clear all caches
     */
    clearAll() {
        const searchCount = this.searchCache.size;
        const imdbCount = this.imdbCache.size;
        
        this.searchCache.clear();
        this.imdbCache.clear();
        
        console.log(`🗑️ Cleared cache: ${searchCount} search entries, ${imdbCount} IMDB entries`);
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            searchEntries: this.searchCache.size,
            imdbEntries: this.imdbCache.size,
            searchTTL: this.SEARCH_CACHE_TTL,
            imdbTTL: this.IMDB_CACHE_TTL
        };
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let removedCount = 0;

        // Clean search cache
        for (const [key, entry] of this.searchCache.entries()) {
            if (now >= entry.expiry) {
                this.searchCache.delete(key);
                removedCount++;
            }
        }

        // Clean IMDB cache
        for (const [key, entry] of this.imdbCache.entries()) {
            if (now >= entry.expiry) {
                this.imdbCache.delete(key);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            console.log(`🧹 Cleaned up ${removedCount} expired cache entries`);
        }
    }

    /**
     * Start automatic cleanup interval
     */
    startCleanupInterval() {
        // Clean up every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
        console.log('🕐 Cache cleanup interval started (5 minutes)');
    }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
