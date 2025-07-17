const packageJson = require('../../package.json');
const { buildCatalogUrl, buildMetaUrl } = require('./urlBuilder');

/**
 * Generate Stremio addon manifest with TVDB language support
 */
function getManifest(tvdbLanguage = 'eng', req) {
    // Map TVDB language codes to human-readable names
    const languageNames = {
        'eng': 'English',
        'fra': 'Français',
        'spa': 'Español', 
        'deu': 'Deutsch',
        'ita': 'Italiano',
        'por': 'Português',
        'jpn': '日本語',
        'kor': '한국어',
        'chi': '中文',
        'rus': 'Русский',
        'ara': 'العربية'
    };
    
    // Validate TVDB language code
    const isValidTvdbLanguage = /^[a-z]{3}$/.test(tvdbLanguage) && languageNames[tvdbLanguage];
    const finalLanguage = isValidTvdbLanguage ? tvdbLanguage : 'eng';
    const languageDisplayName = languageNames[finalLanguage] || 'English';
    
    return {
        id: `community.stremio.tvdb-addon-${finalLanguage}`,
        version: packageJson.version,
        name: `TVDB Catalog (${languageDisplayName})`,
        description: `Search TVDB for movies, series, and anime with ${languageDisplayName} language preference. Provides comprehensive catalog search functionality with metadata in your preferred language.`,
        
        // Resources this addon provides
        resources: ['catalog', 'meta'],
        
        // Content types supported
        types: ['movie', 'series'],
        
        // Catalog definitions - search-only catalogs
        catalogs: [
            {
                type: 'movie',
                id: 'tvdb-movies',
                name: 'Movies',
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
                name: 'Series & Anime',
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
        
        // Additional metadata
        contactEmail: 'addon@example.com',
        logo: 'https://thetvdb.com/images/logo.png',
        background: 'https://thetvdb.com/images/background.jpg'
    };
}

module.exports = {
    getManifest
};
