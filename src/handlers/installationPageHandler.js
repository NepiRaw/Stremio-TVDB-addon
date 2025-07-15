const { generateInstallationPage } = require('../templates/installationPage');

/**
 * Handle installation page requests
 * Route: /
 */
async function installationPageHandler(req, res) {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const manifestUrl = `${baseUrl}/manifest.json`;
        
        const html = generateInstallationPage(manifestUrl);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Error serving installation page:', error);
        res.status(500).send('Internal Server Error');
    }
}

module.exports = installationPageHandler;
