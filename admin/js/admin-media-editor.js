/* ===================== MEDIA INDEX EDITOR ===================== */

let mediaIndexDelegatedEventsBound = false;
let mediaIndexPageByType = { photos: 0, music: 0 };

const MEDIA_INDEX_PAGE_SIZE = 50;

function renderMediaIndexEditor(data) {
    const root = data && typeof data === 'object' ? data : {};
    const photos = Array.isArray(root.photos) ? root.photos : [];
    const music = Array.isArray(root.music) ? root.music : [];

    editorContainer.innerHTML = `
        <div class="media-index-editor">
            ${renderMediaSection('photos', '📷 Photos', photos)}
            ${renderMediaSection('music', '🎵 Music', music)}
        </div>
    `;

    bindMediaIndexEventDelegation();
}

function renderMediaSection(type, title, entries) {
    const isPhotos = type === 'photos';
    const uploadLabel = isPhotos ? '⤴ Upload Photos' : '⤴ Upload Music';
    const accept = isPhotos ? 'image/*' : 'audio/mp3,.mp3';
    const multiple = isPhotos ? 'multiple' : '';

    const { pageEntries, pageIndex, totalPages, start, end } = getMediaSectionPageSlice(type, entries);

    return `
        <section class="media-section" data-media-type="${escapeHtml(type)}">
            <div class="media-section-header">
                <h3 class="section-title">${title} (${entries.length})</h3>
                <div class="media-upload-controls">
                    <button class="btn btn-browse media-upload-btn" type="button" data-action="trigger-media-upload" data-type="${escapeHtml(type)}">${uploadLabel}</button>
                    <input
                        id="mediaUploadInput-${escapeHtml(type)}"
                        class="media-upload-input"
                        type="file"
                        data-action="media-upload-input"
                        data-type="${escapeHtml(type)}"
                        accept="${escapeHtml(accept)}"
                        ${multiple}
                        style="display:none"
                    >
                </div>
            </div>

            ${isPhotos ? renderPhotosMediaTable(pageEntries) : renderMusicMediaTable(pageEntries)}
            ${renderMediaSectionPagination(type, entries.length, pageIndex, totalPages, start, end)}
        </section>
    `;
}

function buildMediaThumbnailUrl(mediaPath) {
    if (typeof mediaPath !== 'string' || !mediaPath.startsWith('/media/photos/')) return '';
    const parts = mediaPath.split('/');
    const filename = parts[parts.length - 1];
    if (!filename) return '';
    return `${API_BASE}/media/preview/photos/${encodeURIComponent(filename)}?thumb=1&size=256`;
}

function buildMediaOriginalPreviewUrl(mediaPath) {
    return toSafePreviewUrl(mediaPath);
}

function isSafeOriginalPreviewUrl(url) {
    return typeof url === 'string' && url.startsWith(`${API_BASE}/media/preview/`);
}

function renderPhotosMediaTable(entries) {
    if (!entries.length) {
        return '<p class="loading">No photos uploaded yet. Use <strong>Upload Photos</strong> to add files.</p>';
    }

    const rows = entries.map((entry) => {
        const safeEntry = normalizeMediaEntry(entry);
        const mediaPath = safeEntry.url || `/media/photos/${safeEntry.filename}`;
        const thumbUrl = buildMediaThumbnailUrl(mediaPath);
        const originalPreviewUrl = buildMediaOriginalPreviewUrl(mediaPath);

        return `
            <tr>
                <td class="media-preview-cell">
                    ${thumbUrl
                        ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(safeEntry.originalName)}" class="media-preview-thumb" loading="lazy" decoding="async" fetchpriority="low" data-action="open-original-preview" data-original-preview-url="${escapeHtml(originalPreviewUrl)}">`
                        : '<span class="media-readonly">No preview</span>'}
                </td>
                <td>
                    ${renderMediaNameInput('photos', safeEntry)}
                </td>
                <td><span class="media-readonly">${escapeHtml(safeEntry.filename)}</span></td>
                <td><span class="media-readonly">${escapeHtml(formatFileSize(safeEntry.size))}</span></td>
                <td><span class="media-readonly">${escapeHtml(formatUploadedAt(safeEntry.uploadedAt))}</span></td>
                <td class="table-editor-actions">
                    <button
                        class="btn btn-delete-row"
                        type="button"
                        data-action="delete-media"
                        data-type="photos"
                        data-id="${escapeHtml(safeEntry.id)}"
                        data-name="${escapeHtml(safeEntry.originalName)}"
                        title="Delete photo"
                    >🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table class="table-editor media-table media-table-photos">
            <thead>
                <tr>
                    <th>Preview</th>
                    <th>Original Name</th>
                    <th>Filename</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Delete</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderMusicMediaTable(entries) {
    if (!entries.length) {
        return '<p class="loading">No music uploaded yet. Use <strong>Upload Music</strong> to add files.</p>';
    }

    const rows = entries.map((entry) => {
        const safeEntry = normalizeMediaEntry(entry);

        return `
            <tr>
                <td>${renderMediaNameInput('music', safeEntry)}</td>
                <td><span class="media-readonly">${escapeHtml(safeEntry.filename)}</span></td>
                <td><span class="media-readonly">${escapeHtml(formatFileSize(safeEntry.size))}</span></td>
                <td><span class="media-readonly">${escapeHtml(formatUploadedAt(safeEntry.uploadedAt))}</span></td>
                <td class="table-editor-actions">
                    <button
                        class="btn btn-delete-row"
                        type="button"
                        data-action="delete-media"
                        data-type="music"
                        data-id="${escapeHtml(safeEntry.id)}"
                        data-name="${escapeHtml(safeEntry.originalName)}"
                        title="Delete music"
                    >🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table class="table-editor media-table media-table-music">
            <thead>
                <tr>
                    <th>Original Name</th>
                    <th>Filename</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Delete</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderMediaNameInput(type, entry) {
    return `
        <input
            class="media-name-input"
            type="text"
            value="${escapeHtml(entry.originalName)}"
            data-action="rename-media"
            data-type="${escapeHtml(type)}"
            data-id="${escapeHtml(entry.id)}"
            data-original-name="${escapeHtml(entry.originalName)}"
            placeholder="Enter original name"
            maxlength="255"
        >
    `;
}

function normalizeMediaEntry(entry) {
    const src = entry && typeof entry === 'object' ? entry : {};

    return {
        id: typeof src.id === 'string' ? src.id : '',
        originalName: typeof src.originalName === 'string' ? src.originalName : '',
        filename: typeof src.filename === 'string' ? src.filename : '',
        size: Number.isFinite(src.size) ? src.size : Number(src.size || 0),
        uploadedAt: typeof src.uploadedAt === 'string' ? src.uploadedAt : '',
        url: typeof src.url === 'string' ? src.url : ''
    };
}

function bindMediaIndexEventDelegation() {
    if (mediaIndexDelegatedEventsBound || !editorContainer) return;

    editorContainer.addEventListener('click', async (event) => {
        if (activeFileKey !== 'media-index') return;

        const actionEl = event.target.closest('[data-action]');
        if (!actionEl || !editorContainer.contains(actionEl)) return;

        const action = actionEl.dataset.action;
        if (!action) return;

        if (action === 'trigger-media-upload') {
            const type = typeof actionEl.dataset.type === 'string' ? actionEl.dataset.type : '';
            triggerMediaUploadInput(type);
            return;
        }

        if (action === 'delete-media') {
            const type = typeof actionEl.dataset.type === 'string' ? actionEl.dataset.type : '';
            const id = typeof actionEl.dataset.id === 'string' ? actionEl.dataset.id : '';
            const originalName = typeof actionEl.dataset.name === 'string' ? actionEl.dataset.name : '';
            await requestDeleteMediaItem(type, id, originalName);
            return;
        }

        if (action === 'media-page-prev' || action === 'media-page-next') {
            const type = typeof actionEl.dataset.type === 'string' ? actionEl.dataset.type : '';
            const step = action === 'media-page-prev' ? -1 : 1;
            setMediaSectionPage(type, step);
        }
    });

    editorContainer.addEventListener('dblclick', (event) => {
        if (activeFileKey !== 'media-index') return;

        const imgEl = event.target.closest('img[data-action="open-original-preview"]');
        if (!imgEl || !editorContainer.contains(imgEl)) return;

        const originalUrl = imgEl.dataset.originalPreviewUrl;
        if (!isSafeOriginalPreviewUrl(originalUrl)) return;

        window.open(originalUrl, '_blank', 'noopener');
    });

    editorContainer.addEventListener('change', async (event) => {
        if (activeFileKey !== 'media-index') return;

        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;

        if (target.classList.contains('media-name-input')) {
            await handleMediaRenameChange(target);
            return;
        }

        if (target.classList.contains('media-upload-input')) {
            const type = typeof target.dataset.type === 'string' ? target.dataset.type : '';
            await handleMediaUploadFiles(type, target.files, target);
        }
    });

    editorContainer.addEventListener('keydown', (event) => {
        if (activeFileKey !== 'media-index') return;

        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains('media-name-input')) return;
        if (event.key !== 'Enter') return;

        event.preventDefault();
        target.blur();
    });

    mediaIndexDelegatedEventsBound = true;
}

function triggerMediaUploadInput(type) {
    if (type !== 'photos' && type !== 'music') return;

    const input = document.getElementById(`mediaUploadInput-${type}`);
    if (input instanceof HTMLInputElement) {
        input.click();
    }
}

async function handleMediaRenameChange(input) {
    const type = typeof input.dataset.type === 'string' ? input.dataset.type : '';
    const id = typeof input.dataset.id === 'string' ? input.dataset.id : '';
    const previousName = typeof input.dataset.originalName === 'string' ? input.dataset.originalName : '';
    const nextName = typeof input.value === 'string' ? input.value.trim() : '';

    if (!nextName || nextName.length > 255) {
        input.value = previousName;
        setStatus('Rename failed: Invalid original name', true);
        return;
    }

    if (nextName === previousName) {
        input.value = previousName;
        return;
    }

    input.disabled = true;

    try {
        const result = await mediaIndexFetchJson(`${API_BASE}/media/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ originalName: nextName })
        });

        const returnedName = typeof result?.data?.originalName === 'string' ? result.data.originalName : nextName;
        applyMediaRenameToLocalState(type, id, returnedName);

        input.dataset.originalName = returnedName;
        input.value = returnedName;

        updateDirtyStatus();
        setStatus('Media name updated');
        setTimeout(() => setStatus('Ready'), 1500);
    } catch (error) {
        input.value = previousName;
        setStatus(`Rename failed: ${error.message}`, true);
    } finally {
        input.disabled = false;
    }
}

function applyMediaRenameToLocalState(type, id, originalName) {
    if (!type || !id) return;

    const currentData = current['media-index'];
    const draftData = draft['media-index'];

    if (!currentData || typeof currentData !== 'object') return;
    if (!draftData || typeof draftData !== 'object') return;

    const nextCurrent = updateMediaNameInIndex(currentData, type, id, originalName);
    const nextDraft = updateMediaNameInIndex(draftData, type, id, originalName);

    current['media-index'] = nextCurrent;
    draft['media-index'] = nextDraft;
}

function updateMediaNameInIndex(indexData, type, id, originalName) {
    const src = indexData && typeof indexData === 'object' ? indexData : { photos: [], music: [] };
    const list = Array.isArray(src[type]) ? src[type] : [];

    const nextList = list.map((entry) => {
        if (!entry || entry.id !== id) return entry;
        return { ...entry, originalName };
    });

    return {
        ...src,
        [type]: nextList
    };
}

async function requestDeleteMediaItem(type, id, originalName) {
    if ((type !== 'photos' && type !== 'music') || !id) {
        setStatus('Delete failed: Invalid media item', true);
        return;
    }

    const itemLabel = originalName || id;

    showModal(
        'Delete Media Item',
        `Delete "${itemLabel}"? This removes both the index entry and physical file from disk.`,
        async () => {
            closeModal();
            await deleteMediaItem(type, id);
        }
    );
}

async function deleteMediaItem(type, id) {
    try {
        setStatus('Deleting media item...');
        await mediaIndexFetchJson(`${API_BASE}/media/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });

        await reloadMediaIndexAndRender();
        setStatus('Media item deleted');
        setTimeout(() => setStatus('Ready'), 1500);
    } catch (error) {
        setStatus(`Delete failed: ${error.message}`, true);
    }
}

async function handleMediaUploadFiles(type, fileList, input) {
    const files = Array.from(fileList || []);

    if ((type !== 'photos' && type !== 'music') || files.length === 0) {
        if (input) input.value = '';
        return;
    }

    try {
        setStatus(`Uploading ${files.length} file(s)...`);

        for (const file of files) {
            await uploadSingleMediaFile(type, file);
        }

        await reloadMediaIndexAndRender();
        setStatus(`Uploaded ${files.length} file(s)`);
        setTimeout(() => setStatus('Ready'), 1500);
    } catch (error) {
        setStatus(`Upload failed: ${error.message}`, true);
    } finally {
        if (input) input.value = '';
    }
}

async function uploadSingleMediaFile(type, file) {
    if (!(file instanceof File)) {
        throw new Error('Invalid file');
    }

    const form = new FormData();
    form.append('type', type);
    form.append('originalName', file.name);
    form.append('file', file, file.name);

    await mediaIndexFetchJson(`${API_BASE}/media/upload`, {
        method: 'POST',
        body: form
    });
}

async function reloadMediaIndexAndRender() {
    await loadFile('media-index');
    mediaIndexPageByType = { photos: 0, music: 0 };
    renderEditor();
    updateDirtyStatus();
}

async function mediaIndexFetchJson(url, options) {
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
        const message = result && result.error ? result.error : `Request failed (${response.status})`;
        throw new Error(message);
    }

    return result;
}

function getMediaSectionPageSlice(type, entries) {
    const totalEntries = Array.isArray(entries) ? entries.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalEntries / MEDIA_INDEX_PAGE_SIZE));
    const currentPage = clampMediaSectionPage(type, mediaIndexPageByType[type], totalPages);
    mediaIndexPageByType[type] = currentPage;

    const start = totalEntries === 0 ? 0 : currentPage * MEDIA_INDEX_PAGE_SIZE;
    const end = totalEntries === 0 ? 0 : Math.min(start + MEDIA_INDEX_PAGE_SIZE, totalEntries);

    return {
        pageEntries: totalEntries === 0 ? [] : entries.slice(start, end),
        pageIndex: currentPage,
        totalPages,
        start,
        end
    };
}

function renderMediaSectionPagination(type, totalEntries, pageIndex, totalPages, start, end) {
    if (!totalEntries || totalEntries <= MEDIA_INDEX_PAGE_SIZE) {
        return '';
    }

    return `
        <div class="media-section-pagination">
            <button class="btn" type="button" data-action="media-page-prev" data-type="${escapeHtml(type)}" ${pageIndex === 0 ? 'disabled' : ''}>← Prev</button>
            <span class="media-section-pagination-summary">${start + 1}-${end} / ${totalEntries} (Page ${pageIndex + 1}/${totalPages})</span>
            <button class="btn" type="button" data-action="media-page-next" data-type="${escapeHtml(type)}" ${pageIndex >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
        </div>
    `;
}

function clampMediaSectionPage(type, pageIndex, totalPages) {
    const safeType = type === 'photos' || type === 'music' ? type : 'photos';
    const safeTotal = Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1;
    const normalized = Number.isInteger(pageIndex) ? pageIndex : 0;

    mediaIndexPageByType[safeType] = Math.max(0, Math.min(normalized, safeTotal - 1));
    return mediaIndexPageByType[safeType];
}

function setMediaSectionPage(type, delta) {
    if (type !== 'photos' && type !== 'music') return;

    const entries = Array.isArray(draft['media-index']?.[type]) ? draft['media-index'][type] : [];
    const totalPages = Math.max(1, Math.ceil(entries.length / MEDIA_INDEX_PAGE_SIZE));
    const previousPage = Number.isInteger(mediaIndexPageByType[type]) ? mediaIndexPageByType[type] : 0;
    const nextPage = clampMediaSectionPage(type, previousPage + delta, totalPages);

    if (nextPage === previousPage) return;
    mediaIndexPageByType[type] = nextPage;
    renderEditor();
}

function formatFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '—';

    if (value < 1024) return `${Math.round(value)} B`;

    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const rounded = size >= 10 ? Math.round(size) : Math.round(size * 10) / 10;
    return `${rounded} ${units[unitIndex]}`;
}

function formatUploadedAt(value) {
    if (typeof value !== 'string' || !value.trim()) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleString();
}
