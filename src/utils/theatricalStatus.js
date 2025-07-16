/**
 * Theatrical Status Detection Utility
 * 
 * Determines if a movie is still in theaters based on release dates
 */

/**
 * Map language codes to primary country codes for release date prioritization
 * @param {string} languageCode - 3-letter language code (e.g., 'fra', 'eng', 'deu')
 * @returns {string[]} Array of country codes in priority order
 */
function getCountryCodesForLanguage(languageCode) {
    const languageToCountryMap = {
        // French
        'fra': ['fra', 'bel', 'che', 'can'],
        'fre': ['fra', 'bel', 'che', 'can'],
        
        // English
        'eng': ['usa', 'gbr', 'can', 'aus', 'nzl', 'irl'],
        
        // German
        'deu': ['deu', 'aut', 'che'],
        'ger': ['deu', 'aut', 'che'],
        
        // Spanish
        'spa': ['esp', 'mex', 'arg', 'col', 'per', 'chl'],
        'esp': ['esp', 'mex', 'arg', 'col', 'per', 'chl'],
        
        // Italian
        'ita': ['ita', 'che'],
        
        // Portuguese
        'por': ['bra', 'prt'],
        
        // Dutch
        'nld': ['nld', 'bel'],
        'dut': ['nld', 'bel'],
        
        // Japanese
        'jpn': ['jpn'],
        
        // Korean
        'kor': ['kor'],
        
        // Chinese
        'chi': ['chn', 'hkg', 'twn'],
        'zho': ['chn', 'hkg', 'twn'],
        
        // Russian
        'rus': ['rus', 'ukr', 'blr'],
        
        // Polish
        'pol': ['pol'],
        
        // Swedish
        'swe': ['swe', 'nor', 'dnk'],
        
        // Norwegian
        'nor': ['nor', 'swe', 'dnk'],
        
        // Danish
        'dan': ['dnk', 'swe', 'nor'],
        
        // Finnish
        'fin': ['fin'],
        
        // Greek
        'grc': ['grc'],
        'ell': ['grc'],
        
        // Turkish
        'tur': ['tur'],
        
        // Arabic
        'ara': ['sau', 'are', 'egy', 'mar'],
        
        // Hindi
        'hin': ['ind'],
        
        // Thai
        'tha': ['tha'],
        
        // Czech
        'ces': ['cze'],
        'cze': ['cze'],
        
        // Hungarian
        'hun': ['hun'],
        
        // Romanian
        'ron': ['rou'],
        'rum': ['rou']
    };
    
    // Return mapped countries or default fallback
    return languageToCountryMap[languageCode?.toLowerCase()] || ['usa', 'gbr', 'fra', 'deu'];
}

/**
 * Check if a movie is still in theaters
 * @param {Object} movieData - TVDB movie data
 * @param {string} userLanguage - User's preferred language (e.g., 'fra', 'eng', 'deu')
 * @returns {Object} Theatrical status information
 */
function checkTheatricalStatus(movieData, userLanguage = 'eng') {
    // Configurable theatrical status thresholds (in days)
    const STREMIO_NATIVE_WINDOW = 30;      // Stremio's built-in "available in theater" window
    const TOTAL_THEATRICAL_WINDOW = 90;    // Our extended theatrical status window
    const PRE_RELEASE_WINDOW = 14;         // Days before release to show "in theaters"
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // Extended search for release dates in various TVDB fields
    let releaseDate = movieData.released || 
                     movieData.releaseDate ||
                     movieData.first_release_date || 
                     movieData.release_date ||
                     movieData.originalReleaseDate ||
                     movieData.firstAired ||
                     movieData.first_aired ||
                     movieData.aired ||
                     movieData.airDate ||
                     movieData.originalAirDate;
    
    // Check for releases array (TVDB sometimes provides multiple release dates)
    if (!releaseDate && movieData.releases && Array.isArray(movieData.releases)) {
        // Look for theatrical/cinema release first
        const theatricalRelease = movieData.releases.find(release => 
            release.detail && (
                release.detail.toLowerCase().includes('theatrical') ||
                release.detail.toLowerCase().includes('cinema') ||
                release.detail.toLowerCase().includes('theater')
            )
        );
        
        if (theatricalRelease && theatricalRelease.date) {
            releaseDate = theatricalRelease.date;
        } else {
            // Get user's preferred country codes based on their language
            const preferredCountries = getCountryCodesForLanguage(userLanguage);
            
            // Try to find release for user's preferred countries (in priority order)
            let selectedRelease = null;
            for (const countryCode of preferredCountries) {
                selectedRelease = movieData.releases.find(release => 
                    release.date && release.country?.toLowerCase() === countryCode.toLowerCase()
                );
                if (selectedRelease) {
                    break;
                }
            }
            
            if (selectedRelease) {
                releaseDate = selectedRelease.date;
            } else {
                // Fall back to major markets if no preferred country found
                const majorMarkets = ['usa', 'gbr', 'fra', 'deu', 'can', 'aus'];
                const majorMarketRelease = movieData.releases.find(release => 
                    release.date && majorMarkets.includes(release.country?.toLowerCase())
                );
                
                if (majorMarketRelease) {
                    releaseDate = majorMarketRelease.date;
                } else {
                    // Final fallback to earliest release
                    const earliestRelease = movieData.releases
                        .filter(release => release.date)
                        .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
                    
                    if (earliestRelease) {
                        releaseDate = earliestRelease.date;
                    }
                }
            }
        }
    }
    
    // Check for releaseDates array
    if (!releaseDate && movieData.releaseDates && Array.isArray(movieData.releaseDates)) {
        const firstReleaseDate = movieData.releaseDates[0];
        if (firstReleaseDate) {
            releaseDate = firstReleaseDate.date || firstReleaseDate;
        }
    }
    
    // If no specific date but we have a year, make assumptions for recent/current year movies
    if (!releaseDate && movieData.year) {
        const movieYear = parseInt(movieData.year);
        
        // For current year movies without specific date, assume theatrical status
        if (movieYear === currentYear) {
            // Create a mid-year date as estimate (July 1st)
            const estimatedReleaseDate = new Date(movieYear, 6, 1); // July 1st
            
            return {
                inTheaters: true,
                status: 'current_year_estimated',
                message: `🎬 In theaters (${movieYear} release)`,
                releaseDate: estimatedReleaseDate,
                isEstimated: true
            };
        }
        
        // For next year movies, show as upcoming
        if (movieYear === currentYear + 1) {
            const estimatedReleaseDate = new Date(movieYear, 0, 1); // January 1st of next year
            
            return {
                inTheaters: false,
                status: 'upcoming_year',
                message: `🗓️ Coming to theaters in ${movieYear}`,
                releaseDate: estimatedReleaseDate,
                isEstimated: true
            };
        }
    }
    
    if (!releaseDate) {
        return {
            inTheaters: false,
            status: 'unknown',
            message: null
        };
    }
    
    const cinemaDate = new Date(releaseDate);
    
    // For movies releasing within the next 14 days, consider them "in theaters" 
    // (matches Cinemeta/Trakt behavior for very recent releases)
    const daysDifference = Math.floor((cinemaDate - currentDate) / (24 * 60 * 60 * 1000));
    
    if (daysDifference > 0 && daysDifference <= PRE_RELEASE_WINDOW) {
        return {
            inTheaters: true,
            status: 'releasing_soon',
            message: `🎬 In theaters (releases in ${daysDifference} day${daysDifference === 1 ? '' : 's'})`,
            releaseDate: cinemaDate,
            daysDifference: daysDifference
        };
    }
    
    // Movie releasing in more than 14 days
    if (cinemaDate > currentDate) {
        return {
            inTheaters: false,
            status: 'upcoming',
            message: `🗓️ Coming to theaters ${cinemaDate.toLocaleDateString()}`,
            releaseDate: cinemaDate
        };
    }
    
    // Calculate typical theatrical window (45-120 days depending on movie success)
    // Blockbusters often stay in theaters longer, indie films shorter
    const typicalTheaterWindow = TOTAL_THEATRICAL_WINDOW; // days (more realistic average)
    const estimatedDigitalRelease = new Date(cinemaDate.getTime() + (typicalTheaterWindow * 24 * 60 * 60 * 1000));
    
    // Check if digital release date is available
    const digitalReleaseDate = movieData.digital_release_date || 
                              movieData.streaming_release_date ||
                              movieData.dvd_release_date;
    
    const actualDigitalRelease = digitalReleaseDate ? new Date(digitalReleaseDate) : estimatedDigitalRelease;
    
    // Movie is in theaters if:
    // 1. Has been released in cinemas
    // 2. Digital/streaming release hasn't happened yet
    const isInTheaters = cinemaDate <= currentDate && currentDate < actualDigitalRelease;
    
    // Special handling for very recent releases (last 14 days)
    const daysSinceRelease = Math.floor((currentDate - cinemaDate) / (24 * 60 * 60 * 1000));
    const isVeryRecent = daysSinceRelease >= 0 && daysSinceRelease <= 14;
    
    if (isInTheaters) {
        const daysRemaining = Math.floor((actualDigitalRelease - currentDate) / (24 * 60 * 60 * 1000));
        
        // Be more conservative about "in theaters" claim after Stremio's 30-day native window
        const isWithinStremioWindow = daysSinceRelease <= STREMIO_NATIVE_WINDOW;
        const message = isWithinStremioWindow ? 
            `🎬 Currently in theaters - Released ${daysSinceRelease} day${daysSinceRelease === 1 ? '' : 's'} ago` :
            `🎬 Released ${daysSinceRelease} day${daysSinceRelease === 1 ? '' : 's'} ago`;
        
        return {
            inTheaters: true,
            status: 'in_theaters',
            message: message,
            releaseDate: cinemaDate,
            estimatedDigitalRelease: actualDigitalRelease,
            daysSinceRelease: daysSinceRelease,
            daysRemaining: daysRemaining
        };
    }
    
    // Movie has finished theatrical run
    return {
        inTheaters: false,
        status: 'post_theatrical',
        message: null,
        releaseDate: cinemaDate,
        digitalReleaseDate: actualDigitalRelease
    };
}

/**
 * Format theatrical status message for Stremio
 * @param {Object} status - Result from checkTheatricalStatus
 * @returns {string|null} Formatted message or null
 */
function formatTheatricalMessage(status) {
    if (!status || !status.message) return null;
    
    return status.message;
}

/**
 * Enhanced release info with theatrical context
 * @param {Object} movieData - TVDB movie data
 * @param {string} userLanguage - User's preferred language (e.g., 'fra', 'eng', 'deu')
 * @returns {Object} Enhanced release information
 */
function getEnhancedReleaseInfo(movieData, userLanguage = 'eng') {
    const status = checkTheatricalStatus(movieData, userLanguage);
    const year = movieData.year || 
                (status.releaseDate ? status.releaseDate.getFullYear() : null);
    
    return {
        year: year,
        releaseInfo: year ? year.toString() : null,
        released: status.releaseDate ? status.releaseDate.toISOString() : null,
        theatricalStatus: status,
        statusMessage: formatTheatricalMessage(status)
    };
}

module.exports = {
    checkTheatricalStatus,
    formatTheatricalMessage,
    getEnhancedReleaseInfo
};
