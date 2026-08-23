/**
 * Selection of a TVDB content rating.
 * TVDB returns one entry per country, so the countries that match the configured language come
 * first and the US is the last resort. Series often carry no local entry at all.
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
