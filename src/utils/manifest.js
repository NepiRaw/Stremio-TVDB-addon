const packageJson = require('../../package.json');

/**
 * Generate Stremio addon manifest with language support
 */
function getManifest(language = 'en-US') {
    // Validate language code format
    const isValidLanguage = /^[a-z]{2}-[A-Z]{2}$/.test(language);
    const finalLanguage = isValidLanguage ? language : 'en-US';
    
    return {
        id: `community.stremio.tvdb-addon-${finalLanguage}`,
        version: packageJson.version,
        name: `TVDB Catalog (${finalLanguage})`,
        description: `Search TVDB for movies, series, and anime with ${finalLanguage} language preference. Provides comprehensive catalog search functionality with metadata in your preferred language.`,
        
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
        
        // ID prefixes for content this addon handles
        idPrefixes: ['tvdb-'],
        
        // Behavior hints
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
