/**
 * Theatrical Status Detection Utility
 * 
 * Determines if a movie is still in theaters based on release dates
 */

const { getCountryCodesForLanguage, DEFAULT_LANGUAGE } = require('./languageMap');

/**
 * Check if a movie is still in theaters
 * @param {Object} movieData - TVDB movie data
 * @param {string} userLanguage - User's preferred language (e.g., 'fra', 'eng', 'deu')
 * @returns {Object} Theatrical status information
 */
function checkTheatricalStatus(movieData, userLanguage = DEFAULT_LANGUAGE) {
    // Configurable theatrical status thresholds (in days)
    const STREMIO_NATIVE_WINDOW = 30;      // Stremio's built-in "available in theater" window
    const TOTAL_THEATRICAL_WINDOW = 90;    // Our extended theatrical status window
    const PRE_RELEASE_WINDOW = 14;         // Days before release to show "in theaters"
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
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
    
    if (!releaseDate && movieData.releases && Array.isArray(movieData.releases)) {
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
            const preferredCountries = getCountryCodesForLanguage(userLanguage);
            
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
                const majorMarkets = ['usa', 'gbr', 'fra', 'deu', 'can', 'aus'];
                const majorMarketRelease = movieData.releases.find(release => 
                    release.date && majorMarkets.includes(release.country?.toLowerCase())
                );
                
                if (majorMarketRelease) {
                    releaseDate = majorMarketRelease.date;
                } else {
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
    
    if (!releaseDate && movieData.releaseDates && Array.isArray(movieData.releaseDates)) {
        const firstReleaseDate = movieData.releaseDates[0];
        if (firstReleaseDate) {
            releaseDate = firstReleaseDate.date || firstReleaseDate;
        }
    }
    
    if (!releaseDate && movieData.year) {
        const movieYear = parseInt(movieData.year);
        
        if (movieYear === currentYear) {
            const estimatedReleaseDate = new Date(movieYear, 6, 1);
            
            return {
                inTheaters: true,
                status: 'current_year_estimated',
                message: `🎬 In theaters (${movieYear} release)`,
                releaseDate: estimatedReleaseDate,
                isEstimated: true
            };
        }
        
        if (movieYear === currentYear + 1) {
            const estimatedReleaseDate = new Date(movieYear, 0, 1);
            
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

    if (cinemaDate > currentDate) {
        return {
            inTheaters: false,
            status: 'upcoming',
            message: `🗓️ Coming to theaters ${cinemaDate.toLocaleDateString()}`,
            releaseDate: cinemaDate
        };
    }
    
    const typicalTheaterWindow = TOTAL_THEATRICAL_WINDOW;
    const estimatedDigitalRelease = new Date(cinemaDate.getTime() + (typicalTheaterWindow * 24 * 60 * 60 * 1000));
    
    const digitalReleaseDate = movieData.digital_release_date || 
                              movieData.streaming_release_date ||
                              movieData.dvd_release_date;
    
    const actualDigitalRelease = digitalReleaseDate ? new Date(digitalReleaseDate) : estimatedDigitalRelease;
    
    // Movie is in theaters if:
    // 1. Has been released in cinemas
    // 2. Digital/streaming release hasn't happened yet
    const isInTheaters = cinemaDate <= currentDate && currentDate < actualDigitalRelease;
    
    const daysSinceRelease = Math.floor((currentDate - cinemaDate) / (24 * 60 * 60 * 1000));
    const isVeryRecent = daysSinceRelease >= 0 && daysSinceRelease <= 14;
    
    if (isInTheaters) {
        const daysRemaining = Math.floor((actualDigitalRelease - currentDate) / (24 * 60 * 60 * 1000));
        
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
    
    return {
        inTheaters: false,
        status: 'post_theatrical',
        message: null,
        releaseDate: cinemaDate,
        digitalReleaseDate: actualDigitalRelease
    };
}

function formatTheatricalMessage(status) {
    if (!status || !status.message) return null;
    
    return status.message;
}

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
