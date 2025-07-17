# Cache Services

This folder contains all caching-related services and utilities for the TVDB addon.

## Structure

```
cache/
├── inMemoryCacheService.js     # L1 in-memory caching service
├── hybridCacheService.js       # L1 + L2 hybrid caching (MongoDB + memory)
├── cacheFactory.js             # Configuration-based cache instantiation
└── utils/
    ├── cacheMigration.js       # Migration utility for cache strategies
    └── inspectL2Cache.js       # MongoDB cache inspection tool
```

## Services

### `inMemoryCacheService.js`
- **Purpose**: Fast in-memory caching with TTL management
- **Use Case**: Development, testing, small deployments
- **Features**: Map-based storage, automatic cleanup, TTL handling

### `hybridCacheService.js`
- **Purpose**: Two-tier caching with MongoDB persistence
- **Use Case**: Production deployments requiring persistence
- **Features**: L1 (memory) + L2 (MongoDB), automatic promotion, graceful fallback

### `cacheFactory.js`
- **Purpose**: Selects cache implementation based on configuration
- **Environment Variables**:
  - `CACHE_TYPE=memory` → In-memory cache
  - `CACHE_TYPE=hybrid` → Hybrid cache (with MongoDB)
  - `MONGODB_URI` → MongoDB connection string

## Utilities

### `utils/cacheMigration.js`
**Purpose**: Migrate cache data between strategies and provide cache inspection.

**Key Functions:**
- Migrate existing in-memory cache data to MongoDB
- Performance comparison between cache strategies
- Data integrity verification
- Production transition assistance

**Usage:**
```bash
# Full migration process
node src/services/cache/utils/cacheMigration.js migrate

# Cache inspection
node src/services/cache/utils/cacheMigration.js inspect [type] [search]
```

### `utils/inspectL2Cache.js`
**Purpose**: Comprehensive MongoDB cache inspection and debugging.

**Key Functions:**
- View cache summaries and statistics
- Inspect individual cache entries
- Search cached content by key or data
- Monitor cache performance and expiry

**Usage:**
```bash
# Cache summary
node src/services/cache/utils/inspectL2Cache.js summary

# Detailed inspection
node src/services/cache/utils/inspectL2Cache.js details [cacheType] [limit]

# Search functionality
node src/services/cache/utils/inspectL2Cache.js search "searchTerm"
```

## Configuration

Cache behavior is controlled by environment variables:

```bash
# Cache strategy selection
CACHE_TYPE=hybrid                    # 'memory' or 'hybrid'

# MongoDB configuration (required for hybrid)
MONGODB_URI=mongodb+srv://...

# Admin endpoints (optional)
ADMIN_API_KEY=your-secure-key
```

## Cache Types Supported

- **search**: Search results (2 hours TTL)
- **imdb**: IMDB metadata (7 days TTL)  
- **artwork**: Image URLs (14 days TTL)
- **translation**: Language translations (3 days TTL)
- **metadata**: Content metadata (12 hours TTL)
- **season**: Episode/season data (6 hours TTL)
- **static**: Static data like genres (30 days TTL)

## Integration

The cache factory is used throughout the application:

```javascript
// In server.js
const CacheFactory = require('./src/services/cache/cacheFactory');
const cacheService = CacheFactory.createCache();

// In services
const tvdbService = new TVDBService(cacheService);
```

This architecture allows seamless switching between cache strategies without code changes.
