/**
 * Cache Factory - Provides cache implementation based on configuration
 * Supports both in-memory and hybrid (MongoDB) caching
 */

const InMemoryCacheService = require('./inMemoryCacheService');
const HybridCacheService = require('./hybridCacheService');

class CacheFactory {
    static createCache(logger = null) {
        const cacheLogger = logger?.child ? logger.child('CACHE') : logger;
        const cacheType = process.env.CACHE_TYPE || 'memory';
        const mongoUri = process.env.MONGODB_URI;
        
        
        switch (cacheType.toLowerCase()) {
            case 'hybrid':
                if (!mongoUri) {
                    logger?.warn('⚠️  CACHE_TYPE=hybrid but no MONGODB_URI found, falling back to memory cache');
                    return new InMemoryCacheService(cacheLogger);
                }
                logger?.info('💾 Cache: hybrid (L1 memory + L2 MongoDB)');
                return new HybridCacheService(cacheLogger);
                
            case 'mongodb':
                if (!mongoUri) {
                    logger?.warn('⚠️  CACHE_TYPE=mongodb but no MONGODB_URI found, falling back to memory cache');
                    return new InMemoryCacheService(cacheLogger);
                }
                logger?.info('💾 Cache: MongoDB (L1 memory + L2 MongoDB)');
                return new HybridCacheService(cacheLogger);
                
            case 'memory':
            default:
                logger?.info('💾 Cache: in-memory only');
                return new InMemoryCacheService(cacheLogger);
        }
    }
    
    static getRecommendedCacheType() {
        const nodeEnv = process.env.NODE_ENV || 'development';
        const hasMongoUri = !!process.env.MONGODB_URI;
        
        if (nodeEnv === 'production' && hasMongoUri) {
            return 'hybrid';
        } else if (hasMongoUri) {
            return 'hybrid';
        } else {
            return 'memory';
        }
    }
    
    static displayCacheInfo() {
        const cacheType = process.env.CACHE_TYPE || 'memory';
        const nodeEnv = process.env.NODE_ENV || 'development';
        const hasMongoUri = !!process.env.MONGODB_URI;
        const recommended = CacheFactory.getRecommendedCacheType();
        
        if (cacheType !== recommended) {
            console.log(`💡 CACHE_TYPE=${cacheType} in ${nodeEnv}, ${recommended} is recommended${hasMongoUri ? '' : ' (no MONGODB_URI)'}`);
        }
    }
}

module.exports = CacheFactory;
