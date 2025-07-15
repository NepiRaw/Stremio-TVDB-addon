const fs = require('fs');
const path = require('path');
const packageJson = require('../../package.json');

/**
 * Handle installation page requests
 * Route: /
 */
async function installationPageHandler(req, res) {
    try {
        const htmlPath = path.join(__dirname, '../../public/index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        
        // Replace template variables
        html = html.replace('{{VERSION}}', packageJson.version);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Error serving installation page:', error);
        res.status(500).send('Internal Server Error');
    }
}

module.exports = installationPageHandler;
