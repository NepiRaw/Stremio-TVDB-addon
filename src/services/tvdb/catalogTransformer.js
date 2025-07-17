/**
 * TVDB Catalog Transformer
 * Transforms search results to Stremio catalog format with IMDB filtering
 */

const { validateImdbRequirement } = require('../../utils/imdbFilter');
// Note: This will be replaced by dependency injection in the constructor

class CatalogTransformer {
    constructor(contentFetcher, translationService, artworkHandler, cacheService) {
        this.contentFetcher = contentFetcher;
        this.translationService = translationService;
        this.artworkHandler = artworkHandler;
        this.cacheService = cacheService;
    }

    /**
     * Transform search results to catalog format with parallel IMDB filtering
     */
    async transformSearchResults(results, type, userLanguage = null) {
        // Step 1: Basic filtering and transformation
        const basicFiltered = results.filter(item => {
            if (type === 'movie' && item.type !== 'movie') return false;
            if (type === 'series' && item.type !== 'series') return false;
            return item.id && item.name;
        });

        if (basicFiltered.length === 0) {
            return [];
        }

        // Step 2: Transform to Stremio format in parallel
        const transformPromises = basicFiltered.map(item => 
            this.transformSearchItemToStremioMeta(item, userLanguage)
        );
        
        const transformedResults = (await Promise.allSettled(transformPromises))
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);

        if (transformedResults.length === 0) {
            return [];
        }

        // Step 3: Apply IMDB filtering with chunked parallel processing
        const imdbFilteredResults = await this.processIMDBValidationInChunks(transformedResults);
        
        console.log(`🎬 IMDB catalog filtering: ${transformedResults.length} → ${imdbFilteredResults.length} results`);
        return imdbFilteredResults;
    }

    /**
     * Process IMDB validation in chunks with caching to control API load
     */
    async processIMDBValidationInChunks(transformedResults, chunkSize = 8) {
        const results = [];
        
        // Process in chunks to avoid overwhelming the API
        for (let i = 0; i < transformedResults.length; i += chunkSize) {
            const chunk = transformedResults.slice(i, i + chunkSize);
            
            const chunkPromises = chunk.map(async (meta) => {
                try {
                    const numericId = meta.id.replace('tvdb-', '');
                    
                    // Check cache first
                    const cachedValidation = await this.cacheService.getImdbValidation(meta.type, numericId);
                    if (cachedValidation !== null) {
                        if (cachedValidation.isValid === true) {
                            return meta;
                        } else if (cachedValidation.isValid === false) {
                            console.log(`💾 "${meta.name}" - Cached as invalid, excluded from catalog`);
                            return null;
                        } else {
                            // isValid is null - treat as cache miss and fetch fresh data
                            console.log(`🔄 "${meta.name}" - Cached validation is null, re-validating`);
                        }
                    }
                    
                    // Not in cache, fetch from API
                    const detailedData = await this.contentFetcher.getContentDetails(meta.type, numericId);
                    const isValid = detailedData && validateImdbRequirement(detailedData, meta.type);
                    
                    // Cache the result
                    await this.cacheService.setImdbValidation(meta.type, numericId, isValid, detailedData);
                    
                    if (isValid) {
                        return meta;
                    } else {
                        console.log(`🚫 "${meta.name}" - No IMDB ID, excluded from catalog`);
                        return null;
                    }
                } catch (error) {
                    // Skip items that fail validation
                    return null;
                }
            });

            const chunkResults = await Promise.allSettled(chunkPromises);
            const validChunkResults = chunkResults
                .filter(result => result.status === 'fulfilled' && result.value)
                .map(result => result.value);
            
            results.push(...validChunkResults);
        }
        
        return results;
    }

    /**
     * Transform search item to Stremio meta format
     */
    async transformSearchItemToStremioMeta(item, userLanguage = null) {
        try {
            const stremioType = item.type === 'movie' ? 'movie' : 'series';
            const numericId = this.extractNumericId(item.id);
            const id = `tvdb-${numericId}`;

            // Get translated name
            let selectedName = item.name || item.primary_title || 'Unknown Title';
            if (item.translations && Object.keys(item.translations).length > 0) {
                const translatedName = this.translationService.selectPreferredTranslation(
                    item.translations, userLanguage
                );
                if (translatedName) selectedName = translatedName;
            }

            // Get translated description
            let selectedDescription = item.overview;
            if (item.overviews && Object.keys(item.overviews).length > 0) {
                const translatedDescription = this.translationService.selectPreferredTranslation(
                    item.overviews, userLanguage
                );
                if (translatedDescription) selectedDescription = translatedDescription;
            }

            const meta = {
                id,
                type: stremioType,
                name: selectedName
            };

            // Get enhanced artwork including clearlogo for series
            if (stremioType === 'series') {
                try {
                    const artwork = await this.artworkHandler.getArtwork('series', numericId, userLanguage);
                    
                    if (artwork.poster) {
                        meta.poster = artwork.poster;
                    }
                    
                    if (artwork.logo) {
                        meta.logo = artwork.logo;
                        console.log(`🏷️ Added clearlogo to catalog item: ${selectedName}`);
                    }
                } catch (error) {
                    console.log(`🎨 Artwork error for ${selectedName}: ${error.message}`);
                }
            }

            // Add poster fallbacks if not already set
            if (!meta.poster) {
                const posterSources = [
                    item.image_url, item.poster, item.image, item.thumbnail
                ].filter(Boolean);
                
                if (posterSources.length > 0) {
                    meta.poster = posterSources[0];
                }
            }

            // Add year
            const yearSources = [
                item.year,
                item.first_air_time ? new Date(item.first_air_time).getFullYear() : null,
                item.aired ? new Date(item.aired).getFullYear() : null,
                item.first_aired ? new Date(item.first_aired).getFullYear() : null
            ];
            
            for (const year of yearSources) {
                if (year && year > 1800 && year <= new Date().getFullYear() + 5) {
                    meta.year = year;
                    break;
                }
            }

            // Add description
            if (selectedDescription) {
                meta.description = selectedDescription;
            }

            // Add genres
            if (item.genres && Array.isArray(item.genres)) {
                meta.genres = item.genres
                    .map(genre => typeof genre === 'object' ? genre.name || genre.label || genre : genre)
                    .filter(g => g && typeof g === 'string' && g.trim().length > 0)
                    .map(g => g.trim());
                
                if (meta.genres.length === 0) delete meta.genres;
            }

            // Add rating
            const ratingSources = [
                item.vote_average, item.rating?.average, item.score, 
                item.imdb_rating, item.rating
            ];
            
            for (const rating of ratingSources) {
                if (rating && !isNaN(rating) && rating > 0) {
                    meta.imdbRating = rating.toString();
                    break;
                }
            }

            // Remove undefined properties
            Object.keys(meta).forEach(key => meta[key] === undefined && delete meta[key]);
            return meta;
        } catch (error) {
            console.error('Error transforming search item:', error);
            return null;
        }
    }

    /**
     * Extract numeric ID from TVDB ID format
     */
    extractNumericId(id) {
        if (typeof id === 'string') {
            const match = id.match(/(\d+)$/);
            return match ? match[1] : id;
        }
        return id;
    }
}

module.exports = CatalogTransformer;
