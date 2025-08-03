const packageJson = require('../../package.json');
const { buildCatalogUrl, buildMetaUrl } = require('./urlBuilder');
const { isValidTvdbLanguage, getDisplayName, DEFAULT_LANGUAGE } = require('./languageMap');
const catalogConfig = require('../config/catalogConfig');

function getManifest(tvdbLanguage = DEFAULT_LANGUAGE, req) {
    const isValidLanguage = isValidTvdbLanguage(tvdbLanguage);
    const finalLanguage = isValidLanguage ? tvdbLanguage : DEFAULT_LANGUAGE;
    const languageDisplayName = getDisplayName(finalLanguage);
    
    const currentMode = catalogConfig.getCurrentMode();
    const mode = currentMode.id;
    
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
    
    manifest.catalogs = catalogConfig.getManifestCatalogs();
    
    return manifest;
}

module.exports = {
    getManifest
};
