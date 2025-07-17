# API Documentation

## Endpoints

### Installation Page
- **URL**: `/`
- **Method**: GET
- **Description**: Responsive HTML page for addon installation
- **Response**: HTML content

### Manifest
- **URL**: `/manifest.json`
- **Method**: GET
- **Description**: Stremio addon manifest
- **Response**: JSON manifest object

### Catalog Search
- **URL**: `/catalog/:type/:id/:extra?.json`
- **Method**: GET
- **Parameters**:
  - `type`: Content type (`movie`, `series`)
  - `id`: Catalog ID (`tvdb-movies`, `tvdb-series`)
  - `extra`: URL-encoded search parameters
- **Example**: `/catalog/movie/tvdb-movies/search=batman.json`
- **Response**: 
  ```json
  {
    "metas": [
      {
        "id": "tvdb-12345",
        "type": "movie",
        "name": "Batman",
        "poster": "https://image.url",
        "year": 2022
      }
    ]
  }
  ```

### Metadata
- **URL**: `/meta/:type/:id.json`
- **Method**: GET
- **Parameters**:
  - `type`: Content type (`movie`, `series`)
  - `id`: TVDB ID with prefix (`tvdb-12345`)
- **Example**: `/meta/movie/tvdb-12345.json`
- **Response**: 
  ```json
  {
    "meta": {
      "id": "tvdb-12345",
      "type": "movie",
      "name": "Batman",
      "description": "Movie description...",
      "poster": "https://image.url",
      "background": "https://background.url",
      "year": 2022,
      "genres": ["Action", "Drama"],
      "cast": ["Actor 1", "Actor 2"],
      "director": ["Director Name"],
      "runtime": "120 min",
      "imdbRating": "8.5"
    }
  }
  ```

### Health Check
- **URL**: `/health`
- **Method**: GET
- **Description**: Service health status
- **Response**: 
  ```json
  {
    "status": "ok",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
  ```

## Admin Endpoints (Secured)

⚠️ **Security Notice**: All admin endpoints require authentication and are rate-limited.

### Prerequisites
- Set `ADMIN_API_KEY` environment variable
- Include admin key in requests via header or query parameter

### Authentication Methods
1. **Header** (Recommended): `X-Admin-Key: your-secure-key`
2. **Query Parameter**: `?key=your-secure-key`

### Rate Limiting
- **Limit**: 10 requests per minute per IP
- **Response**: 429 Too Many Requests when exceeded

### Admin Endpoints

#### Cache Statistics
- **URL**: `/admin/cache/stats`
- **Method**: GET
- **Authentication**: Required
- **Description**: Comprehensive cache statistics
- **Response**:
  ```json
  {
    "success": true,
    "stats": {
      "searchEntries": 25,
      "imdbEntries": 150,
      "artworkEntries": 89,
      "translationEntries": 42,
      "metadataEntries": 187,
      "seasonEntries": 34,
      "staticEntries": 12,
      "totalEntries": 539,
      "cacheTTLs": {
        "search": 7200000,
        "imdb": 604800000,
        "artwork": 1209600000,
        "translation": 259200000,
        "metadata": 43200000,
        "season": 21600000,
        "static": 2592000000
      }
    }
  }
  ```

#### Updates Service Status
- **URL**: `/admin/updates/status`
- **Method**: GET
- **Authentication**: Required
- **Description**: TVDB updates service status and timing
- **Response**:
  ```json
  {
    "success": true,
    "status": {
      "isRunning": true,
      "lastUpdateTimestamp": 1752718725531,
      "updateInterval": 43200000,
      "nextCheckIn": 43164756
    }
  }
  ```

#### Manual Updates Trigger
- **URL**: `/admin/updates/trigger`
- **Method**: POST
- **Authentication**: Required
- **Description**: Manually trigger TVDB updates check
- **Response**:
  ```json
  {
    "success": true,
    "message": "Manual updates check triggered"
  }
  ```

### Admin Error Responses

#### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized - Invalid admin key"
}
```

#### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Rate limit exceeded - max 10 requests per minute"
}
```

#### 503 Service Unavailable
```json
{
  "success": false,
  "error": "Admin endpoints disabled - ADMIN_API_KEY not configured"
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid content type"
}
```

### 404 Not Found
```json
{
  "error": "Content not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error"
}
```

## TVDB API Integration

### Enhanced Caching System
- **7-tier cache architecture** for optimal performance
- **TTL-based expiration** with different durations per data type:
  - Search: 2 hours
  - IMDB: 7 days  
  - Artwork: 14 days
  - Translation: 3 days
  - Metadata: 12 hours
  - Season: 6 hours
  - Static: 30 days
- **Automatic cleanup** every 5 minutes
- **64% performance improvement** (888ms → 315ms response times)

### Intelligent Updates System
- **TVDB /updates endpoint** polling every 12 hours
- **Selective cache invalidation** based on TVDB changes
- **Pattern-based cache clearing** for precise updates
- **Background processing** with automatic recovery

### Authentication
- Uses JWT tokens from TVDB API v4
- Tokens expire after 24 hours
- Automatic refresh on expiry

### Rate Limiting
- TVDB API has rate limits
- Implement exponential backoff on errors
- Cache responses to reduce API calls

### Supported Content Types
- **Movies**: Full metadata including cast, crew, ratings
- **Series**: Metadata with seasons/episodes information
- **Anime**: Treated as series with genre filtering

## Installation URL Format

The addon can be installed using this URL pattern:
```
stremio://yourdomain/manifest.json
```

Or by opening the manifest URL directly in Stremio.
