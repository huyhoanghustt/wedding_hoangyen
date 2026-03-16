/* ===================== TREE EDITOR ===================== */

function renderTreeEditor(data) {
    editorContainer.innerHTML = `
        <div class="tree-breadcrumb">
            <strong>Path:</strong> <span id="treePath">/</span>
        </div>
        <div class="tree-editor">
            <div class="tree-root" id="treeRoot">
                ${renderTreeNode(data, '', 0)}
            </div>
        </div>
    `;
}

function renderTreeNode(node, path, depth) {
    if (node === null || node === undefined) {
        return `<span class="tree-value null">null</span>`;
    }
    
    const type = Array.isArray(node) ? 'array' : typeof node;
    
    if (type === 'array') {
        if (node.length === 0) {
            return `<span class="tree-value array">[]</span>`;
        }
        
        const children = node.map((item, index) => `
            <div class="tree-node">
                <div class="tree-header">
                    <span class="tree-toggle" onclick="toggleTreeNode(this)">▼</span>
                    <span class="tree-key">[${index}]</span>
                    <span class="tree-type-badge">${Array.isArray(item) ? 'array' : typeof item}</span>
                    <div class="tree-actions">
                        <button onclick="deleteArrayNode('${path}', ${index})">🗑️</button>
                    </div>
                </div>
                <div class="tree-children">
                    ${renderTreeNode(item, `${path}[${index}]`, depth + 1)}
                </div>
            </div>
        `).join('');
        
        return `
            <div class="tree-children">
                ${children}
                <button class="btn btn-add-row" style="margin-top: 0.25rem;" onclick="addArrayNode('${path}')">+ Add Item</button>
            </div>
        `;
    }
    
    if (type === 'object') {
        const keys = Object.keys(node);
        if (keys.length === 0) {
            return `<span class="tree-value object">{}</span>`;
        }
        
        const children = keys.map(key => {
            const value = node[key];
            const valueType = Array.isArray(value) ? 'array' : typeof value;
            const isExpandable = valueType === 'object' || valueType === 'array';
            const childPath = path ? `${path}.${key}` : key;
            
            return `
                <div class="tree-node">
                    <div class="tree-header">
                        ${isExpandable ? `<span class="tree-toggle" onclick="toggleTreeNode(this)">▼</span>` : '<span class="tree-toggle"></span>'}
                        <span class="tree-key">${escapeHtml(key)}</span>
                        <span class="tree-colon">:</span>
                        ${isExpandable ? `<span class="tree-type-badge">${valueType}</span>` : renderTreeValueInput(value, childPath, key)}
                        <div class="tree-actions">
                            <button onclick="deleteObjectKey('${path}', '${escapeHtml(key)}')">🗑️</button>
                        </div>
                    </div>
                    <div class="tree-children">
                        ${isExpandable ? renderTreeNode(value, childPath, depth + 1) : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        return `
            <div class="tree-children">
                ${children}
                <button class="btn btn-add-row" style="margin-top: 0.25rem;" onclick="addObjectKey('${path}')">+ Add Key</button>
            </div>
        `;
    }
    
    // Primitive value
    return renderTreeValueInput(node, path);
}

function renderTreeValueInput(value, path, keyName = null) {
    const type = typeof value;
    const isSrcField = keyName === 'src' || (path && path.endsWith('.src'));
    
    if (type === 'boolean') {
        return `
            <span class="tree-value boolean">
                <select onchange="updateTreeValue('${path}', this.value === 'true')">
                    <option value="true" ${value ? 'selected' : ''}>true</option>
                    <option value="false" ${!value ? 'selected' : ''}>false</option>
                </select>
            </span>
        `;
    }
    
    if (type === 'number') {
        return `
            <span class="tree-value number">
                <input type="number" value="${value}" onchange="updateTreeValue('${path}', parseFloat(this.value))">
            </span>
        `;
    }
    
    // String value - add picker button for 'src' fields
    if (isSrcField) {
        return `
            <span class="tree-value string">
                <div class="src-input-group">
                    <input type="text" value="${escapeHtml(String(value))}" onchange="updateTreeValue('${path}', this.value)" placeholder="/assets/path/to/file">
                    <button class="btn btn-browse" onclick="openTreeAssetPicker('${path}')" title="Browse assets">📁</button>
                </div>
            </span>
        `;
    }
    
    return `
        <span class="tree-value string">
            <input type="text" value="${escapeHtml(String(value))}" onchange="updateTreeValue('${path}', this.value)">
        </span>
    `;
}

function toggleTreeNode(element) {
    const node = element.closest('.tree-node');
    node.classList.toggle('collapsed');
    element.textContent = node.classList.contains('collapsed') ? '▶' : '▼';
}

function updateTreeValue(path, value) {
    const obj = draft[activeFileKey];
    setNestedValue(obj, path, value);
    updateDirtyStatus();
}

function addArrayNode(path) {
    const obj = draft[activeFileKey];
    const target = path ? getNestedValue(obj, path) : obj;
    
    if (Array.isArray(target)) {
        // Add empty item based on array type
        if (target.length > 0 && typeof target[0] === 'object') {
            target.push({});
        } else if (target.length > 0 && typeof target[0] === 'string') {
            target.push('');
        } else if (target.length > 0 && typeof target[0] === 'number') {
            target.push(0);
        } else {
            target.push(null);
        }
    }
    
    renderEditor();
    updateDirtyStatus();
}

function deleteArrayNode(path, index) {
    const obj = draft[activeFileKey];
    const target = path ? getNestedValue(obj, path) : obj;
    
    if (Array.isArray(target)) {
        target.splice(index, 1);
    }
    
    renderEditor();
    updateDirtyStatus();
}

function addObjectKey(path) {
    const key = prompt('Enter new key name:');
    if (!key) return;
    
    const obj = draft[activeFileKey];
    const target = path ? getNestedValue(obj, path) : obj;
    
    if (typeof target === 'object' && target !== null) {
        target[key] = '';
    }
    
    renderEditor();
    updateDirtyStatus();
}

function deleteObjectKey(path, key) {
    const obj = draft[activeFileKey];
    const target = path ? getNestedValue(obj, path) : obj;
    
    if (typeof target === 'object' && target !== null) {
        delete target[key];
    }
    
    renderEditor();
    updateDirtyStatus();
}
