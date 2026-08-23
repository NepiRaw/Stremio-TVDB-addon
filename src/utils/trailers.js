/**
 * TVDB trailers
 * Stremio takes `source`, Nuvio takes `key || source || ytId`, so one array with `source` serves
 * both. TVDB stores one entry per language, so the configured language is preferred.
 */

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
const TRAILER_LIMIT = 5;

function languageRank(language, tvdbLanguage) {
    if (language === tvdbLanguage) return 0;
    if (language === 'eng') return 1;
    return 2;
}

function buildTrailers(trailers, tvdbLanguage) {
    if (!Array.isArray(trailers) || trailers.length === 0) return [];

    const seen = new Set();
    const built = [];
    const ranked = [...trailers].sort(
        (a, b) => languageRank(a?.language, tvdbLanguage) - languageRank(b?.language, tvdbLanguage)
    );

    for (const trailer of ranked) {
        if (built.length >= TRAILER_LIMIT) break;
        const source = YOUTUBE_ID.exec(trailer?.url || '')?.[1];
        if (!source || seen.has(source)) continue;
        seen.add(source);

        const entry = { source, type: 'Trailer', site: 'YouTube' };
        const name = typeof trailer.name === 'string' ? trailer.name.trim() : '';
        if (name) entry.name = name;
        built.push(entry);
    }
    return built;
}

// Stremio v5 plays trailers from this list rather than from `trailers`.
function buildTrailerStreams(trailers, title) {
    return trailers.map(trailer => ({ title, ytId: trailer.source }));
}

module.exports = { TRAILER_LIMIT, buildTrailers, buildTrailerStreams };
