module.exports = function (app, shared) {
    const sharp = require('sharp');

    const {
        envelope,
        readJSON,
        writeJSON,
        DATA_DIR,
        DEFAULTS_DIR,
        path,
        fs,
        crypto
    } = shared;

    const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
    const MEDIA_INDEX_PATH = path.join(DATA_DIR, 'media-index.json');
    const DEFAULT_MEDIA_INDEX_PATH = path.join(DEFAULTS_DIR, 'media-index.json');
    const ASSETS_ROOT = path.join(__dirname, '..', 'public', 'assets');

    const MEDIA_TYPES = Object.freeze({
        photos: {
            extensions: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']),
            maxBytes: 100 * 1024 * 1024,
        },
        music: {
            extensions: new Set(['.mp3']),
            maxBytes: 200 * 1024 * 1024,
        }
    });

    const MEDIA_TYPE_NAMES = Object.freeze(Object.keys(MEDIA_TYPES));
    const RESIZABLE_EXTENSIONS = Object.freeze(new Set(['.jpg', '.jpeg', '.png', '.webp']));
    const DEFAULT_MAX_PHOTO_SIZE_BYTES = 1048576;
    const DEFAULT_MEDIA_THUMB_SIZE = 256;
    const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;
    const SAFE_ID_RE = /^[a-f0-9]{32}$/i;
    const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

    const GUEST_QR_TYPE = 'guest-qr';
    const GUEST_QR_DIR = path.join(UPLOADS_ROOT, GUEST_QR_TYPE);
    const GUEST_QR_MAX_BYTES = 2 * 1024 * 1024;
    const GUEST_QR_MAX_DATA_URL_LENGTH = 4 * 1024 * 1024;
    const GUEST_QR_ALLOWED_MIME_TO_EXT = Object.freeze({
        'image/png': '.png',
        'image/jpeg': '.jpg'
    });
    const GUEST_QR_DATA_URL_RE = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i;

    ensureMediaStorage();

    try {
        autoImportExistingMedia();
    } catch (error) {
        console.error('Media auto-import failed:', error.message);
    }

    function ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    function ensureJsonFile(filePath, fallbackData) {
        if (fs.existsSync(filePath)) return;
        ensureDirectory(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(fallbackData, null, 2));
    }

    function ensureMediaStorage() {
        ensureDirectory(DATA_DIR);
        ensureDirectory(DEFAULTS_DIR);
        ensureDirectory(UPLOADS_ROOT);
        for (const type of MEDIA_TYPE_NAMES) {
            ensureDirectory(path.join(UPLOADS_ROOT, type));
        }
        ensureDirectory(GUEST_QR_DIR);
        ensureJsonFile(MEDIA_INDEX_PATH, createEmptyMediaIndex());
        ensureJsonFile(DEFAULT_MEDIA_INDEX_PATH, createEmptyMediaIndex());
    }

    function createEmptyMediaIndex() {
        return { photos: [], music: [] };
    }

    function normalizeMediaIndex(index) {
        const base = createEmptyMediaIndex();
        const source = index && typeof index === 'object' ? index : {};

        for (const type of MEDIA_TYPE_NAMES) {
            base[type] = Array.isArray(source[type]) ? source[type].slice() : [];
        }

        return base;
    }

    function readMediaIndex() {
        return normalizeMediaIndex(readJSON(MEDIA_INDEX_PATH));
    }

    function saveMediaIndex(index) {
        return writeJSON(MEDIA_INDEX_PATH, normalizeMediaIndex(index));
    }

    function isValidMediaType(type) {
        return MEDIA_TYPE_NAMES.includes(type);
    }

    function sanitizeOriginalName(value) {
        const name = path.basename(String(value || '').trim());
        return name.substring(0, 255);
    }

    function getExtensionFromName(fileName) {
        return path.extname(fileName || '').toLowerCase();
    }

    function getMaxPhotoSizeBytes() {
        const weddingConfig = readJSON(path.join(DATA_DIR, 'wedding.json'));
        const configuredValue = weddingConfig?.media?.max_photo_size_bytes;
        const parsedValue = Number(configuredValue);

        if (Number.isInteger(parsedValue) && parsedValue > 0) {
            return parsedValue;
        }

        return DEFAULT_MAX_PHOTO_SIZE_BYTES;
    }

    function getMediaUrl(type, filename) {
        return `/media/${type}/${filename}`;
    }

    function buildPublicEntry(type, entry) {
        return {
            ...entry,
            url: getMediaUrl(type, entry.filename)
        };
    }

    function parseBase64Input(rawValue) {
        if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
            return { ok: false, error: 'Missing base64 data' };
        }

        const trimmed = rawValue.trim();
        const payload = trimmed.includes(',') && trimmed.startsWith('data:')
            ? trimmed.slice(trimmed.indexOf(',') + 1)
            : trimmed;
        const normalized = payload.replace(/\s+/g, '');

        if (normalized.length === 0) {
            return { ok: false, error: 'Empty base64 data' };
        }

        if (!BASE64_RE.test(normalized)) {
            return { ok: false, error: 'Invalid base64 data' };
        }

        let buffer;
        try {
            buffer = Buffer.from(normalized, 'base64');
        } catch (error) {
            return { ok: false, error: 'Failed to decode base64 data' };
        }

        if (!buffer || buffer.length === 0) {
            return { ok: false, error: 'Decoded file is empty' };
        }

        return { ok: true, buffer };
    }

    function getRequestContentType(req) {
        return typeof req.headers['content-type'] === 'string'
            ? req.headers['content-type'].trim()
            : '';
    }

    function getMultipartBoundary(contentType) {
        const match = /boundary=([^;]+)/i.exec(contentType || '');
        if (!match || !match[1]) return '';
        return match[1].trim().replace(/^"|"$/g, '');
    }

    function parseMultipartHeaders(rawHeaders) {
        const headers = {};
        const lines = String(rawHeaders || '').split('\r\n');
        for (const line of lines) {
            const idx = line.indexOf(':');
            if (idx < 0) continue;
            const key = line.slice(0, idx).trim().toLowerCase();
            const value = line.slice(idx + 1).trim();
            if (!key) continue;
            headers[key] = value;
        }
        return headers;
    }

    function parseContentDisposition(value) {
        const result = {};
        const parts = String(value || '').split(';').map((part) => part.trim());
        for (const part of parts) {
            const eqIndex = part.indexOf('=');
            if (eqIndex < 0) continue;
            const key = part.slice(0, eqIndex).trim().toLowerCase();
            const rawValue = part.slice(eqIndex + 1).trim();
            result[key] = rawValue.replace(/^"|"$/g, '');
        }
        return result;
    }

    function parseMultipartBuffer(bodyBuffer, boundary) {
        if (!Buffer.isBuffer(bodyBuffer) || bodyBuffer.length === 0) {
            return { ok: false, error: 'Missing multipart payload' };
        }

        if (!boundary) {
            return { ok: false, error: 'Missing multipart boundary' };
        }

        const marker = Buffer.from(`--${boundary}`);
        const segments = [];
        let cursor = 0;

        while (cursor < bodyBuffer.length) {
            const markerIndex = bodyBuffer.indexOf(marker, cursor);
            if (markerIndex < 0) break;

            const start = markerIndex + marker.length;
            if (start + 1 < bodyBuffer.length && bodyBuffer[start] === 45 && bodyBuffer[start + 1] === 45) {
                break;
            }

            let partStart = start;
            if (bodyBuffer[partStart] === 13 && bodyBuffer[partStart + 1] === 10) {
                partStart += 2;
            }

            const nextMarkerIndex = bodyBuffer.indexOf(marker, partStart);
            if (nextMarkerIndex < 0) break;

            let partEnd = nextMarkerIndex;
            if (bodyBuffer[partEnd - 2] === 13 && bodyBuffer[partEnd - 1] === 10) {
                partEnd -= 2;
            }

            const rawPart = bodyBuffer.subarray(partStart, partEnd);
            if (rawPart.length > 0) {
                segments.push(rawPart);
            }

            cursor = nextMarkerIndex;
        }

        const fields = {};
        let filePart = null;

        for (const part of segments) {
            const headerEndIndex = part.indexOf(Buffer.from('\r\n\r\n'));
            if (headerEndIndex < 0) continue;

            const headerText = part.subarray(0, headerEndIndex).toString('utf8');
            const payload = part.subarray(headerEndIndex + 4);
            const headers = parseMultipartHeaders(headerText);
            const disposition = parseContentDisposition(headers['content-disposition']);
            const fieldName = disposition.name;

            if (!fieldName) continue;

            if (disposition.filename !== undefined) {
                filePart = {
                    fieldName,
                    filename: disposition.filename || '',
                    contentType: headers['content-type'] || 'application/octet-stream',
                    buffer: payload
                };
            } else {
                fields[fieldName] = payload.toString('utf8');
            }
        }

        if (!filePart || !Buffer.isBuffer(filePart.buffer) || filePart.buffer.length === 0) {
            return { ok: false, error: 'Missing uploaded file' };
        }

        return { ok: true, fields, file: filePart };
    }

    function readRequestRawBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', (chunk) => {
                chunks.push(chunk);
            });
            req.on('error', (error) => reject(error));
            req.on('end', () => resolve(Buffer.concat(chunks)));
        });
    }

    async function parseUploadInput(req) {
        const contentType = getRequestContentType(req);
        const normalizedContentType = contentType.toLowerCase();

        if (normalizedContentType.startsWith('multipart/form-data')) {
            const boundary = getMultipartBoundary(contentType);
            const bodyBuffer = await readRequestRawBody(req);
            const parsed = parseMultipartBuffer(bodyBuffer, boundary);
            if (!parsed.ok) return parsed;

            const type = typeof parsed.fields.type === 'string' ? parsed.fields.type.trim() : '';
            const originalNameField = typeof parsed.fields.originalName === 'string' ? parsed.fields.originalName : '';
            const fallbackFileName = parsed.file.filename || '';

            return {
                ok: true,
                type,
                originalName: originalNameField || fallbackFileName,
                buffer: parsed.file.buffer,
                transport: 'multipart'
            };
        }

        const type = typeof req.body?.type === 'string' ? req.body.type.trim() : '';
        const originalName = req.body?.originalName;
        const data = req.body?.data;

        const decode = parseBase64Input(data);
        if (!decode.ok) {
            return decode;
        }

        return {
            ok: true,
            type,
            originalName,
            buffer: decode.buffer,
            transport: 'base64'
        };
    }

    function generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    function createUniqueFilename(ext, destinationDir) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const id = generateId();
            const filename = `${id}${ext}`;
            const fullPath = path.join(destinationDir, filename);
            if (!fs.existsSync(fullPath)) {
                return { id, filename, fullPath };
            }
        }
        throw new Error('Failed to allocate unique filename');
    }

    function inferContentType(fileName) {
        const ext = getExtensionFromName(fileName);
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.mp3': 'audio/mpeg'
        };
        return contentTypeMap[ext] || 'application/octet-stream';
    }

    function getValidatedType(type) {
        if (!isValidMediaType(type)) {
            return { ok: false, error: 'Invalid media type. Expected photos or music.' };
        }
        return { ok: true, type };
    }

    function parsePositiveInt(value, fallbackValue) {
        const parsed = Number.parseInt(String(value || ''), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) return fallbackValue;
        return parsed;
    }

    async function buildPreviewThumbnail(buffer, ext, maxSize) {
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
        if (!RESIZABLE_EXTENSIONS.has(ext)) return null;

        const size = Math.max(64, Math.min(maxSize, 1024));

        try {
            return await sharp(buffer, { failOn: 'none' })
                .rotate()
                .resize({
                    width: size,
                    height: size,
                    fit: 'cover',
                    position: 'attention',
                    withoutEnlargement: true
                })
                .webp({ quality: 70, effort: 4 })
                .toBuffer();
        } catch (_error) {
            return null;
        }
    }

    function validateTypeAndExtension(type, originalName) {
        const typeCheck = getValidatedType(type);
        if (!typeCheck.ok) return typeCheck;

        const safeOriginalName = sanitizeOriginalName(originalName);
        if (!safeOriginalName) {
            return { ok: false, error: 'originalName is required' };
        }

        const ext = getExtensionFromName(safeOriginalName);
        if (!MEDIA_TYPES[type].extensions.has(ext)) {
            return { ok: false, error: `Unsupported file extension for ${type}` };
        }

        return { ok: true, type, originalName: safeOriginalName, ext };
    }

    function ensureIndexWriteOrThrow(index) {
        if (!saveMediaIndex(index)) {
            throw new Error('Failed to save media index');
        }
    }

    function makeMediaEntry(id, originalName, filename, size) {
        return {
            id,
            originalName,
            filename,
            uploadedAt: new Date().toISOString(),
            size
        };
    }

    async function resizeImageIfNeeded(buffer, ext, maxBytes) {
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) return buffer;
        if (!Number.isInteger(maxBytes) || maxBytes <= 0) return buffer;
        if (buffer.length <= maxBytes) return buffer;
        if (!RESIZABLE_EXTENSIONS.has(ext)) return buffer;

        const qualityPresetsByExt = {
            '.jpg': [80, 65, 50],
            '.jpeg': [80, 65, 50],
            '.webp': [80, 65, 50],
        };

        const scales = [1.0, 0.85, 0.7, 0.55];
        const qualityPresets = qualityPresetsByExt[ext] || [null];
        let bestBuffer = buffer;

        try {
            const metadata = await sharp(buffer, { failOn: 'none' }).metadata();
            const baseWidth = Number(metadata.width) || 0;
            const baseHeight = Number(metadata.height) || 0;

            for (const scale of scales) {
                const width = baseWidth > 0 ? Math.max(1, Math.round(baseWidth * scale)) : null;
                const height = baseHeight > 0 ? Math.max(1, Math.round(baseHeight * scale)) : null;

                for (const quality of qualityPresets) {
                    let pipeline = sharp(buffer, { failOn: 'none' }).rotate();

                    if (scale < 1 && width && height) {
                        pipeline = pipeline.resize({
                            width,
                            height,
                            fit: 'inside',
                            withoutEnlargement: true
                        });
                    }

                    if (ext === '.jpg' || ext === '.jpeg') {
                        pipeline = pipeline.jpeg({ quality, mozjpeg: true });
                    } else if (ext === '.webp') {
                        pipeline = pipeline.webp({ quality });
                    } else if (ext === '.png') {
                        pipeline = pipeline.png({
                            compressionLevel: 9,
                            palette: true,
                            adaptiveFiltering: true,
                            effort: 10
                        });
                    }

                    const candidate = await pipeline.toBuffer();

                    if (candidate.length < bestBuffer.length) {
                        bestBuffer = candidate;
                    }

                    if (candidate.length <= maxBytes) {
                        return candidate;
                    }
                }
            }
        } catch (_error) {
            return bestBuffer;
        }

        return bestBuffer;
    }

    function fileExists(filePath) {
        try {
            return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
        } catch (_error) {
            return false;
        }
    }

    function resolveContainedMediaPath(type, filename) {
        const uploadTypeRoot = path.resolve(path.join(UPLOADS_ROOT, type));
        const resolvedFilePath = path.resolve(uploadTypeRoot, filename);
        const withinRoot = resolvedFilePath.startsWith(uploadTypeRoot + path.sep) || resolvedFilePath === uploadTypeRoot;
        return {
            uploadTypeRoot,
            resolvedFilePath,
            withinRoot
        };
    }

    function resolveContainedGuestQrPath(filename) {
        const root = path.resolve(GUEST_QR_DIR);
        const resolvedFilePath = path.resolve(root, filename);
        const withinRoot = resolvedFilePath.startsWith(root + path.sep) || resolvedFilePath === root;
        return { root, resolvedFilePath, withinRoot };
    }

    function getGuestQrMimeToExtMap() {
        const allowJpeg = String(process.env.ADMIN_GUEST_QR_ENABLE_JPEG || '1').trim() !== '0';
        return allowJpeg
            ? GUEST_QR_ALLOWED_MIME_TO_EXT
            : Object.freeze({ 'image/png': '.png' });
    }

    function parseGuestQrDataUrl(imageDataUrl, mimeType) {
        const normalizedMime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
        const allowedMimeToExt = getGuestQrMimeToExtMap();

        if (!normalizedMime || !Object.prototype.hasOwnProperty.call(allowedMimeToExt, normalizedMime)) {
            return { ok: false, error: 'Unsupported QR mime_type' };
        }

        if (typeof imageDataUrl !== 'string' || imageDataUrl.trim().length === 0) {
            return { ok: false, error: 'Missing QR image_data_url' };
        }

        if (imageDataUrl.length > GUEST_QR_MAX_DATA_URL_LENGTH) {
            return { ok: false, error: 'QR payload too large' };
        }

        const match = GUEST_QR_DATA_URL_RE.exec(imageDataUrl.trim());
        if (!match) {
            return { ok: false, error: 'Invalid QR data URL format' };
        }

        const dataUrlMime = String(match[1] || '').trim().toLowerCase();
        if (dataUrlMime !== normalizedMime) {
            return { ok: false, error: 'QR mime_type does not match data URL' };
        }

        const base64Payload = String(match[2] || '').replace(/\s+/g, '');
        if (!base64Payload || !BASE64_RE.test(base64Payload)) {
            return { ok: false, error: 'Invalid QR base64 payload' };
        }

        let buffer;
        try {
            buffer = Buffer.from(base64Payload, 'base64');
        } catch (_error) {
            return { ok: false, error: 'Failed to decode QR payload' };
        }

        if (!buffer || buffer.length === 0) {
            return { ok: false, error: 'Decoded QR image is empty' };
        }

        if (buffer.length > GUEST_QR_MAX_BYTES) {
            return { ok: false, error: 'Decoded QR image exceeds size limit' };
        }

        const canonicalInput = base64Payload.replace(/=+$/g, '');
        const canonicalDecoded = buffer.toString('base64').replace(/=+$/g, '');
        if (canonicalInput !== canonicalDecoded) {
            return { ok: false, error: 'QR payload integrity check failed' };
        }

        return { ok: true, buffer, ext: allowedMimeToExt[normalizedMime], mimeType: normalizedMime };
    }

    function replacePathsDeep(value, pathMapping) {
        if (typeof value === 'string') {
            return Object.prototype.hasOwnProperty.call(pathMapping, value)
                ? pathMapping[value]
                : value;
        }

        if (Array.isArray(value)) {
            return value.map((item) => replacePathsDeep(item, pathMapping));
        }

        if (value && typeof value === 'object') {
            return Object.keys(value).reduce((acc, key) => {
                acc[key] = replacePathsDeep(value[key], pathMapping);
                return acc;
            }, {});
        }

        return value;
    }

    function updateDataFilePaths(pathMapping) {
        if (!pathMapping || Object.keys(pathMapping).length === 0) {
            return;
        }

        const targets = [
            path.join(DATA_DIR, 'hero_gallery.json'),
            path.join(DATA_DIR, 'wedding.json'),
            path.join(DATA_DIR, 'story-layout.json'),
            path.join(DEFAULTS_DIR, 'hero_gallery.json'),
            path.join(DEFAULTS_DIR, 'wedding.json'),
            path.join(DEFAULTS_DIR, 'story-layout.json')
        ];

        for (const targetPath of targets) {
            if (!fs.existsSync(targetPath)) continue;
            const current = readJSON(targetPath);
            if (current === null) continue;
            const nextValue = replacePathsDeep(current, pathMapping);
            writeJSON(targetPath, nextValue);
        }
    }

    function walkFilesRecursively(dirPath) {
        const results = [];
        if (!fs.existsSync(dirPath)) return results;

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                results.push(...walkFilesRecursively(fullPath));
            } else if (entry.isFile()) {
                results.push(fullPath);
            }
        }
        return results;
    }

    function importSourceFile(type, srcPath, index, pathMapping) {
        const ext = getExtensionFromName(srcPath);
        if (!MEDIA_TYPES[type].extensions.has(ext)) return index;
        if (!fileExists(srcPath)) return index;

        const destDir = path.join(UPLOADS_ROOT, type);
        const { id, filename, fullPath } = createUniqueFilename(ext, destDir);
        fs.copyFileSync(srcPath, fullPath);
        const stats = fs.statSync(fullPath);

        const entry = makeMediaEntry(id, path.basename(srcPath), filename, stats.size);
        const nextIndex = {
            ...index,
            [type]: [...index[type], entry]
        };

        const relativeFromAssets = path.relative(ASSETS_ROOT, srcPath).split(path.sep).join('/');
        pathMapping[`/assets/${relativeFromAssets}`] = getMediaUrl(type, filename);

        return nextIndex;
    }

    function autoImportExistingMedia() {
        let index = readMediaIndex();
        if (index.photos.length > 0 || index.music.length > 0) {
            return;
        }

        const pathMapping = {};

        const importDirs = {
            photos: [
                path.join(ASSETS_ROOT, 'anh_cuoi_resize'),
                path.join(ASSETS_ROOT, 'stk')
            ],
            music: [
                path.join(ASSETS_ROOT, 'audio')
            ]
        };

        for (const [type, dirs] of Object.entries(importDirs)) {
            for (const dirPath of dirs) {
                if (!fs.existsSync(dirPath)) continue;
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isFile()) continue;
                    index = importSourceFile(type, path.join(dirPath, entry.name), index, pathMapping);
                }
            }
        }

        const ceremonyMapDir = path.join(ASSETS_ROOT, 'assets.cinelove.me');
        for (const filePath of walkFilesRecursively(ceremonyMapDir)) {
            index = importSourceFile('photos', filePath, index, pathMapping);
        }

        ensureIndexWriteOrThrow(index);
        updateDataFilePaths(pathMapping);

        if (Object.keys(pathMapping).length > 0) {
            console.log(`Auto-imported media: ${index.photos.length} photos, ${index.music.length} music files`);
        }
    }

    app.post('/api/admin/media/guest-qr', (req, res) => {
        const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        const guestName = typeof req.body?.guest_name === 'string' ? req.body.guest_name.trim() : '';
        const mimeType = typeof req.body?.mime_type === 'string' ? req.body.mime_type.trim().toLowerCase() : '';
        const imageDataUrl = req.body?.image_data_url;

        if (!token || token.length > 128) {
            return res.status(400).json(envelope(false, null, 'Invalid token'));
        }

        if (guestName.length > 255) {
            return res.status(400).json(envelope(false, null, 'Invalid guest_name'));
        }

        const parse = parseGuestQrDataUrl(imageDataUrl, mimeType);
        if (!parse.ok) {
            const statusCode = parse.error && parse.error.toLowerCase().includes('too large')
                ? 413
                : 400;
            return res.status(statusCode).json(envelope(false, null, parse.error));
        }

        let allocation;
        try {
            allocation = createUniqueFilename(parse.ext, GUEST_QR_DIR);
            fs.writeFileSync(allocation.fullPath, parse.buffer, { flag: 'wx' });
        } catch (_error) {
            return res.status(500).json(envelope(false, null, 'Failed to persist QR image'));
        }

        const updatedAt = new Date().toISOString();
        return res.status(201).json(envelope(true, {
            path: `/media/${GUEST_QR_TYPE}/${allocation.filename}`,
            updated_at: updatedAt
        }));
    });

    app.get(`/media/${GUEST_QR_TYPE}/:filename`, (req, res) => {
        const { filename } = req.params;

        if (!SAFE_FILENAME_RE.test(String(filename || ''))) {
            return res.status(400).json(envelope(false, null, 'Invalid filename'));
        }

        const containment = resolveContainedGuestQrPath(filename);
        if (!containment.withinRoot) {
            return res.status(400).json(envelope(false, null, 'Path traversal detected'));
        }

        if (!fileExists(containment.resolvedFilePath)) {
            return res.status(404).json(envelope(false, null, 'Not found'));
        }

        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', inferContentType(filename));
        return res.sendFile(containment.resolvedFilePath);
    });

    /**
     * POST /api/admin/media/upload
     * Supports both multipart/form-data and legacy JSON base64 payload.
     */
    app.post('/api/admin/media/upload', async (req, res) => {
        let uploadInput;
        try {
            uploadInput = await parseUploadInput(req);
        } catch (error) {
            return res.status(400).json(envelope(false, null, 'Invalid upload payload'));
        }

        if (!uploadInput || !uploadInput.ok) {
            return res.status(400).json(envelope(false, null, uploadInput?.error || 'Invalid upload payload'));
        }

        const validation = validateTypeAndExtension(uploadInput.type, uploadInput.originalName);
        if (!validation.ok) {
            return res.status(400).json(envelope(false, null, validation.error));
        }

        const typeConfig = MEDIA_TYPES[validation.type];
        if (uploadInput.buffer.length > typeConfig.maxBytes) {
            return res.status(413).json(envelope(false, null, `File too large for ${validation.type}`));
        }

        let finalBuffer = uploadInput.buffer;
        if (validation.type === 'photos' && RESIZABLE_EXTENSIONS.has(validation.ext)) {
            finalBuffer = await resizeImageIfNeeded(
                uploadInput.buffer,
                validation.ext,
                getMaxPhotoSizeBytes()
            );
        }

        const destinationDir = path.join(UPLOADS_ROOT, validation.type);

        let allocation;
        try {
            allocation = createUniqueFilename(validation.ext, destinationDir);
            fs.writeFileSync(allocation.fullPath, finalBuffer, { flag: 'wx' });
        } catch (error) {
            return res.status(500).json(envelope(false, null, 'Failed to save uploaded file'));
        }

        try {
            const entry = makeMediaEntry(
                allocation.id,
                validation.originalName,
                allocation.filename,
                finalBuffer.length
            );
            const currentIndex = readMediaIndex();
            const nextIndex = {
                ...currentIndex,
                [validation.type]: [...currentIndex[validation.type], entry]
            };
            ensureIndexWriteOrThrow(nextIndex);

            return res.status(201).json(envelope(true, {
                ...entry,
                url: getMediaUrl(validation.type, entry.filename)
            }));
        } catch (error) {
            try {
                if (fs.existsSync(allocation.fullPath)) fs.unlinkSync(allocation.fullPath);
            } catch (_cleanupError) {
                // ignore cleanup failure
            }
            return res.status(500).json(envelope(false, null, 'Failed to update media index'));
        }
    });

    /**
     * GET /api/admin/media/list?type=photos|music
     */
    app.get('/api/admin/media/list', (req, res) => {
        const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
        const typeCheck = getValidatedType(type);
        if (!typeCheck.ok) {
            return res.status(400).json(envelope(false, null, typeCheck.error));
        }

        const index = readMediaIndex();
        const entries = index[type].map((entry) => buildPublicEntry(type, entry));
        return res.json(envelope(true, entries));
    });

    /**
     * DELETE /api/admin/media/:type/:id
     */
    app.delete('/api/admin/media/:type/:id', (req, res) => {
        const { type, id } = req.params;
        const typeCheck = getValidatedType(type);
        if (!typeCheck.ok) {
            return res.status(400).json(envelope(false, null, typeCheck.error));
        }

        if (!SAFE_ID_RE.test(String(id || ''))) {
            return res.status(400).json(envelope(false, null, 'Invalid media id'));
        }

        const index = readMediaIndex();
        const targetEntry = index[type].find((entry) => entry && entry.id === id);
        if (!targetEntry) {
            return res.status(404).json(envelope(false, null, 'Media item not found'));
        }

        if (!SAFE_FILENAME_RE.test(String(targetEntry.filename || ''))) {
            return res.status(400).json(envelope(false, null, 'Invalid filename in media index'));
        }

        const containment = resolveContainedMediaPath(type, targetEntry.filename);
        if (!containment.withinRoot) {
            return res.status(400).json(envelope(false, null, 'Path traversal detected'));
        }

        const nextIndex = {
            ...index,
            [type]: index[type].filter((entry) => entry.id !== id)
        };

        try {
            if (fileExists(containment.resolvedFilePath)) {
                fs.unlinkSync(containment.resolvedFilePath);
            }
            ensureIndexWriteOrThrow(nextIndex);
            return res.json(envelope(true, { deletedId: id }));
        } catch (error) {
            return res.status(500).json(envelope(false, null, 'Failed to delete media item'));
        }
    });

    /**
     * PATCH /api/admin/media/:type/:id
     * Rename a media item's originalName
     * Body: { originalName: "new_name.jpg" }
     */
    app.patch('/api/admin/media/:type/:id', (req, res) => {
        const { type, id } = req.params;
        const typeCheck = getValidatedType(type);
        if (!typeCheck.ok) {
            return res.status(400).json(envelope(false, null, typeCheck.error));
        }

        if (!SAFE_ID_RE.test(String(id || ''))) {
            return res.status(400).json(envelope(false, null, 'Invalid media id'));
        }

        const newOriginalName = typeof req.body?.originalName === 'string'
            ? req.body.originalName.trim()
            : '';
        if (!newOriginalName || newOriginalName.length > 255) {
            return res.status(400).json(envelope(false, null, 'Invalid originalName'));
        }

        const index = readMediaIndex();
        const targetIndex = index[type].findIndex((entry) => entry && entry.id === id);
        if (targetIndex === -1) {
            return res.status(404).json(envelope(false, null, 'Media item not found'));
        }

        // Create immutable update
        const updatedEntry = { ...index[type][targetIndex], originalName: newOriginalName };
        const updatedTypeList = index[type].map((entry, i) => (i === targetIndex ? updatedEntry : entry));
        const nextIndex = { ...index, [type]: updatedTypeList };

        try {
            ensureIndexWriteOrThrow(nextIndex);
            return res.json(envelope(true, buildPublicEntry(type, updatedEntry)));
        } catch (error) {
            return res.status(500).json(envelope(false, null, 'Failed to update media index'));
        }
    });

    /**
     * GET /api/admin/media/preview/:type/:filename
     */
    app.get('/api/admin/media/preview/:type/:filename', async (req, res) => {
        const { type, filename } = req.params;
        const typeCheck = getValidatedType(type);
        if (!typeCheck.ok) {
            return res.status(404).json(envelope(false, null, 'Not found'));
        }

        if (!SAFE_FILENAME_RE.test(String(filename || ''))) {
            return res.status(400).json(envelope(false, null, 'Invalid filename'));
        }

        const containment = resolveContainedMediaPath(type, filename);
        if (!containment.withinRoot) {
            return res.status(400).json(envelope(false, null, 'Path traversal detected'));
        }

        if (!fileExists(containment.resolvedFilePath)) {
            return res.status(404).json(envelope(false, null, 'Not found'));
        }

        const wantsThumb = String(req.query.thumb || '') === '1';

        if (wantsThumb && type === 'photos') {
            const ext = getExtensionFromName(filename);
            const thumbSize = parsePositiveInt(req.query.size, DEFAULT_MEDIA_THUMB_SIZE);

            try {
                const srcBuffer = fs.readFileSync(containment.resolvedFilePath);
                const thumbBuffer = await buildPreviewThumbnail(srcBuffer, ext, thumbSize);

                if (thumbBuffer) {
                    res.setHeader('Cache-Control', 'private, max-age=300');
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    res.setHeader('Content-Type', 'image/webp');
                    return res.send(thumbBuffer);
                }
            } catch (_error) {
                // fall through to original preview if thumbnail generation fails
            }
        }

        res.setHeader('Cache-Control', 'private, max-age=60');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', inferContentType(filename));
        return res.sendFile(containment.resolvedFilePath);
    });
};
