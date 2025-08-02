const packageJson = require('../../package.json');
const { buildCatalogUrl, buildMetaUrl } = require('./urlBuilder');
const { isValidTvdbLanguage, getDisplayName, DEFAULT_LANGUAGE } = require('./languageMap');

function getManifest(tvdbLanguage = DEFAULT_LANGUAGE, req) {
    const isValidLanguage = isValidTvdbLanguage(tvdbLanguage);
    const finalLanguage = isValidLanguage ? tvdbLanguage : DEFAULT_LANGUAGE;
    const languageDisplayName = getDisplayName(finalLanguage);
    
    return {
        id: `community.stremio.tvdb-addon-${finalLanguage}`,
        version: packageJson.version,
        name: `TVDB Search (${languageDisplayName})`,
        description: `Search TVDB for movies, series, and anime with ${languageDisplayName} language preference. Provides comprehensive catalog search functionality with metadata in your preferred language.`,
        
        resources: ['catalog', 'meta'],
        
        types: ['movie', 'series'],
        
        idPrefixes: ['tvdb-', 'tt'],
        
        // Catalog definitions - search-only catalogs
        catalogs: [
            {
                type: 'movie',
                id: 'tvdb-movies',
                name: 'TVDB - Movies (Search)',
                extra: [
                    {
                        name: 'search',
                        isRequired: true
                    }
                ]
            },
            {
                type: 'series',
                id: 'tvdb-series', 
                name: 'TVDB - Series & Anime (Search)',
                extra: [
                    {
                        name: 'search',
                        isRequired: true
                    }
                ]
            }
        ],
        
        behaviorHints: {
            configurable: false,
            configurationRequired: false
        },
        
        contactEmail: 'https://github.com/NepiRaw/Stremio-TVDB-addon',
        logo: 'https://thetvdb.com/images/logo.png',
        background: 'https://thetvdb.com/images/background.jpg'
    };
}

module.exports = {
    getManifest
};
