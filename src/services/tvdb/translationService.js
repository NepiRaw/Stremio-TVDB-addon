/**
 * TVDB Translation Service
 * Handles language selection, mapping, and bulk translations
 */

const { mapToTvdbLanguage, selectPreferredTranslation } = require('../../utils/languageMap');
const { fetchAllEpisodePages } = require('../../utils/episodePager');
const { isTransportError } = require('../../utils/errorHandler');

function collapseFallback(translations) {
    if (!translations?.primary || translations.primary !== translations.fallback) return translations;
    return { primary: translations.primary, fallbackSameAsPrimary: true };
}

function expandFallback(translations) {
    if (!translations?.fallbackSameAsPrimary) return translations;
    return { primary: translations.primary, fallback: translations.primary };
}

class TranslationService {
    constructor(apiClient, cacheService, logger) {
        this.apiClient = apiClient;
        this.cacheService = cacheService;
        this.logger = logger || {
            info: console.log,
            error: console.error,
            warn: console.warn,
            debug: console.log
        };
    }

    /**
     * Map user language to TVDB 3-character language code
     * Now uses centralized mapping from languageMap.js
     */
    mapToTvdbLanguage(userLanguage) {
        return mapToTvdbLanguage(userLanguage);
    }

    async getTranslation(entityType, entityId, tvdbLanguage) {
        try {
            const cachedTranslation = await this.cacheService.getTranslation(entityType, entityId, tvdbLanguage, 'full');
            if (cachedTranslation) {
                return cachedTranslation;
            }

            const endpoint = `/${entityType}/${entityId}/translations/${tvdbLanguage}`;
            const response = await this.apiClient.makeRequest(endpoint);
            const translationData = response?.data || null;

            await this.cacheService.setTranslation(entityType, entityId, tvdbLanguage, 'full', translationData);
            
            return translationData;
        } catch (error) {
            if (error.response?.status === 404) {
                this.logger.debug(`no ${tvdbLanguage} translation for ${entityType} ${entityId}, falling back`);
            } else {
                this.logger.error(`Translation fetch error for ${entityType} ${entityId} in ${tvdbLanguage}: ${error.message}`);
            }
            if (!isTransportError(error)) {
                await this.cacheService.setTranslation(entityType, entityId, tvdbLanguage, 'full', null);
            }
            return null;
        }
    }

    /**
     * Select preferred translation from language-keyed object
     * Now uses centralized logic from languageMap.js
     */
    selectPreferredTranslation(translationsObj, userLanguage = null) {
        return selectPreferredTranslation(translationsObj, userLanguage);
    }

    // Reports whether the request went unanswered, so the caller can skip caching an unknown result.
    async _fetchAllEpisodeTranslations(seriesId, language) {
        try {
            const allEpisodes = await fetchAllEpisodePages(this.apiClient, `/series/${seriesId}/episodes/default/${language}`);
            this.logger.debug(`episode translations ${language} → ${allEpisodes.length}`);
            return { episodes: allEpisodes.length > 0 ? allEpisodes : null, unanswered: false };
        } catch (error) {
            this.logger.warn(`Failed to fetch episode translations for series ${seriesId} (${language}):`, error.message);
            return { episodes: null, unanswered: isTransportError(error) };
        }
    }

    async getBulkEpisodeTranslations(seriesId, tvdbLanguage) {
        const translations = { primary: null, fallback: null };
        let unanswered = false;
        
        const cachedTranslations = await this.cacheService.getTranslation('series', seriesId, tvdbLanguage, 'bulk-episodes');
        if (cachedTranslations) {
            return expandFallback(cachedTranslations);
        }

        try {
            if (tvdbLanguage === 'eng') {
                const english = await this._fetchAllEpisodeTranslations(seriesId, 'eng');
                translations.primary = english.episodes;
                translations.fallback = english.episodes;
                unanswered = english.unanswered;
            } else {
                const [primary, fallback] = await Promise.all([
                    this._fetchAllEpisodeTranslations(seriesId, tvdbLanguage),
                    this._fetchAllEpisodeTranslations(seriesId, 'eng')
                ]);
                translations.primary = primary.episodes;
                translations.fallback = fallback.episodes;
                unanswered = primary.unanswered || fallback.unanswered;
            }

            if (!translations.primary && tvdbLanguage !== 'eng' && translations.fallback) {
                this.logger.warn(`Primary language '${tvdbLanguage}' failed, using 'eng' as primary.`);
                translations.primary = translations.fallback;
            }
        } catch (error) {
            this.logger.warn(`An unexpected error occurred during bulk episode translation fetching: ${error.message}`);
        }
        
        if (!unanswered) {
            await this.cacheService.setTranslation('series', seriesId, tvdbLanguage, 'bulk-episodes', collapseFallback(translations));
        }

        return translations;
    }

    createTranslationLookups(primaryEpisodes, fallbackEpisodes) {
        const primaryLookup = new Map();
        const fallbackLookup = new Map();
        
        if (primaryEpisodes) {
            primaryEpisodes.forEach(ep => {
                if (ep.id) primaryLookup.set(ep.id, ep);
            });
        }
        
        if (fallbackEpisodes) {
            fallbackEpisodes.forEach(ep => {
                if (ep.id) fallbackLookup.set(ep.id, ep);
            });
        }
        
        return { primaryLookup, fallbackLookup };
    }

    getEpisodeTranslation(episode, primaryLookup, fallbackLookup) {
        let episodeName = episode.name || `Episode ${episode.number}`;
        let episodeOverview = episode.overview || `Season ${episode.seasonNumber}, Episode ${episode.number}`;
        
        if (episode.seasonNumber === 0) {
            episodeName = episode.name || `Special ${episode.number}`;
            episodeOverview = episode.overview || `Special Episode ${episode.number}`;
        }
        
        if (primaryLookup.has(episode.id)) {
            const translated = primaryLookup.get(episode.id);
            if (translated.name && translated.name.trim() && translated.name.toLowerCase() !== 'null') {
                episodeName = translated.name;
                if (translated.overview && translated.overview.trim()) {
                    episodeOverview = translated.overview;
                }
                return { episodeName, episodeOverview };
            }
        }
        
        if (fallbackLookup.has(episode.id)) {
            const fallback = fallbackLookup.get(episode.id);
            if (fallback.name && fallback.name.trim()) {
                episodeName = fallback.name;
                if (fallback.overview && fallback.overview.trim()) {
                    episodeOverview = fallback.overview;
                }
            }
        }
        
        return { episodeName, episodeOverview };
    }

    async getContentTranslation(entityType, entityId, tvdbLanguage) {
        const translation = await this.getTranslation(entityType, entityId, tvdbLanguage);
        
        if (translation && translation.language === tvdbLanguage && 
            translation.name && translation.name.trim()) {
            return { translation, isOriginal: false };
        }
        
        if (tvdbLanguage !== 'eng') {
            const englishTranslation = await this.getTranslation(entityType, entityId, 'eng');
            if (englishTranslation && englishTranslation.name && englishTranslation.name.trim()) {
                return { translation: englishTranslation, isOriginal: false };
            }
        }
        
        return { translation: null, isOriginal: true };
    }
}

module.exports = TranslationService;
