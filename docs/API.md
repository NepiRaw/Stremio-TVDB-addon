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
stremio://org.stremio.tvdb-addon/manifest.json
```

Or by opening the manifest URL directly in Stremio.
