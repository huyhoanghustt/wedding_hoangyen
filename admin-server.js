/**
 * ADMIN EDITOR SERVER
 * Dedicated admin UI server on port 8080 for editing JSON data files
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load .env file manually (no dotenv dependency)
function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex < 0) continue;
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        if (!process.env[key]) process.env[key] = value;
    }
}
loadEnvFile();

// Auth configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    console.error('ERROR: ADMIN_USERNAME and ADMIN_PASSWORD_HASH must be set in .env file');
    console.error('Generate password hash: node -e "console.log(require(\'crypto\').createHash(\'sha256\').update(\'YOUR_PASSWORD\').digest(\'hex\'))"');
    process.exit(1);
}

const app = express();
const ADMIN_PORT = process.env.ADMIN_PORT || 8080;

/* ===================== FILE REGISTRY ===================== */
const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, 'data');
const DEFAULTS_DIR = path.join(DATA_DIR, 'defaults');

// Allowlisted file keys with metadata (alphabetical order)
const FILE_REGISTRY = {
    'blessings': {
        label: 'Blessings',
        file: 'blessings.json',
        type: 'array'
    },
    'hero_gallery': {
        label: 'Hero & Gallery',
        file: 'hero_gallery.json',
        type: 'object'
    },
    'guest-links': {
        label: 'Guest Links',
        file: 'guest-links.json',
        type: 'object'
    },
    'hearts': {
        label: 'Hearts',
        file: 'hearts.json',
        type: 'object'
    },
    'invitations': {
        label: 'Invitations',
        file: 'invitations.json',
        type: 'object'
    },
    'media-index': {
        label: 'Media Index',
        file: 'media-index.json',
        type: 'object'
    },
    'pronoun': {
        label: 'Pronoun Map',
        file: 'pronoun.json',
        type: 'object'
    },
    'rsvp': {
        label: 'RSVP',
        file: 'rsvp.json',
        type: 'array'
    },
    'story-layout': {
        label: 'Story',
        file: 'story-layout.json',
        type: 'object'
    },
    'wedding': {
        label: 'Wedding',
        file: 'wedding.json',
        type: 'object'
    }
};

/* ===================== MIDDLEWARE ===================== */
app.use(cors());

// Conditional JSON parsing: skip for multipart/form-data to preserve raw body stream
app.use((req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
        return next(); // Skip JSON parsing for multipart requests
    }
    express.json({ limit: '25mb' })(req, res, next);
});

app.use(express.static(path.join(__dirname, 'admin')));

/* ===================== UTILITIES ===================== */

/**
 * Read JSON file safely
 * @param {string} filePath - Full path to JSON file
 * @returns {object|array|null} Parsed JSON or null on error
 */
function readJSON(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        return null;
    }
}

/**
 * Write JSON file atomically (write to temp, then rename)
 * @param {string} filePath - Full path to target file
 * @param {object|array} data - Data to write
 * @returns {boolean} Success status
 */
function writeJSON(filePath, data) {
    try {
        const tempPath = filePath + '.tmp.' + crypto.randomBytes(6).toString('hex');
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
        return true;
    } catch (err) {
        console.error(`Error writing ${filePath}:`, err.message);
        return false;
    }
}

/**
 * Validate data type matches expected type
 * @param {any} data - Data to validate
 * @param {string} expectedType - 'array' or 'object'
 * @returns {boolean} Validation result
 */
function validateDataType(data, expectedType) {
    if (expectedType === 'array') {
        return Array.isArray(data);
    }
    if (expectedType === 'object') {
        return data !== null && typeof data === 'object' && !Array.isArray(data);
    }
    return false;
}

/**
 * Create API response envelope
 * @param {boolean} success - Success status
 * @param {any} data - Response data
 * @param {string|null} error - Error message
 */
function envelope(success, data = null, error = null) {
    return { success, data, error };
}

/* ===================== ROUTE MODULES ===================== */
const shared = {
    readJSON,
    writeJSON,
    validateDataType,
    envelope,
    DATA_DIR,
    DEFAULTS_DIR,
    FILE_REGISTRY,
    ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH,
    crypto,
    fs,
    path
};

const { requireAuth } = require('./admin-server/auth')(app, shared);
app.use(requireAuth);

require('./admin-server/files-api')(app, shared);
require('./admin-server/media-api')(app, shared);

/* ===================== SPA FALLBACK ===================== */
// Serve admin/index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

/* ===================== START SERVER ===================== */
app.listen(ADMIN_PORT, () => {
    console.log(`Admin Editor Server running at http://localhost:${ADMIN_PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    console.log(`Defaults directory: ${DEFAULTS_DIR}`);
});
