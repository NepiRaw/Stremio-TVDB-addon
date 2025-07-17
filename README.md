# Stremio TVDB Addon

A high-performance Stremio addon that provides comprehensive catalog search functionality using TVDB (The TV Database) API for movies, series, and anime with intelligent caching and updates.

## Features

- 🎬 **Movies**: Search and browse movies from TVDB
- 📺 **Series**: Search and browse TV series from TVDB  
- 🎌 **Anime**: Search and browse anime series from TVDB
- 🔍 **Search-based catalogs**: Only shows content when user searches (no home/discovery clutter)
- 🌐 **Multi-language support**: Returns content in Stremio's language when available
- 📱 **Responsive installation page**: Works on all devices including mobile
- 🔄 **Intelligent updates**: TVDB changes monitoring with selective cache invalidation

## Performance & Caching

### Enhanced Caching System
- **6-tier cache architecture** with optimized TTLs
- **Intelligent TTL management**: Different cache durations per data type
- **Automatic cleanup**: Memory-efficient with 5-minute cleanup cycles

### Intelligent Updates
- **TVDB /updates monitoring**: 12-hour polling for changes
- **Selective invalidation**: Only refresh changed content
- **Background processing**: Non-blocking updates with error recovery
- **Pattern-based clearing**: Precise cache management

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your configuration (see `.env.example`)
4. Start the server: `npm start`
5. Open `http://localhost:3000` in your browser to install the addon

## Environment Variables

### Required
```
TVDB_API_KEY=your_tvdb_api_key_here
```

### Optional
```
PORT=3000
TVDB_BASE_URL=https://api4.thetvdb.com/v4
ADMIN_API_KEY=your_secure_admin_key_for_monitoring
```

## API Endpoints

### Public Endpoints
- `GET /` - Installation page
- `GET /manifest.json` - Stremio addon manifest
- `GET /catalog/:type/:id/:extra?.json` - Catalog search endpoint
- `GET /meta/:type/:id.json` - Metadata endpoint
- `GET /health` - Health check

### Admin Endpoints (Secured)
- `GET /admin/cache/stats` - Cache performance statistics
- `GET /admin/updates/status` - Updates service status  
- `POST /admin/updates/trigger` - Manual updates trigger

*Admin endpoints require `ADMIN_API_KEY` and are rate-limited (10 req/min per IP)*

## Development

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Run tests
npm test

# Monitor cache performance (requires ADMIN_API_KEY)
curl -H "X-Admin-Key: your-key" http://localhost:3000/admin/cache/stats
```


## Future Enhancements

- [ ] MongoDB caching for persistent storage
- [ ] Advanced search filters and sorting
- [ ] User preferences and favorites
- [ ] Content recommendations based on viewing history
- [ ] GraphQL API for more efficient data fetching

## Documentation

- [API Documentation](docs/API.md) - Complete API reference with admin endpoints
- [Development Guide](docs/DEVELOPMENT.md) - Development setup and architectural patterns  
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment with security considerations
- [Caching Strategy](docs/CACHING_STRATEGY.md) - Performance optimization and updates system

## Enjoy 😊