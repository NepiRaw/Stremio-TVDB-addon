# Development Guide

## Project Structure

```
src/
├── handlers/           # Route handlers
│   ├── catalogHandler.js
│   ├── manifestHandler.js
│   ├── metaHandler.js
│   └── installationPageHandler.js
├── services/           # Core services
│   ├── tvdbService.js              # Main TVDB integration
│   └── cache/                      # Enhanced caching (inMemoryCacheService.js, hybridCacheService.js, cacheFactory.js, etc.)
│   └── tvdb/                       # TVDB-specific modules
│       ├── updatesService.js           # Intelligent updates monitoring
│       ├── contentFetcher.js           # Content retrieval
│       ├── catalogTransformer.js       # Catalog transformation
│       ├── metadataTransformer.js      # Metadata processing
│       ├── translationService.js       # Multi-language support
│       └── artworkHandler.js           # Artwork management
├── templates/            # HTML templates
│   └── installationPage.js
├── utils/                # Utility functions
│   ├── manifest.js
│   ├── errorHandler.js
│   ├── logger.js
│   └── ...
public/
├── index.html            # Main static entry point
└── assets/               # Static assets (CSS, JS, images)
```

## Enhanced Architecture

### Multi-Service Design
- **Modular services** for maintainability
- **Single responsibility** principle
- **Dependency injection** patterns
- **Error isolation** and recovery

### Performance Optimizations
- **7-tier caching system** with TTL management
- **Intelligent updates** with selective invalidation
- **Background processing** for non-blocking operations
- **Connection pooling** and request optimization

## API Integration

### TVDB API v4

The addon uses TVDB API v4 with comprehensive integration:

- **Base URL**: `https://api4.thetvdb.com/v4`
- **Authentication**: JWT tokens (24-hour expiry with auto-refresh)
- **Core Endpoints**:
  - `POST /login` - Authentication
  - `GET /search` - Content search
  - `GET /movies/{id}` - Movie details
  - `GET /series/{id}` - Series details
  - `GET /series/{id}/seasons` - Series seasons
  - `GET /updates` - Change detection (12-hour polling)
  - `GET /artworks/{id}` - Artwork retrieval
  - `GET /{type}/{id}/translations/{language}` - Multi-language support

### Enhanced Caching Strategy

**7-Tier Cache Architecture:**
1. **Search Cache** (2h TTL) - Popular queries
2. **IMDB Cache** (7d TTL) - External ID validation  
3. **Artwork Cache** (14d TTL) - Image URLs
4. **Translation Cache** (3d TTL) - Multi-language content
5. **Metadata Cache** (12h TTL) - Core content data
6. **Season Cache** (6h TTL) - Episode information
7. **Static Cache** (30d TTL) - Genres, types

**Intelligent Updates:**
- TVDB `/updates` endpoint monitoring every 12 hours
- Pattern-based cache invalidation
- Selective refresh of changed content only
- Background processing with error recovery

### Authentication Flow

1. Initial login with API key
2. Store JWT token with expiry tracking
3. Auto-refresh before expiration
4. Retry requests on 401 errors
5. Exponential backoff on failures

## Stremio Integration

### Manifest

The addon manifest defines:
- Supported content types: `movie`, `series`
- Resources: `catalog`, `meta`
- Search-only catalogs (no discovery)

### Catalog Endpoint

- **Route**: `/catalog/:type/:id/:extra?.json`
- **Purpose**: Provide search results
- **Behavior**: Returns empty results without search query

### Meta Endpoint

- **Route**: `/meta/:type/:id.json`
- **Purpose**: Detailed content metadata
- **ID Format**: `tvdb-{tvdb_id}`

## Error Handling

- Graceful degradation on API failures
- Empty results for catalog errors
- 404 responses for missing content
- Comprehensive logging with structured data
- Automatic retry with exponential backoff
- Circuit breaker patterns for API protection

## Admin/Development Tools

### Secured Admin Endpoints

For development and monitoring, the addon provides admin endpoints:

**Prerequisites:**
```bash
# Required environment variable
export ADMIN_API_KEY="your-secure-development-key"
```

**Available Endpoints:**
- `GET /admin/cache/stats` - Cache statistics and performance metrics
- `GET /admin/updates/status` - Updates service status and timing
- `POST /admin/updates/trigger` - Manual updates trigger for testing

**Security Features:**
- API key authentication required
- Rate limiting (10 requests/minute per IP)
- Automatic disable when no key configured
- IP-based request tracking

**Usage Examples:**
```bash
# Check cache performance
curl -H "X-Admin-Key: your-key" http://localhost:3000/admin/cache/stats

# Trigger manual updates for testing  
curl -X POST -H "X-Admin-Key: your-key" http://localhost:3000/admin/updates/trigger

# Monitor updates service
curl -H "X-Admin-Key: your-key" http://localhost:3000/admin/updates/status
```

### Development Workflow

1. **Local Development**:
   ```bash
   npm run dev          # Auto-reload with nodemon
   npm test            # Run test suite
   npm run lint        # Code quality checks
   ```

2. **Performance Testing**:
   - Use admin endpoints to monitor cache hit rates
   - Check updates service timing and efficiency
   - Verify rate limiting and security measures

3. **Production Deployment**:
   - Ensure `ADMIN_API_KEY` is set securely
   - Monitor cache statistics for optimization
   - Set up alerts for updates service failures


## Future Enhancements

# MongoDB Caching

MongoDB-based hybrid caching is now implemented and is the recommended approach for production deployments. The cache system uses a 7-tier architecture with L1 (memory) and L2 (MongoDB) for persistence and scalability. See the README and CACHING_STRATEGY.md for details.

### Performance Optimizations

### Performance Optimizations

- Response caching with TTL
- Batch API requests
- Image proxy for better loading
- Search result pagination

## Testing

Run tests with:
```bash
npm test
```


## Deployment

### Local Development
```bash
npm install
npm run dev
```

### Production (Recommended: Docker Compose)

For production deployments, use the provided Docker Compose setup as described in the README:

```bash
# Clone the repository
git clone https://github.com/NepiRaw/Stremio-TVDB-addon.git
cd Stremio-TVDB-addon
cp .env.example .env
# Edit .env with your production configuration
docker-compose up -d
```

This will launch the addon using the prebuilt image with all dependencies included. MongoDB caching is enabled by setting `MONGODB_URI` in your `.env` file.

### Environment Variables
- `TVDB_API_KEY` - Required
- `PORT` - Default: 3000
- `NODE_ENV` - 'development' or 'production'
- `MONGODB_URI` - Enables hybrid caching (recommended for production)
