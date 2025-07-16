/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
    console.error('❌ Unhandled error:', err.stack);
    
    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
        error: 'Internal Server Error',
        ...(isDevelopment && { details: err.message, stack: err.stack })
    });
}

/**
 * Async wrapper to catch async route handler errors
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Custom error classes
 */
class TVDBError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'TVDBError';
        this.statusCode = statusCode;
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
    }
}

module.exports = {
    errorHandler,
    asyncHandler,
    TVDBError,
    ValidationError
};
