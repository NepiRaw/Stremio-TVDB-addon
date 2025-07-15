const axios = require('axios');

/**
 * TVDB API Service
 * Handles authentication, API calls, and data transformation for TVDB API
 */
class TVDBService {
    constructor() {
        this.baseURL = process.env.TVDB_BASE_URL || 'https://api4.thetvdb.com/v4';
        this.apiKey = process.env.TVDB_API_KEY;
        this.token = null;
        this.tokenExpiry = null;
        
        if (!this.apiKey) {
            throw new Error('TVDB_API_KEY environment variable is required');
        }
    }

    /**
     * Authenticate with TVDB API and get JWT token
     */
    async authenticate() {
        try {
            const response = await axios.post(`${this.baseURL}/login`, {
                apikey: this.apiKey
            });

            this.token = response.data.data.token;
            // TVDB tokens expire after 24 hours
            this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            
            console.log('✅ TVDB authentication successful');
            return this.token;
        } catch (error) {
            console.error('❌ TVDB authentication failed:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with TVDB API');
        }
    }

    /**
     * Check if current token is valid and refresh if needed
     */
    async ensureValidToken() {
        if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
            await this.authenticate();
        }
        return this.token;
    }

    /**
     * Make authenticated API request to TVDB
     */
    async makeRequest(endpoint, params = {}) {
        await this.ensureValidToken();

        try {
            const response = await axios.get(`${this.baseURL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                    // Remove Accept-Language to get all available language data from TVDB
                },
                params
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                // Token expired, try refreshing once
                console.log('🔄 Token expired, refreshing...');
                await this.authenticate();
                
                const retryResponse = await axios.get(`${this.baseURL}${endpoint}`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/json'
                    },
                    params
                });
                
                return retryResponse.data;
            }
            
            console.error(`❌ TVDB API error for ${endpoint}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Search for content in TVDB
     */
    async search(query, type = null, limit = 20) {
        const params = {
            query: query.trim(),
            limit
        };

        if (type && (type === 'movie' || type === 'series')) {
            params.type = type;
        }

        try {
            const response = await this.makeRequest('/search', params);
            return response.data || [];
        } catch (error) {
            console.error('Search error:', error.message);
            return [];
        }
    }

    /**
     * Get detailed information about a movie with extended data
     */
    async getMovieDetails(movieId) {
        try {
            const [basic, extended] = await Promise.all([
                this.makeRequest(`/movies/${movieId}`),
                this.makeRequest(`/movies/${movieId}/extended`).catch(() => null)
            ]);
            
            return extended?.data || basic.data;
        } catch (error) {
            console.error(`Movie details error for ID ${movieId}:`, error.message);
            return null;
        }
    }

    /**
     * Get detailed information about a series with extended data
     */
    async getSeriesDetails(seriesId) {
        try {
            const [basic, extended] = await Promise.all([
                this.makeRequest(`/series/${seriesId}`),
                this.makeRequest(`/series/${seriesId}/extended`).catch(() => null)
            ]);
            
            return extended?.data || basic.data;
        } catch (error) {
            console.error(`Series details error for ID ${seriesId}:`, error.message);
            return null;
        }
    }

    /**
     * Get seasons for a series
     */
    async getSeriesSeasons(seriesId) {
        try {
            // Try the extended endpoint first, which often includes seasons
            const extendedResponse = await this.makeRequest(`/series/${seriesId}/extended`);
            if (extendedResponse?.data?.seasons) {
                console.log(`📺 Got ${extendedResponse.data.seasons.length} seasons from extended endpoint`);
                return extendedResponse.data.seasons;
            }
            
            // Fallback to basic series info that might include seasons
            const basicResponse = await this.makeRequest(`/series/${seriesId}`);
            if (basicResponse?.data?.seasons) {
                console.log(`📺 Got ${basicResponse.data.seasons.length} seasons from basic endpoint`);
                return basicResponse.data.seasons;
            }
            
            console.log(`⚠️ No seasons data available for series ${seriesId}`);
            return [];
        } catch (error) {
            console.error(`Series seasons error for ID ${seriesId}:`, error.message);
            return [];
        }
    }

    /**
     * Get episodes for a season
     */
    async getSeasonEpisodes(seriesId, seasonId) {
        try {
            const response = await this.makeRequest(`/series/${seriesId}/seasons/${seasonId}/episodes`);
            return response.data || [];
        } catch (error) {
            console.error(`Season episodes error for series ${seriesId}, season ${seasonId}:`, error.message);
            return [];
        }
    }

    /**
     * Get extended information including episodes count, runtime, etc.
     */
    async getSeriesExtended(seriesId) {
        try {
            const response = await this.makeRequest(`/series/${seriesId}/extended`);
            return response.data;
        } catch (error) {
            console.error(`Series extended error for ID ${seriesId}:`, error.message);
            return null;
        }
    }

    /**
     * Transform TVDB search results to Stremio catalog format
     * Uses the rich translation data available in search results
     */
    async transformSearchResults(results, type, userLanguage = null) {
        return results
            .filter(item => {
                // Filter by type if specified
                if (type === 'movie' && item.type !== 'movie') return false;
                if (type === 'series' && item.type !== 'series') return false;
                
                // Basic validation
                return item.id && item.name;
            })
            .map(item => this.transformSearchItemToStremioMeta(item, userLanguage))
            .filter(Boolean); // Remove any null results
    }

    /**
     * Transform TVDB search item to Stremio meta format
     * Uses the rich translation and metadata available in search results
     */
    transformSearchItemToStremioMeta(item, userLanguage = null) {
        try {
            const stremioType = item.type === 'movie' ? 'movie' : 'series';
            
            // Extract numeric ID from TVDB ID format (e.g., "series-431162" -> "431162")
            let numericId = item.id;
            if (typeof item.id === 'string') {
                const match = item.id.match(/(\d+)$/);
                if (match) {
                    numericId = match[1];
                }
            }
            
            const id = `tvdb-${numericId}`;

            // Get the name with language preference
            let selectedName = item.name || item.primary_title || 'Unknown Title';
            if (item.translations && Object.keys(item.translations).length > 0) {
                const translatedName = this.selectPreferredTranslationFromObject(
                    item.translations, 
                    userLanguage
                );
                if (translatedName) {
                    selectedName = translatedName;
                }
            }

            // Get the description with language preference  
            let selectedDescription = item.overview;
            if (item.overviews && Object.keys(item.overviews).length > 0) {
                const translatedDescription = this.selectPreferredTranslationFromObject(
                    item.overviews, 
                    userLanguage
                );
                if (translatedDescription) {
                    selectedDescription = translatedDescription;
                }
            }

            const meta = {
                id,
                type: stremioType,
                name: selectedName,
                poster: item.image_url || item.thumbnail,
                year: item.year || (item.first_air_time ? new Date(item.first_air_time).getFullYear() : undefined),
                description: selectedDescription
            };

            // Add additional metadata if available
            if (item.genres && Array.isArray(item.genres)) {
                meta.genres = item.genres.map(g => g.name || g).filter(Boolean);
            }

            // Add rating if available
            if (item.vote_average) {
                meta.imdbRating = item.vote_average.toString();
            }

            // Remove undefined properties
            Object.keys(meta).forEach(key => meta[key] === undefined && delete meta[key]);

            return meta;
        } catch (error) {
            console.error('Error transforming search item to Stremio meta:', error);
            return null;
        }
    }

    /**
     * Select preferred translation from object format (used in search results)
     * Priority: userLanguage -> English -> first available
     */
    selectPreferredTranslationFromObject(translationsObj, userLanguage = null) {
        if (!translationsObj || typeof translationsObj !== 'object') {
            return null;
        }

        const availableLanguages = Object.keys(translationsObj);
        console.log(`🌐 Available languages: ${availableLanguages.join(', ')}`);
        
        if (userLanguage) {
            console.log(`🔍 Looking for user language: ${userLanguage}`);
        }

        // First priority: User's preferred language
        if (userLanguage) {
            // Try exact match first
            if (translationsObj[userLanguage]) {
                console.log(`✅ Found exact user language match: ${userLanguage}`);
                return translationsObj[userLanguage];
            }
            
            // Try common variations
            const variations = [
                userLanguage.toLowerCase(),
                userLanguage.toUpperCase(),
                userLanguage.substring(0, 2), // e.g., 'fr' from 'fr-FR'
            ];
            
            for (const variation of variations) {
                if (translationsObj[variation]) {
                    console.log(`✅ Found user language variation: ${variation} for ${userLanguage}`);
                    return translationsObj[variation];
                }
            }
            
            console.log(`❌ No translation found for user language: ${userLanguage}`);
        }

        // Second priority: English
        const englishKeys = ['eng', 'en', 'en-us', 'en-gb'];
        for (const key of englishKeys) {
            if (translationsObj[key]) {
                console.log(`🇬🇧 Using English fallback: ${key}`);
                return translationsObj[key];
            }
        }

        // Third priority: First available translation
        const firstKey = availableLanguages[0];
        if (firstKey && translationsObj[firstKey]) {
            console.log(`🔄 Using first available language (${firstKey})`);
            return translationsObj[firstKey];
        }

        return null;
    }

    /**
     * Transform TVDB item to Stremio meta format (for search results)
     */
    transformToStremioMeta(item, userLanguage = null) {
        // Delegate to search item transformer
        return this.transformSearchItemToStremioMeta(item, userLanguage);
    }

    /**
     * Transform detailed TVDB data to full Stremio meta format
     * Based on TMDB addon patterns for proper Stremio compatibility
     */
    transformDetailedToStremioMeta(item, type, seasonsData = null, userLanguage = 'en-US') {
        try {
            const stremioType = type === 'movie' ? 'movie' : 'series';
            
            // Extract numeric ID
            let numericId = item.id;
            if (typeof item.id === 'string') {
                const match = item.id.match(/(\d+)$/);
                if (match) {
                    numericId = match[1];
                }
            }
            
            const id = `tvdb-${numericId}`;

            // Base meta object with required fields
            const meta = {
                id,
                type: stremioType,
                name: item.name || item.primary_title || 'Unknown Title'
            };

            // Apply language preference for name
            if (item.translations?.nameTranslations?.length > 0) {
                const selectedName = this.selectPreferredTranslation(
                    item.translations.nameTranslations, 
                    'name', 
                    userLanguage
                );
                if (selectedName) {
                    meta.name = selectedName;
                }
            }

            // Add description with language preference
            if (item.translations?.overviewTranslations?.length > 0) {
                const selectedDescription = this.selectPreferredTranslation(
                    item.translations.overviewTranslations,
                    'overview',
                    userLanguage
                );
                if (selectedDescription) {
                    meta.description = selectedDescription;
                }
            } else if (item.overview) {
                meta.description = item.overview;
            }

            // Add poster with fallback
            if (item.image_url) {
                meta.poster = item.image_url;
            } else if (item.image) {
                meta.poster = item.image;
            }

            // Add background/fanart
            if (item.fanart_url) {
                meta.background = item.fanart_url;
            } else if (item.background) {
                meta.background = item.background;
            }

            // Add year
            if (item.year) {
                meta.year = parseInt(item.year);
            } else if (item.first_aired) {
                meta.year = new Date(item.first_aired).getFullYear();
            } else if (item.aired) {
                meta.year = new Date(item.aired).getFullYear();
            }

            // Add genres
            if (Array.isArray(item.genres)) {
                meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
            }

            // Add cast (actors)
            if (Array.isArray(item.characters)) {
                meta.cast = item.characters
                    .filter(c => c.people?.name)
                    .map(c => c.people.name)
                    .slice(0, 15);
            }

            // Add directors
            if (Array.isArray(item.directors)) {
                meta.director = item.directors
                    .filter(d => d.people?.name)
                    .map(d => d.people.name);
            }

            // Add writers
            if (Array.isArray(item.writers)) {
                meta.writer = item.writers
                    .filter(w => w.people?.name)
                    .map(w => w.people.name);
            }

            // Add country
            if (item.originalCountry) {
                meta.country = [item.originalCountry];
            } else if (Array.isArray(item.companies)) {
                const countries = item.companies
                    .filter(c => c.country)
                    .map(c => c.country);
                if (countries.length) {
                    meta.country = [...new Set(countries)];
                }
            }

            // Add runtime
            if (item.runtime) {
                meta.runtime = `${item.runtime} min`;
            }

            // Add ratings
            if (item.rating?.average) {
                meta.imdbRating = item.rating.average.toString();
            }

            // Add status for series
            if (stremioType === 'series' && item.status) {
                meta.status = item.status.name || item.status;
            }

            // Add network/studio
            if (item.originalNetwork) {
                meta.network = item.originalNetwork;
            } else if (item.latestNetwork) {
                meta.network = item.latestNetwork;
            }

            // Add language
            if (item.originalLanguage) {
                meta.language = item.originalLanguage;
            }

            // CRITICAL: Add series-specific data for Stremio following TMDB addon pattern
            if (stremioType === 'series') {
                // For series, we MUST provide seasons and videos array
                meta.videos = [];
                meta.seasons = 0;
                
                if (Array.isArray(seasonsData) && seasonsData.length > 0) {
                    // Filter valid seasons (season number > 0)
                    const validSeasons = seasonsData.filter(season => {
                        const seasonNumber = season.number || season.seasonNumber || 0;
                        return seasonNumber > 0;
                    });

                    if (validSeasons.length > 0) {
                        meta.seasons = validSeasons.length;
                        
                        // Add episode count if available
                        const totalEpisodes = validSeasons.reduce((total, season) => {
                            return total + (season.episodeCount || season.episodes?.length || 0);
                        }, 0);
                        
                        if (totalEpisodes > 0) {
                            meta.episodeCount = totalEpisodes;
                        }

                        // Generate placeholder videos for Stremio (following TMDB pattern)
                        const videoMap = new Map(); // Use Map to prevent duplicates
                        
                        validSeasons.forEach(season => {
                            const seasonNumber = season.number || season.seasonNumber;
                            const episodeCount = season.episodeCount || season.episodes?.length || 1;
                            
                            for (let ep = 1; ep <= episodeCount; ep++) {
                                const videoId = `${seasonNumber}:${ep}`;
                                if (!videoMap.has(videoId)) {
                                    videoMap.set(videoId, {
                                        id: videoId,
                                        title: `Episode ${ep}`,
                                        season: seasonNumber,
                                        episode: ep,
                                        overview: `Season ${seasonNumber}, Episode ${ep}`,
                                        thumbnail: null,
                                        released: null
                                    });
                                }
                            }
                        });
                        
                        meta.videos = Array.from(videoMap.values());

                        // Add behavior hints for series (following TMDB pattern)
                        meta.behaviorHints = {
                            defaultVideoId: null,
                            hasScheduledVideos: true
                        };
                    }
                }

                // If no seasons data, still set proper defaults
                if (meta.seasons === 0) {
                    meta.behaviorHints = {
                        defaultVideoId: null,
                        hasScheduledVideos: false
                    };
                }
            } else {
                // For movies, add behavior hints (following TMDB pattern)
                meta.behaviorHints = {
                    defaultVideoId: item.imdb_id || id,
                    hasScheduledVideos: false
                };
            }

            // Clean up empty arrays to make response cleaner
            Object.keys(meta).forEach(key => {
                if (Array.isArray(meta[key]) && meta[key].length === 0) {
                    delete meta[key];
                }
            });

            return meta;
        } catch (error) {
            console.error('Error transforming detailed item to Stremio meta:', error);
            return null;
        }
    }

    /**
     * Select preferred translation based on user language preference with proper fallbacks
     * Priority: userLanguage -> English -> first available
     * Mimics TMDB addon pattern for language handling
     */
    selectPreferredTranslation(translations, fieldName, userLanguage = 'en-US') {
        if (!translations || !Array.isArray(translations) || translations.length === 0) {
            return null;
        }

        // Normalize user language (e.g., 'fr-FR' -> 'fr')
        const userLangCode = userLanguage.toLowerCase().split('-')[0];
        
        // Debug: Log available languages
        const availableLanguages = translations.map(t => t.language).join(', ');
        console.log(`🌐 Available languages for ${fieldName}: ${availableLanguages}`);
        console.log(`🔍 Looking for user language: ${userLanguage} (normalized: ${userLangCode})`);

        // First priority: User's preferred language (exact match)
        let userLangTranslation = translations.find(t => {
            const langCode = t.language?.toLowerCase();
            return langCode === userLanguage.toLowerCase();
        });
        
        if (userLangTranslation && userLangTranslation[fieldName]) {
            console.log(`✅ Found exact user language match: ${userLangTranslation.language}`);
            return userLangTranslation[fieldName];
        }

        // Second priority: User's language (base code match - e.g., 'fr' for 'fr-FR')
        userLangTranslation = translations.find(t => {
            const langCode = t.language?.toLowerCase().split('-')[0];
            return langCode === userLangCode;
        });
        
        if (userLangTranslation && userLangTranslation[fieldName]) {
            console.log(`✅ Found user language base match: ${userLangTranslation.language} for ${userLanguage}`);
            return userLangTranslation[fieldName];
        }

        // Third priority: English (any variant)
        const englishTranslation = translations.find(t => {
            const langCode = t.language?.toLowerCase();
            return langCode === 'eng' || langCode === 'en' || 
                   langCode === 'en-us' || langCode === 'en-gb' ||
                   langCode?.startsWith('en-');
        });
        
        if (englishTranslation && englishTranslation[fieldName]) {
            console.log(`🇬� Using English fallback: ${englishTranslation.language}`);
            return englishTranslation[fieldName];
        }

        // Fourth priority: First available translation
        const firstTranslation = translations[0];
        if (firstTranslation && firstTranslation[fieldName]) {
            console.log(`🔄 Using first available language (${firstTranslation.language})`);
            return firstTranslation[fieldName];
        }

        console.log(`❌ No translation found for ${fieldName}`);
        return null;
    }

    /**
     * Select preferred translation from object format (used in search results)
     * Priority: userLanguage -> English -> first available
     */
    selectPreferredTranslationFromObject(translationsObj, userLanguage = 'en-US') {
        if (!translationsObj || typeof translationsObj !== 'object') {
            return null;
        }

        const availableLanguages = Object.keys(translationsObj);
        console.log(`🌐 Available languages: ${availableLanguages.join(', ')}`);
        
        const userLangCode = userLanguage.toLowerCase().split('-')[0];
        console.log(`🔍 Looking for user language: ${userLanguage} (normalized: ${userLangCode})`);

        // First priority: User's preferred language (exact match)
        if (translationsObj[userLanguage]) {
            console.log(`✅ Found exact user language match: ${userLanguage}`);
            return translationsObj[userLanguage];
        }

        if (translationsObj[userLanguage.toLowerCase()]) {
            console.log(`✅ Found user language match (lowercase): ${userLanguage.toLowerCase()}`);
            return translationsObj[userLanguage.toLowerCase()];
        }
        
        // Second priority: User's language base code
        if (translationsObj[userLangCode]) {
            console.log(`✅ Found user language base match: ${userLangCode}`);
            return translationsObj[userLangCode];
        }
        
        // Try common variations
        const variations = [
            userLanguage.toUpperCase(),
            userLangCode.toUpperCase(),
            `${userLangCode}-${userLangCode.toUpperCase()}`,
        ];
        
        for (const variation of variations) {
            if (translationsObj[variation]) {
                console.log(`✅ Found user language variation: ${variation} for ${userLanguage}`);
                return translationsObj[variation];
            }
        }

        // Third priority: English (any variant)
        const englishKeys = ['eng', 'en', 'en-us', 'en-gb', 'EN', 'ENG', 'en-US', 'en-GB'];
        for (const key of englishKeys) {
            if (translationsObj[key]) {
                console.log(`🇬🇧 Using English fallback: ${key}`);
                return translationsObj[key];
            }
        }

        // Fourth priority: First available translation
        const firstKey = availableLanguages[0];
        if (firstKey && translationsObj[firstKey]) {
            console.log(`🔄 Using first available language (${firstKey})`);
            return translationsObj[firstKey];
        }

        return null;
    }
}

module.exports = new TVDBService();
