const packageJson = require('../../package.json');
const { buildCatalogUrl, buildMetaUrl } = require('./urlBuilder');

/**
 * Generate Stremio addon manifest with TVDB language support and dynamic catalog configuration
 */
function getManifest(tvdbLanguage = 'eng', req, catalogService, configString) {
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
    
    // Build catalog list
    const catalogs = [];
    
    // Always include legacy search-based catalogs
    catalogs.push(
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
    );
    
    // Add dynamic browsable catalogs if catalog service is available
    if (catalogService) {
        try {
            const enabledCatalogs = catalogService.getEnabledCatalogs(configString);
            catalogs.push(...enabledCatalogs);
        } catch (error) {
            console.warn('Failed to get enabled catalogs:', error.message);
        }
    }
    
    return {
        id: `community.stremio.tvdb-addon-${finalLanguage}`,
        version: packageJson.version,
        name: `TVDB Catalog (${languageDisplayName})`,
        description: `Search TVDB and browse popular content with ${languageDisplayName} language preference. Provides comprehensive search and browsable catalogs with metadata in your preferred language.`,
        
        // Resources this addon provides
        resources: ['catalog', 'meta'],
        
        // Content types supported
        types: ['movie', 'series'],
        
        // ID prefixes this addon can handle
        idPrefixes: ['tvdb-', 'tt'],
        
        // Dynamic catalog definitions
        catalogs: catalogs,
        
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
