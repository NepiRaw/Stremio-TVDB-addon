
<div align="center">

# Stremio TVDB Addon

<p>
  <img src="https://img.shields.io/badge/Stremio-Addon-purple" alt="Stremio" />
  <img src="https://img.shields.io/github/v/release/NepiRaw/Stremio-TVDB-addon?label=Release" alt="Release" />
  <img src="https://img.shields.io/badge/Node.js-18+-brightgreen" alt="Node.js" />
</p>

</div>

---

<p align="center"><i>Stremio addon that provides comprehensive catalog search functionality using TVDB (The TV Database) API for movies, series, and anime with intelligent caching and IMDb rating integration.<br>
<b>Unofficial - not affiliated with TVDB.</b></i></p>

---

## 🎯 Features

- 🎬 **Movies**: Complete movie catalog with detailed metadata
- 📺 **TV Series**: Full series information with seasons and episodes
- 🎌 **Anime**: Comprehensive anime database integration
- 🔍 **Search-Only Catalogs**: Clean, clutter-free browsing experience
- 🌐 **Multi-Language Support**: 48 languages accepted, 11 offered in the configuration dropdown

## 📋 Table of Contents

- [Configuration](#%EF%B8%8F-configuration)
- [Self-Hosting Installation](#-self-hosting-installation)
  - [Docker Compose (Recommended)](#-docker-compose-recommended)
  - [Manual Installation](#-manual-installation)
  - [Vercel Deployment](#vercel-deployment)
- [Environment Variables](#-environment-variables)
- [API Documentation](#-api-documentation)
- [Future Enhancements](#-future-enhancements)
- [Documentation](#-documentation)

## ⚙️ Configuration

### Access Configuration
1. Navigate to your addon URL (e.g., `http://localhost:3000` or your domain)
2. Select your preferred language from the dropdown
3. Click "Install Addon" to add it to Stremio

### Configuration Options
- **Language Selection**: 11 languages in the dropdown
  - Content metadata is shown in your preferred language when available
  - Falls back to English when a translation is missing
  - The backend accepts all 48 codes listed by `GET /api/languages`, so a URL such as `/swe/manifest.json` works even though Swedish is not in the dropdown. An unknown code falls back to English rather than failing.

## 🚀 Self-Hosting Installation

### 🐳 Docker Compose (Recommended)

1. **Create docker-compose.yml:**

```yaml
# Option 1: Use the prebuilt image (recommended for most users)
version: '3.8'
services:
  stremio-tvdb-addon:
    image: NepiRaw/Stremio-TVDB-addon:latest
    container_name: stremio-tvdb-addon
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

> **Note:**
> - The prebuilt image already contains all dependencies and the built frontend, and starts the server automatically.
> - If you are building your own image (e.g., for development or custom changes), **make sure to build the frontend before starting the server**:
>   1. Run `npm install` in the root.
>   2. Run `npm run build` in the root (this will install and build the frontend automatically).
>   3. Then start the backend server (the backend serves the built frontend from `frontend/dist`).
> - If you want to use your own MongoDB instance for persistent caching, set `MONGODB_URI` in your `.env` file to point to your database (e.g., MongoDB Atlas or a local instance). This compose file does not run MongoDB by default.

2. **Set up environment:**

```bash
git clone https://github.com/NepiRaw/Stremio-TVDB-addon.git
cd Stremio-TVDB-addon
cp .env.example .env
# Edit .env with your API keys
npm install
npm run build
docker-compose up -d
```

3. **Access your addon at `http://localhost:3000` (or any other configured domain)**



### 🐍 Manual Installation

1. **Prerequisites:**
   - Node.js 18+ installed
   - MongoDB (optional, for persistent caching)

2. **Installation:**
```bash
# Clone the repository
git clone https://github.com/NepiRaw/Stremio-TVDB-addon.git
cd Stremio-TVDB-addon

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your configuration

# Build the frontend and backend in one step
npm run build

# Start the addon (backend will serve the built frontend)
npm start
```

3. **Access your addon at `http://localhost:3000` (or any other configured domain)**



### 🔺Vercel Deployment

1. **Copy this repository to your GitHub account**

2. **Deploy to Vercel:**
   - Connect your GitHub repository to Vercel


   - Configure environment variables in the Vercel dashboard (see below)

   - Vercel will now auto-detect the correct install and build commands:
     - **Install command:** `npm install` (auto-detected)
     - **Build command:** `npm run build` (auto-detected, runs the root build script)
   - Deploy

3. **Environment Variables in Vercel:**
   - Set all required variables from the table below
   - Use MongoDB Atlas for database (free tier available)


> **Note:**
> - The backend Express server serves the built frontend from `frontend/dist`.
> - The install command runs before the build command, so you do not need to run `npm install` again in the build command.
> - If you use a custom Vercel configuration, ensure the build command includes building the frontend as shown above.

---

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TVDB_API_KEY` | ✅ Yes | - | TVDB API key from [thetvdb.com](https://thetvdb.com/api-information) |
| `OMDB_API_KEY` | ❌ Optional | - | OMDb API key for enhanced ratings from [omdbapi.com](http://www.omdbapi.com/apikey.aspx) |
| `BASE_URL` | ❌ Optional | Auto-detect | Base URL for the addon (production deployments) |
| `PORT` | ❌ Optional | `3000` | Server port |
| `ADMIN_API_KEY` | 🔸 Recommended | - | Secure key for admin operations and monitoring |
| `MONGODB_URI` | 🔸 Recommended | - | MongoDB connection string for persistent caching |
| `MONGO_DB_NAME` | ❌ Optional | - | Database name for the L2 cache |
| `CACHE_TYPE` | ❌ Optional | `memory` | Cache strategy: `memory`, `hybrid`, or `mongodb` |
| `NODE_ENV` | ❌ Optional | `development` | `development`, `production` or `test` |
| `LOG_LEVEL` | ❌ Optional | `info` | `error`, `warn`, `info`, `debug` or `trace` |
| `LOG_WATCHDOG_MS` | ❌ Optional | `2000` | When a still-running request gets a watchdog log line |
| `TVDB_REQUEST_TIMEOUT_MS` | ❌ Optional | `5000` | Abandons a TVDB request that stopped answering |
| `META_CAST_LIMIT` | ❌ Optional | `3` | How many actors reach `meta.cast`. `0` means none |

### Cache Configuration Details
- **`memory`**: Fast in-memory cache, no persistence (good for development)
- **`hybrid`**: L1 (memory) + L2 (MongoDB) - **Recommended for production**
- **`mongodb`**: MongoDB-only cache, slower but full persistence

---

## 📡 API Documentation

### Public Endpoints
- `GET /` - Configuration and installation page
- `GET /{language}/manifest.json` - Stremio addon manifest
- `GET /{language}/catalog/{type}/{id}/{extra}.json` - Search
- `GET /{language}/meta/{type}/{id}.json` - Metadata
- `GET /health` - Health check

The unprefixed `/manifest.json`, `/catalog/…` and `/meta/…` routes exist as a fallback and behave as English. The language-prefixed form is what the configuration page installs.

### Admin Endpoints (Secured)
- `GET /admin/cache/stats` - Cache performance statistics
- `GET /admin/updates/status` - Updates service status  
- `POST /admin/updates/trigger` - Manual updates trigger

*Admin endpoints require `ADMIN_API_KEY` and are rate-limited (10 req/min per IP)*


---

## 🌟 Future Enhancements

- [ ] Content recommendations (popular, trending, ...)

---

## 📚 Documentation

- [API Documentation](docs/API.md) - routes, real payload shapes, admin endpoints
- [Development Guide](docs/DEVELOPMENT.md) - project structure, TVDB endpoints, deployment, environment variables
- [Caching Strategy](docs/CACHING_STRATEGY.md) - the six cache tiers, TTLs, invalidation and tooling

---

<div align="center">
<b>Enjoy 😊</b>
</div>