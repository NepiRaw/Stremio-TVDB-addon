const packageJson = require('../../package.json');

/**
 * Generate Stremio addon manifest
 */
function getManifest() {
    return {
        id: 'org.stremio.tvdb-addon',
        version: packageJson.version,
        name: 'TVDB Catalog',
        description: 'Search TVDB for movies, series, and anime. Provides comprehensive catalog search functionality.',
        
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
        
        // Additional metadata
        contactEmail: 'addon@example.com',
        logo: 'https://thetvdb.com/images/logo.png',
        background: 'https://thetvdb.com/images/background.jpg'
    };
}

module.exports = {
    getManifest
};
