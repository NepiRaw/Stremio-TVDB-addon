/**
 * Shared Catalog Configuration
 * Central configuration for all available catalog types and their default settings
 * Used by both backend (Node.js) and frontend (Vue.js) for consistency
 */

const CATALOG_CONFIG = {
    // Default enabled/disabled state and ordering
    defaultConfig: {
        movies: [
            { 
                id: 'movie-popular', 
                name: 'Popular Movies', 
                category: 'popular', 
                enabled: true, 
                order: 1,
                description: 'Most popular movies currently trending'
            },
            { 
                id: 'movie-trending', 
                name: 'Trending Movies', 
                category: 'trending', 
                enabled: true, 
                order: 2,
                description: 'Movies trending this week'
            },
            { 
                id: 'movie-toprated', 
                name: 'Top Rated Movies', 
                category: 'top_rated', 
                enabled: true, 
                order: 3,
                description: 'Highest rated movies of all time'
            },
            { 
                id: 'movie-latest', 
                name: 'Latest Movies', 
                category: 'latest', 
                enabled: false, 
                order: 4,
                description: 'Movies currently in theaters (Now Playing)'
            },
            { 
                id: 'movie-discover', 
                name: 'Discover Movies', 
                category: 'discover', 
                enabled: false, 
                order: 5,
                description: 'Discover new movies based on popularity'
            }
        ],
        series: [
            { 
                id: 'series-popular', 
                name: 'Popular Series', 
                category: 'popular', 
                enabled: true, 
                order: 1,
                description: 'Most popular TV series currently trending'
            },
            { 
                id: 'series-trending', 
                name: 'Trending Series', 
                category: 'trending', 
                enabled: true, 
                order: 2,
                description: 'TV series trending this week'
            },
            { 
                id: 'series-toprated', 
                name: 'Top Rated Series', 
                category: 'top_rated', 
                enabled: true, 
                order: 3,
                description: 'Highest rated TV series of all time'
            },
            { 
                id: 'series-latest', 
                name: 'Latest Series', 
                category: 'latest', 
                enabled: false, 
                order: 4,
                description: 'TV series airing today'
            },
            { 
                id: 'series-discover', 
                name: 'Discover Series', 
                category: 'discover', 
                enabled: false, 
                order: 5,
                description: 'Discover new TV series based on popularity'
            }
        ]
    },

    // Category metadata and validation
    categories: {
        popular: {
            tmdbEndpoint: 'popular',
            cacheTTL: 24 * 60 * 60 * 1000, // 24 hours - stable content
            sortBy: 'popularity',
            icon: '🔥',
            description: 'Most popular content based on user engagement'
        },
        trending: {
            tmdbEndpoint: 'trending',
            cacheTTL: 12 * 60 * 60 * 1000, // 12 hours - dynamic content
            sortBy: 'trending_score',
            icon: '📈',
            description: 'Content trending this week'
        },
        top_rated: {
            tmdbEndpoint: 'top_rated',
            cacheTTL: 24 * 60 * 60 * 1000, // 24 hours - very stable content
            sortBy: 'vote_average',
            icon: '⭐',
            description: 'Highest rated content of all time'
        },
        latest: {
            tmdbEndpoint: 'now_playing', // movies: now_playing, tv: airing_today
            cacheTTL: 12 * 60 * 60 * 1000, // 12 hours - changes frequently
            sortBy: 'release_date',
            icon: '🆕',
            description: 'Latest releases currently available'
        },
        discover: {
            tmdbEndpoint: 'discover',
            cacheTTL: 12 * 60 * 60 * 1000, // 12 hours - dynamic content
            sortBy: 'popularity',
            icon: '🔍',
            description: 'Discover new content based on various criteria'
        }
    },

    // Content type metadata
    contentTypes: {
        movie: {
            name: 'Movies',
            icon: '🎬',
            tmdbType: 'movie'
        },
        series: {
            name: 'TV Series',
            icon: '📺',
            tmdbType: 'tv'
        }
    },

    // Validation rules
    validation: {
        requiredFields: ['id', 'name', 'category', 'enabled', 'order'],
        validCategories: ['popular', 'trending', 'top_rated', 'latest', 'discover'],
        validContentTypes: ['movie', 'series'],
        maxOrder: 100,
        minOrder: 1
    },

    // UI Configuration for frontend
    ui: {
        defaultTabOrder: ['movies', 'series'],
        maxCatalogsPerType: 10,
        enableDragAndDrop: true,
        showDescriptions: true,
        showIcons: true,
        groupByType: true
    }
};

// Export for both Node.js (CommonJS) and browser/Vue.js (ES modules)
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = CATALOG_CONFIG;
} else if (typeof window !== 'undefined') {
    // Browser environment - attach to window for global access
    window.CATALOG_CONFIG = CATALOG_CONFIG;
}

// Also export as default for ES modules
if (typeof exports !== 'undefined') {
    exports.default = CATALOG_CONFIG;
}
