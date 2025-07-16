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
        
        if (artwork.logo) {
            meta.logo = artwork.logo;
            console.log(`🏷️ Got clearlogo from artwork API`);
        }
        
        // Apply fallbacks if no high-res artwork
        if (!meta.poster || !meta.background || !meta.logo) {
            const { posterSources, backgroundSources, logoSources } = this.artworkHandler.getArtworkFallbacks(item, stremioType, tvdbLanguage);
            
            if (!meta.poster && posterSources.length > 0) {
                meta.poster = posterSources[0];
                console.log(`🔄 Using fallback poster`);
            }
            
            if (!meta.background && backgroundSources.length > 0) {
                meta.background = backgroundSources[0];
                console.log(`🔄 Using fallback background`);
            }
            
            if (!meta.logo && logoSources.length > 0) {
                meta.logo = logoSources[0];
                console.log(`🔄 Using fallback logo`);
            }
        }
    }

    /**
     * Add basic metadata (year, genres, cast, etc.)
     */
    addBasicMetadata(meta, item) {
        // Enhanced year with date range for series
        this.addEnhancedYear(meta, item);
        
        // Runtime information
        this.addEnhancedRuntime(meta, item);

        // Genres
        if (Array.isArray(item.genres)) {
            meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
        }

        // Cast - with genre-based filtering
        this.addCastWithGenreFiltering(meta, item);

        // Country
        if (item.originalCountry) {
            meta.country = [item.originalCountry];
        } else if (item.country) {
            meta.country = [item.country];
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
     * Add enhanced year with date range for series
     */
    addEnhancedYear(meta, item) {
        const startYear = item.firstAired ? new Date(item.firstAired).getFullYear() : 
                         item.year ? parseInt(item.year) : null;
        
        // For series, show date range based on status
        if (meta.type === 'series' && startYear) {
            const lastAiredDate = item.lastAired ? new Date(item.lastAired) : null;
            const endYear = lastAiredDate ? lastAiredDate.getFullYear() : null;
            
            // Extract status to determine format
            const status = this.extractValidStatus(item.status);
            
            if (status === 'ended' && endYear && endYear !== startYear) {
                // Ended series: show full range "2008-2013"
                meta.year = `${startYear}-${endYear}`;
                console.log(`📅 Series date range: ${meta.year}`);
            } else if (status === 'ended') {
                // Series ended in same year it started
                meta.year = startYear;
                console.log(`📅 Series year: ${meta.year}`);
            } else if (status === 'continuing') {
                // Ongoing series: show with dash "2016-"
                meta.year = `${startYear}-`;
                console.log(`📅 Ongoing series: ${meta.year}`);
            } else {
                // Unknown status: use date-based logic
                if (endYear && endYear !== startYear) {
                    meta.year = `${startYear}-${endYear}`;
                } else {
                    meta.year = startYear;
                }
                console.log(`📅 Series year (unknown status): ${meta.year}`);
            }
        } else {
            // For movies, use simple year
            meta.year = startYear;
        }
    }

    /**
     * Extract and validate TVDB status for date range logic
     */
    extractValidStatus(statusData) {
        if (!statusData) return null;
        
        let statusName = null;
        
        // Extract status name from object or string
        if (typeof statusData === 'object' && statusData.name) {
            statusName = statusData.name;
        } else if (typeof statusData === 'string') {
            statusName = statusData;
        } else {
            return null;
        }
        
        // Normalize and validate against known TVDB statuses
        const normalizedStatus = statusName.toLowerCase().trim();
        const validStatuses = ['ended', 'continuing'];
        
        return validStatuses.includes(normalizedStatus) ? normalizedStatus : null;
    }

    /**
     * Add runtime information
     */
    addEnhancedRuntime(meta, item) {
        if (item.runtime) {
            meta.runtime = `${item.runtime} min`;
        } else if (item.averageRuntime) {
            meta.runtime = `${item.averageRuntime} min`;
        }
    }

    /**
     * Add cast with genre-based filtering
     */
    addCastWithGenreFiltering(meta, item) {
        if (!Array.isArray(item.characters) || item.characters.length === 0) {
            return;
        }

        // Check if content is anime/animation
        const isAnimatedContent = this.isAnimatedContent(meta.genres || []);
        
        if (isAnimatedContent) {
            // Skip cast for anime/animation content
            console.log(`🎭 Skipping cast for animated content: ${meta.name}`);
            return;
        }

        // Filter valid actors and sort by importance
        const validActors = item.characters
            .filter(c => c.people?.name || c.personName)
            .sort((a, b) => {
                // Primary: Featured actors first
                const aFeatured = a.isFeatured ? 0 : 1;
                const bFeatured = b.isFeatured ? 0 : 1;
                if (aFeatured !== bFeatured) return aFeatured - bFeatured;
                
                // Secondary: Sort by sort order (lower number = more important)
                const aSort = a.sort !== undefined ? a.sort : 999;
                const bSort = b.sort !== undefined ? b.sort : 999;
                return aSort - bSort;
            });

        // Take top 5 most important actors
        const topActors = validActors
            .slice(0, 5)
            .map(c => c.people?.name || c.personName);

        if (topActors.length > 0) {
            meta.cast = topActors;
            console.log(`🎭 Added ${topActors.length} cast members (sorted by importance): ${topActors.join(', ')}`);
        }
    }

    /**
     * Check if content is animated (anime/animation)
     */
    isAnimatedContent(genres) {
        if (!Array.isArray(genres)) return false;
        
        const animatedGenres = [
            'anime', 'animation', 'animated', 'cartoon', 'アニメ'
        ];
        
        return genres.some(genre => {
            if (typeof genre !== 'string') return false;
            
            const genreLower = genre.toLowerCase().trim();
            return animatedGenres.some(animatedGenre => 
                genreLower.includes(animatedGenre)
            );
        });
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
