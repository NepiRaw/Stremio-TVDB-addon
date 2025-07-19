/**
 * TVDB Artwork Handler
 * Handles poster, background, and logo selection for movies and series
 */

class ArtworkHandler {
    constructor(apiClient, cacheService) {
        this.apiClient = apiClient;
        this.cacheService = cacheService;
    }

    /**
     * Get optimized artwork for content including clearlogo
     */
    async getArtwork(entityType, entityId, language = 'eng') {
        try {
            // Check cache first
            const cacheKey = `${entityType}:${entityId}:${language}`;
            const cachedArtwork = await this.cacheService.getArtwork(entityType, entityId, language);
            if (cachedArtwork) {
                console.log(`💾 Artwork cache HIT for ${entityType} ${entityId}`);
                return cachedArtwork;
            }

            if (entityType === 'movies' || entityType === 'movie') {
                // Movies don't have artwork endpoint in TVDB API v4, fall back to basic sources
                const result = { poster: null, background: null, logo: null };
                // Cache the negative result to avoid repeated API calls
                await this.cacheService.setArtwork(entityType, entityId, language, result);
                return result;
            }
            
            // Series use dedicated artwork endpoint
            // Fetch ALL artworks (no language filter) to get best backgrounds
            // Language filtering will be applied later for posters and clearlogos only
            const response = await this.apiClient.makeRequest(`/series/${entityId}/artworks`);
            
            const artworks = response?.data?.artworks || [];
            
            if (artworks.length === 0) {
                const result = { poster: null, background: null, logo: null };
                // Cache the negative result
                await this.cacheService.setArtwork(entityType, entityId, language, result);
                return result;
            }
            
            const result = this.selectOptimalArtwork(artworks, language);
            
            // Add clearlogo selection  
            result.logo = this.selectBestClearlogo(artworks, language);
            
            // Cache the artwork data
            await this.cacheService.setArtwork(entityType, entityId, language, result);
            console.log(`🎨 Cached artwork for ${entityType} ${entityId}`);
            
            return result;
        } catch (error) {
            console.error(`❌ Artwork fetch error for ${entityType} ${entityId}:`, error.message);
            // Cache negative result to avoid repeated failures
            const result = { poster: null, background: null, logo: null };
            await this.cacheService.setArtwork(entityType, entityId, language, result);
            return result;
        }
    }

    /**
     * Select optimal poster and background from artwork array
     */
    selectOptimalArtwork(artworks, preferredLanguage = 'eng') {
        const posters = [];
        const backgrounds = [];
        
        // Categorize artworks by type
        for (const art of artworks) {
            if (!art.image) continue;
            
            if (art.type === 2 || art.type === '2' || art.typeName?.toLowerCase().includes('poster')) {
                posters.push(art);
            }
            if (art.type === 3 || art.type === '3' || 
                art.typeName?.toLowerCase().includes('fanart') || 
                art.typeName?.toLowerCase().includes('background')) {
                backgrounds.push(art);
            }
        }
        
        return {
            poster: this.selectBestPoster(posters, preferredLanguage),
            background: this.selectBestBackground(backgrounds)
        };
    }

    /**
     * Select best poster with language fallback chain
     * Fallback: poster (pref lang) -> poster (eng) -> poster (any) -> null
     */
    selectBestPoster(posters, preferredLanguage = 'eng') {
        if (posters.length === 0) {
            return null;
        }
        
        // Step 1: Try preferred language
        const preferredLangPosters = posters.filter(art => art.language === preferredLanguage);
        if (preferredLangPosters.length > 0) {
            const best = this.selectBestFromArray(preferredLangPosters);
            return best ? best.image : null;
        }
        
        // Step 2: Try English if preferred wasn't English
        if (preferredLanguage !== 'eng') {
            const englishPosters = posters.filter(art => art.language === 'eng');
            if (englishPosters.length > 0) {
                const best = this.selectBestFromArray(englishPosters);
                return best ? best.image : null;
            }
        }
        
        // Step 3: Try any language available (highest score/resolution)
        const best = this.selectBestFromArray(posters);
        return best ? best.image : null;
    }

    /**
     * Select best background prioritizing score first (no language fallback needed)
     */
    selectBestBackground(backgrounds) {
        if (backgrounds.length === 0) return null;
        
        // Sort by score first (highest priority), then good aspect ratio, then resolution
        const bestBackground = backgrounds.sort((a, b) => {
            // 1. Score is most important (language-agnostic)
            if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
            
            // 2. Then prefer good landscape aspect ratio
            const aAspectRatio = a.width && a.height ? a.width / a.height : 0;
            const bAspectRatio = b.width && b.height ? b.width / b.height : 0;
            const aIsGoodRatio = aAspectRatio >= 1.5 && aAspectRatio <= 2.5;
            const bIsGoodRatio = bAspectRatio >= 1.5 && bAspectRatio <= 2.5;
            if (aIsGoodRatio !== bIsGoodRatio) return bIsGoodRatio ? 1 : -1;
            
            // 3. Finally by resolution
            const aResolution = (a.width || 0) * (a.height || 0);
            const bResolution = (b.width || 0) * (b.height || 0);
            return bResolution - aResolution;
        })[0];
        
        return bestBackground.image;
    }

    /**
     * Select best clearlogo with proper fallback chain
     * Fallback: clearlogo (pref lang) -> clearlogo (eng) -> clearlogo (any) -> null (plain text)
     */
    selectBestClearlogo(artworks, preferredLanguage = 'eng') {
        // Filter for ONLY clearlogo artworks (type 23) - no clearart fallback
        const clearlogos = artworks.filter(art => 
            art.type === 23 || art.type === '23' || 
            art.typeName?.toLowerCase().includes('clearlogo') ||
            (art.image && art.image.includes('/clearlogo/'))
        );
        
        if (clearlogos.length === 0) {
            return null;
        }
        
        // Step 1: Try preferred language
        const preferredLangLogos = clearlogos.filter(art => art.language === preferredLanguage);
        if (preferredLangLogos.length > 0) {
            const best = this.selectBestFromArray(preferredLangLogos);
            return best ? best.image : null;
        }
        
        // Step 2: Try English if preferred wasn't English
        if (preferredLanguage !== 'eng') {
            const englishLogos = clearlogos.filter(art => art.language === 'eng');
            if (englishLogos.length > 0) {
                const best = this.selectBestFromArray(englishLogos);
                return best ? best.image : null;
            }
        }
        
        // Step 3: Try any language available
        const best = this.selectBestFromArray(clearlogos);
        return best ? best.image : null;
    }

    /**
     * Select best artwork from array by score and resolution
     */
    selectBestFromArray(artworks) {
        return artworks.sort((a, b) => {
            // Sort by score first, then resolution
            if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
            return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
        })[0];
    }

    /**
     * Get enhanced artwork sources with fallbacks for metadata
     */
    getArtworkFallbacks(item, stremioType, language = 'eng') {
        // Prioritize language-aware sorted posters, then fallback to item defaults
        const sortedPosters = this.getTypeSpecificPosters(item, stremioType, language);
        
        const posterSources = [
            ...sortedPosters,
            item.image,
            item.poster
        ].filter(Boolean);

        const backgroundSources = [
            ...this.getTypeSpecificBackgrounds(item, stremioType),
            item.fanart,
            item.backdrop,
            item.background,
            item.image  // Final fallback
        ].filter(Boolean);

        const logoSources = [
            ...this.getTypeSpecificClearlogos(item, language),
            item.clearlogo,
            item.logo
        ].filter(Boolean);

        return { posterSources, backgroundSources, logoSources };
    }

    /**
     * Get type-specific poster sources with language preference
     */
    getTypeSpecificPosters(item, stremioType, language = 'eng') {
        if (!item.artworks) return [];
        
        const posters = item.artworks
            .filter(art => {
                const isMoviePoster = (stremioType === 'movie') && 
                    (art.type === 14 || art.typeName?.toLowerCase().includes('poster'));
                const isSeriesPoster = (stremioType === 'series') && 
                    (art.type === 2 || art.typeName?.toLowerCase().includes('poster'));
                return (isMoviePoster || isSeriesPoster) && art.image;
            });

        // Apply language-aware sorting with fallback chain: pref lang -> eng -> any lang
        const sorted = posters
            .sort((a, b) => {
                // Step 1: Prioritize preferred language
                const aLangMatch = (a.language === language) ? 2 : 0;
                const bLangMatch = (b.language === language) ? 2 : 0;
                
                // Step 2: Then English fallback (if not already preferred)
                const aEngMatch = (language !== 'eng' && a.language === 'eng') ? 1 : 0;
                const bEngMatch = (language !== 'eng' && b.language === 'eng') ? 1 : 0;
                
                const aLangScore = aLangMatch + aEngMatch;
                const bLangScore = bLangMatch + bEngMatch;
                
                if (aLangScore !== bLangScore) return bLangScore - aLangScore;

                // Step 3: Then by score
                if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
                
                // Step 4: Then by aspect ratio (prefer portrait for posters)
                const aRatio = a.width && a.height ? a.width / a.height : 0;
                const bRatio = b.width && b.height ? b.width / b.height : 0;
                const aIsPortrait = aRatio >= 0.6 && aRatio <= 0.8;
                const bIsPortrait = bRatio >= 0.6 && bRatio <= 0.8;
                if (aIsPortrait !== bIsPortrait) return bIsPortrait ? 1 : -1;
                
                // Step 5: Finally by resolution
                return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
            });
        
        return sorted.map(art => art.image);
    }

    /**
     * Get type-specific background sources
     */
    getTypeSpecificBackgrounds(item, stremioType) {
        if (!item.artworks) return [];
        
        return item.artworks
            .filter(art => {
                const isMovieBackground = (stremioType === 'movie') && 
                    (art.type === 15 || art.typeName?.toLowerCase().includes('background'));
                const isSeriesFanart = (stremioType === 'series') && 
                    (art.type === 3 || art.typeName?.toLowerCase().includes('fanart'));
                return (isMovieBackground || isSeriesFanart) && art.image;
            })
            .sort((a, b) => {
                const aRatio = a.width && a.height ? a.width / a.height : 0;
                const bRatio = b.width && b.height ? b.width / b.height : 0;
                const aIsLandscape = aRatio >= 1.5 && aRatio <= 2.5;
                const bIsLandscape = bRatio >= 1.5 && bRatio <= 2.5;
                if (aIsLandscape !== bIsLandscape) return bIsLandscape ? 1 : -1;
                return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
            })
            .map(art => art.image);
    }

    /**
     * Get type-specific clearlogo sources with proper fallback chain
     * Only returns clearlogo (type 23), no clearart fallback
     */
    getTypeSpecificClearlogos(item, language = 'eng') {
        if (!item.artworks) return [];
        
        // Filter for ONLY clearlogo (type 23) - exclude clearart
        const clearlogos = item.artworks.filter(art => {
            const isClearlogo = art.type === 23 || art.type === '23' || 
                art.typeName?.toLowerCase().includes('clearlogo') ||
                (art.image && art.image.includes('/clearlogo/'));
            return isClearlogo && art.image;
        });
        
        if (clearlogos.length === 0) return [];
        
        // Sort with proper fallback chain: pref lang -> eng -> any lang
        return clearlogos
            .sort((a, b) => {
                // Step 1: Prioritize preferred language
                const aLangMatch = (a.language === language) ? 2 : 0;
                const bLangMatch = (b.language === language) ? 2 : 0;
                
                // Step 2: Then English fallback (if not already preferred)
                const aEngMatch = (a.language === 'eng') ? 1 : 0;
                const bEngMatch = (b.language === 'eng') ? 1 : 0;
                
                const aLangScore = aLangMatch + aEngMatch;
                const bLangScore = bLangMatch + bEngMatch;
                
                if (aLangScore !== bLangScore) return bLangScore - aLangScore;
                
                // Step 3: Then by score and resolution
                if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
                return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
            })
            .map(art => art.image);
    }
}

module.exports = ArtworkHandler;
