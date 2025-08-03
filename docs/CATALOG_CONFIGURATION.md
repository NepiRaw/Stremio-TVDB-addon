# Catalog Configuration System - WIP

This document describes the centralized catalog configuration system that manages all catalog definitions, API key requirements, and UI configurations.

## Overview

The catalog configuration system provides:

- **Centralized catalog definitions** - All catalogs defined in one place
- **Generic API key validation** - Automatically detects placeholder values
- **Mode determination** - Automatically switches between search-only and catalog modes
- **Future-proof architecture** - Easy to add new content providers and catalogs

## Architecture

### Core Components

1. **EnvValidator** (`src/utils/envValidator.js`)
   - Validates environment variables
   - Detects placeholder/default values automatically
   - Provides detailed validation results

2. **CatalogConfig** (`src/config/catalogConfig.js`)
   - Manages all catalog definitions
   - Determines addon mode based on available API keys
   - Provides UI configuration for frontend
   - Generates Stremio-compatible manifest

### Automatic Placeholder Detection

The system automatically detects unconfigured environment variables by checking for common placeholder patterns:

```javascript
// These values are automatically detected as "not configured":
TVDB_API_KEY=your_tvdb_api_key_here
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net
API_KEY=<your-api-key>
SECRET=example_secret
TOKEN=placeholder_token
```

Patterns detected:
- `your_*` or `your-*` 
- `<anything>`
- `{{anything}}`
- `${anything}`
- `example_*`, `placeholder_*`, `sample_*`, `test_*`, `demo_*`
- Common words: `null`, `undefined`, `none`, `empty`
- Pure numbers, all X's, asterisks, or dashes

## Modes

### Search-Only Mode
- **Trigger**: Only `TVDB_API_KEY` is configured
- **Features**: Basic search functionality
- **Catalogs**: Search-only catalogs for movies and series

### Catalog Mode
- **Trigger**: `TVDB_API_KEY` + `XYZ_API_KEY` are configured
- **Features**: Full catalog browsing + search
- **Catalogs**: Popular, trending, top-rated + search catalogs

## Adding New Catalogs

To add a new catalog, update the `catalogDefinitions` in `src/config/catalogConfig.js`:

```javascript
'new-catalog-id': {
    id: 'new-catalog-id',
    type: 'movie', // or 'series', 'anime'
    name: 'Display Name',
    icon: 'fas fa-icon-name',
    tooltip: 'Description for users',
    provider: 'provider-name',
    category: 'category-name',
    requiredApiKeys: ['REQUIRED_API_KEY'],
    defaultEnabled: true,
    order: 5,
    extra: [{ name: 'skip', isRequired: false }]
}
```

## Adding New API Keys

1. Add to `apiKeyValidation` in `catalogConfig.js`:
```javascript
'NEW_API_KEY': {
    required: false,
    minLength: 32,
    description: 'Description of this API key'
}
```

2. Add to catalog mode requirements if needed:
```javascript
catalogApiKeys: ['TMDB_API_KEY', 'NEW_API_KEY']
```

## Usage Examples

### Server-side

```javascript
const catalogConfig = require('./src/config/catalogConfig');

// Get current mode
const mode = catalogConfig.getCurrentMode();
console.log(`Running in ${mode.id} mode`);

// Get available catalogs
const movieCatalogs = catalogConfig.getAvailableCatalogs('movie');

// Get app config for frontend
const appConfig = catalogConfig.getAppConfig(req);
```

### Frontend

The frontend automatically receives the catalog configuration through the `/api/app-config` endpoint:

```javascript
// Configuration is available in appConfig
const response = await fetch('/api/app-config');
const config = await response.json();

// Access catalog data
config.ui.catalogs.movies  // Array of movie catalogs
config.ui.icons           // Icon mapping
config.ui.tooltips        // Tooltip mapping
config.ui.defaultToggles  // Default enabled states
```

## Environment Variables

The system validates these environment variables:

| Variable | Required | Purpose | Mode Dependency |
|----------|----------|---------|-----------------|
| `TVDB_API_KEY` | Yes | Core TVDB functionality | All modes |
| `XXX_API_KEY` | No | Enables catalog mode | Catalog mode |
| `OMDB_API_KEY` | No | Enhanced metadata | All modes |
| `MONGODB_URI` | No | Persistent caching | All modes |

## Configuration Flow

1. **Server Startup**:
   - Validate all environment variables
   - Determine addon mode based on configured API keys
   - Log configuration status

2. **Frontend Request**:
   - Backend provides complete configuration via `/api/app-config`
   - Frontend receives catalogs, icons, tooltips, and toggles
   - No hardcoded catalog definitions in frontend

3. **Manifest Generation**:
   - Dynamic catalog list based on available API keys
   - Proper Stremio catalog format
   - Mode-specific catalog filtering

## Benefits

1. **Content Agnostic**: Easy to add new content types without code changes
2. **Generic API Validation**: Automatically handles new API keys
3. **Centralized Management**: All catalog logic in one place
4. **Future Proof**: Extensible architecture for new providers
5. **Smart Defaults**: Automatic placeholder detection
6. **Consistent UI**: Unified icon and tooltip management
