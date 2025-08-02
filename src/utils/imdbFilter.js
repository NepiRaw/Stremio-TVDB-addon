/**
 * IMDB ID filtering utilities for content quality and stream compatibility
 * 
 * Key principle: Only show content with IMDB IDs since stream addons require them
 * for proper content matching and stream discovery.
 * 
 * Additional quality gate: Only show content with poster artwork to ensure
 * good visual presentation and indicate complete metadata.
 */


function hasValidPoster(item) {
    if (!item) return false;
    
    if (item.poster && typeof item.poster === 'string' && item.poster.trim()) {
        return true;
    }
    
    if (item.image && typeof item.image === 'string' && item.image.trim()) {
        return true;
    }
    
    if (item.artworks && Array.isArray(item.artworks)) {
        const posterArtwork = item.artworks.find(artwork => {
            // Type 2 = series poster, Type 14 = movie poster, Type 15 = movie cover
            const posterTypes = [2, 14, 15];
            return posterTypes.includes(artwork.type) && 
                   artwork.image && 
                   typeof artwork.image === 'string' && 
                   artwork.image.trim();
        });
        
        if (posterArtwork) {
            return true;
        }
    }
    
    if (item.posterUrl && typeof item.posterUrl === 'string' && item.posterUrl.trim()) {
        return true;
    }
    
    if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string' && item.thumbnailUrl.trim()) {
        return true;
    }
    
    if (item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim()) {
        return true;
    }
    
    return false;
}

function hasValidImdbId(item) {
    if (!item) {
        return false;
    }
    
    if (item.remoteIds && Array.isArray(item.remoteIds)) {
        const imdbRemote = item.remoteIds.find(remote => 
            remote.sourceName?.toLowerCase() === 'imdb' || 
            remote.type === 2 || // IMDB type in TVDB
            (remote.id && remote.id.toString().startsWith('tt'))
        );
        
        if (imdbRemote && imdbRemote.id) {
            const id = imdbRemote.id.toString();
            const isValid = id.startsWith('tt') && id.length >= 9; // tt + 7 digits minimum
            return isValid;
        }
    }
    
    if (item.imdb && typeof item.imdb === 'string') {
        const id = item.imdb;
        if (id.startsWith('tt')) {
            const isValid = id.length >= 9; // tt + 7 digits minimum
            return isValid;
        } else if (/^\d{7,}$/.test(id)) {
            return true; // Numeric IMDB ID without tt prefix
        }
    }
    
    return false;
}

function extractImdbId(item) {
    if (!item) return null;
    
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
    
    if (item.imdb && typeof item.imdb === 'string') {
        const id = item.imdb;
        return id.startsWith('tt') ? id : `tt${id}`;
    }
    
    return null;
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
            console.log(`🚫 Filtering out "${item.name}" (${item.id}) - No IMDB ID or poster`);
        } else if (!hasImdb) {
            console.log(`🚫 Filtering out "${item.name}" (${item.id}) - No IMDB ID`);
        } else if (!hasPoster) {
            console.log(`🚫 Filtering out "${item.name}" (${item.id}) - No poster artwork`);
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
            console.log(`🚫 Filtering out detailed item "${item.name}" - No IMDB ID or poster`);
        } else if (!hasImdb) {
            console.log(`🚫 Filtering out detailed item "${item.name}" - No IMDB ID for stream compatibility`);
        } else if (!hasPoster) {
            console.log(`🚫 Filtering out detailed item "${item.name}" - No poster for visual quality`);
        }
        
        return hasImdb && hasPoster;
    });
}

function validateImdbRequirement(item, itemType = 'content') {
    if (!item) {
        console.log(`⚠️ Cannot validate null ${itemType}`);
        return false;
    }
    
    const hasImdb = hasValidImdbId(item);
    const hasPoster = hasValidPoster(item);
    
    if (!hasImdb && !hasPoster) {
        console.log(`🚫 Rejecting ${itemType} "${item.name}" - No IMDB ID or poster, poor quality metadata`);
        return false;
    } else if (!hasImdb) {
        console.log(`🚫 Rejecting ${itemType} "${item.name}" - No IMDB ID, streams won't be available`);
        return false;
    } else if (!hasPoster) {
        console.log(`🚫 Rejecting ${itemType} "${item.name}" - No poster, poor visual presentation`);
        return false;
    }
    
    const imdbId = extractImdbId(item);
    return true;
}

module.exports = {
    hasValidImdbId,
    hasValidPoster,
    hasValidQualityMetadata,
    extractImdbId,
    filterByImdbRequirement,
    filterDetailedByImdbRequirement,
    validateImdbRequirement
};
