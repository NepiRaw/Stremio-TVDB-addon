const request = require('supertest');
const app = require('../server');

describe('TVDB Addon API', () => {
    beforeAll(async () => {
        // Wait a moment for server to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    describe('Installation Page', () => {
        test('GET / should return HTML installation page', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);
            
            expect(response.headers['content-type']).toMatch(/text\/html/);
            expect(response.text).toContain('TVDB Catalog');
            expect(response.text).toContain('Install Addon');
        });
    });

    describe('Manifest', () => {
        test('GET /manifest.json should return valid manifest', async () => {
            const response = await request(app)
                .get('/manifest.json')
                .expect(200);
            
            expect(response.body).toBeDefined();
            expect(response.body.id).toBe('org.stremio.tvdb-addon');
            expect(response.body.resources).toContain('catalog');
            expect(response.body.resources).toContain('meta');
        });
    });

    describe('Catalog Endpoints', () => {
        test('GET /catalog/movie/tvdb-movies without search should return empty', async () => {
            const response = await request(app)
                .get('/catalog/movie/tvdb-movies/.json')
                .expect(200);
            
            expect(response.body.metas).toEqual([]);
        });

        test('GET /catalog with invalid type should return 400', async () => {
            await request(app)
                .get('/catalog/invalid/tvdb-movies/search=test.json')
                .expect(400);
        });

        test('GET /catalog with invalid catalog ID should return 400', async () => {
            await request(app)
                .get('/catalog/movie/invalid-catalog/search=test.json')
                .expect(400);
        });
    });

    describe('Meta Endpoints', () => {
        test('GET /meta with invalid type should return 400', async () => {
            await request(app)
                .get('/meta/invalid/tvdb-12345.json')
                .expect(400);
        });

        test('GET /meta with invalid ID format should return 400', async () => {
            await request(app)
                .get('/meta/movie/invalid-id.json')
                .expect(400);
        });
    });

    describe('Health Check', () => {
        test('GET /health should return status ok', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);
            
            expect(response.body.status).toBe('ok');
            expect(response.body.timestamp).toBeDefined();
        });
    });

    describe('404 Handler', () => {
        test('GET /nonexistent should return 404', async () => {
            await request(app)
                .get('/nonexistent')
                .expect(404);
        });
    });
});
