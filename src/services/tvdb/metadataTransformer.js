/**
 * TVDB Metadata Transf            const numericId = parseInt(id, 10);
            
            // Extract all external IDs for cross-referencing
            const externalIds = this.contentFetcher.extractExternalIds(item);
            
            // Create Stremio-compatible primary ID
            // Priority: IMDb ID > TMDB ID > TVDB ID (for better cross-addon compatibility)
            let primaryId;
            if (externalIds.imdb_id) {
                primaryId = `${stremioType}:imdb:${externalIds.imdb_id}`;
            } else if (externalIds.tmdb_id) {
                primaryId = `${stremioType}:tmdb:${externalIds.tmdb_id}`;
            } else {
                primaryId = `${stremioType}:tvdb:${numericId}`;
            }

            // Base meta object with cross-reference IDs
            const meta = {
                id: primaryId,
                type: stremioType,
                name: item.name || 'Unknown Title',
                
                // Add all external IDs for cross-addon linking
                ...externalIds
            }; Transforms detailed content data to full Stremio metadata format
 */

const { validateImdbRequirement } = require('../../utils/imdbFilter');
const { getEnhancedReleaseInfo } = require('../../utils/theatricalStatus');

class MetadataTransformer {
    constructor(contentFetcher, translationService, artworkHandler, ratingService = null) {
        this.contentFetcher = contentFetcher;
        this.translationService = translationService;
        this.artworkHandler = artworkHandler;
        this.ratingService = ratingService;
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
            
            // Extract all external IDs for cross-referencing
            const externalIds = this.contentFetcher.extractExternalIds(item);
            
            // 🎯 CROSS-ADDON COMPATIBILITY FIX:
            // Use IMDb ID as primary when available (without prefix) for cross-addon watch state sync
            // This ensures Stremio treats content with same IMDb ID as identical across addons
            let primaryId;
            if (externalIds.imdb_id) {
                primaryId = externalIds.imdb_id;
                console.log(`🔄 Using IMDb ID ${primaryId} as primary for cross-addon compatibility`);
            } else {
                primaryId = `tvdb-${numericId}`;
                console.log(`🔄 No IMDb ID available, using TVDB format ${primaryId}`);
            }

            // Base meta object with cross-reference IDs
            const meta = {
                id: primaryId,
                type: stremioType,
                name: item.name || 'Unknown Title',
                
                // Always include tvdb_id as separate field for reference
                tvdb_id: numericId.toString()
            };
            
            // Add other external IDs (excluding imdb_id since it might be the primary ID)
            Object.entries(externalIds).forEach(([key, value]) => {
                if (key !== 'imdb_id' || primaryId !== value) {
                    meta[key] = value;
                }
            });

            // Get translations
            await this.applyTranslations(meta, stremioType, numericId, tvdbLanguage, item);

            // Apply artwork
            await this.applyArtwork(meta, stremioType, numericId, tvdbLanguage, item);

            // Add basic metadata
            await this.addBasicMetadata(meta, item, tvdbLanguage);

            // Add type-specific content
            if (stremioType === 'series') {
                await this.addSeriesContent(meta, numericId, seasonsData, tvdbLanguage, externalIds);
            } else {
                this.addMovieContent(meta, externalIds.imdb_id);
            }

            // Clean up empty arrays
            this.cleanupEmptyArrays(meta);

            // Add debug information
            meta._debug = {
                timestamp: new Date().toISOString(),
                language: tvdbLanguage,
                posterSource: meta.poster ? 'artwork-api' : 'fallback',
                generated: 'fresh'
            };

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
        const artwork = await this.artworkHandler.getArtwork(
            stremioType === 'movie' ? 'movies' : 'series', 
            numericId, 
            tvdbLanguage
        );
        
        // Apply high-res artwork if available
        if (artwork.poster) {
            meta.poster = artwork.poster;
        }
        
        if (artwork.background) {
            meta.background = artwork.background;
        }
        
        if (artwork.logo) {
            meta.logo = artwork.logo;
        }
        
        // Try English fallback for missing artwork if preferred language wasn't English
        if ((!artwork.poster || !artwork.background || !artwork.logo) && tvdbLanguage !== 'eng') {
            const englishArtwork = await this.artworkHandler.getArtwork(
                stremioType === 'movie' ? 'movies' : 'series', 
                numericId, 
                'eng'
            );
            
            if (!meta.poster && englishArtwork.poster) {
                meta.poster = englishArtwork.poster;
            }
            
            if (!meta.background && englishArtwork.background) {
                meta.background = englishArtwork.background;
            }
            
            if (!meta.logo && englishArtwork.logo) {
                meta.logo = englishArtwork.logo;
            }
        }
        
        // Apply final fallbacks if still no artwork
        if (!meta.poster || !meta.background || !meta.logo) {
            const { posterSources, backgroundSources, logoSources } = this.artworkHandler.getArtworkFallbacks(item, stremioType, tvdbLanguage);
            
            if (!meta.poster && posterSources.length > 0) {
                meta.poster = posterSources[0];
            }
            
            if (!meta.background && backgroundSources.length > 0) {
                meta.background = backgroundSources[0];
            }
            
            if (!meta.logo && logoSources.length > 0) {
                meta.logo = logoSources[0];
            }
        }
    }

    /**
     * Add basic metadata (year, genres, cast, etc.)
     */
    async addBasicMetadata(meta, item, tvdbLanguage = 'eng') {
        // Enhanced release info with theatrical status FIRST (before year processing)
        this.addTheatricalReleaseInfo(meta, item, tvdbLanguage);
        
        // Enhanced year with date range for series (but preserve theatrical year for movies)
        this.addEnhancedYear(meta, item);
        
        // Runtime information
        this.addEnhancedRuntime(meta, item);

        // Genres
        if (Array.isArray(item.genres)) {
            meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
        }

        // Cast - with genre-based filtering
        this.addCastWithGenreFiltering(meta, item);

        // IMDb Rating - Add enhanced rating from OMDB/imdbapi.dev
        this.addEnhancedRating(meta, item);

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
        // For movies, preserve theatrical status year if already set
        if (meta.type === 'movie' && meta.year) {
            console.log(`📅 Preserving theatrical year for movie: ${meta.year}`);
            return;
        }
        
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
        } else if (meta.type === 'movie' && !meta.year) {
            // For movies without theatrical year, use simple year
            meta.year = startYear;
        }
    }

    /**
     * Add theatrical release information for movies
     */
    addTheatricalReleaseInfo(meta, item, tvdbLanguage = 'eng') {
        // Only apply to movies
        if (meta.type !== 'movie') return;
        
        try {
            const releaseInfo = getEnhancedReleaseInfo(item, tvdbLanguage);
            
            // Set Stremio standard fields
            if (releaseInfo.year) {
                meta.year = releaseInfo.year;
            }
            
            if (releaseInfo.releaseInfo) {
                meta.releaseInfo = releaseInfo.releaseInfo;
            }
            
            if (releaseInfo.released) {
                meta.released = releaseInfo.released;
            }
            
            // Add theatrical status to description
            if (releaseInfo.statusMessage) {
                const currentDescription = meta.description || '';
                
                // Prepend theatrical status to description
                if (currentDescription) {
                    meta.description = `${releaseInfo.statusMessage}\n\n${currentDescription}`;
                } else {
                    meta.description = releaseInfo.statusMessage;
                }
                
                console.log(`🎬 Added theatrical status: ${releaseInfo.statusMessage}`);
            }
            
        } catch (error) {
            console.error('Error adding theatrical status:', error);
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
     * Add enhanced runtime information
     */
    addEnhancedRuntime(meta, item) {
        if (item.runtime) {
            meta.runtime = `${item.runtime} min`;
        } else if (item.averageRuntime) {
            meta.runtime = `${item.averageRuntime} min`;
        }
    }

    /**
     * Add enhanced IMDb rating from OMDB/imdbapi.dev
     */
    async addEnhancedRating(meta, item) {
        // Only add rating if we have the rating service and an IMDb ID
        if (!this.ratingService) {
            return;
        }

        // Extract IMDb ID from external IDs
        const externalIds = this.contentFetcher.extractExternalIds(item);
        const imdbId = externalIds.imdb_id;
        
        if (!imdbId) {
            console.log(`⭐ No IMDb ID available for rating lookup: ${meta.name}`);
            return;
        }

        try {
            // Get rating from service (this handles OMDB + fallback and caching)
            const ratingData = await this.ratingService.getImdbRating(imdbId, meta.type);
            
            if (ratingData && ratingData.imdb_rating) {
                meta.imdbRating = ratingData.imdb_rating;
                console.log(`⭐ Enhanced rating for ${meta.name}: ${ratingData.imdb_rating}/10`);
            } else {
                console.log(`⭐ No rating available for ${meta.name} (${imdbId})`);
            }
        } catch (error) {
            console.error(`⭐ Rating lookup failed for ${imdbId}:`, error.message);
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
    async addSeriesContent(meta, numericId, seasonsData, tvdbLanguage, externalIds) {
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

        // Filter and process episodes (includes aired + future episodes for Stremio's upcoming feature)
        const airedEpisodes = this.contentFetcher.filterAiredEpisodes(episodes);
        console.log(`📺 Filtered to ${airedEpisodes.length} episodes (aired + upcoming)`);

        const episodesBySeason = this.contentFetcher.groupEpisodesBySeason(airedEpisodes);
        const seasonsWithContent = validSeasons.filter(season => 
            episodesBySeason[season.number] && episodesBySeason[season.number].length > 0
        );

        meta.seasons = seasonsWithContent.length;
        console.log(`📺 Final seasons with content: ${meta.seasons}`);

        // Build video entries with cross-addon compatible IDs
        const videoMap = new Map();
        for (const episode of airedEpisodes) {
            // 🎯 CROSS-ADDON VIDEO ID SYNC:
            // Use IMDb format for video IDs when available (for cross-addon watch state sync)
            // This ensures episode watch status syncs with other addons using same IMDb ID
            const videoId = externalIds.imdb_id ? 
                `${externalIds.imdb_id}:${episode.seasonNumber}:${episode.number}` :
                `${numericId}:${episode.seasonNumber}:${episode.number}`;
            
            console.log(`📹 Episode ${episode.seasonNumber}x${episode.number} video ID: ${videoId}`);
            
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
        
        // Use the primary ID (which is now IMDb ID when available)
        meta.behaviorHints = {
            defaultVideoId: meta.id,
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
