/**
 * Environment Variable Validation Utility
 * Provides checking for environment variables, including placeholder detection
 */

class EnvValidator {
    constructor() {
        this.defaultPlaceholderPatterns = [
            /^your_/i,                          // e.g., your_tvdb_api_key_here
            /^your[_-]/i,                       // e.g., your-api-key-here
            /<[^>]+>/,                          // e.g., <username>, <password>
            /\{\{[^}]+\}\}/,                    // e.g., {{API_KEY}}
            /\$\{[^}]+\}/,                      // e.g., ${API_KEY}
            /^example[_-]/i,                    // e.g., example_api_key
            /^placeholder[_-]/i,                // e.g., placeholder_value
            /^sample[_-]/i,                     // e.g., sample_key
            /^test[_-]/i,                       // e.g., test_api_key
            /^demo[_-]/i,                       // e.g., demo_value
            /^(null|undefined|none|empty)$/i,   // Common placeholder words
            /^[x]+$/i,                          // e.g., XXXXXXXX
            /^\*+$/,                            // e.g., ********
            /^-+$/,                             // e.g., --------
        ];
    }

    isEnvVarConfigured(varName, options = {}) {
        const {
            extraPatterns = [],
            allowEmpty = false,
            minLength = 0,
            customInvalidValues = []
        } = options;

        const value = process.env[varName];

        if (value === undefined || value === null) { // Check if variable exists
            return false;
        }

        if (!allowEmpty && value.trim() === '') { // Check if empty (unless allowed)
            return false;
        }

        if (minLength > 0 && value.length < minLength) { // Check minimum length
            return false;
        }

        if (customInvalidValues.includes(value)) { // Check against custom invalid values
            return false;
        }

        const allPatterns = [...this.defaultPlaceholderPatterns, ...extraPatterns];

        return !allPatterns.some(pattern => pattern.test(value));
    }

    validateMultiple(vars) {
        const results = {};
        const configured = {};
        const missing = [];
        const placeholders = [];

        Object.entries(vars).forEach(([varName, requirements]) => {
            const isConfigured = this.isEnvVarConfigured(varName, requirements);
            results[varName] = isConfigured;
            configured[varName] = isConfigured;

            if (!isConfigured) {
                const value = process.env[varName];
                if (!value || value.trim() === '') {
                    missing.push(varName);
                } else {
                    placeholders.push(varName);
                }
            }
        });

        return {
            results,
            configured,
            missing,
            placeholders,
            allConfigured: Object.values(results).every(Boolean),
            summary: {
                total: Object.keys(vars).length,
                configured: Object.values(results).filter(Boolean).length,
                missing: missing.length,
                placeholders: placeholders.length
            }
        };
    }

    getEnvVarStatus(varName, options = {}) {
        const value = process.env[varName];
        const isConfigured = this.isEnvVarConfigured(varName, options);

        let status = 'not-set';
        let message = `${varName} is not set`;

        if (value !== undefined && value !== null) {
            if (value.trim() === '') {
                status = 'empty';
                message = `${varName} is empty`;
            } else if (!isConfigured) {
                status = 'placeholder';
                message = `${varName} appears to be a placeholder value`;
            } else {
                status = 'configured';
                message = `${varName} is properly configured`;
            }
        }

        return {
            varName,
            value: value ? (isConfigured ? '[CONFIGURED]' : value) : null,
            isConfigured,
            status,
            message
        };
    }

    logValidationResults(validation, logger = console) {
        const { configured, missing, placeholders, summary } = validation;

        logger.info?.(`🔍 Environment Variables Validation:`);
        logger.info?.(`   Total: ${summary.total}, Configured: ${summary.configured}, Missing: ${summary.missing}, Placeholders: ${summary.placeholders}`);

        if (missing.length > 0) {
            logger.warn?.(`⚠️  Missing variables: ${missing.join(', ')}`);
        }

        if (placeholders.length > 0) {
            logger.warn?.(`🏷️  Placeholder values detected: ${placeholders.join(', ')}`);
        }

        if (summary.configured === summary.total) {
            logger.info?.(`✅ All environment variables are properly configured`);
        }
    }
}

module.exports = new EnvValidator();
