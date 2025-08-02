const { DEFAULT_LANGUAGE } = require('./languageMap');

function getBaseUrl(req) {
    const envBaseUrl = process.env.BASE_URL;
    if (envBaseUrl && envBaseUrl.trim()) {
        let baseUrl = envBaseUrl.trim().replace(/\/$/, '');
        
        if (baseUrl.includes('localhost') && !baseUrl.match(/:\d+$/)) {
            const port = process.env.PORT || 3000;
            baseUrl = `${baseUrl}:${port}`;
        }
        
        return baseUrl;
    }
    
    const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'http';
    const host = req.get('X-Forwarded-Host') || req.get('Host') || 'localhost:3000';
    
    const forwardedPrefix = req.get('X-Forwarded-Prefix') || '';
    
    return `${protocol}://${host}${forwardedPrefix}`.replace(/\/$/, '');
}

function buildManifestUrl(req, language = null) {
    const baseUrl = getBaseUrl(req);
    if (language && language !== DEFAULT_LANGUAGE) {
        return `${baseUrl}/${language}/manifest.json`;
    }
    return `${baseUrl}/manifest.json`;
}

function buildCatalogUrl(req, type, id, language = null) {
    const baseUrl = getBaseUrl(req);
    if (language && language !== DEFAULT_LANGUAGE) {
        return `${baseUrl}/${language}/catalog/${type}/${id}`;
    }
    return `${baseUrl}/catalog/${type}/${id}`;
}

function buildMetaUrl(req, type, language = null) {
    const baseUrl = getBaseUrl(req);
    if (language && language !== DEFAULT_LANGUAGE) {
        return `${baseUrl}/${language}/meta/${type}`;
    }
    return `${baseUrl}/meta/${type}`;
}

function getAddonInfo(req) {
    const baseUrl = getBaseUrl(req);
    const isProduction = !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');
    
    const hasForwardedHeaders = !!(
        req.get('X-Forwarded-Proto') || 
        req.get('X-Forwarded-Host') || 
        req.get('X-Forwarded-Prefix') || 
        req.get('X-Forwarded-For')
    );

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
