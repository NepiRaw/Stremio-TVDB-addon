/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
    const start = Date.now();
    const timestamp = new Date().toISOString();
    
    // Log the request
    console.log(`📥 ${timestamp} ${req.method} ${req.url}`);
    
    // Log the response when it finishes
    res.on('finish', () => {
        const duration = Date.now() - start;
        const statusEmoji = res.statusCode >= 400 ? '❌' : '✅';
        console.log(`📤 ${statusEmoji} ${res.statusCode} ${req.method} ${req.url} - ${duration}ms`);
    });
    
    next();
}

/**
 * Enhanced console logging with timestamps and levels
 */
const logger = {
    info: (message, ...args) => {
        console.log(`ℹ️  ${new Date().toISOString()} [INFO] ${message}`, ...args);
    },
    
    error: (message, ...args) => {
        console.error(`❌ ${new Date().toISOString()} [ERROR] ${message}`, ...args);
    },
    
    warn: (message, ...args) => {
        console.warn(`⚠️  ${new Date().toISOString()} [WARN] ${message}`, ...args);
    },
    
    debug: (message, ...args) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`🐛 ${new Date().toISOString()} [DEBUG] ${message}`, ...args);
        }
    },
    
    success: (message, ...args) => {
        console.log(`✅ ${new Date().toISOString()} [SUCCESS] ${message}`, ...args);
    }
};

module.exports = {
    requestLogger,
    logger
};
