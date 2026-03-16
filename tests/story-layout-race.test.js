const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function createRuntime(fetchImpl) {
    const listeners = {};

    const document = {
        hidden: false,
        documentElement: {
            clientWidth: 500,
            style: { setProperty() {} },
        },
        body: {
            appendChild() {},
            removeChild() {},
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        createElement() {
            return {
                style: {},
                setAttribute() {},
                appendChild() {},
                removeChild() {},
                focus() {},
                select() {},
                setSelectionRange() {},
                classList: { add() {}, remove() {}, toggle() {} },
            };
        },
        addEventListener(name, fn) {
            listeners[name] = fn;
        },
        execCommand() { return false; },
    };

    const windowObj = {
        requestAnimationFrame(fn) {
            fn();
            return 1;
        },
        addEventListener() {},
        matchMedia() {
            return { matches: false };
        },
    };

    const context = {
        console,
        setTimeout,
        clearTimeout,
        window: windowObj,
        document,
        navigator: {
            userAgent: 'node-test',
            platform: 'Linux',
            maxTouchPoints: 0,
            clipboard: null,
        },
        fetch: fetchImpl,
    };

    windowObj.window = windowObj;
    windowObj.document = document;

    return { context, listeners };
}

async function test(name, fn) {
    try {
        await fn();
        console.log(`✅ ${name}`);
        return true;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(error && error.stack ? error.stack : error);
        return false;
    }
}

(async () => {
    const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
    const source = fs.readFileSync(appJsPath, 'utf8');

    let passed = 0;
    let failed = 0;

    const ok = await test('loadConfig re-initializes story layout after async story-layout fetch settles', async () => {
        const storyDeferred = createDeferred();

        const fetchMock = (url) => {
            if (url === '/data/story-layout.json') {
                return storyDeferred.promise;
            }

            if (url === '/data/hero_gallery.json') {
                return Promise.resolve({
                    ok: false,
                    json: async () => ({}),
                });
            }

            if (url === '/data/invitations.json') {
                return Promise.resolve({
                    ok: false,
                    json: async () => ({}),
                });
            }

            if (url === '/data/wedding.json') {
                return Promise.resolve({
                    ok: false,
                    json: async () => ({}),
                });
            }

            throw new Error(`Unexpected fetch URL in test: ${url}`);
        };

        const runtime = createRuntime(fetchMock);
        vm.runInNewContext(source, runtime.context, { filename: 'public/js/app.js' });

        const W = runtime.context.window.__WeddingApp;
        assert.ok(W, 'Expected window.__WeddingApp to be initialized');
        assert.strictEqual(typeof W.loadConfig, 'function', 'Expected loadConfig to be exposed');

        let initStoryLayoutCalls = 0;
        W.initStoryLayout = () => {
            initStoryLayoutCalls += 1;
        };

        await W.loadConfig();
        assert.strictEqual(initStoryLayoutCalls, 0, 'Story init should not run before story-layout fetch settles');

        storyDeferred.resolve({
            ok: true,
            json: async () => ({ story_layout: { blocks: [] } }),
        });

        const deadline = Date.now() + 300;
        while (initStoryLayoutCalls === 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        assert.strictEqual(initStoryLayoutCalls, 1, 'Story init should re-run once story-layout fetch settles');
    });

    if (ok) passed += 1;
    else failed += 1;

    console.log(`\n${failed === 0 ? '✅' : '❌'} Results: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
