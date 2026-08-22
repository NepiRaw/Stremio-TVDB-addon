const { logger } = require('./logger');

function errorHandler(err, req, res, next) {
    logger.child('HTTP').error(`unhandled error → ${err.message}`);
    if (process.env.NODE_ENV === 'development') logger.child('HTTP').debug(err.stack);
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
        error: 'Internal Server Error',
        ...(isDevelopment && { details: err.message, stack: err.stack })
    });
}

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * A request that never received an HTTP response: timeout, DNS failure, refused connection.
 * The answer is unknown rather than absent, so callers must not cache it as a negative result.
 */
function isTransportError(error) {
    return Boolean(error) && !error.response;
}

function reportUpstreamError(logger, subject, error) {
    if (error?.response?.status === 404) {
        logger?.debug?.(`${subject} → not found`);
        return;
    }
    logger?.error?.(`${subject} → ${error?.response?.data?.message || error?.message}`);
}

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
    isTransportError,
    reportUpstreamError,
    TVDBError,
    ValidationError
};
