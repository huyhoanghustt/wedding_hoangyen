; (function () {
    'use strict';

    var W = window.__WeddingApp;
    if (!W) return;

    var $ = W.$;
    var $$ = W.$$;
    var showToast = W.showToast;
    var prefersReducedMotion = W.prefersReducedMotion;
    var CONFIG = W.CONFIG;

    let galleryRevealHasEntered = false;

    function prepareGalleryRevealState() {
        const gallerySection = $('#gallery');
        if (!gallerySection) return;

        // Disable thumbnail reveal effects to avoid heavy per-thumb animation work.
        gallerySection.classList.remove('gallery-reveal-pending');
        gallerySection.classList.add('gallery-revealed');
    }

    function revealGalleryOnFirstEntry() {
        if (galleryRevealHasEntered) return;
        galleryRevealHasEntered = true;
        prepareGalleryRevealState();
    }

    /* =============================================================
       6. GALLERY — Touch/Swipe + Click Navigation
    ============================================================= */
    let galleryInitialized = false;

    function initGallery() {
        if (galleryInitialized) return;

        const wrap = $('#gallery-img-wrap');
        const thumbsWrap = $('#gallery-thumbs');
        const mainEl = $('#gallery-main');
        if (!wrap || !thumbsWrap || !mainEl) return;

        const baseThumbs = Array.from($$('.gallery-thumb', thumbsWrap));
        const prevBtn = $('#gallery-prev');
        const nextBtn = $('#gallery-next');
        const fsBtn = $('#gallery-fullscreen-btn');
        const total = baseThumbs.length;
        if (!total) return;

        const realSlides = Array.from(wrap.querySelectorAll('.gallery-main-img'));
        if (!realSlides.length) return;

        const slideSources = realSlides.map((img) => ({
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
        }));

        const THUMB_RECENTER_DELAY_MS = 420;

        let logicalIndex = 0;
        let physicalMainIndex = total > 1 ? 1 : 0;
        let pendingSnap = null;
        let isAnimating = false;
        let autoplayTimer = null;
        let isDragging = false;
        let startX = 0;
        let currentX = 0;

        let displayedThumbs = [];
        let thumbCurrentPhysicalIndex = total > 1 ? total : 0;
        let thumbSnapTimer = null;

        function normalizeIndex(idx) {
            return ((idx % total) + total) % total;
        }

        function buildLoopedMainTrackState() {
            if (total <= 1) {
                physicalMainIndex = 0;
                return;
            }

            realSlides.forEach((slide, index) => {
                slide.dataset.galleryLogicalIndex = String(index);
                slide.dataset.galleryClone = 'false';
            });

            const firstClone = realSlides[0].cloneNode(true);
            const lastClone = realSlides[total - 1].cloneNode(true);
            firstClone.dataset.galleryClone = 'true';
            lastClone.dataset.galleryClone = 'true';
            firstClone.dataset.galleryLogicalIndex = '0';
            lastClone.dataset.galleryLogicalIndex = String(total - 1);

            wrap.innerHTML = '';
            wrap.appendChild(lastClone);
            realSlides.forEach((slide) => wrap.appendChild(slide));
            wrap.appendChild(firstClone);
            physicalMainIndex = 1;
        }

        function getThumbLogicalIndex(thumb) {
            return Number(thumb.dataset.logicalIndex ?? thumb.dataset.idx ?? 0);
        }

        function recenterThumbToMiddleIfNeeded() {
            if (total <= 1 || displayedThumbs.length === 0) return;

            let recenteredPhysical = thumbCurrentPhysicalIndex;
            if (recenteredPhysical < total) {
                recenteredPhysical += total;
            } else if (recenteredPhysical >= total * 2) {
                recenteredPhysical -= total;
            }

            if (recenteredPhysical === thumbCurrentPhysicalIndex) return;

            thumbCurrentPhysicalIndex = recenteredPhysical;
            const thumb = displayedThumbs[recenteredPhysical];
            if (!thumb) return;

            const targetLeft = thumb.offsetLeft - (thumbsWrap.clientWidth - thumb.clientWidth) / 2;
            const maxScrollLeft = Math.max(0, thumbsWrap.scrollWidth - thumbsWrap.clientWidth);
            const clampedLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));
            thumbsWrap.scrollTo({ left: clampedLeft, behavior: 'auto' });
        }

        function centerThumbPhysicalIndex(targetPhysicalIndex, options = {}) {
            if (displayedThumbs.length === 0) return;

            const smooth = options.smooth !== false;
            const shouldRecenter = options.recenter !== false;
            const thumb = displayedThumbs[targetPhysicalIndex];
            if (!thumb) return;

            thumbCurrentPhysicalIndex = targetPhysicalIndex;
            const targetLeft = thumb.offsetLeft - (thumbsWrap.clientWidth - thumb.clientWidth) / 2;
            const maxScrollLeft = Math.max(0, thumbsWrap.scrollWidth - thumbsWrap.clientWidth);
            const clampedLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));
            thumbsWrap.scrollTo({ left: clampedLeft, behavior: smooth ? 'smooth' : 'auto' });

            if (thumbSnapTimer) {
                clearTimeout(thumbSnapTimer);
                thumbSnapTimer = null;
            }

            if (!shouldRecenter) return;

            if (smooth) {
                thumbSnapTimer = setTimeout(() => {
                    thumbSnapTimer = null;
                    recenterThumbToMiddleIfNeeded();
                }, THUMB_RECENTER_DELAY_MS);
                return;
            }

            recenterThumbToMiddleIfNeeded();
        }

        function buildLoopedThumbStripState() {
            baseThumbs.forEach((thumb, index) => {
                thumb.dataset.idx = String(index);
                thumb.dataset.logicalIndex = String(index);
                thumb.setAttribute('role', 'tab');
            });

            if (total <= 1) {
                thumbsWrap.classList.remove('is-loop-track');
                displayedThumbs = [...baseThumbs];
                thumbCurrentPhysicalIndex = 0;
                return;
            }

            thumbsWrap.classList.add('is-loop-track');
            const track = document.createElement('div');
            track.className = 'gallery-thumbs-track';

            for (let copyIndex = 0; copyIndex < 3; copyIndex += 1) {
                baseThumbs.forEach((thumb, logical) => {
                    const clone = thumb.cloneNode(true);
                    const physical = copyIndex * total + logical;
                    clone.dataset.idx = String(logical);
                    clone.dataset.logicalIndex = String(logical);
                    clone.dataset.thumbCopyIndex = String(copyIndex);
                    clone.dataset.thumbPhysicalIndex = String(physical);
                    clone.setAttribute('role', 'tab');
                    track.appendChild(clone);
                });
            }

            thumbsWrap.innerHTML = '';
            thumbsWrap.appendChild(track);
            displayedThumbs = Array.from(track.querySelectorAll('.gallery-thumb'));
            thumbCurrentPhysicalIndex = total;
            centerThumbPhysicalIndex(thumbCurrentPhysicalIndex, { smooth: false, recenter: false });
        }

        function applyMainTransform(targetPhysicalIndex, withTransition = true) {
            wrap.classList.toggle('is-no-transition', !withTransition);
            if (!withTransition) {
                void wrap.offsetWidth;
            }
            wrap.style.transform = `translateX(-${targetPhysicalIndex * 100}%)`;
            if (!withTransition) {
                void wrap.offsetWidth;
            }
        }

        function syncThumbActiveState() {
            displayedThumbs.forEach((thumb) => {
                const isActive = getThumbLogicalIndex(thumb) === logicalIndex;
                thumb.classList.toggle('active', isActive);
                thumb.setAttribute('aria-selected', String(isActive));
                thumb.setAttribute('tabindex', isActive ? '0' : '-1');
            });
        }

        function resolveThumbPhysicalIndex(nextLogical, prevLogical, forceInstant) {
            if (total <= 1) return 0;

            if (forceInstant) {
                return total + nextLogical;
            }

            const isBoundaryForward = prevLogical === total - 1 && nextLogical === 0;
            const isBoundaryBackward = prevLogical === 0 && nextLogical === total - 1;

            if (isBoundaryForward) {
                return thumbCurrentPhysicalIndex + 1;
            }
            if (isBoundaryBackward) {
                return thumbCurrentPhysicalIndex - 1;
            }

            const candidateIndices = [nextLogical, nextLogical + total, nextLogical + total * 2];
            return candidateIndices.reduce((best, candidate) => {
                const bestDistance = Math.abs(best - thumbCurrentPhysicalIndex);
                const nextDistance = Math.abs(candidate - thumbCurrentPhysicalIndex);
                return nextDistance < bestDistance ? candidate : best;
            }, candidateIndices[0]);
        }

        function centerThumbLoopAware(prevLogical, nextLogical, options = {}) {
            if (displayedThumbs.length === 0) return;
            const forceInstant = options.instant === true;
            const nextPhysical = resolveThumbPhysicalIndex(nextLogical, prevLogical, forceInstant);
            centerThumbPhysicalIndex(nextPhysical, { smooth: !forceInstant, recenter: total > 1 });
        }

        function syncLightboxView() {
            const lightbox = $('#gallery-lightbox');
            const lbImg = $('#gallery-lightbox-img');
            const lbCounter = $('#gallery-lightbox-counter');
            if (!lightbox || !lightbox.classList.contains('open')) return;

            const currentSlide = slideSources[logicalIndex];
            if (lbImg && currentSlide) {
                lbImg.src = currentSlide.src;
                lbImg.alt = currentSlide.alt;
            }
            if (lbCounter) lbCounter.textContent = `${logicalIndex + 1} / ${total}`;
        }

        function setLogicalIndex(nextLogical, source = 'system', options = {}) {
            const normalized = normalizeIndex(nextLogical);
            const prevLogical = logicalIndex;

            if (total <= 1) {
                logicalIndex = normalized;
                physicalMainIndex = 0;
                pendingSnap = null;
                isAnimating = false;
                applyMainTransform(0, false);
                syncThumbActiveState();
                centerThumbLoopAware(prevLogical, logicalIndex, { instant: true });
                syncLightboxView();
                return true;
            }

            const forceInstant = options.instant === true;
            const isBoundaryForward = prevLogical === total - 1 && normalized === 0;
            const isBoundaryBackward = prevLogical === 0 && normalized === total - 1;

            let targetPhysicalIndex = normalized + 1;
            pendingSnap = null;

            if (!forceInstant) {
                if (isBoundaryForward) {
                    targetPhysicalIndex = total + 1;
                    pendingSnap = 1;
                } else if (isBoundaryBackward) {
                    targetPhysicalIndex = 0;
                    pendingSnap = total;
                }
            }

            logicalIndex = normalized;
            syncThumbActiveState();
            centerThumbLoopAware(prevLogical, logicalIndex, { instant: forceInstant });
            syncLightboxView();

            if (targetPhysicalIndex === physicalMainIndex) {
                if (forceInstant) applyMainTransform(targetPhysicalIndex, false);
                isAnimating = false;
                pendingSnap = null;
                return true;
            }

            physicalMainIndex = targetPhysicalIndex;
            if (forceInstant) {
                applyMainTransform(physicalMainIndex, false);
                isAnimating = false;
                pendingSnap = null;
            } else {
                isAnimating = true;
                applyMainTransform(physicalMainIndex, true);
            }
            return true;
        }

        function handleMainTransitionEnd(e) {
            if (e.target !== wrap || e.propertyName !== 'transform') return;
            if (!isAnimating) return;

            if (pendingSnap != null) {
                physicalMainIndex = pendingSnap;
                pendingSnap = null;
                applyMainTransform(physicalMainIndex, false);
            }

            isAnimating = false;
        }

        function navigateByDelta(delta, source = 'user') {
            if (isAnimating || !total) return false;
            return setLogicalIndex(logicalIndex + delta, source);
        }

        function moveToLogical(index, source = 'user') {
            if (isAnimating || !total) return false;
            return setLogicalIndex(index, source);
        }

        let isPageVisible = !document.hidden;

        function startAutoplay() {
            stopAutoplay();
            if (total <= 1 || !isPageVisible) return;
            if (lightbox && lightbox.classList.contains('open')) return;
            autoplayTimer = setInterval(() => {
                if (isDragging || isAnimating || !isPageVisible) return;
                navigateByDelta(1, 'autoplay');
            }, CONFIG.galleryAutoplayInterval);
        }

        function stopAutoplay() {
            if (autoplayTimer) {
                clearInterval(autoplayTimer);
                autoplayTimer = null;
            }
        }

        function updateDragPreview() {
            if (!isDragging) return;
            const width = mainEl.offsetWidth || 1;
            const pct = -physicalMainIndex * 100 + ((currentX - startX) / width) * 100;
            wrap.classList.add('is-no-transition');
            wrap.style.transform = `translateX(${pct}%)`;
        }

        function endDragNavigation() {
            if (!isDragging) return;
            isDragging = false;
            const diff = currentX - startX;

            if (Math.abs(diff) <= 60) {
                applyMainTransform(physicalMainIndex, true);
                isAnimating = false;
                pendingSnap = null;
                startAutoplay();
                return;
            }

            const didNavigate = navigateByDelta(diff < 0 ? 1 : -1, 'drag');
            if (!didNavigate) {
                applyMainTransform(physicalMainIndex, true);
            }
            startAutoplay();
        }

        function bindThumbnailClicks() {
            displayedThumbs.forEach((thumb) => {
                thumb.onclick = () => {
                    stopAutoplay();
                    moveToLogical(getThumbLogicalIndex(thumb), 'thumbnail');
                    startAutoplay();
                };
            });
        }

        buildLoopedMainTrackState();
        buildLoopedThumbStripState();
        prepareGalleryRevealState();
        bindThumbnailClicks();
        wrap.addEventListener('transitionend', handleMainTransitionEnd);
        setLogicalIndex(0, 'init', { instant: true });

        if (prevBtn) prevBtn.onclick = () => { stopAutoplay(); navigateByDelta(-1, 'button-prev'); startAutoplay(); };
        if (nextBtn) nextBtn.onclick = () => { stopAutoplay(); navigateByDelta(1, 'button-next'); startAutoplay(); };

        mainEl.addEventListener('touchstart', e => {
            if (e.target instanceof Element && e.target.closest('button')) return;
            if (isAnimating) return;
            isDragging = true;
            startX = e.touches[0].clientX;
            currentX = startX;
            stopAutoplay();
        }, { passive: true });

        mainEl.addEventListener('touchmove', e => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            updateDragPreview();
        }, { passive: true });

        mainEl.addEventListener('touchend', endDragNavigation);
        mainEl.addEventListener('touchcancel', endDragNavigation);

        let mouseDragListenersAttached = false;

        const handleMouseMove = (e) => {
            if (!isDragging) return;
            currentX = e.clientX;
            updateDragPreview();
        };

        const handleMouseUp = () => {
            endDragNavigation();
            detachMouseDragListeners();
        };

        function attachMouseDragListeners() {
            if (mouseDragListenersAttached) return;
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            mouseDragListenersAttached = true;
        }

        function detachMouseDragListeners() {
            if (!mouseDragListenersAttached) return;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            mouseDragListenersAttached = false;
        }

        mainEl.addEventListener('mousedown', e => {
            if (e.target instanceof Element && e.target.closest('button')) return;
            if (isAnimating) return;
            isDragging = true;
            startX = e.clientX;
            currentX = startX;
            stopAutoplay();
            attachMouseDragListeners();
            e.preventDefault();
        });

        const lightbox = $('#gallery-lightbox');
        const lbImg = $('#gallery-lightbox-img');
        const lbClose = $('#gallery-lightbox-close');
        const lbPrev = $('#gallery-lightbox-prev');
        const lbNext = $('#gallery-lightbox-next');
        const lbCounter = $('#gallery-lightbox-counter');
        const lbStage = $('#gallery-lightbox-stage');

        const LIGHTBOX_FLASH_DURATION_MS = 160;
        const LIGHTBOX_FLASH_ACTIVE_CLASS = 'is-flash-active';
        const LIGHTBOX_FLASH_LEFT_CLASS = 'is-flash-left';
        const LIGHTBOX_FLASH_RIGHT_CLASS = 'is-flash-right';
        let lightboxFlashTimer = null;

        // Zoom Layer State
        const zoomState = {
            scale: 1,
            translateX: 0,
            translateY: 0,
            isPinching: false,
            lastTapTs: 0,
            lastTapX: 0,
            lastTapY: 0,
            minScale: 1,
            maxScale: 4
        };

        // Gesture Router State
        const gestureState = {
            touches: [],
            startDistance: 0,
            startScale: 1,
            startTranslateX: 0,
            startTranslateY: 0,
            swipeStartX: 0,
            swipeStartY: 0,
            swipeStartTime: 0,
            isDragging: false
        };

        function clearLightboxFlashTimer() {
            if (!lightboxFlashTimer) return;
            clearTimeout(lightboxFlashTimer);
            lightboxFlashTimer = null;
        }

        function resolveLightboxFlashDirection(prevLogical, nextLogical) {
            if (total <= 1) return 'right';
            if (prevLogical === 0 && nextLogical === total - 1) return 'left';
            if (prevLogical === total - 1 && nextLogical === 0) return 'right';
            return nextLogical > prevLogical ? 'right' : 'left';
        }

        function triggerLightboxFlash(direction) {
            if (!lightbox || !lbStage || !lightbox.classList.contains('open')) return;
            if (prefersReducedMotion()) return;

            const directionClass = direction === 'left' ? LIGHTBOX_FLASH_LEFT_CLASS : LIGHTBOX_FLASH_RIGHT_CLASS;
            clearLightboxFlashTimer();
            lbStage.classList.remove(
                LIGHTBOX_FLASH_ACTIVE_CLASS,
                LIGHTBOX_FLASH_LEFT_CLASS,
                LIGHTBOX_FLASH_RIGHT_CLASS
            );
            void lbStage.offsetWidth;
            lbStage.classList.add(directionClass, LIGHTBOX_FLASH_ACTIVE_CLASS);

            lightboxFlashTimer = setTimeout(() => {
                lbStage.classList.remove(
                    LIGHTBOX_FLASH_ACTIVE_CLASS,
                    LIGHTBOX_FLASH_LEFT_CLASS,
                    LIGHTBOX_FLASH_RIGHT_CLASS
                );
                lightboxFlashTimer = null;
            }, LIGHTBOX_FLASH_DURATION_MS);
        }

        function resetLightboxZoom() {
            zoomState.scale = 1;
            zoomState.translateX = 0;
            zoomState.translateY = 0;
            zoomState.isPinching = false;
            applyLightboxTransform();
        }

        function applyLightboxTransform() {
            if (!lbImg) return;
            const { scale, translateX, translateY } = zoomState;
            lbImg.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
        }

        function constrainTranslation() {
            if (!lbImg || !lbStage) return;
            const { scale } = zoomState;
            
            if (scale <= 1) {
                zoomState.translateX = 0;
                zoomState.translateY = 0;
                return;
            }

            const imgRect = lbImg.getBoundingClientRect();
            const stageRect = lbStage.getBoundingClientRect();
            
            const scaledWidth = imgRect.width;
            const scaledHeight = imgRect.height;
            const maxTranslateX = Math.max(0, (scaledWidth - stageRect.width) / 2 / scale);
            const maxTranslateY = Math.max(0, (scaledHeight - stageRect.height) / 2 / scale);

            zoomState.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, zoomState.translateX));
            zoomState.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, zoomState.translateY));
        }

        function zoomAtPoint(targetScale, clientX, clientY) {
            if (!lbImg || !lbStage) return;
            
            targetScale = Math.max(zoomState.minScale, Math.min(zoomState.maxScale, targetScale));
            
            if (targetScale === zoomState.scale) return;

            const stageRect = lbStage.getBoundingClientRect();
            const imgRect = lbImg.getBoundingClientRect();
            
            const offsetX = clientX - stageRect.left - stageRect.width / 2;
            const offsetY = clientY - stageRect.top - stageRect.height / 2;
            
            const oldScale = zoomState.scale;
            const scaleRatio = targetScale / oldScale;
            
            zoomState.scale = targetScale;
            zoomState.translateX = (zoomState.translateX - offsetX / oldScale) * scaleRatio + offsetX / targetScale;
            zoomState.translateY = (zoomState.translateY - offsetY / oldScale) * scaleRatio + offsetY / targetScale;
            
            constrainTranslation();
            applyLightboxTransform();
        }

        function handleDoubleTap(clientX, clientY) {
            const now = Date.now();
            const timeDiff = now - zoomState.lastTapTs;
            const distX = Math.abs(clientX - zoomState.lastTapX);
            const distY = Math.abs(clientY - zoomState.lastTapY);
            
            if (timeDiff < 300 && distX < 30 && distY < 30) {
                if (zoomState.scale > 1) {
                    zoomAtPoint(1, clientX, clientY);
                } else {
                    zoomAtPoint(2.5, clientX, clientY);
                }
                zoomState.lastTapTs = 0;
                return true;
            }
            
            zoomState.lastTapTs = now;
            zoomState.lastTapX = clientX;
            zoomState.lastTapY = clientY;
            return false;
        }

        function getTouchDistance(touch1, touch2) {
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function getTouchCenter(touch1, touch2) {
            return {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        }

        function handleLightboxTouchStart(e) {
            if (!lbStage || e.target === lbClose || e.target === lbPrev || e.target === lbNext) return;
            
            gestureState.touches = Array.from(e.touches);
            
            if (gestureState.touches.length === 2) {
                zoomState.isPinching = true;
                gestureState.startDistance = getTouchDistance(gestureState.touches[0], gestureState.touches[1]);
                gestureState.startScale = zoomState.scale;
                gestureState.startTranslateX = zoomState.translateX;
                gestureState.startTranslateY = zoomState.translateY;
            } else if (gestureState.touches.length === 1) {
                const touch = gestureState.touches[0];
                gestureState.swipeStartX = touch.clientX;
                gestureState.swipeStartY = touch.clientY;
                gestureState.swipeStartTime = Date.now();
                gestureState.isDragging = false;
                
                if (zoomState.scale > 1) {
                    gestureState.isDragging = true;
                    gestureState.startTranslateX = zoomState.translateX;
                    gestureState.startTranslateY = zoomState.translateY;
                }
            }
        }

        function handleLightboxTouchMove(e) {
            if (!lbStage) return;
            
            gestureState.touches = Array.from(e.touches);
            
            if (gestureState.touches.length === 2 && zoomState.isPinching) {
                e.preventDefault();
                const currentDistance = getTouchDistance(gestureState.touches[0], gestureState.touches[1]);
                const scaleChange = currentDistance / gestureState.startDistance;
                const newScale = gestureState.startScale * scaleChange;
                
                const center = getTouchCenter(gestureState.touches[0], gestureState.touches[1]);
                zoomAtPoint(newScale, center.x, center.y);
            } else if (gestureState.touches.length === 1 && gestureState.isDragging && zoomState.scale > 1) {
                e.preventDefault();
                const touch = gestureState.touches[0];
                const deltaX = touch.clientX - gestureState.swipeStartX;
                const deltaY = touch.clientY - gestureState.swipeStartY;
                
                zoomState.translateX = gestureState.startTranslateX + deltaX / zoomState.scale;
                zoomState.translateY = gestureState.startTranslateY + deltaY / zoomState.scale;
                
                constrainTranslation();
                applyLightboxTransform();
            }
        }

        function handleLightboxTouchEnd(e) {
            if (!lbStage) return;
            
            if (gestureState.touches.length === 1 && e.touches.length === 0) {
                const touch = gestureState.touches[0];
                const deltaX = touch.clientX - gestureState.swipeStartX;
                const deltaY = touch.clientY - gestureState.swipeStartY;
                const deltaTime = Date.now() - gestureState.swipeStartTime;
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);
                
                if (!gestureState.isDragging && zoomState.scale === 1 && deltaTime < 300 && absDeltaX > 50 && absDeltaX > absDeltaY * 1.5) {
                    if (deltaX > 0) {
                        showLightboxImg(logicalIndex - 1);
                    } else {
                        showLightboxImg(logicalIndex + 1);
                    }
                } else if (!gestureState.isDragging && deltaTime < 300 && absDeltaX < 10 && absDeltaY < 10) {
                    const wasDoubleTap = handleDoubleTap(touch.clientX, touch.clientY);
                    if (!wasDoubleTap && e.target === lbStage) {
                        closeLightbox();
                    }
                }
            }
            
            if (e.touches.length === 0) {
                zoomState.isPinching = false;
                gestureState.isDragging = false;
                gestureState.touches = [];
            } else {
                gestureState.touches = Array.from(e.touches);
            }
        }

        function renderLightboxForLogicalIndex() {
            const currentSlide = slideSources[logicalIndex];
            if (lbImg && currentSlide) {
                lbImg.src = currentSlide.src;
                lbImg.alt = currentSlide.alt;
            }
            if (lbCounter) lbCounter.textContent = `${logicalIndex + 1} / ${total}`;
        }

        function openLightbox(idx) {
            if (!lightbox || !lbImg) return;
            stopAutoplay();
            setLogicalIndex(idx, 'lightbox-open');
            renderLightboxForLogicalIndex();
            resetLightboxZoom();
            lightbox.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeLightbox() {
            if (!lightbox) return;
            clearLightboxFlashTimer();
            if (lbStage) {
                lbStage.classList.remove(
                    LIGHTBOX_FLASH_ACTIVE_CLASS,
                    LIGHTBOX_FLASH_LEFT_CLASS,
                    LIGHTBOX_FLASH_RIGHT_CLASS
                );
            }
            lightbox.classList.remove('open');
            document.body.style.overflow = '';
            resetLightboxZoom();
            startAutoplay();
        }

        function showLightboxImg(idx) {
            const prevLogical = logicalIndex;
            const nextLogical = normalizeIndex(idx);
            const hasIndexChanged = prevLogical !== nextLogical;

            setLogicalIndex(nextLogical, 'lightbox');
            renderLightboxForLogicalIndex();
            resetLightboxZoom();

            if (!hasIndexChanged) return;
            const flashDirection = resolveLightboxFlashDirection(prevLogical, nextLogical);
            triggerLightboxFlash(flashDirection);
        }

        if (fsBtn) {
            fsBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            fsBtn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: true });
            fsBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                openLightbox(logicalIndex);
            };
        }
        mainEl.addEventListener('dblclick', (e) => {
            if (e.target instanceof Element && e.target.closest('button')) return;
            openLightbox(logicalIndex);
        });
        if (lbClose) lbClose.onclick = closeLightbox;
        if (lbPrev) lbPrev.onclick = () => showLightboxImg(logicalIndex - 1);
        if (lbNext) lbNext.onclick = () => showLightboxImg(logicalIndex + 1);

        if (lightbox) {
            lightbox.addEventListener('click', e => {
                if (e.target === lightbox) closeLightbox();
            });
        }

        document.addEventListener('visibilitychange', () => {
            isPageVisible = !document.hidden;
            if (isPageVisible) {
                startAutoplay();
            } else {
                stopAutoplay();
            }
        });

        if (lbStage) {
            lbStage.addEventListener('touchstart', handleLightboxTouchStart, { passive: false });
            lbStage.addEventListener('touchmove', handleLightboxTouchMove, { passive: false });
            lbStage.addEventListener('touchend', handleLightboxTouchEnd, { passive: false });
            lbStage.addEventListener('touchcancel', handleLightboxTouchEnd, { passive: false });
        }

        document.addEventListener('keydown', e => {
            if (!lightbox?.classList.contains('open')) return;
            if (e.key === 'ArrowLeft') showLightboxImg(logicalIndex - 1);
            if (e.key === 'ArrowRight') showLightboxImg(logicalIndex + 1);
            if (e.key === 'Escape') closeLightbox();
        });

        startAutoplay();
        galleryInitialized = true;
    }

    W.prepareGalleryRevealState = prepareGalleryRevealState;
    W.revealGalleryOnFirstEntry = revealGalleryOnFirstEntry;
    W.initGallery = initGallery;
    W.register('gallery', initGallery, 60);
})();
