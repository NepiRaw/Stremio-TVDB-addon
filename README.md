# Stremio TVDB Addon

![Stremio](https://img.shields.io/badge/Stremio-Addon-purple)
![Release](https://img.shields.io/github/v/release/NepiRaw/Stremio-TVDB-addon?label=Release)
![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen)

Stremio addon that provides comprehensive catalog search functionality using TVDB (The TV Database) API for movies, series, and anime with intelligent caching and IMDb rating integration.
Unofficial - not affiliated with TVDB.

## 🎯 Features

- 🎬 **Movies**: Complete movie catalog with detailed metadata
- 📺 **TV Series**: Full series information with seasons and episodes
- 🎌 **Anime**: Comprehensive anime database integration
- 🔍 **Search-Only Catalogs**: Clean, clutter-free browsing experience
- 🌐 **Multi-Language Support**: Content in 11+ languages

## 📋 Table of Contents

- [Configuration](#-configuration)
- [Self-Hosting Installation](#-self-hosting-installation)
  - [Docker Compose (Recommended)](#docker-compose-recommended)
  - [Manual Installation](#manual-installation)
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
- **Language Selection**: Choose from 11 supported languages
  - Content metadata will be shown in your preferred language when available
  - Falls back to English if translation unavailable
- **Cache Type**: Automatically managed based on your environment setup
- **Rating Enhancement**: Automatic IMDb rating integration when available

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
> - The prebuilt image already contains all dependencies and starts the server automatically.
> - If you want to use your own MongoDB instance for persistent caching, set `MONGODB_URI` in your `.env` file to point to your database (e.g., MongoDB Atlas or a local instance). This compose file does not run MongoDB by default.


2. **Set up environment:**

```bash
git clone https://github.com/NepiRaw/Stremio-TVDB-addon.git
cd Stremio-TVDB-addon
cp .env.example .env
# Edit .env with your API keys
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

# Start the addon
npm start
```

3. **Access your addon at `http://localhost:3000` (or any other configured domain)**

### 🔺Vercel Deployment

1. **Copy this repository to your GitHub account**

2. **Deploy to Vercel:**
   - Connect your GitHub repository to Vercel
   - Configure environment variables in Vercel dashboard
   - Deploy

3. **Environment Variables in Vercel:**
   - Set all required variables from the table below
   - Use MongoDB Atlas for database (free tier available)

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TVDB_API_KEY` | ✅ Yes | - | TVDB API key from [thetvdb.com](https://thetvdb.com/api-information) |
| `OMDB_API_KEY` | ❌ Optional | - | OMDb API key for enhanced ratings from [omdbapi.com](http://www.omdbapi.com/apikey.aspx) |
| `BASE_URL` | ❌ Optional | Auto-detect | Base URL for the addon (production deployments) |
| `PORT` | ❌ Optional | `3000` | Server port |
| `ADMIN_API_KEY` | 🔸 Recommended | - | Secure key for admin operations and monitoring |
| `MONGODB_URI` | 🔸 Recommended | - | MongoDB connection string for persistent caching |
| `CACHE_TYPE` | ❌ Optional | `memory` | Cache strategy: `memory`, `hybrid`, or `mongodb` |
| `LOG_LEVEL` | ❌ Optional | `info` | Logging level: `error`, `warn`, `info`, or `debug` |

### Cache Configuration Details
- **`memory`**: Fast in-memory cache, no persistence (good for development)
- **`hybrid`**: L1 (memory) + L2 (MongoDB) - **Recommended for production**
- **`mongodb`**: MongoDB-only cache, slower but full persistence

## 📡 API Documentation

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

## Future Enhancements
- [ ] Content recommendations (popular, trending, ...)

## Documentation

- [API Documentation](docs/API.md) - Complete API reference with admin endpoints
- [Development Guide](docs/DEVELOPMENT.md) - Development setup and architectural patterns  
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment with security considerations
- [Caching Strategy](docs/CACHING_STRATEGY.md) - Performance optimization and updates system

## Enjoy 😊