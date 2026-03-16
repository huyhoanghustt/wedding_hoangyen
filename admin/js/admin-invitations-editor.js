/* ===================== INVITATIONS EDITOR ===================== */

/**
 * Dedicated editor for invitations.json with:
 * - Textarea for body field (multiline support)
 * - Dynamic slot_descriptors management
 * - Format selection and preview
 */

function renderInvitationsEditor(data) {
    const formats = data.formats || {};
    const formatKeys = Object.keys(formats);
    // Default to first format or 'default' key
    const activeFormat = formatKeys.includes('default') ? 'default' : (formatKeys[0] || 'default');
    
    let html = `<div class="invitations-editor">`;
    
    // Format details
    const currentFormat = formats[activeFormat] || {};
    html += `
        <div class="invitations-section">
            <h3 class="section-title">📝 Format: ${escapeHtml(currentFormat.label || activeFormat)}</h3>
            
            <div class="invitations-field">
                <label for="invitations-format-label-${activeFormat}">Label</label>
                <input type="text"
                       id="invitations-format-label-${activeFormat}"
                       name="format_label"
                       value="${escapeHtml(currentFormat.label || '')}"
                       onchange="updateInvitationsFormatField('${activeFormat}', 'label', this.value)"
                       placeholder="Format label">
            </div>
            
            <div class="invitations-field">
                <label for="invitations-format-title-${activeFormat}">Title</label>
                <input type="text"
                       id="invitations-format-title-${activeFormat}"
                       name="format_title"
                       value="${escapeHtml(currentFormat.title || '')}"
                       onchange="updateInvitationsFormatField('${activeFormat}', 'title', this.value)"
                       placeholder="Invitation title (e.g., Kính mời)">
            </div>
            
            <div class="invitations-field invitations-field-full">
                <label for="invitations-format-body-${activeFormat}">Body Template</label>
                <p class="invitations-help">Use placeholders like {d0}, {d1}, etc. for dynamic pronouns.</p>
                <textarea rows="8"
                          id="invitations-format-body-${activeFormat}"
                          name="format_body"
                          onchange="updateInvitationsFormatField('${activeFormat}', 'body', this.value)"
                          placeholder="Gửi đến {d0} tấm thiệp cưới...">${escapeHtml(currentFormat.body || '')}</textarea>
            </div>
            
            <div class="invitations-field">
                <label for="invitations-format-closing-${activeFormat}">Closing</label>
                <input type="text"
                       id="invitations-format-closing-${activeFormat}"
                       name="format_closing"
                       value="${escapeHtml(currentFormat.closing || '')}"
                       onchange="updateInvitationsFormatField('${activeFormat}', 'closing', this.value)"
                       placeholder="· · · ♥ · · ·">
            </div>
        </div>
    `;
    
    // Slot descriptors section
    const slotDescriptors = currentFormat.slot_descriptors || [];
    html += `
        <div class="invitations-section">
            <h3 class="section-title">🏷️ Slot Descriptors (${slotDescriptors.length})</h3>
            <p class="invitations-help">Each slot corresponds to a placeholder {dN} in the body template.</p>
            
            <div class="slot-descriptors-list">
                ${slotDescriptors.map((slot, idx) => `
                    <div class="slot-descriptor-item">
                        <div class="slot-descriptor-header">
                            <span class="slot-index">{d${slot.index}}</span>
                            <span class="slot-type-badge ${slot.type || 'guest'}">${escapeHtml(slot.type || 'guest')}</span>
                            <div class="slot-actions">
                                <button class="btn btn-small" onclick="moveSlotDescriptor('${activeFormat}', ${idx}, 'up')" ${idx === 0 ? 'disabled' : ''}>↑</button>
                                <button class="btn btn-small" onclick="moveSlotDescriptor('${activeFormat}', ${idx}, 'down')" ${idx === slotDescriptors.length - 1 ? 'disabled' : ''}>↓</button>
                                <button class="btn btn-small btn-danger" onclick="deleteSlotDescriptor('${activeFormat}', ${idx})">🗑️</button>
                            </div>
                        </div>
                        <div class="slot-descriptor-fields">
                            <div class="slot-field">
                                <label for="slot-index-${activeFormat}-${idx}">Index</label>
                                <input type="number" min="0" id="slot-index-${activeFormat}-${idx}" name="slot_index_${idx}" value="${slot.index}"
                                       onchange="updateSlotDescriptor('${activeFormat}', ${idx}, 'index', parseInt(this.value))">
                            </div>
                            <div class="slot-field">
                                <label for="slot-label-${activeFormat}-${idx}">Label</label>
                                <input type="text" id="slot-label-${activeFormat}-${idx}" name="slot_label_${idx}" value="${escapeHtml(slot.label || slot.placeholder || '')}"
                                       onchange="updateSlotDescriptor('${activeFormat}', ${idx}, 'label', this.value)"
                                       placeholder="{d0}">
                            </div>
                            <div class="slot-field">
                                <label for="slot-type-${activeFormat}-${idx}">Type</label>
                                <select id="slot-type-${activeFormat}-${idx}" name="slot_type_${idx}" onchange="updateSlotDescriptor('${activeFormat}', ${idx}, 'type', this.value)">
                                    <option value="guest" ${slot.type === 'guest' ? 'selected' : ''}>Guest</option>
                                    <option value="couple" ${slot.type === 'couple' ? 'selected' : ''}>Couple</option>
                                    <option value="family-companion" ${slot.type === 'family-companion' ? 'selected' : ''}>Family Companion</option>
                                    <option value="other" ${slot.type === 'other' ? 'selected' : ''}>Other</option>
                                </select>
                            </div>
                            <div class="slot-field slot-field-full">
                                <label for="slot-hint-${activeFormat}-${idx}">Hint</label>
                                <input type="text" id="slot-hint-${activeFormat}-${idx}" name="slot_hint_${idx}" value="${escapeHtml(slot.hint || '')}"
                                       onchange="updateSlotDescriptor('${activeFormat}', ${idx}, 'hint', this.value)"
                                       placeholder="Description for this slot">
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <button class="btn btn-add-row" onclick="addSlotDescriptor('${activeFormat}')">+ Add Slot Descriptor</button>
        </div>
    `;
    
    // Default pronouns for this format
    const defaultPronouns = currentFormat.default_pronouns || [];
    html += `
        <div class="invitations-section">
            <h3 class="section-title">💬 Default Pronouns</h3>
            <p class="invitations-help">Default values for each slot. Length should match slot descriptors.</p>
            <div class="default-pronouns-list">
                ${defaultPronouns.map((pronoun, idx) => `
                    <div class="pronoun-item">
                        <label for="default-pronoun-${activeFormat}-${idx}">{d${idx}}</label>
                        <input type="text" id="default-pronoun-${activeFormat}-${idx}" name="default_pronoun_${idx}" value="${escapeHtml(pronoun)}"
                               onchange="updateDefaultPronoun('${activeFormat}', ${idx}, this.value)">
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Global presets
    html += `
        <div class="invitations-section">
            <h3 class="section-title">⚙️ Global Presets</h3>
            
            <div class="invitations-field invitations-field-full">
                <label for="invitations-phrase-presets">Phrase Presets (comma-separated)</label>
                <input type="text"
                       id="invitations-phrase-presets"
                       name="phrase_presets"
                       value="${escapeHtml((data.phrase_presets || []).join(', '))}"
                       onchange="updateInvitationsPresets('phrase_presets', this.value)">
            </div>
            
            <div class="invitations-field invitations-field-full">
                <label for="invitations-pronoun-title-presets">Pronoun for Title Presets (comma-separated)</label>
                <input type="text"
                       id="invitations-pronoun-title-presets"
                       name="pronoun_for_title_presets"
                       value="${escapeHtml((data.pronoun_for_title_presets || []).join(', '))}"
                       onchange="updateInvitationsPresets('pronoun_for_title_presets', this.value)">
            </div>
            
            <div class="invitations-field invitations-field-full">
                <label for="invitations-guest-pronoun-presets">Guest Pronoun Presets (comma-separated)</label>
                <input type="text"
                       id="invitations-guest-pronoun-presets"
                       name="guest_pronoun_presets"
                       value="${escapeHtml((data.guest_pronoun_presets || []).join(', '))}"
                       onchange="updateInvitationsPresets('guest_pronoun_presets', this.value)">
            </div>
            
            <div class="invitations-field invitations-field-full">
                <label for="invitations-couple-pronoun-presets">Couple Pronoun Presets (comma-separated)</label>
                <input type="text"
                       id="invitations-couple-pronoun-presets"
                       name="couple_pronoun_presets"
                       value="${escapeHtml((data.couple_pronoun_presets || []).join(', '))}"
                       onchange="updateInvitationsPresets('couple_pronoun_presets', this.value)">
            </div>
            
            <div class="invitations-field invitations-field-full">
                <label for="invitations-family-companion-presets">Family Companion Presets (comma-separated)</label>
                <input type="text"
                       id="invitations-family-companion-presets"
                       name="family_companion_presets"
                       value="${escapeHtml((data.family_companion_presets || []).join(', '))}"
                       onchange="updateInvitationsPresets('family_companion_presets', this.value)">
            </div>
        </div>
    `;
    
    // Pronoun Auto-Fill Presets section
    const pronounForTitleDefaults = data.pronoun_for_title_defaults || [];
    const presetSlotDescriptors = currentFormat.slot_descriptors || [];
    const maxSlotIndex = presetSlotDescriptors.length > 0
        ? Math.max(...presetSlotDescriptors.map(s => s.index))
        : 8;
    
    html += `
        <div class="invitations-section">
            <h3 class="section-title">📋 Pronoun Auto-Fill Presets (${pronounForTitleDefaults.length})</h3>
            <p class="invitations-help">When a guest's "pronoun for title" matches a preset key, all pronoun slots are auto-filled from the preset.</p>
            
            <div class="pronoun-presets-table-container">
                <table class="pronoun-presets-table">
                    <thead>
                        <tr>
                            <th class="col-key">Key</th>
                            <th class="col-label">Label</th>
                            ${Array.from({ length: maxSlotIndex + 1 }, (_, i) => `
                                <th class="col-slot" title="Slot d${i}">d${i}</th>
                            `).join('')}
                            <th class="col-actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pronounForTitleDefaults.map((preset, idx) => {
                            const pronouns = Array.isArray(preset.pronouns) ? preset.pronouns : [];
                            return `
                                <tr class="pronoun-preset-row">
                                    <td class="col-key">
                                        <input type="text"
                                               class="preset-key-input"
                                               value="${escapeHtml(preset.pronoun_for_title || '')}"
                                               onchange="updatePronounPresetKey(${idx}, this.value)"
                                               placeholder="e.g., anh, em, bạn">
                                    </td>
                                    <td class="col-label">
                                        <input type="text"
                                               class="preset-label-input"
                                               value="${escapeHtml(preset.label || '')}"
                                               onchange="updatePronounPresetLabel(${idx}, this.value)"
                                               placeholder="Display label">
                                    </td>
                                    ${Array.from({ length: maxSlotIndex + 1 }, (_, slotIdx) => `
                                        <td class="col-slot">
                                            <input type="text"
                                                   class="preset-slot-input"
                                                   value="${escapeHtml(pronouns[slotIdx] || '')}"
                                                   onchange="updatePronounPresetSlot(${idx}, ${slotIdx}, this.value)"
                                                   title="d${slotIdx}: ${escapeHtml(slotDescriptors.find(s => s.index === slotIdx)?.hint || '')}">
                                        </td>
                                    `).join('')}
                                    <td class="col-actions">
                                        <button class="btn btn-small btn-danger" onclick="deletePronounPreset(${idx})" title="Delete preset">🗑️</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            
            <button class="btn btn-add-row" onclick="addPronounPreset()">+ Add Preset</button>
        </div>
    `;
    
    // Preview section
    html += `
        <div class="invitations-section">
            <h3 class="section-title">👁️ Preview</h3>
            <div class="invitation-preview-card">
                <div class="invitation-preview-title">${escapeHtml(currentFormat.title || 'Kính mời')}</div>
                <div class="invitation-preview-divider"></div>
                <div class="invitation-preview-body">${renderInvitationPreviewBody(currentFormat)}</div>
                <div class="invitation-preview-closing">${escapeHtml(currentFormat.closing || '· · · ♥ · · ·')}</div>
            </div>
        </div>
    `;
    
    html += `</div>`;
    editorContainer.innerHTML = html;
}

function renderInvitationPreviewBody(format) {
    if (!format || !format.body) return '<p class="preview-empty">No body template</p>';
    
    const defaultPronouns = format.default_pronouns || [];
    let body = format.body;
    
    // Replace placeholders with default pronouns
    for (let i = 0; i < 20; i++) {
        const placeholder = `{d${i}}`;
        if (body.includes(placeholder)) {
            const value = defaultPronouns[i] || `[{d${i}}]`;
            // Special handling for family-companion slot
            if (i === 5 && value) {
                body = body.split(placeholder).join(` và ${value}`);
            } else {
                body = body.split(placeholder).join(value);
            }
        }
    }
    
    return escapeHtml(body).replace(/\n/g, '<br>');
}

/* ===================== INVITATIONS ACTIONS ===================== */

function updateInvitationsFormatField(formatKey, field, value) {
    if (!draft.invitations) draft.invitations = {};
    if (!draft.invitations.formats) draft.invitations.formats = {};
    if (!draft.invitations.formats[formatKey]) draft.invitations.formats[formatKey] = {};
    
    draft.invitations.formats[formatKey][field] = value;
    renderEditor();
    updateDirtyStatus();
}

function updateInvitationsPresets(presetKey, value) {
    if (!draft.invitations) draft.invitations = {};
    
    // Parse comma-separated values
    const values = value.split(',').map(v => v.trim()).filter(v => v);
    draft.invitations[presetKey] = values;
    
    updateDirtyStatus();
}

function addSlotDescriptor(formatKey) {
    if (!draft.invitations) draft.invitations = {};
    if (!draft.invitations.formats) draft.invitations.formats = {};
    if (!draft.invitations.formats[formatKey]) draft.invitations.formats[formatKey] = {};
    
    const format = draft.invitations.formats[formatKey];
    if (!format.slot_descriptors) format.slot_descriptors = [];
    
    // Find next available index
    const existingIndexes = format.slot_descriptors.map(s => s.index);
    let nextIndex = 0;
    while (existingIndexes.includes(nextIndex)) nextIndex++;
    
    format.slot_descriptors.push({
        index: nextIndex,
        label: `{d${nextIndex}}`,
        placeholder: `{d${nextIndex}}`,
        type: 'guest',
        hint: 'guest pronoun'
    });
    
    // Also add to default_pronouns if exists
    if (format.default_pronouns) {
        format.default_pronouns[nextIndex] = format.default_pronouns[nextIndex] || '';
    }
    
    renderEditor();
    updateDirtyStatus();
}

function deleteSlotDescriptor(formatKey, index) {
    if (!draft.invitations?.formats?.[formatKey]?.slot_descriptors) return;
    
    draft.invitations.formats[formatKey].slot_descriptors.splice(index, 1);
    renderEditor();
    updateDirtyStatus();
}

function updateSlotDescriptor(formatKey, index, field, value) {
    if (!draft.invitations?.formats?.[formatKey]?.slot_descriptors?.[index]) return;
    
    draft.invitations.formats[formatKey].slot_descriptors[index][field] = value;
    
    // Update label and placeholder together for consistency
    if (field === 'index') {
        const slot = draft.invitations.formats[formatKey].slot_descriptors[index];
        slot.placeholder = `{d${value}}`;
        if (!slot.label || slot.label === `{d${slot.index}}`) {
            slot.label = `{d${value}}`;
        }
    }
    
    updateDirtyStatus();
}

function moveSlotDescriptor(formatKey, index, direction) {
    if (!draft.invitations?.formats?.[formatKey]?.slot_descriptors) return;
    
    const slots = draft.invitations.formats[formatKey].slot_descriptors;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= slots.length) return;
    
    [slots[index], slots[newIndex]] = [slots[newIndex], slots[index]];
    
    renderEditor();
    updateDirtyStatus();
}

function updateDefaultPronoun(formatKey, index, value) {
    if (!draft.invitations?.formats?.[formatKey]) return;
    
    if (!draft.invitations.formats[formatKey].default_pronouns) {
        draft.invitations.formats[formatKey].default_pronouns = [];
    }
    
    draft.invitations.formats[formatKey].default_pronouns[index] = value;
    updateDirtyStatus();
}

/* ===================== PRONOUN AUTO-FILL PRESETS ACTIONS ===================== */

function addPronounPreset() {
    if (!draft.invitations) draft.invitations = {};
    if (!draft.invitations.pronoun_for_title_defaults) {
        draft.invitations.pronoun_for_title_defaults = [];
    }
    
    // Get slot count from current format
    const activeFormat = draft.invitations.active_format || 'default';
    const format = draft.invitations?.formats?.[activeFormat] || {};
    const slotDescriptors = format.slot_descriptors || [];
    const maxSlotIndex = slotDescriptors.length > 0
        ? Math.max(...slotDescriptors.map(s => s.index))
        : 8;
    
    // Create empty preset with empty pronouns array
    draft.invitations.pronoun_for_title_defaults.push({
        pronoun_for_title: '',
        label: '',
        pronouns: Array.from({ length: maxSlotIndex + 1 }, () => '')
    });
    
    renderEditor();
    updateDirtyStatus();
}

function deletePronounPreset(index) {
    if (!draft.invitations?.pronoun_for_title_defaults) return;
    if (index < 0 || index >= draft.invitations.pronoun_for_title_defaults.length) return;
    
    draft.invitations.pronoun_for_title_defaults.splice(index, 1);
    renderEditor();
    updateDirtyStatus();
}

function updatePronounPresetKey(index, value) {
    if (!draft.invitations?.pronoun_for_title_defaults?.[index]) return;
    
    const normalizedKey = String(value || '').trim().toLowerCase();
    
    // Check for duplicate keys
    if (normalizedKey) {
        const isDuplicate = draft.invitations.pronoun_for_title_defaults.some((preset, idx) => {
            if (idx === index) return false;
            const existingKey = String(preset.pronoun_for_title || '').trim().toLowerCase();
            return existingKey === normalizedKey;
        });
        
        if (isDuplicate) {
            setStatus('Warning: Duplicate key detected. Keys should be unique.', true);
        }
    }
    
    draft.invitations.pronoun_for_title_defaults[index].pronoun_for_title = value;
    
    // Auto-populate label if empty
    if (!draft.invitations.pronoun_for_title_defaults[index].label && value) {
        const capitalized = value.charAt(0).toUpperCase() + value.slice(1);
        draft.invitations.pronoun_for_title_defaults[index].label = capitalized;
    }
    
    updateDirtyStatus();
}

function updatePronounPresetLabel(index, value) {
    if (!draft.invitations?.pronoun_for_title_defaults?.[index]) return;
    
    draft.invitations.pronoun_for_title_defaults[index].label = value;
    updateDirtyStatus();
}

function updatePronounPresetSlot(presetIndex, slotIndex, value) {
    if (!draft.invitations?.pronoun_for_title_defaults?.[presetIndex]) return;
    
    const preset = draft.invitations.pronoun_for_title_defaults[presetIndex];
    if (!preset.pronouns) {
        preset.pronouns = [];
    }
    
    // Ensure pronouns array is large enough
    while (preset.pronouns.length <= slotIndex) {
        preset.pronouns.push('');
    }
    
    preset.pronouns[slotIndex] = value;
    updateDirtyStatus();
}