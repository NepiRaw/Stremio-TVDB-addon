/**
 * TMDB-TVDB Catalog Mapper
 * Maps TMDB catalog results to TVDB IDs for metadata enrichment
 * Optimized for performance with parallelized processing and batch operations
 */

class TMDBCatalogMapper {
    constructor(tmdbService, tvdbService, cacheService) {
        this.tmdbService = tmdbService;
        this.tvdbService = tvdbService;
        this.cacheService = cacheService;
        
        // Performance tracking
        this.stats = {
            totalMapped: 0,
            directMatches: 0,
            searchMatches: 0,
            failures: 0,
            avgMappingTime: 0
        };
    }

    /**
     * Map TMDB catalog items to TVDB IDs with metadata - optimized for speed
     */
    async mapCatalogToTVDB(type, tmdbCatalog, userLanguage = 'eng') {
        if (!tmdbCatalog?.results?.length) {
            console.log('📋 No TMDB catalog results to map');
            return [];
        }

        const startTime = Date.now();
        console.log(`🔄 Mapping ${tmdbCatalog.results.length} ${type} items from TMDB to TVDB (parallel processing)`);
        
        // Step 1: Get external IDs for all TMDB items in parallel batches
        const externalIdsPromises = [];
        const batchSize = 10; // Process in batches to avoid overwhelming APIs
        
        for (let i = 0; i < tmdbCatalog.results.length; i += batchSize) {
            const batch = tmdbCatalog.results.slice(i, i + batchSize);
            externalIdsPromises.push(
                this.tmdbService.getExternalIdsBatch(batch.map(item => ({
                    ...item,
                    media_type: type === 'series' ? 'tv' : type
                })))
            );
        }
        
        const externalIdsBatches = await Promise.allSettled(externalIdsPromises);
        const externalIds = externalIdsBatches
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value);
        
        // Step 2: Process items with known TVDB IDs vs. unknown in parallel
        const itemsWithTVDB = [];
        const itemsNeedingSearch = [];
        
        tmdbCatalog.results.forEach((item, index) => {
            const externals = externalIds.find(e => e.tmdbId === item.id)?.externalIds;
            if (externals?.tvdb_id) {
                itemsWithTVDB.push({ tmdbItem: item, tvdbId: externals.tvdb_id, externals });
                this.stats.directMatches++;
            } else {
                itemsNeedingSearch.push({ tmdbItem: item, externals });
            }
        });

        console.log(`📊 TVDB mapping status: ${itemsWithTVDB.length} direct matches, ${itemsNeedingSearch.length} need search`);

        // Step 3: Search for missing TVDB IDs by title in parallel batches
        const searchPromises = [];
        for (let i = 0; i < itemsNeedingSearch.length; i += batchSize) {
            const batch = itemsNeedingSearch.slice(i, i + batchSize);
            searchPromises.push(this.searchMissingTVDBIds(type, batch, userLanguage));
        }
        
        const searchBatches = await Promise.allSettled(searchPromises);
        const searchResults = searchBatches
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value);
        
        // Step 4: Combine all items with TVDB IDs
        const allMappedItems = [...itemsWithTVDB, ...searchResults];
        this.stats.searchMatches += searchResults.length;
        
        // Step 5: Enrich with TVDB metadata in parallel batches for maximum speed
        const enrichmentPromises = [];
        for (let i = 0; i < allMappedItems.length; i += batchSize) {
            const batch = allMappedItems.slice(i, i + batchSize);
            enrichmentPromises.push(this.enrichWithTVDBMetadata(batch, type, userLanguage));
        }
        
        const enrichmentBatches = await Promise.allSettled(enrichmentPromises);
        const enrichedItems = enrichmentBatches
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value)
            .filter(item => item !== null); // Remove failed enrichments

        // Update performance statistics
        const totalTime = Date.now() - startTime;
        this.stats.totalMapped += enrichedItems.length;
        this.stats.failures += (tmdbCatalog.results.length - enrichedItems.length);
        this.stats.avgMappingTime = (this.stats.avgMappingTime + totalTime) / 2;
        
        console.log(`✅ Successfully mapped and enriched ${enrichedItems.length}/${tmdbCatalog.results.length} items in ${totalTime}ms`);
        console.log(`⚡ Performance: ${Math.round(enrichedItems.length / (totalTime / 1000))} items/second`);
        
        return enrichedItems;
    }

    /**
     * Search for TVDB IDs using title fallback
     */
    async searchMissingTVDBIds(type, itemsNeedingSearch, userLanguage) {
        if (itemsNeedingSearch.length === 0) {
            return [];
        }

        console.log(`🔍 Searching TVDB for ${itemsNeedingSearch.length} items without direct mapping`);
        
        const searchPromises = itemsNeedingSearch.map(async ({ tmdbItem, externals }) => {
            try {
                // Get title from TMDB item
                const title = tmdbItem.title || tmdbItem.name || '';
                if (!title) {
                    console.log(`⚠️ No title found for TMDB item ${tmdbItem.id}`);
                    return null;
                }

                // Check mapping cache first
                const mappingKey = `mapping:tmdb:${tmdbItem.id}:type:${type}`;
                const cachedMapping = await this.getCachedMapping(mappingKey);
                if (cachedMapping) {
                    console.log(`💾 Mapping cache HIT for "${title}"`);
                    return { tmdbItem, tvdbId: cachedMapping.tvdbId, externals };
                }

                // Search TVDB by title
                const searchResults = await this.tvdbService.search(title, type, 5, userLanguage);
                
                if (searchResults && searchResults.length > 0) {
                    // Find best match (first result is usually most relevant)
                    const bestMatch = this.findBestTVDBMatch(tmdbItem, searchResults);
                    if (bestMatch) {
                        const tvdbId = this.extractTVDBId(bestMatch);
                        if (tvdbId) {
                            // Cache successful mapping for 7 days
                            await this.setCachedMapping(mappingKey, { tvdbId, confidence: 'search' }, 7 * 24 * 60 * 60 * 1000);
                            console.log(`✅ Found TVDB match for "${title}": ${tvdbId}`);
                            return { tmdbItem, tvdbId, externals };
                        }
                    }
                }

                // Cache negative result for 1 hour to avoid repeated failed searches
                await this.setCachedMapping(mappingKey, { tvdbId: null, confidence: 'none' }, 60 * 60 * 1000);
                console.log(`❌ No TVDB match found for "${title}"`);
                return null;

            } catch (error) {
                console.error(`Search error for TMDB item ${tmdbItem.id}:`, error.message);
                return null;
            }
        });

        const searchResults = await Promise.all(searchPromises);
        const validResults = searchResults.filter(result => result !== null);
        
        console.log(`🔍 Title search completed: ${validResults.length}/${itemsNeedingSearch.length} found`);
        return validResults;
    }

    /**
     * Find best TVDB match from search results
     */
    findBestTVDBMatch(tmdbItem, tvdbSearchResults) {
        // For now, return first result (TVDB search usually returns most relevant first)
        // TODO: Implement more sophisticated matching (year, similarity score, etc.)
        
        const tmdbYear = this.extractYear(tmdbItem);
        const tmdbTitle = tmdbItem.title || tmdbItem.name || '';
        
        // Try to find year-based match first
        if (tmdbYear) {
            const yearMatch = tvdbSearchResults.find(result => {
                const tvdbYear = this.extractYear(result);
                return tvdbYear && Math.abs(parseInt(tmdbYear) - parseInt(tvdbYear)) <= 1;
            });
            
            if (yearMatch) {
                console.log(`📅 Year-based match found for "${tmdbTitle}" (${tmdbYear})`);
                return yearMatch;
            }
        }
        
        // Fallback to first result
        return tvdbSearchResults[0];
    }

    /**
     * Extract year from TMDB or TVDB item
     */
    extractYear(item) {
        const dateString = item.release_date || item.first_air_date || item.year;
        if (dateString) {
            const year = dateString.substring(0, 4);
            return /^\d{4}$/.test(year) ? year : null;
        }
        return null;
    }

    /**
     * Extract TVDB ID from search result
     */
    extractTVDBId(tvdbItem) {
        if (tvdbItem.id) {
            return tvdbItem.id.toString();
        }
        return null;
    }

    /**
     * Enrich mapped items with full TVDB metadata - optimized for parallel processing
     */
    async enrichWithTVDBMetadata(mappedItems, type, userLanguage) {
        if (mappedItems.length === 0) {
            return [];
        }

        console.log(`🎭 Enriching ${mappedItems.length} items with TVDB metadata (parallel processing)`);
        
        // Step 1: Fetch all full TVDB items in parallel for efficiency
        const tvdbItems = await Promise.allSettled(
            mappedItems.map(async ({ tvdbId }) => {
                try {
                    // Use your TVDB service to fetch the full item by ID
                    // Prefer series or movie based on type
                    if (type === 'series') {
                        return await this.tvdbService.getSeriesDetails(tvdbId);
                    } else {
                        return await this.tvdbService.getMovieDetails(tvdbId);
                    }
                } catch (error) {
                    console.warn(`Failed to fetch full TVDB item for ${tvdbId}:`, error.message);
                    return null;
                }
            })
        );
        // Map to only fulfilled results
        const fullTvdbItems = tvdbItems.map((result, idx) => result.status === 'fulfilled' ? result.value : null);

        // Step 2: Enrich with detailed metadata in parallel
        const enrichmentPromises = mappedItems.map(async ({ tmdbItem, tvdbId, externals }, idx) => {
            const fullTvdbItem = fullTvdbItems[idx];
            if (!fullTvdbItem) return null;
            try {
                const tvdbMeta = await this.tvdbService.transformDetailedToStremioMeta(
                    fullTvdbItem,
                    type,
                    null, // No seasonsData for catalog
                    userLanguage
                );
                
                if (tvdbMeta) {
                    // Add TMDB-specific enhancements
                    this.enhanceMetaWithTMDBData(tvdbMeta, tmdbItem, externals);
                    
                    // Ensure title is preserved from TMDB if TVDB doesn't have it
                    if (tvdbMeta.name === 'Unknown Title' && (tmdbItem.title || tmdbItem.name)) {
                        tvdbMeta.name = tmdbItem.title || tmdbItem.name;
                        console.log(`📝 Used TMDB title for ${tvdbMeta.id}: ${tvdbMeta.name}`);
                    }

                    // Map to catalog meta preview (strip full-meta-only fields)
                    const previewFields = [
                        'id', 'type', 'name', 'poster', 'genres', 'year', 'description',
                        'background', 'logo', 'runtime', 'cast', 'director', 'imdb_id',
                        'country', 'language', 'network', 'released', 'imdbRating',
                        'videos', 'seasons'
                    ];
                    const catalogMeta = {};
                    for (const key of previewFields) {
                        if (tvdbMeta[key] !== undefined) {
                            catalogMeta[key] = tvdbMeta[key];
                        }
                    }
                    return catalogMeta;
                }
                return null;
            } catch (error) {
                console.warn(`Failed to enrich TVDB metadata for ${tvdbId}:`, error.message);
                return null;
            }
        });
        // Execute all enrichment operations in parallel
        const results = await Promise.allSettled(enrichmentPromises);
        const enrichedItems = results
            .filter(result => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value);
        
        console.log(`✅ Metadata enrichment complete: ${enrichedItems.length} items processed`);
        return enrichedItems;
    }

    /**
     * Enhance TVDB metadata with TMDB data
     */
    enhanceMetaWithTMDBData(tvdbMeta, tmdbItem, externals) {
        // Add TMDB popularity score for sorting
        if (tmdbItem.popularity) {
            tvdbMeta.tmdb_popularity = tmdbItem.popularity;
        }
        
        // Ensure external IDs are available
        if (externals?.imdb_id && !tvdbMeta.imdb_id) {
            tvdbMeta.imdb_id = externals.imdb_id;
        }

        // Add enhanced catalog metadata from TMDB
        
        // Add genres from TMDB if not present
        if (!tvdbMeta.genres && tmdbItem.genres && Array.isArray(tmdbItem.genres)) {
            tvdbMeta.genres = tmdbItem.genres
                .map(genre => genre.name || genre)
                .filter(Boolean);
        }

        // Add year from TMDB if not present
        if (!tvdbMeta.year) {
            const releaseDate = tmdbItem.release_date || tmdbItem.first_air_date;
            if (releaseDate) {
                const year = new Date(releaseDate).getFullYear();
                if (year && year > 1800 && year <= new Date().getFullYear() + 5) {
                    tvdbMeta.year = year;
                }
            }
        }

        // Add rating from TMDB if not present
        if (!tvdbMeta.imdbRating && tmdbItem.vote_average && tmdbItem.vote_average > 0) {
            tvdbMeta.imdbRating = tmdbItem.vote_average.toString();
        }

        // Add runtime from TMDB if not present
        if (!tvdbMeta.runtime) {
            if (tmdbItem.runtime && tmdbItem.runtime > 0) {
                tvdbMeta.runtime = `${tmdbItem.runtime} min`;
            } else if (tmdbItem.episode_run_time && Array.isArray(tmdbItem.episode_run_time) && tmdbItem.episode_run_time.length > 0) {
                tvdbMeta.runtime = `${tmdbItem.episode_run_time[0]} min`;
            }
        }

        // Add release date for movies
        if (tmdbItem.release_date && !tvdbMeta.released) {
            tvdbMeta.released = new Date(tmdbItem.release_date).toISOString();
        }

        // Add original language if not present
        if (!tvdbMeta.language && tmdbItem.original_language) {
            tvdbMeta.language = tmdbItem.original_language;
        }

        // Add production countries
        if (!tvdbMeta.country && tmdbItem.production_countries && Array.isArray(tmdbItem.production_countries)) {
            tvdbMeta.country = tmdbItem.production_countries
                .map(country => country.iso_3166_1 || country.name)
                .filter(Boolean)
                .slice(0, 3);
        } else if (!tvdbMeta.country && tmdbItem.origin_country && Array.isArray(tmdbItem.origin_country)) {
            tvdbMeta.country = tmdbItem.origin_country.slice(0, 3);
        }

        // Add networks for series
        if (tvdbMeta.type === 'series' && !tvdbMeta.network && tmdbItem.networks && Array.isArray(tmdbItem.networks) && tmdbItem.networks.length > 0) {
            tvdbMeta.network = tmdbItem.networks[0].name || tmdbItem.networks[0];
        }

        // Add status for series
        if (tvdbMeta.type === 'series' && !tvdbMeta.status && tmdbItem.status) {
            tvdbMeta.status = tmdbItem.status;
        }
        
        // Add TMDB poster as fallback if TVDB poster is missing
        if (!tvdbMeta.poster && tmdbItem.poster_path) {
            tvdbMeta.posterSources = tvdbMeta.posterSources || [];
            tvdbMeta.posterSources.unshift(`https://image.tmdb.org/t/p/w500${tmdbItem.poster_path}`);
        }
        
        // Add TMDB backdrop as fallback
        if (!tvdbMeta.background && tmdbItem.backdrop_path) {
            tvdbMeta.backgroundSources = tvdbMeta.backgroundSources || [];
            tvdbMeta.backgroundSources.unshift(`https://image.tmdb.org/t/p/w1280${tmdbItem.backdrop_path}`);
        }
    }

    /**
     * Cache mapping result
     */
    async getCachedMapping(key) {
        try {
            if (this.cacheService.getCachedData) {
                return await this.cacheService.getCachedData('mapping', key);
            } else if (this.cacheService.getImdbValidation) {
                return await this.cacheService.getCachedData('mapping', key);
            }
        } catch (error) {
            console.error('Mapping cache get error:', error.message);
        }
        return null;
    }

    /**
     * Set mapping cache
     */
    async setCachedMapping(key, data, ttl) {
        try {
            if (this.cacheService.setCachedData) {
                await this.cacheService.setCachedData('mapping', key, data, ttl);
            } else if (this.cacheService.setImdbValidation) {
                // Legacy cache fallback
                await this.cacheService.setCachedData('mapping', key, data, ttl);
            }
        } catch (error) {
            console.error('Mapping cache set error:', error.message);
        }
    }

    /**
     * Get mapping statistics for performance monitoring
     */
    getStats() {
        const successRate = this.stats.totalMapped / (this.stats.totalMapped + this.stats.failures) * 100;
        
        return {
            name: 'TMDB-TVDB Mapper',
            performance: {
                totalMapped: this.stats.totalMapped,
                directMatches: this.stats.directMatches,
                searchMatches: this.stats.searchMatches,
                failures: this.stats.failures,
                successRate: isNaN(successRate) ? '0.0%' : successRate.toFixed(1) + '%',
                avgMappingTime: Math.round(this.stats.avgMappingTime) + 'ms'
            },
            ratios: {
                directMatchRate: (this.stats.directMatches / this.stats.totalMapped * 100).toFixed(1) + '%',
                searchRequiredRate: (this.stats.searchMatches / this.stats.totalMapped * 100).toFixed(1) + '%'
            }
        };
    }
}

module.exports = TMDBCatalogMapper;
