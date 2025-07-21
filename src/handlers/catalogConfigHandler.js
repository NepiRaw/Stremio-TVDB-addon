/**
 * Catalog Configuration Handler
 * Handles catalog configuration API endpoints
 */

const CATALOG_CONFIG = require('../config/catalogConfig');

class CatalogConfigHandler {
    constructor(catalogService) {
        this.catalogService = catalogService;
    }

    /**
     * Handle GET /api/catalog-config
     * Returns current catalog configuration
     */
    async getCatalogConfig(req, res) {
        try {
            const config = this.catalogService.getCatalogConfig();
            
            res.status(200).json({
                success: true,
                config: config,
                stats: {
                    enabled: this.catalogService.getEnabledCatalogs().length,
                    total: this.catalogService.getAllCatalogIds().length
                }
            });
        } catch (error) {
            console.error('Error getting catalog config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle POST /api/catalog-config
     * Updates catalog configuration
     */
    async updateCatalogConfig(req, res) {
        try {
            const { config } = req.body;
            
            if (!config) {
                return res.status(400).json({
                    success: false,
                    error: 'Configuration is required'
                });
            }

            // Validate configuration structure
            const validationError = this.validateConfig(config);
            if (validationError) {
                return res.status(400).json({
                    success: false,
                    error: validationError
                });
            }

            const updatedConfig = this.catalogService.updateCatalogConfig(config);
            
            res.status(200).json({
                success: true,
                message: 'Catalog configuration updated successfully',
                config: updatedConfig,
                stats: {
                    enabled: this.catalogService.getEnabledCatalogs().length,
                    total: this.catalogService.getAllCatalogIds().length
                }
            });
        } catch (error) {
            console.error('Error updating catalog config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle DELETE /api/catalog-config
     * Resets catalog configuration to defaults
     */
    async resetCatalogConfig(req, res) {
        try {
            const defaultConfig = this.catalogService.resetCatalogConfig();
            
            res.status(200).json({
                success: true,
                message: 'Catalog configuration reset to defaults',
                config: defaultConfig,
                stats: {
                    enabled: this.catalogService.getEnabledCatalogs().length,
                    total: this.catalogService.getAllCatalogIds().length
                }
            });
        } catch (error) {
            console.error('Error resetting catalog config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle GET /api/catalog-status
     * Returns service status and statistics
     */
    async getCatalogStatus(req, res) {
        try {
            const stats = this.catalogService.getStats();
            
            res.status(200).json({
                success: true,
                status: 'operational',
                stats: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error getting catalog status:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                status: 'error'
            });
        }
    }

    /**
     * Validate catalog configuration structure
     */
    validateConfig(config) {
        if (!config || typeof config !== 'object') {
            return 'Configuration must be an object';
        }

        // Check required types
        const requiredTypes = ['movies', 'series'];
        for (const type of requiredTypes) {
            if (!config[type] || !Array.isArray(config[type])) {
                return `Configuration must include ${type} array`;
            }

            // Validate each catalog in the type
            for (const catalog of config[type]) {
                const error = this.validateCatalogItem(catalog, type);
                if (error) {
                    return `Invalid ${type} catalog: ${error}`;
                }
            }
        }

        return null; // No validation errors
    }

    /**
     * Validate individual catalog item
     */
    validateCatalogItem(catalog, type) {
        if (!catalog || typeof catalog !== 'object') {
            return 'Catalog must be an object';
        }

        // Required fields from shared configuration
        const requiredFields = CATALOG_CONFIG.validation.requiredFields;
        for (const field of requiredFields) {
            if (!(field in catalog)) {
                return `Missing required field: ${field}`;
            }
        }

        // Validate field types
        if (typeof catalog.id !== 'string' || !catalog.id.trim()) {
            return 'ID must be a non-empty string';
        }

        if (typeof catalog.name !== 'string' || !catalog.name.trim()) {
            return 'Name must be a non-empty string';
        }

        if (typeof catalog.category !== 'string' || !catalog.category.trim()) {
            return 'Category must be a non-empty string';
        }

        if (typeof catalog.enabled !== 'boolean') {
            return 'Enabled must be a boolean';
        }

        // Validate order field using shared configuration
        if (typeof catalog.order !== 'number' || catalog.order < CATALOG_CONFIG.validation.minOrder || catalog.order > CATALOG_CONFIG.validation.maxOrder) {
            return `Order must be a number between ${CATALOG_CONFIG.validation.minOrder} and ${CATALOG_CONFIG.validation.maxOrder}`;
        }

        // Validate ID format
        const expectedPrefix = type === 'movies' ? 'movie-' : 'series-';
        if (!catalog.id.startsWith(expectedPrefix)) {
            return `ID must start with '${expectedPrefix}'`;
        }

        // Validate category using shared configuration
        if (!CATALOG_CONFIG.validation.validCategories.includes(catalog.category)) {
            return `Category must be one of: ${CATALOG_CONFIG.validation.validCategories.join(', ')}`;
        }

        return null; // No validation errors
    }

    /**
     * Get all route handlers for Express router
     */
    getRoutes() {
        return {
            // GET /api/catalog-config
            getCatalogConfig: (req, res) => this.getCatalogConfig(req, res),
            
            // POST /api/catalog-config
            updateCatalogConfig: (req, res) => this.updateCatalogConfig(req, res),
            
            // DELETE /api/catalog-config
            resetCatalogConfig: (req, res) => this.resetCatalogConfig(req, res),
            
            // GET /api/catalog-status
            getCatalogStatus: (req, res) => this.getCatalogStatus(req, res)
        };
    }
}

module.exports = CatalogConfigHandler;
