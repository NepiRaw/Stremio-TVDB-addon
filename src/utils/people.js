/**
 * Selection of people from a TVDB extended record.
 * TVDB tags every entry in `characters` with a peopleType, one record per credit, so crew and
 * repeated credits both have to be filtered out before a name reaches Stremio.
 */

// override with META_CAST_LIMIT to show more or fewer actors
const parsedLimit = Number.parseInt(process.env.META_CAST_LIMIT, 10);
const CAST_LIMIT = Number.isInteger(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 3;

const nameOf = character => character.people?.name || character.personName || null;

// featured credits first, then TVDB's own order
function byImportance(a, b) {
    const featured = (a.isFeatured ? 0 : 1) - (b.isFeatured ? 0 : 1);
    if (featured !== 0) return featured;
    return (a.sort ?? 999) - (b.sort ?? 999);
}

function selectPeople(characters, peopleType, limit = Infinity) {
    if (!Array.isArray(characters) || characters.length === 0) return [];

    const matching = characters
        .filter(c => String(c.peopleType || '').toLowerCase() === peopleType && nameOf(c))
        .sort(byImportance);

    const seen = new Set();
    const people = [];
    for (const character of matching) {
        if (people.length >= limit) break;
        const person = character.peopleId ?? character.people?.id ?? nameOf(character);
        if (seen.has(person)) continue;
        seen.add(person);
        people.push(nameOf(character));
    }
    return people;
}

module.exports = { CAST_LIMIT, selectPeople };
