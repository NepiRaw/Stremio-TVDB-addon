/**
 * TVDB content ratings
 * One entry per country, so the countries matching the configured language come first, then the US.
 */

const { getCountryCodesForLanguage } = require('./languageMap');

function selectContentRating(contentRatings, tvdbLanguage) {
    if (!Array.isArray(contentRatings) || contentRatings.length === 0) return null;

    const countries = [...getCountryCodesForLanguage(tvdbLanguage), 'usa'];
    for (const country of countries) {
        const match = contentRatings.find(rating => rating?.country === country && rating.name);
        if (match) {
            const name = String(match.name).trim();
            if (name) return name;
        }
    }
    return null;
}

module.exports = { selectContentRating };
