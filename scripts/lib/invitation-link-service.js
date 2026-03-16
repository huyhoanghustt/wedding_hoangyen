const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_STORE_PATH = path.join(__dirname, '..', '..', 'data', 'guest-links.json');
const TOKEN_REGEX = /^[a-z0-9]{4,64}$/;

function normalizeText(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function createEmptyStore() {
    return {
        version: 1,
        updated_at: new Date().toISOString(),
        entries: [],
    };
}

function ensureStoreDir(storePath) {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function persistStore(storePath, store) {
    ensureStoreDir(storePath);
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function isValidSha256Token(token) {
    return TOKEN_REGEX.test(String(token || ''));
}

/**
 * Validate a pronouns array: must be a non-empty array of strings.
 * Returns true if valid, false otherwise.
 */
function isValidPronounsArray(pronouns) {
    if (!Array.isArray(pronouns)) return false;
    if (pronouns.length < 1) return false;
    return pronouns.every((p) => typeof p === 'string');
}

/**
 * Validate a guest-links store shape.
 * Backward compatible: new fields (pronoun_for_title, pronouns,
 * custom_body_enabled, custom_body) are optional.
 */
function isValidGuestEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (!isValidSha256Token(entry.token)) return false;
    if (typeof entry.phrase !== 'string' || entry.phrase.trim().length === 0 || entry.phrase.length > 300) return false;
    if (typeof entry.guest_name !== 'string' || entry.guest_name.trim().length === 0 || entry.guest_name.length > 120) return false;
    if (typeof entry.invitation_title !== 'string' || entry.invitation_title.length === 0 || entry.invitation_title.length > 200) return false;
    if (typeof entry.created_at !== 'string') return false;
    if (typeof entry.updated_at !== 'string') return false;

    // New optional fields — only validate if present
    if (entry.pronoun_for_title !== undefined && typeof entry.pronoun_for_title !== 'string') return false;
    if (entry.pronouns !== undefined && !isValidPronounsArray(entry.pronouns)) return false;
    if (entry.custom_body_enabled !== undefined && typeof entry.custom_body_enabled !== 'boolean') return false;
    if (entry.custom_body !== undefined && typeof entry.custom_body !== 'string') return false;

    return true;
}

function validateStoreShape(store) {
    if (!store || typeof store !== 'object') return false;
    if (store.version !== 1) return false;
    if (!Array.isArray(store.entries)) return false;

    return store.entries.every(isValidGuestEntry);
}

function loadGuestLinksStore(storePath = DEFAULT_STORE_PATH) {
    try {
        if (!fs.existsSync(storePath)) {
            const empty = createEmptyStore();
            persistStore(storePath, empty);
            return empty;
        }

        const raw = fs.readFileSync(storePath, 'utf8');
        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
            console.warn('[guest-links] invalid store container shape, returning empty store in-memory');
            return createEmptyStore();
        }

        const validEntries = parsed.entries.filter(isValidGuestEntry);
        if (validEntries.length !== parsed.entries.length) {
            console.warn(`[guest-links] ignored ${parsed.entries.length - validEntries.length} invalid entr${parsed.entries.length - validEntries.length === 1 ? 'y' : 'ies'} while loading store`);
        }

        return {
            version: 1,
            updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : new Date().toISOString(),
            entries: validEntries,
        };
    } catch (error) {
        console.warn('[guest-links] failed to read store, returning empty store in-memory:', error.message);
        return createEmptyStore();
    }
}

/**
 * Create a SHA256-based token from phrase + pronounForTitle + guestName + timestamp.
 * Returns the first 32 hex chars of the hash.
 */
function createTokenFromInputs(phrase, pronounForTitle, guestName, timestamp) {
    const input = `${normalizeText(phrase)}${normalizeText(pronounForTitle)}${normalizeText(guestName)}${timestamp}`;
    return crypto
        .createHash('sha256')
        .update(input, 'utf8')
        .digest('hex');
}

/**
 * @deprecated Use createTokenFromInputs instead. Kept for backward compatibility.
 */
function createTokenFromPhrase(phrase) {
    const normalizedPhrase = normalizeText(phrase);
    if (!normalizedPhrase) {
        throw new Error('phrase is required');
    }
    if (normalizedPhrase.length > 300) {
        throw new Error('phrase must be <= 300 chars');
    }

    return crypto
        .createHash('sha256')
        .update(normalizedPhrase, 'utf8')
        .digest('hex');
}

/**
 * Generate a unique token, checking for collisions against existing tokens.
 * First tries 32-char prefix; if collision, extends to full 64-char hash.
 * @param {string} phrase
 * @param {string} pronounForTitle
 * @param {string} guestName
 * @param {Set<string>|string[]} existingTokens - existing tokens to check against
 * @returns {string} unique token (32 or 64 hex chars)
 */
function generateUniqueToken(phrase, pronounForTitle, guestName, existingTokens) {
    const tokenSet = existingTokens instanceof Set
        ? existingTokens
        : new Set(Array.isArray(existingTokens) ? existingTokens : []);

    const timestamp = Date.now().toString();
    const fullHash = createTokenFromInputs(phrase, pronounForTitle, guestName, timestamp);

    // Try 32-char prefix first
    const shortCandidate = fullHash.substring(0, 32);
    if (!tokenSet.has(shortCandidate)) {
        return shortCandidate;
    }

    // Collision on 32 chars — use full 64-char hash
    const fullCandidate = fullHash.substring(0, 64);
    if (!tokenSet.has(fullCandidate)) {
        return fullCandidate;
    }

    // Extremely unlikely — throw error
    throw new Error('Token collision after full hash — retry with different inputs');
}

function normalizeGuestName(guestName) {
    const normalizedGuest = normalizeText(guestName);
    if (!normalizedGuest) {
        throw new Error('guest name is required');
    }
    if (normalizedGuest.length > 120) {
        throw new Error('guest name must be <= 120 chars');
    }
    return normalizedGuest;
}

/**
 * Build invitation title from phrase + pronounForTitle + guestName.
 * Formula: phrase + " " + pronounForTitle + " " + guestName + "!"
 * Falls back to legacy behavior (phrase + " " + guestName) when pronounForTitle is absent.
 * @param {string} phrase
 * @param {string} [pronounForTitle]
 * @param {string} guestName
 * @returns {string}
 */
function buildInvitationTitle(phrase, pronounForTitle, guestName) {
    let title;
    if (pronounForTitle && normalizeText(pronounForTitle)) {
        title = `${normalizeText(phrase)} ${normalizeText(pronounForTitle)} ${normalizeText(guestName)}!`;
    } else {
        title = `${normalizeText(phrase)} ${normalizeText(guestName)}`;
    }
    if (title.length > 200) {
        throw new Error('invitation title must be <= 200 chars');
    }
    return title;
}

function findGuestByToken(token, storePath = DEFAULT_STORE_PATH) {
    if (!isValidSha256Token(token)) {
        return null;
    }

    const store = loadGuestLinksStore(storePath);
    const match = store.entries.find((entry) => entry.token === token);
    return match || null;
}

/**
 * Upsert a guest link entry.
 * Accepts new optional fields: pronounForTitle, pronouns, customBodyEnabled, customBody.
 * @param {Object} params
 * @param {string} params.phrase
 * @param {string} params.guestName
 * @param {string} [params.pronounForTitle]
 * @param {string[]} [params.pronouns] - Non-empty array of pronoun strings
 * @param {boolean} [params.customBodyEnabled]
 * @param {string} [params.customBody]
 * @param {string} [params.storePath]
 * @returns {Object} { status, token, entry }
 */
function upsertGuestLink({
    phrase,
    guestName,
    pronounForTitle,
    pronouns,
    customBodyEnabled,
    customBody,
    storePath = DEFAULT_STORE_PATH,
}) {
    const normalizedPhrase = normalizeText(phrase);
    if (!normalizedPhrase) {
        throw new Error('phrase is required');
    }
    if (normalizedPhrase.length > 300) {
        throw new Error('phrase must be <= 300 chars');
    }

    const normalizedGuestName = normalizeGuestName(guestName);
    const normalizedPronounForTitle = pronounForTitle ? normalizeText(pronounForTitle) : '';

    const store = loadGuestLinksStore(storePath);
    const now = new Date().toISOString();

    // Collect existing tokens for collision check
    const existingTokens = new Set(store.entries.map((e) => e.token));

    const token = generateUniqueToken(
        normalizedPhrase,
        normalizedPronounForTitle,
        normalizedGuestName,
        existingTokens,
    );

    const invitationTitle = buildInvitationTitle(normalizedPhrase, normalizedPronounForTitle, normalizedGuestName);

    // Find existing entry by matching phrase + pronounForTitle + guestName (not by token, since tokens are now timestamp-based)
    const existingIndex = store.entries.findIndex((entry) =>
        entry.phrase === normalizedPhrase
        && entry.guest_name === normalizedGuestName
        && (entry.pronoun_for_title || '') === normalizedPronounForTitle
    );
    const status = existingIndex >= 0 ? 'updated' : 'created';
    const createdAt = existingIndex >= 0 ? store.entries[existingIndex].created_at : now;
    const existingToken = existingIndex >= 0 ? store.entries[existingIndex].token : token;

    const nextEntry = {
        token: existingToken,
        phrase: normalizedPhrase,
        pronoun_for_title: normalizedPronounForTitle,
        guest_name: normalizedGuestName,
        invitation_title: invitationTitle,
        pronouns: Array.isArray(pronouns) && pronouns.length >= 1 ? pronouns : undefined,
        custom_body_enabled: typeof customBodyEnabled === 'boolean' ? customBodyEnabled : false,
        custom_body: typeof customBody === 'string' ? customBody : '',
        created_at: createdAt,
        updated_at: now,
    };

    // Remove undefined fields
    Object.keys(nextEntry).forEach((key) => {
        if (nextEntry[key] === undefined) {
            delete nextEntry[key];
        }
    });

    const nextEntries = existingIndex >= 0
        ? store.entries.map((entry, index) => (index === existingIndex ? nextEntry : entry))
        : [...store.entries, nextEntry];

    const nextStore = {
        ...store,
        updated_at: now,
        entries: nextEntries,
    };

    persistStore(storePath, nextStore);

    return {
        status,
        token: nextEntry.token,
        entry: nextEntry,
    };
}

module.exports = {
    DEFAULT_STORE_PATH,
    TOKEN_REGEX,
    createTokenFromPhrase,
    createTokenFromInputs,
    generateUniqueToken,
    isValidSha256Token,
    isValidPronounsArray,
    validateStoreShape,
    loadGuestLinksStore,
    buildInvitationTitle,
    upsertGuestLink,
    findGuestByToken,
};
