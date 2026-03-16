module.exports = function (app, shared) {
    const {
        envelope,
        crypto,
        ADMIN_USERNAME = process.env.ADMIN_USERNAME,
        ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH
    } = shared;

    /* ===================== SESSION MANAGEMENT ===================== */
    const SESSION_TTL_MS = (parseInt(process.env.ADMIN_SESSION_TTL_HOURS || '24', 10) || 24) * 60 * 60 * 1000;
    const sessions = new Map(); // Map<token, { expiresAt: number }>

    function createSession() {
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
        return token;
    }

    function isValidSession(token) {
        if (!token || typeof token !== 'string') return false;
        const session = sessions.get(token);
        if (!session) return false;
        if (Date.now() > session.expiresAt) {
            sessions.delete(token);
            return false;
        }
        return true;
    }

    function invalidateSession(token) {
        if (token) sessions.delete(token);
    }

    function cleanExpiredSessions() {
        const now = Date.now();
        for (const [token, session] of sessions) {
            if (now > session.expiresAt) sessions.delete(token);
        }
    }

    // Clean expired sessions every 30 minutes
    setInterval(cleanExpiredSessions, 30 * 60 * 1000);

    /* ===================== COOKIE PARSER & PASSWORD HASHER ===================== */
    function parseCookies(cookieHeader) {
        const cookies = {};
        if (!cookieHeader) return cookies;
        cookieHeader.split(';').forEach(cookie => {
            const [key, ...rest] = cookie.split('=');
            if (key) cookies[key.trim()] = rest.join('=').trim();
        });
        return cookies;
    }

    function hashPassword(password) {
        return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
    }

    /* ===================== LOGIN RATE LIMITER ===================== */
    // Login rate limiting: max 5 attempts per IP per 15 minutes
    const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
    const LOGIN_RATE_MAX = 5;
    const loginRateStore = new Map();

    function isLoginRateLimited(ip) {
        const now = Date.now();
        const key = ip || 'unknown';
        const existing = loginRateStore.get(key) || [];
        const recent = existing.filter(ts => now - ts < LOGIN_RATE_WINDOW_MS);
        if (recent.length >= LOGIN_RATE_MAX) {
            loginRateStore.set(key, recent);
            return true;
        }
        recent.push(now);
        loginRateStore.set(key, recent);
        return false;
    }

    // Clean stale rate limiter entries every 30 minutes
    function cleanRateLimiterStore(store, windowMs) {
        const now = Date.now();
        for (const [key, timestamps] of store) {
            const recent = timestamps.filter(ts => now - ts < windowMs);
            if (recent.length === 0) {
                store.delete(key);
            } else {
                store.set(key, recent);
            }
        }
    }

    setInterval(() => {
        cleanRateLimiterStore(loginRateStore, LOGIN_RATE_WINDOW_MS);
    }, 30 * 60 * 1000);

    /* ===================== AUTH MIDDLEWARE ===================== */
    // Auth middleware — protects all /api/admin/* routes EXCEPT /api/admin/auth/*
    function requireAuth(req, res, next) {
        // Skip auth for auth endpoints themselves
        if (req.path.startsWith('/api/admin/auth')) {
            return next();
        }

        // Skip auth for non-API routes (static files, SPA fallback)
        if (!req.path.startsWith('/api/admin/')) {
            return next();
        }

        const cookies = parseCookies(req.headers.cookie);
        const token = cookies.admin_session;

        if (!isValidSession(token)) {
            return res.status(401).json(envelope(false, null, 'Authentication required'));
        }

        next();
    }

    /* ===================== AUTH API ROUTES ===================== */

    /**
     * GET /api/admin/auth/status
     * Check if current session is authenticated
     */
    app.get('/api/admin/auth/status', (req, res) => {
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies.admin_session;
        const authenticated = isValidSession(token);
        res.json(envelope(true, { authenticated }));
    });

    /**
     * POST /api/admin/auth/login
     * Authenticate with username + password
     * Body: { username, password }
     */
    app.post('/api/admin/auth/login', (req, res) => {
        const clientIp = req.headers['x-forwarded-for']
            ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
            : req.ip;

        if (isLoginRateLimited(clientIp)) {
            return res.status(429).json(envelope(false, null, 'Too many login attempts. Try again later.'));
        }

        const { username, password } = req.body || {};

        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json(envelope(false, null, 'Username and password are required'));
        }

        const passwordHash = hashPassword(password);

        const usernameMatch = username === ADMIN_USERNAME;
        const hashBuffer = Buffer.from(passwordHash, 'hex');
        const storedBuffer = Buffer.from(ADMIN_PASSWORD_HASH, 'hex');
        const hashMatch = hashBuffer.length === storedBuffer.length && crypto.timingSafeEqual(hashBuffer, storedBuffer);

        if (!usernameMatch || !hashMatch) {
            return res.status(401).json(envelope(false, null, 'Invalid username or password'));
        }

        // Create session
        const sessionToken = createSession();

        res.setHeader('Set-Cookie', `admin_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
        res.json(envelope(true, { authenticated: true }));
    });

    /**
     * POST /api/admin/auth/logout
     * Clear current session
     */
    app.post('/api/admin/auth/logout', (req, res) => {
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies.admin_session;
        invalidateSession(token);

        res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        res.json(envelope(true, { authenticated: false }));
    });

    return { requireAuth };
};
