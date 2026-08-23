/**
 * Selection of people from a TVDB extended record.
 * TVDB tags every entry in `characters` with a peopleType, one record per credit, so crew and
 * repeated credits both have to be filtered out before a name reaches Stremio.
 */

// override with META_CAST_LIMIT to show more or fewer actors
const parsedLimit = Number.parseInt(process.env.META_CAST_LIMIT, 10);
const CAST_LIMIT = Number.isInteger(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 3;

// Nuvio renders a scrolling rail from app_extras, so it takes more names than meta.cast does
const DETAILED_CAST_LIMIT = 12;

const nameOf = character => character.people?.name || character.personName || null;

// featured credits first, then TVDB's own order
function byImportance(a, b) {
    const featured = (a.isFeatured ? 0 : 1) - (b.isFeatured ? 0 : 1);
    if (featured !== 0) return featured;
    return (a.sort ?? 999) - (b.sort ?? 999);
}

function selectCharacters(characters, peopleType, limit = Infinity) {
    if (!Array.isArray(characters) || characters.length === 0) return [];

    const matching = characters
        .filter(c => String(c.peopleType || '').toLowerCase() === peopleType && nameOf(c))
        .sort(byImportance);

    const seen = new Set();
    const selected = [];
    for (const character of matching) {
        if (selected.length >= limit) break;
        const person = character.peopleId ?? character.people?.id ?? nameOf(character);
        if (seen.has(person)) continue;
        seen.add(person);
        selected.push(character);
    }
    return selected;
}

function selectPeople(characters, peopleType, limit = Infinity) {
    return selectCharacters(characters, peopleType, limit).map(nameOf);
}

// Nuvio reads app_extras for the character name and the photo; Stremio ignores the field entirely.
function selectDetailedPeople(characters, peopleType, limit = Infinity) {
    return selectCharacters(characters, peopleType, limit).map(character => {
        const person = { name: nameOf(character) };

        const role = typeof character.name === 'string' ? character.name.trim() : '';
        if (role) person.character = role;

        const photo = character.personImgURL || character.people?.image;
        if (photo) person.photo = photo;

        return person;
    });
}

module.exports = { CAST_LIMIT, DETAILED_CAST_LIMIT, selectPeople, selectDetailedPeople };
