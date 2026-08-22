const packageJson = require('../../package.json');
const { buildCatalogUrl, buildMetaUrl } = require('./urlBuilder');
const { isValidTvdbLanguage, getDisplayName, DEFAULT_LANGUAGE } = require('./languageMap');
const catalogConfig = require('../config/catalogConfig');

function getManifest(tvdbLanguage = DEFAULT_LANGUAGE, req) {
    const isValidLanguage = isValidTvdbLanguage(tvdbLanguage);
    const finalLanguage = isValidLanguage ? tvdbLanguage : DEFAULT_LANGUAGE;
    const languageDisplayName = getDisplayName(finalLanguage);
    
    const manifest = {
        id: `community.stremio.tvdb-addon-${finalLanguage}`,
        version: packageJson.version,
        name: `TVDB Search (${languageDisplayName})`,
        description: `Search TVDB for movies, series, and anime with ${languageDisplayName} language preference. Provides comprehensive search functionality with metadata in your preferred language.`,
        
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        idPrefixes: ['tvdb-', 'tt'],
        
        behaviorHints: {
            configurable: false,
            configurationRequired: false
        },
        
        contactEmail: 'https://github.com/NepiRaw/Stremio-TVDB-addon',
        logo: 'https://thetvdb.com/images/logo.png',
        background: 'https://www.thetvdb.com/images/logo.svg'
    };
    
    manifest.catalogs = catalogConfig.getManifestCatalogs();
    
    return manifest;
}

module.exports = {
    getManifest
};
