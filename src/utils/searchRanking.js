/**
 * TVDB /search exposes no sort parameter and ranks loose matches above exact ones.
 * Every title needed to reorder is already in the payload, so this costs no network.
 */

const SCORE = {
    EXACT: 100,
    PREFIX: 80,
    WORD: 60,
    SUBSTRING: 40
};

function normalise(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function matchScore(query, candidate) {
    const q = normalise(query);
    const c = normalise(candidate);
    if (!q || !c) return 0;

    const qs = q.replace(/ /g, '');
    const cs = c.replace(/ /g, '');

    if (c === q || cs === qs) return SCORE.EXACT;
    if (cs.startsWith(qs)) return SCORE.PREFIX;
    if (` ${c} `.includes(` ${q} `)) return SCORE.WORD;
    if (cs.includes(qs)) return SCORE.SUBSTRING;
    return 0;
}

// Aliases and translations carry the titles users actually type, so they count too.
function titlesOf(item) {
    if (!item || typeof item !== 'object') return [];
    return [
        item.name,
        item.extended_title,
        ...(Array.isArray(item.aliases) ? item.aliases : []),
        ...Object.values(item.translations || {})
    ];
}

function relevance(item, query) {
    return titlesOf(item).reduce((best, title) => Math.max(best, matchScore(query, title)), 0);
}

// Stable, so items scoring equally keep the order TVDB returned them in.
function rankSearchResults(results, query) {
    if (!Array.isArray(results) || results.length === 0 || !normalise(query)) {
        return Array.isArray(results) ? results : [];
    }

    return results
        .map((item, index) => ({ item, index, score: relevance(item, query) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(entry => entry.item);
}

module.exports = { rankSearchResults, relevance, matchScore, normalise, SCORE };
