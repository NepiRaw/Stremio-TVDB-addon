/**
 * Cache Factory - Provides cache implementation based on configuration
 * Supports both in-memory and hybrid (MongoDB) caching
 */

const InMemoryCacheService = require('./inMemoryCacheService');
const HybridCacheService = require('./hybridCacheService');

class CacheFactory {
    static createCache(logger = null) {
        const cacheType = process.env.CACHE_TYPE || 'memory';
        const mongoUri = process.env.MONGODB_URI;
        
        logger?.info(`🏭 Cache Factory: Initializing ${cacheType} cache`);
        
        switch (cacheType.toLowerCase()) {
            case 'hybrid':
                if (!mongoUri) {
                    logger?.warn('⚠️  CACHE_TYPE=hybrid but no MONGODB_URI found, falling back to memory cache');
                    return new InMemoryCacheService(logger);
                }
                logger?.info('🔄 Creating hybrid cache (L1: Memory + L2: MongoDB)');
                return new HybridCacheService(logger);
                
            case 'mongodb':
                if (!mongoUri) {
                    logger?.warn('⚠️  CACHE_TYPE=mongodb but no MONGODB_URI found, falling back to memory cache');
                    return new InMemoryCacheService(logger);
                }
                logger?.info('🗄️  Creating MongoDB-only cache');
                return new HybridCacheService(logger);
                
            case 'memory':
            default:
                logger?.info('💾 Creating in-memory cache');
                return new InMemoryCacheService(logger);
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
        
        console.log('\n📊 Cache Configuration:');
        console.log('═══════════════════════');
        console.log(`Environment: ${nodeEnv}`);
        console.log(`Cache Type: ${cacheType}`);
        console.log(`MongoDB Available: ${hasMongoUri ? '✅' : '❌'}`);
        console.log(`Recommended: ${recommended}`);
        
        if (cacheType !== recommended) {
            console.log(`💡 Recommendation: Consider setting CACHE_TYPE=${recommended}`);
        }
        console.log('');
    }
}

module.exports = CacheFactory;
