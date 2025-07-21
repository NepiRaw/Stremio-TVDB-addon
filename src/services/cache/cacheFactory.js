/**
 * Cache Factory - Provides cache implementation based on configuration
 * Supports both in-memory and hybrid (MongoDB) caching
 */

const InMemoryCacheService = require('./inMemoryCacheService');
const HybridCacheService = require('./hybridCacheService');

class CacheFactory {
    /**
     * Create cache instance based on environment configuration
     */
    static createCache() {
        const cacheType = process.env.CACHE_TYPE || 'memory';
        const mongoUri = process.env.MONGODB_URI;
        
        console.log(`🏭 Cache Factory: Initializing ${cacheType} cache`);
        
        switch (cacheType.toLowerCase()) {
            case 'hybrid':
                if (!mongoUri) {
                    console.warn('⚠️  CACHE_TYPE=hybrid but no MONGODB_URI found, falling back to memory cache');
                    return InMemoryCacheService; // Return singleton instance
                }
                console.log('🔄 Creating hybrid cache (L1: Memory + L2: MongoDB)');
                return new HybridCacheService();
                
            case 'mongodb':
                if (!mongoUri) {
                    console.warn('⚠️  CACHE_TYPE=mongodb but no MONGODB_URI found, falling back to memory cache');
                    return InMemoryCacheService; // Return singleton instance
                }
                console.log('🗄️  Creating MongoDB-only cache');
                return new HybridCacheService();
                
            case 'memory':
            default:
                console.log('💾 Creating in-memory cache');
                return InMemoryCacheService; // Return singleton instance
        }
    }
    
    /**
     * Get recommended cache type based on environment
     */
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
    
    /**
     * Display cache configuration info
     */
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
