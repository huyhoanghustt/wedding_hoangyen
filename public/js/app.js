/**
 * WEDDING INVITATION - THIEP CUOI 47
 * Main JavaScript - Handles all animations, interactions, and API calls
 */

; (function () {
    'use strict';

    const W = window.__WeddingApp = {};

    /* =============================================================
       CONFIGURATION
    ============================================================= */
    const CONFIG = {
        weddingDate: new Date('2026-12-20T09:00:00+07:00'),
        heartRainInterval: 350,
        heartRainMax: 40,
        blessingFetchInterval: 8000,
        galleryAutoplayInterval: 5000,
        apiBase: '',
    };

    /* =============================================================
       UTILS
    ============================================================= */
    function $(sel, ctx = document) { return ctx.querySelector(sel); }
    function $$(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

    function showToast(msg, duration = 2500) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), duration);
    }

    /**
     * Cross-browser clipboard copy with fallback for non-secure contexts (HTTP on mobile).
     * @param {string} text - The text to copy to clipboard
     * @returns {Promise<boolean>} - true if copy succeeded
     */
    function isIOSWebKitBrowser() {
        const ua = navigator.userAgent || '';
        const iOS = /iPad|iPhone|iPod/.test(ua)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return iOS && /AppleWebKit/.test(ua);
    }

    function copyToClipboard(text) {
        const value = String(text ?? '');
        if (!value) return Promise.resolve(false);

        // iOS WebKit (Safari/Chrome on iPhone) is more reliable with sync execCommand
        // when called directly inside a tap/click user gesture.
        if (isIOSWebKitBrowser()) {
            const legacySuccess = fallbackCopyToClipboard(value);
            if (legacySuccess) return Promise.resolve(true);
        }

        // Modern Clipboard API (requires Secure Context: HTTPS or localhost)
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(value)
                .then(() => true)
                .catch(() => fallbackCopyToClipboard(value));
        }

        // Fallback for non-secure contexts (HTTP) or unsupported browsers
        return Promise.resolve(fallbackCopyToClipboard(value));
    }

    /**
     * Legacy clipboard copy using execCommand('copy').
     * Works in non-secure contexts (HTTP) on both Android and iOS.
     * @param {string} text
     * @returns {boolean}
     */
    function fallbackCopyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');

        // Prevent viewport jump on iOS
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        textarea.style.fontSize = '16px';

        document.body.appendChild(textarea);

        let success = false;
        try {
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            success = document.execCommand('copy');
        } catch (err) {
            success = false;
        }

        document.body.removeChild(textarea);
        return success;
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

    function prefersReducedMotion() {
        return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // Validate that a media src path is safe (only /media/photos/ or /media/music/ with safe filename)
    function isSafeMediaSrc(src) {
        if (typeof src !== 'string') return false;
        return /^\/media\/(photos|music)\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(src)
            || /^\/assets\//.test(src);
    }

    W.$ = $;
    W.$$ = $$;
    W.showToast = showToast;
    W.copyToClipboard = copyToClipboard;
    W.fallbackCopyToClipboard = fallbackCopyToClipboard;
    W.pad = pad;
    W.prefersReducedMotion = prefersReducedMotion;
    W.escapeHtml = escapeHtml;
    W.isSafeMediaSrc = isSafeMediaSrc;
    W.CONFIG = CONFIG;
    W.getInvitationPersonalization = getInvitationPersonalization;

    W.CFG = {}; // global config object
    W.STORY_LAYOUT = null; // runtime story layout config
    W.GALLERY_DATA = null; // Gallery data loaded from hero_gallery.json (with backward fallback to wedding.json)
    W.HERO_DATA = null; // Hero data loaded from hero_gallery.json (with backward fallback to wedding.json)
    W.INVITATIONS_DATA = null; // Invitations data loaded from invitations.json (with backward fallback to wedding.json)

    W._inits = [];
    W._initSeq = 0;
    W.register = function (name, fn, order) {
        if (typeof fn !== 'function') return;
        W._inits.push({ name: name, fn: fn, order: Number.isFinite(order) ? order : 0, seq: W._initSeq++ });
    };

    /* =============================================================
       13. CONFIG LOADER — Reads wedding.json via API
    ============================================================= */
    function getInvitationPersonalization() {
        const payload = window.__INVITATION_PERSONALIZATION__;
        if (!payload || typeof payload !== 'object') {
            return {
                token: null,
                guestName: null,
                invitationTitle: null,
                pronounForTitle: null,
                pronouns: null,
                familyCompanionEnabled: true,
                customBodyEnabled: false,
                customBody: '',
                invitationFormat: 'default',
            };
        }

        const invitationTitle = typeof payload.invitationTitle === 'string' && payload.invitationTitle.trim()
            ? payload.invitationTitle.trim()
            : null;

        const guestName = typeof payload.guestName === 'string' && payload.guestName.trim()
            ? payload.guestName.trim()
            : null;

        const token = typeof payload.token === 'string' && payload.token.trim()
            ? payload.token.trim().toLowerCase()
            : null;

        const pronounForTitle = typeof payload.pronounForTitle === 'string' && payload.pronounForTitle.trim()
            ? payload.pronounForTitle.trim()
            : null;

        const pronouns = Array.isArray(payload.pronouns) && payload.pronouns.length >= 1
            ? payload.pronouns
            : null;

        const familyCompanionEnabled = payload.familyCompanionEnabled !== false;

        const customBodyEnabled = payload.customBodyEnabled === true;

        const customBody = typeof payload.customBody === 'string'
            ? payload.customBody
            : '';

        const invitationFormat = typeof payload.invitationFormat === 'string' && payload.invitationFormat.trim()
            ? payload.invitationFormat.trim().toLowerCase()
            : 'default';

        return {
            token,
            guestName,
            invitationTitle,
            pronounForTitle,
            pronouns,
            familyCompanionEnabled,
            customBodyEnabled,
            customBody,
            invitationFormat,
        };
    }

    /**
     * Build page title based on guest personalization.
     * @param {Object} personalization - Personalization data from getInvitationPersonalization
     * @returns {string} The formatted page title
     */
    function buildPageTitle(personalization) {
        const baseTitle = 'Thiệp cưới - Hoàng & Yến';
        
        if (!personalization.guestName) {
            return baseTitle;
        }
        
        const pronoun = personalization.pronounForTitle || 'bạn';
        
        return `${baseTitle} - Mời ${pronoun} ${personalization.guestName}`;
    }

    /**
     * Update the document title based on guest personalization.
     * @param {Object} personalization - Personalization data from getInvitationPersonalization
     */
    function updatePageTitle(personalization) {
        const title = buildPageTitle(personalization);
        document.title = title;
    }

    async function loadConfig() {
        // Load story layout (optional, non-blocking)
        const storyLayoutPromise = fetch('/data/story-layout.json')
            .then(async (response) => {
                if (!response.ok) {
                    W.STORY_LAYOUT = null;
                    console.warn('Story layout not available, using legacy fallback from W.CFG.story');
                    return;
                }

                const storyLayoutData = await response.json();
                W.STORY_LAYOUT = storyLayoutData && typeof storyLayoutData === 'object'
                    ? { ...storyLayoutData }
                    : null;
            })
            .catch((error) => {
                W.STORY_LAYOUT = null;
                console.warn('Could not load story layout, using legacy fallback from W.CFG.story:', error);
            })
            .finally(() => {
                // Story layout may resolve after initial inits have already run.
                // Re-run story init once layout fetch settles to avoid blank section on race conditions.
                if (typeof W.initStoryLayout === 'function') {
                    try {
                        W.initStoryLayout();
                    } catch (error) {
                        console.warn('Could not re-initialize story layout after async load:', error);
                    }
                }
            });

        // Load hero + gallery from dedicated file (with backward fallback)
        const galleryPromise = fetch('/data/hero_gallery.json')
            .then(async (response) => {
                if (!response.ok) {
                    W.GALLERY_DATA = null;
                    W.HERO_DATA = null;
                    console.warn('hero_gallery file not available, using legacy fallback from wedding.json');
                    return;
                }

                const heroGalleryData = await response.json();
                if (heroGalleryData && typeof heroGalleryData === 'object') {
                    W.GALLERY_DATA = heroGalleryData.gallery || null;
                    W.HERO_DATA = heroGalleryData.hero || null;
                } else {
                    W.GALLERY_DATA = null;
                    W.HERO_DATA = null;
                }
            })
            .catch((error) => {
                W.GALLERY_DATA = null;
                W.HERO_DATA = null;
                console.warn('Could not load hero_gallery file, using legacy fallback from wedding.json:', error);
            });

        // Load invitations from dedicated file (with backward fallback to wedding.json)
        const invitationsPromise = fetch('/data/invitations.json')
            .then(async (response) => {
                if (!response.ok) {
                    W.INVITATIONS_DATA = null;
                    console.warn('invitations.json not available, using legacy fallback from wedding.json invitation');
                    return;
                }

                const invitationsData = await response.json();
                W.INVITATIONS_DATA = invitationsData && typeof invitationsData === 'object'
                    ? { ...invitationsData }
                    : null;
            })
            .catch((error) => {
                W.INVITATIONS_DATA = null;
                console.warn('Could not load invitations.json, using legacy fallback from wedding.json:', error);
            });

        try {
            const weddingResponse = await fetch('/data/wedding.json');
            if (!weddingResponse.ok) {
                console.warn('Could not load wedding config from /data/wedding.json');
                return;
            }

            const weddingData = await weddingResponse.json();
            W.CFG = { ...weddingData };
            
            // Wait for gallery and invitations to load before applying config
            await Promise.all([galleryPromise, invitationsPromise]);
            applyConfig(W.CFG);
        } catch (e) {
            console.warn('Could not load wedding config:', e);
        }

        // Story layout is optional and must never block core config application.
        // Keep this detached to preserve gallery/config flow even when story layout fails.
        void storyLayoutPromise;
    }

    function applyConfig(c) {
        // Helper shortcuts
        const set = (sel, val) => {
            const el = $(sel);
            if (el && val !== undefined) el.textContent = val;
        };
        const setHref = (sel, val) => {
            const el = $(sel);
            if (el && val) el.href = val;
        };
        const setAttr = (sel, attr, val) => {
            const el = $(sel);
            if (el && val !== undefined) el.setAttribute(attr, val);
        };
        const setRootCssVarIfString = (name, val) => {
            if (typeof val !== 'string') return;
            const trimmed = val.trim();
            if (!trimmed) return;
            document.documentElement.style.setProperty(name, trimmed);
        };

        // Apply position object {top, left, right, bottom} to element's inline style.
        // Each side present in pos overrides CSS; absent sides are cleared (CSS default applies).
        const applyPos = (sel, pos) => {
            const el = $(sel);
            if (!el || !pos) return;
            ['top', 'left', 'right', 'bottom'].forEach(side => {
                el.style[side] = pos[side] ?? '';
            });
            // Adjust text-align: right if right-anchored, left if left-anchored, center otherwise
            if (pos.right !== undefined && pos.left === undefined) el.style.textAlign = 'right';
            else if (pos.left !== undefined && pos.right === undefined) el.style.textAlign = 'left';
        };

        // ---- Toolbar toggle sizing/position (from wedding.json toolbar_toggle section) ----
        if (c.toolbar_toggle) {
            const toolbarToggle = c.toolbar_toggle;
            const size = toolbarToggle.size || {};
            const position = toolbarToggle.position || {};

            setRootCssVarIfString('--toolbar-toggle-left', position.left);
            setRootCssVarIfString('--toolbar-toggle-bottom-expanded', position.bottom_expanded);
            setRootCssVarIfString('--toolbar-toggle-bottom-collapsed', position.bottom_collapsed);
            setRootCssVarIfString('--toolbar-toggle-size', size.button);
            setRootCssVarIfString('--toolbar-toggle-icon-size', size.icon);
            setRootCssVarIfString('--toolbar-toggle-line-width', size.line_width);
            setRootCssVarIfString('--toolbar-toggle-line-height', size.line_height);
        }

        // ---- Animation speed factor ----
        const speedFactor = typeof c.animation?.speed_factor === 'number' && c.animation.speed_factor > 0
            ? c.animation.speed_factor
            : 1.0;
        document.documentElement.style.setProperty('--animation-speed-factor', String(speedFactor));

        // ---- Couple names ----
        set('#hero-groom-name', c.couple?.groom);
        set('#hero-bride-name', c.couple?.bride);
        set('#footer-couple', `${c.couple?.groom} & ${c.couple?.bride} · ${c.wedding?.date_display}`);

        // ---- Hero overlay ----
        const heroData = W.HERO_DATA || c.hero || {};
        set('#hero-invite-label', heroData.invite_label);
        set('#hero-event-name', heroData.event_name);
        set('#hero-date-display', c.wedding?.date_display);

        // ---- Hero photo img (src + width from config) ----
        const heroBgImg = $('#hero-bg-img');
        if (heroBgImg) {
            if (heroData.photo) heroBgImg.src = heroData.photo;
            if (heroData.photo_width) heroBgImg.style.width = heroData.photo_width;
        }

        // ---- Ceremony map img (src + width from config) ----
        const mapImg = $('#ceremony-map-img');
        if (mapImg && c.ceremony_map?.width) {
            mapImg.style.width = c.ceremony_map.width;
        }

        // ---- Hero overlay positions ----
        applyPos('.hero-name-overlay', heroData.name_overlay_pos);
        applyPos('.hero-bottom-overlay', heroData.bottom_overlay_pos);

        // ---- Hosts section ----
        set('#host-bride-label', c.hosts?.bride_side?.label);
        set('#host-bride-name1', c.hosts?.bride_side?.parent1);
        set('#host-bride-name2', c.hosts?.bride_side?.parent2);
        set('#host-groom-label', c.hosts?.groom_side?.label);
        set('#host-groom-name1', c.hosts?.groom_side?.parent1);
        set('#host-groom-name2', c.hosts?.groom_side?.parent2);

        // ---- Invitation text ----
        // Priority: W.INVITATIONS_DATA (from invitations.json) > c.invitation (legacy from wedding.json)
        const personalization = getInvitationPersonalization();
        
        // Get invitation context from invitations.json with fallback to wedding.json
        // Use per-guest invitation format if available
        let invitationContext;
        if (W.INVITATIONS_DATA && typeof window.InvitationHelpers === 'object') {
            invitationContext = window.InvitationHelpers.getInvitationContext(
                W.INVITATIONS_DATA,
                c,
                personalization.invitationFormat || 'default'
            );
        } else {
            // Fallback to wedding.json invitation section
            const legacyInvitation = c.invitation || {};
            invitationContext = {
                title: legacyInvitation.title || 'Kính mời',
                body: legacyInvitation.body || '',
                closing: legacyInvitation.closing || '· · · ♥ · · ·',
                defaultPronouns: Array.isArray(legacyInvitation.default_pronouns)
                    ? legacyInvitation.default_pronouns
                    : ['bạn', 'Bạn', 'bạn', 'bọn mình', 'bạn', 'gia đình', 'hai đứa', 'bạn', 'chúng mình']
            };
        }
        
        const invitationTitleEl = $('#invitation-title');
        const resolvedInvitationTitle = personalization.invitationTitle
            || invitationContext.title
            || null;
        if (invitationTitleEl && resolvedInvitationTitle) {
            invitationTitleEl.textContent = resolvedInvitationTitle;
        }
        
        const bodyEl = $('#invitation-body');
        if (bodyEl) {
            if (personalization.customBodyEnabled && personalization.customBody) {
                // Custom body: render directly
                bodyEl.innerHTML = personalization.customBody.replace(/\n/g, '<br>');
            } else if (invitationContext.body) {
                // Use InvitationHelpers.renderInvitationBody if available
                if (typeof window.InvitationHelpers === 'object') {
                    const renderedBody = window.InvitationHelpers.renderInvitationBody(
                        invitationContext.body,
                        personalization.pronouns,
                        invitationContext.defaultPronouns,
                        personalization.familyCompanionEnabled
                    );
                    bodyEl.innerHTML = renderedBody.replace(/\n/g, '<br>');
                } else {
                    // Fallback: manual rendering (backward compatible with {d0}..{d7})
                    const defaultPronouns = invitationContext.defaultPronouns;
                    const guestPronouns = personalization.pronouns;
                    const pronounCount = Math.max(defaultPronouns.length || 0, guestPronouns?.length || 0);
                    const familyCompanionSlotIndex = 5;

                    let renderedBody = invitationContext.body;
                    for (let i = 0; i < pronounCount; i++) {
                        const placeholder = `{d${i}}`;
                        const baseReplacement = (guestPronouns && typeof guestPronouns[i] === 'string' && guestPronouns[i])
                            ? guestPronouns[i]
                            : (defaultPronouns[i] || '');

                        const replacement = i === familyCompanionSlotIndex
                            ? (personalization.familyCompanionEnabled === false ? '' : (baseReplacement ? ` và ${baseReplacement}` : ''))
                            : baseReplacement;

                        renderedBody = renderedBody.split(placeholder).join(replacement);
                    }
                    bodyEl.innerHTML = renderedBody.replace(/\n/g, '<br>');
                }
            }
        }
        set('#invitation-closing', invitationContext.closing);

        // ---- Reception (Mời Tiệc) ----
        if (c.reception) {
            const r = c.reception;
            set('#reception-title', r.section_title);
            set('#reception-subtitle', r.section_subtitle);
            // Bride side
            set('#reception-bride-title', r.bride_side?.title);
            set('#reception-bride-host', r.bride_side?.host);
            set('#reception-bride-date', r.bride_side?.date);
            set('#reception-bride-time', r.bride_side?.time);
            set('#reception-bride-location', r.bride_side?.location);
            set('#reception-bride-address', r.bride_side?.address);
            setHref('#reception-bride-map', r.bride_side?.map_url);
            // Groom side
            set('#reception-groom-title', r.groom_side?.title);
            set('#reception-groom-host', r.groom_side?.host);
            set('#reception-groom-date', r.groom_side?.date);
            set('#reception-groom-time', r.groom_side?.time);
            set('#reception-groom-location', r.groom_side?.location);
            set('#reception-groom-address', r.groom_side?.address);
            setHref('#reception-groom-map', r.groom_side?.map_url);
            // Font sizes from wedding.json
            const fs = r.fontsize || {};
            const applyFont = (val, sel) => {
                if (!val) return;
                document.querySelectorAll(sel).forEach(el => el.style.fontSize = val);
            };
            applyFont(fs.card_title, '.reception-card-title');
            applyFont(fs.card_host, '.reception-card-host');
            applyFont(fs.card_date, '.reception-card-date');
            applyFont(fs.card_time, '.reception-card-time');
            applyFont(fs.card_location, '.reception-card-location');
            applyFont(fs.card_address, '.reception-card-address');
        }

        // ---- Wedding date fields ----
        $$('[data-cfg="wedding.day"]').forEach(el => el && (el.textContent = c.wedding?.day));
        $$('[data-cfg="wedding.month"]').forEach(el => el && (el.textContent = `Tháng\n${c.wedding?.month}`));
        $$('[data-cfg="wedding.year"]').forEach(el => el && (el.textContent = `Năm\n${c.wedding?.year}`));
        $$('[data-cfg="wedding.lunar_date"]').forEach(el => el && (el.textContent = c.wedding?.lunar_date));

        // ---- Ceremony ----
        set('#vu-quy-title', c.ceremony?.vu_quy?.title);
        set('#vu-quy-time', c.ceremony?.vu_quy?.time);
        set('#vu-quy-location', c.ceremony?.vu_quy?.location);
        set('#vu-quy-address', c.ceremony?.vu_quy?.address);
        setHref('#vu-quy-map-btn', c.ceremony?.vu_quy?.map_url);
        set('#vu-quy-map-label', c.ceremony?.vu_quy?.map_label);

        set('#thanh-hon-title', c.ceremony?.thanh_hon?.title);
        set('#thanh-hon-time', c.ceremony?.thanh_hon?.time);
        set('#thanh-hon-location', c.ceremony?.thanh_hon?.location);
        set('#thanh-hon-address', c.ceremony?.thanh_hon?.address);
        setHref('#thanh-hon-map-btn', c.ceremony?.thanh_hon?.map_url);
        set('#thanh-hon-map-label', c.ceremony?.thanh_hon?.map_label);

        // ---- Ceremony map sizing + button positions ----
        if (c.ceremony_map) {
            const cm = c.ceremony_map;
            if (cm.height) {
                document.querySelectorAll('.ceremony-map-section').forEach(el => el.style.minHeight = cm.height);
            }
            // Overlay button positions (same mechanism as hero overlays)
            applyPos('#vu-quy-map-btn', cm.vu_quy_btn_pos);
            applyPos('#thanh-hon-map-btn', cm.thanh_hon_btn_pos);
        }

        // ---- Music ----
        const audio = $('#bg-audio');
        const musicBtn = $('#music-btn');
        if (audio && c.music?.src) {
            audio.src = c.music.src;
            audio.load();
        }
        if (musicBtn && c.music?.title) {
            musicBtn.title = c.music.title;
        }

        // ---- Gallery photos ----
        // Priority: W.GALLERY_DATA (from hero_gallery.json) > W.CFG.gallery (legacy from wedding.json)
        const galleryPhotos = W.GALLERY_DATA?.photos?.length
            ? W.GALLERY_DATA.photos
            : c.gallery?.photos?.length
                ? c.gallery.photos
                : null;
        if (galleryPhotos) {
            rebuildGallery(galleryPhotos);
        }

        // ---- Gallery sizes ----
        // Priority: W.GALLERY_DATA.sizes (from hero_gallery.json) > W.CFG.gallery_sizes (legacy from wedding.json)
        const gallerySizes = W.GALLERY_DATA?.sizes || c.gallery_sizes;
        if (gallerySizes) {
            const gs = gallerySizes;
            const root = document.documentElement;
            // Main image width (height:auto set in CSS — aspect ratio preserved)
            if (gs.main_img_width) {
                document.querySelectorAll('.gallery-main-img').forEach(el => {
                    el.style.width = gs.main_img_width;
                    el.style.height = 'auto';
                });
            }
            // Thumbnail size
            if (gs.thumb_size) {
                document.querySelectorAll('.gallery-thumb').forEach(el => {
                    el.style.width = gs.thumb_size;
                    el.style.height = gs.thumb_size;
                });
            }
            // Nav button size
            if (gs.nav_btn_size) {
                document.querySelectorAll('.gallery-nav').forEach(el => {
                    el.style.width = gs.nav_btn_size;
                    el.style.height = gs.nav_btn_size;
                });
            }
            // Nav icon size
            if (gs.nav_icon_size) {
                document.querySelectorAll('.gallery-nav svg').forEach(el => {
                    el.style.width = gs.nav_icon_size;
                    el.style.height = gs.nav_icon_size;
                });
            }
        }

        // ---- RSVP ----
        set('#rsvp-title', c.rsvp?.title);
        set('#rsvp-subtitle', c.rsvp?.subtitle);
        const rsvpSuccessMsg = $('#rsvp-success p');
        if (rsvpSuccessMsg && c.rsvp?.success_message) {
            rsvpSuccessMsg.innerHTML = c.rsvp.success_message.replace(/\n/g, '<br>');
        }

        // ---- Gifts ----
        set('#gifts-title', c.gifts?.title);
        set('#gifts-subtitle', c.gifts?.subtitle);
        // Groom gift popup
        set('#gift-popup-groom-name', c.gifts?.groom?.account_name);
        set('#gift-popup-groom-bank', c.gifts?.groom?.bank);
        set('#gift-popup-groom-account', c.gifts?.groom?.account);
        // Bride gift popup
        set('#gift-popup-bride-name', c.gifts?.bride?.account_name);
        set('#gift-popup-bride-bank', c.gifts?.bride?.bank);
        set('#gift-popup-bride-account', c.gifts?.bride?.account);

        // ---- Footer ----
        set('#footer-tagline', c.footer?.tagline);
        set('#footer-credit', c.footer?.credit);

        // ---- Typography (from wedding.json typography section) ----
        if (c.typography) {
            const t = c.typography;
            const root = document.documentElement.style;
            // Map config keys to CSS custom properties and specific selectors
            const applyFont = (val, ...sels) => {
                if (!val) return;
                sels.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        el.style.fontSize = val;
                    });
                });
            };
            applyFont(t.hero_name, '.hero-name-top', '.hero-name-bottom');
            applyFont(t.hero_overlay_label, '.hero-overlay-label');
            applyFont(t.hero_overlay_event, '.hero-overlay-event');
            applyFont(t.hero_overlay_date, '.hero-overlay-date');
            applyFont(t.section_title, '.section-title');
            applyFont(t.section_subtitle, '.section-subtitle');
            applyFont(t.invitation_title, '#invitation-title');
            applyFont(t.invitation_body, '#invitation-body');
            applyFont(t.invitation_closing, '#invitation-closing');
            applyFont(t.host_role, '.host-role');
            applyFont(t.host_name, '.host-name');
            applyFont(t.ceremony_title, '.ceremony-block-title');
            applyFont(t.ceremony_time, '.ceremony-block-time');
            applyFont(t.ceremony_date_num, '.ceremony-date-num');
            applyFont(t.ceremony_date_label, '.ceremony-date-month');
            applyFont(t.lunar_date, '.ceremony-lunar-date');
            applyFont(t.countdown_num, '.cd-num');
            applyFont(t.countdown_label, '.cd-label');
            applyFont(t.gift_name, '.gift-person-name');
            applyFont(t.gift_bank_info, '.gift-bank-info');
            applyFont(t.footer_script, '.footer-script');
            applyFont(t.footer_tagline, '#footer-couple', '#footer-credit');
        }

        // ---- Update CONFIG.weddingDate for countdown ----
        if (c.wedding?.date_iso) {
            CONFIG.weddingDate = new Date(c.wedding.date_iso);
        }

        // ---- Update page title based on guest personalization ----
        updatePageTitle(personalization);
    }

    // Rebuild gallery DOM from config photos array.
    // NOTE: do NOT call initGallery() here — it is called once from DOMContentLoaded
    // after loadConfig() has already run rebuildGallery. Calling it here would create
    // multiple autoplay timers and cause erratic navigation.
    function rebuildGallery(photos) {
        const thumbsWrap = $('#gallery-thumbs');
        const imgWrap = $('#gallery-img-wrap');
        if (!thumbsWrap || !imgWrap) return;

        thumbsWrap.innerHTML = '';
        imgWrap.innerHTML = '';

        photos.forEach((p, i) => {
            const safeSrc = isSafeMediaSrc(p && p.src) ? p.src : '';
            const safeAlt = typeof p?.alt === 'string' ? p.alt : '';

            const thumb = document.createElement('img');
            thumb.src = safeSrc;
            thumb.alt = safeAlt;
            thumb.className = `gallery-thumb${i === 0 ? ' active' : ''}`;
            thumb.dataset.idx = String(i);
            thumb.setAttribute('role', 'tab');
            thumb.setAttribute('aria-selected', String(i === 0));
            thumb.loading = 'lazy';
            thumb.decoding = 'async';
            thumbsWrap.appendChild(thumb);

            const main = document.createElement('img');
            main.src = safeSrc;
            main.alt = safeAlt;
            main.className = 'gallery-main-img';
            main.loading = i === 0 ? 'eager' : 'lazy';
            main.decoding = 'async';
            main.fetchPriority = i === 0 ? 'high' : 'low';
            imgWrap.appendChild(main);
        });

        if (typeof W.prepareGalleryRevealState === 'function') W.prepareGalleryRevealState();
    }


    W.getInvitationPersonalization = getInvitationPersonalization;
    W.loadConfig = loadConfig;
    W.applyConfig = applyConfig;
    W.rebuildGallery = rebuildGallery;

    /* =============================================================
       INIT ALL
    ============================================================= */
    document.addEventListener('DOMContentLoaded', async () => {
        await W.loadConfig();

        const inits = W._inits.slice().sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.seq - b.seq;
        });

        for (let i = 0; i < inits.length; i++) {
            inits[i].fn();
        }
    });
})();
