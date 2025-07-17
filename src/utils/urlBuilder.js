/**
 * URL Builder Utility
 * Handles dynamic URL generation for production deployments behind reverse proxies
 */

/**
 * Get the base URL for the addon from environment or request
 * @param {Object} req - Express request object
 * @returns {string} Base URL without trailing slash
 */
function getBaseUrl(req) {
    // 1. Check if BASE_URL is explicitly set in environment
    const envBaseUrl = process.env.BASE_URL;
    if (envBaseUrl && envBaseUrl.trim()) {
        let baseUrl = envBaseUrl.trim().replace(/\/$/, ''); // Remove trailing slash
        
        // If BASE_URL doesn't include a port and we're in development, add the PORT
        if (baseUrl.includes('localhost') && !baseUrl.match(/:\d+$/)) {
            const port = process.env.PORT || 3000;
            baseUrl = `${baseUrl}:${port}`;
        }
        
        return baseUrl;
    }
    
    // 2. Auto-detect from request headers (reverse proxy aware)
    const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
    const host = req.get('X-Forwarded-Host') || req.get('Host') || 'localhost:3000';
    
    // Handle X-Forwarded-Prefix for subpath deployments
    const forwardedPrefix = req.get('X-Forwarded-Prefix') || '';
    
    return `${protocol}://${host}${forwardedPrefix}`.replace(/\/$/, '');
}

/**
 * Build manifest URL for the addon
 * @param {Object} req - Express request object
 * @param {string} language - Language code (optional)
 * @returns {string} Complete manifest URL
 */
function buildManifestUrl(req, language = null) {
    const baseUrl = getBaseUrl(req);
    if (language && language !== 'eng') {
        return `${baseUrl}/${language}/manifest.json`;
    }
    return `${baseUrl}/manifest.json`;
}

/**
 * Build catalog URL for the addon
 * @param {Object} req - Express request object
 * @param {string} type - Content type (movie/series)
 * @param {string} id - Catalog ID
 * @param {string} language - Language code (optional)
 * @returns {string} Complete catalog URL pattern
 */
function buildCatalogUrl(req, type, id, language = null) {
    const baseUrl = getBaseUrl(req);
    if (language && language !== 'eng') {
        return `${baseUrl}/${language}/catalog/${type}/${id}`;
    }
    return `${baseUrl}/catalog/${type}/${id}`;
}

/**
 * Build meta URL for the addon
 * @param {Object} req - Express request object
 * @param {string} type - Content type (movie/series)
 * @param {string} language - Language code (optional)
 * @returns {string} Complete meta URL pattern
 */
function buildMetaUrl(req, type, language = null) {
    const baseUrl = getBaseUrl(req);
    if (language && language !== 'eng') {
        return `${baseUrl}/${language}/meta/${type}`;
    }
    return `${baseUrl}/meta/${type}`;
}

/**
 * Get addon info for display purposes
 * @param {Object} req - Express request object
 * @returns {Object} Addon deployment info
 */
function getAddonInfo(req) {
    const baseUrl = getBaseUrl(req);
    const isProduction = !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');
    
    // Detect if we're behind a reverse proxy by checking for forwarded headers
    const hasForwardedHeaders = !!(
        req.get('X-Forwarded-Proto') || 
        req.get('X-Forwarded-Host') || 
        req.get('X-Forwarded-Prefix') || 
        req.get('X-Forwarded-For')
    );
    
    // Detect subpath deployment by comparing request path with base URL
    const isSubPath = hasForwardedHeaders || baseUrl.split('/').length > 3;
    
    return {
        baseUrl,
        isProduction,
        isSubPath,
        manifestUrl: buildManifestUrl(req),
        installUrl: baseUrl + '/'
    };
}

module.exports = {
    getBaseUrl,
    buildManifestUrl,
    buildCatalogUrl,
    buildMetaUrl,
    getAddonInfo
};
