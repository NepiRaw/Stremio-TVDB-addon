/**
 * TVDB Metadata Transformer
 * Transforms detailed content data to full Stremio metadata format
 */

const { validateImdbRequirement } = require('../../utils/imdbFilter');
const { getEnhancedReleaseInfo } = require('../../utils/theatricalStatus');
const { CAST_LIMIT, selectPeople } = require('../../utils/people');

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
                this.logger?.debug(`imdb ${primaryId} as primary id`);
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

            if (stremioType === 'series') {
                if (item.firstAired) {
                    meta.released = new Date(item.firstAired).toISOString();
                }
                let startYear = item.firstAired ? new Date(item.firstAired).getFullYear() : null;
                let endYear = item.lastAired ? new Date(item.lastAired).getFullYear() : null;
                let status = this.extractValidStatus(item.status);
                let yearStr = '';
                if (startYear) {
                    if (status === 'ended' && endYear && endYear !== startYear) {
                        yearStr = `${startYear}-${endYear}`;
                    } else if (status === 'ended') {
                        yearStr = `${startYear}`;
                    } else if (status === 'continuing') {
                        yearStr = `${startYear}-`;
                    } else if (endYear && endYear !== startYear) {
                        yearStr = `${startYear}-${endYear}`;
                    } else {
                        yearStr = `${startYear}`;
                    }
                }
                if (yearStr) {
                    meta.year = yearStr;
                    meta.releaseInfo = yearStr;
                }
            }
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
        if (stremioType !== 'movie') {
            const { primary, english } = await this.artworkHandler.getArtworkPair(
                'series',
                numericId,
                tvdbLanguage
            );

            meta.poster = primary.poster || english.poster || meta.poster;
            meta.background = primary.background || english.background || meta.background;
            meta.logo = primary.logo || english.logo || meta.logo;
        }

        if (!meta.poster || !meta.background || !meta.logo) {
            const { posterSources, backgroundSources, logoSources } = this.artworkHandler.getArtworkFallbacks(item, stremioType, tvdbLanguage);

            if (!meta.poster && posterSources.length > 0) meta.poster = posterSources[0];
            if (!meta.background && backgroundSources.length > 0) meta.background = backgroundSources[0];
            if (!meta.logo && logoSources.length > 0) meta.logo = logoSources[0];
        }
    }

    addBasicMetadata(meta, item, tvdbLanguage = 'eng') {
        this.addTheatricalReleaseInfo(meta, item, tvdbLanguage);
        
        this.addEnhancedYear(meta, item);
        
        this.addEnhancedRuntime(meta, item);

        if (Array.isArray(item.genres)) {
            meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
        }

        this.addCast(meta, item);

        const country = item.originalCountry || item.country;
        if (country) {
            meta.country = Array.isArray(country) ? country.filter(Boolean).join(', ') : String(country);
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
            this.logger?.debug?.(`Preserving theatrical year for movie: ${meta.year}`);
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
                this.logger?.debug?.(`Series date range: ${meta.year}`);
            } else if (status === 'ended') {
                meta.year = startYear;
                this.logger?.debug?.(`Series year: ${meta.year}`);
            } else if (status === 'continuing') {
                meta.year = `${startYear}-`;
                this.logger?.debug?.(`Ongoing series: ${meta.year}`);
            } else {
                if (endYear && endYear !== startYear) {
                    meta.year = `${startYear}-${endYear}`;
                } else {
                    meta.year = startYear;
                }
                this.logger?.debug?.(`Series year (unknown status): ${meta.year}`);
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
                this.logger?.debug?.(`Added theatrical status: ${releaseInfo.statusMessage}`);
            }
        } catch (error) {
            this.logger?.error?.('Error adding theatrical status:', error);
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

    addCast(meta, item) {
        const cast = selectPeople(item.characters, 'actor', CAST_LIMIT);

        if (cast.length > 0) {
            meta.cast = cast;
            this.logger?.debug?.(`Added ${cast.length} cast members (sorted by importance): ${cast.join(', ')}`);
        }
    }

    async addSeriesContent(meta, numericId, seasonsData, tvdbLanguage, externalIds) {
        meta.videos = [];
        meta.seasons = 0;
        
        if (!Array.isArray(seasonsData) || seasonsData.length === 0) {
            meta.behaviorHints = { defaultVideoId: null, hasScheduledVideos: false };
            return;
        }

        const validSeasons = this.contentFetcher.filterValidSeasons(seasonsData);
        this.logger?.debug?.(`Filtered to ${validSeasons.length} official seasons`);

        if (validSeasons.length === 0) {
            meta.behaviorHints = { defaultVideoId: null, hasScheduledVideos: false };
            return;
        }
        // Independent of each other, so the episode list and its translations are fetched together
        const [episodes, translations] = await Promise.all([
            this.contentFetcher.getSeriesEpisodes(numericId),
            this.translationService.getBulkEpisodeTranslations(numericId, tvdbLanguage)
        ]);

        if (episodes.length === 0) {
            meta.behaviorHints = { defaultVideoId: null, hasScheduledVideos: false };
            return;
        }

        const { primaryLookup, fallbackLookup } = this.translationService.createTranslationLookups(
            translations.primary, translations.fallback
        );

        const airedEpisodes = this.contentFetcher.filterAiredEpisodes(episodes);

        const episodesBySeason = this.contentFetcher.groupEpisodesBySeason(airedEpisodes);
        const seasonsWithContent = validSeasons.filter(season => 
            episodesBySeason[season.number] && episodesBySeason[season.number].length > 0
        );
        meta.seasons = seasonsWithContent.length;

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
        this.logger?.debug?.(`episodes ${episodes.length} → ${airedEpisodes.length} aired · ${meta.seasons} seasons · ${meta.videos.length} videos`);

        meta.behaviorHints = {
            defaultVideoId: null,
            hasScheduledVideos: true
        };
    }

    addMovieContent(meta, imdbId) {
        
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
