/**
 * TVDB Catalog Transformer
 * Builds Stremio search rows from the /search payload alone, with IMDB filtering.
 * Posters are then upgraded to a language-specific one, one cached call per row.
 */

const { hasValidImdbId, hasValidPoster, isUsableImage, extractImdbId } = require('../../utils/imdbFilter');

class CatalogTransformer {
    constructor(contentFetcher, translationService, artworkHandler, cacheService, logger) {
        this.contentFetcher = contentFetcher;
        this.translationService = translationService;
        this.artworkHandler = artworkHandler;
        this.cacheService = cacheService;
        this.logger = logger;
    }

    transformSearchResults(results, type, userLanguage = null) {
        if (!Array.isArray(results)) return [];

        const metas = results
            .filter(item => {
                if (type === 'movie' && item.type !== 'movie') return false;
                if (type === 'series' && item.type !== 'series') return false;
                return Boolean(item.id && item.name);
            })
            .filter(item => hasValidImdbId(item) && hasValidPoster(item))
            .map(item => this.buildMetaFromSearchItem(item, userLanguage));

        this.logger?.debug?.(`Search transform: ${results.length} results to ${metas.length} metas, 0 TVDB calls`);
        return metas;
    }

    buildMetaFromSearchItem(item, userLanguage = null) {
        const stremioType = item.type === 'movie' ? 'movie' : 'series';
        const numericId = item.tvdb_id ? String(item.tvdb_id) : this.extractNumericId(item.id);

        const translatedName = this.translationService.selectPreferredTranslation(item.translations, userLanguage);
        const translatedDescription = this.translationService.selectPreferredTranslation(item.overviews, userLanguage);

        const meta = {
            id: `tvdb-${numericId}`,
            type: stremioType,
            name: translatedName || item.name || item.primary_title || 'Unknown Title'
        };

        const posterSources = [item.image_url, item.thumbnail].filter(isUsableImage);
        if (posterSources.length > 0) {
            meta.poster = posterSources[0];
        }

        const yearSources = [
            item.year,
            item.first_air_time ? new Date(item.first_air_time).getFullYear() : null
        ];
        for (const year of yearSources) {
            if (year && year > 1800 && year <= new Date().getFullYear() + 5) {
                meta.year = Number(year);
                break;
            }
        }

        const description = translatedDescription || item.overview;
        if (description) {
            meta.description = description;
        }

        if (Array.isArray(item.genres)) {
            const genres = item.genres
                .map(genre => (typeof genre === 'object' ? genre.name || genre.label || genre : genre))
                .filter(genre => genre && typeof genre === 'string' && genre.trim().length > 0)
                .map(genre => genre.trim());
            if (genres.length > 0) meta.genres = genres;
        }

        const imdbId = extractImdbId(item);
        if (imdbId) meta.imdb_id = imdbId;

        return meta;
    }

    // A failed lookup leaves that row on its payload poster.
    async upgradePosters(metas, type, userLanguage = null) {
        if (!Array.isArray(metas) || metas.length === 0) return metas;

        const tvdbLanguage = this.translationService.mapToTvdbLanguage(userLanguage || 'eng');
        const started = Date.now();

        await Promise.all(metas.map(meta => this.applyLocalisedPoster(meta, type, tvdbLanguage)));

        this.logger?.debug?.(`Poster upgrade: ${metas.length} rows in ${Date.now() - started}ms (${tvdbLanguage})`);
        return metas;
    }

    async applyLocalisedPoster(meta, type, tvdbLanguage) {
        try {
            const numericId = meta.id.replace('tvdb-', '');

            if (type === 'series') {
                const artwork = await this.artworkHandler.getArtwork('series', numericId, tvdbLanguage);
                if (isUsableImage(artwork?.poster)) meta.poster = artwork.poster;
                if (artwork?.logo) meta.logo = artwork.logo;
                return;
            }

            const details = await this.contentFetcher.getMovieExtended(numericId);
            if (!details?.artworks) return;

            const { posterSources } = this.artworkHandler.getArtworkFallbacks({ artworks: details.artworks }, 'movie', tvdbLanguage);
            const poster = posterSources.find(isUsableImage);
            if (poster) meta.poster = poster;
        } catch (error) {
            this.logger?.debug?.(`Poster upgrade skipped for ${meta.id}: ${error.message}`);
        }
    }

    extractNumericId(id) {
        if (typeof id === 'string') {
            const match = id.match(/(\d+)$/);
            return match ? match[1] : id;
        }
        return id;
    }
}

module.exports = CatalogTransformer;
