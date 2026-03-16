/* ===================== GUEST LINKS EDITOR ===================== */

/**
 * This module consumes helpers from invitations.js for:
 * - Preset options (phrase, pronoun, couple, family companion)
 * - Pronoun normalization (legacy 8->9 slot migration)
 * - Invitation context (title, body, closing, defaults)
 * - Slot descriptors (placeholder metadata)
 *
 * The hardcoded invitation-related constants have been removed and
 * are now sourced from the invitations.json data file via InvitationHelpers.
 */

const GUEST_LINKS_DEFAULT_BASE_URL = 'https://tienquyen.radar.io.vn';

const guestLinksUiState = {
    selectedIndexByFileKey: {
        'guest-links': 0
    }
};

const guestQrLegacyDataUrlByEntry = new WeakMap();

/**
 * Get slot descriptors from invitations data.
 * Uses InvitationHelpers module for consistent slot metadata.
 * @param {string} formatKey - Optional format key to use (defaults to 'default')
 */
function getGuestPronounSlots(formatKey) {
    const invitationsData = draft.invitations || current.invitations;
    return window.InvitationHelpers?.getSlotDescriptors(invitationsData, formatKey) ||
           window.InvitationHelpers?.INVITATION_DEFAULTS?.formats?.default?.slot_descriptors || [];
}

function buildInvitationTitleClient(entry) {
    const parts = [entry.phrase, entry.pronoun_for_title, entry.guest_name].filter(Boolean);
    return parts.join(' ') + '!';
}

function capitalizeFirstWord(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function getPronounMapRoot() {
    const pronounData = draft.pronoun || current.pronoun || {};
    if (!pronounData || typeof pronounData !== 'object' || Array.isArray(pronounData)) {
        return {};
    }

    const mapping = pronounData.couple_pronouns_by_guest;
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        return {};
    }

    return mapping;
}

function getCouplePronounOptionsForGuest(guestPronoun) {
    const invitationsData = draft.invitations || current.invitations;
    const pronounData = draft.pronoun || current.pronoun;
    
    // Use InvitationHelpers if available
    if (window.InvitationHelpers) {
        return window.InvitationHelpers.getCouplePronounOptionsForGuest(
            pronounData,
            guestPronoun,
            window.InvitationHelpers.getCouplePronounPresets(invitationsData)
        );
    }
    
    // Fallback: use pronoun map directly
    const key = String(guestPronoun || '').trim();
    const mapping = getPronounMapRoot();
    const mapped = Array.isArray(mapping[key]) ? mapping[key].filter(Boolean) : [];
    return Array.from(new Set(mapped));
}

function getPronounForTitleOptions() {
    const invitationsData = draft.invitations || current.invitations;
    const pronounData = draft.pronoun || current.pronoun;
    
    // Use InvitationHelpers if available
    if (window.InvitationHelpers) {
        return window.InvitationHelpers.getPronounForTitlePresets(invitationsData, pronounData);
    }
    
    // Fallback: use pronoun map keys
    return Object.keys(getPronounMapRoot());
}

function isFamilyCompanionEnabled(entry) {
    return entry?.family_companion_enabled !== false;
}

/**
 * Get the family companion slot index from InvitationHelpers.
 */
function getFamilyCompanionSlotIndex() {
    return window.InvitationHelpers?.FAMILY_COMPANION_SLOT_INDEX ?? 5;
}

/**
 * Get guest pronoun slot indexes from InvitationHelpers.
 */
function getGuestPronounSlotIndexes() {
    return window.InvitationHelpers?.GUEST_PRONOUN_SLOT_INDEXES ?? [0, 1, 2, 4, 7];
}

/**
 * Get couple pronoun slot indexes from InvitationHelpers.
 */
function getCouplePronounSlotIndexes() {
    return window.InvitationHelpers?.COUPLE_PRONOUN_SLOT_INDEXES ?? [3, 6, 8];
}

function normalizePronounArray(sourcePronouns, formatKey = 'default') {
    const invitationsData = draft.invitations || current.invitations;
    const format = window.InvitationHelpers?.getFormat(invitationsData, formatKey);
    const defaultPronouns = format?.default_pronouns;
    
    // Use InvitationHelpers if available - pass invitationsData for dynamic sizing
    if (window.InvitationHelpers) {
        return window.InvitationHelpers.normalizePronounArray(sourcePronouns, defaultPronouns, invitationsData);
    }
    
    // Fallback: basic normalization with dynamic sizing based on format's slot descriptors
    const slots = getGuestPronounSlots(formatKey);
    const maxIndex = slots.reduce((max, slot) => Math.max(max, slot.index || 0), -1);
    const targetLength = maxIndex >= 0 ? maxIndex + 1 : 9;
    const rawValues = Array.isArray(sourcePronouns) ? sourcePronouns : [];
    
    return Array.from({ length: targetLength }, (_, idx) => {
        const value = rawValues[idx];
        return typeof value === 'string' && value ? value : '';
    });
}

function ensureGuestPronouns(entry, formatKey = 'default') {
    if (!entry || typeof entry !== 'object') return;
    const resolvedFormatKey = entry.invitation_format || formatKey || 'default';
    entry.pronouns = normalizePronounArray(entry.pronouns, resolvedFormatKey);
}

function getFamilyCompanionOptions(entry) {
    const invitationsData = draft.invitations || current.invitations;
    const familyCompanionSlotIndex = getFamilyCompanionSlotIndex();
    const currentValue = String(entry?.pronouns?.[familyCompanionSlotIndex] || '').trim();
    
    // Use InvitationHelpers if available
    if (window.InvitationHelpers) {
        const presets = window.InvitationHelpers.getFamilyCompanionPresets(invitationsData);
        return Array.from(new Set([currentValue, ...presets].filter(Boolean)));
    }
    
    // Fallback
    return Array.from(new Set([currentValue, 'gia đình', 'người thương', 'các cháu', 'các con'].filter(Boolean)));
}

function getResolvedPronounValue(entry, slotIndex, fallbackValue) {
    const rawValue = (typeof entry?.pronouns?.[slotIndex] === 'string' && entry.pronouns[slotIndex])
        ? entry.pronouns[slotIndex]
        : fallbackValue;

    const familyCompanionSlotIndex = getFamilyCompanionSlotIndex();
    
    if (slotIndex === familyCompanionSlotIndex) {
        const companion = String(rawValue || '').trim();
        if (!isFamilyCompanionEnabled(entry) || !companion) {
            return '';
        }
        return ` và ${companion}`;
    }

    return rawValue;
}

function applyPronounForTitleDefaults(entry) {
    if (!entry || typeof entry !== 'object') return;

    ensureGuestPronouns(entry);

    const guestPronoun = String(entry.pronoun_for_title || '').trim();
    if (!guestPronoun) return;

    const invitationsData = draft.invitations || current.invitations;
    const pronounData = draft.pronoun || current.pronoun;
    
    // Determine format key from entry for sizing
    const formatKey = entry.invitation_format || 'default';
    
    // Use InvitationHelpers if available
    if (window.InvitationHelpers) {
        // Step 1: Look up preset in pronoun_for_title_defaults table first
        const preset = window.InvitationHelpers.getPronounForTitleDefaults(invitationsData, guestPronoun);
        
        if (preset && Array.isArray(preset.pronouns)) {
            // Step 2: Found preset - apply all preset pronouns to entry.pronouns
            // Get target length from current format's slot descriptors
            const targetLength = window.InvitationHelpers.getPronounArrayLength(invitationsData, formatKey);
            
            // Normalize preset to match target slot count
            const normalizedPreset = window.InvitationHelpers.normalizePronounForTitleDefaultsEntry(preset, targetLength);
            
            if (normalizedPreset && Array.isArray(normalizedPreset.pronouns)) {
                // Build new pronouns array immutably (copy and apply all indices including empty strings)
                const nextPronouns = [...normalizedPreset.pronouns];
                entry.pronouns = nextPronouns;
                return;
            }
        }
        
        // Step 3: No preset found - fallback to existing guest/couple slot logic
        const format = window.InvitationHelpers.getFormat(invitationsData, formatKey);
        const defaultPronouns = format?.default_pronouns || [];
        
        entry.pronouns = window.InvitationHelpers.applyPronounForTitleDefaults(
            entry.pronouns,
            guestPronoun,
            pronounData,
            invitationsData
        );
        return;
    }

    // Fallback: manual application (when InvitationHelpers not available)
    const guestSlots = getGuestPronounSlotIndexes();
    const coupleSlots = getCouplePronounSlotIndexes();
    
    guestSlots.forEach((slotIndex) => {
        entry.pronouns[slotIndex] = slotIndex === 1
            ? capitalizeFirstWord(guestPronoun)
            : guestPronoun;
    });

    const coupleOptions = getCouplePronounOptionsForGuest(guestPronoun);
    coupleSlots.forEach((slotIndex, order) => {
        const fallback = coupleOptions[0] || '';
        entry.pronouns[slotIndex] = coupleOptions[order] || fallback;
    });
}

function renderCombobox(value, options, onchangeExpr, uniqueId, inputId, inputName) {
    const escapedValue = escapeHtml(String(value || ''));
    const optionsHtml = options.map(opt =>
        `<option value="${escapeHtml(opt)}">`
    ).join('');

    const resolvedInputId = inputId || `combobox-${uniqueId}`;
    const resolvedInputName = inputName || `combobox-${uniqueId}`;
    const idAttr = ` id="${escapeHtml(resolvedInputId)}"`;
    const nameAttr = ` name="${escapeHtml(resolvedInputName)}"`;

    return `
        <div class="combobox-wrapper">
            <input type="text" list="datalist-${uniqueId}"
                   ${idAttr}${nameAttr}
                   value="${escapedValue}"
                   onchange="${onchangeExpr}">
            <datalist id="datalist-${uniqueId}">
                ${optionsHtml}
            </datalist>
        </div>
    `;
}

function getGuestLinksSelectedIndex(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        guestLinksUiState.selectedIndexByFileKey['guest-links'] = -1;
        return -1;
    }

    const rawIndex = guestLinksUiState.selectedIndexByFileKey['guest-links'];
    const normalizedIndex = Number.isInteger(rawIndex) ? rawIndex : 0;
    const clampedIndex = Math.min(Math.max(normalizedIndex, 0), entries.length - 1);
    guestLinksUiState.selectedIndexByFileKey['guest-links'] = clampedIndex;
    return clampedIndex;
}

function setGuestLinksSelectedIndex(index, entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        guestLinksUiState.selectedIndexByFileKey['guest-links'] = -1;
        return -1;
    }

    const numericIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
    const clampedIndex = Math.min(Math.max(numericIndex, 0), entries.length - 1);
    guestLinksUiState.selectedIndexByFileKey['guest-links'] = clampedIndex;
    return clampedIndex;
}

function selectGuestEntry(index) {
    const fileData = draft['guest-links'];
    if (!fileData || !Array.isArray(fileData.entries)) return;
    setGuestLinksSelectedIndex(index, fileData.entries);
    renderEditor();
}

function normalizeGuestEntryForEditor(entry) {
    const source = (entry && typeof entry === 'object') ? entry : {};
    const formatKey = typeof source.invitation_format === 'string' && source.invitation_format.trim()
        ? source.invitation_format.trim().toLowerCase()
        : 'default';
    const pronouns = normalizePronounArray(source.pronouns);

    const normalized = {
        ...source,
        token: typeof source.token === 'string' ? source.token : '',
        phrase: typeof source.phrase === 'string' ? source.phrase : '',
        pronoun_for_title: typeof source.pronoun_for_title === 'string' ? source.pronoun_for_title : '',
        guest_name: typeof source.guest_name === 'string' ? source.guest_name : '',
        invitation_title: typeof source.invitation_title === 'string' ? source.invitation_title : '',
        invitation_format: formatKey,
        pronouns,
        family_companion_enabled: source.family_companion_enabled !== false,
        custom_body_enabled: Boolean(source.custom_body_enabled),
        custom_body: typeof source.custom_body === 'string' ? source.custom_body : ''
    };

    // QR normalization
    normalized.qr = normalizeGuestQr(source.qr);

    return normalized;
}

function normalizeGuestQrImagePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.startsWith('/media/guest-qr/') ? raw : '';
}

function normalizeGuestQr(qr) {
    const source = (qr && typeof qr === 'object') ? qr : {};
    return {
        base_url: normalizeBaseUrl(source.base_url),
        target_url: typeof source.target_url === 'string' ? source.target_url : '',
        image_path: normalizeGuestQrImagePath(source.image_path),
        updated_at: typeof source.updated_at === 'string' ? source.updated_at : ''
    };
}

function ensureGuestEntryQrState(entry) {
    if (!entry || typeof entry !== 'object') return;

    const legacyDataUrl = typeof entry?.qr?.image_data_url === 'string'
        ? entry.qr.image_data_url.trim()
        : '';

    if (legacyDataUrl && !guestQrLegacyDataUrlByEntry.has(entry)) {
        guestQrLegacyDataUrlByEntry.set(entry, legacyDataUrl);
    }

    entry.qr = normalizeGuestQr(entry.qr);
}

function ensureGuestEntriesQrState(entries) {
    if (!Array.isArray(entries)) return;
    entries.forEach(ensureGuestEntryQrState);
}

function normalizeBaseUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return GUEST_LINKS_DEFAULT_BASE_URL;

    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
        const parsed = new URL(withProtocol);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return GUEST_LINKS_DEFAULT_BASE_URL;
        }

        parsed.pathname = '';
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch (_error) {
        return GUEST_LINKS_DEFAULT_BASE_URL;
    }
}

const GUEST_TOKEN_REGEX = /^[a-z0-9]{4,64}$/;

function normalizeGuestTokenInput(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}

function isValidGuestTokenFormat(token) {
    return GUEST_TOKEN_REGEX.test(String(token || ''));
}

function hasDuplicateGuestToken(entries, token, currentIndex) {
    if (!Array.isArray(entries) || !token) return false;

    const normalizedCandidate = normalizeGuestTokenInput(token);
    return entries.some((entry, idx) => {
        if (idx === currentIndex) return false;
        const existing = normalizeGuestTokenInput(entry?.token);
        return existing && existing === normalizedCandidate;
    });
}

function buildGuestInviteUrl(baseUrl, token) {
    const normalizedToken = normalizeGuestTokenInput(token);
    if (!normalizedToken) return '';
    const base = normalizeBaseUrl(baseUrl);
    return `${base}/${normalizedToken}`;
}

async function generateGuestQrDataUrl(url) {
    if (!url || typeof QRCode === 'undefined') return '';
    try {
        // qrcode.min.js provides a global QRCode object
        // toDataURL returns a Promise if no callback is provided
        return await QRCode.toDataURL(url, {
            width: 512,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
    } catch (err) {
        console.error('QR generation failed:', err);
        return '';
    }
}

function sanitizeGuestQrFilenameBase(value) {
    const compact = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return compact || 'guest';
}

function getGuestQrPreviewSrc(entry) {
    if (!entry || !entry.qr) return '';
    if (entry.qr.image_path) return entry.qr.image_path;

    const legacy = guestQrLegacyDataUrlByEntry.get(entry);
    return typeof legacy === 'string' ? legacy : '';
}

function getGuestQrMimeFromDataUrl(imageDataUrl) {
    const raw = String(imageDataUrl || '').trim();
    const match = /^data:([^;,]+);base64,/i.exec(raw);
    return match && match[1] ? match[1].toLowerCase() : '';
}

async function persistGuestQrImage(payload) {
    const response = await fetch('/api/admin/media/guest-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok || !result.success || !result.data) {
        throw new Error(result?.error || 'Failed to persist QR image');
    }

    return result.data;
}

function downloadGuestQr(index) {
    const entry = draft[activeFileKey].entries[index];
    const imagePath = normalizeGuestQrImagePath(entry?.qr?.image_path);

    if (!imagePath) {
        setStatus('No persisted QR image available to download', true);
        return;
    }

    const name = sanitizeGuestQrFilenameBase(entry.guest_name || entry.token || 'guest');
    const extension = imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg') ? 'jpg' : 'png';
    const filename = `guest-qr-${name}.${extension}`;

    const link = document.createElement('a');
    link.href = imagePath + '?download=1';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatus(`Downloaded ${filename}`);
    setTimeout(() => setStatus('Ready'), 1500);
}

function getGuestLinksInvitationContext(formatKey) {
    const invitationsData = draft.invitations || current.invitations;
    const weddingData = draft.wedding || current.wedding || {};
    
    // Use InvitationHelpers if available
    if (window.InvitationHelpers) {
        return window.InvitationHelpers.getInvitationContext(invitationsData, weddingData, formatKey);
    }
    
    // Fallback to wedding.json invitation section (legacy)
    const invitation = (weddingData && typeof weddingData === 'object' && weddingData.invitation)
        ? weddingData.invitation
        : {};

    const defaultPronouns = Array.isArray(invitation.default_pronouns)
        ? invitation.default_pronouns
        : ['bạn', 'Bạn', 'bạn', 'bọn mình', 'bạn', 'gia đình', 'hai đứa', 'bạn', 'chúng mình'];

    const slots = getGuestPronounSlots(formatKey);
    const normalizedDefaults = Array.from({ length: slots.length || 9 }, (_, slot) => {
        const value = defaultPronouns[slot];
        return typeof value === 'string' && value ? value : '';
    });

    return {
        title: (typeof invitation.title === 'string' && invitation.title.trim()) ? invitation.title.trim() : 'Kính mời',
        body: (typeof invitation.body === 'string' && invitation.body.trim())
            ? invitation.body
            : '',
        closing: (typeof invitation.closing === 'string' && invitation.closing.trim()) ? invitation.closing : '· · · ♥ · · ·',
        defaultPronouns: normalizedDefaults
    };
}

function renderGuestPreviewMultiline(text) {
    return escapeHtml(String(text || '')).replace(/\n/g, '<br>');
}

function resolveGuestPreviewBody(entry) {
    const formatKey = entry.invitation_format || 'default';
    const invitationContext = getGuestLinksInvitationContext(formatKey);

    if (entry.custom_body_enabled && entry.custom_body.trim()) {
        return entry.custom_body;
    }

    if (!invitationContext.body) {
        return '';
    }

    // Use InvitationHelpers.renderInvitationBody if available
    if (window.InvitationHelpers) {
        return window.InvitationHelpers.renderInvitationBody(
            invitationContext.body,
            entry.pronouns,
            invitationContext.defaultPronouns,
            entry.family_companion_enabled
        );
    }

    // Fallback: manual rendering using slot descriptors
    const slots = getGuestPronounSlots(formatKey);
    let renderedBody = invitationContext.body;
    
    // Use slot.index from descriptors, not iteration index
    for (const slotMeta of slots) {
        const slotIndex = slotMeta.index;
        const placeholder = `{d${slotIndex}}`;
        const pronoun = getResolvedPronounValue(entry, slotIndex, invitationContext.defaultPronouns[slotIndex]);
        renderedBody = renderedBody.split(placeholder).join(pronoun || '');
    }

    return renderedBody;
}

function renderGuestPreview(entry) {
    const formatKey = entry.invitation_format || 'default';
    const invitationContext = getGuestLinksInvitationContext(formatKey);
    const computedTitle = buildInvitationTitleClient(entry);
    const resolvedTitle = (entry.invitation_title || '').trim()
        || (computedTitle && computedTitle !== '!' ? computedTitle : '')
        || invitationContext.title;
    const resolvedBody = resolveGuestPreviewBody(entry);
    const resolvedClosing = invitationContext.closing || '· · · ♥ · · ·';

    return `
        <div class="guest-preview-card">
            <div class="guest-preview-label">Live Preview</div>
            <div class="guest-preview-title">${escapeHtml(resolvedTitle || 'Kính mời')}</div>
            <div class="guest-preview-divider"></div>
            <div class="guest-preview-body">${renderGuestPreviewMultiline(resolvedBody)}</div>
            <div class="guest-preview-closing">${renderGuestPreviewMultiline(resolvedClosing)}</div>
        </div>
    `;
}

function renderGuestLinksListPanel(entries, selectedIndex) {
    if (!entries.length) {
        return `
            <div class="guest-links-list-panel">
                <div class="guest-links-panel-header">
                    <div>
                        <h4>Guest List</h4>
                        <p>0 entries</p>
                    </div>
                    <button class="btn btn-add-row" onclick="addGuestEntry()">+ Add Guest</button>
                </div>
                <div class="guest-links-empty-state">
                    <p>No guest entries yet.</p>
                    <button class="btn btn-add-row" onclick="addGuestEntry()">+ Add Guest</button>
                </div>
            </div>
        `;
    }

    const rowsHtml = entries.map((entry, index) => {
        const normalized = normalizeGuestEntryForEditor(entry);
        const builtTitle = buildInvitationTitleClient(normalized);
        const title = normalized.invitation_title || (builtTitle !== '!' ? builtTitle : '') || '(Chưa có tiêu đề)';
        const tokenDisplay = normalized.token || '—';

        const canMoveUp = index > 0;
        const canMoveDown = index < entries.length - 1;

        return `
            <tr class="guest-list-row ${index === selectedIndex ? 'is-selected' : ''}"
                onclick="selectGuestEntry(${index})"
                title="Click to edit">
                <td class="guest-list-token-cell">
                    <span class="guest-token-pill"
                          title="${escapeHtml(normalized.token || 'No token generated')} · Double-click to copy"
                          ondblclick="event.stopPropagation(); copyGuestToken(${index});">${escapeHtml(tokenDisplay)}</span>
                </td>
                <td class="guest-list-title-cell" title="${escapeHtml(title)}">${escapeHtml(title)}</td>
                <td class="guest-list-order-cell">
                    <div class="guest-row-order-actions">
                        <button type="button"
                                class="guest-move-btn"
                                title="Move up"
                                aria-label="Move guest up"
                                onclick="event.stopPropagation(); moveGuestEntry(${index}, 'up')"
                                ${canMoveUp ? '' : 'disabled'}>↑</button>
                        <button type="button"
                                class="guest-move-btn"
                                title="Move down"
                                aria-label="Move guest down"
                                onclick="event.stopPropagation(); moveGuestEntry(${index}, 'down')"
                                ${canMoveDown ? '' : 'disabled'}>↓</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="guest-links-list-panel">
            <div class="guest-links-panel-header">
                <div>
                    <h4>Guest List</h4>
                    <p>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</p>
                </div>
                <button class="btn btn-add-row" onclick="addGuestEntry()">+ Add Guest</button>
            </div>
            <div class="guest-links-panel-note">Double-click a token to copy it.</div>
            <div class="guest-links-list-wrap">
                <table class="guest-list-table" aria-label="Guest links list">
                    <thead>
                        <tr>
                            <th>Token</th>
                            <th>Invitation Title</th>
                            <th>Order</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderGuestLinksDetailPanel(entry, index) {
    if (!entry || index < 0) {
        return `
            <div class="guest-links-detail-panel">
                <div class="guest-links-empty-state guest-links-empty-detail">
                    <p>No guest selected.</p>
                    <button class="btn btn-add-row" onclick="addGuestEntry()">+ Add Guest</button>
                </div>
            </div>
        `;
    }

    const derivedTitle = (entry.invitation_title || '').trim()
        || (buildInvitationTitleClient(entry) !== '!' ? buildInvitationTitleClient(entry) : '')
        || 'Kính mời';
    const normalizedBaseUrl = normalizeBaseUrl(entry.qr?.base_url);
    const currentTargetUrl = buildGuestInviteUrl(normalizedBaseUrl, entry.token);
    const qrPreviewSrc = getGuestQrPreviewSrc(entry);
    const hasPersistedQrImage = Boolean(entry.qr?.image_path);
    const hasQrImage = Boolean(qrPreviewSrc);

    // Use entry's invitation_format for pronoun slots
    const formatKey = entry.invitation_format || 'default';
    const slots = getGuestPronounSlots(formatKey);
    const invitationsData = draft.invitations || current.invitations;
    
    // Get presets from InvitationHelpers or use defaults
    const guestPronounPresets = window.InvitationHelpers?.getGuestPronounPresets(invitationsData) || ['bạn', 'em', 'anh', 'chị'];
    
    const pronounFieldsHtml = slots.map((slotMeta, arrayIndex) => {
        // Use the actual slot index from slotMeta, not the array index
        const slotIndex = slotMeta.index;
        
        const options = slotMeta.type === 'couple'
            ? getCouplePronounOptionsForGuest(entry.pronoun_for_title)
            : slotMeta.type === 'family-companion'
                ? getFamilyCompanionOptions(entry)
                : guestPronounPresets;

        const isFamilyCompanionSlot = slotMeta.type === 'family-companion';
        const familyEnabled = isFamilyCompanionEnabled(entry);
        const datalistId = `datalist-pron-detail-${index}-${slotIndex}`;
        const inputId = `guest-pronoun-input-${index}-${slotIndex}`;
        const inputName = `pronoun-${slotIndex}`;
        const familyCompanionControlHtml = isFamilyCompanionSlot
            ? `
                <label class="custom-body-toggle" style="margin-bottom: 0.5rem;">
                    <input type="checkbox" id="guest-family-companion-${index}" name="family_companion_enabled"
                           ${familyEnabled ? 'checked' : ''}
                           onchange="updateGuestFamilyCompanionEnabled(${index}, this.checked)">
                    <span>Include companion phrase</span>
                </label>
                <div class="combobox-wrapper">
                    <input type="text" id="${inputId}" name="${inputName}" list="${datalistId}"
                           value="${escapeHtml(entry.pronouns[slotIndex] || '')}"
                           onchange="updateGuestPronoun(${index}, ${slotIndex}, this.value)"
                           ${familyEnabled ? '' : 'disabled'}>
                    <datalist id="${datalistId}">
                        ${options.map(opt => `<option value="${escapeHtml(opt)}">`).join('')}
                    </datalist>
                </div>
            `
            : renderCombobox(
                entry.pronouns[slotIndex],
                options,
                `updateGuestPronoun(${index}, ${slotIndex}, this.value)`,
                `pron-detail-${index}-${slotIndex}`,
                inputId,
                inputName
            );

        return `
            <div class="guest-pronoun-field">
                <label class="guest-pronoun-slot-label" for="${inputId}">${slotMeta.label || slotMeta.placeholder || `{d${slotIndex}}`}</label>
                <div class="guest-pronoun-slot-hint">${escapeHtml(slotMeta.hint || '')}</div>
                <div id="guest-pronoun-${index}-${slotIndex}">
                    ${familyCompanionControlHtml}
                </div>
            </div>
        `;
    }).join('');

    // Get available formats for the dropdown
    const availableFormats = window.InvitationHelpers?.getAvailableFormats(invitationsData) || [{ key: 'default', label: 'Mặc định' }];
    const currentFormatKey = entry.invitation_format || 'default';

    return `
        <div class="guest-links-detail-panel">
            <div class="guest-detail-sections">
                <div class="guest-detail-section">
                    <h4 class="guest-detail-section-title">Identity</h4>
                    <div class="guest-detail-grid">
                        <div class="guest-form-field guest-form-field-full">
                            <label for="guest-token-${index}">Token</label>
                            <input type="text"
                                   id="guest-token-${index}"
                                   name="token"
                                   value="${escapeHtml(entry.token)}"
                                   class="token-input guest-token-editable"
                                   title="Editable token (32-64 hex chars). Double-click to copy"
                                   onchange="updateGuestEntry(${index}, 'token', this.value)"
                                   onclick="event.stopPropagation()"
                                   ondblclick="event.stopPropagation(); copyGuestToken(${index});"
                                   autocomplete="off"
                                   autocapitalize="off"
                                   autocorrect="off"
                                   spellcheck="false"
                                   placeholder="8-64 ký tự (0-9, a-z)">
                            <div class="guest-field-help">Token có thể chỉnh sửa thủ công. Khi token đổi, QR hiện tại sẽ cần generate lại để đồng bộ.</div>
                        </div>

                        <div class="guest-form-field">
                            <label for="guest-phrase-${index}">Phrase</label>
                            ${renderCombobox(
                                entry.phrase,
                                window.InvitationHelpers?.getPhrasePresets(invitationsData) || ['Kính mời', 'Thân mời', 'Trân trọng kính mời', 'Mời'],
                                `updateGuestEntry(${index}, 'phrase', this.value)`,
                                `phrase-detail-${index}`,
                                `guest-phrase-${index}`,
                                'phrase'
                            )}
                        </div>

                        <div class="guest-form-field">
                            <label for="guest-pronoun-title-${index}">Pronoun for title</label>
                            ${renderCombobox(
                                entry.pronoun_for_title,
                                getPronounForTitleOptions(),
                                `updateGuestEntry(${index}, 'pronoun_for_title', this.value)`,
                                `ptitle-detail-${index}`,
                                `guest-pronoun-title-${index}`,
                                'pronoun_for_title'
                            )}
                        </div>

                        <div class="guest-form-field">
                            <label for="guest-invitation-format-${index}">Invitation Format</label>
                            <select id="guest-invitation-format-${index}"
                                    name="invitation_format"
                                    onchange="updateGuestInvitationFormat(${index}, this.value)">
                                ${availableFormats.map(fmt => `
                                    <option value="${escapeHtml(fmt.key)}" ${fmt.key === currentFormatKey ? 'selected' : ''}>
                                        ${escapeHtml(fmt.label)}
                                    </option>
                                `).join('')}
                            </select>
                            <div class="guest-field-help">Chọn định dạng thiệp cho khách này.</div>
                        </div>

                        <div class="guest-form-field guest-form-field-full">
                            <label for="guest-name-${index}">Guest name</label>
                            <input type="text"
                                   id="guest-name-${index}"
                                   name="guest_name"
                                   value="${escapeHtml(entry.guest_name)}"
                                   onchange="updateGuestEntry(${index}, 'guest_name', this.value)"
                                   placeholder="Guest name">
                        </div>

                        <div class="guest-form-field guest-form-field-full">
                            <span class="guest-readonly-label">Invitation title (derived)</span>
                            <div class="guest-readonly-value" title="${escapeHtml(derivedTitle)}">${escapeHtml(derivedTitle)}</div>
                        </div>
                    </div>
                </div>

                <div class="guest-detail-section">
                    <h4 class="guest-detail-section-title">Pronouns (d0–d8)</h4>
                    <div class="guest-pronoun-grid">
                        ${pronounFieldsHtml}
                    </div>
                </div>

                <div class="guest-detail-section guest-custom-body-section">
                    <h4 class="guest-detail-section-title">Custom body</h4>
                    <label class="custom-body-toggle">
                        <input type="checkbox" id="guest-custom-body-enabled-${index}" name="custom_body_enabled"
                               ${entry.custom_body_enabled ? 'checked' : ''}
                               onchange="toggleGuestCustomBody(${index}, this.checked)">
                        <span>Use custom invitation body</span>
                    </label>
                    ${entry.custom_body_enabled ? `
                        <label for="guest-custom-body-${index}" class="sr-only">Custom invitation body</label>
                        <textarea rows="6"
                                  id="guest-custom-body-${index}"
                                  name="custom_body"
                                  onchange="updateGuestCustomBody(${index}, this.value)"
                                  placeholder="Custom invitation body...">${escapeHtml(entry.custom_body)}</textarea>
                    ` : `
                        <p class="guest-field-help">Preview uses the wedding invitation template with {d0}..{d8} replacements when custom body is disabled.</p>
                    `}
                </div>

                <div class="guest-detail-section">
                    <h4 class="guest-detail-section-title">Preview</h4>
                    ${renderGuestPreview(entry)}
                </div>

                <div class="guest-detail-section">
                    <h4 class="guest-detail-section-title">QR Code</h4>
                    <div class="guest-qr-block">
                        <div class="guest-form-field guest-form-field-full">
                            <label for="guest-base-url-${index}">Base URL</label>
                            <input type="text"
                                   id="guest-base-url-${index}"
                                   name="qr_base_url"
                                   value="${escapeHtml(normalizedBaseUrl)}"
                                   onchange="updateGuestEntry(${index}, 'qr.base_url', this.value)"
                                   placeholder="https://example.com">
                            <div class="guest-field-help">QR points to Base URL + / + Token</div>
                        </div>

                        <div class="guest-qr-target-url" title="${escapeHtml(currentTargetUrl || '')}">
                            Target: <code>${escapeHtml(currentTargetUrl || '(generate token to create target URL)')}</code>
                        </div>

                        ${hasQrImage ? `
                            <div class="guest-qr-preview-wrap">
                                <div class="guest-qr-image-container">
                                    <img src="${escapeHtml(qrPreviewSrc)}" alt="QR Code Preview" class="guest-qr-image">
                                </div>
                                <div class="guest-qr-meta">Updated: ${entry.qr.updated_at ? new Date(entry.qr.updated_at).toLocaleString() : '—'}</div>
                            </div>
                        ` : `
                            <div class="guest-qr-empty">
                                <p>No QR generated yet.</p>
                                <p class="guest-field-help">Click <strong>Generate Token</strong> below to create the QR code.</p>
                            </div>
                        `}

                        <button class="btn btn-download-qr" ${hasPersistedQrImage ? '' : 'disabled'} onclick="downloadGuestQr(${index})">📥 Download QR PNG</button>
                    </div>
                </div>

                <div class="guest-detail-section">
                    <h4 class="guest-detail-section-title">Actions</h4>
                    <div class="guest-detail-actions">
                        <button class="btn btn-generate" onclick="generateGuestToken(${index})">🔑 Generate Token</button>
                        <button class="btn btn-delete-row" onclick="deleteGuestEntry(${index})">🗑️ Delete Guest</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderGuestLinksEditor(data) {
    const metaKeys = Object.keys(data).filter(k => k !== 'entries');
    const entries = Array.isArray(data.entries) ? data.entries : [];

    // Ensure persisted per-entry QR state exists for legacy records.
    ensureGuestEntriesQrState(entries);

    const selectedIndex = getGuestLinksSelectedIndex(entries);
    const selectedEntry = selectedIndex >= 0
        ? normalizeGuestEntryForEditor(entries[selectedIndex])
        : null;

    let html = `<div class="guest-links-editor">`;

    // Metadata section
    if (metaKeys.length > 0) {
        html += `
            <div class="guest-links-meta-section">
                <h3 class="section-title">📋 Metadata</h3>
                <table class="table-editor">
                    <tbody>
        `;
        metaKeys.forEach(key => {
            html += `
                <tr>
                    <td>${escapeHtml(key)}</td>
                    <td>${renderObjectValueInput(key, data[key])}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
    }

    html += `
        <div class="guest-links-entries-section">
            <h3 class="section-title">👥 Guest Entries (${entries.length})</h3>
            <div class="guest-links-split">
                ${renderGuestLinksListPanel(entries, selectedIndex)}
                ${renderGuestLinksDetailPanel(selectedEntry, selectedIndex)}
            </div>
        </div>
    `;

    html += `</div>`;
    editorContainer.innerHTML = html;
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', 'readonly');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
        const success = document.execCommand('copy');
        if (!success) {
            throw new Error('Clipboard command failed');
        }
    } finally {
        document.body.removeChild(textArea);
    }
}

async function copyGuestToken(index) {
    try {
        const fileData = draft['guest-links'];
        const entries = fileData && Array.isArray(fileData.entries) ? fileData.entries : [];
        const entry = entries[index];
        const token = (entry && typeof entry.token === 'string') ? entry.token.trim() : '';

        if (!token) {
            setStatus('No token available to copy', true);
            return;
        }

        await copyTextToClipboard(token);
        setStatus('Guest token copied to clipboard');
        setTimeout(() => setStatus('Ready'), 1500);
    } catch (err) {
        setStatus(`Copy token failed: ${err.message}`, true);
    }
}

/* ===================== GUEST LINKS ACTIONS ===================== */

function updateGuestEntry(index, field, value) {
    const entries = draft[activeFileKey].entries;
    const entry = entries[index];

    ensureGuestEntryQrState(entry);

    if (field === 'token') {
        const normalizedToken = normalizeGuestTokenInput(value);
        const previousToken = normalizeGuestTokenInput(entry.token);

        if (normalizedToken && !isValidGuestTokenFormat(normalizedToken)) {
            setStatus('Token must be 8-64 lowercase hex characters (0-9, a-z)', true);
            renderEditor();
            return;
        }

        if (normalizedToken && hasDuplicateGuestToken(entries, normalizedToken, index)) {
            setStatus('Token already exists. Please use a unique token.', true);
            renderEditor();
            return;
        }

        entry.token = normalizedToken;

        const baseUrl = normalizeBaseUrl(entry.qr?.base_url);
        entry.qr.base_url = baseUrl;
        entry.qr.target_url = buildGuestInviteUrl(baseUrl, normalizedToken);

        if (normalizedToken !== previousToken) {
            entry.qr.image_path = '';
            entry.qr.updated_at = '';
            if (normalizedToken) {
                setStatus('Token updated. Generate QR again to sync the QR image.');
            }
        }

        renderEditor();
        updateDirtyStatus();
        return;
    }

    if (field === 'qr.base_url') {
        entry.qr.base_url = normalizeBaseUrl(value);
        entry.qr.target_url = buildGuestInviteUrl(entry.qr.base_url, entry.token);
    } else {
        entry[field] = value;
    }

    if (field === 'pronoun_for_title') {
        applyPronounForTitleDefaults(entry);
    }

    // Auto-derive invitation_title whenever phrase/pronoun/name changes
    if (['phrase', 'pronoun_for_title', 'guest_name'].includes(field)) {
        entry.invitation_title = buildInvitationTitleClient(entry);
    }

    renderEditor();
    updateDirtyStatus();
}

function updateGuestPronoun(index, slot, value) {
    const entry = draft[activeFileKey].entries[index];
    if (!entry) return;
    
    // Ensure pronouns array is sized correctly for this entry's format
    const formatKey = entry.invitation_format || 'default';
    ensureGuestPronouns(entry, formatKey);
    
    entry.pronouns[slot] = value;
    renderEditor();
    updateDirtyStatus();
}

function updateGuestFamilyCompanionEnabled(index, enabled) {
    const entry = draft[activeFileKey].entries[index];
    ensureGuestPronouns(entry);
    entry.family_companion_enabled = Boolean(enabled);
    renderEditor();
    updateDirtyStatus();
}

function toggleGuestCustomBody(index, enabled) {
    const entry = draft[activeFileKey].entries[index];
    entry.custom_body_enabled = enabled;
    renderEditor();
    updateDirtyStatus();
}

function updateGuestCustomBody(index, value) {
    draft[activeFileKey].entries[index].custom_body = value;
    renderEditor();
    updateDirtyStatus();
}

/**
 * Update the invitation format for a guest entry.
 * Validates the format key and re-normalizes pronouns if needed.
 * @param {number} index - Guest entry index
 * @param {string} formatKey - The format key to set
 */
function updateGuestInvitationFormat(index, formatKey) {
    const entry = draft[activeFileKey].entries[index];
    if (!entry) return;

    const invitationsData = draft.invitations || current.invitations;
    
    // Validate format key against available formats
    const availableFormats = window.InvitationHelpers?.getAvailableFormats(invitationsData) || [{ key: 'default' }];
    const validKeys = availableFormats.map(f => f.key);
    
    // Normalize and validate the format key
    const normalizedKey = typeof formatKey === 'string' ? formatKey.trim().toLowerCase() : 'default';
    const validKey = validKeys.includes(normalizedKey) ? normalizedKey : 'default';
    
    entry.invitation_format = validKey;
    
    // Re-normalize pronouns using the new format's slot descriptors
    // This will resize the array based on the new format's slot count
    entry.pronouns = normalizePronounArray(entry.pronouns, validKey);
    
    renderEditor();
    updateDirtyStatus();
}

function addGuestEntry() {
    const entries = draft[activeFileKey].entries;
    const now = new Date().toISOString();
    
    // Get default pronouns from invitations data
    const invitationsData = draft.invitations || current.invitations;
    const defaultFormat = window.InvitationHelpers?.getFormat(invitationsData, 'default');
    const defaultPronouns = defaultFormat?.default_pronouns ||
        window.InvitationHelpers?.INVITATION_DEFAULTS?.formats?.default?.default_pronouns ||
        ['bạn', 'Bạn', 'bạn', 'bọn mình', 'bạn', 'gia đình', 'hai đứa', 'bạn', 'chúng mình'];
    
    // Get default phrase from invitations data
    const phrasePresets = window.InvitationHelpers?.getPhrasePresets(invitationsData) || ['Kính mời', 'Thân mời'];
    const defaultPhrase = phrasePresets[0] || 'Kính mời';
    
    const newEntry = {
        token: '',
        phrase: defaultPhrase,
        pronoun_for_title: '',
        guest_name: '',
        invitation_title: '',
        invitation_format: 'default',
        pronouns: [...defaultPronouns],
        family_companion_enabled: true,
        custom_body_enabled: false,
        custom_body: '',
        qr: normalizeGuestQr({}),
        created_at: now,
        updated_at: now
    };
    newEntry.invitation_title = buildInvitationTitleClient(newEntry);
    entries.push(newEntry);
    setGuestLinksSelectedIndex(entries.length - 1, entries);
    renderEditor();
    updateDirtyStatus();
}

function moveGuestEntry(index, direction) {
    const entries = draft[activeFileKey].entries;
    if (!Array.isArray(entries) || entries.length < 2) return;

    const fromIndex = Number.isFinite(index) ? Math.trunc(index) : -1;
    const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (delta === 0) return;

    const toIndex = fromIndex + delta;
    if (fromIndex < 0 || fromIndex >= entries.length || toIndex < 0 || toIndex >= entries.length) {
        return;
    }

    const previousSelectedIndex = getGuestLinksSelectedIndex(entries);
    const nextEntries = entries.slice();
    [nextEntries[fromIndex], nextEntries[toIndex]] = [nextEntries[toIndex], nextEntries[fromIndex]];
    draft[activeFileKey].entries = nextEntries;

    let nextSelectedIndex = previousSelectedIndex;
    if (previousSelectedIndex === fromIndex) {
        nextSelectedIndex = toIndex;
    } else if (previousSelectedIndex === toIndex) {
        nextSelectedIndex = fromIndex;
    }

    setGuestLinksSelectedIndex(nextSelectedIndex, nextEntries);
    renderEditor();
    updateDirtyStatus();
}

function deleteGuestEntry(index) {
    const entries = draft[activeFileKey].entries;
    entries.splice(index, 1);
    setGuestLinksSelectedIndex(index, entries);
    renderEditor();
    updateDirtyStatus();
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getRandomHexToken(byteLength = 16) {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(byteLength);
        window.crypto.getRandomValues(bytes);
        return bytesToHex(bytes);
    }

    // Weak fallback for very old browsers
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

async function hashToHexSha256(input) {
    const hasSubtle = window.crypto
        && window.crypto.subtle
        && typeof window.crypto.subtle.digest === 'function';

    if (!hasSubtle) {
        return null;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(hashBuffer));
}

async function generateGuestToken(index) {
    try {
        const entry = draft[activeFileKey].entries[index];
        ensureGuestEntryQrState(entry);

        const input = (entry.phrase || '') + (entry.pronoun_for_title || '') + (entry.guest_name || '') + Date.now().toString();

        // Get all existing tokens except current entry
        const existingTokens = new Set(
            draft[activeFileKey].entries
                .filter((_, i) => i !== index)
                .map((entryItem) => normalizeGuestTokenInput(entryItem?.token))
                .filter(Boolean)
        );

        let candidate = null;
        const fullHash = await hashToHexSha256(input);

        if (fullHash) {
            candidate = fullHash.substring(0, 32);
            if (existingTokens.has(candidate)) {
                candidate = fullHash.substring(0, 64);
            }
        }

        if (!candidate || existingTokens.has(candidate)) {
            do {
                candidate = getRandomHexToken(16);
            } while (existingTokens.has(candidate));
        }

        entry.token = candidate;

        // QR regeneration
        const baseUrl = normalizeBaseUrl(entry.qr?.base_url);
        const targetUrl = buildGuestInviteUrl(baseUrl, candidate);
        const imageDataUrl = await generateGuestQrDataUrl(targetUrl);
        if (!imageDataUrl) {
            throw new Error('Failed to generate QR data URL');
        }

        const mimeType = getGuestQrMimeFromDataUrl(imageDataUrl);
        if (!mimeType) {
            throw new Error('Invalid generated QR format');
        }

        const persistedQr = await persistGuestQrImage({
            token: candidate,
            guest_name: entry.guest_name || '',
            mime_type: mimeType,
            image_data_url: imageDataUrl
        });

        entry.qr = {
            base_url: baseUrl,
            target_url: targetUrl,
            image_path: normalizeGuestQrImagePath(persistedQr.path),
            updated_at: typeof persistedQr.updated_at === 'string' ? persistedQr.updated_at : new Date().toISOString()
        };

        // Also auto-derive invitation_title
        entry.invitation_title = buildInvitationTitleClient(entry);

        setGuestLinksSelectedIndex(index, draft[activeFileKey].entries);
        renderEditor();
        updateDirtyStatus();
        setStatus('Generated token and persisted QR successfully');
        setTimeout(() => setStatus('Ready'), 1500);
    } catch (err) {
        setStatus(`Generate token failed: ${err.message}`, true);
    }
}
