/**
 * Builds the Stremio `meta.links` array.
 *
 * Stremio v5 has no cast, director or writer field in its data model and discards
 * those top-level keys, so it renders people only from `links`. When `links` is absent it
 * synthesises the imdb and Genres entries itself, and once we supply the array it stops, which is
 * why the genre and imdb entries are reproduced here in stremio-core's own URL formats.
 */

// stremio-core builds its genre links against Cinemeta's top catalog
const CINEMETA_MANIFEST = 'https://v3-cinemeta.strem.io/manifest.json';
const CINEMETA_TOP_CATALOG = 'top';

const discoverUrl = (type, genre) =>
    `stremio:///discover/${encodeURIComponent(CINEMETA_MANIFEST)}/${encodeURIComponent(type)}/${encodeURIComponent(CINEMETA_TOP_CATALOG)}?genre=${encodeURIComponent(genre)}`;

const searchUrl = name => `stremio:///search?search=${encodeURIComponent(name)}`;

const asList = value => (Array.isArray(value) ? value : value ? [value] : [])
    .map(entry => String(entry).trim())
    .filter(Boolean);

function buildMetaLinks(meta) {
    if (!meta) return undefined;
    const links = [];

    if (meta.imdbRating && /^tt\d+$/.test(String(meta.id))) {
        links.push({ name: String(meta.imdbRating), category: 'imdb', url: `https://imdb.com/title/${meta.id}` });
    }
    for (const genre of asList(meta.genres)) {
        links.push({ name: genre, category: 'Genres', url: discoverUrl(meta.type, genre) });
    }
    for (const person of asList(meta.cast)) {
        links.push({ name: person, category: 'Cast', url: searchUrl(person) });
    }
    for (const person of asList(meta.director)) {
        links.push({ name: person, category: 'Directors', url: searchUrl(person) });
    }

    return links.length > 0 ? links : undefined;
}

module.exports = { buildMetaLinks };
