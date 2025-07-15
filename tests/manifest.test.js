const { getManifest } = require('../src/utils/manifest');

describe('Manifest', () => {
    test('should generate valid manifest', () => {
        const manifest = getManifest();
        
        expect(manifest).toBeDefined();
        expect(manifest.id).toBe('org.stremio.tvdb-addon');
        expect(manifest.name).toBe('TVDB Catalog');
        expect(manifest.resources).toContain('catalog');
        expect(manifest.resources).toContain('meta');
        expect(manifest.types).toContain('movie');
        expect(manifest.types).toContain('series');
    });

    test('should have valid catalogs', () => {
        const manifest = getManifest();
        
        expect(manifest.catalogs).toHaveLength(2);
        
        const movieCatalog = manifest.catalogs.find(c => c.type === 'movie');
        expect(movieCatalog).toBeDefined();
        expect(movieCatalog.id).toBe('tvdb-movies');
        expect(movieCatalog.extra[0].name).toBe('search');
        expect(movieCatalog.extra[0].isRequired).toBe(true);

        const seriesCatalog = manifest.catalogs.find(c => c.type === 'series');
        expect(seriesCatalog).toBeDefined();
        expect(seriesCatalog.id).toBe('tvdb-series');
        expect(seriesCatalog.extra[0].name).toBe('search');
        expect(seriesCatalog.extra[0].isRequired).toBe(true);
    });
});
