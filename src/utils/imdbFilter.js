/**
 * IMDB ID filtering utilities for content quality and stream compatibility
 * 
 * Key principle: Only show content with IMDB IDs since stream addons require them
 * for proper content matching and stream discovery.
 */

/**
 * Check if a TVDB item has a valid IMDB ID
 * @param {Object} item - TVDB search result or detailed item
 * @returns {boolean} True if item has valid IMDB ID
 */
function hasValidImdbId(item) {
    if (!item) return false;
    
    // Check remoteIds array (most reliable method)
    if (item.remoteIds && Array.isArray(item.remoteIds)) {
        const imdbRemote = item.remoteIds.find(remote => 
            remote.sourceName?.toLowerCase() === 'imdb' || 
            remote.type === 2 || // IMDB type in TVDB
            (remote.id && remote.id.toString().startsWith('tt'))
        );
        
        if (imdbRemote && imdbRemote.id) {
            const id = imdbRemote.id.toString();
            return id.startsWith('tt') && id.length >= 9; // tt + 7 digits minimum
        }
    }
    
    // Check direct imdb field (fallback)
    if (item.imdb && typeof item.imdb === 'string') {
        const id = item.imdb;
        if (id.startsWith('tt')) {
            return id.length >= 9; // tt + 7 digits minimum
        } else if (/^\d{7,}$/.test(id)) {
            return true; // Numeric IMDB ID without tt prefix
        }
    }
    
    return false;
}

/**
 * Extract valid IMDB ID from TVDB item
 * @param {Object} item - TVDB item
 * @returns {string|null} IMDB ID with tt prefix or null if none
 */
function extractImdbId(item) {
    if (!item) return null;
    
    // Check remoteIds array (most reliable)
    if (item.remoteIds && Array.isArray(item.remoteIds)) {
        const imdbRemote = item.remoteIds.find(remote => 
            remote.sourceName?.toLowerCase() === 'imdb' || 
            remote.type === 2 ||
            (remote.id && remote.id.toString().startsWith('tt'))
        );
        
        if (imdbRemote && imdbRemote.id) {
            const id = imdbRemote.id.toString();
            return id.startsWith('tt') ? id : `tt${id}`;
        }
    }
    
    // Check direct imdb field
    if (item.imdb && typeof item.imdb === 'string') {
        const id = item.imdb;
        return id.startsWith('tt') ? id : `tt${id}`;
    }
    
    return null;
}

/**
 * Filter search results to only include items with IMDB IDs
 * This ensures all content can be properly matched by stream addons
 * 
 * @param {Array} searchResults - TVDB search results
 * @returns {Array} Filtered results containing only items with IMDB IDs
 */
function filterByImdbRequirement(searchResults) {
    if (!searchResults || !Array.isArray(searchResults)) {
        return [];
    }
    
    return searchResults.filter(item => {
        const hasImdb = hasValidImdbId(item);
        
        if (!hasImdb) {
            console.log(`🚫 Filtering out "${item.name}" (${item.id}) - No IMDB ID`);
        }
        
        return hasImdb;
    });
}

/**
 * Filter detailed content items to only include those with IMDB IDs
 * Used during content transformation to ensure stream compatibility
 * 
 * @param {Array} detailedItems - Array of detailed TVDB items
 * @returns {Array} Filtered items with IMDB IDs only
 */
function filterDetailedByImdbRequirement(detailedItems) {
    if (!detailedItems || !Array.isArray(detailedItems)) {
        return [];
    }
    
    return detailedItems.filter(item => {
        const hasImdb = hasValidImdbId(item);
        
        if (!hasImdb) {
            console.log(`🚫 Filtering out detailed item "${item.name}" - No IMDB ID for stream compatibility`);
        }
        
        return hasImdb;
    });
}

/**
 * Validate that a single item has IMDB ID before processing
 * @param {Object} item - TVDB item to validate
 * @param {string} itemType - 'movie' or 'series' for logging
 * @returns {boolean} True if item should be processed
 */
function validateImdbRequirement(item, itemType = 'content') {
    if (!item) {
        console.log(`⚠️ Cannot validate null ${itemType}`);
        return false;
    }
    
    const hasImdb = hasValidImdbId(item);
    
    if (!hasImdb) {
        console.log(`🚫 Rejecting ${itemType} "${item.name}" - No IMDB ID, streams won't be available`);
        return false;
    }
    
    const imdbId = extractImdbId(item);
    console.log(`✅ ${itemType} "${item.name}" has IMDB ID: ${imdbId}`);
    return true;
}

module.exports = {
    hasValidImdbId,
    extractImdbId,
    filterByImdbRequirement,
    filterDetailedByImdbRequirement,
    validateImdbRequirement
};
