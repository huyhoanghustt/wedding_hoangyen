#!/usr/bin/env node

const path = require('path');

const {
    DEFAULT_STORE_PATH,
    upsertGuestLink,
} = require('./lib/invitation-link-service');

function parseArgs(argv) {
    const out = {
        phrase: '',
        guest: '',
        baseUrl: '',
        storePath: DEFAULT_STORE_PATH,
    };

    for (let index = 2; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--phrase') {
            out.phrase = next || '';
            index += 1;
        } else if (arg === '--guest') {
            out.guest = next || '';
            index += 1;
        } else if (arg === '--base-url') {
            out.baseUrl = next || '';
            index += 1;
        } else if (arg === '--store') {
            out.storePath = next ? path.resolve(next) : DEFAULT_STORE_PATH;
            index += 1;
        }
    }

    return out;
}

function normalizeBaseUrl(baseUrl) {
    const trimmed = String(baseUrl || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
}

function main() {
    try {
        const args = parseArgs(process.argv);

        if (!args.phrase || !String(args.phrase).trim() || !args.guest || !String(args.guest).trim()) {
            console.error('Error: --phrase and --guest are required');
            process.exit(1);
        }

        const result = upsertGuestLink({
            phrase: args.phrase,
            guestName: args.guest,
            storePath: args.storePath,
        });

        const baseUrl = normalizeBaseUrl(args.baseUrl);

        console.log(`status: ${result.status}`);
        console.log(`token: ${result.token}`);
        console.log(`invitation_title: ${result.entry.invitation_title}`);
        if (baseUrl) {
            console.log(`url: ${baseUrl}/${result.token}`);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
