# Caching Strategy

The addon caches in six tiers, either in memory alone or in memory backed by MongoDB.

## Cache services

```
src/services/cache/
├── inMemoryCacheService.js     # L1 only
├── hybridCacheService.js       # L1 + L2 (MongoDB)
├── cacheFactory.js             # picks one from CACHE_TYPE
└── utils/
    ├── cacheMigration.js       # in-memory to hybrid migration and quick inspection
    ├── inspectL2Cache.js       # MongoDB cache inspector
    └── clearCache.js           # MongoDB cache viewer and clearer, interactive
```

Select one with `CACHE_TYPE`:

| value | behaviour |
|---|---|
| `memory` | L1 only. No persistence. The default. |
| `hybrid` | L1 plus MongoDB. An L2 hit is promoted to L1. Falls back to L1 alone if Mongo is unreachable. Recommended in production. |
| `mongodb` | Same hybrid service, kept as an alias. |

`hybrid` and `mongodb` both need a valid `MONGODB_URI`. Without one the factory logs that MongoDB is not configured and uses memory only, rather than failing.

## Tiers and TTLs

Six tiers. There is no static tier, despite what older documentation claimed.

| tier | TTL | why |
|---|---|---|
| search | 2 hours | popular queries, but results do change |
| imdb | 7 days | external ids barely move |
| artwork | 14 days | artwork URLs are close to permanent |
| translation | 3 days | translations rarely change once written |
| metadata | 12 hours | core content data updates infrequently |
| season | 6 hours | episode lists update occasionally |

```javascript
this.CACHE_TTLS = {
    search:      2  * 60 * 60 * 1000,
    imdb:        7  * 24 * 60 * 60 * 1000,
    artwork:     14 * 24 * 60 * 60 * 1000,
    translation: 3  * 24 * 60 * 60 * 1000,
    metadata:    12 * 60 * 60 * 1000,
    season:      6  * 60 * 60 * 1000
};
```

Two things share the `metadata` tier with their own TTL passed per call: the assembled `meta:enhanced:*` payload at 24 hours, and IMDb ratings at 7 days on success and 1 hour on a miss.

**TTLs are milliseconds.** `setCachedData(type, key, data, ttl)` adds `ttl` to `Date.now()`.

Expired entries are swept every 5 minutes. The sweep timer is `unref()`ed, so it never holds the process open.

## Reading and writing

```javascript
await cacheService.getCachedData(type, key);              // type is one of the six tier names
await cacheService.setCachedData(type, key, data, ttl);   // ttl in milliseconds
```

Both services accept the tier name. The in-memory service also accepts a `Map` directly, for internal callers.

## Caching an absence

An empty result is written to the cache **only when TVDB actually answered**. 
The rule is `error.response` present means TVDB replied and the absence is real; `error.response` absent means the answer is unknown and nothing is cached.

## Invalidation and the /updates endpoint

The TVDB `/updates` endpoint is polled every 12 hours, and only the entries belonging to changed entities are cleared.

Invalidation goes through `invalidateByPrefixes`, which batches every prefix into one operation per cycle.

**On the hybrid cache, invalidation has to reach L2.** Clearing only the L1 map achieves nothing, because the very next read repopulates L1 from MongoDB with the same stale value. A count of entries cleared is not evidence that anything was invalidated. Read the value back from the layer that serves requests.

Entity types are normalised before matching, because TVDB sends plural and `translated*` forms that a singular comparison silently drops.

## Monitoring

- `GET /admin/cache/stats` returns per-tier entry counts and the TTL table. Requires `ADMIN_API_KEY`.
- `getStats()` gives the same figures in process. The in-memory implementation returns no `type` field, which is why `/health` reports `cache.type: "unknown"` under `CACHE_TYPE=memory`.
- Cache hits and misses are logged at `debug`, carrying the tier and the lookup cost. Inside a fan-out the per-row lines drop to `trace` and the batch reports one summary line with the real spread, so a 20 row search no longer emits 40 lines. `LOG_LEVEL=trace` restores every suppressed line.

## Inspection tools

### `inspectL2Cache.js`

```bash
node src/services/cache/utils/inspectL2Cache.js summary
node src/services/cache/utils/inspectL2Cache.js details search 10
node src/services/cache/utils/inspectL2Cache.js search "batman"
```

Summary gives totals per tier with active and expired counts. Details lists keys, sizes, remaining TTL and a truncated data preview.

### `cacheMigration.js`

```bash
node src/services/cache/utils/cacheMigration.js migrate
node src/services/cache/utils/cacheMigration.js inspect metadata batman
node src/services/cache/utils/cacheMigration.js help
```

Moves non-expired entries from in-memory to hybrid storage, preserving their remaining TTL, and reports what it moved.

## Notes for anyone changing this

- Cache keys are content-agnostic and language-aware. The same payload can therefore be stored once per language even when the upstream call took no language, which `search()` currently does.
- Different volatility gets a different tier. Do not reuse a tier because its name is close enough.
- Assert a computed lifetime in a test rather than trusting the arithmetic beside it.
