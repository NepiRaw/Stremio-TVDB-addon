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
            const response = await this.makeRequest(`/series/${seriesId}/seasons`);
            return response.data || [];
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
            let selectedName = item.name; // Default to original name
            if (item.translations && Object.keys(item.translations).length > 0) {
                selectedName = this.selectPreferredTranslationFromObject(
                    item.translations, 
                    userLanguage
                ) || item.name;
            }

            // Get the description with language preference  
            let selectedDescription = item.overview; // Default to original overview
            if (item.overviews && Object.keys(item.overviews).length > 0) {
                selectedDescription = this.selectPreferredTranslationFromObject(
                    item.overviews, 
                    userLanguage
                ) || item.overview;
            }

            const meta = {
                id,
                type: stremioType,
                name: selectedName,
                poster: item.image_url || item.thumbnail,
                year: item.year || (item.first_air_time ? new Date(item.first_air_time).getFullYear() : undefined),
                description: selectedDescription
            };

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
     * Transform TVDB item to Stremio meta format
     */
    transformToStremioMeta(item, userLanguage = null) {
        try {
            const stremioType = item.type === 'movie' ? 'movie' : 'series';
            
            // Debug: Log what data we have for this item
            console.log(`🔍 Transform search item - Original name: ${item.name}, Type: ${item.type}`);
            console.log(`🔍 Has translations: ${!!(item.translations && item.translations.nameTranslations)}`);
            if (item.translations && item.translations.nameTranslations) {
                console.log(`🔍 Translation count: ${item.translations.nameTranslations.length}`);
            }
            
            // Extract numeric ID from TVDB ID format (e.g., "series-431162" -> "431162")
            let numericId = item.id;
            if (typeof item.id === 'string') {
                const match = item.id.match(/(\d+)$/);
                if (match) {
                    numericId = match[1];
                }
            }
            
            const id = `tvdb-${numericId}`;

            const meta = {
                id,
                type: stremioType,
                name: item.name || item.primary_title || 'Unknown Title'
            };

            // Use available names from TVDB with language preference
            if (item.translations && item.translations.nameTranslations && item.translations.nameTranslations.length > 0) {
                const selectedName = this.selectPreferredTranslation(
                    item.translations.nameTranslations, 
                    'name', 
                    userLanguage
                );
                if (selectedName) {
                    meta.name = selectedName;
                }
            } else {
                console.log(`⚠️ No name translations available for search result, using original: ${meta.name}`);
            }

            // Add poster if available
            if (item.image_url) {
                meta.poster = item.image_url;
            }

            // Add basic metadata if available
            if (item.year) {
                meta.year = item.year;
            }

            if (item.overview) {
                meta.description = item.overview;
            }

            return meta;
        } catch (error) {
            console.error('Error transforming item to Stremio meta:', error);
            return null;
        }
    }

    /**
     * Transform detailed TVDB data to full Stremio meta format
     */
    transformDetailedToStremioMeta(item, type, seasonsData = null, userLanguage = null) {
        try {
            const stremioType = type === 'movie' ? 'movie' : 'series';
            
            // Extract numeric ID from TVDB ID format (e.g., "series-431162" -> "431162")
            let numericId = item.id;
            if (typeof item.id === 'string') {
                const match = item.id.match(/(\d+)$/);
                if (match) {
                    numericId = match[1];
                }
            }
            
            const id = `tvdb-${numericId}`;

            const meta = {
                id,
                type: stremioType,
                name: item.name || item.primary_title || 'Unknown Title'
            };

            // Use available names from TVDB with language preference
            if (item.translations && item.translations.nameTranslations && item.translations.nameTranslations.length > 0) {
                const selectedName = this.selectPreferredTranslation(
                    item.translations.nameTranslations, 
                    'name', 
                    userLanguage
                );
                if (selectedName) {
                    meta.name = selectedName;
                }
            }

            // Add poster
            if (item.image_url) {
                meta.poster = item.image_url;
            }

            // Add background
            if (item.fanart_url) {
                meta.background = item.fanart_url;
            }

            // Add year
            if (item.year) {
                meta.year = parseInt(item.year);
            } else if (item.first_aired) {
                meta.year = new Date(item.first_aired).getFullYear();
            }

            // Add description using available languages from TVDB with language preference
            if (item.overview) {
                meta.description = item.overview;
            } else if (item.translations && item.translations.overviewTranslations && item.translations.overviewTranslations.length > 0) {
                const selectedDescription = this.selectPreferredTranslation(
                    item.translations.overviewTranslations, 
                    'overview', 
                    userLanguage
                );
                if (selectedDescription) {
                    meta.description = selectedDescription;
                }
            }

            // Add genres
            if (item.genres && Array.isArray(item.genres)) {
                meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
            }

            // Add cast (actors)
            if (item.characters && Array.isArray(item.characters)) {
                meta.cast = item.characters
                    .filter(char => char.people && char.people.name)
                    .map(char => char.people.name)
                    .slice(0, 15); // Limit to 15 cast members
            }

            // Add director
            if (item.directors && Array.isArray(item.directors)) {
                meta.director = item.directors
                    .filter(dir => dir.people && dir.people.name)
                    .map(dir => dir.people.name);
            }

            // Add writer
            if (item.writers && Array.isArray(item.writers)) {
                meta.writer = item.writers
                    .filter(writer => writer.people && writer.people.name)
                    .map(writer => writer.people.name);
            }

            // Add country
            if (item.originalCountry) {
                meta.country = [item.originalCountry];
            } else if (item.companies && Array.isArray(item.companies)) {
                const countries = item.companies
                    .filter(company => company.country)
                    .map(company => company.country);
                if (countries.length > 0) {
                    meta.country = [...new Set(countries)]; // Remove duplicates
                }
            }

            // Add series-specific data
            if (stremioType === 'series' && seasonsData) {
                // Filter out seasons without air dates as requested
                const validSeasons = seasonsData.filter(season => {
                    return season.air_date || season.aired;
                });

                if (validSeasons.length > 0) {
                    meta.seasons = validSeasons.length;
                    
                    // Add episode count if available
                    const totalEpisodes = validSeasons.reduce((total, season) => {
                        return total + (season.episodeCount || 0);
                    }, 0);
                    
                    if (totalEpisodes > 0) {
                        meta.episodeCount = totalEpisodes;
                    }
                }
            }

            // Add runtime
            if (item.runtime) {
                meta.runtime = `${item.runtime} min`;
            }

            // Add ratings
            if (item.rating && item.rating.average) {
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

            // Add language (prefer English name)
            if (item.originalLanguage) {
                meta.language = item.originalLanguage;
            }

            return meta;
        } catch (error) {
            console.error('Error transforming detailed item to Stremio meta:', error);
            return null;
        }
    }

    /**
     * Select preferred translation based on user language preference
     * Priority: userLanguage -> English -> first available
     */
    selectPreferredTranslation(translations, fieldName, userLanguage = null) {
        if (!translations || !Array.isArray(translations) || translations.length === 0) {
            return null;
        }

        // Debug: Log available languages
        const availableLanguages = translations.map(t => t.language).join(', ');
        console.log(`🌐 Available languages for ${fieldName}: ${availableLanguages}`);
        if (userLanguage) {
            console.log(`🔍 Looking for user language: ${userLanguage}`);
        }

        // First priority: User's preferred language
        if (userLanguage) {
            const userLangTranslation = translations.find(t => {
                const langCode = t.language?.toLowerCase();
                const matches = langCode === userLanguage.toLowerCase() ||
                               langCode === `${userLanguage.toLowerCase()}-${userLanguage.toLowerCase()}` ||
                               langCode?.startsWith(`${userLanguage.toLowerCase()}-`);
                
                if (matches) {
                    console.log(`✅ Found user language match: ${langCode} for ${userLanguage}`);
                }
                return matches;
            });
            
            if (userLangTranslation && userLangTranslation[fieldName]) {
                console.log(`🎯 Using user language translation: ${userLangTranslation[fieldName].substring(0, 50)}...`);
                return userLangTranslation[fieldName];
            } else {
                console.log(`❌ No translation found for user language: ${userLanguage}`);
            }
        }

        // Second priority: English
        const englishTranslation = translations.find(t => {
            const langCode = t.language?.toLowerCase();
            return langCode === 'eng' || langCode === 'en' || 
                   langCode === 'en-us' || langCode === 'en-gb';
        });
        
        if (englishTranslation && englishTranslation[fieldName]) {
            console.log(`🇬🇧 Using English fallback: ${englishTranslation[fieldName].substring(0, 50)}...`);
            return englishTranslation[fieldName];
        }

        // Third priority: First available translation
        const firstTranslation = translations[0];
        if (firstTranslation && firstTranslation[fieldName]) {
            console.log(`🔄 Using first available language (${firstTranslation.language}): ${firstTranslation[fieldName].substring(0, 50)}...`);
            return firstTranslation[fieldName];
        }

        return null;
    }
}

module.exports = new TVDBService();
