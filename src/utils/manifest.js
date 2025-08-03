const packageJson = require('../../package.json');
const { buildCatalogUrl, buildMetaUrl } = require('./urlBuilder');
const { isValidTvdbLanguage, getDisplayName, DEFAULT_LANGUAGE } = require('./languageMap');

function getManifest(tvdbLanguage = DEFAULT_LANGUAGE, req) {
    const isValidLanguage = isValidTvdbLanguage(tvdbLanguage);
    const finalLanguage = isValidLanguage ? tvdbLanguage : DEFAULT_LANGUAGE;
    const languageDisplayName = getDisplayName(finalLanguage);
    
    // Determine addon mode based on Catalog API key presence
    const isTmdbConfigured = !!(process.env.TMDB_API_KEY && process.env.TMDB_API_KEY.trim() !== '');
    const mode = isTmdbConfigured ? 'catalog' : 'search-only';
    
    // Base manifest structure
    const manifest = {
        id: `community.stremio.tvdb-addon-${finalLanguage}`,
        version: packageJson.version,
        name: mode === 'catalog' 
            ? `TVDB Catalog (${languageDisplayName})`
            : `TVDB Search (${languageDisplayName})`,
        description: mode === 'catalog'
            ? `Browse curated catalogs and search TVDB for movies, series, and anime with ${languageDisplayName} language preference. Provides comprehensive catalog browsing and search functionality with metadata in your preferred language.`
            : `Search TVDB for movies, series, and anime with ${languageDisplayName} language preference. Provides comprehensive search functionality with metadata in your preferred language.`,
        
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        idPrefixes: ['tvdb-', 'tt'],
        
        behaviorHints: {
            configurable: mode === 'catalog',
            configurationRequired: false
        },
        
        contactEmail: 'https://github.com/NepiRaw/Stremio-TVDB-addon',
        logo: 'https://thetvdb.com/images/logo.png',
        background: 'https://thetvdb.com/images/background.jpg'
    };
    
    // Mode-specific catalog definitions
    if (mode === 'catalog') {
        manifest.catalogs = [
            {
                type: 'movie',
                id: 'tmdb-popular-movies',
                name: 'TVDB - Popular Movies',
                extra: [
                    { name: 'skip', isRequired: false }
                ]
            },
            {
                type: 'movie', 
                id: 'tmdb-trending-movies',
                name: 'TVDB - Trending Movies',
                extra: [
                    { name: 'skip', isRequired: false }
                ]
            },
            {
                type: 'series',
                id: 'tvdb-popular-series',
                name: 'TVDB - Popular Series',
                extra: [
                    { name: 'skip', isRequired: false }
                ]
            },
            {
                type: 'series',
                id: 'tvdb-trending-series', 
                name: 'TVDB - Trending Series',
                extra: [
                    { name: 'skip', isRequired: false }
                ]
            },
            // Search catalogs
            {
                type: 'movie',
                id: 'tvdb-movies-search',
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
                id: 'tvdb-series-search',
                name: 'TVDB - Series & Anime (Search)',
                extra: [
                    {
                        name: 'search',
                        isRequired: true
                    }
                ]
            }
        ];
    } else {
        // Search-only mode
        manifest.catalogs = [
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
        ];
    }
    
    return manifest;
}

module.exports = {
    getManifest
};
