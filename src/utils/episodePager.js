/**
 * Paged walk over a TVDB episode endpoint.
 * The response carries links.next, total_items and page_size, so the end of the list is
 * known from the first page instead of costing an extra empty request to discover.
 */

const MAX_PAGES = 50;
const MAX_FANOUT_PAGES = 4;

/**
 * Rejects if the first page fails. A later page failing ends the walk with the pages already collected
 */
async function fetchAllEpisodePages(apiClient, endpoint) {
    const first = await apiClient.makeRequest(endpoint, { page: 0 });
    let episodes = first?.data?.episodes || [];
    if (episodes.length === 0 || !first?.links?.next) {
        return episodes;
    }

    const { total_items: totalItems, page_size: pageSize } = first.links;
    const expectedPages = totalItems && pageSize ? Math.min(Math.ceil(totalItems / pageSize), MAX_PAGES) : 1;
    const fanoutPages = Math.min(expectedPages - 1, MAX_FANOUT_PAGES);

    let page = 1;
    let hasNext = true;

    // The first page reports the total, so the pages it implies are independent and fetched together.
    if (fanoutPages > 0) {
        const settled = await Promise.allSettled(
            Array.from({ length: fanoutPages }, (_, index) => apiClient.makeRequest(endpoint, { page: index + 1 }))
        );

        for (const result of settled) {
            if (result.status !== 'fulfilled') return episodes;
            const pageEpisodes = result.value?.data?.episodes || [];
            if (pageEpisodes.length === 0) return episodes;
            episodes = episodes.concat(pageEpisodes);
            hasNext = Boolean(result.value?.links?.next);
            page++;
        }
    }

    // links.next stays the authority, so an understated total_items costs a round trip, never an episode.
    while (hasNext && page < MAX_PAGES) {
        const body = await apiClient.makeRequest(endpoint, { page });
        const pageEpisodes = body?.data?.episodes || [];
        if (pageEpisodes.length === 0) break;
        episodes = episodes.concat(pageEpisodes);
        hasNext = Boolean(body?.links?.next);
        page++;
    }

    return episodes;
}

module.exports = { fetchAllEpisodePages, MAX_PAGES, MAX_FANOUT_PAGES };
