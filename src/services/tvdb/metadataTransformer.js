/**
 * TVDB Metadata Transformer
 * Transforms detailed content data to full Stremio metadata format
 */

const { validateImdbRequirement } = require('../../utils/imdbFilter');

class MetadataTransformer {
    constructor(contentFetcher, translationService, artworkHandler) {
        this.contentFetcher = contentFetcher;
        this.translationService = translationService;
        this.artworkHandler = artworkHandler;
    }

    /**
     * Transform detailed TVDB data to full Stremio meta format
     */
    async transformDetailedToStremioMeta(item, type, seasonsData = null, tvdbLanguage = 'eng') {
        try {
            const stremioType = type === 'movie' ? 'movie' : 'series';
            
            // Validate IMDB requirement
            if (!validateImdbRequirement(item, stremioType)) {
                console.log(`🚫 Skipping ${stremioType} transformation - IMDB ID required`);
                return null;
            }
            
            const numericId = this.extractNumericId(item.id);
            const id = `tvdb-${numericId}`;

            // Base meta object
            const meta = {
                id,
                type: stremioType,
                name: item.name || 'Unknown Title'
            };

            // Get translations
            await this.applyTranslations(meta, stremioType, numericId, tvdbLanguage, item);

            // Apply artwork
            await this.applyArtwork(meta, stremioType, numericId, tvdbLanguage, item);

            // Extract IMDB ID
            const imdbId = this.contentFetcher.extractImdbId(item);
            if (imdbId) {
                meta.imdb_id = imdbId;
                console.log(`✅ Found IMDB ID: ${imdbId}`);
            }

            // Add basic metadata
            this.addBasicMetadata(meta, item);

            // Add type-specific content
            if (stremioType === 'series') {
                await this.addSeriesContent(meta, numericId, seasonsData, tvdbLanguage, imdbId);
            } else {
                this.addMovieContent(meta, imdbId);
            }

            // Clean up empty arrays
            this.cleanupEmptyArrays(meta);

            console.log(`✅ Successfully transformed ${stremioType} metadata: ${meta.name}`);
            return meta;
        } catch (error) {
            console.error('Error transforming detailed metadata:', error);
            return null;
        }
    }

    /**
     * Apply translations to metadata
     */
    async applyTranslations(meta, stremioType, numericId, tvdbLanguage, item) {
        const entityType = stremioType === 'movie' ? 'movies' : 'series';
        const { translation, isOriginal } = await this.translationService.getContentTranslation(
            entityType, numericId, tvdbLanguage
        );
        
        if (translation && translation.name && translation.name.trim()) {
            meta.name = translation.name;
            console.log(`✅ Using translated name (${translation.language || tvdbLanguage}): ${meta.name}`);
            
            if (translation.overview && translation.overview.trim()) {
                meta.description = translation.overview;
            }
        } else if (!meta.description && item.overview) {
            meta.description = item.overview;
        }
    }

    /**
     * Apply artwork to metadata
     */
    async applyArtwork(meta, stremioType, numericId, tvdbLanguage, item) {
        console.log(`🎨 Processing artwork for ${stremioType} ${numericId}`);
        
        const artwork = await this.artworkHandler.getArtwork(
            stremioType === 'movie' ? 'movies' : 'series', 
            numericId, 
            tvdbLanguage
        );
        
        // Apply high-res artwork if available
        if (artwork.poster) {
            meta.poster = artwork.poster;
            console.log(`✅ Got high-res poster from artwork API`);
        }
        
        if (artwork.background) {
            meta.background = artwork.background;
            console.log(`✅ Got high-res background from artwork API`);
        }
        
        // Apply fallbacks if no high-res artwork
        if (!meta.poster || !meta.background) {
            const { posterSources, backgroundSources } = this.artworkHandler.getArtworkFallbacks(item, stremioType);
            
            if (!meta.poster && posterSources.length > 0) {
                meta.poster = posterSources[0];
                console.log(`🔄 Using fallback poster`);
            }
            
            if (!meta.background && backgroundSources.length > 0) {
                meta.background = backgroundSources[0];
                console.log(`🔄 Using fallback background`);
            }
        }
    }

    /**
     * Add basic metadata (year, genres, cast, etc.)
     */
    addBasicMetadata(meta, item) {
        // Year
        if (item.year) {
            meta.year = parseInt(item.year);
        } else if (item.firstAired) {
            meta.year = new Date(item.firstAired).getFullYear();
        }

        // Genres
        if (Array.isArray(item.genres)) {
            meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
        }

        // Cast
        if (Array.isArray(item.characters)) {
            meta.cast = item.characters
                .filter(c => c.people?.name || c.personName)
                .map(c => c.people?.name || c.personName)
                .slice(0, 15);
        }

        // Country
        if (item.originalCountry) {
            meta.country = [item.originalCountry];
        } else if (item.country) {
            meta.country = [item.country];
        }

        // Runtime
        if (item.runtime) {
            meta.runtime = `${item.runtime} min`;
        } else if (item.averageRuntime) {
            meta.runtime = `${item.averageRuntime} min`;
        }

        // Language
        if (item.originalLanguage) {
            meta.language = item.originalLanguage;
        }

        // Network
        if (item.originalNetwork?.name) {
            meta.network = item.originalNetwork.name;
        } else if (item.latestNetwork?.name) {
            meta.network = item.latestNetwork.name;
        }
    }

    /**
     * Add series-specific content (episodes, seasons)
     */
    async addSeriesContent(meta, numericId, seasonsData, tvdbLanguage, imdbId) {
        meta.videos = [];
        meta.seasons = 0;
        
        if (!Array.isArray(seasonsData) || seasonsData.length === 0) {
            meta.behaviorHints = { defaultVideoId: null, hasScheduledVideos: false };
            return;
        }

        const validSeasons = this.contentFetcher.filterValidSeasons(seasonsData);
        console.log(`📺 Filtered to ${validSeasons.length} official seasons`);

        if (validSeasons.length === 0) {
            meta.behaviorHints = { defaultVideoId: null, hasScheduledVideos: false };
            return;
        }

        // Get episodes and translations
        const episodes = await this.contentFetcher.getSeriesEpisodes(numericId);
        if (episodes.length === 0) {
            meta.behaviorHints = { defaultVideoId: null, hasScheduledVideos: false };
            return;
        }

        console.log(`📺 Got ${episodes.length} episodes from API`);

        // Get bulk translations
        const translations = await this.translationService.getBulkEpisodeTranslations(numericId, tvdbLanguage);
        const { primaryLookup, fallbackLookup } = this.translationService.createTranslationLookups(
            translations.primary, translations.fallback
        );

        // Filter and process episodes
        const airedEpisodes = this.contentFetcher.filterAiredEpisodes(episodes);
        console.log(`📺 Filtered to ${airedEpisodes.length} aired episodes`);

        const episodesBySeason = this.contentFetcher.groupEpisodesBySeason(airedEpisodes);
        const seasonsWithContent = validSeasons.filter(season => 
            episodesBySeason[season.number] && episodesBySeason[season.number].length > 0
        );

        meta.seasons = seasonsWithContent.length;
        console.log(`📺 Final seasons with content: ${meta.seasons}`);

        // Build video entries
        const videoMap = new Map();
        for (const episode of airedEpisodes) {
            const videoId = imdbId ? 
                `${imdbId}:${episode.seasonNumber}:${episode.number}` :
                `${numericId}:${episode.seasonNumber}:${episode.number}`;
            
            if (!videoMap.has(videoId)) {
                const { episodeName, episodeOverview } = this.translationService.getEpisodeTranslation(
                    episode, primaryLookup, fallbackLookup
                );

                const video = {
                    id: videoId,
                    title: episodeName,
                    season: episode.seasonNumber,
                    episode: episode.number,
                    overview: episodeOverview,
                    thumbnail: this.getEpisodeThumbnail(episode, meta),
                    released: episode.aired ? new Date(episode.aired).toISOString() : null
                };
                
                videoMap.set(videoId, video);
            }
        }

        meta.videos = Array.from(videoMap.values());
        console.log(`📺 Created ${meta.videos.length} video entries`);

        meta.behaviorHints = {
            defaultVideoId: null,
            hasScheduledVideos: true
        };
    }

    /**
     * Add movie-specific content
     */
    addMovieContent(meta, imdbId) {
        console.log(`🎬 Movie processing complete: ${meta.name} (${meta.id})`);
        
        if (meta.videos) {
            delete meta.videos;
        }
        
        meta.behaviorHints = {
            defaultVideoId: imdbId || meta.id,
            hasScheduledVideos: false
        };
    }

    /**
     * Get episode thumbnail with fallbacks
     */
    getEpisodeThumbnail(episode, meta) {
        const sources = [
            episode.image, episode.thumbnail, episode.filename,
            meta.poster, meta.background
        ].filter(Boolean);
        
        return sources.length > 0 ? sources[0] : null;
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
     * Clean up empty arrays from metadata
     */
    cleanupEmptyArrays(meta) {
        Object.keys(meta).forEach(key => {
            if (Array.isArray(meta[key]) && meta[key].length === 0) {
                delete meta[key];
            }
        });
    }
}

module.exports = MetadataTransformer;
