const fs = require('fs');
const path = require('path');
const packageJson = require('../../package.json');
const { buildManifestUrl } = require('../utils/urlBuilder');

async function installationPageHandler(req, res, logger = null) {
    try {
        const htmlPath = path.join(__dirname, '../../public/index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        const { getBaseUrl } = require('../utils/urlBuilder');
        const baseUrl = getBaseUrl(req);
        
        const isTmdbConfigured = !!(process.env.TMDB_API_KEY && process.env.TMDB_API_KEY.trim() !== '');
        const title = isTmdbConfigured ? 'TVDB Catalog' : 'TVDB Search';
        const manifestUrlTemplate = `${baseUrl}/{{LANG}}/manifest.json`;
        
        html = html.replace('{{TITLE}}', title);
        html = html.replace('{{VERSION}}', packageJson.version);
        html = html.replace('{{MANIFEST_URL}}', manifestUrlTemplate);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        logger?.error('Error serving installation page:', error);
        res.status(500).send('Internal Server Error');
    }
}

module.exports = installationPageHandler;
