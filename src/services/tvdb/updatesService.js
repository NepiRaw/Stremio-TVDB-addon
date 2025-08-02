/**
 * TVDB Updates Service
 * Handles intelligent cache invalidation using TVDB /updates endpoint
 */

class UpdatesService {
    constructor(tvdbApiClient, cacheService, logger) {
        this.apiClient = tvdbApiClient;
        this.cacheService = cacheService;
        this.logger = logger || {
            info: console.log,
            error: console.error,
            warn: console.warn,
            debug: console.log
        };
        this.lastUpdateTimestamp = Date.now();
        this.updateInterval = this.cacheService.UPDATES_CHECK_INTERVAL || 12 * 60 * 60 * 1000; // 12 hours default
        this.isRunning = false;
        this.intervalId = null;
    }

    start() {
        if (this.isRunning) {
            this.logger.info('🔄 Updates service already running');
            return;
        }

        this.isRunning = true;
        
        setTimeout(() => this.checkForUpdates(), 60 * 1000);
        
        this.intervalId = setInterval(() => this.checkForUpdates(), this.updateInterval);
        
        this.logger.info(`🔄 TVDB Updates service started (checking every ${Math.round(this.updateInterval / 3600000)}h)`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        this.logger.info('🛑 TVDB Updates service stopped');
    }

    async checkForUpdates() {
        try {
            this.logger.info('🔍 Checking TVDB for updates...');
            const startTime = Date.now();
            
            const sinceTimestamp = Math.floor((this.lastUpdateTimestamp - (24 * 60 * 60 * 1000)) / 1000);
            
            const response = await this.apiClient.makeRequest(`/updates?since=${sinceTimestamp}`);
            
            if (!response.data || !Array.isArray(response.data)) {
                this.logger.info('📭 No updates found or invalid response format');
                return;
            }

            const updates = response.data;
            const checkTime = Date.now() - startTime;
            
            this.logger.info(`📦 Found ${updates.length} updates from TVDB (${checkTime}ms)`);
            
            if (updates.length === 0) {
                this.logger.info('✅ No cache invalidation needed');
                this.lastUpdateTimestamp = Date.now();
                return;
            }

            const invalidationStats = await this.processUpdates(updates);
            
            this.lastUpdateTimestamp = Date.now();
            
            this.logger.info(`🧹 Cache invalidation completed:`, invalidationStats);
            
        } catch (error) {
            this.logger.error('❌ Updates check failed:', error.message);
            
            if (error.response?.status === 401) {
                this.logger.info('🔑 Authentication may need refresh');
            }
        }
    }

    async processUpdates(updates) {
        const stats = {
            totalUpdates: updates.length,
            seriesUpdated: 0,
            moviesUpdated: 0,
            episodesUpdated: 0,
            seasonsUpdated: 0,
            artworkUpdated: 0,
            translationUpdated: 0,
            peopleUpdated: 0,
            unknownUpdated: 0,
            cacheEntriesInvalidated: 0
        };

        if (updates.length > 0) {
            this.logger.debug('📊 Sample updates structure:', JSON.stringify(updates.slice(0, 3), null, 2));
        }

        for (const update of updates) {
            try {
                const invalidatedCount = await this.invalidateCacheForUpdate(update);
                stats.cacheEntriesInvalidated += invalidatedCount;
                
                const recordType = update.recordType || update.type || update.entityType || 'unknown';
                
                switch (recordType.toLowerCase()) {
                    case 'series':
                    case 'show':
                        stats.seriesUpdated++;
                        break;
                    case 'movie':
                    case 'film':
                        stats.moviesUpdated++;
                        break;
                    case 'episode':
                        stats.episodesUpdated++;
                        break;
                    case 'season':
                        stats.seasonsUpdated++;
                        break;
                    case 'artwork':
                    case 'image':
                        stats.artworkUpdated++;
                        break;
                    case 'translation':
                        stats.translationUpdated++;
                        break;
                    case 'people':
                    case 'person':
                        stats.peopleUpdated++;
                        break;
                    default:
                        stats.unknownUpdated++;
                        if (stats.unknownUpdated <= 5) { // Only log first 5 unknown types
                            this.logger.debug(`🔍 Unknown update structure:`, JSON.stringify(update, null, 2));
                        }
                        break;
                }
                
            } catch (error) {
                this.logger.error(`❌ Failed to process update:`, JSON.stringify(update, null, 2), error.message);
            }
        }

        return stats;
    }

    async invalidateCacheForUpdate(update) {
        const recordType = update.recordType || update.type || update.entityType;
        const recordId = update.recordId || update.id || update.entityId;
        
        if (!recordId) {
            this.logger.warn(`⚠️ Update missing ID:`, JSON.stringify(update, null, 2));
            return 0;
        }
        
        let invalidatedCount = 0;

        try {
            switch (recordType?.toLowerCase()) {
                case 'series':
                case 'show':
                    invalidatedCount += this.invalidateSeriesCache(recordId);
                    break;
                    
                case 'movie':
                case 'film':
                    invalidatedCount += this.invalidateMovieCache(recordId);
                    break;
                    
                case 'episode':
                    invalidatedCount += this.invalidateEpisodeCache(recordId, update.seriesId);
                    break;
                    
                case 'season':
                    invalidatedCount += this.invalidateSeasonCache(recordId, update.seriesId);
                    break;
                    
                case 'artwork':
                case 'image':
                    invalidatedCount += this.invalidateArtworkCache(recordId, update.contentType);
                    break;
                    
                case 'translation':
                    invalidatedCount += this.invalidateTranslationCache(recordId, update.contentType);
                    break;
                    
                default:
                    if (!recordType && recordId) {
                        invalidatedCount += this.clearCacheByPattern(this.cacheService.searchCache, 'search:');
                        this.logger.info(`🧹 Cleared search cache due to unknown update type for ID: ${recordId}`);
                    }
            }
            
        } catch (error) {
            this.logger.error(`❌ Cache invalidation failed for ${recordType}:${recordId}:`, error.message);
        }

        return invalidatedCount;
    }

    invalidateSeriesCache(seriesId) {
        let count = 0;
        
        // Clear metadata cache
        count += this.clearCacheByPattern(this.cacheService.metadataCache, `metadata:series:${seriesId}`);
        
        // Clear IMDB cache
        count += this.clearCacheByPattern(this.cacheService.imdbCache, `imdb:series:${seriesId}`);
        
        // Clear artwork cache
        count += this.clearCacheByPattern(this.cacheService.artworkCache, `artwork:series:${seriesId}`);
        
        // Clear translation cache
        count += this.clearCacheByPattern(this.cacheService.translationCache, `translation:series:${seriesId}`);
        
        // Clear season cache
        count += this.clearCacheByPattern(this.cacheService.seasonCache, `season:${seriesId}`);
        count += this.clearCacheByPattern(this.cacheService.seasonCache, `seasons:${seriesId}`);
        
        this.logger.debug(`🧹 Invalidated ${count} cache entries for series ${seriesId}`);
        return count;
    }

    invalidateMovieCache(movieId) {
        let count = 0;
        
        // Clear metadata cache
        count += this.clearCacheByPattern(this.cacheService.metadataCache, `metadata:movie:${movieId}`);
        
        // Clear IMDB cache
        count += this.clearCacheByPattern(this.cacheService.imdbCache, `imdb:movie:${movieId}`);
        
        // Clear artwork cache
        count += this.clearCacheByPattern(this.cacheService.artworkCache, `artwork:movie:${movieId}`);
        
        // Clear translation cache
        count += this.clearCacheByPattern(this.cacheService.translationCache, `translation:movie:${movieId}`);
        
        this.logger.debug(`🧹 Invalidated ${count} cache entries for movie ${movieId}`);
        return count;
    }

    invalidateEpisodeCache(episodeId, seriesId) {
        let count = 0;
        
        if (seriesId) {
            count += this.clearCacheByPattern(this.cacheService.seasonCache, `season:${seriesId}`);
            count += this.clearCacheByPattern(this.cacheService.seasonCache, `seasons:${seriesId}`);
        }
        
        this.logger.debug(`🧹 Invalidated ${count} cache entries for episode ${episodeId}`);
        return count;
    }
    
    invalidateSeasonCache(seasonId, seriesId) {
        let count = 0;
        
        if (seriesId) {
            count += this.clearCacheByPattern(this.cacheService.seasonCache, `season:${seriesId}`);
            count += this.clearCacheByPattern(this.cacheService.seasonCache, `seasons:${seriesId}`);
        }
        
        this.logger.debug(`🧹 Invalidated ${count} cache entries for season ${seasonId}`);
        return count;
    }

    invalidateArtworkCache(artworkId, contentType) {
        let count = 0;
        
        if (contentType) {
            count += this.clearCacheByPattern(this.cacheService.artworkCache, `artwork:${contentType}:`);
        } else {
            count += this.clearCacheByPattern(this.cacheService.artworkCache, 'artwork:');
        }
        
        this.logger.debug(`🧹 Invalidated ${count} cache entries for artwork ${artworkId}`);
        return count;
    }

    invalidateTranslationCache(translationId, contentType) {
        let count = 0;
        
        if (contentType) {
            count += this.clearCacheByPattern(this.cacheService.translationCache, `translation:${contentType}:`);
        } else {
            count += this.clearCacheByPattern(this.cacheService.translationCache, 'translation:');
        }
        
        this.logger.debug(`🧹 Invalidated ${count} cache entries for translation ${translationId}`);
        return count;
    }

    clearCacheByPattern(cacheMap, pattern) {
        let count = 0;
        const keysToDelete = [];
        
        for (const key of cacheMap.keys()) {
            if (key.startsWith(pattern)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => {
            cacheMap.delete(key);
            count++;
        });
        
        return count;
    }

    async triggerManualCheck() {
        this.logger.info('🔄 Manual updates check triggered');
        await this.checkForUpdates();
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastUpdateTimestamp: this.lastUpdateTimestamp,
            updateInterval: this.updateInterval,
            nextCheckIn: this.isRunning ? 
                Math.max(0, this.updateInterval - (Date.now() - this.lastUpdateTimestamp)) : null
        };
    }

    setUpdateInterval(intervalMs) {
        this.updateInterval = intervalMs;
        
        if (this.isRunning) {
            this.stop();
            this.start();
        }
        
        this.logger.info(`⚙️ Updates check interval updated to ${Math.round(intervalMs / 3600000)}h`);
    }
}

module.exports = UpdatesService;
