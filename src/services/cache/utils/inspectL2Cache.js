/**
 * L2 Cache Inspector
 * Quick utility to view MongoDB cache contents
 */

require('dotenv').config();
const HybridCacheService = require('../hybridCacheService');

class L2CacheInspector {
    constructor() {
        this.hybridCache = null;
    }

    async initialize() {
        console.log('🔌 Connecting to MongoDB...');
        this.hybridCache = new HybridCacheService();
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (!this.hybridCache.mongoConnected) {
            throw new Error('Failed to connect to MongoDB');
        }
        
        console.log('✅ Connected to MongoDB Atlas');
    }

    async viewL2Summary() {
        console.log('\n📊 L2 Cache Summary:');
        console.log('═══════════════════════');
        
        const summary = await this.hybridCache.getL2Summary();
        
        if (summary.error) {
            console.log(`❌ Error: ${summary.error}`);
            return;
        }

        let totalActive = 0;
        let totalExpired = 0;
        let totalSize = 0;

        Object.entries(summary).forEach(([type, stats]) => {
            console.log(`\n📁 ${type.toUpperCase()}:`);
            console.log(`   Collection: ${stats.collection}`);
            console.log(`   Total: ${stats.total}`);
            console.log(`   Active: ${stats.active}`);
            console.log(`   Expired: ${stats.expired}`);
            console.log(`   Avg Size: ${stats.avgSize} bytes`);
            
            totalActive += stats.active;
            totalExpired += stats.expired;
            totalSize += stats.avgSize * stats.total;
        });

        console.log('\n🎯 TOTALS:');
        console.log(`   Active Entries: ${totalActive}`);
        console.log(`   Expired Entries: ${totalExpired}`);
        console.log(`   Estimated Size: ${Math.round(totalSize / 1024)} KB`);
    }

    async viewL2Details(cacheType = null, limit = 20) {
        console.log(`\n🔍 L2 Cache Details${cacheType ? ` (${cacheType})` : ''}:`);
        console.log('═══════════════════════════════════════');
        
        const details = await this.hybridCache.inspectL2Cache(cacheType, limit);
        
        if (details.error) {
            console.log(`❌ Error: ${details.error}`);
            return;
        }

        Object.entries(details).forEach(([type, info]) => {
            console.log(`\n📂 ${type.toUpperCase()} (${info.count} entries):`);
            
            if (info.entries.length === 0) {
                console.log('   (No entries)');
                return;
            }

            info.entries.slice(0, 10).forEach((entry, index) => {
                const expiredFlag = entry.isExpired ? '❌' : '✅';
                const ageMinutes = Math.round((Date.now() - new Date(entry.timestamp)) / 60000);
                const ttlMinutes = Math.round((new Date(entry.expiry) - Date.now()) / 60000);
                
                console.log(`   ${index + 1}. ${expiredFlag} ${entry.key}`);
                console.log(`      Size: ${entry.dataSize} bytes | Age: ${ageMinutes}m | TTL: ${ttlMinutes}m`);
                console.log(`      Data: ${JSON.stringify(entry.dataPreview)}`);
            });

            if (info.entries.length > 10) {
                console.log(`   ... and ${info.entries.length - 10} more entries`);
            }
        });
    }

    async searchL2Cache(searchTerm) {
        console.log(`\n🔎 Searching L2 cache for: "${searchTerm}"`);
        console.log('═══════════════════════════════════════');
        
        const details = await this.hybridCache.inspectL2Cache(null, 1000);
        
        if (details.error) {
            console.log(`❌ Error: ${details.error}`);
            return;
        }

        let found = false;
        Object.entries(details).forEach(([type, info]) => {
            const matches = info.entries.filter(entry => 
                entry.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                JSON.stringify(entry.dataPreview).toLowerCase().includes(searchTerm.toLowerCase())
            );

            if (matches.length > 0) {
                found = true;
                console.log(`\n📂 ${type.toUpperCase()} (${matches.length} matches):`);
                
                matches.slice(0, 5).forEach((entry, index) => {
                    const expiredFlag = entry.isExpired ? '❌' : '✅';
                    console.log(`   ${index + 1}. ${expiredFlag} ${entry.key}`);
                    console.log(`      Data: ${JSON.stringify(entry.dataPreview)}`);
                });
                
                if (matches.length > 5) {
                    console.log(`   ... and ${matches.length - 5} more matches`);
                }
            }
        });

        if (!found) {
            console.log(`No results found for "${searchTerm}"`);
        }
    }

    async cleanup() {
        if (this.hybridCache) {
            await this.hybridCache.disconnect();
            console.log('\n🔌 Disconnected from MongoDB');
        }
    }
}

/**
 * Main execution function
 */
async function main() {
    const inspector = new L2CacheInspector();
    
    try {
        await inspector.initialize();
        
        const args = process.argv.slice(2);
        const command = args[0] || 'summary';
        
        switch (command) {
            case 'summary':
                await inspector.viewL2Summary();
                break;
                
            case 'details':
                const cacheType = args[1] || null;
                const limit = parseInt(args[2]) || 20;
                await inspector.viewL2Details(cacheType, limit);
                break;
                
            case 'search':
                const searchTerm = args[1];
                if (!searchTerm) {
                    console.log('❌ Please provide a search term: node inspectL2Cache.js search "batman"');
                    return;
                }
                await inspector.searchL2Cache(searchTerm);
                break;
                
            case 'help':
                console.log('L2 Cache Inspector Commands:');
                console.log('  summary                    - Show cache summary by type');
                console.log('  details [type] [limit]     - Show detailed entries (type: search, imdb, etc.)');
                console.log('  search "term"              - Search cache contents');
                console.log('  help                       - Show this help');
                break;
                
            default:
                console.log(`❌ Unknown command: ${command}`);
                console.log('Use "help" to see available commands');
        }
        
    } catch (error) {
        console.error('❌ Inspector failed:', error.message);
    } finally {
        await inspector.cleanup();
    }
}

if (require.main === module) {
    main().then(() => process.exit(0));
}

module.exports = L2CacheInspector;
