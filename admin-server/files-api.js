module.exports = function (app, shared) {
    const {
        readJSON,
        writeJSON,
        validateDataType,
        envelope,
        DATA_DIR,
        DEFAULTS_DIR,
        FILE_REGISTRY,
        path,
        fs
    } = shared;

    /**
     * GET /api/admin/files
     * List all manageable files with metadata
     */
    app.get('/api/admin/files', (req, res) => {
        const files = Object.entries(FILE_REGISTRY).map(([key, meta]) => ({
            key,
            label: meta.label,
            type: meta.type
        }));
        res.json(envelope(true, files));
    });

    /**
     * GET /api/admin/files/:fileKey
     * Read current content of a specific file
     */
    app.get('/api/admin/files/:fileKey', (req, res) => {
        const { fileKey } = req.params;
        const meta = FILE_REGISTRY[fileKey];

        if (!meta) {
            return res.status(404).json(envelope(false, null, `Unknown file key: ${fileKey}`));
        }

        const filePath = path.join(DATA_DIR, meta.file);
        const data = readJSON(filePath);

        if (data === null) {
            return res.status(500).json(envelope(false, null, `Failed to read file: ${meta.file}`));
        }

        res.json(envelope(true, data));
    });

    /**
     * PUT /api/admin/files/:fileKey
     * Save new content to a specific file
     */
    app.put('/api/admin/files/:fileKey', (req, res) => {
        const { fileKey } = req.params;
        const meta = FILE_REGISTRY[fileKey];

        if (!meta) {
            return res.status(404).json(envelope(false, null, `Unknown file key: ${fileKey}`));
        }

        const newData = req.body;

        // Validate data type
        if (!validateDataType(newData, meta.type)) {
            const expected = meta.type === 'array' ? 'array' : 'object';
            const actual = Array.isArray(newData) ? 'array' : typeof newData;
            return res.status(400).json(envelope(false, null, `Invalid data type: expected ${expected}, got ${actual}`));
        }

        const filePath = path.join(DATA_DIR, meta.file);

        if (!writeJSON(filePath, newData)) {
            return res.status(500).json(envelope(false, null, `Failed to write file: ${meta.file}`));
        }

        res.json(envelope(true, newData));
    });

    /**
     * POST /api/admin/files/:fileKey/reset
     * Reset file to default snapshot
     */
    app.post('/api/admin/files/:fileKey/reset', (req, res) => {
        const { fileKey } = req.params;
        const meta = FILE_REGISTRY[fileKey];

        if (!meta) {
            return res.status(404).json(envelope(false, null, `Unknown file key: ${fileKey}`));
        }

        const defaultPath = path.join(DEFAULTS_DIR, meta.file);
        const targetPath = path.join(DATA_DIR, meta.file);

        // Check if default exists
        if (!fs.existsSync(defaultPath)) {
            return res.status(404).json(envelope(false, null, `Default file not found: ${meta.file}`));
        }

        // Read default content
        const defaultData = readJSON(defaultPath);
        if (defaultData === null) {
            return res.status(500).json(envelope(false, null, `Failed to read default file: ${meta.file}`));
        }

        // Write to active file
        if (!writeJSON(targetPath, defaultData)) {
            return res.status(500).json(envelope(false, null, `Failed to reset file: ${meta.file}`));
        }

        res.json(envelope(true, defaultData));
    });

    /**
     * POST /api/admin/files/reset-all
     * Reset all files to their defaults
     */
    app.post('/api/admin/files/reset-all', (req, res) => {
        const results = {};
        let hasErrors = false;

        for (const [key, meta] of Object.entries(FILE_REGISTRY)) {
            const defaultPath = path.join(DEFAULTS_DIR, meta.file);
            const targetPath = path.join(DATA_DIR, meta.file);

            if (!fs.existsSync(defaultPath)) {
                results[key] = { success: false, error: 'Default not found' };
                hasErrors = true;
                continue;
            }

            const defaultData = readJSON(defaultPath);
            if (defaultData === null || !writeJSON(targetPath, defaultData)) {
                results[key] = { success: false, error: 'Read/write failed' };
                hasErrors = true;
                continue;
            }

            results[key] = { success: true };
        }

        res.json(envelope(!hasErrors, results, hasErrors ? 'Some files failed to reset' : null));
    });
};
