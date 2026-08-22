/**
 * Search catalog configuration
 * The addon serves two search-only catalogs. Both are advertised in the manifest and
 * both are accepted by catalogHandler; a change here must be matched there.
 */

const envValidator = require('../utils/envValidator');

const SEARCH_CATALOGS = [
    { type: 'movie', id: 'tvdb-movies', name: 'TVDB - Movies (Search)' },
    { type: 'series', id: 'tvdb-series', name: 'TVDB - Series & Anime (Search)' }
];

const API_KEY_VALIDATION = {
    'TVDB_API_KEY': {
        required: true,
        description: 'TVDB API key from thetvdb.com'
    }
};

class CatalogConfig {
    /**
     * Catalogs for the manifest. Freshly built each call, since callers own the result.
     */
    getManifestCatalogs() {
        return SEARCH_CATALOGS.map(catalog => ({
            ...catalog,
            extra: [{ name: 'search', isRequired: true }]
        }));
    }

    getAppConfig(req) {
        const { getBaseUrl } = require('../utils/urlBuilder');

        return {
            version: require('../../package.json').version,
            ui: {
                title: 'TVDB Search',
                // The frontend appends the shared suffix and the logo.
                description: 'Stremio addon that delivers',
                features: ['Movies', 'TV Series', 'Anime']
            },
            manifestUrlTemplate: `${getBaseUrl(req)}/{{LANG}}/manifest.json`,
            supportedTypes: ['movie', 'series'],
            features: {
                languageSelection: true,
                metadataEnhancement: true,
                caching: true
            }
        };
    }

    logStatus(logger = console) {
        logger.info?.(`🏭 Search only · ${SEARCH_CATALOGS.length} catalogs · search, metadata`);
        SEARCH_CATALOGS.forEach(catalog => logger.debug?.(`   - ${catalog.name} (${catalog.type})`));

        envValidator.logValidationResults(envValidator.validateMultiple(API_KEY_VALIDATION), logger);
    }
}

module.exports = new CatalogConfig();
