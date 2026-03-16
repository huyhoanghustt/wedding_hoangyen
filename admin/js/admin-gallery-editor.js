/* ===================== HERO & GALLERY EDITOR ===================== */

const GALLERY_SIZE_FIELDS = ['main_img_width', 'thumb_size', 'nav_btn_size', 'nav_icon_size'];
const SAFE_MEDIA_FILENAME_RE = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

let assetPickerCallback = null;
let currentAssetPickerIndex = null;
let treeAssetPickerPath = null;
let heroPickerFieldKey = null;
let galleryPickerMode = 'replace'; // replace | add
let mediaPickerItems = [];
let mediaPickerItemByPath = new Map();
let mediaPickerPageIndex = 0;
let selectedMediaItem = null;
let selectedMediaElement = null;
let mediaPickerStatusCache = { message: '', isError: false };
let galleryEditorDelegatedEventsBound = false;
let assetPickerDelegatedEventsBound = false;

const MEDIA_PICKER_PAGE_SIZE = 50;

function renderGalleryEditor(data) {
    const root = data && typeof data === 'object' ? data : {};
    const hero = root.hero && typeof root.hero === 'object' ? root.hero : {};
    const gallery = root.gallery && typeof root.gallery === 'object' ? root.gallery : {};
    const photos = Array.isArray(gallery.photos) ? gallery.photos : [];
    const sizes = gallery.sizes && typeof gallery.sizes === 'object' ? gallery.sizes : {};

    editorContainer.innerHTML = `
        <div class="gallery-editor">
            <div class="gallery-photos-section hero-settings-section">
                <h3 class="section-title">🦸 Hero Settings</h3>
                ${renderHeroSettingsEditor(hero)}
            </div>

            <div class="gallery-photos-section">
                <h3 class="section-title">📸 Gallery Photos (${photos.length})</h3>
                ${renderPhotosTable(photos)}
                <div class="gallery-photo-actions">
                    <button class="btn btn-add-row" type="button" data-action="add-gallery-photo">+ Add Photo</button>
                    <button class="btn btn-browse" type="button" data-action="trigger-gallery-photo-upload">⤴ Upload Photos</button>
                    <input id="galleryPhotoUploadInput" type="file" accept="image/*" multiple style="display:none">
                </div>
            </div>

            <div class="gallery-sizes-section">
                <h3 class="section-title">📐 Gallery Sizes</h3>
                ${renderSizesEditor(sizes)}
            </div>
        </div>
    `;

    bindGalleryEditorEventDelegation();
}

function renderHeroSettingsEditor(hero) {
    const photoPath = typeof hero.photo === 'string' ? hero.photo : '';
    const previewUrl = toSafePreviewUrl(photoPath);
    const namePos = hero.name_overlay_pos && typeof hero.name_overlay_pos === 'object' ? hero.name_overlay_pos : {};
    const bottomPos = hero.bottom_overlay_pos && typeof hero.bottom_overlay_pos === 'object' ? hero.bottom_overlay_pos : {};

    return `
        <div class="hero-settings-grid">
            <div class="hero-photo-block">
                <label class="hero-photo-label">Hero Photo</label>
                <div class="hero-photo-preview-wrap">
                    ${previewUrl
                        ? `<img src="${escapeHtml(previewUrl)}" alt="Hero preview" class="hero-photo-preview" loading="lazy">`
                        : '<div class="hero-photo-preview hero-photo-preview-empty">No image</div>'}
                </div>
                <div class="src-input-group">
                    <input type="text" value="${escapeHtml(photoPath)}"
                           onchange="updateHeroField('photo', this.value); renderEditor();"
                           placeholder="/media/photos/file.jpg">
                    <button class="btn btn-browse" type="button" data-action="open-hero-photo-picker" title="Browse uploaded photos">📁</button>
                </div>
            </div>

            <div class="hero-fields-block">
                <div class="hero-field-group">
                    <label>Photo Width</label>
                    <input type="text" value="${escapeHtml(String(hero.photo_width || ''))}"
                           onchange="updateHeroField('photo_width', this.value)"
                           placeholder="100%">
                </div>

                <div class="hero-field-group">
                    <label>Invite Label</label>
                    <input type="text" value="${escapeHtml(String(hero.invite_label || ''))}"
                           onchange="updateHeroField('invite_label', this.value)"
                           placeholder="Thư mời tiệc cưới">
                </div>

                <div class="hero-field-group">
                    <label>Event Name</label>
                    <input type="text" value="${escapeHtml(String(hero.event_name || ''))}"
                           onchange="updateHeroField('event_name', this.value)"
                           placeholder="Lễ Thành Hôn">
                </div>

                <div class="hero-field-group">
                    <label>Name Overlay</label>
                    <div class="hero-position-group">
                        <span>top</span>
                        <input type="text" value="${escapeHtml(String(namePos.top || ''))}"
                               onchange="updateHeroPosition('name_overlay_pos', 'top', this.value)"
                               placeholder="0.65rem">
                        <span>right</span>
                        <input type="text" value="${escapeHtml(String(namePos.right || ''))}"
                               onchange="updateHeroPosition('name_overlay_pos', 'right', this.value)"
                               placeholder="0.16rem">
                    </div>
                </div>

                <div class="hero-field-group">
                    <label>Bottom Overlay</label>
                    <div class="hero-position-group">
                        <span>bottom</span>
                        <input type="text" value="${escapeHtml(String(bottomPos.bottom || ''))}"
                               onchange="updateHeroPosition('bottom_overlay_pos', 'bottom', this.value)"
                               placeholder="0.04rem">
                        <span>right</span>
                        <input type="text" value="${escapeHtml(String(bottomPos.right || ''))}"
                               onchange="updateHeroPosition('bottom_overlay_pos', 'right', this.value)"
                               placeholder="0.16rem">
                    </div>
                </div>
            </div>
        </div>
    `;
}

function buildThumbnailUrl(src) {
    if (typeof src !== 'string' || !src.startsWith('/media/')) return '';
    const parts = src.split('/');
    if (parts.length === 4) {
        return `${API_BASE}/media/preview/${encodeURIComponent(parts[2])}/${encodeURIComponent(parts[3])}?thumb=1&size=256`;
    }
    return '';
}

function buildOriginalPreviewUrl(src) {
    return toSafePreviewUrl(src);
}

function isSafeOriginalPreviewUrl(url) {
    return typeof url === 'string' && url.startsWith(`${API_BASE}/media/preview/`);
}

function renderPhotosTable(photos) {
    if (!photos.length) {
        return '<p class="loading">No gallery photos yet. Use <strong>Add Photo</strong> or <strong>Upload Photos</strong>.</p>';
    }

    let html = `
        <table class="table-editor photos-table">
            <thead>
                <tr>
                    <th>Preview</th>
                    <th>src</th>
                    <th>alt</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    photos.forEach((photo, index) => {
        const src = typeof photo?.src === 'string' ? photo.src : '';
        const alt = typeof photo?.alt === 'string' ? photo.alt : '';
        const thumbUrl = buildThumbnailUrl(src);
        const originalPreviewUrl = buildOriginalPreviewUrl(src);
        const canMoveUp = index > 0;
        const canMoveDown = index < photos.length - 1;

        html += `
            <tr>
                <td class="photo-preview-cell">
                    ${thumbUrl
                        ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(alt)}" class="photo-preview-thumb" loading="lazy" decoding="async" fetchpriority="low" data-action="open-original-preview" data-original-preview-url="${escapeHtml(originalPreviewUrl)}">`
                        : '<span class="no-preview">No image</span>'}
                </td>
                <td class="src-cell">
                    <div class="src-input-group">
                        <input type="text" value="${escapeHtml(src)}"
                               onchange="updateGalleryPhoto(${index}, 'src', this.value); renderEditor();"
                               placeholder="/media/photos/file.jpg">
                        <button class="btn btn-browse" type="button" data-action="open-gallery-asset-picker" data-index="${index}" title="Browse uploaded photos">📁</button>
                    </div>
                </td>
                <td>
                    <input type="text" value="${escapeHtml(alt)}"
                           onchange="updateGalleryPhoto(${index}, 'alt', this.value)"
                           placeholder="Ảnh cưới ${index + 1}">
                </td>
                <td class="table-editor-actions">
                    <button class="btn btn-move-up" type="button" data-action="move-gallery-photo" data-index="${index}" data-direction="-1" ${canMoveUp ? '' : 'disabled'} title="Move photo up">⬆️</button>
                    <button class="btn btn-move-down" type="button" data-action="move-gallery-photo" data-index="${index}" data-direction="1" ${canMoveDown ? '' : 'disabled'} title="Move photo down">⬇️</button>
                    <button class="btn btn-delete-row" type="button" data-action="delete-gallery-photo" data-index="${index}">🗑️</button>
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    return html;
}

function renderSizesEditor(sizes) {
    let html = `
        <table class="table-editor sizes-table">
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
    `;

    GALLERY_SIZE_FIELDS.forEach((field) => {
        const value = sizes[field] || '';
        html += `
            <tr>
                <td>${escapeHtml(field)}</td>
                <td>
                    <input type="text" value="${escapeHtml(String(value))}"
                           onchange="updateGallerySize('${escapeHtml(field)}', this.value)"
                           placeholder="e.g., 100% or 0.8rem">
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
        <p class="hint">Sizes support CSS values like <code>100%</code>, <code>0.8rem</code>, and <code>48px</code>.</p>
    `;

    return html;
}

function bindGalleryEditorEventDelegation() {
    if (galleryEditorDelegatedEventsBound || !editorContainer) return;

    editorContainer.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl || !editorContainer.contains(actionEl)) return;

        const action = actionEl.dataset.action;
        if (!action) return;

        if (action === 'add-gallery-photo') {
            addGalleryPhoto();
            return;
        }

        if (action === 'trigger-gallery-photo-upload') {
            triggerGalleryPhotoUpload();
            return;
        }

        if (action === 'open-hero-photo-picker') {
            openHeroPhotoPicker();
            return;
        }

        if (action === 'open-gallery-asset-picker') {
            const index = Number.parseInt(actionEl.dataset.index || '', 10);
            if (Number.isInteger(index) && index >= 0) {
                openAssetPicker(index);
            }
            return;
        }

        if (action === 'move-gallery-photo') {
            const index = Number.parseInt(actionEl.dataset.index || '', 10);
            const direction = Number.parseInt(actionEl.dataset.direction || '', 10);
            if (Number.isInteger(index) && index >= 0 && (direction === -1 || direction === 1)) {
                moveGalleryPhoto(index, direction);
            }
            return;
        }

        if (action === 'delete-gallery-photo') {
            const index = Number.parseInt(actionEl.dataset.index || '', 10);
            if (Number.isInteger(index) && index >= 0) {
                deleteGalleryPhoto(index);
            }
        }
    });

    editorContainer.addEventListener('dblclick', (event) => {
        if (activeFileKey !== 'hero_gallery') return;

        const imgEl = event.target.closest('img[data-action="open-original-preview"]');
        if (!imgEl || !editorContainer.contains(imgEl)) return;

        const originalUrl = imgEl.dataset.originalPreviewUrl;
        if (!isSafeOriginalPreviewUrl(originalUrl)) return;

        window.open(originalUrl, '_blank', 'noopener');
    });

    editorContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.id !== 'galleryPhotoUploadInput') return;
        handleGalleryUploadFiles(target.files);
    });

    galleryEditorDelegatedEventsBound = true;
}

function bindAssetPickerModalEventDelegation(modal) {
    if (assetPickerDelegatedEventsBound || !modal) return;

    modal.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl || !modal.contains(actionEl)) return;

        const action = actionEl.dataset.action;
        if (!action) return;

        if (action === 'close-asset-picker') {
            closeAssetPicker();
            return;
        }

        if (action === 'trigger-media-picker-upload') {
            triggerMediaPickerUpload();
            return;
        }

        if (action === 'refresh-media-picker') {
            loadMediaPickerPhotos();
            return;
        }

        if (action === 'picker-prev-page') {
            setMediaPickerPage(mediaPickerPageIndex - 1);
            return;
        }

        if (action === 'picker-next-page') {
            setMediaPickerPage(mediaPickerPageIndex + 1);
            return;
        }

        if (action === 'confirm-asset-selection') {
            confirmAssetSelection();
            return;
        }

        if (action === 'select-media') {
            const filename = typeof actionEl.dataset.filename === 'string' ? actionEl.dataset.filename : '';
            if (!SAFE_MEDIA_FILENAME_RE.test(filename)) {
                setMediaPickerStatus('Invalid media filename', true);
                return;
            }
            selectAsset(`/media/photos/${filename}`, actionEl);
        }
    });

    modal.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.id !== 'mediaPickerUploadInput') return;
        handleMediaPickerUploadInput(target);
    });

    assetPickerDelegatedEventsBound = true;
}

/* ===================== DRAFT HELPERS ===================== */

function ensureHeroGalleryDraftState() {
    const fileDraft = draft[activeFileKey];
    if (!fileDraft || typeof fileDraft !== 'object') return null;

    if (!fileDraft.hero || typeof fileDraft.hero !== 'object' || Array.isArray(fileDraft.hero)) {
        fileDraft.hero = {};
    }

    if (!fileDraft.gallery || typeof fileDraft.gallery !== 'object' || Array.isArray(fileDraft.gallery)) {
        fileDraft.gallery = {};
    }

    if (!Array.isArray(fileDraft.gallery.photos)) {
        fileDraft.gallery.photos = [];
    }

    if (!fileDraft.gallery.sizes || typeof fileDraft.gallery.sizes !== 'object' || Array.isArray(fileDraft.gallery.sizes)) {
        fileDraft.gallery.sizes = {};
    }

    return fileDraft;
}

/* ===================== HERO ACTIONS ===================== */

function updateHeroField(key, value) {
    const state = ensureHeroGalleryDraftState();
    if (!state) return;
    state.hero[key] = value;
    updateDirtyStatus();
}

function updateHeroPosition(posKey, side, value) {
    const state = ensureHeroGalleryDraftState();
    if (!state) return;

    if (!state.hero[posKey] || typeof state.hero[posKey] !== 'object' || Array.isArray(state.hero[posKey])) {
        state.hero[posKey] = {};
    }

    state.hero[posKey][side] = value;
    updateDirtyStatus();
}

function openHeroPhotoPicker() {
    heroPickerFieldKey = 'photo';
    currentAssetPickerIndex = null;
    treeAssetPickerPath = null;
    galleryPickerMode = 'replace';
    assetPickerCallback = null;
    showAssetPickerModal();
}

/* ===================== GALLERY ACTIONS ===================== */

function updateGalleryPhoto(index, key, value) {
    const state = ensureHeroGalleryDraftState();
    if (!state || !state.gallery.photos[index]) return;
    state.gallery.photos[index][key] = value;
    updateDirtyStatus();
}

function addGalleryPhoto(photo) {
    if (!photo || typeof photo !== 'object') {
        currentAssetPickerIndex = null;
        treeAssetPickerPath = null;
        heroPickerFieldKey = null;
        galleryPickerMode = 'add';
        assetPickerCallback = null;
        showAssetPickerModal();
        return;
    }

    const state = ensureHeroGalleryDraftState();
    if (!state) return;

    state.gallery.photos.push({
        src: typeof photo.src === 'string' ? photo.src : '',
        alt: typeof photo.alt === 'string' ? photo.alt : ''
    });

    renderEditor();
    updateDirtyStatus();
}

function moveGalleryPhoto(index, direction) {
    const state = ensureHeroGalleryDraftState();
    if (!state) return;

    const photos = state.gallery.photos;
    const targetIndex = index + direction;
    if (!Array.isArray(photos) || targetIndex < 0 || targetIndex >= photos.length) {
        return;
    }

    const nextPhotos = [...photos];
    [nextPhotos[index], nextPhotos[targetIndex]] = [nextPhotos[targetIndex], nextPhotos[index]];
    state.gallery.photos = nextPhotos;
    renderEditor();
    updateDirtyStatus();
}

function deleteGalleryPhoto(index) {
    const state = ensureHeroGalleryDraftState();
    if (!state) return;

    state.gallery.photos = state.gallery.photos.filter((_photo, photoIndex) => photoIndex !== index);
    renderEditor();
    updateDirtyStatus();
}

function updateGallerySize(key, value) {
    const state = ensureHeroGalleryDraftState();
    if (!state) return;

    state.gallery.sizes[key] = value;
    updateDirtyStatus();
}

function triggerGalleryPhotoUpload() {
    const input = document.getElementById('galleryPhotoUploadInput');
    if (input) input.click();
}

async function handleGalleryUploadFiles(fileList) {
    const files = Array.from(fileList || []);
    const input = document.getElementById('galleryPhotoUploadInput');
    if (!files.length) {
        if (input) input.value = '';
        return;
    }

    try {
        setStatus(`Uploading ${files.length} photo(s)...`);
        const uploadedItems = await uploadMediaFiles(files);
        const state = ensureHeroGalleryDraftState();
        if (!state) return;

        uploadedItems.forEach((item) => {
            if (!item || !item.url) return;
            state.gallery.photos.push({ src: item.url, alt: '' });
        });

        renderEditor();
        updateDirtyStatus();
        setStatus(`Uploaded ${uploadedItems.length} photo(s) to gallery`);
    } catch (error) {
        setStatus(`Upload failed: ${error.message}`, true);
    } finally {
        if (input) input.value = '';
    }
}

/* ===================== MEDIA PICKER MODAL ===================== */

function ensureAssetPickerModal() {
    let modal = document.getElementById('assetPickerModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'assetPickerModal';
    modal.className = 'media-picker-modal';
    modal.innerHTML = `
        <div class="media-picker-content" role="dialog" aria-modal="true" aria-label="Select media">
            <div class="media-picker-header">
                <h3>🖼️ Select Photo</h3>
                <button class="btn btn-close" type="button" data-action="close-asset-picker" aria-label="Close picker">✕</button>
            </div>
            <div class="media-picker-toolbar">
                <button class="btn btn-browse" type="button" data-action="trigger-media-picker-upload">⤴ Upload Photos</button>
                <button class="btn" type="button" data-action="refresh-media-picker">↻ Refresh</button>
                <input id="mediaPickerUploadInput" type="file" accept="image/*" multiple style="display:none">
                <span id="mediaPickerStatus" class="media-picker-status"></span>
            </div>
            <div class="media-picker-body">
                <div class="media-picker-grid" id="mediaPickerGrid"></div>
            </div>
            <div class="media-picker-pagination" id="mediaPickerPagination"></div>
            <div class="media-picker-footer">
                <span id="assetPickerPath">/media/photos</span>
                <button class="btn btn-cancel" type="button" data-action="close-asset-picker">Cancel</button>
                <button class="btn btn-confirm" type="button" id="assetPickerConfirm" data-action="confirm-asset-selection" disabled>Select</button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeAssetPicker();
        }
    });

    bindAssetPickerModalEventDelegation(modal);
    document.body.appendChild(modal);
    return modal;
}

function showAssetPickerModal() {
    const modal = ensureAssetPickerModal();
    modal.style.display = 'flex';

    window.selectedAssetPath = null;
    selectedMediaItem = null;
    selectedMediaElement = null;
    mediaPickerPageIndex = 0;
    setAssetPickerConfirmEnabled(false);
    setMediaPickerStatus('', false);

    window.__adminPickerOpenStart = performance.now();
    loadMediaPickerPhotos();
}

function closeAssetPicker() {
    const modal = document.getElementById('assetPickerModal');
    if (modal) {
        modal.style.display = 'none';
    }

    window.selectedAssetPath = null;
    selectedMediaItem = null;
    currentAssetPickerIndex = null;
    treeAssetPickerPath = null;
    heroPickerFieldKey = null;
    galleryPickerMode = 'replace';
    assetPickerCallback = null;
    setAssetPickerConfirmEnabled(false);
}

function setAssetPickerConfirmEnabled(enabled) {
    const confirmBtn = document.getElementById('assetPickerConfirm');
    if (confirmBtn) confirmBtn.disabled = !enabled;
}

function setMediaPickerStatus(message, isError) {
    mediaPickerStatusCache = { message: message || '', isError: !!isError };
    const el = document.getElementById('mediaPickerStatus');
    if (!el) return;

    el.textContent = mediaPickerStatusCache.message;
    el.classList.toggle('error', !!isError);
}

async function fetchAdminJson(url, options) {
    const response = await fetch(url, options);

    if (response.status === 401) {
        showLoginOverlay();
        throw new Error('Authentication required');
    }

    let result;
    try {
        result = await response.json();
    } catch (_error) {
        throw new Error('Invalid server response');
    }

    if (!response.ok || !result || result.success !== true) {
        throw new Error(result && result.error ? result.error : `Request failed (${response.status})`);
    }

    return result;
}

async function loadMediaPickerPhotos() {
    const grid = document.getElementById('mediaPickerGrid');
    if (!grid) return;

    grid.innerHTML = '<p class="loading">Loading uploaded photos...</p>';
    setMediaPickerStatus('Loading...', false);
    setAssetPickerConfirmEnabled(false);
    window.selectedAssetPath = null;
    selectedMediaItem = null;
    selectedMediaElement = null;

    try {
        const result = await fetchAdminJson(`${API_BASE}/media/list?type=photos`);
        mediaPickerItems = Array.isArray(result.data) ? result.data.slice() : [];
        mediaPickerItemByPath = buildMediaPickerPathIndex(mediaPickerItems);
        mediaPickerPageIndex = 0;
        renderMediaPickerGrid();
        setMediaPickerStatus(`${mediaPickerItems.length} photo(s) available`, false);

        if (Number.isFinite(window.__adminPickerOpenStart)) {
            logGalleryPerfMetric('picker-open', {
                durationMs: Math.round((performance.now() - window.__adminPickerOpenStart) * 100) / 100,
                totalItems: mediaPickerItems.length
            });
        }
    } catch (error) {
        mediaPickerItems = [];
        mediaPickerItemByPath = new Map();
        grid.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        setMediaPickerStatus(error.message, true);
    }
}

function renderMediaPickerGrid() {
    const metricStart = performance.now();
    const grid = document.getElementById('mediaPickerGrid');
    const pagination = document.getElementById('mediaPickerPagination');
    if (!grid) return;

    if (!mediaPickerItems.length) {
        grid.innerHTML = '<p class="hint">No uploaded photos yet. Use <strong>Upload Photos</strong> to add files.</p>';
        if (pagination) pagination.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(mediaPickerItems.length / MEDIA_PICKER_PAGE_SIZE));
    mediaPickerPageIndex = clampMediaPickerPage(mediaPickerPageIndex, totalPages);

    const start = mediaPickerPageIndex * MEDIA_PICKER_PAGE_SIZE;
    const end = Math.min(start + MEDIA_PICKER_PAGE_SIZE, mediaPickerItems.length);
    const pageItems = mediaPickerItems.slice(start, end);

    grid.innerHTML = pageItems.map((item) => {
        const mediaPath = getMediaPathFromItem(item);
        const previewUrl = getMediaPickerPreviewUrl(item);
        const selectedClass = window.selectedAssetPath === mediaPath ? ' selected' : '';
        const title = item.originalName || item.filename || 'photo';
        return `
            <button type="button" class="media-picker-item${selectedClass}"
                    data-action="select-media"
                    data-filename="${escapeHtml(String(item.filename || ''))}"
                    data-path="${escapeHtml(mediaPath)}"
                    title="${escapeHtml(title)}">
                <div class="media-picker-thumb-wrap">
                    ${previewUrl
                        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(title)}" class="media-picker-thumb" loading="lazy" decoding="async" fetchpriority="low">`
                        : '<div class="media-picker-thumb media-picker-thumb-empty">No preview</div>'}
                </div>
                <div class="media-picker-name">${escapeHtml(item.originalName || item.filename || '')}</div>
            </button>
        `;
    }).join('');

    selectedMediaElement = grid.querySelector('.media-picker-item.selected');

    if (pagination) {
        pagination.innerHTML = `
            <button class="btn" type="button" data-action="picker-prev-page" ${mediaPickerPageIndex === 0 ? 'disabled' : ''}>← Prev</button>
            <span class="media-picker-pagination-summary">${start + 1}-${end} / ${mediaPickerItems.length} (Page ${mediaPickerPageIndex + 1}/${totalPages})</span>
            <button class="btn" type="button" data-action="picker-next-page" ${mediaPickerPageIndex >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
        `;
    }

    logGalleryPerfMetric('picker-render', {
        totalItems: mediaPickerItems.length,
        pageItems: pageItems.length,
        pageIndex: mediaPickerPageIndex,
        totalPages,
        durationMs: Math.round((performance.now() - metricStart) * 100) / 100
    });
}

function selectAsset(path, element) {
    if (selectedMediaElement && selectedMediaElement !== element) {
        selectedMediaElement.classList.remove('selected');
    }

    if (element) {
        element.classList.add('selected');
    }

    selectedMediaElement = element || null;
    window.selectedAssetPath = path;
    selectedMediaItem = mediaPickerItemByPath.get(path) || null;
    setAssetPickerConfirmEnabled(!!path);
    setMediaPickerStatus(path || '', false);
}

function confirmAssetSelection() {
    if (!window.selectedAssetPath) return;

    const selectedPath = window.selectedAssetPath;

    // Gallery row replacement mode
    if (currentAssetPickerIndex !== null) {
        updateGalleryPhoto(currentAssetPickerIndex, 'src', selectedPath);
        closeAssetPicker();
        renderEditor();
        return;
    }

    // Gallery add mode
    if (galleryPickerMode === 'add') {
        addGalleryPhoto({ src: selectedPath, alt: '' });
        closeAssetPicker();
        return;
    }

    // Hero photo picker
    if (heroPickerFieldKey) {
        updateHeroField(heroPickerFieldKey, selectedPath);
        closeAssetPicker();
        renderEditor();
        return;
    }

    // Tree editor picker
    if (treeAssetPickerPath) {
        updateTreeValue(treeAssetPickerPath, selectedPath);
        closeAssetPicker();
        renderEditor();
        return;
    }

    // Generic callback fallback (kept for compatibility)
    if (typeof assetPickerCallback === 'function') {
        const callback = assetPickerCallback;
        closeAssetPicker();
        callback(selectedPath, selectedMediaItem);
    }
}

function openAssetPicker(photoIndex) {
    currentAssetPickerIndex = photoIndex;
    treeAssetPickerPath = null;
    heroPickerFieldKey = null;
    galleryPickerMode = 'replace';
    assetPickerCallback = null;
    showAssetPickerModal();
}

function openTreeAssetPicker(path) {
    treeAssetPickerPath = path;
    currentAssetPickerIndex = null;
    heroPickerFieldKey = null;
    galleryPickerMode = 'replace';
    assetPickerCallback = null;
    showAssetPickerModal();
}

/* ===================== MEDIA UPLOAD ===================== */

function triggerMediaPickerUpload() {
    const input = document.getElementById('mediaPickerUploadInput');
    if (input) input.click();
}

async function handleMediaPickerUploadInput(input) {
    const files = Array.from(input?.files || []);
    if (!files.length) {
        if (input) input.value = '';
        return;
    }

    try {
        setMediaPickerStatus(`Uploading ${files.length} photo(s)...`, false);
        await uploadMediaFiles(files);
        await loadMediaPickerPhotos();
        setMediaPickerStatus(`Uploaded ${files.length} photo(s)`, false);
    } catch (error) {
        setMediaPickerStatus(error.message, true);
    } finally {
        if (input) input.value = '';
    }
}

async function uploadMediaFiles(files) {
    const uploadedItems = [];

    for (const file of files) {
        const uploaded = await uploadMediaFile(file);
        if (uploaded) {
            uploadedItems.push(uploaded);
        }
    }

    return uploadedItems;
}

async function uploadMediaFile(file) {
    if (!(file instanceof File)) {
        throw new Error('Invalid file');
    }

    const form = new FormData();
    form.append('type', 'photos');
    form.append('originalName', file.name);
    form.append('file', file, file.name);

    const result = await fetchAdminJson(`${API_BASE}/media/upload`, {
        method: 'POST',
        body: form
    });

    return result.data || null;
}

function getMediaPathFromItem(item) {
    if (!item || typeof item !== 'object') return '';
    return typeof item.url === 'string' && item.url ? item.url : `/media/photos/${item.filename}`;
}

function getMediaPickerPreviewUrl(item) {
    if (!item || typeof item !== 'object') return '';

    const filename = typeof item.filename === 'string' ? item.filename : '';
    if (!SAFE_MEDIA_FILENAME_RE.test(filename)) {
        return '';
    }

    return `${API_BASE}/media/preview/photos/${encodeURIComponent(filename)}?thumb=1&size=256`;
}

function buildMediaPickerPathIndex(items) {
    const map = new Map();
    for (const item of items) {
        const mediaPath = getMediaPathFromItem(item);
        if (!mediaPath) continue;
        map.set(mediaPath, item);
    }
    return map;
}

function clampMediaPickerPage(pageIndex, totalPages) {
    const safeTotal = Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1;
    const normalized = Number.isInteger(pageIndex) ? pageIndex : 0;
    return Math.max(0, Math.min(normalized, safeTotal - 1));
}

function setMediaPickerPage(nextPageIndex) {
    const totalPages = Math.max(1, Math.ceil(mediaPickerItems.length / MEDIA_PICKER_PAGE_SIZE));
    const clamped = clampMediaPickerPage(nextPageIndex, totalPages);
    if (clamped === mediaPickerPageIndex) return;

    mediaPickerPageIndex = clamped;
    renderMediaPickerGrid();
}

function logGalleryPerfMetric(metricName, payload) {
    const globalLogger = window.__adminGlobalPerfLogger || window.logPerfMetric;
    if (typeof globalLogger === 'function' && globalLogger !== logGalleryPerfMetric) {
        globalLogger(metricName, payload);
        return;
    }

    try {
        console.info(`[admin-metric] ${metricName}`, payload || {});
    } catch (_error) {
        // no-op
    }
}
