/**
 * TVDB Updates Service
 * Handles intelligent cache invalidation using TVDB /updates endpoint
 */

const cacheService = require('../cacheService');
const logger = require('../../utils/logger');

class UpdatesService {
    constructor(tvdbApiClient) {
        this.apiClient = tvdbApiClient;
        this.lastUpdateTimestamp = Date.now();
        this.updateInterval = cacheService.UPDATES_CHECK_INTERVAL || 12 * 60 * 60 * 1000; // 12 hours default
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Start the automatic updates checking
     */
    start() {
        if (this.isRunning) {
            console.log('🔄 Updates service already running');
            return;
        }

        this.isRunning = true;
        
        // Initial check after 1 minute (let the server start properly)
        setTimeout(() => this.checkForUpdates(), 60 * 1000);
        
        // Regular interval checks
        this.intervalId = setInterval(() => this.checkForUpdates(), this.updateInterval);
        
        console.log(`🔄 TVDB Updates service started (checking every ${Math.round(this.updateInterval / 3600000)}h)`);
    }

    /**
     * Stop the automatic updates checking
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('🛑 TVDB Updates service stopped');
    }

    /**
     * Check for updates from TVDB and invalidate affected cache entries
     */
    async checkForUpdates() {
        try {
            console.log('🔍 Checking TVDB for updates...');
            const startTime = Date.now();
            
            // Calculate since timestamp (24 hours ago to ensure we don't miss anything)
            const sinceTimestamp = Math.floor((this.lastUpdateTimestamp - (24 * 60 * 60 * 1000)) / 1000);
            
            // Make API call to get updates
            const response = await this.apiClient.makeRequest(`/updates?since=${sinceTimestamp}`);
            
            if (!response.data || !Array.isArray(response.data)) {
                console.log('📭 No updates found or invalid response format');
                return;
            }

            const updates = response.data;
            const checkTime = Date.now() - startTime;
            
            console.log(`📦 Found ${updates.length} updates from TVDB (${checkTime}ms)`);
            
            if (updates.length === 0) {
                console.log('✅ No cache invalidation needed');
                this.lastUpdateTimestamp = Date.now();
                return;
            }

            // Process updates and invalidate cache
            const invalidationStats = await this.processUpdates(updates);
            
            // Update timestamp
            this.lastUpdateTimestamp = Date.now();
            
            console.log(`🧹 Cache invalidation completed:`, invalidationStats);
            
        } catch (error) {
            console.error('❌ Updates check failed:', error.message);
            
            // Don't update timestamp on error to retry the same period
            if (error.response?.status === 401) {
                console.log('🔑 Authentication may need refresh');
            }
        }
    }

    /**
     * Process individual updates and invalidate related cache entries
     */
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

        // Debug: Log a few sample updates to understand the structure
        if (updates.length > 0) {
            console.log('📊 Sample updates structure:', JSON.stringify(updates.slice(0, 3), null, 2));
        }

        for (const update of updates) {
            try {
                const invalidatedCount = await this.invalidateCacheForUpdate(update);
                stats.cacheEntriesInvalidated += invalidatedCount;
                
                // Track update types (handle various possible field names)
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
                            console.log(`🔍 Unknown update structure:`, JSON.stringify(update, null, 2));
                        }
                        break;
                }
                
            } catch (error) {
                console.error(`❌ Failed to process update:`, JSON.stringify(update, null, 2), error.message);
            }
        }

        return stats;
    }

    /**
     * Invalidate cache entries for a specific update
     */
    async invalidateCacheForUpdate(update) {
        // Handle different possible field names in TVDB updates
        const recordType = update.recordType || update.type || update.entityType;
        const recordId = update.recordId || update.id || update.entityId;
        
        if (!recordId) {
            console.log(`⚠️ Update missing ID:`, JSON.stringify(update, null, 2));
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
                    // For unknown types or when recordType is missing,
                    // we can attempt to invalidate based on ID patterns or skip
                    if (!recordType && recordId) {
                        // Conservative approach: clear search cache when we don't know what changed
                        invalidatedCount += this.clearCacheByPattern(cacheService.searchCache, 'search:');
                        console.log(`🧹 Cleared search cache due to unknown update type for ID: ${recordId}`);
                    }
            }
            
        } catch (error) {
            console.error(`❌ Cache invalidation failed for ${recordType}:${recordId}:`, error.message);
        }

        return invalidatedCount;
    }

    /**
     * Invalidate all cache entries related to a series
     */
    invalidateSeriesCache(seriesId) {
        let count = 0;
        
        // Clear metadata cache
        count += this.clearCacheByPattern(cacheService.metadataCache, `metadata:series:${seriesId}`);
        
        // Clear IMDB cache
        count += this.clearCacheByPattern(cacheService.imdbCache, `imdb:series:${seriesId}`);
        
        // Clear artwork cache
        count += this.clearCacheByPattern(cacheService.artworkCache, `artwork:series:${seriesId}`);
        
        // Clear translation cache
        count += this.clearCacheByPattern(cacheService.translationCache, `translation:series:${seriesId}`);
        
        // Clear season cache
        count += this.clearCacheByPattern(cacheService.seasonCache, `season:${seriesId}`);
        count += this.clearCacheByPattern(cacheService.seasonCache, `seasons:${seriesId}`);
        
        console.log(`🧹 Invalidated ${count} cache entries for series ${seriesId}`);
        return count;
    }

    /**
     * Invalidate all cache entries related to a movie
     */
    invalidateMovieCache(movieId) {
        let count = 0;
        
        // Clear metadata cache
        count += this.clearCacheByPattern(cacheService.metadataCache, `metadata:movie:${movieId}`);
        
        // Clear IMDB cache
        count += this.clearCacheByPattern(cacheService.imdbCache, `imdb:movie:${movieId}`);
        
        // Clear artwork cache
        count += this.clearCacheByPattern(cacheService.artworkCache, `artwork:movie:${movieId}`);
        
        // Clear translation cache
        count += this.clearCacheByPattern(cacheService.translationCache, `translation:movie:${movieId}`);
        
        console.log(`🧹 Invalidated ${count} cache entries for movie ${movieId}`);
        return count;
    }

    /**
     * Invalidate cache entries related to an episode
     */
    invalidateEpisodeCache(episodeId, seriesId) {
        let count = 0;
        
        if (seriesId) {
            // Episode changes may affect season data
            count += this.clearCacheByPattern(cacheService.seasonCache, `season:${seriesId}`);
            count += this.clearCacheByPattern(cacheService.seasonCache, `seasons:${seriesId}`);
        }
        
        console.log(`🧹 Invalidated ${count} cache entries for episode ${episodeId}`);
        return count;
    }

    /**
     * Invalidate cache entries related to a season
     */
    invalidateSeasonCache(seasonId, seriesId) {
        let count = 0;
        
        if (seriesId) {
            // Clear season-specific cache
            count += this.clearCacheByPattern(cacheService.seasonCache, `season:${seriesId}`);
            count += this.clearCacheByPattern(cacheService.seasonCache, `seasons:${seriesId}`);
        }
        
        console.log(`🧹 Invalidated ${count} cache entries for season ${seasonId}`);
        return count;
    }

    /**
     * Invalidate cache entries related to artwork
     */
    invalidateArtworkCache(artworkId, contentType) {
        let count = 0;
        
        // Since we don't know which content this artwork belongs to,
        // we'll need to clear all artwork cache (this is rare)
        if (contentType) {
            count += this.clearCacheByPattern(cacheService.artworkCache, `artwork:${contentType}:`);
        } else {
            // Clear all artwork cache as fallback
            count += this.clearCacheByPattern(cacheService.artworkCache, 'artwork:');
        }
        
        console.log(`🧹 Invalidated ${count} cache entries for artwork ${artworkId}`);
        return count;
    }

    /**
     * Invalidate cache entries related to translations
     */
    invalidateTranslationCache(translationId, contentType) {
        let count = 0;
        
        if (contentType) {
            count += this.clearCacheByPattern(cacheService.translationCache, `translation:${contentType}:`);
        } else {
            // Clear all translation cache as fallback
            count += this.clearCacheByPattern(cacheService.translationCache, 'translation:');
        }
        
        console.log(`🧹 Invalidated ${count} cache entries for translation ${translationId}`);
        return count;
    }

    /**
     * Clear cache entries matching a pattern
     */
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

    /**
     * Manual trigger for updates check (useful for testing)
     */
    async triggerManualCheck() {
        console.log('🔄 Manual updates check triggered');
        await this.checkForUpdates();
    }

    /**
     * Get current service status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastUpdateTimestamp: this.lastUpdateTimestamp,
            updateInterval: this.updateInterval,
            nextCheckIn: this.isRunning ? 
                Math.max(0, this.updateInterval - (Date.now() - this.lastUpdateTimestamp)) : null
        };
    }

    /**
     * Update the check interval (useful for runtime configuration)
     */
    setUpdateInterval(intervalMs) {
        this.updateInterval = intervalMs;
        
        if (this.isRunning) {
            // Restart with new interval
            this.stop();
            this.start();
        }
        
        console.log(`⚙️ Updates check interval updated to ${Math.round(intervalMs / 3600000)}h`);
    }
}

module.exports = UpdatesService;
