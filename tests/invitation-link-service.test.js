/**
 * Unit tests for invitation link service.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
    createTokenFromPhrase,
    isValidPronounsArray,
    isValidSha256Token,
    validateStoreShape,
    upsertGuestLink,
    findGuestByToken,
    loadGuestLinksStore,
} = require('../scripts/lib/invitation-link-service');

const TMP_DIR = path.join(__dirname, '..', 'tmp', 'tests', 'invitation-link-service');
const STORE_FILE = path.join(TMP_DIR, 'guest-links.json');

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`  ✗ ${name}: ${error.message}`);
        failed++;
    }
}

function resetFixture() {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

(async () => {
    console.log('\n🔗 Invitation Link Service Tests\n');

    resetFixture();

    await test('createTokenFromPhrase is deterministic and returns 64-char lowercase hex', () => {
        const tokenA = createTokenFromPhrase('  Lời mời cho bác An  ');
        const tokenB = createTokenFromPhrase('Lời mời cho bác An');

        assert.strictEqual(tokenA, tokenB);
        assert.strictEqual(tokenA.length, 64);
        assert.ok(/^[a-f0-9]{64}$/.test(tokenA));
    });

    await test('isValidSha256Token validates expected token shape', () => {
        const token = createTokenFromPhrase('sample phrase');
        assert.strictEqual(isValidSha256Token(token), true);
        assert.strictEqual(isValidSha256Token('abc'), false);
        assert.strictEqual(isValidSha256Token('A'.repeat(64)), false);
    });

    await test('isValidPronounsArray accepts any non-empty array of strings', () => {
        assert.strictEqual(isValidPronounsArray(['em']), true);
        assert.strictEqual(
            isValidPronounsArray(['em', 'Em', 'em', 'bọn mình', 'em', 'gia đình', 'hai đứa', 'em', 'chúng mình']),
            true,
        );
    });

    await test('isValidPronounsArray rejects empty/non-array/non-string entries', () => {
        assert.strictEqual(isValidPronounsArray([]), false);
        assert.strictEqual(isValidPronounsArray('em'), false);
        assert.strictEqual(isValidPronounsArray(['em', 123]), false);
    });

    await test('validateStoreShape accepts entries with 9 pronouns', () => {
        const now = new Date().toISOString();
        const sampleStore = {
            version: 1,
            updated_at: now,
            entries: [
                {
                    token: createTokenFromPhrase('sample phrase'),
                    phrase: 'Kính mời',
                    guest_name: 'An',
                    invitation_title: 'Kính mời em An!',
                    pronouns: ['em', 'Em', 'em', 'bọn mình', 'em', 'gia đình', 'hai đứa', 'em', 'chúng mình'],
                    created_at: now,
                    updated_at: now,
                },
            ],
        };

        assert.strictEqual(validateStoreShape(sampleStore), true);
    });

    await test('loadGuestLinksStore auto-heals missing file to empty schema', () => {
        const store = loadGuestLinksStore(STORE_FILE);

        assert.strictEqual(store.version, 1);
        assert.ok(Array.isArray(store.entries));
        assert.strictEqual(store.entries.length, 0);
        assert.ok(fs.existsSync(STORE_FILE));
    });

    await test('loadGuestLinksStore tolerates mixed valid/invalid entries without destructive reset', () => {
        resetFixture();
        const now = new Date().toISOString();
        const validToken = createTokenFromPhrase('valid-guest');

        const mixedStore = {
            version: 1,
            updated_at: now,
            entries: [
                {
                    token: validToken,
                    phrase: 'Kính mời',
                    guest_name: 'Khách A',
                    invitation_title: 'Kính mời Khách A',
                    created_at: now,
                    updated_at: now,
                },
                {
                    token: '',
                    phrase: '',
                    guest_name: '',
                    invitation_title: '',
                    created_at: now,
                    updated_at: now,
                },
            ],
        };

        fs.writeFileSync(STORE_FILE, JSON.stringify(mixedStore, null, 2), 'utf8');

        const store = loadGuestLinksStore(STORE_FILE);
        assert.strictEqual(store.version, 1);
        assert.strictEqual(store.entries.length, 1);
        assert.strictEqual(store.entries[0].token, validToken);

        const persistedRaw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        assert.strictEqual(persistedRaw.entries.length, 2);
    });

    await test('findGuestByToken still resolves valid entry when file has invalid siblings', () => {
        resetFixture();
        const now = new Date().toISOString();
        const validToken = createTokenFromPhrase('find-me');

        const mixedStore = {
            version: 1,
            updated_at: now,
            entries: [
                {
                    token: 'not-a-valid-token',
                    phrase: 'Kính mời',
                    guest_name: 'Sai',
                    invitation_title: 'Kính mời Sai',
                    created_at: now,
                    updated_at: now,
                },
                {
                    token: validToken,
                    phrase: 'Kính mời',
                    guest_name: 'Đúng',
                    invitation_title: 'Kính mời Đúng',
                    custom_body_enabled: true,
                    custom_body: 'Lời mời riêng',
                    created_at: now,
                    updated_at: now,
                },
            ],
        };

        fs.writeFileSync(STORE_FILE, JSON.stringify(mixedStore, null, 2), 'utf8');

        const found = findGuestByToken(validToken, STORE_FILE);
        assert.ok(found);
        assert.strictEqual(found.guest_name, 'Đúng');
        assert.strictEqual(found.custom_body_enabled, true);
    });

    await test('upsertGuestLink creates new record and findGuestByToken resolves it', () => {
        resetFixture();
        const result = upsertGuestLink({
            phrase: 'Kính mời',
            pronounForTitle: 'bác',
            guestName: 'An',
            storePath: STORE_FILE,
        });

        assert.strictEqual(result.status, 'created');
        assert.strictEqual(result.entry.guest_name, 'An');
        assert.strictEqual(result.entry.pronoun_for_title, 'bác');
        assert.strictEqual(result.entry.invitation_title, 'Kính mời bác An!');

        const found = findGuestByToken(result.token, STORE_FILE);
        assert.ok(found);
        assert.strictEqual(found.token, result.token);
        assert.strictEqual(found.guest_name, 'An');
    });

    await test('upsertGuestLink updates existing entry for same phrase+pronoun+guestName', () => {
        resetFixture();
        const first = upsertGuestLink({
            phrase: 'Kính mời',
            pronounForTitle: 'bác',
            guestName: 'An',
            pronouns: ['bác', 'Bác', 'bác', 'bọn mình', 'bác', 'gia đình', 'hai đứa', 'bác', 'chúng mình'],
            storePath: STORE_FILE,
        });

        const second = upsertGuestLink({
            phrase: 'Kính mời',
            pronounForTitle: 'bác',
            guestName: 'An',
            pronouns: ['bác', 'Bác', 'bác', 'tụi mình', 'bác', 'gia đình', 'hai đứa', 'bác', 'chúng mình'],
            storePath: STORE_FILE,
        });

        assert.strictEqual(second.status, 'updated');
        assert.strictEqual(first.token, second.token);
        assert.strictEqual(second.entry.guest_name, 'An');
        assert.strictEqual(second.entry.invitation_title, 'Kính mời bác An!');
        assert.deepStrictEqual(second.entry.pronouns[3], 'tụi mình');
        assert.strictEqual(second.entry.pronouns.length, 9);

        const store = loadGuestLinksStore(STORE_FILE);
        assert.strictEqual(store.entries.length, 1);
    });

    await test('upsertGuestLink without pronounForTitle falls back to legacy title format', () => {
        resetFixture();
        const result = upsertGuestLink({
            phrase: 'Lời mời cho bác An',
            guestName: 'Bác An',
            storePath: STORE_FILE,
        });

        assert.strictEqual(result.status, 'created');
        assert.strictEqual(result.entry.invitation_title, 'Lời mời cho bác An Bác An');
    });

    await test('upsertGuestLink rejects invalid input', () => {
        assert.throws(() => upsertGuestLink({ phrase: '', guestName: 'A', storePath: STORE_FILE }));
        assert.throws(() => upsertGuestLink({ phrase: 'A', guestName: '', storePath: STORE_FILE }));
    });

    console.log(`\n${failed === 0 ? '✅' : '❌'} Results: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
