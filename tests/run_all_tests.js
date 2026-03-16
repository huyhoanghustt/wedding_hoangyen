/**
 * Master Test Runner - runs all test suites
 * Run: node tests/run_all_tests.js
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function runSuite(name, file) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running: ${name}`);
    console.log('='.repeat(50));

    const result = spawnSync('node', [file], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env },
    });

    return result.status === 0;
}

(async () => {
    console.log('\n🎊 Wedding Invitation - Full Test Suite\n');

    const suites = [
        { name: 'Invitation Link Service Tests', file: path.join(__dirname, 'invitation-link-service.test.js') },
        { name: 'Invite CLI Tests', file: path.join(__dirname, 'invite-cli.test.js') },
        { name: 'API Unit Tests', file: path.join(__dirname, 'api.test.js') },
        { name: 'Public Story Layout Race Tests', file: path.join(__dirname, 'story-layout-race.test.js') },
        { name: 'Stress Tests', file: path.join(__dirname, 'stress.test.js') },
    ];

    let allPassed = true;

    for (const suite of suites) {
        const ok = runSuite(suite.name, suite.file);
        if (!ok) allPassed = false;
        // Brief pause between suites to let ports free up
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n${'='.repeat(50)}`);
    if (allPassed) {
        console.log('✅ All test suites PASSED');
    } else {
        console.log('❌ Some test suites FAILED');
    }
    console.log('='.repeat(50));
    process.exit(allPassed ? 0 : 1);
})();
