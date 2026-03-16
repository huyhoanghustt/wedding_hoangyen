/**
 * Admin Editor Frontend
 * Handles tab navigation, table/tree editors, and save/discard/reset workflows
 */

// API base URL
const API_BASE = '/api/admin';

// File registry (populated from server)
let fileRegistry = [];

// State management
const current = {};  // Last persisted state from server
const draft = {};    // Mutable draft used by editor
let activeFileKey = null;
let previousActiveFileKey = null;

let isAuthenticated = false;

const tabViewCache = new Map();
const tabDataSignatureCache = new Map();

// DOM elements
const tabNav = document.getElementById('tabNav');
const editorContainer = document.getElementById('editorContainer');
const statusIndicator = document.getElementById('statusIndicator');
const dirtyIndicator = document.getElementById('dirtyIndicator');
const btnSave = document.getElementById('btnSave');
const btnDiscard = document.getElementById('btnDiscard');
const btnReset = document.getElementById('btnReset');
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

/* ===================== AUTHENTICATION ===================== */

const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const btnLogout = document.getElementById('btnLogout');

function showLoginOverlay() {
    loginOverlay.classList.add('active');
    document.querySelector('.admin-container').classList.add('auth-hidden');
    const usernameField = document.getElementById('loginUsername');
    if (usernameField) usernameField.focus();
}

function hideLoginOverlay() {
    loginOverlay.classList.remove('active');
    document.querySelector('.admin-container').classList.remove('auth-hidden');
}

function showLoginError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
}

function hideLoginError() {
    loginError.style.display = 'none';
}

async function checkAuthStatus() {
    try {
        const res = await fetch(`${API_BASE}/auth/status`);
        const result = await res.json();
        isAuthenticated = result.success && result.data && result.data.authenticated;
    } catch (e) {
        isAuthenticated = false;
    }
    return isAuthenticated;
}

async function handleLogin(event) {
    event.preventDefault();
    hideLoginError();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showLoginError('Please enter username and password.');
        return;
    }

    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const result = await res.json();

        if (res.ok && result.success) {
            isAuthenticated = true;
            hideLoginOverlay();
            hideLoginError();
            document.getElementById('loginPassword').value = '';
            init();
        } else if (res.status === 429) {
            showLoginError('Too many login attempts. Please try again later.');
        } else {
            showLoginError(result.error || 'Invalid username or password.');
        }
    } catch (e) {
        showLoginError('Network error. Please check your connection.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch (e) {
        // Ignore network errors on logout
    }
    isAuthenticated = false;
    showLoginOverlay();
}

/* ===================== INITIALIZATION ===================== */

async function init() {
    try {
        // Fetch file registry
        const response = await fetch(`${API_BASE}/files`);
        const result = await response.json();
        
        if (response.status === 401) {
            throw new Error('AUTH_REQUIRED');
        }
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        fileRegistry = result.data;
        
        // Build tabs
        buildTabs();
        
        // Activate first tab
        if (fileRegistry.length > 0) {
            await activateTab(fileRegistry[0].key);
        }
    } catch (err) {
        if (err.message === 'AUTH_REQUIRED') {
            showLoginOverlay();
            return;
        }
        editorContainer.innerHTML = `<p class="loading" style="color: var(--danger);">Error: ${err.message}</p>`;
    }
}

function buildTabs() {
    tabNav.innerHTML = fileRegistry.map(file => `
        <button class="tab-btn" data-key="${file.key}" onclick="activateTab('${file.key}')">
            ${file.label}
        </button>
    `).join('');
}

async function activateTab(fileKey, allowFallback = true) {
    const metricStart = performance.now();

    activeFileKey = fileKey;

    // Update tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.key === fileKey);
    });

    // Load file data if not cached
    if (!current[fileKey]) {
        await loadFile(fileKey);
    }

    // Guest-links depends on pronoun map and invitations data for smart defaults/suggestions
    if (fileKey === 'guest-links') {
        await ensurePronounMapLoaded();
        await ensureInvitationsLoaded();
    }

    const actionBar = document.getElementById('actionBar');
    if (actionBar) {
        actionBar.style.display = (fileKey === 'media-index') ? 'none' : '';
    }

    try {
        // Always render directly (safe path)
        renderEditor();
        updateDirtyStatus();
    } catch (err) {
        const errMessage = err && err.message ? err.message : 'Unknown render error';
        setStatus(`Error rendering "${fileKey}": ${errMessage}`, true);

        if (allowFallback) {
            const fallbackTab = fileRegistry.find(file => file.key !== fileKey);
            if (fallbackTab) {
                await activateTab(fallbackTab.key, false);
                return;
            }
        }

        return;
    }

    logPerfMetric('tab-switch', {
        tab: fileKey,
        source: 'render',
        durationMs: Math.round((performance.now() - metricStart) * 100) / 100
    });
}

async function loadFile(fileKey) {
    setStatus('Loading...');
    
    try {
        const response = await fetch(`${API_BASE}/files/${fileKey}`);

        if (response.status === 401) {
            showLoginOverlay();
            return;
        }

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        current[fileKey] = deepClone(result.data);
        draft[fileKey] = deepClone(result.data);
        
        setStatus('Ready');
    } catch (err) {
        setStatus(`Error: ${err.message}`, true);
        throw err;
    }
}

async function ensurePronounMapLoaded() {
    if (current.pronoun) return;

    const hasPronounFile = fileRegistry.some(file => file.key === 'pronoun');
    if (!hasPronounFile) return;

    await loadFile('pronoun');
}

async function ensureInvitationsLoaded() {
    if (current.invitations) return;

    const hasInvitationsFile = fileRegistry.some(file => file.key === 'invitations');
    if (!hasInvitationsFile) return;

    await loadFile('invitations');
}

/* ===================== DIRTY STATE ===================== */

function isDirty() {
    if (!activeFileKey || !current[activeFileKey] || !draft[activeFileKey]) {
        return false;
    }

    try {
        return !deepEqual(current[activeFileKey], draft[activeFileKey]);
    } catch (error) {
        console.warn('[admin] dirty-state comparison failed', error);
        return false;
    }
}

function updateDirtyStatus() {
    const dirty = isDirty();
    dirtyIndicator.style.display = dirty ? 'inline' : 'none';
    
    // Set disabled state using both attribute AND class for reliability
    // This ensures CSS can target both :disabled and .btn-disabled
    const setButtonState = (btn, isDisabled) => {
        btn.disabled = isDisabled;
        btn.classList.toggle('btn-disabled', isDisabled);
    };
    
    setButtonState(btnSave, !dirty);
    setButtonState(btnDiscard, !dirty);
}

/* ===================== ACTIONS ===================== */

async function handleSave() {
    if (!activeFileKey || !isDirty()) return;
    
    setStatus('Saving...');
    
    try {
        const response = await fetch(`${API_BASE}/files/${activeFileKey}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft[activeFileKey])
        });
        
        if (response.status === 401) {
            showLoginOverlay();
            return;
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        current[activeFileKey] = deepClone(result.data);
        draft[activeFileKey] = deepClone(result.data);
        invalidateTabCache(activeFileKey);

        setStatus('Saved successfully!');
        updateDirtyStatus();
        
        setTimeout(() => setStatus('Ready'), 2000);
    } catch (err) {
        setStatus(`Save failed: ${err.message}`, true);
    }
}

async function handleDiscard() {
    if (!activeFileKey || !isDirty()) return;
    
    // Reload from server
    await loadFile(activeFileKey);
    renderEditor();
    updateDirtyStatus();
    setStatus('Discarded changes');
}

async function handleReset() {
    if (!activeFileKey) return;
    
    showModal(
        'Reset to Default',
        `Are you sure you want to reset "${activeFileKey}" to its default state? This will overwrite all current data.`,
        async () => {
            closeModal();
            setStatus('Resetting...');
            
            try {
                const response = await fetch(`${API_BASE}/files/${activeFileKey}/reset`, {
                    method: 'POST'
                });
                
                if (response.status === 401) {
                    showLoginOverlay();
                    return;
                }
                
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                current[activeFileKey] = deepClone(result.data);
                draft[activeFileKey] = deepClone(result.data);
                invalidateTabCache(activeFileKey);

                renderEditor();
                updateDirtyStatus();
                setStatus('Reset to default successfully!');
                
                setTimeout(() => setStatus('Ready'), 2000);
            } catch (err) {
                setStatus(`Reset failed: ${err.message}`, true);
            }
        }
    );
}

/* ===================== MODAL ===================== */

function showModal(title, message, onConfirm) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalConfirmBtn.onclick = onConfirm;
    confirmModal.style.display = 'flex';
}

function closeModal() {
    confirmModal.style.display = 'none';
}

/* ===================== EDITOR RENDERING ===================== */

function renderEditor() {
    const file = fileRegistry.find(f => f.key === activeFileKey);
    if (!file) return;

    const actionBar = document.getElementById('actionBar');
    if (actionBar) {
        actionBar.style.display = (activeFileKey === 'media-index') ? 'none' : '';
    }

    const data = draft[activeFileKey];

    if (file.key === 'wedding') {
        renderTreeEditor(data);
    } else if (file.key === 'story-layout') {
        renderStoryLayoutEditor(data);
    } else if (file.key === 'hero_gallery') {
        renderGalleryEditor(data);
    } else if (file.key === 'media-index') {
        renderMediaIndexEditor(data);
    } else if (file.key === 'guest-links') {
        renderGuestLinksEditor(data);
    } else if (file.key === 'invitations') {
        renderInvitationsEditor(data);
    } else {
        renderTableEditor(data, file);
    }

    updateTabDataSignature(activeFileKey);
}

function getTabDataSignature(fileKey) {
    if (!fileKey || !Object.prototype.hasOwnProperty.call(draft, fileKey)) {
        return '';
    }

    try {
        return JSON.stringify(draft[fileKey]);
    } catch (_error) {
        return '';
    }
}

function updateTabDataSignature(fileKey) {
    if (!fileKey) return;
    tabDataSignatureCache.set(fileKey, getTabDataSignature(fileKey));
}

function cacheCurrentTabViewNode() {
    if (!activeFileKey || !editorContainer.firstElementChild) return;

    tabViewCache.set(activeFileKey, editorContainer.firstElementChild);
    updateTabDataSignature(activeFileKey);
}

function restoreTabViewFromCache(fileKey) {
    if (!fileKey) return false;

    const cachedNode = tabViewCache.get(fileKey);
    const cachedSignature = tabDataSignatureCache.get(fileKey);
    const currentSignature = getTabDataSignature(fileKey);

    if (!cachedNode || cachedSignature !== currentSignature) {
        return false;
    }

    editorContainer.replaceChildren(cachedNode);
    return true;
}

function invalidateTabCache(fileKey) {
    if (!fileKey) return;
    tabViewCache.delete(fileKey);
    tabDataSignatureCache.delete(fileKey);
}

/* ===================== UTILITIES ===================== */

function deepClone(obj) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (_error) {
            // Fallback to JSON clone below
        }
    }

    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (_error) {
        return obj;
    }
}

function deepEqual(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (_error) {
        return false;
    }
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeTextInput(text) {
    if (typeof text !== 'string') {
        return '';
    }

    const withoutTags = text.replace(/<[^>]*>/g, '');
    const withoutJavascriptProtocols = withoutTags.replace(/javascript\s*:/gi, '');
    const withoutControlChars = withoutJavascriptProtocols.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    const trimmedLines = withoutControlChars
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n');

    return trimmedLines.slice(0, 5000);
}

function toSafePreviewUrl(path) {
    if (typeof path !== 'string') return '';

    // Media files: use admin media preview endpoint
    if (path.startsWith('/media/')) {
        const parts = path.split('/');
        // /media/:type/:filename → parts = ['', 'media', type, filename]
        if (parts.length === 4) {
            return `${API_BASE}/media/preview/${encodeURIComponent(parts[2])}/${encodeURIComponent(parts[3])}`;
        }
        return '';
    }

    // Legacy /assets/ paths
    if (path.startsWith('/assets/')) {
        return `${API_BASE}/assets/preview?path=${encodeURIComponent(path)}`;
    }

    return '';
}

function getNestedValue(obj, path) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    
    return current;
}

function setNestedValue(obj, path, value) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
            current[part] = {};
        }
        current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
}

function setStatus(message, isError = false) {
    statusIndicator.textContent = message;
    statusIndicator.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
}

function logPerfMetric(metricName, payload) {
    try {
        console.info(`[admin-metric] ${metricName}`, payload || {});
    } catch (_error) {
        // no-op
    }
}

/* ===================== START ===================== */

// Auth-aware startup
document.addEventListener('DOMContentLoaded', async function startup() {
    const authed = await checkAuthStatus();
    if (authed) {
        hideLoginOverlay();
        init();
    } else {
        showLoginOverlay();
    }
});
