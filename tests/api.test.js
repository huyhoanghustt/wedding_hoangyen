/**
 * API Unit Tests - Wedding Invitation Server
 * Tests all RSVP, Blessings, and Hearts endpoints
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Use a test port and temporary data files
process.env.PORT = '3099';
const TEST_DATA_DIR = path.join(__dirname, '../data_test');
const TEST_GUEST_LINKS_FILE = path.join(TEST_DATA_DIR, 'guest-links.json');
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.GUEST_LINKS_FILE = TEST_GUEST_LINKS_FILE;

// Override data directory before requiring server
const origCwd = process.cwd();

let server;
let app;

/* ==================== HELPERS ==================== */
function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3099,
            path: urlPath,
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}: ${err.message}`);
        errors.push({ name, message: err.message });
        failed++;
    }
}

/* ==================== SETUP ==================== */
async function setup() {
    // Clean up test data
    if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'rsvp.json'), '[]');
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'blessings.json'), '[]');
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'hearts.json'), JSON.stringify({ count: 0 }));

    const token = crypto
        .createHash('sha256')
        .update('Lời mời cho bác An', 'utf8')
        .digest('hex');

    const now = new Date().toISOString();
    fs.writeFileSync(TEST_GUEST_LINKS_FILE, JSON.stringify({
        version: 1,
        updated_at: now,
        entries: [
            {
                token,
                phrase: 'Lời mời cho bác An',
                guest_name: 'Bác An',
                invitation_title: 'Kính mời Bác An',
                created_at: now,
                updated_at: now,
            },
        ],
    }, null, 2));

    // Start server
    app = require('../server');
    server = app.listen(3099);
    await new Promise(r => setTimeout(r, 300));
}

async function teardown() {
    server.close();
    if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
}

/* ==================== TESTS ==================== */
async function runTests() {
    console.log('\n📋 API Unit Tests\n');

    /* --- RSVP Tests --- */
    console.log('RSVP:');

    await test('POST /api/rsvp with valid data returns 201', async () => {
        const res = await request('POST', '/api/rsvp', {
            name: 'Test User',
            attendance: 'yes',
            guests: 2,
            side: 'groom',
        });
        assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.entry.id, 'Entry should have an id');
        assert.strictEqual(res.body.entry.name, 'Test User');
        assert.strictEqual(res.body.entry.attendance, 'yes');
        assert.strictEqual(res.body.entry.guests, 2);
        assert.strictEqual(res.body.entry.side, 'groom');
    });

    await test('POST /api/rsvp with "no" attendance returns 201', async () => {
        const res = await request('POST', '/api/rsvp', {
            name: 'Another User',
            attendance: 'no',
            guests: 1,
            side: 'bride',
        });
        assert.strictEqual(res.status, 201);
    });

    await test('POST /api/rsvp missing name returns 400', async () => {
        const res = await request('POST', '/api/rsvp', {
            attendance: 'yes',
            guests: 1,
            side: 'groom',
        });
        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error, 'Should have error field');
    });

    await test('POST /api/rsvp invalid attendance returns 400', async () => {
        const res = await request('POST', '/api/rsvp', {
            name: 'Test',
            attendance: 'maybe',
            guests: 1,
            side: 'groom',
        });
        assert.strictEqual(res.status, 400);
    });

    await test('GET /api/rsvp returns array with saved entries', async () => {
        const res = await request('GET', '/api/rsvp');
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body), 'Response should be an array');
        assert.ok(res.body.length >= 1, 'Should have at least 1 entry');
    });

    /* --- Blessings Tests --- */
    console.log('\nBlessings:');

    await test('GET /api/blessings returns empty array initially', async () => {
        const res = await request('GET', '/api/blessings');
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body));
    });

    await test('POST /api/blessings saves and returns entry', async () => {
        const res = await request('POST', '/api/blessings', {
            name: 'Khách mời A',
            text: 'Chúc mừng hạnh phúc!',
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.entry.name, 'Khách mời A');
        assert.strictEqual(res.body.entry.text, 'Chúc mừng hạnh phúc!');
    });

    await test('POST /api/blessings without text returns 400', async () => {
        const res = await request('POST', '/api/blessings', { name: 'Test' });
        assert.strictEqual(res.status, 400);
    });

    await test('GET /api/blessings returns saved blessings', async () => {
        const res = await request('GET', '/api/blessings');
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.length >= 1, 'Should return at least 1 blessing');
        const found = res.body.find(b => b.text === 'Chúc mừng hạnh phúc!');
        assert.ok(found, 'Should find the blessing we posted');
    });

    await test('POST /api/blessings uses default name when missing', async () => {
        const res = await request('POST', '/api/blessings', { text: 'Yêu thương!' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.entry.name, 'Khách mời');
    });

    /* --- Blessing Source Tests --- */
    console.log('\nBlessing Source:');

    await test('POST /api/blessings without source defaults to __index__', async () => {
        const res = await request('POST', '/api/blessings', { text: 'Chúc mừng từ index!' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.entry.source, '__index__');
    });

    await test('POST /api/blessings with empty source defaults to __index__', async () => {
        const res = await request('POST', '/api/blessings', { text: 'Chúc mừng!', source: '' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.entry.source, '__index__');
    });

    await test('POST /api/blessings with explicit __index__ source', async () => {
        const res = await request('POST', '/api/blessings', { text: 'Chúc mừng!', source: '__index__' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.entry.source, '__index__');
    });

    await test('POST /api/blessings with valid token source (exists in guest-links)', async () => {
        const token = crypto
            .createHash('sha256')
            .update('Lời mời cho bác An', 'utf8')
            .digest('hex');

        const res = await request('POST', '/api/blessings', {
            text: 'Chúc mừng từ token page!',
            source: token,
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.entry.source, token);
    });

    await test('POST /api/blessings with invalid source format returns 400', async () => {
        const res = await request('POST', '/api/blessings', {
            text: 'Chúc mừng!',
            source: 'invalid-not-sha256',
        });
        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error.includes('source'));
    });

    await test('POST /api/blessings with unknown token source returns 400', async () => {
        const unknownToken = 'a'.repeat(64); // Valid SHA-256 format but not in guest-links

        const res = await request('POST', '/api/blessings', {
            text: 'Chúc mừng!',
            source: unknownToken,
        });
        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error.includes('source'));
    });

    await test('Legacy blessings without source field are still readable', async () => {
        // Manually add a legacy blessing without source field
        const blessingsPath = path.join(TEST_DATA_DIR, 'blessings.json');
        const blessings = JSON.parse(fs.readFileSync(blessingsPath, 'utf8'));
        blessings.push({
            id: 999888777,
            name: 'Legacy Guest',
            text: 'Old blessing without source',
            createdAt: new Date().toISOString(),
        });
        fs.writeFileSync(blessingsPath, JSON.stringify(blessings, null, 2));

        const res = await request('GET', '/api/blessings');
        assert.strictEqual(res.status, 200);
        const legacy = res.body.find(b => b.id === 999888777);
        assert.ok(legacy, 'Should find legacy blessing');
        assert.strictEqual(legacy.name, 'Legacy Guest');
        assert.strictEqual(legacy.text, 'Old blessing without source');
    });

    /* --- Hearts Tests --- */
    console.log('\nHearts:');

    await test('GET /api/hearts returns count object', async () => {
        const res = await request('GET', '/api/hearts');
        assert.strictEqual(res.status, 200);
        assert.ok(typeof res.body.count === 'number', 'count should be a number');
    });

    await test('POST /api/hearts increments count', async () => {
        const before = (await request('GET', '/api/hearts')).body.count;
        const res = await request('POST', '/api/hearts');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.count, before + 1, 'Count should increment by 1');
    });

    await test('POST /api/hearts increments multiple times correctly', async () => {
        const before = (await request('GET', '/api/hearts')).body.count;
        await request('POST', '/api/hearts');
        await request('POST', '/api/hearts');
        const after = (await request('GET', '/api/hearts')).body.count;
        assert.strictEqual(after, before + 2, 'Count should increment by 2');
    });

    /* --- Static Files --- */
    console.log('\nStatic:');

    await test('GET / returns 200 with HTML', async () => {
        const res = await new Promise((resolve, reject) => {
            http.get('http://localhost:3099/', (r) => {
                let data = '';
                r.on('data', c => data += c);
                r.on('end', () => resolve({ status: r.statusCode, body: data }));
            }).on('error', reject);
        });
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.includes('<!DOCTYPE html>'), 'Should return HTML');
    });

    await test('GET /<valid-existing-token> contains personalization bootstrap payload', async () => {
        const token = crypto
            .createHash('sha256')
            .update('Lời mời cho bác An', 'utf8')
            .digest('hex');

        const res = await new Promise((resolve, reject) => {
            http.get(`http://localhost:3099/${token}`, (r) => {
                let data = '';
                r.on('data', c => data += c);
                r.on('end', () => resolve({ status: r.statusCode, body: data }));
            }).on('error', reject);
        });

        assert.strictEqual(res.status, 200);
        assert.ok(res.body.includes('window.__INVITATION_PERSONALIZATION__='));
        assert.ok(res.body.includes('"guestName":"Bác An"'));
        assert.ok(res.body.includes('"invitationTitle":"Kính mời Bác An"'));
    });

    await test('GET /<valid-missing-token> returns default page without personalization bootstrap', async () => {
        const missingToken = 'a'.repeat(64);

        const res = await new Promise((resolve, reject) => {
            http.get(`http://localhost:3099/${missingToken}`, (r) => {
                let data = '';
                r.on('data', c => data += c);
                r.on('end', () => resolve({ status: r.statusCode, body: data }));
            }).on('error', reject);
        });

        assert.strictEqual(res.status, 200);
        assert.ok(res.body.includes('<!DOCTYPE html>'));
        assert.ok(!res.body.includes('window.__INVITATION_PERSONALIZATION__='));
    });
}

/* ==================== MAIN ==================== */
(async () => {
    try {
        await setup();
        await runTests();
    } finally {
        await teardown();
    }

    console.log(`\n${passed > 0 ? '✅' : '❌'} Results: ${passed} passed, ${failed} failed`);
    if (errors.length) {
        console.log('\nFailed:');
        errors.forEach(e => console.log(`  - ${e.name}: ${e.message}`));
    }
    process.exit(failed > 0 ? 1 : 0);
})();
