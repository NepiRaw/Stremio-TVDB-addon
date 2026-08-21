
const { logger } = require('./logger');
/**
 * IMDB ID filtering utilities for content quality and stream compatibility
 * 
 * Key principle: Only show content with IMDB IDs since stream addons require them
 * for proper content matching and stream discovery.
 * 
 * Additional quality gate: Only show content with poster artwork to ensure
 * good visual presentation and indicate complete metadata.
 */


// TVDB serves a "missing artwork" placeholder URL
const PLACEHOLDER_IMAGE = /\/images\/missing\//;

function isUsableImage(url) {
    return typeof url === 'string' && url.trim().length > 0 && !PLACEHOLDER_IMAGE.test(url);
}

function hasValidPoster(item) {
    if (!item) return false;

    // image_url is the /search shape; the others are the detail/extended shapes.
    const directSources = [
        item.poster, item.image, item.image_url,
        item.posterUrl, item.thumbnailUrl, item.imageUrl
    ];

    if (directSources.some(isUsableImage)) {
        return true;
    }

    if (Array.isArray(item.artworks)) {
        // Type 2 = series poster, Type 14 = movie poster, Type 15 = movie cover
        return item.artworks.some(artwork =>
            [2, 14, 15].includes(artwork.type) && isUsableImage(artwork.image)
        );
    }

    return false;
}

// Detail/extended endpoints return remoteIds; /search returns the same shape as remote_ids.
function getRemoteIds(item) {
    return item.remoteIds || item.remote_ids || null;
}

function extractImdbId(item) {
    if (!item) return null;

    const remoteIds = getRemoteIds(item);
    if (Array.isArray(remoteIds)) {
        const imdbRemote = remoteIds.find(remote =>
            remote.sourceName?.toLowerCase() === 'imdb' ||
            remote.type === 2 || // IMDB type in TVDB
            (remote.id && remote.id.toString().startsWith('tt'))
        );

        if (imdbRemote && imdbRemote.id) {
            const id = imdbRemote.id.toString();
            return id.startsWith('tt') ? id : `tt${id}`;
        }
    }

    if (item.imdb && typeof item.imdb === 'string') {
        return item.imdb.startsWith('tt') ? item.imdb : `tt${item.imdb}`;
    }

    return null;
}

function hasValidImdbId(item) {
    const imdbId = extractImdbId(item);
    return !!(imdbId && imdbId.length >= 9); // tt + 7 digits minimum
}

function hasValidQualityMetadata(item) {
    return hasValidImdbId(item) && hasValidPoster(item);
}

/**
 * Filter search results to only include items with IMDB IDs and posters
 * This ensures all content can be properly matched by stream addons and looks good in UI
 * 
 * @param {Array} searchResults - TVDB search results
 * @returns {Array} Filtered results containing only high-quality items
 */
function filterByImdbRequirement(searchResults) {
    if (!searchResults || !Array.isArray(searchResults)) {
        return [];
    }
    
    return searchResults.filter(item => {
        const hasImdb = hasValidImdbId(item);
        const hasPoster = hasValidPoster(item);
        if (!hasImdb && !hasPoster) {
            logger.info(`🚫 Filtering out "${item.name}" (${item.id}) - No IMDB ID or poster`);
        } else if (!hasImdb) {
            logger.info(`🚫 Filtering out "${item.name}" (${item.id}) - No IMDB ID`);
        } else if (!hasPoster) {
            logger.info(`🚫 Filtering out "${item.name}" (${item.id}) - No poster artwork`);
        }
        return hasImdb && hasPoster;
    });
}

/**
 * Filter detailed content items to only include those with IMDB IDs and posters
 * Used during content transformation to ensure stream compatibility and visual quality
 * 
 * @param {Array} detailedItems - Array of detailed TVDB items
 * @returns {Array} Filtered items with complete metadata only
 */
function filterDetailedByImdbRequirement(detailedItems) {
    if (!detailedItems || !Array.isArray(detailedItems)) {
        return [];
    }
    
    return detailedItems.filter(item => {
        const hasImdb = hasValidImdbId(item);
        const hasPoster = hasValidPoster(item);
        if (!hasImdb && !hasPoster) {
            logger.info(`🚫 Filtering out detailed item "${item.name}" - No IMDB ID or poster`);
        } else if (!hasImdb) {
            logger.info(`🚫 Filtering out detailed item "${item.name}" - No IMDB ID for stream compatibility`);
        } else if (!hasPoster) {
            logger.info(`🚫 Filtering out detailed item "${item.name}" - No poster for visual quality`);
        }
        return hasImdb && hasPoster;
    });
}

function validateImdbRequirement(item, itemType = 'content') {
    if (!item) {
        logger.info(`⚠️ Cannot validate null ${itemType}`);
        return false;
    }
    const hasImdb = hasValidImdbId(item);
    const hasPoster = hasValidPoster(item);
    if (!hasImdb && !hasPoster) {
        logger.info(`🚫 Rejecting ${itemType} "${item.name}" - No IMDB ID or poster, poor quality metadata`);
        return false;
    } else if (!hasImdb) {
        logger.info(`🚫 Rejecting ${itemType} "${item.name}" - No IMDB ID, streams won't be available`);
        return false;
    } else if (!hasPoster) {
        logger.info(`🚫 Rejecting ${itemType} "${item.name}" - No poster, poor visual presentation`);
        return false;
    }
    const imdbId = extractImdbId(item);
    return true;
}

module.exports = {
    hasValidImdbId,
    hasValidPoster,
    hasValidQualityMetadata,
    isUsableImage,
    extractImdbId,
    filterByImdbRequirement,
    filterDetailedByImdbRequirement,
    validateImdbRequirement
};
