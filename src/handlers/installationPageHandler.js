const fs = require('fs');
const path = require('path');
const packageJson = require('../../package.json');
const { buildManifestUrl } = require('../utils/urlBuilder');
const catalogConfig = require('../config/catalogConfig');

async function installationPageHandler(req, res, logger = null) {
    try {
        const htmlPath = path.join(__dirname, '../../frontend/public/index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        const { getBaseUrl } = require('../utils/urlBuilder');
        const baseUrl = getBaseUrl(req);
        
        const currentMode = catalogConfig.getCurrentMode();
        const title = currentMode.id === 'catalog' ? 'TVDB Catalog' : 'TVDB Search';
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
