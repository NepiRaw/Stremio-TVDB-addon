const fs = require('fs');
const path = require('path');
const packageJson = require('../../package.json');
const { buildManifestUrl } = require('../utils/urlBuilder');

/**
 * Handle installation page requests
 * Route: /
 */
async function installationPageHandler(req, res) {
    try {
        // Read the static HTML file
        const htmlPath = path.join(__dirname, '../../public/index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        
        // Get the base URL for building manifest URLs
        const { getBaseUrl } = require('../utils/urlBuilder');
        const baseUrl = getBaseUrl(req);
        const manifestUrlTemplate = `${baseUrl}/{{LANG}}/manifest.json`;
        
        // Replace template variables in the HTML
        html = html.replace('{{VERSION}}', packageJson.version);
        html = html.replace('{{MANIFEST_URL}}', manifestUrlTemplate);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Error serving installation page:', error);
        res.status(500).send('Internal Server Error');
    }
}

module.exports = installationPageHandler;
