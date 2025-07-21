/**
 * Catalog Service
 * Orchestrates TMDB catalog fetching with TVDB metadata enrichment
 */

const TMDBService = require('../tmdb/tmdbService');
const TMDBCatalogMapper = require('../tmdb/tmdbCatalogMapper');
const CATALOG_CONFIG = require('../../config/catalogConfig');

class CatalogService {
    constructor(tvdbService, cacheService) {
        this.tvdbService = tvdbService;
        this.cacheService = cacheService;
        
        // Initialize TMDB service
        this.tmdbService = new TMDBService(cacheService);
        
        // Initialize mapper
        this.mapper = new TMDBCatalogMapper(this.tmdbService, tvdbService, cacheService);
        
        // Use shared default configuration
        this.defaultConfig = CATALOG_CONFIG.defaultConfig;
        
        // In-memory catalog configuration (global for now)
        this.catalogConfig = this.defaultConfig;
    }

    /**
     * Get catalog data for a specific catalog ID with comprehensive caching
     */
    async getCatalog(catalogId, userLanguage = 'eng', page = 1, limit = 20) {
        const catalogInfo = this.parseCatalogId(catalogId);
        if (!catalogInfo) {
            throw new Error(`Invalid catalog ID: ${catalogId}`);
        }

        const { type, category } = catalogInfo;
        
        // Generate cache key for final catalog result
        const catalogCacheKey = `catalog:${type}:${category}:page:${page}:lang:${userLanguage}:limit:${limit}`;
        
        // Check if we have cached final catalog results
        try {
            const cachedCatalog = await this.cacheService.getCachedData('catalog', catalogCacheKey);
            if (cachedCatalog && cachedCatalog.metas && cachedCatalog.metas.length > 0) {
                console.log(`💾 Final catalog cache HIT for ${catalogId} (${cachedCatalog.metas.length} items)`);
                console.log(`⚡ Catalog loaded instantly from cache!`);
                return cachedCatalog;
            }
        } catch (error) {
            console.log(`🔍 Final catalog cache MISS for ${catalogId}: ${error.message}`);
        }
        
        const catalogStartTime = Date.now();
        console.log(`📋 Fetching catalog: ${catalogId} (page ${page}, limit ${limit})`);
        
        try {
            // Step 1: Get TMDB catalog data with performance tracking
            const tmdbStartTime = Date.now();
            const tmdbCatalog = await this.tmdbService.getCatalog(
                type === 'series' ? 'tv' : type, // Map 'series' to 'tv' for TMDB
                category,
                page,
                limit
            );
            const tmdbTime = Date.now() - tmdbStartTime;

            // Step 2: Map to TVDB and enrich with metadata (parallelized)
            const mappingStartTime = Date.now();
            const enrichedItems = await this.mapper.mapCatalogToTVDB(
                type,
                tmdbCatalog,
                userLanguage
            );
            const mappingTime = Date.now() - mappingStartTime;

            // Step 3: Sort by popularity if available
            this.sortCatalogItems(enrichedItems, category);

            const totalTime = Date.now() - catalogStartTime;
            
            // Step 4: Prepare final catalog result
            const catalogResult = {
                metas: enrichedItems,
                total: tmdbCatalog.total_results || enrichedItems.length,
                page: page,
                hasMore: enrichedItems.length === limit,
                performance: {
                    tmdbTime,
                    mappingTime,
                    totalTime
                },
                cacheMaxAge: 3600, // 1 hour cache for clients
                generatedAt: new Date().toISOString()
            };

            // Step 5: Cache the final catalog result (24 hour TTL)
            try {
                await this.cacheService.setCachedData('catalog', catalogCacheKey, catalogResult, 24 * 60 * 60 * 1000);
                console.log(`💾 Cached final catalog result for ${catalogId} (TTL: 24h)`);
            } catch (cacheError) {
                console.log(`⚠️ Failed to cache catalog result: ${cacheError.message}`);
            }

            console.log(`✅ Catalog ${catalogId} ready: ${enrichedItems.length} items`);
            console.log(`⚡ Performance breakdown: TMDB ${tmdbTime}ms, Mapping ${mappingTime}ms, Total ${totalTime}ms`);
            
            return catalogResult;

        } catch (error) {
            console.error(`Failed to fetch catalog ${catalogId}:`, error.message);
            
            // Return empty catalog instead of throwing to avoid breaking Stremio
            return {
                metas: [],
                total: 0,
                page: page,
                hasMore: false,
                error: error.message,
                cacheMaxAge: 300 // 5 minutes cache for error responses
            };
        }
    }

    /**
     * Parse catalog ID to extract type and category
     */
    parseCatalogId(catalogId) {
        // Expected format: "movie-popular", "series-trending", etc.
        const match = catalogId.match(/^(movie|series)-(.+)$/);
        if (!match) {
            return null;
        }

        const [, type, categoryPart] = match;
        
        // Map frontend categories to TMDB categories
        const categoryMap = {
            'popular': 'popular',
            'trending': 'trending',
            'toprated': 'top_rated',
            'latest': 'latest',
            'discover': 'discover'
        };

        const category = categoryMap[categoryPart.toLowerCase()] || categoryPart;
        
        // Validate category using shared configuration
        if (!CATALOG_CONFIG.validation.validCategories.includes(category)) {
            return null;
        }
        
        // Validate content type using shared configuration
        if (!CATALOG_CONFIG.validation.validContentTypes.includes(type)) {
            return null;
        }
        
        return { type, category };
    }

    /**
     * Sort catalog items based on category
     */
    sortCatalogItems(items, category) {
        switch (category) {
            case 'popular':
            case 'trending':
                // Sort by TMDB popularity if available
                items.sort((a, b) => (b.tmdb_popularity || 0) - (a.tmdb_popularity || 0));
                break;
            case 'top_rated':
                // Sort by rating (IMDb rating if available, then vote average)
                items.sort((a, b) => {
                    const aRating = parseFloat(a.imdbRating || a.vote_average || 0);
                    const bRating = parseFloat(b.imdbRating || b.vote_average || 0);
                    return bRating - aRating;
                });
                break;
            case 'latest':
                // Sort by release date (newest first)
                items.sort((a, b) => {
                    const aDate = new Date(a.released || a.releaseInfo?.date || 0);
                    const bDate = new Date(b.released || b.releaseInfo?.date || 0);
                    return bDate - aDate;
                });
                break;
            default:
                // Keep original order for other categories
                break;
        }
    }

    /**
     * Get enabled catalogs for manifest generation - respects user ordering
     * @param {string} configString - Optional configuration string (e.g., "movie-popular:0,series-trending:1")
     */
    getEnabledCatalogs(configString) {
        let catalogConfig = this.catalogConfig;
        
        // If configuration string is provided, parse and apply it temporarily
        if (configString) {
            catalogConfig = this.parseConfigurationString(configString);
        }
        
        const enabledCatalogs = [];
        
        // Collect all enabled catalogs with their order
        const allCatalogs = [];
        
        for (const [type, catalogs] of Object.entries(catalogConfig)) {
            const enabledInType = catalogs
                .filter(catalog => catalog.enabled)
                .map(catalog => ({
                    type: type === 'series' ? 'series' : 'movie',
                    id: catalog.id,
                    name: `TVDB - ${catalog.name}`,
                    category: catalog.category,
                    order: catalog.order !== undefined ? catalog.order : 999, // Default high order for items without explicit order
                    extra: [
                        {
                            name: 'skip',
                            isRequired: false
                        }
                    ]
                }));
                
            allCatalogs.push(...enabledInType);
        }
        
        // Sort by user-defined order, then by type (movies first), then by name
        allCatalogs.sort((a, b) => {
            if (a.order !== b.order) {
                return a.order - b.order;
            }
            if (a.type !== b.type) {
                return a.type === 'movie' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        
        return allCatalogs;
    }

    /**
     * Parse configuration string and return a temporary configuration object
     * @param {string} configString - Configuration string (e.g., "movie-popular:0,series-trending:1")
     * @returns {object} Temporary configuration object
     */
    parseConfigurationString(configString) {
        if (!configString) return this.catalogConfig;
        
        try {
            // Create a copy of the default configuration with all items disabled
            const tempConfig = {
                movies: this.defaultConfig.movies.map(catalog => ({ ...catalog, enabled: false })),
                series: this.defaultConfig.series.map(catalog => ({ ...catalog, enabled: false }))
            };
            
            // Parse the configuration string
            const configParts = configString.split(',');
            
            for (const part of configParts) {
                const [catalogId, orderStr] = part.split(':');
                const order = parseInt(orderStr, 10);
                
                if (!catalogId || isNaN(order)) continue;
                
                // Find and enable the catalog in the appropriate type
                let found = false;
                for (const type of ['movies', 'series']) {
                    const catalog = tempConfig[type].find(c => c.id === catalogId);
                    if (catalog) {
                        catalog.enabled = true;
                        catalog.order = order;
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    console.warn(`Unknown catalog ID in configuration: ${catalogId}`);
                }
            }
            
            return tempConfig;
        } catch (error) {
            console.warn('Failed to parse configuration string:', error.message);
            return this.catalogConfig;
        }
    }

    /**
     * Update catalog configuration
     */
    updateCatalogConfig(newConfig) {
        // Validate configuration
        if (!newConfig || typeof newConfig !== 'object') {
            throw new Error('Invalid catalog configuration');
        }

        // Merge with default config to ensure all required fields
        this.catalogConfig = {
            movies: newConfig.movies || this.defaultConfig.movies,
            series: newConfig.series || this.defaultConfig.series
        };

        console.log('📝 Catalog configuration updated');
        return this.catalogConfig;
    }

    /**
     * Get current catalog configuration
     */
    getCatalogConfig() {
        return { ...this.catalogConfig };
    }

    /**
     * Reset catalog configuration to defaults
     */
    resetCatalogConfig() {
        this.catalogConfig = { ...this.defaultConfig };
        console.log('🔄 Catalog configuration reset to defaults');
        return this.catalogConfig;
    }

    /**
     * Check if a catalog ID is valid and enabled
     */
    isCatalogEnabled(catalogId) {
        const catalogInfo = this.parseCatalogId(catalogId);
        if (!catalogInfo) {
            return false;
        }

        const { type } = catalogInfo;
        const typeKey = type === 'movie' ? 'movies' : 'series';
        const catalogs = this.catalogConfig[typeKey] || [];
        
        const catalog = catalogs.find(c => c.id === catalogId);
        return catalog ? catalog.enabled : false;
    }

    /**
     * Get all supported catalog IDs
     */
    getAllCatalogIds() {
        const allIds = [];
        
        for (const catalogs of Object.values(this.catalogConfig)) {
            allIds.push(...catalogs.map(c => c.id));
        }
        
        return allIds;
    }

    /**
     * Get service statistics
     */
    getStats() {
        const enabledCount = this.getEnabledCatalogs().length;
        const totalCount = this.getAllCatalogIds().length;
        
        return {
            name: 'Catalog Service',
            tmdb: this.tmdbService.getStats(),
            mapper: this.mapper.getStats(),
            catalogs: {
                enabled: enabledCount,
                total: totalCount,
                config: this.catalogConfig
            }
        };
    }
}

module.exports = CatalogService;
