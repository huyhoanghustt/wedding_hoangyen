; (function () {
    'use strict';

    var W = window.__WeddingApp;
    if (!W) return;

    var $ = W.$;
    var $$ = W.$$;
    var showToast = W.showToast;
    var copyToClipboard = W.copyToClipboard;
    var prefersReducedMotion = W.prefersReducedMotion;
    var CONFIG = W.CONFIG;

    /* =============================================================
       4. MUSIC PLAYER
    ============================================================= */
    function initMusicPlayer() {
        const btn = $('#music-btn');
        const audio = $('#bg-audio');
        if (!btn || !audio) return;

        let playing = false;

        function togglePlay() {
            if (playing) {
                audio.pause();
                btn.classList.remove('playing');
                btn.setAttribute('title', 'Phát nhạc nền');
                playing = false;
            } else {
                audio.play().then(() => {
                    btn.classList.add('playing');
                    btn.setAttribute('title', 'Dừng nhạc');
                    playing = true;
                }).catch(() => {
                    showToast('🔇 Trình duyệt chặn tự động phát nhạc. Nhấn để phát.');
                });
            }
        }

        btn.addEventListener('click', togglePlay);

        // Auto-play on first user interaction with page
        const autoPlayOnce = () => {
            if (!playing) {
                audio.play().then(() => {
                    btn.classList.add('playing');
                    btn.setAttribute('title', 'Dừng nhạc');
                    playing = true;
                }).catch(() => { });
            }
            document.removeEventListener('touchstart', autoPlayOnce);
            document.removeEventListener('click', autoPlayOnce);
        };
        document.addEventListener('touchstart', autoPlayOnce, { once: true });
        document.addEventListener('click', autoPlayOnce, { once: true });
    }

    /* =============================================================
       5. FLOATING HEARTS RAIN
    ============================================================= */
    function initHeartsRain() {
        if (prefersReducedMotion()) return;

        const canvas = $('#hearts-canvas');
        if (!canvas) return;

        const EMOJIS = ['❤', '💗', '💓'];
        let heartCount = 0;
        let active = true;

        function createHeart() {
            if (heartCount >= 15) return;
            const el = document.createElement('span');
            el.classList.add('heart-rain-item');
            el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

            const size = 10 + Math.random() * 12;
            const left = Math.random() * 98;
            const duration = 6 + Math.random() * 8;
            const delay = Math.random() * 3;

            el.style.cssText = `
        left: ${left}%;
        font-size: ${size}px;
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
        color: ${Math.random() > 0.6 ? '#e63946' : '#ff6b9d'};
      `;

            canvas.appendChild(el);
            heartCount++;

            // Remove after animation
            el.addEventListener('animationend', () => {
                el.remove();
                heartCount--;
            }, { once: true });
        }

        // Create hearts continuously
        const timer = setInterval(() => {
            if (active) createHeart();
        }, CONFIG.heartRainInterval);

        // Initial burst
        for (let i = 0; i < 8; i++) {
            setTimeout(createHeart, i * 80);
        }

        // Pause when tab is hidden to save CPU
        document.addEventListener('visibilitychange', () => {
            active = !document.hidden;
        });
    }

    /* =============================================================
       8. BLESSINGS SYSTEM
    ============================================================= */
    const DEMO_BLESSINGS = [
        { name: 'Tuấn Anh', text: 'Đồng tâm đồng lòng, xây dựng tổ ấm thịnh vượng!' },
        { name: 'Hoàng', text: '💕 Mãi mãi hạnh phúc bên nhau!' },
        { name: 'Minh', text: '🌸 Tân hôn hạnh phúc, trăm năm bên nhau!' },
        { name: 'Đức', text: '❤️ Chúc hai bạn trăm năm hạnh phúc!' },
        { name: 'Hoàng', text: '💖 Chúc hai bạn trăm năm hòa hợp, hạnh phúc!' },
        { name: 'Lan', text: '✨ Hạnh phúc mãi mãi nhé!' },
        { name: 'Phong', text: '💕 Hai bạn xứng đôi vừa lứa!' },
        { name: 'Thảo', text: '🌸 Chúc mừng đám cưới, hạnh phúc trăm năm!' },
    ];

    let heartCountVal = 0;
    let blessingQueue = [];
    let _blessingFetchInProgress = false;
    let _lastBlessingFetchTime = 0;
    const BLESSING_FETCH_COOLDOWN_MS = 5000;
    var _blessingGuestName = null; // null = not yet asked, '' = anonymous, 'Name' = known

    const BLESSING_BUBBLE_CONFIG = Object.freeze({
        maxActive: 8,
        emitIntervalMs: 1450,
        originLeftMinPercent: 14,
        originLeftMaxPercent: 86,
        driftMidRange: 0.18,
        driftXRange: 0.42,
        liftMinRem: 1.35,
        liftMaxRem: 2.08,
        startRiseMinRem: 0.02,
        startRiseMaxRem: 0.1,
        tiltRangeDeg: 5,
        durationMinMs: 4600,
        durationMaxMs: 6600,
        delayMaxMs: 140,
        alphaMin: 0.83,
        alphaMax: 0.96,
    });

    /**
     * Resolve the guest name for a blessing.
     * - Known guest (token page): use guestName from personalization
     * - Anonymous guest with stored name: use sessionStorage
     * - Anonymous guest first time: show name dialog
     * @returns {Promise<string>} The guest name (or empty string for anonymous)
     */
    function resolveGuestName() {
        // Case 1: Known guest via token personalization
        var personalization = W.getInvitationPersonalization();
        if (personalization.guestName) {
            return Promise.resolve(personalization.guestName);
        }

        // Case 2: Previously entered name this session
        if (_blessingGuestName !== null) {
            return Promise.resolve(_blessingGuestName);
        }

        // Case 3: Show name dialog
        return showNameDialog();
    }

    /**
     * Show a dialog asking the guest for their name.
     * Returns a Promise that resolves with the name (or empty string for anonymous).
     */
    function showNameDialog() {
        return new Promise(function (resolve) {
            var overlay = $('#blessing-name-dialog');
            var titleEl = $('#blessing-name-dialog-title');
            var anonymousLabel = $('#blessing-name-anonymous-label');
            var nameInput = $('#blessing-name-input');
            var submitBtn = $('#blessing-name-submit');
            var closeBtn = overlay ? overlay.querySelector('.blessing-name-dialog-close') : null;
            var radioNamed = overlay ? overlay.querySelector('input[value="named"]') : null;
            var radioAnon = overlay ? overlay.querySelector('input[value="anonymous"]') : null;

            if (!overlay) {
                // Fallback: no dialog HTML → resolve as anonymous
                _blessingGuestName = '';
                resolve('');
                return;
            }

            // Populate text from config (with hardcoded defaults)
            var dialogCfg = (W.CFG.blessings && W.CFG.blessings.name_dialog) || {};
            titleEl.textContent = dialogCfg.title || 'Hãy cho vợ chồng mình biết tên của bạn';
            anonymousLabel.textContent = dialogCfg.anonymous_label || 'Điều đó không cần thiết, mình chỉ muốn chúc mừng hạnh phúc hai vợ chồng một cách tự nhiên nhất';
            nameInput.placeholder = dialogCfg.name_placeholder || 'Nhập tên của bạn...';
            submitBtn.textContent = dialogCfg.submit_label || 'Gửi lời chúc';

            // Reset state
            if (radioNamed) radioNamed.checked = true;
            nameInput.value = '';
            nameInput.disabled = false;

            // Show overlay
            overlay.classList.add('open');
            setTimeout(function () { nameInput.focus(); }, 100);

            var resolved = false;

            function cleanup() {
                overlay.classList.remove('open');
                submitBtn.removeEventListener('click', onSubmit);
                if (closeBtn) closeBtn.removeEventListener('click', onClose);
                overlay.removeEventListener('click', onOverlayClick);
                if (radioNamed) radioNamed.removeEventListener('change', onRadioChange);
                if (radioAnon) radioAnon.removeEventListener('change', onRadioChange);
            }

            function finalize(name) {
                if (resolved) return;
                resolved = true;
                _blessingGuestName = name;
                cleanup();
                resolve(name);
            }

            function onSubmit() {
                if (radioAnon && radioAnon.checked) {
                    finalize('');
                } else {
                    var name = nameInput.value.trim();
                    finalize(name); // empty name if they didn't type anything
                }
            }

            function onClose() {
                finalize('');
            }

            function onOverlayClick(e) {
                if (e.target === overlay) {
                    finalize('');
                }
            }

            function onRadioChange() {
                if (radioNamed && radioNamed.checked) {
                    nameInput.disabled = false;
                    nameInput.focus();
                } else {
                    nameInput.disabled = true;
                }
            }

            submitBtn.addEventListener('click', onSubmit);
            if (closeBtn) closeBtn.addEventListener('click', onClose);
            overlay.addEventListener('click', onOverlayClick);
            if (radioNamed) radioNamed.addEventListener('change', onRadioChange);
            if (radioAnon) radioAnon.addEventListener('change', onRadioChange);
        });
    }

    function initBlessings() {
        const input = $('#blessing-input');
        const sendBtn = $('#btn-send-blessing');
        const msgBox = $('#blessing-messages');
        const heartBtn = $('#btn-shoot-hearts');
        const giftBtn = $('#btn-gift');
        const badge = $('#heart-count-badge');

        if (!input || !sendBtn || !msgBox) return;

        // Load heart count
        fetchHeartCount();

        // Load existing blessings
        fetchBlessings();

        // Periodically emit blessing bubbles while respecting active cap
        let blessingsActive = !document.hidden;
        document.addEventListener('visibilitychange', () => {
            blessingsActive = !document.hidden;
            if (blessingsActive && blessingQueue.length === 0) {
                fetchBlessings();
            }
        });

        setInterval(() => {
            if (!blessingsActive) return;
            if (blessingQueue.length === 0) {
                fetchBlessings();
                return;
            }
            if (countActiveBlessingBubbles(msgBox) >= BLESSING_BUBBLE_CONFIG.maxActive) return;
            showNextBlessing(msgBox);
        }, BLESSING_BUBBLE_CONFIG.emitIntervalMs);

        // Show demo blessings initially
        DEMO_BLESSINGS.forEach((b, i) => {
            setTimeout(() => addBlessingToQueue(b), i * 2500 + 1000);
        });

        // Send blessing
        function sendBlessing() {
            var text = input.value.trim();
            if (!text) return;
            input.value = '';

            resolveGuestName().then(function (name) {
                // Extract source from personalization
                var personalization = window.__INVITATION_PERSONALIZATION__;
                var source = '__index__';  // Default source

                if (personalization && personalization.token) {
                    source = personalization.token;
                }

                fetch('/api/blessings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name || '', text: text, source: source }),
                })
                    .then(function (r) { return r.json(); })
                    .then(function () {
                        var displayName = name || 'Bạn';
                        showImmediateBlessing({ name: displayName, text: text }, msgBox);
                        showToast('💌 Đã gửi lời chúc!');
                    })
                    .catch(function () {
                        var displayName = name || 'Bạn';
                        showImmediateBlessing({ name: displayName, text: text }, msgBox);
                        showToast('💌 Đã gửi lời chúc!');
                    });
            });
        }

        sendBtn.addEventListener('click', sendBlessing);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendBlessing();
        });

        // Shoot hearts button
        if (heartBtn) {
            heartBtn.addEventListener('click', () => {
                shootHearts(12);
                incrementHeartCount();
                if (badge) badge.textContent = heartCountVal;
            });
        }

        // Gift button → open gift popup
        if (giftBtn) {
            giftBtn.addEventListener('click', () => {
                openGiftPopup();
            });
        }
    }

    function addBlessingToQueue(blessing) {
        blessingQueue.push(blessing);
    }

    function countActiveBlessingBubbles(msgBox) {
        return $$('.blessing-msg', msgBox).length;
    }

    function randomInRange(min, max) {
        return min + Math.random() * (max - min);
    }

    function setBlessingBubbleMotionVars(el) {
        const xMid = 0;
        const xOffset = 0;
        const yLift = randomInRange(BLESSING_BUBBLE_CONFIG.liftMinRem, BLESSING_BUBBLE_CONFIG.liftMaxRem);
        const startRise = 0;
        const tilt = 0;
        const durationMs = Math.round(randomInRange(BLESSING_BUBBLE_CONFIG.durationMinMs, BLESSING_BUBBLE_CONFIG.durationMaxMs));
        const delayMs = Math.round(randomInRange(0, BLESSING_BUBBLE_CONFIG.delayMaxMs));
        const alpha = randomInRange(BLESSING_BUBBLE_CONFIG.alphaMin, BLESSING_BUBBLE_CONFIG.alphaMax);
        const originXPercent = 2;

        el.style.setProperty('--bless-origin-x', `${originXPercent.toFixed(2)}%`);
        el.style.setProperty('--bless-x-mid', `${xMid.toFixed(3)}rem`);
        el.style.setProperty('--bless-x-offset', `${xOffset.toFixed(3)}rem`);
        el.style.setProperty('--bless-y-lift', `${yLift.toFixed(3)}rem`);
        el.style.setProperty('--bless-start-rise', `${startRise.toFixed(3)}rem`);
        el.style.setProperty('--bless-tilt', `${tilt.toFixed(2)}deg`);
        el.style.setProperty('--bless-duration', `${durationMs}ms`);
        el.style.setProperty('--bless-delay', `${delayMs}ms`);
        el.style.setProperty('--bless-alpha', alpha.toFixed(2));
    }

    function showNextBlessing(msgBox) {
        if (blessingQueue.length === 0) return false;
        if (countActiveBlessingBubbles(msgBox) >= BLESSING_BUBBLE_CONFIG.maxActive) return false;

        const blessing = blessingQueue.shift();
        if (!blessing) return false;

        const el = document.createElement('div');
        el.className = prefersReducedMotion() ? 'blessing-msg blessing-msg--reduced' : 'blessing-msg';
        el.innerHTML = `<strong>${escapeHtml(blessing.name)}:</strong> ${escapeHtml(blessing.text)}`;

        setBlessingBubbleMotionVars(el);
        msgBox.appendChild(el);

        el.addEventListener('animationend', () => {
            el.remove();
        }, { once: true });

        return true;
    }

    function showImmediateBlessing(blessing, msgBox) {
        if (!blessing || !msgBox) return;

        const el = document.createElement('div');
        el.className = prefersReducedMotion() ? 'blessing-msg blessing-msg--reduced' : 'blessing-msg';
        el.innerHTML = `<strong>${escapeHtml(blessing.name)}:</strong> ${escapeHtml(blessing.text)}`;

        setBlessingBubbleMotionVars(el);
        msgBox.appendChild(el);

        el.addEventListener('animationend', () => {
            el.remove();
        }, { once: true });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function sampleBlessingsWithDecay(allBlessings, sampleSize, decayRate) {
        const sorted = [...allBlessings].sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });

        const targetSize = Math.min(sampleSize, sorted.length);
        const sampled = [];
        const remaining = sorted.map((blessing, i) => ({
            blessing,
            probability: Math.pow(1 - decayRate, i),
        }));

        let attempts = 0;
        const maxAttempts = targetSize * 3;

        while (sampled.length < targetSize && remaining.length > 0 && attempts < maxAttempts) {
            attempts++;
            for (let i = remaining.length - 1; i >= 0 && sampled.length < targetSize; i--) {
                if (Math.random() < remaining[i].probability) {
                    sampled.push(remaining[i].blessing);
                    remaining.splice(i, 1);
                }
            }
        }

        while (sampled.length < targetSize && remaining.length > 0) {
            sampled.push(remaining.shift().blessing);
        }

        for (let i = sampled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sampled[i], sampled[j]] = [sampled[j], sampled[i]];
        }

        return sampled;
    }

    async function fetchBlessings() {
        if (_blessingFetchInProgress) return;

        const now = Date.now();
        if (now - _lastBlessingFetchTime < BLESSING_FETCH_COOLDOWN_MS) return;

        _blessingFetchInProgress = true;
        _lastBlessingFetchTime = now;

        try {
            const configuredLimit = parseInt(String(W.CFG.blessings?.recent_fetch_limit ?? ''), 10);
            const recentFetchLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 50;
            const res = await fetch(`/api/blessings?limit=${recentFetchLimit}`);
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data) && data.length) {
                const decayRate = parseFloat(String(W.CFG.blessings?.decay_rate ?? '')) || 0.05;
                const sampleSize = Math.min(recentFetchLimit, data.length);
                const sampled = sampleBlessingsWithDecay(data, sampleSize, decayRate);

                blessingQueue = sampled;
            }
        } catch (_) { }
        finally {
            _blessingFetchInProgress = false;
        }
    }

    async function fetchHeartCount() {
        try {
            const res = await fetch('/api/hearts');
            if (!res.ok) return;
            const data = await res.json();
            heartCountVal = data.count || 0;
            const badge = $('#heart-count-badge');
            if (badge) badge.textContent = heartCountVal > 99 ? '99+' : heartCountVal;
        } catch (_) { }
    }

    async function incrementHeartCount() {
        try {
            const res = await fetch('/api/hearts', { method: 'POST' });
            if (!res.ok) return;
            const data = await res.json();
            heartCountVal = data.count || heartCountVal + 1;
            const badge = $('#heart-count-badge');
            if (badge) badge.textContent = heartCountVal > 99 ? '99+' : heartCountVal;
        } catch (_) {
            heartCountVal++;
        }
    }

    /* =============================================================
       9. SHOOT HEARTS ANIMATION
    ============================================================= */
    function shootHearts(count = 10) {
        const heartBtn = $('#btn-shoot-hearts');
        const origin = heartBtn?.getBoundingClientRect() ?? { left: window.innerWidth / 2, top: window.innerHeight - 80 };

        const cx = (origin.left + (origin.right || origin.left + 80)) / 2;
        const cy = (origin.top + (origin.bottom || origin.top + 36)) / 2;

        const EMOJIS = ['♥', '❤', '💕', '💗', '💓', '💞', '💖'];

        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const el = document.createElement('span');
                el.className = 'heart-burst';
                el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

                const angle = (Math.random() * 340) - 170;
                const dist = 80 + Math.random() * 140;
                const tx = Math.cos((angle * Math.PI) / 180) * dist;
                const ty = Math.sin((angle * Math.PI) / 180) * dist - 40;

                el.style.cssText = `
          left: ${cx}px;
          top: ${cy}px;
          --tx: ${tx}px;
          --ty: ${ty}px;
          font-size: ${14 + Math.random() * 14}px;
          color: ${['#e63946', '#ff6b9d', '#ff4757', '#ff9fb3'][Math.floor(Math.random() * 4)]};
        `;

                document.body.appendChild(el);
                el.addEventListener('animationend', () => el.remove(), { once: true });
            }, i * 60);
        }
    }

    /* =============================================================
       10. FOOTER ACTIONS
    ============================================================= */
    window.shareWebsite = function () {
        if (navigator.share) {
            navigator.share({
                title: 'Thiệp Cưới - Minh Tuấn & Hoàng Anh',
                text: 'Mời bạn đến dự đám cưới của chúng tôi ngày 20/12/2026 🎉',
                url: window.location.href,
            }).catch(() => { });
        } else {
            copyLink();
        }
    };

    window.copyLink = function () {
        copyToClipboard(window.location.href)
            .then((success) => {
                if (success) {
                    showToast('📋 Đã sao chép đường dẫn!');
                } else {
                    showToast('📋 ' + window.location.href);
                }
            });
    };

    /* =============================================================
       11. AUTO-SCROLL — Slow idle scroll, stops on first user interaction
    ============================================================= */
    function initAutoScroll() {
        const SCROLL_SPEED = 0.6;   // px per frame
        const IDLE_DELAY = 3000;  // ms before auto-scroll starts
        let autoScrollActive = false;
        let userInteracted = false;
        let rafId = null;
        let idleTimer = null;
        let lastScrollY = 0;

        function startAutoScroll() {
            if (userInteracted || autoScrollActive) return;
            autoScrollActive = true;
            function scrollFrame() {
                if (userInteracted) {
                    autoScrollActive = false;
                    return;
                }
                // Stop at bottom of page
                const maxY = document.documentElement.scrollHeight - window.innerHeight;
                if (window.scrollY >= maxY) {
                    autoScrollActive = false;
                    return;
                }
                window.scrollBy(0, SCROLL_SPEED);
                rafId = requestAnimationFrame(scrollFrame);
            }
            rafId = requestAnimationFrame(scrollFrame);
        }

        function stopAutoScrollForever() {
            if (userInteracted) return;
            userInteracted = true;
            autoScrollActive = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (idleTimer) clearTimeout(idleTimer);
            // Remove all listeners
            document.removeEventListener('touchstart', stopAutoScrollForever, { capture: true });
            document.removeEventListener('touchmove', stopAutoScrollForever, { capture: true });
            document.removeEventListener('click', stopAutoScrollForever, { capture: true });
            document.removeEventListener('keydown', stopAutoScrollForever, { capture: true });
            document.removeEventListener('wheel', stopAutoScrollForever, { capture: true });
            document.removeEventListener('scroll', onScroll);
        }

        function onScroll() {
            // If user is manually scrolling (scroll position changed more than auto-scroll would),
            // treat it as user interaction
            if (Math.abs(window.scrollY - lastScrollY) > SCROLL_SPEED * 3) {
                stopAutoScrollForever();
            }
            lastScrollY = window.scrollY;
        }

        // Add interaction listeners (capture phase to catch before anything else)
        document.addEventListener('touchstart', stopAutoScrollForever, { capture: true, passive: true });
        document.addEventListener('touchmove', stopAutoScrollForever, { capture: true, passive: true });
        document.addEventListener('click', stopAutoScrollForever, { capture: true });
        document.addEventListener('keydown', stopAutoScrollForever, { capture: true });
        document.addEventListener('wheel', stopAutoScrollForever, { capture: true, passive: true });
        document.addEventListener('scroll', onScroll, { passive: true });

        // Start auto-scroll after idle delay
        idleTimer = setTimeout(startAutoScroll, IDLE_DELAY);
    }

    /* =============================================================
       12. SCROLL-TO SECTION on toolbar gift button
    ============================================================= */
    function initSmoothScroll() {
        // Any anchor links within the page
        $$('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                const target = $(a.getAttribute('href'));
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }


    W.shootHearts = shootHearts;
    W.shareWebsite = window.shareWebsite;
    W.copyLink = window.copyLink;

    W.register('musicPlayer', initMusicPlayer, 40);
    W.register('heartsRain', initHeartsRain, 50);
    W.register('blessings', initBlessings, 80);
    W.register('smoothScroll', initSmoothScroll, 120);
    W.register('autoScroll', initAutoScroll, 130);
})();
