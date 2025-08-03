/**
 * Centralized Catalog Configuration System
 * Manages all catalog definitions, API key requirements, and UI configurations
 */

const envValidator = require('../utils/envValidator');

class CatalogConfig {
    constructor() {
        // Define catalog modes and their requirements
        this.modes = {
            'search-only': {
                id: 'search-only',
                name: 'Search Only',
                description: 'Basic search functionality without browsing catalogs',
                requiredApiKeys: ['TVDB_API_KEY'],
                optionalApiKeys: ['OMDB_API_KEY'],
                features: ['search', 'metadata']
            },
            'catalog': {
                id: 'catalog',
                name: 'Full Catalog',
                description: 'Complete catalog browsing and search functionality',
                requiredApiKeys: ['TVDB_API_KEY'],
                catalogApiKeys: ['TMDB_API_KEY'], // Keys that enable catalog mode
                optionalApiKeys: ['OMDB_API_KEY'],
                features: ['search', 'metadata', 'catalog-browsing', 'advanced-config']
            }
        };

        // Define all available catalogs with their configurations
        this.catalogDefinitions = {
            // Movie catalogs
            'tmdb-popular-movies': {
                id: 'tmdb-popular-movies',
                type: 'movie',
                name: 'TVDB - Popular Movies',
                icon: 'fas fa-chart-line',
                tooltip: 'Most popular movies from TMDB',
                provider: 'tmdb',
                category: 'popular',
                requiredApiKeys: ['TMDB_API_KEY'],
                defaultEnabled: true,
                order: 1,
                extra: [{ name: 'skip', isRequired: false }]
            },
            'tmdb-trending-movies': {
                id: 'tmdb-trending-movies',
                type: 'movie',
                name: 'TVDB - Trending Movies',
                icon: 'fas fa-fire',
                tooltip: 'Trending movies from TMDB',
                provider: 'tmdb',
                category: 'trending',
                requiredApiKeys: ['TMDB_API_KEY'],
                defaultEnabled: true,
                order: 2,
                extra: [{ name: 'skip', isRequired: false }]
            },
            'tmdb-top-rated-movies': {
                id: 'tmdb-top-rated-movies',
                type: 'movie',
                name: 'TVDB - Top Rated Movies',
                icon: 'fas fa-trophy',
                tooltip: 'Top rated movies from TMDB',
                provider: 'tmdb',
                category: 'top-rated',
                requiredApiKeys: ['TMDB_API_KEY'],
                defaultEnabled: false,
                order: 3,
                extra: [{ name: 'skip', isRequired: false }]
            },

            // Series catalogs
            'tvdb-popular-series': {
                id: 'tvdb-popular-series',
                type: 'series',
                name: 'TVDB - Popular Series',
                icon: 'fas fa-chart-line',
                tooltip: 'Popular series from TVDB',
                provider: 'tvdb',
                category: 'popular',
                requiredApiKeys: ['TVDB_API_KEY'],
                defaultEnabled: true,
                order: 1,
                extra: [{ name: 'skip', isRequired: false }]
            },
            'tvdb-trending-series': {
                id: 'tvdb-trending-series',
                type: 'series',
                name: 'TVDB - Trending Series',
                icon: 'fas fa-fire',
                tooltip: 'Trending series from TVDB',
                provider: 'tvdb',
                category: 'trending',
                requiredApiKeys: ['TVDB_API_KEY'],
                defaultEnabled: true,
                order: 2,
                extra: [{ name: 'skip', isRequired: false }]
            },
            'tvdb-latest-series': {
                id: 'tvdb-latest-series',
                type: 'series',
                name: 'TVDB - Latest Series',
                icon: 'fas fa-clock',
                tooltip: 'Latest series from TVDB',
                provider: 'tvdb',
                category: 'latest',
                requiredApiKeys: ['TVDB_API_KEY'],
                defaultEnabled: false,
                order: 3,
                extra: [{ name: 'skip', isRequired: false }]
            },

            // Anime catalogs (future extension point)
            'kitsu-trending-anime': {
                id: 'kitsu-trending-anime',
                type: 'anime',
                name: 'Kitsu - Trending Anime',
                icon: 'fas fa-fire',
                tooltip: 'Trending anime from Kitsu',
                provider: 'kitsu',
                category: 'trending',
                requiredApiKeys: ['KITSU_API_KEY'],
                defaultEnabled: false,
                order: 1,
                extra: [{ name: 'skip', isRequired: false }]
            },
            'jikan-top-anime': {
                id: 'jikan-top-anime',
                type: 'anime',
                name: 'MyAnimeList - Top Anime',
                icon: 'fas fa-trophy',
                tooltip: 'Top anime from MyAnimeList',
                provider: 'jikan',
                category: 'top',
                requiredApiKeys: [], // Jikan is free
                defaultEnabled: false,
                order: 2,
                extra: [{ name: 'skip', isRequired: false }]
            }
        };

        // Frontend UI tabs configuration
        this.uiTabs = [
            { id: 'movies', name: 'Movies', icon: 'fas fa-film' },
            { id: 'series', name: 'TV Series', icon: 'fas fa-tv' },
            { id: 'anime', name: 'Anime', icon: 'fas fa-dragon' }
        ];

        // API key validation rules
        this.apiKeyValidation = {
            'TVDB_API_KEY': {
                required: true,
                description: 'TVDB API key from thetvdb.com'
            }
        };
    }

    /**
     * Determine the current addon mode based on available API keys
     * @returns {Object} Mode information
     */
    getCurrentMode() {
        const apiKeyStatus = this.validateApiKeys();
        // Dynamically check all catalogApiKeys from the catalog mode definition
        const catalogApiKeys = this.modes['catalog'].catalogApiKeys || [];
        const hasAllCatalogApiKeys = catalogApiKeys.length === 0 || catalogApiKeys.every(key => apiKeyStatus.configured[key]);
        const mode = hasAllCatalogApiKeys ? 'catalog' : 'search-only';
        return {
            ...this.modes[mode],
            apiKeyStatus
        };
    }

    /**
     * Validate all API keys
     * @returns {Object} Validation results
     */
    validateApiKeys() {
        return envValidator.validateMultiple(this.apiKeyValidation);
    }

    /**
     * Get available catalogs for current mode
     * @param {string} type - Optional content type filter ('movie', 'series', 'anime')
     * @returns {Array} Array of available catalog configurations
     */
    getAvailableCatalogs(type = null) {
        const currentMode = this.getCurrentMode();
        const apiKeyStatus = currentMode.apiKeyStatus;
        
        let catalogs = Object.values(this.catalogDefinitions);

        // Filter by type if specified
        if (type) {
            catalogs = catalogs.filter(catalog => catalog.type === type);
        }

        // Filter by available API keys
        catalogs = catalogs.filter(catalog => {
            return catalog.requiredApiKeys.every(key => apiKeyStatus.configured[key]);
        });

        // Sort by order
        return catalogs.sort((a, b) => a.order - b.order);
    }

    /**
     * Get catalogs grouped by type
     * @returns {Object} Catalogs grouped by type
     */
    getCatalogsByType() {
        const result = {};
        const types = ['movie', 'series', 'anime'];

        types.forEach(type => {
            result[type === 'anime' ? 'anime' : type === 'movie' ? 'movies' : 'series'] = 
                this.getAvailableCatalogs(type);
        });

        return result;
    }

    /**
     * Get Stremio manifest catalogs for current mode
     * @returns {Array} Stremio-compatible catalog definitions
     */
    getManifestCatalogs() {
        const currentMode = this.getCurrentMode();
        const availableCatalogs = this.getAvailableCatalogs();

        if (currentMode.id === 'search-only') {
            // Always provide a minimal search catalog for movies and series
            return [
                {
                    type: 'movie',
                    id: 'tvdb-movies',
                    name: 'TVDB - Movies (Search)',
                    extra: [{ name: 'search', isRequired: true }]
                },
                {
                    type: 'series',
                    id: 'tvdb-series',
                    name: 'TVDB - Series & Anime (Search)',
                    extra: [{ name: 'search', isRequired: true }]
                }
            ];
        } else {
            // For catalog mode, include all available catalogs
            return availableCatalogs.map(catalog => ({
                type: catalog.type,
                id: catalog.id,
                name: catalog.name,
                extra: catalog.extra
            }));
        }
    }

    /**
     * Get default toggle states for frontend
     * @returns {Object} Default toggle states by type
     */
    getDefaultToggles() {
        const catalogsByType = this.getCatalogsByType();
        const result = {};

        Object.entries(catalogsByType).forEach(([type, catalogs]) => {
            result[type] = {};
            catalogs.forEach(catalog => {
                result[type][catalog.id] = catalog.defaultEnabled;
            });
        });

        return result;
    }

    /**
     * Get UI configuration for frontend
     * @returns {Object} UI configuration
     */
    getUIConfig() {
        const currentMode = this.getCurrentMode();
        const catalogsByType = this.getCatalogsByType();

        return {
            mode: currentMode.id,
            features: currentMode.features,
            tabs: this.uiTabs,
            catalogs: catalogsByType,
            defaultToggles: this.getDefaultToggles(),
            icons: this.getIconMap(),
            tooltips: this.getTooltipMap()
        };
    }

    /**
     * Get icon mapping for all catalogs
     * @returns {Object} Icon mapping
     */
    getIconMap() {
        const iconMap = {};
        Object.values(this.catalogDefinitions).forEach(catalog => {
            iconMap[catalog.id] = catalog.icon;
        });
        return iconMap;
    }

    /**
     * Get tooltip mapping for all catalogs
     * @returns {Object} Tooltip mapping
     */
    getTooltipMap() {
        const tooltipMap = {};
        Object.values(this.catalogDefinitions).forEach(catalog => {
            tooltipMap[catalog.id] = catalog.tooltip;
        });
        return tooltipMap;
    }

    /**
     * Get catalog by ID
     * @param {string} catalogId - Catalog ID
     * @returns {Object|null} Catalog configuration
     */
    getCatalogById(catalogId) {
        return this.catalogDefinitions[catalogId] || null;
    }

    /**
     * Check if a specific catalog is available
     * @param {string} catalogId - Catalog ID
     * @returns {boolean} Whether catalog is available
     */
    isCatalogAvailable(catalogId) {
        const catalog = this.getCatalogById(catalogId);
        if (!catalog) return false;

        const apiKeyStatus = this.validateApiKeys();
        return catalog.requiredApiKeys.every(key => apiKeyStatus.configured[key]);
    }

    /**
     * Get app configuration for frontend
     * @param {Object} req - Express request object
     * @returns {Object} Complete app configuration
     */
    getAppConfig(req) {
        const { getBaseUrl } = require('../utils/urlBuilder');
        const baseUrl = getBaseUrl(req);
        const currentMode = this.getCurrentMode();
        const uiConfig = this.getUIConfig();

        // Only send the unique prefix for each mode; frontend will append the shared suffix and logo
        const description = currentMode.id === 'catalog'
            ? 'Stremio addon that delivers curated content catalogs and'
            : 'Stremio addon that delivers';

        return {
            version: require('../../package.json').version,
            mode: currentMode.id,
            isTmdbConfigured: currentMode.id === 'catalog',
            ui: {
                title: currentMode.id === 'catalog' ? 'TVDB Catalog' : 'TVDB Search',
                description,
                features: currentMode.id === 'catalog'
                    ? ['Movies', 'TV Series', 'Anime']
                    : ['Movies', 'TV Series', 'Anime'],
                tabs: uiConfig.tabs,
                catalogs: uiConfig.catalogs,
                defaultToggles: uiConfig.defaultToggles,
                icons: uiConfig.icons,
                tooltips: uiConfig.tooltips
            },
            manifestUrlTemplate: `${baseUrl}/{{LANG}}/manifest.json`,
            supportedTypes: ['movie', 'series'],
            features: {
                catalogCustomization: currentMode.id === 'catalog',
                languageSelection: true,
                metadataEnhancement: true,
                caching: true,
                advancedConfig: currentMode.id === 'catalog'
            },
            apiKeyStatus: currentMode.apiKeyStatus
        };
    }

    /**
     * Log current configuration status
     * @param {Object} logger - Logger instance
     */
    logStatus(logger = console) {
        const currentMode = this.getCurrentMode();
        const apiValidation = currentMode.apiKeyStatus;

        logger.info?.('🏭 Catalog Configuration Status:');
        logger.info?.(`   Mode: ${currentMode.name} (${currentMode.id})`);
        logger.info?.(`   Features: ${currentMode.features.join(', ')}`);
        
        envValidator.logValidationResults(apiValidation, logger);

        const availableCatalogs = this.getAvailableCatalogs();
        logger.info?.(`📚 Available Catalogs: ${availableCatalogs.length}`);
        availableCatalogs.forEach(catalog => {
            logger.debug?.(`   - ${catalog.name} (${catalog.type})`);
        });
    }
}

module.exports = new CatalogConfig();
