/**
 * Cache Migration Utility
 * Helps migrate from in-memory to hybrid cache with data transfer
 */

const InMemoryCacheService = require('../inMemoryCacheService');
const HybridCacheService = require('../hybridCacheService');
require('dotenv').config();

class CacheMigration {
    constructor() {
        this.inMemoryCache = InMemoryCacheService;
        this.hybridCache = null;
    }

    /**
     * Initialize hybrid cache for migration
     */
    async initializeHybridCache() {
        this.hybridCache = new HybridCacheService();
        // Wait for MongoDB connection
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    /**
     * Migrate existing cache data from memory to hybrid
     */
    async migrateExistingData() {
        if (!this.hybridCache) {
            throw new Error('Hybrid cache not initialized');
        }

        console.log('🔄 Starting cache migration...');
        
        const cacheTypes = [
            { name: 'search', sourceMap: this.inMemoryCache.searchCache },
            { name: 'imdb', sourceMap: this.inMemoryCache.imdbCache },
            { name: 'artwork', sourceMap: this.inMemoryCache.artworkCache },
            { name: 'translation', sourceMap: this.inMemoryCache.translationCache },
            { name: 'metadata', sourceMap: this.inMemoryCache.metadataCache },
            { name: 'season', sourceMap: this.inMemoryCache.seasonCache },
            { name: 'static', sourceMap: this.inMemoryCache.staticCache }
        ];

        let totalMigrated = 0;

        for (const cacheType of cacheTypes) {
            let migrated = 0;
            
            for (const [key, entry] of cacheType.sourceMap.entries()) {
                // Only migrate non-expired entries
                if (Date.now() < entry.expiry) {
                    const remainingTtl = entry.expiry - Date.now();
                    await this.hybridCache.setCachedData(cacheType.name, key, entry.data, remainingTtl);
                    migrated++;
                }
            }
            
            if (migrated > 0) {
                console.log(`✅ Migrated ${migrated} entries from ${cacheType.name} cache`);
            }
            totalMigrated += migrated;
        }

        console.log(`🎯 Migration complete: ${totalMigrated} total entries migrated`);
        return totalMigrated;
    }

    /**
     * Compare cache performance before and after migration
     */
    async performanceComparison() {
        console.log('\n⚡ Performance Comparison Starting...');
        
        const testKey = 'migration:test:performance';
        const testData = { message: 'Performance test data', timestamp: Date.now() };
        
        // Test in-memory cache
        const memoryStart = Date.now();
        this.inMemoryCache.setCachedData(this.inMemoryCache.staticCache, testKey, testData, 60000);
        const memoryResult = this.inMemoryCache.getCachedData(this.inMemoryCache.staticCache, testKey);
        const memoryDuration = Date.now() - memoryStart;
        
        // Test hybrid cache
        const hybridStart = Date.now();
        await this.hybridCache.setCachedData('static', testKey, testData, 60000);
        const hybridResult = await this.hybridCache.getCachedData('static', testKey);
        const hybridDuration = Date.now() - hybridStart;
        
        console.log(`📊 In-Memory Cache: ${memoryDuration}ms`);
        console.log(`📊 Hybrid Cache: ${hybridDuration}ms`);
        console.log(`📈 Performance Ratio: ${(hybridDuration/memoryDuration).toFixed(2)}x`);
        
        // Verify data integrity
        const dataMatch = JSON.stringify(memoryResult) === JSON.stringify(hybridResult);
        console.log(`🔍 Data Integrity: ${dataMatch ? '✅ PASS' : '❌ FAIL'}`);
        
        return {
            memoryDuration,
            hybridDuration,
            ratio: hybridDuration/memoryDuration,
            dataIntegrity: dataMatch
        };
    }

    /**
     * Generate migration report
     */
    async generateMigrationReport() {
        const inMemoryStats = this.inMemoryCache.getStats();
        const hybridStats = await this.hybridCache.getStats();
        
        console.log('\n📋 Migration Report:');
        console.log('═══════════════════');
        console.log('In-Memory Cache:');
        console.log(`  Total Entries: ${inMemoryStats.totalEntries}`);
        Object.entries(inMemoryStats).forEach(([key, value]) => {
            if (key.endsWith('Entries') && key !== 'totalEntries') {
                const cacheType = key.replace('Entries', '');
                console.log(`  ${cacheType}: ${value}`);
            }
        });
        
        console.log('\nHybrid Cache:');
        console.log(`  L1 Total: ${hybridStats.l1Cache.totalEntries}`);
        console.log(`  L2 Total: ${hybridStats.l2Cache.totalEntries}`);
        console.log(`  MongoDB Connected: ${hybridStats.l2Cache.connected}`);
        
        if (hybridStats.l2Cache.connected) {
            console.log('  L2 Collections:');
            Object.entries(hybridStats.l2Cache.collections).forEach(([type, count]) => {
                console.log(`    ${type}: ${count}`);
            });
        }
    }

    /**
     * Full migration process
     */
    async runFullMigration() {
        try {
            console.log('🚀 Starting Full Cache Migration Process...\n');
            
            // Step 1: Initialize
            await this.initializeHybridCache();
            
            // Step 2: Migrate data
            await this.migrateExistingData();
            
            // Step 3: Performance test
            await this.performanceComparison();
            
            // Step 4: Generate report
            await this.generateMigrationReport();
            
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
        } finally {
            if (this.hybridCache) {
                await this.hybridCache.disconnect();
            }
        }
    }

    /**
     * Quick L2 cache inspection utility
     */
    async inspectL2Cache(cacheType = null, searchTerm = null) {
        try {
            if (!this.hybridCache) {
                await this.initializeHybridCache();
            }

            console.log('🔍 L2 Cache Inspection...\n');

            // Get summary first
            const summary = await this.hybridCache.getL2Summary();
            if (summary.error) {
                console.log(`❌ Error: ${summary.error}`);
                return;
            }

            console.log('📊 L2 Cache Summary:');
            Object.entries(summary).forEach(([type, stats]) => {
                console.log(`  ${type}: ${stats.active} active, ${stats.expired} expired (${stats.total} total)`);
            });

            // If specific inspection requested
            if (cacheType) {
                console.log(`\n🔍 Detailed view of ${cacheType} cache:`);
                const details = await this.hybridCache.inspectL2Cache(cacheType, 10);
                
                if (details[cacheType] && details[cacheType].entries.length > 0) {
                    details[cacheType].entries.forEach((entry, index) => {
                        const expiredFlag = entry.isExpired ? '❌' : '✅';
                        console.log(`  ${index + 1}. ${expiredFlag} ${entry.key}`);
                        console.log(`     Data: ${JSON.stringify(entry.dataPreview)}`);
                    });
                } else {
                    console.log('  No entries found');
                }
            }

            // If search term provided
            if (searchTerm) {
                console.log(`\n🔎 Searching for "${searchTerm}":`);
                const allDetails = await this.hybridCache.inspectL2Cache(null, 1000);
                
                let found = false;
                Object.entries(allDetails).forEach(([type, info]) => {
                    const matches = info.entries.filter(entry => 
                        entry.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        JSON.stringify(entry.dataPreview).toLowerCase().includes(searchTerm.toLowerCase())
                    );

                    if (matches.length > 0) {
                        found = true;
                        console.log(`  ${type}: ${matches.length} matches`);
                        matches.slice(0, 3).forEach(entry => {
                            console.log(`    - ${entry.key}`);
                        });
                    }
                });

                if (!found) {
                    console.log('  No matches found');
                }
            }

        } catch (error) {
            console.error('❌ L2 inspection failed:', error.message);
        } finally {
            if (this.hybridCache) {
                await this.hybridCache.disconnect();
            }
        }
    }
}

/**
 * Run migration if this file is executed directly
 */
if (require.main === module) {
    (async () => {
        const migration = new CacheMigration();
        const args = process.argv.slice(2);
        const command = args[0] || 'migrate';

        switch (command) {
            case 'migrate':
                await migration.runFullMigration();
                break;
                
            case 'inspect':
                const cacheType = args[1] || null;
                const searchTerm = args[2] || null;
                await migration.inspectL2Cache(cacheType, searchTerm);
                break;
                
            case 'help':
                console.log('Cache Migration Tool Commands:');
                console.log('  migrate                        - Run full migration process');
                console.log('  inspect [type] [search]        - Inspect L2 cache contents');
                console.log('    Examples:');
                console.log('      node cacheMigration.js inspect');
                console.log('      node cacheMigration.js inspect search');
                console.log('      node cacheMigration.js inspect metadata batman');
                console.log('  help                           - Show this help');
                break;
                
            default:
                console.log(`❌ Unknown command: ${command}`);
                console.log('Use "help" to see available commands');
        }
        
        process.exit(0);
    })();
}

module.exports = CacheMigration;
