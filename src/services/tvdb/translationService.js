/**
 * TVDB Translation Service
 * Handles language selection, mapping, and bulk translations
 */

// Note: This will be replaced by dependency injection in the constructor

class TranslationService {
    constructor(apiClient, cacheService) {
        this.apiClient = apiClient;
        this.cacheService = cacheService;
    }

    /**
     * Map user language to TVDB 3-character language code
     */
    mapToTvdbLanguage(userLanguage) {
        if (userLanguage && /^[a-z]{3}$/.test(userLanguage)) {
            return userLanguage;
        }
        return 'eng';
    }

    /**
     * Get translation for entity using TVDB v4 translation endpoints
     */
    async getTranslation(entityType, entityId, tvdbLanguage) {
        try {
            // Check cache first
            const cachedTranslation = await this.cacheService.getTranslation(entityType, entityId, tvdbLanguage, 'full');
            if (cachedTranslation) {
                console.log(`💾 Translation cache HIT for ${entityType} ${entityId} (${tvdbLanguage})`);
                return cachedTranslation;
            }

            const endpoint = `/${entityType}/${entityId}/translations/${tvdbLanguage}`;
            const response = await this.apiClient.makeRequest(endpoint);
            const translationData = response?.data || null;

            // Cache the translation data
            await this.cacheService.setTranslation(entityType, entityId, tvdbLanguage, 'full', translationData);
            
            if (translationData) {
                console.log(`🌍 Cached translation for ${entityType} ${entityId} (${tvdbLanguage})`);
            }

            return translationData;
        } catch (error) {
            console.error(`Translation fetch error for ${entityType} ${entityId} in ${tvdbLanguage}:`, error.message);
            // Cache negative result to avoid repeated API calls
            await this.cacheService.setTranslation(entityType, entityId, tvdbLanguage, 'full', null);
            return null;
        }
    }

    /**
     * Select preferred translation from language-keyed object
     */
    selectPreferredTranslation(translationsObj, userLanguage = null) {
        if (!translationsObj || typeof translationsObj !== 'object') {
            return null;
        }

        const availableLanguages = Object.keys(translationsObj);
        if (availableLanguages.length === 0) return null;

        if (userLanguage) {
            const tvdbLang = this.mapToTvdbLanguage(userLanguage);
            
            // Priority 1: Exact TVDB language match
            if (translationsObj[tvdbLang]) {
                return translationsObj[tvdbLang];
            }
            
            // Priority 2: Base language mapping
            const baseLang = userLanguage.split('-')[0].toLowerCase();
            const baseLanguageMap = {
                'en': 'eng', 'fr': 'fra', 'es': 'spa', 'de': 'deu', 
                'it': 'ita', 'pt': 'por', 'ja': 'jpn', 'ko': 'kor',
                'zh': 'chi', 'ar': 'ara', 'ru': 'rus'
            };
            
            const mappedBaseLang = baseLanguageMap[baseLang];
            if (mappedBaseLang && translationsObj[mappedBaseLang]) {
                return translationsObj[mappedBaseLang];
            }
            
            // Priority 3: Language family match
            for (const lang of availableLanguages) {
                if (lang.startsWith(mappedBaseLang)) {
                    return translationsObj[lang];
                }
            }
            
            // Priority 4: English fallback
            if (translationsObj['eng'] || translationsObj['en']) {
                return translationsObj[translationsObj['eng'] ? 'eng' : 'en'];
            }
        }
        
        // Final fallback: First available language
        return translationsObj[availableLanguages[0]];
    }

    /**
     * Get bulk episode translations with fallback
     */
    async getBulkEpisodeTranslations(seriesId, tvdbLanguage) {
        const translations = { primary: null, fallback: null };
        
        try {
            // Get primary language
            const primaryResponse = await this.apiClient.makeRequest(`/series/${seriesId}/episodes/default/${tvdbLanguage}`);
            translations.primary = primaryResponse?.data?.episodes || null;
            
            // Get English fallback if not requesting English
            if (tvdbLanguage !== 'eng') {
                try {
                    const fallbackResponse = await this.apiClient.makeRequest(`/series/${seriesId}/episodes/default/eng`);
                    translations.fallback = fallbackResponse?.data?.episodes || null;
                } catch (fallbackError) {
                    // Fallback failure is not critical
                }
            }
        } catch (error) {
            console.log(`⚠️ Bulk episode translation failed: ${error.message}`);
            
            // Try English if primary language failed
            if (tvdbLanguage !== 'eng') {
                try {
                    const engResponse = await this.apiClient.makeRequest(`/series/${seriesId}/episodes/default/eng`);
                    translations.primary = engResponse?.data?.episodes || null;
                } catch (engError) {
                    // Both failed, return empty
                }
            }
        }
        
        return translations;
    }

    /**
     * Create translation lookup maps
     */
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

    /**
     * Get episode name and overview with translation fallback
     */
    getEpisodeTranslation(episode, primaryLookup, fallbackLookup) {
        let episodeName = episode.name || `Episode ${episode.number}`;
        let episodeOverview = episode.overview || `Season ${episode.seasonNumber}, Episode ${episode.number}`;
        
        // Special handling for specials
        if (episode.seasonNumber === 0) {
            episodeName = episode.name || `Special ${episode.number}`;
            episodeOverview = episode.overview || `Special Episode ${episode.number}`;
        }
        
        // Use primary translation if available
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
        
        // Fallback to English if primary failed
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

    /**
     * Get content translation with fallback chain
     */
    async getContentTranslation(entityType, entityId, tvdbLanguage) {
        const translation = await this.getTranslation(entityType, entityId, tvdbLanguage);
        
        // Check if we got a valid translation
        if (translation && translation.language === tvdbLanguage && 
            translation.name && translation.name.trim()) {
            return { translation, isOriginal: false };
        }
        
        // Try English fallback if not already English
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
