/**
 * CLI tests for generate-invite-link script.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'tmp', 'tests', 'invite-cli');
const STORE_FILE = path.join(TMP_DIR, 'guest-links.json');
const CLI_FILE = path.join(ROOT, 'scripts', 'generate-invite-link.js');

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

function runCli(args) {
    return spawnSync('node', [CLI_FILE, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
    });
}

function resetFixture() {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

(async () => {
    console.log('\n🧪 Invite CLI Tests\n');

    resetFixture();

    await test('CLI creates token and writes entry', () => {
        const result = runCli([
            '--phrase', 'Kính mời',
            '--guest', 'Chú Bình',
            '--store', STORE_FILE,
            '--base-url', 'https://example.com/invite',
        ]);

        assert.strictEqual(result.status, 0, result.stderr || result.stdout);
        assert.ok(result.stdout.includes('status: created'));
        assert.ok(result.stdout.includes('token:'));
        assert.ok(result.stdout.includes('url: https://example.com/invite/'));

        const persisted = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        assert.strictEqual(persisted.entries.length, 1);
        assert.strictEqual(persisted.entries[0].guest_name, 'Chú Bình');
        assert.strictEqual(persisted.entries[0].invitation_title, 'Kính mời Chú Bình');
    });

    await test('CLI creates separate entry for different guest name', () => {
        const result = runCli([
            '--phrase', 'Kính mời',
            '--guest', 'Chú Bình (cập nhật)',
            '--store', STORE_FILE,
        ]);

        assert.strictEqual(result.status, 0, result.stderr || result.stdout);
        assert.ok(result.stdout.includes('status: created'));

        const persisted = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        assert.strictEqual(persisted.entries.length, 2);
        assert.strictEqual(persisted.entries[1].guest_name, 'Chú Bình (cập nhật)');
    });

    await test('CLI returns exit code 1 for missing required args', () => {
        const result = runCli(['--phrase', 'only phrase']);
        assert.strictEqual(result.status, 1);
        assert.ok((result.stderr || result.stdout).includes('--phrase and --guest are required'));
    });

    console.log(`\n${failed === 0 ? '✅' : '❌'} Results: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
