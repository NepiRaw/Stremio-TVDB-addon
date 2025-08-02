# Enhanced Caching Strategy

## Overview

The TVDB addon uses a robust, production-grade multi-tier caching system to maximize performance, minimize API calls, and ensure data freshness. 
The system supports both **in-memory** and **hybrid (MongoDB + in-memory)** caching, with all configuration and TTLs matching the current production deployment.

## Architecture

src/services/cache/

### Cache Service Structure

```
src/services/cache/
├── inMemoryCacheService.js     # L1 in-memory caching
├── hybridCacheService.js       # L1 + L2 hybrid caching with MongoDB
├── cacheFactory.js             # Configuration-based cache selection
└── utils/
    ├── cacheMigration.js       # Migration utility (in-memory → hybrid)
    └── inspectL2Cache.js       # MongoDB cache inspection tool
```


### Cache Types

The system supports two caching strategies:

1. **In-Memory Cache (L1 only)**
   - Fast, single-tier memory cache
   - TTL management and auto-cleanup

2. **Hybrid Cache (L1 + L2)**
   - **L1**: In-memory for fastest access
   - **L2**: MongoDB for persistence, scalability, and cross-instance sharing
   - L2 hits are promoted to L1 for future speed
   - Graceful fallback to L1 if MongoDB is unavailable


## Cache Types & TTL Configuration

### Current TTL Values

| Cache Type    | TTL         | Rationale                                      |
|---------------|------------|------------------------------------------------|
| **Search**    | 2 hours    | Popular searches, but results can change       |
| **IMDB**      | 7 days     | IMDB IDs and metadata rarely change            |
| **Artwork**   | 14 days    | Artwork URLs are very static                   |
| **Translation**| 3 days    | Translations rarely update once established    |
| **Metadata**  | 12 hours   | Basic content metadata updates infrequently    |
| **Season**    | 6 hours    | Episodes and seasons update occasionally       |
| **Static**    | 30 days    | Genres, content types are extremely static     |


### Performance Benefits

- **Dramatic Performance Improvement**: 64% faster response times (888ms → 315ms)
- **Reduced API Calls**: Zero API calls for cached content
- **Intelligent TTLs**: Data types cached based on update frequency
- **Memory Efficient**: Automatic cleanup every 5 minutes


## Cache Architecture

### 7-Type Cache System

```javascript
this.searchCache = new Map();           // Search results
this.imdbCache = new Map();            // IMDB validation
this.artworkCache = new Map();         // Artwork data (posters, backgrounds)
this.translationCache = new Map();     // Language translations
this.metadataCache = new Map();        // Full content metadata
this.seasonCache = new Map();          // Season/episode data
this.staticCache = new Map();          // Genres, types, etc.
```

### Key Features

- **Generic Cache Methods**: Unified API for all cache types
- **TTL Management**: Automatic expiry and cleanup
- **Cache Hit/Miss Logging**: Accessible using Debug log
- **Pattern-Based Keys**: Efficient cache invalidation and updates
- **Cleanup Automation**: Memory management and leak prevention


## TVDB /updates Endpoint Integration

### Production Implementation

- **Smart Invalidation**: Uses TVDB `/updates` endpoint every 12 hours (configurable)
- **Selective Updates**: Only refreshes changed content, not the entire cache
- **Pattern-Based Clearing**: Efficiently clears all related cache entries for updated series
- **Background Processing**: Updates run in the background with automatic recovery

### Benefits of Hybrid Approach

✅ **Longer TTLs**: Reduced cache misses
✅ **Smart Updates**: Only refresh what changed
✅ **TVDB Compliant**: Uses recommended `/updates` endpoint
✅ **Performance**: Minimal API calls
✅ **Freshness**: Changes reflected within 12 hours


## Configuration

The cache system is fully configurable via environment variables and the `CACHE_TTLS` object in code:

```javascript
this.CACHE_TTLS = {
    search: 2 * 60 * 60 * 1000,        // 2 hours
    imdb: 7 * 24 * 60 * 60 * 1000,     // 7 days
    artwork: 14 * 24 * 60 * 60 * 1000, // 14 days
    translation: 3 * 24 * 60 * 60 * 1000, // 3 days
    metadata: 12 * 60 * 60 * 1000,     // 12 hours
    season: 6 * 60 * 60 * 1000,        // 6 hours
    static: 30 * 24 * 60 * 60 * 1000   // 30 days
};
```

**Hybrid cache is enabled by setting `CACHE_TYPE=hybrid` and providing a valid `MONGODB_URI` in your `.env` file.**


## Admin/Monitoring Endpoints (Secured)

**⚠️ Security Note**: Admin endpoints require authentication (via `ADMIN_API_KEY`) and are rate-limited for security. Endpoints are only available if the admin key is set in the environment.**

### Prerequisites
```bash
# Set admin API key in environment
ADMIN_API_KEY=your-secure-random-key-here
```

### Authentication Methods
1. **Header Authentication** (Recommended):
   - `curl -H "X-Admin-Key: your-secure-key" http://localhost:3000/admin/updates/status`
2. **Query Parameter** (Less secure):
   - `curl "http://localhost:3000/admin/updates/status?key=your-secure-key"`

### Rate Limiting
- **Limit**: 10 requests per minute per IP
- **Status**: 429 Too Many Requests when exceeded

### Endpoints

- `GET /admin/updates/status` — Returns current status of the updates service (last check, next check)
- `POST /admin/updates/trigger` — Manually triggers an updates check
- `GET /admin/cache/stats` — Returns cache statistics and TTLs

### Security Features

- **API Key Authentication**: Prevents unauthorized access
- **Rate Limiting**: 10 requests/minute per IP
- **Environment Configuration**: Admin key from environment variables
- **Automatic Disable**: Endpoints disabled if no admin key configured


## Monitoring

Cache performance can be monitored through:

- Console logging for cache hits/misses (Debug log: `💾 Cache:HIT` / `🔍 Cache:MISS`)
- `getStats()` method for comprehensive metrics
- Automatic cleanup logging every 5 minutes


## Best Practices

1. **Content-Agnostic**: Cache keys are generic and work for all content types (movies, series, anime, etc.)
2. **Language-Aware**: Separate cache entries for different languages
3. **Type-Specific**: Different TTLs for different data volatility patterns
4. **Memory Efficient**: Automatic cleanup prevents memory leaks
5. **Future-Proof**: Architecture ready for MongoDB migration and new content types


## Cache Inspection & Debugging Tools

### L2 Cache Inspector (`inspectL2Cache.js`)

A comprehensive tool for viewing MongoDB cache contents in detail.

```bash
# View cache summary
node src/services/cache/utils/inspectL2Cache.js summary

# View specific cache type details
node src/services/cache/utils/inspectL2Cache.js details search 10
node src/services/cache/utils/inspectL2Cache.js details metadata 5

# Search cache contents
node src/services/cache/utils/inspectL2Cache.js search "batman"
```

**Features:**
- **Summary View**: Total entries per cache type (active/expired)
- **Detailed View**: Entry keys, data sizes, TTL remaining, data previews
- **Search Function**: Find cached content by key or data content
- **Data Previews**: Truncated view of cached data for readability
- **Expiry Status**: Visual indicators for active vs expired entries

### Cache Migration Tool (`cacheMigration.js`)

Utility for migrating between cache strategies and inspection.

```bash
# Run full migration (in-memory → hybrid)
node src/services/cache/utils/cacheMigration.js migrate

# Quick cache inspection
node src/services/cache/utils/cacheMigration.js inspect
node src/services/cache/utils/cacheMigration.js inspect search
node src/services/cache/utils/cacheMigration.js inspect metadata batman

# Show help
node src/services/cache/utils/cacheMigration.js help
```

**Purpose of cacheMigration.js:**
1. **Data Migration**: Seamlessly migrate existing cache data from in-memory to hybrid MongoDB storage
2. **Performance Testing**: Compare cache performance between strategies
3. **Data Integrity**: Verify cache data consistency during migration
4. **Production Transition**: Safe transition from development (in-memory) to production (hybrid) caching
5. **Cache Inspection**: Quick MongoDB cache inspection for debugging

**Migration Process:**
- Preserves existing TTLs during migration
- Transfers only non-expired entries
- Provides performance comparison metrics
- Generates detailed migration reports
- Safe fallback if migration fails

### Usage Examples

**Viewing Current Cache Status:**
```bash
# See what's cached in MongoDB
node src/services/cache/utils/inspectL2Cache.js summary

# Expected output:
📊 L2 Cache Summary:
📁 SEARCH: Total: 106, Active: 106, Expired: 0
📁 IMDB: Total: 102, Active: 102, Expired: 0
📁 ARTWORK: Total: 102, Active: 102, Expired: 0
📁 METADATA: Total: 111, Active: 111, Expired: 0
🎯 TOTALS: Active: 421 entries, Size: ~88 KB
```

**Debugging Search Issues:**
```bash
# Find Batman-related cached searches
node src/services/cache/utils/inspectL2Cache.js search batman

# View recent search cache entries
node src/services/cache/utils/inspectL2Cache.js details search 10
```

**Production Migration:**
```bash
# Migrate from in-memory to hybrid with full report
node src/services/cache/utils/cacheMigration.js migrate
```
