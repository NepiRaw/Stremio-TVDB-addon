/**
 * TVDB Artwork Handler
 * Handles poster, background, and logo selection for movies and series
 */

class ArtworkHandler {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    /**
     * Get optimized artwork for content
     */
    async getArtwork(entityType, entityId, language = 'eng') {
        try {
            if (entityType === 'movies' || entityType === 'movie') {
                // Movies have artwork in extended data, not separate endpoint
                return { poster: null, background: null };
            }
            
            // Series use dedicated artwork endpoint
            const response = await this.apiClient.makeRequest(`/series/${entityId}/artworks`, {
                lang: language
            });
            
            const artworks = response?.data?.artworks || [];
            return this.selectOptimalArtwork(artworks);
        } catch (error) {
            console.error(`Artwork fetch error for ${entityType} ${entityId}:`, error.message);
            return { poster: null, background: null };
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
     * Get enhanced artwork sources with fallbacks for metadata
     */
    getArtworkFallbacks(item, stremioType) {
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

        return { posterSources, backgroundSources };
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
}

module.exports = ArtworkHandler;
