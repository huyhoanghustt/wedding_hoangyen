/* ===================== STORY LAYOUT EDITOR ===================== */

const AVAILABLE_FONTS = [
    { value: 'var(--font-script)', label: 'Great Vibes (Script)' },
    { value: 'var(--font-body)', label: 'Quicksand (Body)' },
    { value: "'Dancing Script', cursive", label: 'Dancing Script' },
    { value: "'Playfair Display', serif", label: 'Playfair Display' },
    { value: "'Lora', serif", label: 'Lora' },
    { value: "'Montserrat', sans-serif", label: 'Montserrat' },
    { value: "'Raleway', sans-serif", label: 'Raleway' },
    { value: "'Pacifico', cursive", label: 'Pacifico' },
    { value: "'Sacramento', cursive", label: 'Sacramento' },
    { value: "'Tangerine', cursive", label: 'Tangerine' },
    { value: "'Josefin Sans', sans-serif", label: 'Josefin Sans' },
    { value: "'Libre Baskerville', serif", label: 'Libre Baskerville' },
    { value: "'Cormorant Infant', serif", label: 'Cormorant Infant' },
    { value: "'Hoatay1', cursive", label: 'Hoatay1 (Custom)' }
];

const FONT_OTHER_OPTION_VALUE = '__custom__';
const DEFAULT_ROUNDED_RECT_RADIUS = '0.2rem';
const TEXT_PREVIEW_MAX_LENGTH = 80;
const FRAME_OPTIONS = [
    { value: 'none', label: 'None', extraFields: [] },
    { value: 'square', label: 'Square', extraFields: [] },
    { value: 'circle', label: 'Circle', extraFields: [] },
    { value: 'oval', label: 'Oval', extraFields: [] },
    { value: 'ellipse', label: 'Ellipse', extraFields: [] },
    { value: 'rounded-rect', label: 'Rounded Rectangle', extraFields: ['border_radius'] }
];

function renderStoryLayoutEditor(data) {
    const blocks = data.story_layout?.blocks || [];

    let html = `
        <div class="story-layout-editor">
            <div class="story-header-section">
                <h3 class="section-title">📋 Header Configuration</h3>
                <div class="tree-editor">
                    <div class="tree-root">
                        ${renderStoryHeaderTree(data)}
                    </div>
                </div>
            </div>

            <div class="story-blocks-section">
                <h3 class="section-title">🧱 Blocks (${blocks.length})</h3>
                ${renderBlocksTable(blocks)}
            </div>
        </div>
    `;

    editorContainer.innerHTML = html;
}

function renderStoryHeaderTree(data) {
    let html = '';

    html += `
        <div class="tree-node">
            <div class="tree-header">
                <span class="tree-toggle"></span>
                <span class="tree-key">version</span>
                <span class="tree-colon">:</span>
                <span class="tree-value number">
                    <input type="number" value="${data.version || 1}" onchange="updateStoryHeader('version', parseInt(this.value))">
                </span>
            </div>
        </div>
    `;

    if (data.story_layout) {
        const storyLayout = data.story_layout;

        html += `
            <div class="tree-node">
                <div class="tree-header">
                    <span class="tree-toggle"></span>
                    <span class="tree-key">story_layout.title</span>
                    <span class="tree-colon">:</span>
                    <span class="tree-value string">
                        <input type="text" value="${escapeHtml(storyLayout.title || '')}" onchange="updateStoryHeader('story_layout.title', this.value)">
                    </span>
                </div>
            </div>
        `;

        if (storyLayout.grid) {
            html += `
                <div class="tree-node">
                    <div class="tree-header">
                        <span class="tree-toggle" onclick="toggleTreeNode(this)">▼</span>
                        <span class="tree-key">story_layout.grid</span>
                        <span class="tree-type-badge">object</span>
                    </div>
                    <div class="tree-children">
                        ${renderObjectAsTreeNodes(storyLayout.grid, 'story_layout.grid')}
                    </div>
                </div>
            `;
        }

        if (storyLayout.animation) {
            html += `
                <div class="tree-node">
                    <div class="tree-header">
                        <span class="tree-toggle" onclick="toggleTreeNode(this)">▼</span>
                        <span class="tree-key">story_layout.animation</span>
                        <span class="tree-type-badge">object</span>
                    </div>
                    <div class="tree-children">
                        ${renderObjectAsTreeNodes(storyLayout.animation, 'story_layout.animation')}
                    </div>
                </div>
            `;
        }
    }

    return html;
}

function renderObjectAsTreeNodes(obj, path) {
    const keys = Object.keys(obj);
    return keys.map((key) => {
        const value = obj[key];
        const valueType = typeof value;
        const childPath = `${path}.${key}`;

        if (valueType === 'object' && value !== null && !Array.isArray(value)) {
            return `
                <div class="tree-node">
                    <div class="tree-header">
                        <span class="tree-toggle" onclick="toggleTreeNode(this)">▼</span>
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-type-badge">object</span>
                    </div>
                    <div class="tree-children">
                        ${renderObjectAsTreeNodes(value, childPath)}
                    </div>
                </div>
            `;
        }

        return `
            <div class="tree-node">
                <div class="tree-header">
                    <span class="tree-toggle"></span>
                    <span class="tree-key">${escapeHtml(key)}</span>
                    <span class="tree-colon">:</span>
                    ${renderTreeValueInput(value, childPath)}
                </div>
            </div>
        `;
    }).join('');
}

function renderBlocksTable(blocks) {
    if (blocks.length === 0) {
        return `<p class="loading">No blocks. <button class="btn btn-add-row" onclick="addStoryBlock()">+ Add Block</button></p>`;
    }

    const columns = ['id', 'col_span', 'row_span', 'col_start', 'row_start', 'item', 'effect'];

    let html = `
        <table class="table-editor blocks-table">
            <thead>
                <tr>
                    ${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    blocks.forEach((block, index) => {
        const canMoveUp = index > 0;
        const canMoveDown = index < blocks.length - 1;

        html += `<tr>`;
        columns.forEach((col) => {
            const value = block[col];
            html += `<td>${renderBlockCell(col, value, index)}</td>`;
        });
        html += `
            <td class="table-editor-actions">
                <button class="btn btn-move-up" onclick="moveStoryBlock(${index}, -1)" ${canMoveUp ? '' : 'disabled'} title="Move block up">⬆️</button>
                <button class="btn btn-move-down" onclick="moveStoryBlock(${index}, 1)" ${canMoveDown ? '' : 'disabled'} title="Move block down">⬇️</button>
                <button class="btn btn-delete-row" onclick="deleteStoryBlock(${index})">🗑️</button>
            </td>
        </tr>`;
    });

    html += `
            </tbody>
        </table>
        <button class="btn btn-add-row" onclick="addStoryBlock()">+ Add Block</button>
    `;

    return html;
}

function renderBlockCell(col, value, blockIndex) {
    if (col === 'id') {
        return `<input type="text" value="${escapeHtml(String(value || ''))}" onchange="updateStoryBlock(${blockIndex}, 'id', this.value)">`;
    }

    if (col === 'col_span' || col === 'row_span' || col === 'col_start' || col === 'row_start') {
        return `<input type="number" value="${value || 1}" onchange="updateStoryBlock(${blockIndex}, '${col}', parseInt(this.value))">`;
    }

    if (col === 'item' || col === 'effect') {
        return renderNestedObjectCell(col, value, blockIndex);
    }

    return `<input type="text" value="${escapeHtml(String(value || ''))}" onchange="updateStoryBlock(${blockIndex}, '${col}', this.value)">`;
}

function renderNestedObjectCell(col, obj, blockIndex) {
    if (!obj || typeof obj !== 'object') {
        obj = {};
    }

    const pathPrefix = `story_layout.blocks[${blockIndex}].${col}`;
    const keys = Object.keys(obj);

    if (keys.length === 0) {
        return `
            <div class="nested-object-cell empty">
                <button class="btn btn-add-row btn-small" onclick="addNestedKey('${pathPrefix}')">+ Add Key</button>
            </div>
        `;
    }

    let html = `
        <div class="nested-object-cell">
            <div class="nested-object-header" onclick="toggleNestedObject(this)">
                <span class="tree-toggle">▼</span>
                <span class="tree-type-badge">${keys.length} keys</span>
            </div>
            <div class="nested-object-content">
    `;

    keys.forEach((key) => {
        const value = obj[key];
        const valueType = typeof value;
        const childPath = `${pathPrefix}.${key}`;

        if (valueType === 'object' && value !== null && !Array.isArray(value)) {
            html += `
                <div class="tree-node nested">
                    <div class="tree-header">
                        <span class="tree-toggle" onclick="toggleTreeNode(this)">▼</span>
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-type-badge">object</span>
                        <div class="tree-actions">
                            <button onclick="deleteNestedKey('${pathPrefix}', '${escapeHtml(key)}')">🗑️</button>
                        </div>
                    </div>
                    <div class="tree-children">
                        ${renderNestedObjectFields(value, childPath, blockIndex)}
                    </div>
                </div>
            `;
            return;
        }

        html += `
            <div class="tree-node nested">
                <div class="tree-header">
                    <span class="tree-toggle"></span>
                    <span class="tree-key">${escapeHtml(key)}</span>
                    <span class="tree-colon">:</span>
                    ${renderStoryNestedFieldInput(value, childPath, key, blockIndex)}
                    <div class="tree-actions">
                        <button onclick="deleteNestedKey('${pathPrefix}', '${escapeHtml(key)}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
                <button class="btn btn-add-row btn-small" onclick="addNestedKey('${pathPrefix}')">+ Add Key</button>
            </div>
        </div>
    `;

    return html;
}

function renderNestedObjectFields(obj, path, blockIndex) {
    const keys = Object.keys(obj);
    return keys.map((key) => {
        const value = obj[key];
        const childPath = `${path}.${key}`;
        const valueType = typeof value;

        if (valueType === 'object' && value !== null && !Array.isArray(value)) {
            return `
                <div class="tree-node nested">
                    <div class="tree-header">
                        <span class="tree-toggle" onclick="toggleTreeNode(this)">▼</span>
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-type-badge">object</span>
                        <div class="tree-actions">
                            <button onclick="deleteNestedKey('${path}', '${escapeHtml(key)}')">🗑️</button>
                        </div>
                    </div>
                    <div class="tree-children">
                        ${renderNestedObjectFields(value, childPath, blockIndex)}
                    </div>
                </div>
            `;
        }

        return `
            <div class="tree-node nested">
                <div class="tree-header">
                    <span class="tree-toggle"></span>
                    <span class="tree-key">${escapeHtml(key)}</span>
                    <span class="tree-colon">:</span>
                    ${renderStoryNestedFieldInput(value, childPath, key, blockIndex)}
                    <div class="tree-actions">
                        <button onclick="deleteNestedKey('${path}', '${escapeHtml(key)}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderStoryNestedFieldInput(value, path, key, blockIndex) {
    if (isTextItemTextField(path, key)) {
        return renderStoryTextPreviewField(value, blockIndex);
    }

    if (key === 'font_family') {
        return renderFontFamilyField(path, value);
    }

    if (key === 'frame' && isStoryItemPath(path)) {
        return renderFrameField(path, value);
    }

    return renderTreeValueInput(value, path, key);
}

function renderStoryTextPreviewField(value, blockIndex) {
    const normalizedText = typeof value === 'string' ? value : '';
    const preview = buildTextPreview(normalizedText);

    return `
        <span class="tree-value string text-preview-field">
            <span class="text-preview-content" title="${escapeHtml(normalizedText)}">${escapeHtml(preview)}</span>
            <button class="btn btn-small btn-text-edit" type="button" onclick="openTextEditModal(${blockIndex})">✏️ Edit</button>
        </span>
    `;
}

function renderFontFamilyField(path, value) {
    const normalizedValue = typeof value === 'string' ? value : '';
    const hasPreset = AVAILABLE_FONTS.some((font) => font.value === normalizedValue);
    const selectedValue = hasPreset ? normalizedValue : FONT_OTHER_OPTION_VALUE;

    return `
        <span class="tree-value string story-select-with-custom">
            <select onchange="handleStoryFontFamilyChange('${path}', this.value)">
                ${AVAILABLE_FONTS.map((font) => `<option value="${escapeHtml(font.value)}" ${font.value === selectedValue ? 'selected' : ''}>${escapeHtml(font.label)}</option>`).join('')}
                <option value="${FONT_OTHER_OPTION_VALUE}" ${selectedValue === FONT_OTHER_OPTION_VALUE ? 'selected' : ''}>Other (custom)</option>
            </select>
            ${selectedValue === FONT_OTHER_OPTION_VALUE ? `<input type="text" value="${escapeHtml(normalizedValue)}" onchange="updateTreeValue('${path}', this.value)" placeholder="Custom font-family value">` : ''}
        </span>
    `;
}

function renderFrameField(path, value) {
    const normalizedValue = typeof value === 'string' ? value : 'none';
    const selectedValue = FRAME_OPTIONS.some((option) => option.value === normalizedValue) ? normalizedValue : 'none';

    return `
        <span class="tree-value string">
            <select onchange="handleStoryFrameChange('${path}', this.value)">
                ${FRAME_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
        </span>
    `;
}

function buildTextPreview(text) {
    if (!text) {
        return 'No text set';
    }

    const compactText = text.replace(/\s+/g, ' ').trim();
    if (!compactText) {
        return 'Whitespace only';
    }

    if (compactText.length <= TEXT_PREVIEW_MAX_LENGTH) {
        return compactText;
    }

    return `${compactText.slice(0, TEXT_PREVIEW_MAX_LENGTH - 1)}…`;
}

function isTextItemTextField(path, key) {
    if (key !== 'text' || !/^story_layout\.blocks\[(\d+)\]\.item\.text$/.test(path)) {
        return false;
    }

    const match = path.match(/^story_layout\.blocks\[(\d+)\]\.item\.text$/);
    if (!match) return false;

    const blockIndex = Number.parseInt(match[1], 10);
    if (!Number.isInteger(blockIndex) || blockIndex < 0) {
        return false;
    }

    const itemType = draft?.[activeFileKey]?.story_layout?.blocks?.[blockIndex]?.item?.type;
    return itemType === 'text';
}

function isStoryItemPath(path) {
    return /^story_layout\.blocks\[\d+\]\.item\./.test(path);
}

function toggleNestedObject(element) {
    const cell = element.closest('.nested-object-cell');
    cell.classList.toggle('collapsed');
    const toggle = element.querySelector('.tree-toggle');
    toggle.textContent = cell.classList.contains('collapsed') ? '▶' : '▼';
}

/* ===================== STORY LAYOUT ACTIONS ===================== */

function updateStoryHeader(path, value) {
    const obj = draft[activeFileKey];
    setNestedValue(obj, path, value);
    updateDirtyStatus();
}

function updateStoryBlock(blockIndex, key, value) {
    const blocks = draft[activeFileKey].story_layout.blocks;
    if (blocks && blocks[blockIndex]) {
        blocks[blockIndex][key] = value;
        updateDirtyStatus();
    }
}

function moveStoryBlock(index, direction) {
    const blocks = draft[activeFileKey]?.story_layout?.blocks;
    if (!Array.isArray(blocks)) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    const nextBlocks = [...blocks];
    [nextBlocks[index], nextBlocks[targetIndex]] = [nextBlocks[targetIndex], nextBlocks[index]];
    draft[activeFileKey].story_layout.blocks = nextBlocks;
    renderEditor();
    updateDirtyStatus();
}

function addStoryBlock() {
    const storyLayout = draft[activeFileKey].story_layout;
    const blocks = Array.isArray(storyLayout.blocks) ? storyLayout.blocks : [];

    const template = {
        id: `block-${Date.now()}`,
        col_span: 1,
        row_span: 1,
        col_start: 1,
        row_start: 1,
        item: { type: 'text', text: '' },
        effect: { fade_in: true }
    };

    storyLayout.blocks = [...blocks, template];
    renderEditor();
    updateDirtyStatus();
}

function deleteStoryBlock(index) {
    const blocks = draft[activeFileKey].story_layout.blocks;
    if (Array.isArray(blocks)) {
        draft[activeFileKey].story_layout.blocks = blocks.filter((_block, blockIndex) => blockIndex !== index);
        renderEditor();
        updateDirtyStatus();
    }
}

function addNestedKey(path) {
    const key = prompt('Enter new key name:');
    if (!key) return;

    const obj = draft[activeFileKey];
    const target = getNestedValue(obj, path);

    if (typeof target === 'object' && target !== null) {
        target[key] = '';
        renderEditor();
        updateDirtyStatus();
    }
}

function deleteNestedKey(path, key) {
    const obj = draft[activeFileKey];
    const target = getNestedValue(obj, path);

    if (typeof target === 'object' && target !== null) {
        delete target[key];
        renderEditor();
        updateDirtyStatus();
    }
}

function handleStoryFontFamilyChange(path, value) {
    if (value === FONT_OTHER_OPTION_VALUE) {
        updateTreeValue(path, '');
        renderEditor();
        return;
    }

    updateTreeValue(path, value);
    renderEditor();
}

function handleStoryFrameChange(path, value) {
    const itemPath = path.replace(/\.frame$/, '');
    const item = getNestedValue(draft[activeFileKey], itemPath);
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return;
    }

    item.frame = value;
    if (value === 'rounded-rect') {
        item.border_radius = typeof item.border_radius === 'string' && item.border_radius ? item.border_radius : DEFAULT_ROUNDED_RECT_RADIUS;
    } else if (Object.prototype.hasOwnProperty.call(item, 'border_radius')) {
        delete item.border_radius;
    }

    renderEditor();
    updateDirtyStatus();
}

function openTextEditModal(blockIndex, currentText) {
    const modal = document.getElementById('textEditModal');
    const textarea = document.getElementById('storyTextEditTextarea');
    const saveButton = document.getElementById('storyTextEditSaveBtn');
    if (!modal || !textarea || !saveButton) return;

    const blockText = draft?.[activeFileKey]?.story_layout?.blocks?.[blockIndex]?.item?.text;
    const fallbackText = typeof blockText === 'string' ? blockText : '';
    textarea.value = typeof currentText === 'string' ? currentText : fallbackText;
    saveButton.onclick = () => saveTextEditModal(blockIndex);
    modal.style.display = 'flex';
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function closeTextEditModal() {
    const modal = document.getElementById('textEditModal');
    const textarea = document.getElementById('storyTextEditTextarea');
    const saveButton = document.getElementById('storyTextEditSaveBtn');
    if (!modal || !textarea || !saveButton) return;

    modal.style.display = 'none';
    textarea.value = '';
    saveButton.onclick = null;
}

function saveTextEditModal(blockIndex) {
    const blocks = draft[activeFileKey]?.story_layout?.blocks;
    const textarea = document.getElementById('storyTextEditTextarea');
    if (!Array.isArray(blocks) || !blocks[blockIndex] || !textarea) return;

    if (!blocks[blockIndex].item || typeof blocks[blockIndex].item !== 'object' || Array.isArray(blocks[blockIndex].item)) {
        blocks[blockIndex].item = { type: 'text', text: '' };
    }

    blocks[blockIndex].item.text = sanitizeTextInput(textarea.value);
    closeTextEditModal();
    renderEditor();
    updateDirtyStatus();
}
