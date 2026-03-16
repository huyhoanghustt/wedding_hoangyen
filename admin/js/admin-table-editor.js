/* ===================== TABLE EDITOR ===================== */

function renderTableEditor(data, file) {
    const isArray = Array.isArray(data);
    
    if (isArray) {
        renderArrayTable(data, file);
    } else {
        renderObjectTable(data, file);
    }
}

function renderArrayTable(data, file) {
    if (data.length === 0) {
        editorContainer.innerHTML = `
            <p class="loading">No items. <button class="btn btn-add-row" onclick="addArrayItem()">+ Add Item</button></p>
        `;
        return;
    }
    
    // Get all unique keys from all items
    const allKeys = [...new Set(data.flatMap(item => Object.keys(item)))];
    
    let html = `
        <table class="table-editor">
            <thead>
                <tr>
                    ${allKeys.map(key => `<th>${escapeHtml(key)}</th>`).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.forEach((item, index) => {
        html += `<tr>`;
        allKeys.forEach(key => {
            const value = item[key];
            html += `<td>${renderTableCell(key, value, index)}</td>`;
        });
        html += `
            <td class="table-editor-actions">
                <button class="btn btn-delete-row" onclick="deleteArrayItem(${index})">🗑️</button>
            </td>
        </tr>`;
    });
    
    html += `
            </tbody>
        </table>
        <button class="btn btn-add-row" onclick="addArrayItem()">+ Add Item</button>
    `;
    
    editorContainer.innerHTML = html;
}

function renderObjectTable(data, file) {
    const keys = Object.keys(data);
    
    if (keys.length === 0) {
        editorContainer.innerHTML = `<p class="loading">Empty object</p>`;
        return;
    }
    
    // Check if this is a nested object (like guest-links with entries array)
    if (data.entries && Array.isArray(data.entries)) {
        renderNestedObjectWithEntries(data, file);
        return;
    }
    
    // Simple key-value table
    let html = `
        <table class="table-editor">
            <thead>
                <tr>
                    <th>Key</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    keys.forEach(key => {
        const value = data[key];
        const type = typeof value;
        
        if (type === 'object' && value !== null) {
            // Nested object - show as JSON string (editable)
            html += `
                <tr>
                    <td>${escapeHtml(key)}</td>
                    <td>
                        <textarea 
                            rows="3" 
                            onchange="updateObjectKey('${escapeHtml(key)}', this.value, true)"
                        >${JSON.stringify(value, null, 2)}</textarea>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr>
                    <td>${escapeHtml(key)}</td>
                    <td>${renderObjectValueInput(key, value)}</td>
                </tr>
            `;
        }
    });
    
    html += `</tbody></table>`;
    editorContainer.innerHTML = html;
}

function renderNestedObjectWithEntries(data, file) {
    // For files like guest-links.json that have metadata + entries array
    const metaKeys = Object.keys(data).filter(k => k !== 'entries');
    
    let html = `<div style="margin-bottom: 1rem;">`;
    
    // Metadata section
    if (metaKeys.length > 0) {
        html += `<h4 style="margin-bottom: 0.5rem;">Metadata</h4>`;
        html += `<table class="table-editor"><tbody>`;
        metaKeys.forEach(key => {
            html += `
                <tr>
                    <td>${escapeHtml(key)}</td>
                    <td>${renderObjectValueInput(key, data[key])}</td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
    }
    
    // Entries section
    html += `<h4 style="margin: 1rem 0 0.5rem;">Entries (${data.entries.length})</h4>`;
    
    if (data.entries.length === 0) {
        html += `<p class="loading">No entries. <button class="btn btn-add-row" onclick="addEntryItem()">+ Add Entry</button></p>`;
    } else {
        const entryKeys = [...new Set(data.entries.flatMap(e => Object.keys(e)))];
        
        html += `
            <table class="table-editor">
                <thead>
                    <tr>
                        ${entryKeys.map(k => `<th>${escapeHtml(k)}</th>`).join('')}
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.entries.forEach((entry, index) => {
            html += `<tr>`;
            entryKeys.forEach(key => {
                html += `<td>${renderTableCell(key, entry[key], index, 'entries')}</td>`;
            });
            html += `
                <td class="table-editor-actions">
                    <button class="btn btn-delete-row" onclick="deleteEntryItem(${index})">🗑️</button>
                </td>
            </tr>`;
        });
        
        html += `
                </tbody>
            </table>
            <button class="btn btn-add-row" onclick="addEntryItem()">+ Add Entry</button>
        `;
    }
    
    html += `</div>`;
    editorContainer.innerHTML = html;
}

function renderTableCell(key, value, index, parentPath = null) {
    const type = typeof value;
    const path = parentPath ? `${parentPath}[${index}].${key}` : `[${index}].${key}`;
    
    if (value === null || value === undefined) {
        return `<input type="text" value="" placeholder="null" onchange="updateArrayItem(${index}, '${escapeHtml(key)}', this.value, ${parentPath ? `'${parentPath}'` : 'null'})">`;
    }
    
    if (type === 'boolean') {
        return `
            <select onchange="updateArrayItem(${index}, '${escapeHtml(key)}', this.value === 'true', ${parentPath ? `'${parentPath}'` : 'null'})">
                <option value="true" ${value ? 'selected' : ''}>true</option>
                <option value="false" ${!value ? 'selected' : ''}>false</option>
            </select>
        `;
    }
    
    if (type === 'number') {
        return `<input type="number" value="${value}" onchange="updateArrayItem(${index}, '${escapeHtml(key)}', parseFloat(this.value), ${parentPath ? `'${parentPath}'` : 'null'})">`;
    }
    
    return `<input type="text" value="${escapeHtml(String(value))}" onchange="updateArrayItem(${index}, '${escapeHtml(key)}', this.value, ${parentPath ? `'${parentPath}'` : 'null'})">`;
}

function renderObjectValueInput(key, value) {
    const type = typeof value;
    
    if (type === 'boolean') {
        return `
            <select onchange="updateObjectKey('${escapeHtml(key)}', this.value === 'true')">
                <option value="true" ${value ? 'selected' : ''}>true</option>
                <option value="false" ${!value ? 'selected' : ''}>false</option>
            </select>
        `;
    }
    
    if (type === 'number') {
        return `<input type="number" value="${value}" onchange="updateObjectKey('${escapeHtml(key)}', parseFloat(this.value))">`;
    }
    
    return `<input type="text" value="${escapeHtml(String(value))}" onchange="updateObjectKey('${escapeHtml(key)}', this.value)">`;
}

/* ===================== TABLE EDITOR ACTIONS ===================== */

function updateArrayItem(index, key, value, parentPath = null) {
    if (parentPath === 'entries') {
        draft[activeFileKey].entries[index][key] = value;
    } else {
        draft[activeFileKey][index][key] = value;
    }
    updateDirtyStatus();
}

function updateObjectKey(key, value, isJson = false) {
    if (isJson) {
        try {
            draft[activeFileKey][key] = JSON.parse(value);
        } catch (e) {
            // Invalid JSON, keep as string
            draft[activeFileKey][key] = value;
        }
    } else {
        draft[activeFileKey][key] = value;
    }
    updateDirtyStatus();
}

function addArrayItem() {
    const data = draft[activeFileKey];
    if (!Array.isArray(data)) return;
    
    // Create new item based on existing structure
    const template = data.length > 0 ? { ...data[0] } : {};
    Object.keys(template).forEach(key => {
        const type = typeof template[key];
        if (type === 'string') template[key] = '';
        else if (type === 'number') template[key] = 0;
        else if (type === 'boolean') template[key] = false;
        else template[key] = null;
    });
    
    // Add id if exists
    if ('id' in template) {
        template.id = Date.now();
    }
    if ('createdAt' in template) {
        template.createdAt = new Date().toISOString();
    }
    
    draft[activeFileKey].push(template);
    renderEditor();
    updateDirtyStatus();
}

function deleteArrayItem(index) {
    draft[activeFileKey].splice(index, 1);
    renderEditor();
    updateDirtyStatus();
}

function addEntryItem() {
    const entries = draft[activeFileKey].entries;
    if (!Array.isArray(entries)) return;
    
    // Create template from existing entry
    const template = entries.length > 0 ? { ...entries[0] } : {};
    Object.keys(template).forEach(key => {
        const type = typeof template[key];
        if (type === 'string') template[key] = '';
        else if (type === 'number') template[key] = 0;
        else if (type === 'boolean') template[key] = false;
        else template[key] = null;
    });
    
    if ('created_at' in template) {
        template.created_at = new Date().toISOString();
    }
    if ('updated_at' in template) {
        template.updated_at = new Date().toISOString();
    }
    
    draft[activeFileKey].entries.push(template);
    renderEditor();
    updateDirtyStatus();
}

function deleteEntryItem(index) {
    draft[activeFileKey].entries.splice(index, 1);
    renderEditor();
    updateDirtyStatus();
}
