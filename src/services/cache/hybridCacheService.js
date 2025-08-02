/**
 * Hybrid Cache Service
 * Combines in-memory caching (L1) with MongoDB persistence (L2)
 * Provides fallback and performance optimization
 */

const { MongoClient } = require('mongodb');

class HybridCacheService {
    constructor(logger = null) {
        this.logger = logger;
        this.searchCache = new Map();
        this.imdbCache = new Map();
        this.artworkCache = new Map();
        this.translationCache = new Map();
        this.metadataCache = new Map();
        this.seasonCache = new Map();
        
        this.mongoClient = null;
        this.mongoDB = null;
        
        this.mongoConnected = false;
        
        this.CACHE_TTLS = {
            search: 2 * 60 * 60 * 1000,             // 2 hours
            imdb: 7 * 24 * 60 * 60 * 1000,          // 7 days
            artwork: 14 * 24 * 60 * 60 * 1000,      // 14 days
            translation: 3 * 24 * 60 * 60 * 1000,   // 3 days
            metadata: 12 * 60 * 60 * 1000,          // 12 hours
            season: 6 * 60 * 60 * 1000              // 6 hours
        };
        
        this.mongoCollections = {
            search: 'cache_search',
            imdb: 'cache_imdb',
            artwork: 'cache_artwork',
            translation: 'cache_translation',
            metadata: 'cache_metadata',
            season: 'cache_season'
        };
        
        this.initMongoDB();
        this.startCleanupInterval();
    }

    async initMongoDB() {
        if (!process.env.MONGODB_URI) {
            this.logger?.info('💾 MongoDB not configured, using in-memory cache only');
            return;
        }

        try {
            this.logger?.info('🔌 Initializing MongoDB connection...');
            this.mongoClient = new MongoClient(process.env.MONGODB_URI);
            await this.mongoClient.connect();
            
            this.mongoDB = this.mongoClient.db('stremio-tvdb-cache');
            this.mongoConnected = true;
            
            this.logger?.info('✅ MongoDB connected successfully');
            
            // Create indexes for performance
            await this.createMongoIndexes();
            
        } catch (error) {
            this.logger?.error('❌ MongoDB connection failed:', error.message);
            this.logger?.info('🔄 Falling back to in-memory cache only');
            this.mongoConnected = false;
        }
    }

    async createMongoIndexes() {
        if (!this.mongoConnected) return;

        try {
            for (const [type, collectionName] of Object.entries(this.mongoCollections)) {
                const collection = this.mongoDB.collection(collectionName);
                
                await collection.createIndex(
                    { "expiry": 1 }, 
                    { expireAfterSeconds: 0 }
                );
                
                await collection.createIndex(
                    { "key": 1 }, 
                    { unique: true }
                );
            }
            this.logger?.info('📇 MongoDB indexes created successfully');
        } catch (error) {
            this.logger?.error?.('❌ Error creating MongoDB indexes:', error.message);
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

    async getCachedData(cacheType, key) {
        // L1 Cache: Check in-memory first (fastest)
        const memoryCache = this.getCacheMap(cacheType);
        const memoryEntry = memoryCache.get(key);
        
        if (memoryEntry && Date.now() < memoryEntry.expiry) {
            this.logger?.debug(`💾 Cache:HIT (L1-Memory): ${key}`);
            return memoryEntry.data;
        }
        
        if (memoryEntry) {
            memoryCache.delete(key);
        }
        
        if (this.mongoConnected) {
            try {
                const collection = this.mongoDB.collection(this.mongoCollections[cacheType]);
                const mongoEntry = await collection.findOne({ key: key });
                
                if (mongoEntry && new Date() < mongoEntry.expiry) {
                    this.logger?.debug(`💾 Cache:HIT (L2-MongoDB): ${key}`);

                    const memoryEntry = {
                        data: mongoEntry.data,
                        expiry: mongoEntry.expiry.getTime(),
                        timestamp: Date.now(),
                        type: cacheType
                    };
                    memoryCache.set(key, memoryEntry);
                    
                    return mongoEntry.data;
                }
            } catch (error) {
                this.logger?.error?.(`❌ MongoDB cache read error: ${error.message}`);
            }
        }
        
        this.logger?.debug(`🔍 Cache:MISS (L1+L2): ${key}`);
        return null;
    }

    async setCachedData(cacheType, key, data, ttl) {
        const expiry = Date.now() + ttl;
        
        const memoryCache = this.getCacheMap(cacheType);
        const memoryEntry = {
            data: data,
            expiry: expiry,
            timestamp: Date.now(),
            type: cacheType
        };
        memoryCache.set(key, memoryEntry);
        
        if (this.mongoConnected) {
            this.storeInMongoDB(cacheType, key, data, expiry).catch(error => {
                this.logger?.error?.(`❌ MongoDB cache write error: ${error.message}`);
            });
        }
        
        this.logger?.debug(`💾 Cached (Hybrid): ${key} (TTL: ${Math.round(ttl / 60000)}min)`);
        return true;
    }

    async storeInMongoDB(cacheType, key, data, expiry) {
        const collection = this.mongoDB.collection(this.mongoCollections[cacheType]);
        
        const document = {
            key: key,
            data: data,
            expiry: new Date(expiry),
            timestamp: new Date(),
            type: cacheType
        };
        
        await collection.replaceOne(
            { key: key },
            document,
            { upsert: true }
        );
    }

    async clearByPattern(pattern) {
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
                this.logger?.info(`🧹 Cleared ${keysToDelete.length} entries from ${cache.name} L1 cache matching pattern: ${pattern}`);
            }
        });

        if (this.mongoConnected) {
            try {
                for (const [type, collectionName] of Object.entries(this.mongoCollections)) {
                    const collection = this.mongoDB.collection(collectionName);
                    
                    const result = await collection.deleteMany({
                        key: { $regex: `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` }
                    });
                    
                    if (result.deletedCount > 0) {
                        this.logger?.info(`🧹 Cleared ${result.deletedCount} entries from ${type} L2 cache matching pattern: ${pattern}`);
                    }
                }
            } catch (error) {
                this.logger?.error?.(`❌ Error clearing MongoDB cache by pattern: ${error.message}`);
            }
        }

        return totalRemoved;
    }

    async getStats() {
        const stats = {
            l1Cache: {
                searchEntries: this.searchCache.size,
                imdbEntries: this.imdbCache.size,
                artworkEntries: this.artworkCache.size,
                translationEntries: this.translationCache.size,
                metadataEntries: this.metadataCache.size,
                seasonEntries: this.seasonCache.size,
                totalEntries: 0
            },
            l2Cache: {
                connected: this.mongoConnected,
                collections: {},
                totalEntries: 0
            },
            cacheTTLs: this.CACHE_TTLS
        };
        
        stats.l1Cache.totalEntries = Object.values(stats.l1Cache)
            .filter(val => typeof val === 'number')
            .reduce((sum, val) => sum + val, 0);
        
        if (this.mongoConnected) {
            try {
                for (const [type, collectionName] of Object.entries(this.mongoCollections)) {
                    const collection = this.mongoDB.collection(collectionName);
                    const count = await collection.countDocuments();
                    stats.l2Cache.collections[type] = count;
                    stats.l2Cache.totalEntries += count;
                }
            } catch (error) {
                stats.l2Cache.error = error.message;
            }
        }
        
        return stats;
    }

    async inspectL2Cache(cacheType = null, limit = 50) {
        if (!this.mongoConnected) {
            return { error: 'MongoDB not connected', entries: [] };
        }

        try {
            const results = {};
            const cacheTypes = cacheType ? [cacheType] : Object.keys(this.mongoCollections);

            for (const type of cacheTypes) {
                const collection = this.mongoDB.collection(this.mongoCollections[type]);
                
                const entries = await collection.find({})
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .toArray();

                results[type] = {
                    count: entries.length,
                    entries: entries.map(entry => ({
                        key: entry.key,
                        type: entry.type,
                        timestamp: entry.timestamp,
                        expiry: entry.expiry,
                        isExpired: new Date() > entry.expiry,
                        dataSize: JSON.stringify(entry.data).length,
                        dataPreview: this.getDataPreview(entry.data)
                    }))
                };
            }

            return results;
        } catch (error) {
            this.logger?.error?.('❌ Error inspecting L2 cache:', error.message);
            return { error: error.message, entries: [] };
        }
    }

    getDataPreview(data) {
        const dataStr = JSON.stringify(data);
        if (dataStr.length <= 100) return data;
        
        if (Array.isArray(data)) {
            return `Array(${data.length}) [${JSON.stringify(data[0])}...]`;
        }
        
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            return `Object {${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
        }

        return dataStr.substring(0, 100) + '...';
    }

    async getL2Summary() {
        if (!this.mongoConnected) {
            return { error: 'MongoDB not connected' };
        }

        try {
            const summary = {};
            const now = new Date();

            for (const [type, collectionName] of Object.entries(this.mongoCollections)) {
                const collection = this.mongoDB.collection(collectionName);
                
                const total = await collection.countDocuments({});
                const expired = await collection.countDocuments({
                    expiry: { $lt: now }
                });
                const active = total - expired;

                const sampleDoc = await collection.findOne({});
                const avgSize = sampleDoc ? JSON.stringify(sampleDoc).length : 0;
                
                summary[type] = {
                    total,
                    active,
                    expired,
                    avgSize: Math.round(avgSize),
                    collection: collectionName
                };
            }

            return summary;
        } catch (error) {
            this.logger?.error?.('❌ Error getting L2 summary:', error.message);
            return { error: error.message };
        }
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
            for (const [key, entry] of cache.map.entries()) {
                if (now >= entry.expiry) {
                    cache.map.delete(key);
                    removed++;
                }
            }
            if (removed > 0) {
                this.logger?.debug(`🧹 Cleaned ${cache.name} L1 cache: ${removed} expired entries`);
            }
            totalRemoved += removed;
        });

        if (totalRemoved > 0) {
            this.logger?.info(`🧹 Total L1 cleanup: ${totalRemoved} expired entries removed`);
        }
    }

    startCleanupInterval() {
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
        this.logger?.info('🕐 Enhanced hybrid cache cleanup interval started (5 minutes)');
    }

    async clearAll() {
        const l1Counts = {
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
        
        this.logger?.info('🗑️ Cleared all L1 caches:', l1Counts);
        
        if (this.mongoConnected) {
            try {
                const l2Counts = {};
                for (const [type, collectionName] of Object.entries(this.mongoCollections)) {
                    const collection = this.mongoDB.collection(collectionName);
                    const count = await collection.countDocuments();
                    await collection.deleteMany({});
                    l2Counts[type] = count;
                }
                this.logger?.info('🗑️ Cleared all L2 caches:', l2Counts);
            } catch (error) {
                this.logger?.error?.('❌ Error clearing L2 caches:', error.message);
            }
        }
    }

    // ==================== IMDB VALIDATION CACHE ====================

    generateImdbKey(contentType, contentId) {
        return `imdb:${contentType}:${contentId}`;
    }

    async getImdbValidation(contentType, contentId) {
        const key = this.generateImdbKey(contentType, contentId);
        return await this.getCachedData('imdb', key);
    }

    async setImdbValidation(contentType, contentId, isValid, detailData = null) {
        const key = this.generateImdbKey(contentType, contentId);
        return await this.setCachedData('imdb', key, { isValid, detailData }, this.CACHE_TTLS.imdb);
    }

    // ==================== TRANSLATION CACHE ====================

    generateTranslationKey(contentType, contentId, language, dataType = 'all') {
        return `translation:${contentType}:${contentId}:${language}:${dataType}`;
    }

    async getTranslation(contentType, contentId, language, dataType = 'all') {
        const key = this.generateTranslationKey(contentType, contentId, language, dataType);
        return await this.getCachedData('translation', key);
    }

    async setTranslation(contentType, contentId, language, dataType = 'all', translationData) {
        const key = this.generateTranslationKey(contentType, contentId, language, dataType);
        return await this.setCachedData('translation', key, translationData, this.CACHE_TTLS.translation);
    }

    // ==================== METADATA CACHE ====================

    generateMetadataKey(contentType, contentId, language = null) {
        return language ? `metadata:${contentType}:${contentId}:${language}` : `metadata:${contentType}:${contentId}`;
    }

    async getMetadata(contentType, contentId, language = null) {
        const key = this.generateMetadataKey(contentType, contentId, language);
        return await this.getCachedData('metadata', key);
    }

    async setMetadata(contentType, contentId, language = null, metadata) {
        const key = this.generateMetadataKey(contentType, contentId, language);
        return await this.setCachedData('metadata', key, metadata, this.CACHE_TTLS.metadata);
    }

    // ==================== ARTWORK CACHE ====================

    generateArtworkKey(contentType, contentId, artworkType = 'all') {
        return `artwork:${contentType}:${contentId}:${artworkType}`;
    }

    async getArtwork(contentType, contentId, artworkType = 'all') {
        const key = this.generateArtworkKey(contentType, contentId, artworkType);
        return await this.getCachedData('artwork', key);
    }

    async setArtwork(contentType, contentId, artworkType = 'all', artworkData) {
        const key = this.generateArtworkKey(contentType, contentId, artworkType);
        return await this.setCachedData('artwork', key, artworkData, this.CACHE_TTLS.artwork);
    }

    // ==================== SEASON CACHE ====================

    generateSeasonKey(seriesId, seasonNumber = null) {
        return seasonNumber ? `season:${seriesId}:${seasonNumber}` : `seasons:${seriesId}`;
    }

    async getSeasonData(seriesId, seasonNumber = null) {
        const key = this.generateSeasonKey(seriesId, seasonNumber);
        return await this.getCachedData('season', key);
    }

    async setSeasonData(seriesId, seasonNumber = null, seasonData) {
        const key = this.generateSeasonKey(seriesId, seasonNumber);
        return await this.setCachedData('season', key, seasonData, this.CACHE_TTLS.season);
    }

    async disconnect() {
        if (this.mongoClient) {
            await this.mongoClient.close();
            this.mongoConnected = false;
            this.logger?.info('🔌 MongoDB disconnected');
        }
    }
}

module.exports = HybridCacheService;
