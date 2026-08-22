/**
 * TVDB Updates Service
 * Handles intelligent cache invalidation using TVDB /updates endpoint
 */

const { context } = require('../../utils/logger');

// TVDB sends plural entity names and separate translated* variants; recordType is always empty.
const ENTITY_TYPES = {
    series: 'series', show: 'series', translatedseries: 'series',
    movie: 'movie', movies: 'movie', film: 'movie', translatedmovies: 'movie',
    episode: 'episode', episodes: 'episode', translatedepisodes: 'episode',
    season: 'season', seasons: 'season', translatedseasons: 'season',
    artwork: 'artwork', image: 'artwork', artworktypes: 'artwork',
    translation: 'translation',
    people: 'people', person: 'people', characters: 'people'
};

function canonicalType(update) {
    const raw = update.recordType || update.type || update.entityType || '';
    return ENTITY_TYPES[String(raw).toLowerCase()] || null;
}

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
        
        this.logger.debug(`updates service started, every ${Math.round(this.updateInterval / 3600000)}h`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        this.logger.info('🛑 TVDB Updates service stopped');
    }

    checkForUpdates() {
        return context.runInJob('updates', () => this.runUpdateCycle());
    }

    async runUpdateCycle() {
        const startTime = Date.now();
        try {
            this.logger.debug('🔍 checking TVDB for updates');

            const sinceTimestamp = Math.floor((this.lastUpdateTimestamp - (24 * 60 * 60 * 1000)) / 1000);
            const response = await this.apiClient.makeRequest(`/updates?since=${sinceTimestamp}`);

            if (!response.data || !Array.isArray(response.data)) {
                this.logger.warn('updates check → no usable response');
                return;
            }

            const updates = response.data;
            this.lastUpdateTimestamp = Date.now();

            if (updates.length === 0) {
                this.logger.event({
                    level: 'info', marker: 'empty', ms: Date.now() - startTime,
                    message: 'updates checked → nothing to invalidate'
                });
                return;
            }

            const stats = await this.processUpdates(updates);

            this.logger.event({
                level: 'info', marker: 'ok', ms: Date.now() - startTime,
                message: `cache invalidated → ${updates.length} fetched · ${stats.cacheEntriesInvalidated} invalidated · ${stats.unresolved} unresolved`
            });
        } catch (error) {
            this.logger.error(`updates check failed → ${error.message}`);

            if (error.response?.status === 401) {
                this.logger.warn('authentication may need refresh');
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
            unresolved: 0,
            cacheEntriesInvalidated: 0
        };

        const COUNTER = {
            series: 'seriesUpdated', movie: 'moviesUpdated', episode: 'episodesUpdated',
            season: 'seasonsUpdated', artwork: 'artworkUpdated',
            translation: 'translationUpdated', people: 'peopleUpdated'
        };

        const prefixes = { metadata: new Set(), imdb: new Set(), artwork: new Set(), translation: new Set(), season: new Set() };
        const unhandled = new Set();

        for (const update of updates) {
            const type = canonicalType(update);
            if (!type) {
                stats.unknownUpdated++;
                unhandled.add(String(update.recordType || update.type || update.entityType || 'unknown'));
                continue;
            }

            stats[COUNTER[type]]++;

            const recordId = update.recordId || update.id || update.entityId;
            if (!recordId) {
                stats.unresolved++;
                continue;
            }

            // Only series and movie records identify the entity a cache key is built from.
            // Episode records carry seriesId when TVDB knows it
            if (type === 'series') {
                this.collectSeriesPrefixes(prefixes, recordId);
            } else if (type === 'movie') {
                this.collectMoviePrefixes(prefixes, recordId);
            } else if (type === 'episode' && update.seriesId) {
                this.collectSeriesPrefixes(prefixes, update.seriesId);
            } else {
                stats.unresolved++;
            }
        }

        stats.cacheEntriesInvalidated = await this.applyInvalidation(prefixes);

        if (unhandled.size > 0) {
            this.logger.warn(`${stats.unknownUpdated} updates had no matching entity type: ${[...unhandled].join(', ')}`);
        }

        return stats;
    }

    collectSeriesPrefixes(prefixes, seriesId) {
        prefixes.metadata.add(`metadata:series:${seriesId}`);
        prefixes.metadata.add(`meta:enhanced:${seriesId}:series:`);
        prefixes.imdb.add(`imdb:series:${seriesId}`);
        prefixes.artwork.add(`artwork:series:${seriesId}`);
        prefixes.translation.add(`translation:series:${seriesId}`);
        prefixes.season.add(`season:${seriesId}`);
        prefixes.season.add(`seasons:${seriesId}`);
    }

    collectMoviePrefixes(prefixes, movieId) {
        prefixes.metadata.add(`metadata:movie:${movieId}`);
        prefixes.metadata.add(`meta:enhanced:${movieId}:movie:`);
        prefixes.imdb.add(`imdb:movie:${movieId}`);
        prefixes.artwork.add(`artwork:movies:${movieId}`);
        prefixes.translation.add(`translation:movies:${movieId}`);
    }

    async applyInvalidation(prefixes) {
        const byType = {};
        for (const [cacheType, set] of Object.entries(prefixes)) {
            if (set.size > 0) byType[cacheType] = [...set];
        }
        if (Object.keys(byType).length === 0) return 0;

        if (typeof this.cacheService.invalidateByPrefixes !== 'function') {
            this.logger.warn('Cache service cannot invalidate by prefix, skipping');
            return 0;
        }
        return await this.cacheService.invalidateByPrefixes(byType);
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
