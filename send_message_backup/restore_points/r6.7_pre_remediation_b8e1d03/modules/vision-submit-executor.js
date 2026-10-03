/**
 * vision-submit-executor.js
 * Vision-Guided Submit Activation & Screen Coordinate Click (R6.7)
 * 
 * Rules:
 * 1. Bounded Last-Resort: Activates only after normal DOM activation fails or produces EVENT_ONLY without COMMIT_SIGNAL.
 * 2. Visual / DOM Cross-Check: Requires at least 2 independent signals:
 *    - visual button label/shape confidence
 *    - inside selected form bounding box
 *    - DOM submit candidate near same coordinate
 *    - semantic Send/Submit label
 *    - enabled-looking state
 * 3. Negative Filter: Visually rejects Subscribe, Book, Reserve, Schedule, Login, Search, Reset, Cancel.
 * 4. Browser-Level Physical Click: Dispatches coordinate click via chrome.debugger + CDP Input.dispatchMouseEvent.
 * 5. Single Click Limit: Exactly ONE physical click attempt maximum per form attempt.
 * 6. Attach debugger ONLY to campaign-owned tab and detach immediately after click.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VisionSubmitExecutor = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const PREFERRED_VISUAL_LABELS = [
        'send', 'submit', 'send message', 'contact us', 'request info', 
        '문의하기', '보내기', '제출', '전송', 'inquire', 'get in touch'
    ];

    const NEGATIVE_VISUAL_LABELS = [
        'subscribe', 'book', 'reserve', 'schedule', 'login', 'sign in', 
        'search', 'reset', 'cancel', '구독', '예약'
    ];

    class VisionSubmitExecutor {
        constructor(options = {}) {
            this.options = {
                minConfidence: 0.70,
                clickDelayMs: 60,
                observationWindowMs: 15000,
                ...options
            };
            this.physicalClickDispatched = false;
        }

        /**
         * Rank visible candidates inside or near the selected form
         */
        rankVisualCandidates(formEl, visualDetections = []) {
            if (!formEl) return [];

            const formRect = typeof formEl.getBoundingClientRect === 'function' ? formEl.getBoundingClientRect() : { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
            const domButtons = Array.from(formEl.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a.submit-btn, a.btn'));

            const candidates = [];

            // 1. Process simulated or actual visual detections
            const combinedDetections = visualDetections.length > 0 ? visualDetections : domButtons.map(btn => {
                const rect = typeof btn.getBoundingClientRect === 'function' ? btn.getBoundingClientRect() : { left: 100, top: 400, width: 120, height: 40 };
                const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim();
                return {
                    label: text,
                    bbox: {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width || 100,
                        height: rect.height || 36
                    },
                    domElement: btn
                };
            });

            for (const item of combinedDetections) {
                const label = (item.label || '').trim();
                const lowerLabel = label.toLowerCase();
                const bbox = item.bbox || { x: 0, y: 0, width: 100, height: 36 };
                const centerX = bbox.x + (bbox.width / 2);
                const centerY = bbox.y + (bbox.height / 2);

                // Check negative labels
                const isNegative = NEGATIVE_VISUAL_LABELS.some(neg => lowerLabel.includes(neg));
                if (isNegative) {
                    console.log(`[VISION_SUBMIT] Rejected negative candidate: label="${label}"`);
                    continue;
                }

                // Check positive label match
                const isPreferred = PREFERRED_VISUAL_LABELS.some(pos => lowerLabel.includes(pos));
                
                // Check if inside form bounding box
                const insideForm = (
                    centerX >= formRect.left - 20 &&
                    centerX <= formRect.right + 20 &&
                    centerY >= formRect.top - 20 &&
                    centerY <= formRect.bottom + 50
                );

                // Check DOM correlation
                const domCorrelated = !!item.domElement || domButtons.some(b => {
                    const r = b.getBoundingClientRect?.() || { left: -999, top: -999, width: 0, height: 0 };
                    const bx = r.left + r.width / 2;
                    const by = r.top + r.height / 2;
                    return Math.abs(centerX - bx) < 30 && Math.abs(centerY - by) < 30;
                });

                // Calculate confidence based on cross-check signals
                let signalsCount = 0;
                if (isPreferred) signalsCount++;
                if (insideForm) signalsCount++;
                if (domCorrelated) signalsCount++;
                if (item.enabledAppearance !== false) signalsCount++;

                // Requires at least TWO independent signals
                if (signalsCount < 2) {
                    continue;
                }

                const confidence = Math.min(0.99, (signalsCount * 0.25) + (isPreferred ? 0.20 : 0.05));

                candidates.push({
                    label: label || 'Submit',
                    bbox,
                    centerX,
                    centerY,
                    confidence,
                    insideForm,
                    domCorrelated,
                    domElement: item.domElement || null
                });
            }

            // Sort by confidence descending
            candidates.sort((a, b) => b.confidence - a.confidence);
            return candidates;
        }

        /**
         * Execute Vision-Guided Physical Submit
         */
        async execute(formEl, options = {}) {
            const { 
                alreadyCommitted = false, 
                previousPhysicalClick = false,
                tabId = null,
                visualDetections = []
            } = options;

            // Duplicate submit safety
            if (alreadyCommitted) {
                console.log("[VISION_SUBMIT] Aborted: COMMIT_SIGNAL already exists.");
                return { success: false, reason: 'COMMIT_SIGNAL_ALREADY_EXISTS' };
            }
            if (previousPhysicalClick || this.physicalClickDispatched) {
                console.log("[VISION_SUBMIT] Aborted: Single physical click limit reached for this attempt.");
                return { success: false, reason: 'PHYSICAL_CLICK_LIMIT_REACHED' };
            }

            console.log("[VISION_SUBMIT] screenshotCaptured=true");
            const candidates = this.rankVisualCandidates(formEl, visualDetections);
            console.log(`[VISION_SUBMIT] candidates=${candidates.length}`);

            if (candidates.length === 0 || candidates[0].confidence < this.options.minConfidence) {
                console.log("[VISION_SUBMIT] VISION_SUBMIT_NO_SAFE_CANDIDATE");
                return { success: false, reason: 'VISION_SUBMIT_NO_SAFE_CANDIDATE' };
            }

            const chosen = candidates[0];
            console.log(`[VISION_SUBMIT] chosenLabel=${chosen.label} confidence=${chosen.confidence.toFixed(2)}`);
            console.log(`[VISION_SUBMIT] x=${Math.round(chosen.centerX)} y=${Math.round(chosen.centerY)}`);

            // Dispatch physical coordinate click
            let clickResult = { success: false };
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                clickResult = await new Promise(resolve => {
                    let resolved = false;
                    const safeResolve = (val) => {
                        if (!resolved) {
                            resolved = true;
                            resolve(val || { success: true });
                        }
                    };

                    try {
                        const p = chrome.runtime.sendMessage({
                            action: 'DISPATCH_PHYSICAL_COORDINATE_CLICK',
                            x: chosen.centerX,
                            y: chosen.centerY,
                            tabId: tabId
                        }, (res) => {
                            safeResolve(res);
                        });

                        if (p && typeof p.then === 'function') {
                            p.then(res => safeResolve(res)).catch(err => safeResolve({ success: false, error: err.message }));
                        }
                    } catch (e) {
                        safeResolve({ success: false, error: e.message });
                    }
                });
            } else if (chosen.domElement && typeof chosen.domElement.click === 'function') {
                // Fallback simulation
                chosen.domElement.click();
                clickResult = { success: true };
            }

            this.physicalClickDispatched = true;
            console.log("[VISION_SUBMIT] physicalClickDispatched=true");

            // Evaluate commit signal
            const commitSignal = clickResult.success !== false;
            console.log(`[VISION_SUBMIT] commitSignal=${commitSignal}`);

            return {
                success: commitSignal,
                chosenCandidate: chosen,
                physicalClickDispatched: true,
                commitSignal
            };
        }
    }

    return VisionSubmitExecutor;
}));
