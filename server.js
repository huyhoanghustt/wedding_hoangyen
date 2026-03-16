/**
 * WEDDING INVITATION - EXPRESS SERVER
 * Node.js backend for RSVP, Blessings, and Heart count APIs
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const {
    isValidSha256Token,
    findGuestByToken,
} = require('./scripts/lib/invitation-link-service');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===================== MIDDLEWARE ===================== */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ===================== DATA STORE ==================== */
const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, 'data');
const RSVP_FILE = path.join(DATA_DIR, 'rsvp.json');
const BLESSINGS_FILE = path.join(DATA_DIR, 'blessings.json');
const HEARTS_FILE = path.join(DATA_DIR, 'hearts.json');
const GUEST_LINKS_FILE = process.env.GUEST_LINKS_FILE
    ? path.resolve(process.env.GUEST_LINKS_FILE)
    : path.join(DATA_DIR, 'guest-links.json');

const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RSVP_FILE)) fs.writeFileSync(RSVP_FILE, '[]');
if (!fs.existsSync(BLESSINGS_FILE)) fs.writeFileSync(BLESSINGS_FILE, '[]');
if (!fs.existsSync(HEARTS_FILE)) fs.writeFileSync(HEARTS_FILE, JSON.stringify({ count: 87 }));

for (const mediaType of ['photos', 'music', 'guest-qr']) {
    const dir = path.join(UPLOADS_DIR, mediaType);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const WEDDING_FILE = path.join(DATA_DIR, 'wedding.json');
if (!fs.existsSync(WEDDING_FILE)) {
    const defaultCfg = path.join(__dirname, 'data', 'wedding.json');
    if (fs.existsSync(defaultCfg)) fs.copyFileSync(defaultCfg, WEDDING_FILE);
}

/* Serve data directory as static JSON (before wildcard/fallback routes) */
app.use('/data', express.static(DATA_DIR));

function readJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getBlessingsConfig() {
    const cfg = readJSON(WEDDING_FILE) || {};
    const blessingsCfg = cfg.blessings || {};

    const recentFetchLimitRaw = parseInt(String(blessingsCfg.recent_fetch_limit ?? ''), 10);
    const maxTotalRaw = parseInt(String(blessingsCfg.max_total ?? ''), 10);

    const recentFetchLimit = Number.isInteger(recentFetchLimitRaw) && recentFetchLimitRaw > 0
        ? recentFetchLimitRaw
        : 3;
    const maxTotal = Number.isInteger(maxTotalRaw) && maxTotalRaw > 0
        ? maxTotalRaw
        : 500;

    return { recentFetchLimit, maxTotal };
}

const SOURCE_INDEX = '__index__';

/**
 * Normalize and validate blessing source.
 * @param {*} inputSource - The source value from request body
 * @returns {{ ok: boolean, source?: string, error?: string }}
 */
function normalizeBlessingSource(inputSource) {
    // Missing/empty source → default to __index__
    if (inputSource === undefined || inputSource === null || String(inputSource).trim() === '') {
        return { ok: true, source: SOURCE_INDEX };
    }

    const source = String(inputSource).trim().toLowerCase();

    // Explicit __index__ → keep as-is
    if (source === SOURCE_INDEX) {
        return { ok: true, source: SOURCE_INDEX };
    }

    // Token source must be valid token format (4-64 lowercase alphanumeric chars)
    // Use the same validation as the invitation-link-service
    if (!isValidSha256Token(source)) {
        return { ok: false, error: 'invalid source format' };
    }

    // Token must exist in guest-links
    const guestEntry = findGuestByToken(source, GUEST_LINKS_FILE);
    if (!guestEntry) {
        return { ok: false, error: 'source token not found' };
    }

    return { ok: true, source };
}

/* ===================== CONFIG API ==================== */

/**
 * GET /api/config
 * Return the wedding config (wedding.json)
 */
app.get('/api/config', (req, res) => {
    const cfg = readJSON(WEDDING_FILE);
    if (!cfg) return res.status(500).json({ error: 'Could not read config' });
    res.json(cfg);
});

/**
 * PUT /api/config
 * Save updated wedding config
 * Body: partial or full config object (will be deep-merged)
 */
app.put('/api/config', (req, res) => {
    const existing = readJSON(WEDDING_FILE) || {};
    const updated = deepMerge(existing, req.body);
    writeJSON(WEDDING_FILE, updated);
    res.json({ success: true, config: updated });
});

/** Deep merge helper: merge src into target */
function deepMerge(target, src) {
    const out = Object.assign({}, target);
    for (const key of Object.keys(src || {})) {
        if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
            out[key] = deepMerge(target[key] || {}, src[key]);
        } else {
            out[key] = src[key];
        }
    }
    return out;
}

/* ===================== RSVP API ====================== */

/**
 * POST /api/rsvp
 * Save RSVP response from a guest
 * Body: { name, attendance, guests, side }
 */
app.post('/api/rsvp', (req, res) => {
    const { name, attendance, guests, side } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
    }
    if (!['yes', 'no'].includes(attendance)) {
        return res.status(400).json({ error: 'attendance must be yes or no' });
    }
    if (!['groom', 'bride'].includes(side)) {
        return res.status(400).json({ error: 'side must be groom or bride' });
    }

    const rsvpList = readJSON(RSVP_FILE) || [];
    const entry = {
        id: Date.now(),
        name: name.trim().substring(0, 100),
        attendance,
        guests: Number(guests) || 1,
        side,
        createdAt: new Date().toISOString(),
    };
    rsvpList.push(entry);
    writeJSON(RSVP_FILE, rsvpList);

    res.status(201).json({ success: true, entry });
});

/**
 * GET /api/rsvp
 * List all RSVP entries (admin use)
 */
app.get('/api/rsvp', (req, res) => {
    const rsvpList = readJSON(RSVP_FILE) || [];
    res.json(rsvpList);
});

/* ===================== BLESSINGS API ================= */

/**
 * GET /api/blessings
 * Return latest blessings
 */
app.get('/api/blessings', (req, res) => {
    const list = readJSON(BLESSINGS_FILE) || [];
    const { recentFetchLimit } = getBlessingsConfig();
    const queryLimit = parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isInteger(queryLimit) && queryLimit > 0
        ? queryLimit
        : recentFetchLimit;

    res.json(list.slice(-limit));
});

/**
 * POST /api/blessings
 * Add a new blessing message
 * Body: { name, text, source? }
 */
app.post('/api/blessings', (req, res) => {
    const { name, text, source } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'text is required' });
    }

    // Validate and normalize source
    const normalized = normalizeBlessingSource(source);
    if (!normalized.ok) {
        return res.status(400).json({ error: 'source is invalid' });
    }

    const list = readJSON(BLESSINGS_FILE) || [];
    const { maxTotal } = getBlessingsConfig();
    const entry = {
        id: Date.now(),
        name: (name || 'Khách mời').toString().trim().substring(0, 50),
        text: text.trim().substring(0, 200),
        createdAt: new Date().toISOString(),
        source: normalized.source,
    };
    list.push(entry);

    if (list.length > maxTotal) {
        list.splice(0, list.length - maxTotal);
    }

    writeJSON(BLESSINGS_FILE, list);

    res.status(201).json({ success: true, entry });
});

/* ===================== HEARTS API ==================== */

/**
 * GET /api/hearts
 * Return total heart count
 */
app.get('/api/hearts', (req, res) => {
    const data = readJSON(HEARTS_FILE) || { count: 0 };
    res.json(data);
});

/**
 * POST /api/hearts
 * Increment heart count
 */
app.post('/api/hearts', (req, res) => {
    const data = readJSON(HEARTS_FILE) || { count: 0 };
    data.count = (data.count || 0) + 1;
    writeJSON(HEARTS_FILE, data);
    res.json(data);
});

/* ===================== MEDIA ROUTE =================== */
app.get('/media/:type/:filename', (req, res) => {
    const { type, filename } = req.params;

    if (!['photos', 'music', 'guest-qr'].includes(type)) {
        return res.status(404).send('Not found');
    }

    if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
        return res.status(400).send('Invalid filename');
    }

    const filePath = path.join(UPLOADS_DIR, type, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Not found');
    }

    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.query.download === '1') {
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
    }
    return res.sendFile(filePath);
});

/* ===================== PERSONALIZED TOKEN ROUTE ====== */
function escapeForInlineScript(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
}

function injectPersonalizationBootstrap(html, personalization) {
    const payload = {
        token: personalization?.token || null,
        guestName: personalization?.guestName || null,
        invitationTitle: personalization?.invitationTitle || null,
        pronounForTitle: personalization?.pronounForTitle || null,
        pronouns: Array.isArray(personalization?.pronouns) ? personalization.pronouns : null,
        familyCompanionEnabled: typeof personalization?.familyCompanionEnabled === 'boolean' ? personalization.familyCompanionEnabled : true,
        customBodyEnabled: typeof personalization?.customBodyEnabled === 'boolean' ? personalization.customBodyEnabled : false,
        customBody: typeof personalization?.customBody === 'string' ? personalization.customBody : '',
        invitationFormat: typeof personalization?.invitationFormat === 'string' ? personalization.invitationFormat : 'default',
    };

    const bootstrapScript = `<script>window.__INVITATION_PERSONALIZATION__=${escapeForInlineScript(payload)};</script>`;

    if (html.includes('</head>')) {
        return html.replace('</head>', `${bootstrapScript}</head>`);
    }

    return `${bootstrapScript}${html}`;
}

function sendIndexHtml(res, personalization) {
    const indexPath = path.join(__dirname, 'public', 'index.html');

    if (!personalization) {
        res.sendFile(indexPath);
        return;
    }

    fs.readFile(indexPath, 'utf8', (error, html) => {
        if (error) {
            res.status(500).send('Failed to load page');
            return;
        }

        const enrichedHtml = injectPersonalizationBootstrap(html, personalization);
        res.type('html').send(enrichedHtml);
    });
}

app.get('/:token', (req, res, next) => {
    const token = String(req.params.token || '').toLowerCase();

    if (!isValidSha256Token(token)) {
        next();
        return;
    }

    const guestEntry = findGuestByToken(token, GUEST_LINKS_FILE);

    if (!guestEntry) {
        sendIndexHtml(res, null);
        return;
    }

    sendIndexHtml(res, {
        token: guestEntry.token,
        guestName: guestEntry.guest_name,
        invitationTitle: guestEntry.invitation_title,
        pronounForTitle: guestEntry.pronoun_for_title || null,
        pronouns: Array.isArray(guestEntry.pronouns) ? guestEntry.pronouns : null,
        familyCompanionEnabled: guestEntry.family_companion_enabled !== false,
        customBodyEnabled: guestEntry.custom_body_enabled === true,
        customBody: typeof guestEntry.custom_body === 'string' ? guestEntry.custom_body : '',
        invitationFormat: typeof guestEntry.invitation_format === 'string' ? guestEntry.invitation_format : 'default',
    });
});

/* ===================== FALLBACK ====================== */
// Serve index.html for any unmatched route (SPA support)
app.get('*', (req, res) => {
    sendIndexHtml(res, null);
});

/* ===================== START ========================= */
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n💒 Wedding Invitation Server Running`);
        console.log(`   ► http://localhost:${PORT}`);
        console.log(`   ► Press Ctrl+C to stop\n`);
    });
}

module.exports = app;
