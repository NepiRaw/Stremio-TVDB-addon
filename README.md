# Stremio TVDB Addon

A Stremio addon that provides catalog search functionality using TVDB (The TV Database) API for movies, series, and anime.

## Features

- 🎬 **Movies**: Search and browse movies from TVDB
- 📺 **Series**: Search and browse TV series from TVDB  
- 🎌 **Anime**: Search and browse anime series from TVDB
- 🔍 **Search-based catalogs**: Only shows content when user searches (no home/discovery clutter)
- 🌐 **Multi-language support**: Returns content in Stremio's language when available
- 📱 **Responsive installation page**: Works on all devices including mobile

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your TVDB API key (see `.env.example`)
4. Start the server: `npm start`
5. Open `http://localhost:3000` in your browser to install the addon

## Environment Variables

```
TVDB_API_KEY=your_tvdb_api_key_here
PORT=3000
TVDB_BASE_URL=https://api4.thetvdb.com/v4
```

## API Endpoints

- `GET /` - Installation page
- `GET /manifest.json` - Stremio addon manifest
- `GET /catalog/:type/:id/:extra?.json` - Catalog search endpoint
- `GET /meta/:type/:id.json` - Metadata endpoint

## Development

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Run tests
npm test
```

## Architecture

The addon follows Stremio SDK patterns and includes:

- **Server**: Express.js server handling all routes
- **Services**: TVDB API integration with authentication and caching
- **Utils**: Helper functions for data transformation and error handling
- **Templates**: Responsive HTML templates for installation page

## Future Enhancements

- [ ] MongoDB caching for improved performance
- [ ] Advanced search filters
- [ ] User preferences and favorites
- [ ] Content recommendations

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request
