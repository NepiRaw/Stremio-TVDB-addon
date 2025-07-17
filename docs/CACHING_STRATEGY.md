# Enhanced Caching Strategy

## Overview

The TVDB addon uses a sophisticated multi-tier caching system to optimize performance and reduce API calls while ensuring data freshness. The system supports both **in-memory** and **hybrid (MongoDB + in-memory)** caching strategies.

## Architecture

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
   - Fast access, single-tier caching
   - Memory-based storage with TTL management
   - Suitable for development and small deployments

2. **Hybrid Cache (L1 + L2)**
   - **L1**: In-memory for immediate access
   - **L2**: MongoDB for persistence and scalability
   - Automatic promotion from L2 to L1 on cache hits
   - Graceful fallback if MongoDB unavailable

## Cache Types & TTL Configuration

### Current TTL Values (Optimized)

| Cache Type | TTL | Rationale |
|------------|-----|-----------|
| **Search** | 2 hours | Popular searches, but results can change with new content |
| **IMDB** | 7 days | IMDB IDs and metadata rarely change |
| **Artwork** | 14 days | Artwork URLs are very static |
| **Translation** | 3 days | Translations rarely update once established |
| **Metadata** | 12 hours | Basic content metadata updates infrequently |
| **Season** | 6 hours | Episodes and seasons update occasionally |
| **Static** | 30 days | Genres, content types are extremely static |

### Performance Benefits

- **Dramatic Performance Improvement**: 64% faster response times (888ms → 315ms)
- **Reduced API Calls**: Zero API calls for cached content
- **Intelligent TTLs**: Different data types cached based on update frequency
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

- **Generic Cache Methods**: Future-proof for MongoDB migration
- **TTL Management**: Automatic expiry handling
- **Cache Hit/Miss Logging**: Performance monitoring
- **Pattern-Based Keys**: Efficient cache invalidation
- **Cleanup Automation**: Memory management

## Future Enhancement: /updates Endpoint Integration

### Planned Implementation

- **Smart Invalidation**: Use TVDB `/updates` endpoint every 12 hours
- **Selective Updates**: Only refresh changed content
- **Configurable Interval**: `UPDATES_CHECK_INTERVAL = 12 * 60 * 60 * 1000` (adjustable)

### Benefits of Hybrid Approach

✅ **Longer TTLs**: Reduced cache misses  
✅ **Smart Updates**: Only refresh what changed  
✅ **TVDB Compliant**: Uses recommended `/updates` endpoint  
✅ **Performance**: Minimal API calls  
✅ **Freshness**: Changes reflected within 12 hours  

## Implementation Phases

### ✅ Phase 1: Enhanced TTLs (Completed)
- Optimized TTL values for all cache types
- Immediate performance improvements
- Production-ready caching system

### ✅ Phase 2: /updates Integration (Completed)
- Implemented TVDB `/updates` polling every 12 hours
- Added selective cache invalidation
- Pattern-based cache clearing methods
- Admin endpoints for monitoring and manual triggers

## Configuration

The cache system is fully configurable through the `CACHE_TTLS` object:

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

## Admin/Monitoring Endpoints (Secured)

**⚠️ Security Note**: Admin endpoints require authentication and are rate-limited for security.

### Prerequisites
```bash
# Set admin API key in environment
ADMIN_API_KEY=your-secure-random-key-here
```

### Authentication Methods
1. **Header Authentication** (Recommended):
   ```bash
   curl -H "X-Admin-Key: your-secure-key" http://localhost:3000/admin/updates/status
   ```

2. **Query Parameter** (Less secure):
   ```bash
   curl "http://localhost:3000/admin/updates/status?key=your-secure-key"
   ```

### Rate Limiting
- **Limit**: 10 requests per minute per IP
- **Status**: 429 Too Many Requests when exceeded

### Endpoints

#### Updates Status
```bash
GET /admin/updates/status
Headers: X-Admin-Key: your-secure-key
```
Returns current status of the updates service including last check time and next scheduled check.

#### Manual Updates Trigger
```bash
POST /admin/updates/trigger
Headers: X-Admin-Key: your-secure-key
```
Manually triggers an updates check for testing or immediate synchronization.

#### Cache Statistics
```bash
GET /admin/cache/stats
Headers: X-Admin-Key: your-secure-key
```
Returns comprehensive cache statistics including entry counts and TTL configurations.

### Security Features

- **API Key Authentication**: Prevents unauthorized access
- **Rate Limiting**: 10 requests/minute prevents abuse
- **Environment Configuration**: Admin key from environment variables
- **Automatic Disable**: Endpoints disabled if no admin key configured
- **IP-based Tracking**: Rate limiting per client IP address

## Monitoring

Cache performance can be monitored through:

- Console logging for cache hits/misses
- `getStats()` method for comprehensive metrics
- Automatic cleanup logging every 5 minutes

## Best Practices

1. **Content-Agnostic**: Cache keys are generic and work for all content types
2. **Language-Aware**: Separate cache entries for different languages
3. **Type-Specific**: Different TTLs for different data volatility patterns
4. **Memory Efficient**: Automatic cleanup prevents memory leaks
5. **Future-Proof**: Architecture ready for MongoDB migration

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
