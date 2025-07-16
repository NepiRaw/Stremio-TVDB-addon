/**
 * TVDB Artwork Handler
 * Handles poster, background, and logo selection for movies and series
 */

class ArtworkHandler {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    /**
     * Get optimized artwork for content including clearlogo
     */
    async getArtwork(entityType, entityId, language = 'eng') {
        try {
            if (entityType === 'movies' || entityType === 'movie') {
                // Movies have artwork in extended data, not separate endpoint
                return { poster: null, background: null, logo: null };
            }
            
            // Series use dedicated artwork endpoint
            const response = await this.apiClient.makeRequest(`/series/${entityId}/artworks`, {
                lang: language
            });
            
            const artworks = response?.data?.artworks || [];
            const result = this.selectOptimalArtwork(artworks);
            
            // Add clearlogo selection
            result.logo = this.selectBestClearlogo(artworks, language);
            
            return result;
        } catch (error) {
            console.error(`Artwork fetch error for ${entityType} ${entityId}:`, error.message);
            return { poster: null, background: null, logo: null };
        }
    }

    /**
     * Select optimal poster and background from artwork array
     */
    selectOptimalArtwork(artworks) {
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
            poster: this.selectBestPoster(posters),
            background: this.selectBestBackground(backgrounds)
        };
    }

    /**
     * Select best poster prioritizing resolution and score
     */
    selectBestPoster(posters) {
        if (posters.length === 0) return null;
        
        const bestPoster = posters.sort((a, b) => {
            const aResolution = (a.width || 0) * (a.height || 0);
            const bResolution = (b.width || 0) * (b.height || 0);
            if (aResolution !== bResolution) return bResolution - aResolution;
            return (b.score || 0) - (a.score || 0);
        })[0];
        
        console.log(`🎨 Selected poster: ${bestPoster.width}x${bestPoster.height} (score: ${bestPoster.score})`);
        return bestPoster.image;
    }

    /**
     * Select best background prioritizing landscape ratio and resolution
     */
    selectBestBackground(backgrounds) {
        if (backgrounds.length === 0) return null;
        
        const bestBackground = backgrounds.sort((a, b) => {
            const aResolution = (a.width || 0) * (a.height || 0);
            const bResolution = (b.width || 0) * (b.height || 0);
            if (aResolution !== bResolution) return bResolution - aResolution;
            
            const aAspectRatio = a.width && a.height ? a.width / a.height : 0;
            const bAspectRatio = b.width && b.height ? b.width / b.height : 0;
            const aIsGoodRatio = aAspectRatio >= 1.5 && aAspectRatio <= 2.5;
            const bIsGoodRatio = bAspectRatio >= 1.5 && bAspectRatio <= 2.5;
            if (aIsGoodRatio !== bIsGoodRatio) return bIsGoodRatio ? 1 : -1;
            
            return (b.score || 0) - (a.score || 0);
        })[0];
        
        const ratio = bestBackground.width && bestBackground.height ? 
            (bestBackground.width/bestBackground.height).toFixed(2) : 'unknown';
        console.log(`🎨 Selected background: ${bestBackground.width}x${bestBackground.height} (ratio: ${ratio}, score: ${bestBackground.score})`);
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
            console.log(`🏷️ No clearlogos found - will use plain text title`);
            return null;
        }
        
        // Step 1: Try preferred language
        const preferredLangLogos = clearlogos.filter(art => art.language === preferredLanguage);
        if (preferredLangLogos.length > 0) {
            const best = this.selectBestFromArray(preferredLangLogos);
            console.log(`🏷️ Selected clearlogo (${preferredLanguage}): ${best.width}x${best.height} (score: ${best.score})`);
            return best.image;
        }
        
        // Step 2: Try English if preferred wasn't English
        if (preferredLanguage !== 'eng') {
            const englishLogos = clearlogos.filter(art => art.language === 'eng');
            if (englishLogos.length > 0) {
                const best = this.selectBestFromArray(englishLogos);
                console.log(`🏷️ Selected clearlogo (eng fallback): ${best.width}x${best.height} (score: ${best.score})`);
                return best.image;
            }
        }
        
        // Step 3: Try any language available
        const best = this.selectBestFromArray(clearlogos);
        console.log(`🏷️ Selected clearlogo (any lang): ${best.width}x${best.height} (lang: ${best.language || 'unknown'}, score: ${best.score})`);
        return best.image;
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
        const posterSources = [
            item.image,
            item.poster,
            ...this.getTypeSpecificPosters(item, stremioType)
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
     * Get type-specific poster sources
     */
    getTypeSpecificPosters(item, stremioType) {
        if (!item.artworks) return [];
        
        return item.artworks
            .filter(art => {
                const isMoviePoster = (stremioType === 'movie') && 
                    (art.type === 14 || art.typeName?.toLowerCase().includes('poster'));
                const isSeriesPoster = (stremioType === 'series') && 
                    (art.type === 2 || art.typeName?.toLowerCase().includes('poster'));
                return (isMoviePoster || isSeriesPoster) && art.image;
            })
            .sort((a, b) => {
                const aRatio = a.width && a.height ? a.width / a.height : 0;
                const bRatio = b.width && b.height ? b.width / b.height : 0;
                const aIsPortrait = aRatio >= 0.6 && aRatio <= 0.8;
                const bIsPortrait = bRatio >= 0.6 && bRatio <= 0.8;
                if (aIsPortrait !== bIsPortrait) return bIsPortrait ? 1 : -1;
                return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
            })
            .map(art => art.image);
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
