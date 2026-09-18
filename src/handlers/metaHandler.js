const { context } = require('../utils/logger');
const { hasValidImdbId } = require('../utils/imdbFilter');

const NOT_FOUND_MAX_AGE = 86400;

function notFound(res, error) {
    res.setHeader('Cache-Control', `public, max-age=${NOT_FOUND_MAX_AGE}`);
    return res.status(404).json({ error });
}

/**
 * Extract TVDB language code from URL parameter
 * @param {object} req - Express request object
 * @returns {string} - TVDB 3-character language code (e.g., 'fra', 'spa', 'eng')
 */
function getLanguagePreference(req) {
    if (req.params.language) {
        const urlLang = req.params.language;
        if (/^[a-z]{3}$/.test(urlLang)) {
            return urlLang;
        }
    }
    
    return 'eng';
}

/**
 * Handle metadata requests for specific content
 * Route: /meta/:type/:id.json
 */
const CACHED = 'from cache';

function describeCalls() {
    const calls = context.current()?.calls ?? 0;
    if (calls === 0) return CACHED;
    return `${calls} call${calls === 1 ? '' : 's'}`;
}

async function metaHandler(req, res, tvdbService, rootLogger) {
    const logger = rootLogger?.child ? rootLogger.child('META') : rootLogger;
    try {
        const { type, id } = req.params;
        context.begin({ category: 'META', subject: `${type} ${id}` });

        if (!['movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Invalid content type' });
        }

        let tvdbId;
        let requestedImdbId = null;

        if (id.startsWith('tvdb-')) {
            tvdbId = id.replace('tvdb-', '');
            if (!tvdbId || isNaN(tvdbId)) {
                return res.status(400).json({ error: 'Invalid TVDB ID' });
            }
        } else if (/^tt\d{7,}$/.test(id)) {
            requestedImdbId = id;
            tvdbId = await tvdbService.getTvdbIdFromImdbId(id, type);
            if (!tvdbId) {
                context.note({ outcome: `no TVDB ${type} for ${id}` });
                return notFound(res, 'Content not found by IMDb ID');
            }
            logger?.debug?.(`Resolved IMDb ID ${id} to TVDB ${type} ${tvdbId}`);
        } else {
            return res.status(400).json({ error: 'Invalid ID format. Use tvdb-123456 or tt1234567 format' });
        }

        const userLanguage = getLanguagePreference(req);
        context.note({ subject: `${type} tvdb-${tvdbId}` });

        let detailedData = null;
        let seasonsData = null;

        if (type === 'movie') {
            detailedData = await tvdbService.getMovieDetails(tvdbId);
        } else if (type === 'series') {
            detailedData = await tvdbService.getSeriesExtended(tvdbId);
            seasonsData = detailedData?.seasons || [];
        }

        if (!detailedData) {
            context.note({ outcome: 'not found' });
            return notFound(res, 'Content not found');
        }

        if (requestedImdbId && !hasValidImdbId(detailedData)) {
            const remoteIds = Array.isArray(detailedData.remoteIds) ? detailedData.remoteIds : [];
            detailedData.remoteIds = [...remoteIds, { id: requestedImdbId, type: 2, sourceName: 'IMDB' }];
        }

        const meta = await tvdbService.transformDetailedToStremioMeta(detailedData, type, seasonsData, userLanguage);

        if (!meta) {
            context.note({ outcome: 'not representable' });
            return notFound(res, 'Content not available');
        }

        const via = describeCalls();
        context.note({
            subject: `${type} tvdb-${tvdbId} "${meta.name}"`,
            marker: via === CACHED ? 'cache' : 'ok',
            outcome: type === 'series' ? `${meta.videos?.length ?? 0} videos · ${via}` : via
        });
        res.json({ meta });

    } catch (error) {
        context.note({ outcome: `failed → ${error.message}` });
        logger?.error?.(`meta failed → ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
}

module.exports = metaHandler;
