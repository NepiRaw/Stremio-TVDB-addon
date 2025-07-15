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
     * Get detailed information about a movie
     */
    async getMovieDetails(movieId) {
        try {
            const response = await this.makeRequest(`/movies/${movieId}`);
            return response.data;
        } catch (error) {
            console.error(`Movie details error for ID ${movieId}:`, error.message);
            return null;
        }
    }

    /**
     * Get detailed information about a series
     */
    async getSeriesDetails(seriesId) {
        try {
            const response = await this.makeRequest(`/series/${seriesId}`);
            return response.data;
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
     */
    transformSearchResults(results, type) {
        return results
            .filter(item => {
                // Filter by type if specified
                if (type === 'movie' && item.type !== 'movie') return false;
                if (type === 'series' && item.type !== 'series') return false;
                
                // Basic validation
                return item.id && item.name;
            })
            .map(item => this.transformToStremioMeta(item))
            .filter(Boolean); // Remove any null results
    }

    /**
     * Transform TVDB item to Stremio meta format
     */
    transformToStremioMeta(item) {
        try {
            const stremioType = item.type === 'movie' ? 'movie' : 'series';
            const id = `tvdb-${item.id}`;

            const meta = {
                id,
                type: stremioType,
                name: item.name || item.primary_title || 'Unknown Title'
            };

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
    transformDetailedToStremioMeta(item, type, seasonsData = null) {
        try {
            const stremioType = type === 'movie' ? 'movie' : 'series';
            const id = `tvdb-${item.id}`;

            const meta = {
                id,
                type: stremioType,
                name: item.name || item.primary_title || 'Unknown Title'
            };

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

            // Add description
            if (item.overview) {
                meta.description = item.overview;
            }

            // Add genres
            if (item.genres && Array.isArray(item.genres)) {
                meta.genres = item.genres.map(genre => genre.name || genre).filter(Boolean);
            }

            // Add cast (if available)
            if (item.characters && Array.isArray(item.characters)) {
                meta.cast = item.characters
                    .filter(char => char.people && char.people.name)
                    .map(char => char.people.name)
                    .slice(0, 10); // Limit to 10 cast members
            }

            // Add director (if available)
            if (item.directors && Array.isArray(item.directors)) {
                meta.director = item.directors
                    .filter(dir => dir.people && dir.people.name)
                    .map(dir => dir.people.name);
            }

            // Add series-specific data
            if (stremioType === 'series' && seasonsData) {
                // Filter out seasons without air dates
                const validSeasons = seasonsData.filter(season => {
                    return season.air_date || season.aired;
                });

                if (validSeasons.length > 0) {
                    meta.seasons = validSeasons.length;
                    
                    // TODO: Add MongoDB caching for episode counts
                    // For now, we'll add a placeholder
                    meta.episodeCount = 'Loading...';
                }
            }

            // Add runtime (if available)
            if (item.runtime) {
                meta.runtime = `${item.runtime} min`;
            }

            // Add rating (if available)
            if (item.rating && item.rating.average) {
                meta.imdbRating = item.rating.average.toString();
            }

            return meta;
        } catch (error) {
            console.error('Error transforming detailed item to Stremio meta:', error);
            return null;
        }
    }
}

module.exports = new TVDBService();
