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

            // Get language-specific translated name with proper fallback chain
            let selectedName = await this.getLanguageSpecificName(item, stremioType, numericId, userLanguage);
            
            // Fallback to item fields if no translation found
            if (!selectedName || selectedName === 'Unknown Title') {
                selectedName = item.name || item.primary_title || item.title || item.original_title || 'Unknown Title';
                
                // Apply translations if available in item data
                if (item.translations && Object.keys(item.translations).length > 0) {
                    const translatedName = this.translationService.selectPreferredTranslation(
                        item.translations, userLanguage
                    );
                    if (translatedName) selectedName = translatedName;
                }
            }

            // Get language-specific translated description  
            let selectedDescription = await this.getLanguageSpecificDescription(item, stremioType, numericId, userLanguage);
            
            // Fallback to item description if no translation found
            if (!selectedDescription && item.overview) {
                selectedDescription = item.overview;
                
                // Apply translations if available in item data
                if (item.overviews && Object.keys(item.overviews).length > 0) {
                    const translatedDescription = this.translationService.selectPreferredTranslation(
                        item.overviews, userLanguage
                    );
                    if (translatedDescription) selectedDescription = translatedDescription;
                }
            }

            // Build enhanced meta object with Discovery-compatible fields
            const meta = {
                id,
                type: stremioType,
                name: selectedName
            };

            // Get enhanced artwork including clearlogo for both series and movies
            if (stremioType === 'series') {
                try {
                    const artwork = await this.artworkHandler.getArtwork('series', numericId, this.translationService.mapToTvdbLanguage(userLanguage));
                    
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
            } else if (stremioType === 'movie') {
                // For movies, fetch extended data to get artworks for language-aware selection
                try {
                    const movieData = await this.contentFetcher.getContentDetails('movie', numericId);
                    if (movieData && movieData.artworks) {
                        // Add artworks to item so language-aware selection can work
                        item.artworks = movieData.artworks;
                    }
                } catch (error) {
                    console.log(`🎨 Movie artwork fetch error for ${selectedName}: ${error.message}`);
                }
            }

            // Add poster fallbacks if not already set - use language-aware selection
            if (!meta.poster) {
                // Use language-aware poster selection if artworks available
                if (item.artworks && item.artworks.length > 0) {
                    const { posterSources } = this.artworkHandler.getArtworkFallbacks(
                        item, 
                        meta.type, 
                        this.translationService.mapToTvdbLanguage(userLanguage || 'eng')
                    );
                    
                    if (posterSources.length > 0) {
                        meta.poster = posterSources[0];
                    }
                } else {
                    // Fallback to basic sources only if no artworks available
                    const posterSources = [
                        item.image_url, item.poster, item.image, item.thumbnail
                    ].filter(Boolean);
                    
                    if (posterSources.length > 0) {
                        meta.poster = posterSources[0];
                    }
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

            // Add theatrical status and release info for movies
            if (stremioType === 'movie') {
                try {
                    const { getEnhancedReleaseInfo } = require('../../utils/theatricalStatus');
                    const tvdbLanguage = this.translationService.mapToTvdbLanguage(userLanguage || 'eng');
                    const releaseInfo = getEnhancedReleaseInfo(item, tvdbLanguage);
                    
                    if (releaseInfo.released) {
                        meta.released = releaseInfo.released;
                    }
                    
                    if (releaseInfo.year && !meta.year) {
                        meta.year = releaseInfo.year;
                    }
                    
                    if (releaseInfo.statusMessage && releaseInfo.theatricalStatus?.inTheaters) {
                        const currentDescription = selectedDescription || '';
                        if (currentDescription) {
                            selectedDescription = `${releaseInfo.statusMessage}\n\n${currentDescription}`;
                        } else {
                            selectedDescription = releaseInfo.statusMessage;
                        }
                    }
                } catch (error) {
                    console.log(`🎬 Theatrical status error for ${selectedName}: ${error.message}`);
                }
            }

            if (selectedDescription) {
                meta.description = selectedDescription;
            }

            // Add enhanced metadata for Discovery section display
            await this.addEnhancedCatalogMetadata(meta, item, stremioType, numericId, userLanguage);

            if (item.genres && Array.isArray(item.genres)) {
                meta.genres = item.genres
                    .map(genre => typeof genre === 'object' ? genre.name || genre.label || genre : genre)
                    .filter(g => g && typeof g === 'string' && g.trim().length > 0)
                    .map(g => g.trim());
                
                if (meta.genres.length === 0) delete meta.genres;
            }

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

    /**
     * Get language-specific name with proper fallback chain
     */
    async getLanguageSpecificName(item, stremioType, numericId, userLanguage) {
        if (!userLanguage || userLanguage === 'eng') {
            return null; // Use item fallback
        }

        try {
            const entityType = stremioType === 'movie' ? 'movies' : 'series';
            const { translation } = await this.translationService.getContentTranslation(
                entityType, numericId, userLanguage
            );
            
            if (translation && translation.name && translation.name.trim()) {
                console.log(`🌐 Using ${userLanguage} title for ${numericId}: ${translation.name}`);
                return translation.name;
            }
        } catch (error) {
            console.log(`🌐 Translation error for ${numericId}: ${error.message}`);
        }

        return null; // Fall back to item fields
    }

    /**
     * Get language-specific description with proper fallback chain
     */
    async getLanguageSpecificDescription(item, stremioType, numericId, userLanguage) {
        if (!userLanguage || userLanguage === 'eng') {
            return item.overview || null;
        }

        try {
            const entityType = stremioType === 'movie' ? 'movies' : 'series';
            const { translation } = await this.translationService.getContentTranslation(
                entityType, numericId, userLanguage
            );
            
            if (translation && translation.overview && translation.overview.trim()) {
                console.log(`🌐 Using ${userLanguage} description for ${numericId}`);
                return translation.overview;
            }
        } catch (error) {
            console.log(`🌐 Translation error for ${numericId}: ${error.message}`);
        }

        return item.overview || null;
    }

    /**
     * Add enhanced metadata for Discovery section display
     */
    async addEnhancedCatalogMetadata(meta, item, stremioType, numericId, userLanguage) {
        try {
            // Add year information with enhanced logic
            const yearSources = [
                item.year,
                item.first_air_time ? new Date(item.first_air_time).getFullYear() : null,
                item.aired ? new Date(item.aired).getFullYear() : null,
                item.first_aired ? new Date(item.first_aired).getFullYear() : null,
                item.release_date ? new Date(item.release_date).getFullYear() : null
            ];
            
            for (const year of yearSources) {
                if (year && year > 1800 && year <= new Date().getFullYear() + 5) {
                    meta.year = year;
                    break;
                }
            }

            // Add genre information
            if (item.genres && Array.isArray(item.genres)) {
                meta.genres = item.genres
                    .map(genre => typeof genre === 'object' ? genre.name || genre.label || genre : genre)
                    .filter(g => g && typeof g === 'string' && g.trim().length > 0)
                    .map(g => g.trim());
                
                if (meta.genres.length === 0) delete meta.genres;
            }

            // Add rating information
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

            // Add runtime information
            if (item.runtime && item.runtime > 0) {
                meta.runtime = `${item.runtime} min`;
            } else if (item.episode_run_time && Array.isArray(item.episode_run_time) && item.episode_run_time.length > 0) {
                meta.runtime = `${item.episode_run_time[0]} min`;
            }

            // Add release information for movies
            if (stremioType === 'movie') {
                if (item.release_date) {
                    meta.released = new Date(item.release_date).toISOString();
                } else if (item.first_air_date) {
                    meta.released = new Date(item.first_air_date).toISOString();
                }
            }

            // Add cast information (limited for catalog performance but more than before)
            if (item.cast && Array.isArray(item.cast) && item.cast.length > 0) {
                meta.cast = item.cast.slice(0, 8).map(castMember => 
                    typeof castMember === 'object' ? castMember.name || castMember : castMember
                ).filter(Boolean);
            }

            // Add director for movies (expanded to multiple directors)
            if (stremioType === 'movie' && item.crew && Array.isArray(item.crew)) {
                const directors = item.crew
                    .filter(person => person.job === 'Director' || person.type === 'Director')
                    .map(director => director.name || director)
                    .filter(Boolean);
                
                if (directors.length > 0) {
                    meta.director = directors;
                }
            }

            // Add writer information
            if (item.crew && Array.isArray(item.crew)) {
                const writers = item.crew
                    .filter(person => 
                        person.job === 'Writer' || 
                        person.job === 'Screenplay' || 
                        person.job === 'Story' ||
                        person.type === 'Writer'
                    )
                    .map(writer => writer.name || writer)
                    .filter(Boolean)
                    .slice(0, 3); // Limit to 3 writers for space
                
                if (writers.length > 0) {
                    meta.writer = writers;
                }
            }

            // Add country information
            if (item.originalCountry) {
                meta.country = [item.originalCountry];
            } else if (item.country) {
                meta.country = [item.country];
            } else if (item.production_countries && Array.isArray(item.production_countries)) {
                meta.country = item.production_countries
                    .map(country => country.iso_3166_1 || country.name || country)
                    .filter(Boolean)
                    .slice(0, 3);
            }

            // Add language
            if (item.originalLanguage) {
                meta.language = item.originalLanguage;
            } else if (item.original_language) {
                meta.language = item.original_language;
            }

            // Add network for series
            if (stremioType === 'series') {
                if (item.originalNetwork?.name) {
                    meta.network = item.originalNetwork.name;
                } else if (item.latestNetwork?.name) {
                    meta.network = item.latestNetwork.name;
                } else if (item.network) {
                    meta.network = item.network;
                } else if (item.networks && Array.isArray(item.networks) && item.networks.length > 0) {
                    meta.network = item.networks[0].name || item.networks[0];
                }
            }

            // Add clearlogo for enhanced Discovery display (both series and movies)
            await this.addClearlogoToMeta(meta, item, stremioType, numericId, userLanguage);

            // Add awards and accolades if available
            if (item.awards && Array.isArray(item.awards) && item.awards.length > 0) {
                meta.awards = item.awards.slice(0, 3).map(award => award.name || award).filter(Boolean);
            }

            // Add status for series
            if (stremioType === 'series' && item.status) {
                meta.status = item.status;
            }

        } catch (error) {
            console.log(`📊 Enhanced metadata error for ${meta.name}: ${error.message}`);
        }
    }

    /**
     * Add clearlogo to metadata for both series and movies
     */
    async addClearlogoToMeta(meta, item, stremioType, numericId, userLanguage) {
        try {
            if (stremioType === 'series') {
                const artwork = await this.artworkHandler.getArtwork('series', numericId, this.translationService.mapToTvdbLanguage(userLanguage));
                
                if (artwork.logo) {
                    meta.logo = artwork.logo;
                    console.log(`🏷️ Added series clearlogo to catalog item: ${meta.name}`);
                }
            } else if (stremioType === 'movie') {
                // For movies, try to get clearlogo from extended data
                const movieData = await this.contentFetcher.getContentDetails('movie', numericId);
                if (movieData && movieData.artworks) {
                    const tvdbLanguage = this.translationService.mapToTvdbLanguage(userLanguage || 'eng');
                    const { logoSources } = this.artworkHandler.getArtworkFallbacks(
                        { ...item, artworks: movieData.artworks }, 
                        'movie', 
                        tvdbLanguage
                    );
                    
                    if (logoSources.length > 0) {
                        meta.logo = logoSources[0];
                        console.log(`🏷️ Added movie clearlogo to catalog item: ${meta.name}`);
                    }
                }
            }
        } catch (error) {
            console.log(`🎨 Clearlogo error for ${meta.name}: ${error.message}`);
        }
    }
}

module.exports = CatalogTransformer;
