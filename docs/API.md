# API Documentation

## Routes

The addon is language-prefixed. `/{language}/…` is the real install form and the one the configuration page emits. The unprefixed routes exist as a fallback and behave as `eng`.

| route | method | purpose |
|---|---|---|
| `/` | GET | configuration and installation page (Vue, served from `frontend/dist`) |
| `/{language}/manifest.json` | GET | Stremio manifest for that language |
| `/{language}/catalog/{type}/{id}/{extra}.json` | GET | search |
| `/{language}/catalog/{type}/{id}.json` | GET | search, query-parameter form |
| `/{language}/meta/{type}/{id}.json` | GET | full metadata |
| `/manifest.json`, `/catalog/…`, `/meta/…` | GET | same handlers, English |
| `/configure` | GET | configuration page, the URL clients derive for the Configure button |
| `/{language}/configure` | GET | same page, for an install made from a language-prefixed URL |
| `/health` | GET | health probe |
| `/api/app-config` | GET | version, UI strings and the manifest URL template, read by the page |
| `/api/languages` | GET | the 48 languages the backend accepts |

`{type}` is `movie` or `series`. `{id}` is `tvdb-movies` or `tvdb-series` for a catalog, and either a `tt…` IMDb id or a `tvdb-…` id for meta. Both prefixes are advertised in the manifest.

### Languages

Any of the 48 codes from `/api/languages` works in the path, and an unrecognised one falls back to English rather than failing:

```
/swe/manifest.json  ->  community.stremio.tvdb-addon-swe   TVDB Search (Svenska)
/zzz/manifest.json  ->  community.stremio.tvdb-addon-eng   TVDB Search (English)
```

The configuration page offers 11 of them in its dropdown. That is a UI choice, not a backend limit.

## Manifest

`GET /eng/manifest.json`:

```json
{
  "id": "community.stremio.tvdb-addon-eng",
  "version": "1.1.0",
  "name": "TVDB Search (English)",
  "description": "Search TVDB for movies, series, and anime with English language preference…",
  "resources": ["catalog", "meta"],
  "types": ["movie", "series"],
  "idPrefixes": ["tvdb-", "tt"],
  "behaviorHints": { "configurable": true, "configurationRequired": false },
  "contactEmail": "https://github.com/NepiRaw/Stremio-TVDB-addon",
  "logo": "https://thetvdb.com/images/logo.png",
  "background": "https://www.thetvdb.com/images/logo.svg",
  "catalogs": [
    { "type": "movie",  "id": "tvdb-movies", "name": "TVDB - Movies (Search)",         "extra": [{ "name": "search", "isRequired": true }] },
    { "type": "series", "id": "tvdb-series", "name": "TVDB - Series & Anime (Search)", "extra": [{ "name": "search", "isRequired": true }] }
  ]
}
```

Stremio and Nuvio have no `search` resource. Global search is served by a catalog that declares `extra: [{ name: 'search', isRequired: true }]`, which is why `resources` is `["catalog","meta"]`.

### Generic versus language-prefixed

The **unprefixed** `/manifest.json` is the generic one, and it is what addon directories list. It drops the language from its name and description:

```
/manifest.json       name "TVDB Search"            description "Search TVDB for movies, series, and anime. …"
/eng/manifest.json   name "TVDB Search (English)"  description "… with English language preference. …"
```

The trigger is an **absent** language segment, not `eng`. An explicit `/eng/` or an invalid `/zzz/` both keep naming the language, because both are deliberate requests.

**The `id` never changes between the two.** `/manifest.json` and `/eng/manifest.json` both emit `community.stremio.tvdb-addon-eng`.

### Configuration

`behaviorHints.configurable` is `true`, so clients show a Configure button. They build its URL by taking the transport URL and replacing `manifest.json` with `configure` (`stremio-web`, `AddonDetailsModal.js`), which is why both `/configure` and `/{language}/configure` are served.

`configurationRequired` stays `false`.

## Catalog search

- **Path form**: `/fra/catalog/movie/tvdb-movies/search=batman.json`
- **Query form**: `/fra/catalog/movie/tvdb-movies.json?search=batman`
- Without a search term the catalog returns an empty `metas` array. There is no discovery catalog.

A row is built from the `/search` payload alone. No per-item detail call is made, which is what keeps a cold search near 260 ms instead of the 2.4 to 4.8 s of fan-out it used to cost.

```json
{
  "metas": [
    {
      "id": "tvdb-1204",
      "type": "movie",
      "name": "Batman",
      "poster": "https://artworks.thetvdb.com/banners/v4/movie/1204/posters/621e1de137962.jpg",
      "year": 1989,
      "description": "Le célèbre et impitoyable justicier, Batman, est de retour…",
      "genres": ["Action", "Fantasy"],
      "imdb_id": "tt0096895"
    }
  ]
}
```

Rows are dropped when they have no IMDb id or no real poster, so the returned count is normally lower than TVDB's own result count. Results are re-ranked by how well any of an item's titles matches the query before they are cached, so the ordering is not TVDB's.

Search rows deliberately carry no `links`. Preview rows render no people and no genres.

## Metadata

`GET /{language}/meta/{type}/{id}.json`. `{id}` accepts both id prefixes. A `tt` id is resolved through `GET /search/remoteid/{imdbId}`.

Movie fields, from `/fra/meta/movie/tt0078346.json`:

```
awards, background, behaviorHints, cast, country, description, director, external_ids, genre, genres, id, imdb_id, imdbRating, language, links, logo, metascore, name, poster, released, releaseInfo, rottenTomatoes, runtime, tmdb_id, tvdb_id, type, votes, year
```

A series adds `videos`, `seasons`, `network`, and further external ids such as `eidr_id` and `tv_maze_id`. Each `videos` entry carries `id`, `title`, `season`, `episode`, `released`, `overview`, and `thumbnail`.

```json
{
  "meta": {
    "id": "tt0078346",
    "type": "movie",
    "name": "Superman",
    "description": "…",
    "poster": "https://…",
    "background": "https://…",
    "year": 1978,
    "runtime": "143 min",
    "imdbRating": "7.4",
    "country": "usa",
    "genres": ["Adventure", "Fantasy", "Science Fiction"],
    "genre": ["Action", "Adventure", "Sci-Fi"],
    "cast": ["Marlon Brando", "Gene Hackman", "Christopher Reeve"],
    "director": ["Richard Donner"],
    "links": [
      { "name": "7.4", "category": "imdb", "url": "https://imdb.com/title/tt0078346" },
      { "name": "Adventure", "category": "Genres", "url": "stremio:///discover/https%3A%2F%2Fv3-cinemeta.strem.io%2Fmanifest.json/movie/top?genre=Adventure" },
      { "name": "Marlon Brando", "category": "Cast", "url": "stremio:///search?search=Marlon%20Brando" },
      { "name": "Richard Donner", "category": "Directors", "url": "stremio:///search?search=Richard%20Donner" }
    ]
  }
}
```

### Meta fields

- **`country` is a string, never an array.** Nuvio's parser reads it as a JSON primitive and throws on an array, which discards the whole meta. The Stremio specification agrees it is a string.
- **`genres` and `genre` are both emitted and differ.** `genres` is TVDB's vocabulary, `genre` is OMDb's. Stremio v5 reads `genres`, Stremio v4.4 reads `genre`.
- **`links` is what Stremio v5 renders people from.** stremio-core has no `cast`, `director` or `writer` member, so it discards those keys silently. Categories emitted are `imdb`, `Genres`, `Cast` and `Directors`, matching Cinemeta's convention. When `links` is absent, stremio-core synthesises only the `imdb` and `Genres` entries itself, so the array has to carry them too.
- **`cast` is actors only**, ordered by TVDB's featured flag then its sort order, deduplicated by person, and capped by `META_CAST_LIMIT` (default 3).
- **`director`** comes from OMDb or Cinemeta first and falls back to TVDB's `Director` credits.
- **`writer` is not emitted.**
- **`imdbRating` is a string**, not a number.

## Health

```json
{
  "status": "ok",
  "timestamp": "2026-08-22T20:09:39.169Z",
  "uptime": 0.58,
  "environment": "development",
  "version": "1.1.0",
  "tvdb": { "status": "connected", "hasValidToken": true },
  "cache": { "status": "ok", "type": "unknown", "totalEntries": 0 },
  "responseTime": "0ms"
}
```

`status` becomes `degraded` when the TVDB token cannot be obtained. `cache.type` reports `unknown` on the in-memory cache, because its `getStats()` returns no `type` field.

## Admin endpoints

Disabled entirely unless `ADMIN_API_KEY` is set. Authenticate with the `X-Admin-Key` header, or `?key=` as a less secure alternative. Rate limited to 10 requests per minute per IP.

| route | method | returns |
|---|---|---|
| `/admin/cache/stats` | GET | entry counts per tier and the TTL table |
| `/admin/updates/status` | GET | `isRunning`, `lastUpdateTimestamp`, `updateInterval`, `nextCheckIn` |
| `/admin/updates/trigger` | POST | triggers an updates check immediately |

```json
{
  "success": true,
  "stats": {
    "searchEntries": 0, "imdbEntries": 0, "artworkEntries": 0,
    "translationEntries": 0, "metadataEntries": 0, "seasonEntries": 0,
    "totalEntries": 0,
    "cacheTTLs": {
      "search": 7200000, "imdb": 604800000, "artwork": 1209600000,
      "translation": 259200000, "metadata": 43200000, "season": 21600000
    }
  }
}
```

Errors are `{ "success": false, "error": "…" }` with 401 for a bad key, 429 over the rate limit, 503 when no admin key is configured, and 500 on an internal failure.

## Error responses

| status | when |
|---|---|
| 400 | unknown content type, or a malformed id |
| 404 | no such content, or an id of the wrong type |
| 500 | internal failure |

A 404 for content TVDB does not have is an expected outcome and is not logged as an error.

## TVDB integration

- **Base URL** `https://api4.thetvdb.com/v4`, JWT from `POST /login`, refreshed on expiry. Concurrent callers share one in-flight login.
- **Request timeout** `TVDB_REQUEST_TIMEOUT_MS`, default 5000 ms against a measured p95 of 236 ms.
- **An empty result is cached only when TVDB actually answered.** If no HTTP response came back the absence is not persisted, otherwise one timeout would blank a series for the whole 6 hour season TTL.
- **Caching**: six tiers with per-type TTLs. See [CACHING_STRATEGY.md](CACHING_STRATEGY.md).
- **Change detection**: the `/updates` endpoint is polled every 12 hours and invalidates only what changed.

### Content types

- **Movies**: metadata, cast, director and ratings.
- **Series**: metadata plus seasons and episodes, fetched in one paged walk.
- **Anime**: served as series.

## Installation URL

```
stremio://yourdomain/{language}/manifest.json
```

Or by opening the manifest URL directly in Stremio.
