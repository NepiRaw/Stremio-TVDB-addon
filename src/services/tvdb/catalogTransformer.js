/**
 * TVDB Catalog Transformer
 * Transforms search results to Stremio catalog format with IMDB filtering
 */

const { validateImdbRequirement } = require('../../utils/imdbFilter');

class CatalogTransformer {
    constructor(contentFetcher, translationService, artworkHandler, cacheService, logger) {
        this.contentFetcher = contentFetcher;
        this.translationService = translationService;
        this.artworkHandler = artworkHandler;
        this.cacheService = cacheService;
        this.logger = logger;
    }

    async transformSearchResults(results, type, userLanguage = null) {
        const basicFiltered = results.filter(item => {
            if (type === 'movie' && item.type !== 'movie') return false;
            if (type === 'series' && item.type !== 'series') return false;
            return item.id && item.name;
        });

        if (basicFiltered.length === 0) {
            return [];
        }

        const transformPromises = basicFiltered.map(item => 
            this.transformSearchItemToStremioMeta(item, userLanguage)
        );
        
        const transformedResults = (await Promise.allSettled(transformPromises))
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);

        if (transformedResults.length === 0) {
            return [];
        }

        const imdbFilteredResults = await this.processIMDBValidationInChunks(transformedResults);
        
        this.logger?.debug?.(`IMDB catalog filtering: ${transformedResults.length} → ${imdbFilteredResults.length} results`);
        return imdbFilteredResults;
    }

    async processIMDBValidationInChunks(transformedResults, chunkSize = 8) {
        const results = [];
        
        for (let i = 0; i < transformedResults.length; i += chunkSize) {
            const chunk = transformedResults.slice(i, i + chunkSize);
            
            const chunkPromises = chunk.map(async (meta) => {
                try {
                    const numericId = meta.id.replace('tvdb-', '');
                    
                    const cachedValidation = await this.cacheService.getImdbValidation(meta.type, numericId);
                    if (cachedValidation !== null) {
                        if (cachedValidation.isValid === true) {
                            return meta;
                        } else if (cachedValidation.isValid === false) {
                        this.logger?.debug?.(`"${meta.name}" - Cached as invalid, excluded from catalog`);
                            return null;
                        } else {
                            this.logger?.debug?.(`"${meta.name}" - Cached validation is null, re-validating`);
                        }
                    }
                    
                    const detailedData = await this.contentFetcher.getContentDetails(meta.type, numericId);
                    const isValid = detailedData && validateImdbRequirement(detailedData, meta.type);
                    
                    await this.cacheService.setImdbValidation(meta.type, numericId, isValid, detailedData);
                    
                    if (isValid) {
                        return meta;
                    } else {
                        this.logger?.debug?.(`"${meta.name}" - No IMDB ID, excluded from catalog`);
                        return null;
                    }
                } catch (error) {
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

    async transformSearchItemToStremioMeta(item, userLanguage = null) {
        try {
            const stremioType = item.type === 'movie' ? 'movie' : 'series';
            const numericId = this.extractNumericId(item.id);
            const id = `tvdb-${numericId}`;

            let selectedName = item.name || item.primary_title || 'Unknown Title';
            if (item.translations && Object.keys(item.translations).length > 0) {
                const translatedName = this.translationService.selectPreferredTranslation(
                    item.translations, userLanguage
                );
                if (translatedName) selectedName = translatedName;
            }

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

            if (stremioType === 'series') {
                try {
                    const artwork = await this.artworkHandler.getArtwork('series', numericId, this.translationService.mapToTvdbLanguage(userLanguage));
                    
                    if (artwork.poster) {
                        meta.poster = artwork.poster;
                    }
                    
                    if (artwork.logo) {
                        meta.logo = artwork.logo;
                        this.logger?.debug?.(`Added clearlogo to catalog item: ${selectedName}`);
                    }
                } catch (error) {
                    this.logger?.debug?.(`Artwork error for ${selectedName}: ${error.message}`);
                }
            } else if (stremioType === 'movie') {
                try {
                    const movieData = await this.contentFetcher.getContentDetails('movie', numericId);
                    if (movieData && movieData.artworks) {
                        item.artworks = movieData.artworks;
                    }
                } catch (error) {
                    this.logger?.debug?.(`Movie artwork fetch error for ${selectedName}: ${error.message}`);
                }
            }

            if (!meta.poster) {
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
                    const posterSources = [
                        item.image_url, item.poster, item.image, item.thumbnail
                    ].filter(Boolean);
                    
                    if (posterSources.length > 0) {
                        meta.poster = posterSources[0];
                    }
                }
            }

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
                    this.logger?.debug?.(`Theatrical status error for ${selectedName}: ${error.message}`);
                }
            }

            if (selectedDescription) {
                meta.description = selectedDescription;
            }

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
            this.logger?.error?.('Error transforming search item:', error);
            return null;
        }
    }

    extractNumericId(id) {
        if (typeof id === 'string') {
            const match = id.match(/(\d+)$/);
            return match ? match[1] : id;
        }
        return id;
    }
}

module.exports = CatalogTransformer;
