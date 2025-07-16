const axios = require('axios');

/**
 * TVDB API Service
 * 
 * Key Features:
 * - TVDB v4 API with JWT authentication
 * - Correct TVDB language codes (3-char: eng, fra, spa, etc.)
 * - Enhanced image handling with multiple fallback sources
 * - Content-agnostic metadata transformation
 * - Comprehensive language preference chains
 * - Robust error handling and data validation
 * - Proper Stremio series/episode structure
 * 
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
     * Get artwork for a series/movie using TVDB v4 artwork endpoints
     * Enhanced to prioritize high-resolution images with proper endpoint handling
     */
    async getArtwork(entityType, entityId, language = 'eng') {
        try {
            // TVDB v4 API: Movies and series both have artwork data, but different type codes
            let endpoint;
            if (entityType === 'movies' || entityType === 'movie') {
                // Movies have artwork in the extended data, not separate endpoint
                console.log(`🎬 Processing movie artwork from extended data`);
                return { poster: null, background: null }; // Will use fallback chain with embedded data
            } else {
                // Series use dedicated artwork endpoint
                endpoint = `/series/${entityId}/artworks`;
            }
            
            const params = {
                lang: language
            };
            
            const response = await this.makeRequest(endpoint, params);
            const artworks = response?.data?.artworks || [];
            
            const artwork = {
                poster: null,
                background: null
            };
            
            // Separate artworks by type for better selection
            const posters = [];
            const backgrounds = [];
            
            for (const art of artworks) {
                if (!art.image) continue;
                
                // Type 2 = Poster, Type 3 = Fanart/Background
                if (art.type === 2 || art.type === '2' || art.typeName?.toLowerCase().includes('poster')) {
                    posters.push(art);
                }
                if (art.type === 3 || art.type === '3' || 
                    art.typeName?.toLowerCase().includes('fanart') || 
                    art.typeName?.toLowerCase().includes('background')) {
                    backgrounds.push(art);
                }
            }
            
            // Select best poster (prioritize by resolution, then score)
            if (posters.length > 0) {
                const bestPoster = posters.sort((a, b) => {
                    // First priority: resolution (width * height)
                    const aResolution = (a.width || 0) * (a.height || 0);
                    const bResolution = (b.width || 0) * (b.height || 0);
                    if (aResolution !== bResolution) return bResolution - aResolution;
                    
                    // Second priority: score
                    return (b.score || 0) - (a.score || 0);
                })[0];
                artwork.poster = bestPoster.image;
                console.log(`🎨 Selected poster: ${bestPoster.width}x${bestPoster.height} (score: ${bestPoster.score})`);
            }
            
            // Select best background (prioritize high resolution for better visual impact)
            if (backgrounds.length > 0) {
                const bestBackground = backgrounds.sort((a, b) => {
                    // First priority: resolution (width * height) - crucial for backgrounds
                    const aResolution = (a.width || 0) * (a.height || 0);
                    const bResolution = (b.width || 0) * (b.height || 0);
                    if (aResolution !== bResolution) return bResolution - aResolution;
                    
                    // Second priority: prefer wider aspect ratios for backgrounds (16:9, 21:9, etc.)
                    const aAspectRatio = a.width && a.height ? a.width / a.height : 0;
                    const bAspectRatio = b.width && b.height ? b.width / b.height : 0;
                    if (Math.abs(aAspectRatio - bAspectRatio) > 0.1) {
                        // Prefer aspect ratios between 1.5 and 2.5 (typical for backgrounds)
                        const aIsGoodRatio = aAspectRatio >= 1.5 && aAspectRatio <= 2.5;
                        const bIsGoodRatio = bAspectRatio >= 1.5 && bAspectRatio <= 2.5;
                        if (aIsGoodRatio !== bIsGoodRatio) return bIsGoodRatio ? 1 : -1;
                    }
                    
                    // Third priority: score
                    return (b.score || 0) - (a.score || 0);
                })[0];
                artwork.background = bestBackground.image;
                console.log(`🎨 Selected background: ${bestBackground.width}x${bestBackground.height} (ratio: ${bestBackground.width && bestBackground.height ? (bestBackground.width/bestBackground.height).toFixed(2) : 'unknown'}, score: ${bestBackground.score})`);
            }
            
            return artwork;
        } catch (error) {
            console.error(`Artwork fetch error for ${entityType} ${entityId}:`, error.message);
            return { poster: null, background: null };
        }
    }

    /**
     * Get seasons for a series using proper TVDB v4 endpoints
     */
    async getSeriesSeasons(seriesId) {
        try {
            // Use the extended endpoint to get seasons with episodes
            const response = await this.makeRequest(`/series/${seriesId}/extended`);
            const seasons = response?.data?.seasons || [];
            
            if (seasons.length > 0) {
                console.log(`📺 Got ${seasons.length} seasons for series ${seriesId}`);
                return seasons;
            }
            
            console.log(`⚠️ No seasons data available for series ${seriesId}`);
            return [];
        } catch (error) {
            console.error(`Series seasons error for ID ${seriesId}:`, error.message);
            return [];
        }
    }

    /**
     * Get episodes for a series using TVDB v4 episodes endpoint
     */
    async getSeriesEpisodes(seriesId, seasonType = 'default') {
        try {
            const response = await this.makeRequest(`/series/${seriesId}/episodes/${seasonType}`, { page: 0 });
            const episodes = response?.data?.episodes || [];
            
            console.log(`📺 Got ${episodes.length} episodes for series ${seriesId}`);
            return episodes;
        } catch (error) {
            console.error(`Series episodes error for ID ${seriesId}:`, error.message);
            return [];
        }
    }

    /**
     * Extract IMDB ID from TVDB remoteIds array
     */
    extractImdbId(item) {
        if (item.remoteIds && Array.isArray(item.remoteIds)) {
            const imdbRemote = item.remoteIds.find(remote => 
                remote.sourceName?.toLowerCase() === 'imdb' || 
                remote.type === 2 || // IMDB type in TVDB
                (remote.id && remote.id.startsWith('tt'))
            );
            
            if (imdbRemote && imdbRemote.id) {
                return imdbRemote.id.startsWith('tt') ? imdbRemote.id : `tt${imdbRemote.id}`;
            }
        }
        
        // Fallback: check for direct imdb field
        if (item.imdb && typeof item.imdb === 'string') {
            return item.imdb.startsWith('tt') ? item.imdb : `tt${item.imdb}`;
        }
        
        return null;
    }

    /**
     * Get translation for entity using TVDB v4 translation endpoints
     */
    async getTranslation(entityType, entityId, tvdbLanguage) {
        try {
            // Use the TVDB language code directly (no mapping needed)
            const endpoint = `/${entityType}/${entityId}/translations/${tvdbLanguage}`;
            
            const response = await this.makeRequest(endpoint);
            return response?.data || null;
        } catch (error) {
            console.error(`Translation fetch error for ${entityType} ${entityId} in ${tvdbLanguage}:`, error.message);
            return null;
        }
    }

    /**
     * Map user language to TVDB 3-character language code (now simplified)
     */
    mapToTvdbLanguage(userLanguage) {
        // No mapping needed - language is already in TVDB format from frontend
        // Just validate and provide fallback
        if (userLanguage && /^[a-z]{3}$/.test(userLanguage)) {
            return userLanguage;
        }
        return 'eng'; // Default fallback
    }

    /**
     * Select preferred translation from an object of language-keyed translations
     * Handles the language data structure returned by TVDB search API
     */
    selectPreferredTranslationFromObject(translationsObj, userLanguage = null) {
        if (!translationsObj || typeof translationsObj !== 'object') {
            return null;
        }

        const availableLanguages = Object.keys(translationsObj);
        if (availableLanguages.length === 0) {
            return null;
        }

        console.log(`🌐 Available languages: ${availableLanguages.join(', ')}`);

        if (userLanguage) {
            console.log(`🔍 Looking for user language: ${userLanguage} (normalized: ${userLanguage.split('-')[0]})`);
            
            // Map user language to TVDB format
            const tvdbLang = this.mapToTvdbLanguage(userLanguage);
            
            // Priority 1: Exact TVDB language match
            if (translationsObj[tvdbLang]) {
                console.log(`✅ Found exact language match: ${tvdbLang}`);
                return translationsObj[tvdbLang];
            }
            
            // Priority 2: Base language match (e.g., 'es' for 'es-ES')
            const baseLang = userLanguage.split('-')[0].toLowerCase();
            const baseLanguageMap = {
                'en': 'eng', 'fr': 'fra', 'es': 'spa', 'de': 'deu', 
                'it': 'ita', 'pt': 'por', 'ja': 'jpn', 'ko': 'kor',
                'zh': 'chi', 'ar': 'ara', 'ru': 'rus'
            };
            
            const mappedBaseLang = baseLanguageMap[baseLang];
            if (mappedBaseLang && translationsObj[mappedBaseLang]) {
                console.log(`✅ Found base language match: ${mappedBaseLang}`);
                return translationsObj[mappedBaseLang];
            }
            
            // Priority 3: Language family match (find any matching base)
            for (const lang of availableLanguages) {
                if (lang.startsWith(mappedBaseLang)) {
                    console.log(`✅ Found language family match: ${lang}`);
                    return translationsObj[lang];
                }
            }
            
            // Priority 4: English fallback
            if (translationsObj['eng'] || translationsObj['en']) {
                const englishKey = translationsObj['eng'] ? 'eng' : 'en';
                console.log(`🇬🇧 Using English fallback: ${englishKey}`);
                return translationsObj[englishKey];
            }
        }
        
        // Fallback: First available language
        const firstLang = availableLanguages[0];
        console.log(`🔄 Using first available language (${firstLang})`);
        return translationsObj[firstLang];
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
                name: selectedName
            };

            // Enhanced poster with multiple fallbacks (Trakt pattern)
            const posterSources = [
                item.image_url,       // Primary poster
                item.poster,          // Explicit poster field  
                item.image,           // Secondary image
                item.thumbnail        // Fallback to thumbnail
            ];
            
            for (const source of posterSources) {
                if (source && source.trim()) {
                    meta.poster = source;
                    break;
                }
            }

            // Enhanced year extraction
            const yearSources = [
                item.year,
                item.first_air_time ? new Date(item.first_air_time).getFullYear() : null,
                item.aired ? new Date(item.aired).getFullYear() : null,
                item.first_aired ? new Date(item.first_aired).getFullYear() : null
            ];
            
            for (const year of yearSources) {
                if (year && year > 1800 && year <= new Date().getFullYear() + 5) {
                    meta.year = year;
                    break;
                }
            }

            // Add description 
            if (selectedDescription) {
                meta.description = selectedDescription;
            }

            // Enhanced genre handling with content-agnostic approach (Trakt pattern)
            if (item.genres && Array.isArray(item.genres)) {
                meta.genres = item.genres
                    .map(genre => {
                        // Support both object and string formats
                        if (typeof genre === 'object') {
                            return genre.name || genre.label || genre.genre || genre;
                        }
                        return genre;
                    })
                    .filter(g => g && typeof g === 'string' && g.trim().length > 0)
                    .map(g => g.trim());
                
                // Only add if we have valid genres
                if (meta.genres.length === 0) {
                    delete meta.genres;
                }
            }

            // Enhanced ratings with multiple sources (Trakt pattern)
            const ratingSources = [
                item.vote_average,        // Vote average
                item.rating?.average,     // TVDB average rating
                item.score,              // Score field
                item.imdb_rating,        // Direct IMDB rating
                item.rating              // Simple rating field
            ];
            
            for (const rating of ratingSources) {
                if (rating && !isNaN(rating) && rating > 0) {
                    meta.imdbRating = rating.toString();
                    break;
                }
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
     * Transform TVDB item to Stremio meta format (for search results)
     */
    transformToStremioMeta(item, userLanguage = null) {
        // Delegate to search item transformer
        return this.transformSearchItemToStremioMeta(item, userLanguage);
    }

    /**
     * Transform detailed TVDB data to full Stremio meta format
     * Completely rewritten to use proper TVDB v4 API patterns
     */
    async transformDetailedToStremioMeta(item, type, seasonsData = null, tvdbLanguage = 'eng') {
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
                name: item.name || 'Unknown Title'
            };

            // Get translations using TVDB v4 translation endpoints
            // Language is already in TVDB 3-character format
            console.log(`🌐 Fetching ${stremioType} translations for TVDB language: ${tvdbLanguage}`);
            
            const translation = await this.getTranslation(stremioType === 'movie' ? 'movies' : 'series', numericId, tvdbLanguage);
            
            // Check if we got a translation in the requested language (not a fallback)
            if (translation && translation.language === tvdbLanguage && translation.name && translation.name.trim()) {
                meta.name = translation.name;
                console.log(`✅ Using translated name (${tvdbLanguage}): ${meta.name}`);
                
                if (translation.overview && translation.overview.trim()) {
                    meta.description = translation.overview;
                    console.log(`✅ Using translated description (${tvdbLanguage})`);
                }
            } else {
                // Try English fallback if requested language not available
                if (tvdbLanguage !== 'eng') {
                    console.log(`⚠️ No ${tvdbLanguage} translation found, trying English fallback`);
                    const englishTranslation = await this.getTranslation(stremioType === 'movie' ? 'movies' : 'series', numericId, 'eng');
                    
                    if (englishTranslation && englishTranslation.name && englishTranslation.name.trim()) {
                        meta.name = englishTranslation.name;
                        console.log(`🇬🇧 Using English fallback name: ${meta.name}`);
                        
                        if (englishTranslation.overview && englishTranslation.overview.trim()) {
                            meta.description = englishTranslation.overview;
                            console.log(`🇬🇧 Using English fallback description`);
                        }
                    }
                }
                
                // Final fallback to original data
                if (!meta.description && item.overview) {
                    meta.description = item.overview;
                    console.log(`🔄 Using original description`);
                }
                
                console.log(`🔄 Final name: ${meta.name}`);
            }

            // UNIFIED ARTWORK HANDLING: Use high-resolution artwork API for series, enhanced fallbacks for movies
            console.log(`🎨 Processing artwork for ${stremioType} ${numericId}`);
            const artwork = await this.getArtwork(stremioType === 'movie' ? 'movies' : 'series', numericId, tvdbLanguage);
            
            // Enhanced poster selection with type-specific handling
            if (artwork.poster) {
                meta.poster = artwork.poster;
                console.log(`✅ Got high-res poster from artwork API`);
            } else {
                // Type-specific poster selection: Movies use Type 14, Series use Type 2
                const posterSources = [
                    item.image,           // Primary image (usually poster)
                    item.poster,          // Explicit poster field
                    // Filter artworks for the correct poster types based on content type
                    ...(item.artworks || [])
                        .filter(art => {
                            // For movies: Type 14 = posters, for series: Type 2 = posters  
                            const isMoviePoster = (stremioType === 'movie') && (art.type === 14 || art.typeName?.toLowerCase().includes('poster'));
                            const isSeriesPoster = (stremioType === 'series') && (art.type === 2 || art.typeName?.toLowerCase().includes('poster'));
                            return (isMoviePoster || isSeriesPoster) && art.image;
                        })
                        .sort((a, b) => {
                            // Prefer portrait aspect ratios (0.6 - 0.8)
                            const aRatio = a.width && a.height ? a.width / a.height : 0;
                            const bRatio = b.width && b.height ? b.width / b.height : 0;
                            const aIsPortrait = aRatio >= 0.6 && aRatio <= 0.8;
                            const bIsPortrait = bRatio >= 0.6 && bRatio <= 0.8;
                            if (aIsPortrait !== bIsPortrait) return bIsPortrait ? 1 : -1;
                            // Then by resolution (prefer higher resolution)
                            return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
                        })
                        .map(art => art.image)
                ].filter(Boolean);
                
                if (posterSources.length > 0) {
                    meta.poster = posterSources[0];
                    const isOptimized = posterSources[0] !== item.image && posterSources[0] !== item.poster;
                    console.log(`🔄 Using ${isOptimized ? 'type-specific artwork' : 'fallback'} poster from ${stremioType} data`);
                }
            }
            
            // Enhanced background selection with better landscape prioritization
            if (artwork.background) {
                meta.background = artwork.background;
                console.log(`✅ Got high-res background from artwork API`);
            } else {
                // Enhanced fallback background selection prioritizing landscape images
                // Movies use Type 15 for backgrounds, Series use Type 3
                const backgroundSources = [
                    // Filter artworks for landscape background types
                    ...(item.artworks || [])
                        .filter(art => {
                            // For movies: Type 15 = backgrounds, for series: Type 3 = fanart
                            const isMovieBackground = (stremioType === 'movie') && (art.type === 15 || art.typeName?.toLowerCase().includes('background'));
                            const isSeriesFanart = (stremioType === 'series') && (art.type === 3 || art.typeName?.toLowerCase().includes('fanart'));
                            return (isMovieBackground || isSeriesFanart) && art.image;
                        })
                        .sort((a, b) => {
                            // Strongly prefer landscape aspect ratios (1.5 - 2.5)
                            const aRatio = a.width && a.height ? a.width / a.height : 0;
                            const bRatio = b.width && b.height ? b.width / b.height : 0;
                            const aIsLandscape = aRatio >= 1.5 && aRatio <= 2.5;
                            const bIsLandscape = bRatio >= 1.5 && bRatio <= 2.5;
                            if (aIsLandscape !== bIsLandscape) return bIsLandscape ? 1 : -1;
                            // Then by resolution (prefer higher resolution)
                            return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
                        })
                        .map(art => art.image),
                    item.fanart,          // Fanart is typically good for backgrounds
                    item.backdrop,        // Backdrop field
                    item.background,      // Direct background field
                    // Only use poster as final fallback if no landscape options
                    item.image           // Final fallback to poster (not ideal but better than nothing)
                ].filter(Boolean);
                
                if (backgroundSources.length > 0) {
                    meta.background = backgroundSources[0];
                    const isFromPoster = backgroundSources[0] === item.image;
                    const usedLandscapeArt = backgroundSources[0] !== item.image && backgroundSources[0] !== item.fanart && backgroundSources[0] !== item.backdrop && backgroundSources[0] !== item.background;
                    console.log(`🔄 Using ${isFromPoster ? 'poster as' : usedLandscapeArt ? 'landscape artwork as' : 'fallback'} background from ${stremioType} data`);
                }
            }

            // Extract proper IMDB ID from remoteIds
            const imdbId = this.extractImdbId(item);
            if (imdbId) {
                meta.imdb_id = imdbId;
                console.log(`✅ Found IMDB ID: ${imdbId}`);
            }

            // Note: TVDB ratings don't match IMDB ratings (e.g., Breaking Bad: TVDB=3.7, IMDB=9.5)
            // Commenting out IMDB rating extraction from TVDB for now
            /*
            // Add IMDB rating as string (required by Stremio SDK)
            const ratingSources = [
                item.score ? item.score / 1000000 : null,    // TVDB score appears to be scaled (3686327 -> 3.686327)
                item.rating?.average,          // TVDB average rating
                item.averageRating,           // Alternative rating field
                item.siteRating,              // Site rating
                item.communityRating          // Community rating
            ];
            
            for (const rating of ratingSources) {
                if (rating && !isNaN(rating) && rating > 0 && rating <= 10) {
                    // Stremio SDK requires imdbRating as string
                    meta.imdbRating = rating.toFixed(1);
                    console.log(`✅ Found rating: ${meta.imdbRating} (source: ${rating})`);
                    break;
                }
            }
            */

            // Add year
            if (item.year) {
                meta.year = parseInt(item.year);
            } else if (item.firstAired) {
                meta.year = new Date(item.firstAired).getFullYear();
            }

            // Add genres
            if (Array.isArray(item.genres)) {
                meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
            }

            // Add cast (characters)
            if (Array.isArray(item.characters)) {
                meta.cast = item.characters
                    .filter(c => c.people?.name || c.personName)
                    .map(c => c.people?.name || c.personName)
                    .slice(0, 15);
            }

            // Add country
            if (item.originalCountry) {
                meta.country = [item.originalCountry];
            } else if (item.country) {
                meta.country = [item.country];
            }

            // Add runtime
            if (item.runtime) {
                meta.runtime = `${item.runtime} min`;
            } else if (item.averageRuntime) {
                meta.runtime = `${item.averageRuntime} min`;
            }

            // Add language
            if (item.originalLanguage) {
                meta.language = item.originalLanguage;
            }

            // Add network
            if (item.originalNetwork?.name) {
                meta.network = item.originalNetwork.name;
            } else if (item.latestNetwork?.name) {
                meta.network = item.latestNetwork.name;
            }

            // CRITICAL: Add series-specific data for Stremio
            if (stremioType === 'series') {
                meta.videos = [];
                meta.seasons = 0;
                
                if (Array.isArray(seasonsData) && seasonsData.length > 0) {
                    // Filter valid seasons - only use "Aired Order" (official) seasons to avoid duplicates
                    // Also filter out seasons without aired episodes
                    const currentDate = new Date();
                    const validSeasons = seasonsData.filter(season => {
                        // Only include official "Aired Order" seasons (not DVD or Absolute order)
                        if (season.type?.type !== 'official') {
                            return false;
                        }
                        
                        const seasonNumber = season.number;
                        
                        // Include Season 0 (specials) if it exists
                        if (seasonNumber === 0) {
                            return true; // Include specials from aired order
                        }
                        
                        // For regular seasons (1, 2, 3, etc.) - check if they have aired content
                        if (seasonNumber >= 1) {
                            // We'll verify this season has aired episodes during episode processing
                            return true; // Include all numbered seasons from aired order initially
                        }
                        
                        // Filter out invalid/undefined season numbers
                        return false;
                    });

                    console.log(`📺 Filtered to ${validSeasons.length} official "Aired Order" seasons (from ${seasonsData.length} total)`);

                    // Sort seasons: Season 0 (specials) last, others in ascending order
                    validSeasons.sort((a, b) => {
                        const aNum = a.number || 0;
                        const bNum = b.number || 0;
                        
                        // Season 0 goes to the end
                        if (aNum === 0 && bNum !== 0) return 1;
                        if (bNum === 0 && aNum !== 0) return -1;
                        
                        // Regular sorting for other seasons
                        return aNum - bNum;
                    });

                    if (validSeasons.length > 0) {
                        meta.seasons = validSeasons.length;
                        console.log(`📺 Processing ${validSeasons.length} seasons (including specials if available)`);
                        
                        // Get episodes for better season/episode structure
                        try {
                            const episodes = await this.getSeriesEpisodes(numericId);
                            
                            if (episodes.length > 0) {
                                console.log(`📺 Got ${episodes.length} episodes from API`);
                                
                                // PERFORMANCE OPTIMIZATION: Get all episode translations in bulk using TVDB v4 bulk translation endpoint
                                let translatedEpisodes = null;
                                let englishFallbackEpisodes = null;
                                
                                try {
                                    console.log(`🌐 Fetching bulk episode translations for language: ${tvdbLanguage}`);
                                    const bulkResponse = await this.makeRequest(`/series/${numericId}/episodes/default/${tvdbLanguage}`);
                                    translatedEpisodes = bulkResponse?.data?.episodes || null;
                                    
                                    if (translatedEpisodes && translatedEpisodes.length > 0) {
                                        console.log(`✅ Got ${translatedEpisodes.length} translated episodes in bulk`);
                                        
                                        // Always get English fallback if we're not requesting English
                                        if (tvdbLanguage !== 'eng') {
                                            console.log(`🇬🇧 Fetching English episodes for fallback...`);
                                            try {
                                                const engResponse = await this.makeRequest(`/series/${numericId}/episodes/default/eng`);
                                                englishFallbackEpisodes = engResponse?.data?.episodes || null;
                                                
                                                if (englishFallbackEpisodes && englishFallbackEpisodes.length > 0) {
                                                    console.log(`✅ Got ${englishFallbackEpisodes.length} English episodes for fallback`);
                                                }
                                            } catch (engError) {
                                                console.log(`⚠️ English fallback failed: ${engError.message}`);
                                            }
                                        }
                                    } else if (tvdbLanguage !== 'eng') {
                                        // Fallback to English if requested language not available
                                        console.log(`⚠️ No ${tvdbLanguage} bulk translations, trying English fallback`);
                                        const engResponse = await this.makeRequest(`/series/${numericId}/episodes/default/eng`);
                                        translatedEpisodes = engResponse?.data?.episodes || null;
                                        
                                        if (translatedEpisodes && translatedEpisodes.length > 0) {
                                            console.log(`🇬🇧 Got ${translatedEpisodes.length} English episodes in bulk fallback`);
                                        }
                                    }
                                } catch (bulkError) {
                                    console.log(`⚠️ Bulk episode translation failed: ${bulkError.message}`);
                                    translatedEpisodes = null;
                                }
                                
                                // Create lookup maps for translated episodes by episode ID
                                const translationLookup = new Map();
                                const englishLookup = new Map();
                                
                                if (translatedEpisodes) {
                                    translatedEpisodes.forEach(translatedEp => {
                                        if (translatedEp.id) {
                                            translationLookup.set(translatedEp.id, translatedEp);
                                        }
                                    });
                                }
                                
                                if (englishFallbackEpisodes) {
                                    englishFallbackEpisodes.forEach(engEp => {
                                        if (engEp.id) {
                                            englishLookup.set(engEp.id, engEp);
                                        }
                                    });
                                }
                                
                                // Filter episodes to only include those from aired seasons and those that have aired
                                const currentDate = new Date();
                                const airedEpisodes = episodes.filter(episode => {
                                    // Only include episodes that have actually aired
                                    if (!episode.aired) {
                                        return false; // Exclude episodes without air date
                                    }
                                    
                                    const airDate = new Date(episode.aired);
                                    if (airDate > currentDate) {
                                        return false; // Exclude future episodes
                                    }
                                    
                                    // Include episodes from season 0 (specials) and season 1+ that have aired
                                    return episode.seasonNumber >= 0;
                                });
                                
                                console.log(`📺 Filtered to ${airedEpisodes.length} aired episodes`);
                                
                                // Group episodes by season to determine which seasons actually have content
                                const episodesBySeason = {};
                                airedEpisodes.forEach(episode => {
                                    if (!episodesBySeason[episode.seasonNumber]) {
                                        episodesBySeason[episode.seasonNumber] = [];
                                    }
                                    episodesBySeason[episode.seasonNumber].push(episode);
                                });
                                
                                // Update valid seasons to only include those with aired episodes
                                const seasonsWithContent = validSeasons.filter(season => {
                                    return episodesBySeason[season.number] && episodesBySeason[season.number].length > 0;
                                });
                                
                                meta.seasons = seasonsWithContent.length;
                                console.log(`📺 Final seasons with aired content: ${meta.seasons}`);
                                
                                // Build videos from actual episode data with bulk translations
                                const videoMap = new Map();
                                
                                for (const episode of airedEpisodes) {
                                    // ENHANCED: Use IMDB ID format for better stream addon compatibility
                                    // Stream addons prefer IMDB IDs over TVDB IDs for content recognition
                                    let videoId;
                                    if (imdbId) {
                                        // Use IMDB format: "tt26743760:1:1" (preferred by most stream addons)
                                        videoId = `${imdbId}:${episode.seasonNumber}:${episode.number}`;
                                    } else {
                                        // Fallback to TVDB format: "431162:1:1" 
                                        videoId = `${numericId}:${episode.seasonNumber}:${episode.number}`;
                                    }
                                    
                                    if (!videoMap.has(videoId)) {
                                        // Start with original episode data
                                        let episodeName = episode.name || `Episode ${episode.number}`;
                                        let episodeOverview = episode.overview || `Season ${episode.seasonNumber}, Episode ${episode.number}`;
                                        
                                        // Special handling for Season 0 episodes (specials)
                                        if (episode.seasonNumber === 0) {
                                            episodeName = episode.name || `Special ${episode.number}`;
                                            episodeOverview = episode.overview || `Special Episode ${episode.number}`;
                                        }
                                        
                                        // Use bulk translation data with smart fallback logic
                                        if (translationLookup.has(episode.id)) {
                                            const translatedEp = translationLookup.get(episode.id);
                                            
                                            // Use requested language if available and not null/empty
                                            if (translatedEp.name && translatedEp.name.trim() && translatedEp.name.toLowerCase() !== 'null') {
                                                episodeName = translatedEp.name;
                                                console.log(`🎭 Bulk translated S${episode.seasonNumber}E${episode.number}: ${episodeName}`);
                                                
                                                if (translatedEp.overview && translatedEp.overview.trim()) {
                                                    episodeOverview = translatedEp.overview;
                                                }
                                            } else if (englishLookup.has(episode.id)) {
                                                // Fallback to English if requested language has null/empty name
                                                const englishEp = englishLookup.get(episode.id);
                                                if (englishEp.name && englishEp.name.trim()) {
                                                    episodeName = englishEp.name;
                                                    console.log(`🇬🇧 English fallback S${episode.seasonNumber}E${episode.number}: ${episodeName}`);
                                                    
                                                    if (englishEp.overview && englishEp.overview.trim()) {
                                                        episodeOverview = englishEp.overview;
                                                    }
                                                }
                                            }
                                        } else if (englishLookup.has(episode.id)) {
                                            // Use English if requested language episode not found
                                            const englishEp = englishLookup.get(episode.id);
                                            if (englishEp.name && englishEp.name.trim()) {
                                                episodeName = englishEp.name;
                                                console.log(`🇬🇧 English only S${episode.seasonNumber}E${episode.number}: ${episodeName}`);
                                                
                                                if (englishEp.overview && englishEp.overview.trim()) {
                                                    episodeOverview = englishEp.overview;
                                                }
                                            }
                                        }
                                        
                                        // Enhanced thumbnail handling with multiple fallbacks
                                        let episodeThumbnail = null;
                                        const thumbnailSources = [
                                            episode.image,           // Primary episode image
                                            episode.thumbnail,       // Alternative thumbnail field
                                            episode.filename,        // Filename-based image
                                            meta.poster,            // Fallback to series poster
                                            meta.background,        // Fallback to series background
                                            item.image              // Fallback to series image
                                        ].filter(Boolean);
                                        
                                        if (thumbnailSources.length > 0) {
                                            episodeThumbnail = thumbnailSources[0];
                                        }
                                        
                                        // Stremio SDK video object format (NO STREAMS - handled by stream handlers)
                                        const video = {
                                            id: videoId,
                                            title: episodeName,
                                            season: episode.seasonNumber,
                                            episode: episode.number,
                                            overview: episodeOverview,
                                            thumbnail: episodeThumbnail,
                                            released: episode.aired ? new Date(episode.aired).toISOString() : null
                                        };
                                        
                                        // Episodes are metadata only - streams provided by separate stream handlers
                                        videoMap.set(videoId, video);
                                    }
                                }
                                
                                meta.videos = Array.from(videoMap.values());
                                console.log(`📺 Created ${meta.videos.length} video entries with bulk translations`);
                            } else {
                                // Fallback: Generate from season data
                                const totalEpisodes = validSeasons.reduce((total, season) => {
                                    return total + (season.episodeCount || season.episodes?.length || 0);
                                }, 0);
                                
                                if (totalEpisodes > 0) {
                                    meta.episodeCount = totalEpisodes;
                                }
                            }
                        } catch (episodeError) {
                            console.error('Error fetching episodes:', episodeError.message);
                        }

                        // Add behavior hints for series - NO default episode selection
                        // Users must explicitly choose an episode before stream requests are made
                        meta.behaviorHints = {
                            defaultVideoId: null,  // No auto-selection of episodes
                            hasScheduledVideos: true
                        };
                    }
                }

                // If no seasons data, still set proper defaults - NO default episode selection
                if (meta.seasons === 0) {
                    meta.behaviorHints = {
                        defaultVideoId: null,  // No auto-selection
                        hasScheduledVideos: false
                    };
                }
            } else {
                // MOVIES: Need videos array with single video object for stream addon compatibility
                // According to Stremio SDK: "If you do not provide videos (e.g. for movie), 
                // Stremio assumes this meta item has one video, and it's ID is equal to the meta item id"
                // However, stream addons work better with explicit videos array
                
                const movieVideoId = imdbId || id; // Use IMDB ID if available, otherwise TVDB ID
                
                meta.videos = [{
                    id: movieVideoId,
                    title: meta.name,
                    released: item.year ? `${item.year}-01-01T00:00:00.000Z` : null
                }];
                
                console.log(`🎬 Created movie video object with ID: ${movieVideoId}`);
                
                // Movies don't need complex behavior hints
                meta.behaviorHints = {
                    hasScheduledVideos: false
                };
            }

            // Clean up empty arrays
            Object.keys(meta).forEach(key => {
                if (Array.isArray(meta[key]) && meta[key].length === 0) {
                    delete meta[key];
                }
            });

            console.log(`✅ Successfully transformed ${stremioType} metadata for: ${meta.name}`);
            return meta;
        } catch (error) {
            console.error('Error transforming detailed item to Stremio meta:', error);
            return null;
        }
    }

    /**
     * Get extended information for series including seasons and other data
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
}

module.exports = new TVDBService();
