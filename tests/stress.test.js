/**
 * Stress Tests - Wedding Invitation Server
 * Tests performance under concurrent load
 */

const http = require('http');

const PORT = 3098;
const BASE = `http://localhost:${PORT}`;

/* ==================== HELPERS ==================== */
function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: urlPath,
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, ok: res.statusCode < 300 });
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

async function stressTest(name, fn) {
    try {
        const start = Date.now();
        await fn();
        const ms = Date.now() - start;
        console.log(`  ✓ ${name} (${ms}ms)`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}: ${err.message}`);
        errors.push({ name, message: err.message });
        failed++;
    }
}

/* ==================== STRESS TESTS ==================== */
async function runStressTests() {
    // Start the server with test port
    process.env.PORT = String(PORT);
    const app = require('../server');
    const server = app.listen(PORT);
    await new Promise(r => setTimeout(r, 400));

    console.log('\n🏋️  Stress Tests\n');

    /* --- Concurrent RSVP --- */
    await stressTest('50 concurrent RSVP submissions all succeed', async () => {
        const concurrency = 50;
        const promises = Array.from({ length: concurrency }, (_, i) =>
            request('POST', '/api/rsvp', {
                name: `Guest_${i}`,
                attendance: i % 2 === 0 ? 'yes' : 'no',
                guests: (i % 4) + 1,
                side: i % 2 === 0 ? 'groom' : 'bride',
            })
        );
        const results = await Promise.all(promises);
        const allOk = results.every(r => r.ok);
        if (!allOk) {
            const fails = results.filter(r => !r.ok).length;
            throw new Error(`${fails}/${concurrency} requests failed`);
        }
    });

    /* --- Concurrent Heart Increments --- */
    await stressTest('100 concurrent heart increments succeed', async () => {
        const concurrency = 100;
        const promises = Array.from({ length: concurrency }, () =>
            request('POST', '/api/hearts')
        );
        const results = await Promise.all(promises);
        const allOk = results.every(r => r.ok);
        if (!allOk) {
            const fails = results.filter(r => !r.ok).length;
            throw new Error(`${fails}/${concurrency} heart requests failed`);
        }
    });

    /* --- Concurrent Blessing Reads --- */
    await stressTest('200 concurrent blessing reads return valid response', async () => {
        const concurrency = 200;
        const promises = Array.from({ length: concurrency }, () =>
            request('GET', '/api/blessings')
        );
        const results = await Promise.all(promises);
        const allOk = results.every(r => r.ok);
        if (!allOk) {
            const fails = results.filter(r => !r.ok).length;
            throw new Error(`${fails}/${concurrency} read requests failed`);
        }
    });

    /* --- Concurrent Blessing Writes --- */
    await stressTest('50 concurrent blessing submissions succeed', async () => {
        const concurrency = 50;
        const promises = Array.from({ length: concurrency }, (_, i) =>
            request('POST', '/api/blessings', {
                name: `Stress_${i}`,
                text: `Stress test blessing number ${i} - chúc mừng!`,
            })
        );
        const results = await Promise.all(promises);
        const allOk = results.every(r => r.ok);
        if (!allOk) {
            const fails = results.filter(r => !r.ok).length;
            throw new Error(`${fails}/${concurrency} blessing requests failed`);
        }
    });

    /* --- Mixed Load --- */
    await stressTest('Mixed load: 40 reads + 20 writes all succeed', async () => {
        const reads = Array.from({ length: 40 }, () => request('GET', '/api/blessings'));
        const writes = Array.from({ length: 20 }, (_, i) => request('POST', '/api/blessings', {
            name: `Mix_${i}`,
            text: `Message ${i}`,
        }));
        const results = await Promise.all([...reads, ...writes]);
        const allOk = results.every(r => r.ok);
        if (!allOk) {
            const fails = results.filter(r => !r.ok).length;
            throw new Error(`${fails}/60 mixed requests failed`);
        }
    });

    /* --- Response time --- */
    await stressTest('GET /api/hearts responds in < 200ms', async () => {
        const start = Date.now();
        await request('GET', '/api/hearts');
        const ms = Date.now() - start;
        if (ms > 200) throw new Error(`Response took ${ms}ms (limit: 200ms)`);
    });

    await stressTest('GET /api/blessings responds in < 200ms', async () => {
        const start = Date.now();
        await request('GET', '/api/blessings');
        const ms = Date.now() - start;
        if (ms > 200) throw new Error(`Response took ${ms}ms (limit: 200ms)`);
    });

    server.close();
}

/* ==================== MAIN ==================== */
(async () => {
    await runStressTests();
    console.log(`\n${passed > 0 ? '✅' : '❌'} Stress: ${passed} passed, ${failed} failed`);
    if (errors.length) {
        errors.forEach(e => console.log(`  - ${e.name}: ${e.message}`));
    }
    process.exit(failed > 0 ? 1 : 0);
})();
