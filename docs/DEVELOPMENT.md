# Development Guide

## Project structure

```
server.js                 Express entry point, routes, admin endpoints
api/index.js              Vercel serverless entry, requires the same app
src/
├── config/
│   └── catalogConfig.js          the two search catalogs, app config for the page
├── handlers/
│   ├── catalogHandler.js         search
│   ├── manifestHandler.js        per-language manifest
│   └── metaHandler.js            full metadata, resolves tt and tvdb ids
├── services/
│   ├── tvdbService.js            TVDB client, orchestration, rating enrichment
│   ├── ratingService.js          OMDb with a Cinemeta fallback
│   ├── cache/                    inMemory / hybrid / factory, plus utils/
│   └── tvdb/
│       ├── contentFetcher.js         record retrieval and external ids
│       ├── catalogTransformer.js     search payload to Stremio rows
│       ├── metadataTransformer.js    full meta assembly
│       ├── translationService.js     language selection
│       ├── artworkHandler.js         posters, backgrounds, logos
│       └── updatesService.js         /updates polling and invalidation
└── utils/
    ├── people.js                 actor and crew selection, CAST_LIMIT
    ├── metaLinks.js              meta.links for Stremio v5
    ├── episodePager.js           paged episode walk
    ├── searchRanking.js          relevance re-ranking of search results
    ├── imdbFilter.js             IMDb id and real-poster gate
    ├── theatricalStatus.js       release info for movies
    ├── languageMap.js            language codes and names
    ├── urlBuilder.js             base URL resolution
    ├── envValidator.js           env var validation with placeholder detection
    ├── manifest.js               manifest assembly
    ├── errorHandler.js           express error handler
    └── logger.js                 levelled logger, request context, redaction
frontend/                 Vue 3 + Vite configuration page, built to frontend/dist
tests/                    Jest suites, fixtures and live prototypes (git-ignored)
```

There is no `src/templates/` and no `public/`. The page is served from `frontend/dist`.

## Two deployment targets, one app

`server.js` (Docker, long-running) and `api/index.js` (Vercel serverless) share every handler. A change to request handling has to work in both.

`app.listen`, its startup callback and the `SIGTERM` handler sit behind `require.main === module`, so requiring the app binds no port, logs into nothing and schedules no timers. Both cache cleanup timers are `unref()`ed for the same reason.

## Commands

```bash
npm run dev            # nodemon, NODE_ENV=development
npm start              # NODE_ENV=production
npm test               # jest
npm run test:watch     # jest --watch
npm run build          # installs and builds frontend/
npm run health         # GET /health on localhost:3000
npm run docker:compose # docker-compose up -d
npm run docker:logs    # follow the container logs
```

For a genuinely cold local run, avoid the shared production cache:

```bash
CACHE_TYPE=memory PORT=3000 MONGODB_URI= npm run dev
```

## TVDB API v4

Base URL `https://api4.thetvdb.com/v4`. JWT from `POST /login`, refreshed on expiry, with a shared in-flight promise so concurrent callers cannot trigger two logins on a cold start.

Endpoints actually used:

| endpoint | purpose |
|---|---|
| `POST /login` | authentication |
| `GET /search` | the only call a cold search makes for its rows |
| `GET /search/remoteid/{imdbId}` | reverse lookup for a `tt` meta request |
| `GET /movies/{id}/extended` | movie record, including its artworks |
| `GET /series/{id}/extended` | series record, fetched once per meta |
| `GET /series/{id}/episodes/{seasonType}` | episode pages |
| `GET /series/{id}/episodes/default/{language}` | localised episode titles |
| `GET /series/{id}/artworks` | series artwork |
| `GET /{type}/{id}/translations/{language}` | translated name and overview |
| `GET /updates?since={timestamp}` | change detection, every 12 hours |

`GET /{type}/{id}` (the basic record) is requested only if the extended record fails.

**There is no `/movies/{id}/artworks` endpoint.** It returns HTTP 400 for every movie. A movie poster comes from the extended record, which is why the artwork path is skipped entirely for movies.

`?lang=` does not affect the `characters` array. TVDB stores one credit list per title, in its original language.

Request timeout is `TVDB_REQUEST_TIMEOUT_MS`, default 5000 ms against a measured p95 of 236 ms.

## Performance notes

These are measured on this codebase, not estimates.

| path | cost |
|---|---|
| cold search | ~260 ms, one `/search` call plus one cached artwork call per row |
| warm search | ~20 ms, zero TVDB calls |
| cold series meta | 6 TVDB calls, down from 12 |
| One Piece meta | 1007 ms, down from 2946 ms |
| warm meta | tens of ms from the `meta:enhanced` cache |

Nuvio aborts a catalog request after 3.5 s (6.5 s on TV). The search path is the one that has to stay fast; everything else has more headroom.

## Caching

Six tiers with per-type TTLs, in memory or backed by MongoDB. See [CACHING_STRATEGY.md](CACHING_STRATEGY.md). Two rules worth knowing before touching any TVDB call:

- An empty result is cached **only when TVDB actually answered**. `error.response` present means the   absence is real; absent means the answer is unknown and must not be persisted.

## Stremio integration

The manifest declares `resources: ["catalog","meta"]`, types `movie` and `series`, and both id prefixes `tvdb-` and `tt`. There is no `search` resource in the protocol; search is a catalog with `extra: [{ name: 'search', isRequired: true }]`.

The unprefixed `/manifest.json` is the **generic** manifest and drops the language from its name and description, because that is the one addon directories list. An absent language segment is the trigger, not `eng`, so `/eng/` and `/zzz/` both keep naming their language. **The id is identical in every case**, since a client identifies an installed addon by it.

`behaviorHints.configurable` is `true`. Clients build the configure URL by replacing `manifest.json` with `configure` in the transport URL, so `/configure` and `/{language}/configure` are both served from `server.js` and both routed to the function in `vercel.json`. Without the express routes the self-hosted target would 404 while Vercel answered from its static fallback, which is exactly the split the two-target rule above exists to prevent. `configurationRequired` stays `false`, because clients replace the install button when it is true.

Clients differ:
- **Nuvio** parses strictly. A field the specification calls a string must be a string, or its Kotlin parser throws and the whole meta is discarded. `country` is the example that caused a real outage.
- **Stremio v4.4** reads the legacy top-level fields, including `genre`, `cast` and `director`.
- **Stremio v5** runs stremio-core, whose meta type has no `cast`, `director` or `writer` member at all. It renders people only from `meta.links`, and it reads `genres` rather than `genre`.

When a client renders less than you sent, read its source before assuming a rendering bug.

## Logging

One line per request at `info`, carrying the request id, a category tag, an outcome marker and the timing. Levels are `error`, `warn`, `info`, `debug` and `trace`.

- Internals live at `debug`, including every TVDB call with its duration.
- Inside a fan-out the per-row lines drop to `trace` and the batch emits one summary with the real spread. `LOG_LEVEL=trace` restores them.
- A request the client abandons still produces one line, because the middleware listens on `res.on('close')` and branches on `writableFinished`.
- A request still running past `LOG_WATCHDOG_MS` (default 2000) gets a watchdog line.
- `TVDB_API_KEY`, `OMDB_API_KEY`, `ADMIN_API_KEY` and MongoDB credentials are redacted at the logger, not per call site.

An expected 404 is not logged as an error.

## Error handling

- A TVDB failure degrades to an empty result rather than a 500, but does not cache that emptiness unless TVDB answered.
- A catalog error returns empty `metas`, so search never breaks the client.
- Missing content is a 404 and is an expected outcome.
- The rating path does not retry an HTTP status. A rejected OMDb key costs 76 ms instead of 3269 ms.

## Admin and development tools

Set `ADMIN_API_KEY` to enable them. Authenticate with `X-Admin-Key`, rate limited to 10 requests per minute per IP, and disabled entirely when no key is configured.

```bash
curl -H "X-Admin-Key: your-key" http://localhost:3000/admin/cache/stats
curl -H "X-Admin-Key: your-key" http://localhost:3000/admin/updates/status
curl -X POST -H "X-Admin-Key: your-key" http://localhost:3000/admin/updates/trigger
```

## Testing

```bash
npm test
```

## Environment variables

| variable | required | default | purpose |
|---|---|---|---|
| `TVDB_API_KEY` | yes | | TVDB API key |
| `OMDB_API_KEY` | no | | ratings, plot and director. Cinemeta is the fallback when unset |
| `MONGODB_URI` | recommended | | enables the L2 cache |
| `MONGO_DB_NAME` | no | | database name for the L2 cache |
| `CACHE_TYPE` | no | `memory` | `memory`, `hybrid` or `mongodb` |
| `ADMIN_API_KEY` | recommended | | enables the admin endpoints |
| `BASE_URL` | no | auto-detect | public base URL for install links |
| `PORT` | no | `3000` | server port |
| `NODE_ENV` | no | `development` | `development`, `production` or `test` |
| `LOG_LEVEL` | no | `info` | `error`, `warn`, `info`, `debug`, `trace` |
| `LOG_WATCHDOG_MS` | no | `2000` | when a slow request gets a watchdog line |
| `TVDB_REQUEST_TIMEOUT_MS` | no | `5000` | abandons a TVDB request that stopped answering |
| `META_CAST_LIMIT` | no | `3` | how many actors reach `meta.cast`. `0` means none |

## Environment validation

`src/utils/envValidator.js` treats a variable left at its example value as unset, so a half-filled `.env` is reported at startup instead of producing confusing behaviour later. Detected as "not configured":

```
TVDB_API_KEY=your_tvdb_api_key_here
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net
SECRET=example_secret
TOKEN=placeholder_token
```

Patterns: `your_*` and `your-*`, `<anything>`, `{{anything}}`, `${anything}`, the `example_`, `placeholder_`, `sample_`, `test_` and `demo_` prefixes, the words `null`, `undefined`, `none` and `empty`, and strings of only `x`, `*` or `-`.

`TVDB_API_KEY` is the only variable declared required. `catalogConfig.logStatus()` runs the check at startup. It **warns and continues**, it does not exit, so read the startup output rather than assuming a clean boot means a complete configuration.

## Deployment

### Local

```bash
npm install
cp .env.example .env
npm run dev
```

### Docker Compose

```bash
git clone https://github.com/NepiRaw/Stremio-TVDB-addon.git
cd Stremio-TVDB-addon
cp .env.example .env
docker-compose up -d
```

The prebuilt image already contains the built frontend. When building your own image, run `npm run build` before starting the server, because the backend serves `frontend/dist`.

### Vercel

Install and build commands are auto-detected (`npm install`, then `npm run build`). Set the environment variables in the dashboard and use MongoDB Atlas for the L2 cache.
