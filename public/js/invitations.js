/**
 * INVITATIONS HELPER MODULE
 * Pure functions for invitation format handling, placeholder parsing,
 * pronoun normalization, and body rendering.
 * 
 * This module is consumed by:
 * - admin/js/admin-guest-links.js (for guest-specific invitation rendering)
 * - public/js/app.js (for public invitation display)
 */

/* ===================== CONSTANTS ===================== */

/**
 * Default invitation configuration when invitations.json is not available.
 * Matches the structure in data/defaults/invitations.json.
 */
const INVITATION_DEFAULTS = {
    active_format: 'default',
    formats: {
        default: {
            label: 'Mặc định',
            title: 'Kính mời',
            body: 'Gửi đến {d0} tấm thiệp cưới đầy yêu thương.\n{d1} nhận được lời mời này vì {d2} là người đặc biệt với {d3}.\nMong {d4}{d5} sẽ đến chung vui.\nCùng chứng kiến khoảnh khắc hạnh phúc nhất của {d6}.\nCảm ơn vì luôn bên cạnh và yêu thương.\nHy vọng {d7} sẽ là người chứng kiến khoảnh khắc quan trọng nhất trong cuộc đời {d8}!',
            closing: '· · · ♥ · · ·',
            default_pronouns: [
                'bạn', 'Bạn', 'bạn', 'bọn mình', 'bạn', 'gia đình', 'hai đứa', 'bạn', 'chúng mình'
            ],
            slot_descriptors: [
                { index: 0, placeholder: '{d0}', type: 'guest', hint: 'guest pronoun' },
                { index: 1, placeholder: '{d1}', type: 'guest', hint: 'Guest (cap)' },
                { index: 2, placeholder: '{d2}', type: 'guest', hint: 'guest pronoun' },
                { index: 3, placeholder: '{d3}', type: 'couple', hint: 'couple pronoun' },
                { index: 4, placeholder: '{d4}', type: 'guest', hint: 'guest pronoun' },
                { index: 5, placeholder: '{d5}', type: 'family-companion', hint: "companion after 'và'" },
                { index: 6, placeholder: '{d6}', type: 'couple', hint: 'couple pronoun' },
                { index: 7, placeholder: '{d7}', type: 'guest', hint: 'guest pronoun' },
                { index: 8, placeholder: '{d8}', type: 'couple', hint: 'couple pronoun' }
            ]
        }
    },
    role_presets: {
        friend: { label: 'Bạn bè', pronoun_for_title: 'bạn', default_pronouns: ['bạn', 'Bạn', 'bạn', 'bọn mình', 'bạn', 'gia đình', 'hai đứa', 'bạn', 'chúng mình'] },
        younger: { label: 'Em út', pronoun_for_title: 'em', default_pronouns: ['em', 'Em', 'em', 'anh chị', 'em', 'gia đình', 'hai anh chị', 'em', 'anh chị'] },
        older_male: { label: 'Anh trai', pronoun_for_title: 'anh', default_pronouns: ['anh', 'Anh', 'anh', 'chúng em', 'anh', 'gia đình', 'hai đứa', 'anh', 'bọn em'] },
        older_female: { label: 'Chị gái', pronoun_for_title: 'chị', default_pronouns: ['chị', 'Chị', 'chị', 'chúng em', 'chị', 'gia đình', 'hai đứa', 'chị', 'bọn em'] },
        cousin: { label: 'Anh chị em họ', pronoun_for_title: 'cậu', default_pronouns: ['cậu', 'Cậu', 'cậu', 'chúng mình', 'cậu', 'gia đình', 'hai đứa', 'cậu', 'bọn mình'] },
        elder_male: { label: 'Ông/Bác/Chú', pronoun_for_title: 'ông', default_pronouns: ['ông', 'Ông', 'ông', 'chúng cháu', 'ông', 'gia đình', 'hai đứa', 'ông', 'bọn cháu'] },
        elder_female: { label: 'Bà/Cô/Dì/Bác', pronoun_for_title: 'bà', default_pronouns: ['bà', 'Bà', 'bà', 'chúng cháu', 'bà', 'gia đình', 'hai đứa', 'bà', 'bọn cháu'] }
    },
    phrase_presets: ['Kính mời', 'Thân mời', 'Trân trọng kính mời', 'Mời'],
    pronoun_for_title_presets: ['em', 'anh', 'chị', 'cậu', 'bạn', 'ông', 'bà', 'cô', 'chú', 'dì', 'bác', 'con'],
    guest_pronoun_presets: ['bạn', 'em', 'anh', 'chị', 'cậu', 'mày', 'ông', 'bà', 'cô', 'chú', 'bác', 'Bạn', 'Em', 'Anh', 'Chị', 'Cậu'],
    couple_pronoun_presets: ['bọn mình', 'hai đứa', 'chúng mình', 'tụi mình', 'bọn anh', 'bọn chị', 'chúng tôi', 'chúng em'],
    family_companion_presets: ['gia đình', 'người thương', 'các cháu', 'các con']
};

/**
 * Index of the family companion slot in the pronoun array.
 * This slot receives special handling (prefix "và" when enabled).
 */
const FAMILY_COMPANION_SLOT_INDEX = 5;

/**
 * Slot indexes for guest-type pronouns.
 * These slots are auto-filled based on pronoun_for_title.
 */
const GUEST_PRONOUN_SLOT_INDEXES = [0, 1, 2, 4, 7];

/**
 * Slot indexes for couple-type pronouns.
 * These slots are auto-filled based on couple pronoun mapping.
 */
const COUPLE_PRONOUN_SLOT_INDEXES = [3, 6, 8];

/**
 * Regex pattern for matching placeholders like {d0}, {d1}, etc.
 */
const PLACEHOLDER_REGEX = /\{d(\d+)\}/g;

/* ===================== PLACEHOLDER PARSING ===================== */

/**
 * Parse all placeholders from a body template.
 * @param {string} body - The body template string
 * @returns {Array<{index: number, placeholder: string}>} Array of placeholder info
 */
function parsePlaceholders(body) {
    if (typeof body !== 'string' || !body) return [];
    
    const placeholders = [];
    const seen = new Set();
    
    let match;
    const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');
    while ((match = regex.exec(body)) !== null) {
        const index = parseInt(match[1], 10);
        const placeholder = match[0];
        
        if (!seen.has(placeholder)) {
            seen.add(placeholder);
            placeholders.push({ index, placeholder });
        }
    }
    
    return placeholders.sort((a, b) => a.index - b.index);
}

/**
 * Get the maximum placeholder index from a body template.
 * @param {string} body - The body template string
 * @returns {number} Maximum placeholder index (0 if none found)
 */
function getMaxPlaceholderIndex(body) {
    const placeholders = parsePlaceholders(body);
    if (placeholders.length === 0) return 0;
    return Math.max(...placeholders.map(p => p.index));
}

/* ===================== SLOT DESCRIPTORS ===================== */

/**
 * Build slot descriptors from an active format configuration.
 * @param {Object} format - The format object from invitations.json
 * @returns {Array<Object>} Array of slot descriptors
 */
function buildSlotDescriptors(format) {
    if (!format || typeof format !== 'object') {
        return INVITATION_DEFAULTS.formats.default.slot_descriptors;
    }
    
    // If slot_descriptors already exists, return it
    if (Array.isArray(format.slot_descriptors) && format.slot_descriptors.length > 0) {
        return format.slot_descriptors;
    }
    
    // Build from body template
    const body = typeof format.body === 'string' ? format.body : '';
    const placeholders = parsePlaceholders(body);
    
    if (placeholders.length === 0) {
        return INVITATION_DEFAULTS.formats.default.slot_descriptors;
    }
    
    // Infer types from default pronouns if available
    const defaultPronouns = Array.isArray(format.default_pronouns) ? format.default_pronouns : [];
    
    return placeholders.map((p, idx) => {
        // Infer type based on position patterns
        let type = 'guest';
        if (p.index === FAMILY_COMPANION_SLOT_INDEX) {
            type = 'family-companion';
        } else if (COUPLE_PRONOUN_SLOT_INDEXES.includes(p.index)) {
            type = 'couple';
        }
        
        return {
            index: p.index,
            placeholder: p.placeholder,
            type: type,
            hint: type === 'family-companion' ? "companion after 'và'" : `${type} pronoun`
        };
    });
}

/**
 * Get slot descriptors for a specific format from invitations data.
 * @param {Object} invitationsData - The full invitations.json data
 * @param {string} formatKey - The format key (defaults to active_format)
 * @returns {Array<Object>} Array of slot descriptors
 */
function getSlotDescriptors(invitationsData, formatKey) {
    if (!invitationsData || typeof invitationsData !== 'object') {
        return INVITATION_DEFAULTS.formats.default.slot_descriptors;
    }
    
    const activeKey = formatKey || invitationsData.active_format || 'default';
    const format = invitationsData.formats?.[activeKey];
    
    return buildSlotDescriptors(format);
}

/* ===================== PRONOUN NORMALIZATION ===================== */

/**
 * Normalize a pronoun array to match the expected slot count.
 * Handles legacy 8-slot format migration to 9-slot format.
 * @param {Array<string>} sourcePronouns - Source pronoun array (may be 8 or 9 elements)
 * @param {Array<string>} defaultPronouns - Default pronoun array for missing slots
 * @returns {Array<string>} Normalized pronoun array with 9 elements
 */
function normalizePronounArray(sourcePronouns, defaultPronouns) {
    const targetLength = INVITATION_DEFAULTS.formats.default.default_pronouns.length;
    const defaults = Array.isArray(defaultPronouns) && defaultPronouns.length >= targetLength
        ? defaultPronouns
        : INVITATION_DEFAULTS.formats.default.default_pronouns;
    
    const rawValues = Array.isArray(sourcePronouns) ? sourcePronouns : [];
    
    // Migrate old format (8 slots d0-d7) => insert new companion slot at d5
    if (rawValues.length === targetLength - 1) {
        const migrated = [
            ...rawValues.slice(0, FAMILY_COMPANION_SLOT_INDEX),
            defaults[FAMILY_COMPANION_SLOT_INDEX],
            ...rawValues.slice(FAMILY_COMPANION_SLOT_INDEX)
        ];
        return Array.from({ length: targetLength }, (_, slot) => {
            const value = migrated[slot];
            return typeof value === 'string' && value ? value : (defaults[slot] || '');
        });
    }
    
    return Array.from({ length: targetLength }, (_, slot) => {
        const value = rawValues[slot];
        return typeof value === 'string' && value ? value : (defaults[slot] || '');
    });
}

/**
 * Get the expected pronoun array length for the current format.
 * @param {Object} invitationsData - The invitations data
 * @returns {number} Expected pronoun array length
 */
function getPronounArrayLength(invitationsData) {
    const descriptors = getSlotDescriptors(invitationsData);
    if (descriptors.length === 0) return 9;
    const maxIndex = Math.max(...descriptors.map(d => d.index));
    return maxIndex + 1;
}

/* ===================== ROLE-BASED PRESETS ===================== */

/**
 * Get role preset by key.
 * @param {Object} invitationsData - The invitations data
 * @param {string} roleKey - The role preset key
 * @returns {Object|null} Role preset object or null if not found
 */
function getRolePreset(invitationsData, roleKey) {
    if (!roleKey) return null;
    
    const presets = invitationsData?.role_presets || INVITATION_DEFAULTS.role_presets;
    const preset = presets[roleKey];
    
    if (!preset || typeof preset !== 'object') return null;
    
    return {
        label: preset.label || roleKey,
        pronoun_for_title: preset.pronoun_for_title || '',
        default_pronouns: Array.isArray(preset.default_pronouns)
            ? normalizePronounArray(preset.default_pronouns, [])
            : INVITATION_DEFAULTS.formats.default.default_pronouns
    };
}

/**
 * Get all available role presets.
 * @param {Object} invitationsData - The invitations data
 * @returns {Object} Role presets object
 */
function getAllRolePresets(invitationsData) {
    return invitationsData?.role_presets || INVITATION_DEFAULTS.role_presets;
}

/**
 * Resolve role preset from pronoun_for_title value.
 * @param {Object} invitationsData - The invitations data
 * @param {string} pronounForTitle - The pronoun_for_title value
 * @returns {Object|null} Matching role preset or null
 */
function resolveRolePresetByPronoun(invitationsData, pronounForTitle) {
    if (!pronounForTitle) return null;
    
    const presets = getAllRolePresets(invitationsData);
    
    for (const [key, preset] of Object.entries(presets)) {
        if (preset.pronoun_for_title === pronounForTitle) {
            return { key, ...preset };
        }
    }
    
    return null;
}

/* ===================== PRONOUN_FOR_TITLE DEFAULTS ===================== */

/**
 * Capitalize the first character of a string.
 * @param {string} value - Input string
 * @returns {string} String with first character capitalized
 */
function capitalizeFirstWord(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Get couple pronoun options for a guest pronoun from pronoun.json mapping.
 * @param {Object} pronounData - The pronoun.json data
 * @param {string} guestPronoun - The guest pronoun
 * @param {Array<string>} fallbackPresets - Fallback couple pronoun presets
 * @returns {Array<string>} Array of couple pronoun options
 */
function getCouplePronounOptionsForGuest(pronounData, guestPronoun, fallbackPresets) {
    const key = String(guestPronoun || '').trim();
    const mapping = pronounData?.couple_pronouns_by_guest || {};
    const mapped = Array.isArray(mapping[key]) ? mapping[key].filter(Boolean) : [];
    
    const fallback = Array.isArray(fallbackPresets) ? fallbackPresets : INVITATION_DEFAULTS.couple_pronoun_presets;
    const merged = [...mapped, ...fallback];
    return Array.from(new Set(merged));
}

/**
 * Apply pronoun_for_title defaults to a pronoun array.
 * This auto-fills guest and couple pronoun slots based on the pronoun_for_title value.
 * @param {Array<string>} pronouns - Current pronoun array (will be copied, not mutated)
 * @param {string} pronounForTitle - The pronoun_for_title value
 * @param {Object} pronounData - The pronoun.json data for couple pronoun mapping
 * @param {Object} invitationsData - The invitations data for presets
 * @returns {Array<string>} New pronoun array with defaults applied
 */
function applyPronounForTitleDefaults(pronouns, pronounForTitle, pronounData, invitationsData) {
    const result = Array.isArray(pronouns) ? [...pronouns] : [];
    const guestPronoun = String(pronounForTitle || '').trim();
    
    if (!guestPronoun) return normalizePronounArray(result, []);
    
    // Get couple pronoun options
    const couplePresets = invitationsData?.couple_pronoun_presets || INVITATION_DEFAULTS.couple_pronoun_presets;
    const coupleOptions = getCouplePronounOptionsForGuest(pronounData, guestPronoun, couplePresets);
    
    // Apply guest pronoun slots
    GUEST_PRONOUN_SLOT_INDEXES.forEach((slotIndex) => {
        result[slotIndex] = slotIndex === 1
            ? capitalizeFirstWord(guestPronoun)
            : guestPronoun;
    });
    
    // Apply couple pronoun slots
    COUPLE_PRONOUN_SLOT_INDEXES.forEach((slotIndex, order) => {
        const fallback = coupleOptions[0] || '';
        result[slotIndex] = coupleOptions[order] || fallback;
    });
    
    return normalizePronounArray(result, []);
}

/* ===================== BODY RENDERING ===================== */

/**
 * Render invitation body by replacing placeholders with pronoun values.
 * @param {string} bodyTemplate - The body template with {dN} placeholders
 * @param {Array<string>} pronouns - Pronoun array
 * @param {Array<string>} defaultPronouns - Default pronoun array for missing values
 * @param {boolean} familyCompanionEnabled - Whether family companion is enabled
 * @returns {string} Rendered body text
 */
function renderInvitationBody(bodyTemplate, pronouns, defaultPronouns, familyCompanionEnabled) {
    if (typeof bodyTemplate !== 'string' || !bodyTemplate) return '';
    
    const normalizedPronouns = normalizePronounArray(pronouns, defaultPronouns);
    
    let rendered = bodyTemplate;
    
    // Find all placeholders in the template using regex
    const placeholderRegex = /\{d(\d+)\}/g;
    let match;
    
    while ((match = placeholderRegex.exec(bodyTemplate)) !== null) {
        const slotIndex = parseInt(match[1], 10);
        const placeholder = match[0];
        let value = normalizedPronouns[slotIndex] || '';
        
        // Special handling for family companion slot
        if (slotIndex === FAMILY_COMPANION_SLOT_INDEX) {
            if (familyCompanionEnabled === false || !value.trim()) {
                value = '';
            } else {
                value = ` và ${value}`;
            }
        }
        
        rendered = rendered.split(placeholder).join(value);
    }
    
    return rendered;
}

/**
 * Get the active invitation format from invitations data.
 * @param {Object} invitationsData - The invitations data
 * @returns {Object} Active format object
 */
function getActiveFormat(invitationsData) {
    if (!invitationsData || typeof invitationsData !== 'object') {
        return INVITATION_DEFAULTS.formats.default;
    }
    
    const activeKey = invitationsData.active_format || 'default';
    const format = invitationsData.formats?.[activeKey];
    
    if (!format || typeof format !== 'object') {
        return INVITATION_DEFAULTS.formats.default;
    }
    
    return {
        ...INVITATION_DEFAULTS.formats.default,
        ...format
    };
}

/**
 * Get a specific invitation format from invitations data.
 * Falls back through: requested key -> 'default' -> INVITATION_DEFAULTS.formats.default
 * @param {Object} invitationsData - The invitations data
 * @param {string} formatKey - The format key to retrieve (optional, defaults to 'default')
 * @returns {Object} Format object
 */
function getFormat(invitationsData, formatKey) {
    // Normalize format key
    const key = typeof formatKey === 'string' && formatKey.trim()
        ? formatKey.trim().toLowerCase()
        : 'default';
    
    // Check if we have valid invitations data
    if (!invitationsData || typeof invitationsData !== 'object') {
        return INVITATION_DEFAULTS.formats.default;
    }
    
    const formats = invitationsData.formats;
    if (!formats || typeof formats !== 'object') {
        return INVITATION_DEFAULTS.formats.default;
    }
    
    // Try requested key first
    if (formats[key] && typeof formats[key] === 'object') {
        return {
            ...INVITATION_DEFAULTS.formats.default,
            ...formats[key]
        };
    }
    
    // Fall back to 'default' if requested key not found
    if (key !== 'default' && formats.default && typeof formats.default === 'object') {
        return {
            ...INVITATION_DEFAULTS.formats.default,
            ...formats.default
        };
    }
    
    // Final fallback to INVITATION_DEFAULTS
    return INVITATION_DEFAULTS.formats.default;
}

/**
 * Get available format keys and labels from invitations data.
 * @param {Object} invitationsData - The invitations data
 * @returns {Array<{key: string, label: string}>} Array of format info objects
 */
function getAvailableFormats(invitationsData) {
    const formats = invitationsData?.formats || INVITATION_DEFAULTS.formats;
    
    if (!formats || typeof formats !== 'object') {
        return [{ key: 'default', label: 'Mặc định' }];
    }
    
    return Object.keys(formats)
        .filter(key => formats[key] && typeof formats[key] === 'object')
        .map(key => ({
            key: key,
            label: formats[key].label || key
        }));
}

/**
 * Get invitation context for rendering.
 * Combines invitations.json with fallback to wedding.json invitation section.
 * @param {Object} invitationsData - The invitations.json data
 * @param {Object} weddingData - The wedding.json data (for legacy fallback)
 * @param {string} formatKey - Optional format key to use (defaults to 'default')
 * @returns {Object} Invitation context with title, body, closing, defaultPronouns
 */
function getInvitationContext(invitationsData, weddingData, formatKey = 'default') {
    // Get the specified format
    const format = getFormat(invitationsData, formatKey);
    
    // Fallback to wedding.json invitation section
    const legacyInvitation = weddingData?.invitation || {};
    
    return {
        title: format.title || legacyInvitation.title || 'Kính mời',
        body: format.body || legacyInvitation.body || INVITATION_DEFAULTS.formats.default.body,
        closing: format.closing || legacyInvitation.closing || '· · · ♥ · · ·',
        defaultPronouns: format.default_pronouns || legacyInvitation.default_pronouns || INVITATION_DEFAULTS.formats.default.default_pronouns,
        slotDescriptors: buildSlotDescriptors(format)
    };
}

/* ===================== PRESET OPTIONS ===================== */

/**
 * Get phrase presets for combobox.
 * @param {Object} invitationsData - The invitations data
 * @returns {Array<string>} Phrase presets
 */
function getPhrasePresets(invitationsData) {
    return invitationsData?.phrase_presets || INVITATION_DEFAULTS.phrase_presets;
}

/**
 * Get pronoun_for_title presets for combobox.
 * @param {Object} invitationsData - The invitations data
 * @param {Object} pronounData - The pronoun.json data
 * @returns {Array<string>} Pronoun for title presets
 */
function getPronounForTitlePresets(invitationsData, pronounData) {
    const basePresets = invitationsData?.pronoun_for_title_presets || INVITATION_DEFAULTS.pronoun_for_title_presets;
    const mapKeys = Object.keys(pronounData?.couple_pronouns_by_guest || {});
    return Array.from(new Set([...basePresets, ...mapKeys]));
}

/**
 * Get guest pronoun presets for combobox.
 * @param {Object} invitationsData - The invitations data
 * @returns {Array<string>} Guest pronoun presets
 */
function getGuestPronounPresets(invitationsData) {
    return invitationsData?.guest_pronoun_presets || INVITATION_DEFAULTS.guest_pronoun_presets;
}

/**
 * Get couple pronoun presets for combobox.
 * @param {Object} invitationsData - The invitations data
 * @returns {Array<string>} Couple pronoun presets
 */
function getCouplePronounPresets(invitationsData) {
    return invitationsData?.couple_pronoun_presets || INVITATION_DEFAULTS.couple_pronoun_presets;
}

/**
 * Get family companion presets for combobox.
 * @param {Object} invitationsData - The invitations data
 * @returns {Array<string>} Family companion presets
 */
function getFamilyCompanionPresets(invitationsData) {
    return invitationsData?.family_companion_presets || INVITATION_DEFAULTS.family_companion_presets;
}

/* ===================== EXPORTS ===================== */

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.InvitationHelpers = {
        // Constants
        FAMILY_COMPANION_SLOT_INDEX,
        GUEST_PRONOUN_SLOT_INDEXES,
        COUPLE_PRONOUN_SLOT_INDEXES,
        INVITATION_DEFAULTS,
        
        // Placeholder parsing
        parsePlaceholders,
        getMaxPlaceholderIndex,
        
        // Slot descriptors
        buildSlotDescriptors,
        getSlotDescriptors,
        
        // Pronoun normalization
        normalizePronounArray,
        getPronounArrayLength,
        
        // Role-based presets
        getRolePreset,
        getAllRolePresets,
        resolveRolePresetByPronoun,
        
        // Pronoun_for_title defaults
        capitalizeFirstWord,
        getCouplePronounOptionsForGuest,
        applyPronounForTitleDefaults,
        
        // Body rendering
        renderInvitationBody,
        getFormat,
        getAvailableFormats,
        getActiveFormat,
        getInvitationContext,
        
        // Preset options
        getPhrasePresets,
        getPronounForTitlePresets,
        getGuestPronounPresets,
        getCouplePronounPresets,
        getFamilyCompanionPresets
    };
}

// Export for Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FAMILY_COMPANION_SLOT_INDEX,
        GUEST_PRONOUN_SLOT_INDEXES,
        COUPLE_PRONOUN_SLOT_INDEXES,
        INVITATION_DEFAULTS,
        parsePlaceholders,
        getMaxPlaceholderIndex,
        buildSlotDescriptors,
        getSlotDescriptors,
        normalizePronounArray,
        getPronounArrayLength,
        getRolePreset,
        getAllRolePresets,
        resolveRolePresetByPronoun,
        capitalizeFirstWord,
        getCouplePronounOptionsForGuest,
        applyPronounForTitleDefaults,
        renderInvitationBody,
        getFormat,
        getAvailableFormats,
        getActiveFormat,
        getInvitationContext,
        getPhrasePresets,
        getPronounForTitlePresets,
        getGuestPronounPresets,
        getCouplePronounPresets,
        getFamilyCompanionPresets
    };
}