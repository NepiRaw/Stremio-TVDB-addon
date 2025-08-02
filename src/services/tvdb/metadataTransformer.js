/**
 * TVDB Metadata Transformer
 * Transforms detailed content data to full Stremio metadata format
 */

const { validateImdbRequirement } = require('../../utils/imdbFilter');
const { getEnhancedReleaseInfo } = require('../../utils/theatricalStatus');

class MetadataTransformer {
    constructor(contentFetcher, translationService, artworkHandler, logger) {
        this.contentFetcher = contentFetcher;
        this.translationService = translationService;
        this.artworkHandler = artworkHandler;
        this.logger = logger;
    }

    async transformDetailedToStremioMeta(item, type, seasonsData = null, tvdbLanguage = 'eng') {
        try {
            const stremioType = type === 'movie' ? 'movie' : 'series';
            if (!validateImdbRequirement(item, stremioType)) {
                this.logger?.debug(`Skipping ${stremioType} transformation - IMDB ID required`);
                return null;
            }
            const numericId = this.extractNumericId(item.id);
            const externalIds = this.contentFetcher.extractExternalIds(item);
            let primaryId;
            if (externalIds.imdb_id) {
                primaryId = externalIds.imdb_id;
                this.logger?.debug(`Using IMDb ID as primary: ${primaryId} (TVDB: ${numericId})`);
            } else {
                primaryId = `tvdb-${numericId}`;
                this.logger?.debug(`Using TVDB ID as primary: ${primaryId} (no IMDb ID available)`);
            }
            const meta = {
                id: primaryId,
                type: stremioType,
                name: item.name || 'Unknown Title',
                tvdb_id: numericId,
                ...externalIds
            };
            await this.applyTranslations(meta, stremioType, numericId, tvdbLanguage, item);
            await this.applyArtwork(meta, stremioType, numericId, tvdbLanguage, item);
            this.addBasicMetadata(meta, item, tvdbLanguage);
            if (stremioType === 'series') {
                await this.addSeriesContent(meta, numericId, seasonsData, tvdbLanguage, externalIds);
            } else {
                this.addMovieContent(meta, externalIds.imdb_id);
            }
            this.cleanupEmptyArrays(meta);
            if (process.env.NODE_ENV === 'development') {
                meta._debug = {
                    timestamp: new Date().toISOString(),
                    language: tvdbLanguage,
                    posterSource: meta.poster ? 'artwork-api' : 'fallback',
                    generated: 'fresh'
                };
            }
            return meta;
        } catch (error) {
            if (this.logger?.error) {
                this.logger.error('Error transforming detailed metadata:', error);
            } else {
                console.error('Error transforming detailed metadata:', error);
            }
            return null;
        }
    }

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

    async applyArtwork(meta, stremioType, numericId, tvdbLanguage, item) {
        const artwork = await this.artworkHandler.getArtwork(
            stremioType === 'movie' ? 'movies' : 'series', 
            numericId, 
            tvdbLanguage
        );
        
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

    addBasicMetadata(meta, item, tvdbLanguage = 'eng') {
        this.addTheatricalReleaseInfo(meta, item, tvdbLanguage);
        
        this.addEnhancedYear(meta, item);
        
        this.addEnhancedRuntime(meta, item);

        if (Array.isArray(item.genres)) {
            meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
        }

        this.addCastWithGenreFiltering(meta, item);

        if (item.originalCountry) {
            meta.country = [item.originalCountry];
        } else if (item.country) {
            meta.country = [item.country];
        }

        if (item.originalLanguage) {
            meta.language = item.originalLanguage;
        }

        if (item.originalNetwork?.name) {
            meta.network = item.originalNetwork.name;
        } else if (item.latestNetwork?.name) {
            meta.network = item.latestNetwork.name;
        }
    }

    addEnhancedYear(meta, item) {
        if (meta.type === 'movie' && meta.year) {
            console.log(`📅 Preserving theatrical year for movie: ${meta.year}`);
            return;
        }
        
        const startYear = item.firstAired ? new Date(item.firstAired).getFullYear() : 
                         item.year ? parseInt(item.year) : null;
        
        if (meta.type === 'series' && startYear) {
            const lastAiredDate = item.lastAired ? new Date(item.lastAired) : null;
            const endYear = lastAiredDate ? lastAiredDate.getFullYear() : null;
            
            const status = this.extractValidStatus(item.status);
            
            if (status === 'ended' && endYear && endYear !== startYear) {
                meta.year = `${startYear}-${endYear}`;
                console.log(`📅 Series date range: ${meta.year}`);
            } else if (status === 'ended') {
                meta.year = startYear;
                console.log(`📅 Series year: ${meta.year}`);
            } else if (status === 'continuing') {
                meta.year = `${startYear}-`;
                console.log(`📅 Ongoing series: ${meta.year}`);
            } else {
                if (endYear && endYear !== startYear) {
                    meta.year = `${startYear}-${endYear}`;
                } else {
                    meta.year = startYear;
                }
                console.log(`📅 Series year (unknown status): ${meta.year}`);
            }
        } else if (meta.type === 'movie' && !meta.year) {
            meta.year = startYear;
        }
    }

    addTheatricalReleaseInfo(meta, item, tvdbLanguage = 'eng') {
        if (meta.type !== 'movie') return;
        
        try {
            const releaseInfo = getEnhancedReleaseInfo(item, tvdbLanguage);
            
            if (releaseInfo.year) {
                meta.year = releaseInfo.year;
            }
            
            if (releaseInfo.releaseInfo) {
                meta.releaseInfo = releaseInfo.releaseInfo;
            }
            
            if (releaseInfo.released) {
                meta.released = releaseInfo.released;
            }
            
            if (releaseInfo.statusMessage) {
                const currentDescription = meta.description || '';
                
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

    extractValidStatus(statusData) {
        if (!statusData) return null;
        
        let statusName = null;
        
        if (typeof statusData === 'object' && statusData.name) {
            statusName = statusData.name;
        } else if (typeof statusData === 'string') {
            statusName = statusData;
        } else {
            return null;
        }
        
        const normalizedStatus = statusName.toLowerCase().trim();
        const validStatuses = ['ended', 'continuing'];
        
        return validStatuses.includes(normalizedStatus) ? normalizedStatus : null;
    }

    addEnhancedRuntime(meta, item) {
        if (item.runtime) {
            meta.runtime = `${item.runtime} min`;
        } else if (item.averageRuntime) {
            meta.runtime = `${item.averageRuntime} min`;
        }
    }

    addCastWithGenreFiltering(meta, item) {
        if (!Array.isArray(item.characters) || item.characters.length === 0) {
            return;
        }

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

        // Take top 5 most important actors - Can be adjusted
        const topActors = validActors
            .slice(0, 5)
            .map(c => c.people?.name || c.personName);

        if (topActors.length > 0) {
            meta.cast = topActors;
            console.log(`🎭 Added ${topActors.length} cast members (sorted by importance): ${topActors.join(', ')}`);
        }
    }

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
        const episodes = await this.contentFetcher.getSeriesEpisodes(numericId);
        if (episodes.length === 0) {
            meta.behaviorHints = { defaultVideoId: null, hasScheduledVideos: false };
            return;
        }

        console.log(`📺 Got ${episodes.length} episodes from API`);

        const translations = await this.translationService.getBulkEpisodeTranslations(numericId, tvdbLanguage);
        const { primaryLookup, fallbackLookup } = this.translationService.createTranslationLookups(
            translations.primary, translations.fallback
        );

        const airedEpisodes = this.contentFetcher.filterAiredEpisodes(episodes);
        console.log(`📺 Filtered to ${airedEpisodes.length} episodes (aired + upcoming)`);

        const episodesBySeason = this.contentFetcher.groupEpisodesBySeason(airedEpisodes);
        const seasonsWithContent = validSeasons.filter(season => 
            episodesBySeason[season.number] && episodesBySeason[season.number].length > 0
        );

        meta.seasons = seasonsWithContent.length;
        console.log(`📺 Final seasons with content: ${meta.seasons}`);

        const videoMap = new Map();
        for (const episode of airedEpisodes) {
            const videoId = externalIds.imdb_id ? 
                `${externalIds.imdb_id}:${episode.seasonNumber}:${episode.number}` :
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

    getEpisodeThumbnail(episode, meta) {
        const sources = [
            episode.image, episode.thumbnail, episode.filename,
            meta.poster, meta.background
        ].filter(Boolean);
        
        return sources.length > 0 ? sources[0] : null;
    }

    extractNumericId(id) {
        if (typeof id === 'string') {
            const match = id.match(/(\d+)$/);
            return match ? match[1] : id;
        }
        return id;
    }

    cleanupEmptyArrays(meta) {
        Object.keys(meta).forEach(key => {
            if (Array.isArray(meta[key]) && meta[key].length === 0) {
                delete meta[key];
            }
        });
    }
}

module.exports = MetadataTransformer;
