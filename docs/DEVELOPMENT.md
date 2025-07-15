# Development Guide

## Project Structure

```
src/
├── handlers/           # Route handlers
│   ├── catalogHandler.js
│   ├── manifestHandler.js
│   ├── metaHandler.js
│   └── installationPageHandler.js
├── services/          # External API services
│   └── tvdbService.js
├── templates/         # HTML templates
│   └── installationPage.js
├── utils/            # Utility functions
│   ├── manifest.js
│   ├── errorHandler.js
│   └── logger.js
└── static/           # Static assets
```

## API Integration

### TVDB API v4

The addon uses TVDB API v4 with JWT authentication:

- **Base URL**: `https://api4.thetvdb.com/v4`
- **Authentication**: JWT tokens (24-hour expiry)
- **Endpoints Used**:
  - `POST /login` - Authentication
  - `GET /search` - Content search
  - `GET /movies/{id}` - Movie details
  - `GET /series/{id}` - Series details
  - `GET /series/{id}/seasons` - Series seasons

### Authentication Flow

1. Initial login with API key
2. Store JWT token with expiry
3. Auto-refresh on token expiry
4. Retry requests on 401 errors

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
- Comprehensive logging

## Future Enhancements

### MongoDB Caching (TODO)

Plans for adding MongoDB caching:

```javascript
// Example caching structure
const cacheSchema = {
    tvdbId: String,
    type: String, // 'movie' or 'series'
    data: Object, // Full TVDB response
    lastUpdated: Date,
    expiresAt: Date
};
```

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

Current test coverage:
- Manifest generation
- Basic error handling
- TODO: API integration tests
- TODO: Handler integration tests

## Deployment

### Local Development
```bash
npm install
npm run dev
```

### Production
```bash
npm install --production
npm start
```

### Environment Variables
- `TVDB_API_KEY` - Required
- `PORT` - Default: 3000
- `NODE_ENV` - 'development' or 'production'
