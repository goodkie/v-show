/**
 * challenge-gate.js  (RC7.0.0-rc2: dual start modes + audit hardening)
 *
 * Pure, DOM-injectable decision logic. It NEVER solves, injects tokens into, or otherwise interacts with a
 * challenge. It only OBSERVES the live page and decides whether the engine may proceed.
 *
 * Modes
 *  - AUTO   : after the form is complete, a challenge that genuinely needs a human/external extension keeps the
 *             tab open and waits (CAPTCHA_PENDING_EXTERNAL_USER). Once the challenge is independently verified
 *             (or the operator attests an unverifiable challenge) exactly ONE submission is made. No per-site popup.
 *             Note: An idle invisible reCAPTCHA badge is never treated as proof of server-side verification.
 *  - MANUAL : after fields are stable the whole queue pauses (MANUAL_HOLD). The operator registers in the browser
 *             and explicitly resumes. Success is claimed only on positive confirmation evidence (generic navigation
 *             without confirmation text/URL slug remains DELIVERY_UNKNOWN).
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ChallengeGate = factory();
}(typeof self !== 'undefined' ? self : this, function () {

    const MODES = Object.freeze({ AUTO: 'AUTO', MANUAL: 'MANUAL' });

    const ACTIONS = Object.freeze({
        SUBMIT_ONCE: 'SUBMIT_ONCE',
        PAUSE_EXTERNAL_USER: 'CAPTCHA_PENDING_EXTERNAL_USER',
        MANUAL_HOLD: 'MANUAL_HOLD',
        BLOCK_DUPLICATE: 'BLOCK_DUPLICATE',
        PAUSE_FIELDS_INCOMPLETE: 'PAUSE_FIELDS_INCOMPLETE'
    });

    // Selector registry (also used by tests to build a fake document).
    const SEL = Object.freeze({
        recaptchaWidget: 'iframe[src*="recaptcha"], .g-recaptcha, [data-sitekey]',
        recaptchaBframe: 'iframe[src*="recaptcha"][src*="bframe"], iframe[title*="recaptcha challenge" i]',
        hcaptchaWidget: 'iframe[src*="hcaptcha"], .h-captcha',
        turnstileWidget: 'iframe[src*="turnstile"], .cf-turnstile',
        recaptchaToken: '[name="g-recaptcha-response"], #g-recaptcha-response, .g-recaptcha-response',
        hcaptchaToken: '[name="h-captcha-response"], #h-captcha-response',
        turnstileToken: '[name="cf-turnstile-response"], #cf-turnstile-response',
        invisibleRecaptcha: '.grecaptcha-badge, [data-size="invisible"], iframe[src*="size=invisible"]',
        textCaptchaInput: 'input[name*="captcha" i], input[id*="captcha" i], input[placeholder*="captcha" i]',
        imageCaptcha: 'img[src*="captcha" i], img[id*="captcha" i], img[class*="captcha" i]'
    });

    const val = (el) => (el && typeof el.value === 'string' ? el.value.trim() : '');

    function isElementVisible(el) {
        if (!el) return false;
        if (el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
        const style = el.style || {};
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return true;
    }

    /**
     * Observe the page. verified=true ONLY when every interactive challenge on the page carries an
     * independent completion signal that the page itself produced (we never write tokens).
     * Invisible reCAPTCHA badge alone NEVER sets verified=true or serverVerified=true.
     */
    function detectChallenge(doc) {
        const q = (s) => (doc && doc.querySelector ? doc.querySelector(s) : null);
        const kinds = [];
        const evidence = [];
        let interactiveCount = 0;
        let verifiedCount = 0;
        let unverifiableCount = 0;
        let invisibleDetected = false;

        const token = (widgetSel, tokenSel, kind) => {
            const widget = q(widgetSel);
            const tok = q(tokenSel);
            if (!widget && !tok) return;
            kinds.push(kind);
            const tokVal = val(tok);
            const isInvisibleBadge = kind === 'recaptcha' && !!q(SEL.invisibleRecaptcha);
            const bframe = kind === 'recaptcha' ? q(SEL.recaptchaBframe) : null;
            const activeBframe = bframe && isElementVisible(bframe);

            if (isInvisibleBadge && !activeBframe) {
                invisibleDetected = true;
                // Audit Item (1): Invisible reCAPTCHA badge is non-interactive pre-submit,
                // but MUST NOT imply server-side completion or general verification proof.
                if (tokVal) {
                    evidence.push(`${kind}:invisible_token_present_unverified_server`);
                } else {
                    evidence.push(`${kind}:invisible_non_interactive_unverified`);
                }
                return;
            }
            interactiveCount++;
            if (tokVal) {
                verifiedCount++;
                evidence.push(`${kind}:page_token_present`);
            } else {
                evidence.push(`${kind}:no_token_yet`);
            }
        };
        token(SEL.recaptchaWidget, SEL.recaptchaToken, 'recaptcha');
        token(SEL.hcaptchaWidget, SEL.hcaptchaToken, 'hcaptcha');
        token(SEL.turnstileWidget, SEL.turnstileToken, 'turnstile');

        const textInput = q(SEL.textCaptchaInput);
        const imageCaptcha = q(SEL.imageCaptcha);
        if (textInput || imageCaptcha) {
            kinds.push('image_text');
            interactiveCount++;
            unverifiableCount++; // typed text can never be independently verified client-side
            evidence.push(val(textInput) ? 'image_text:input_filled_unverifiable' : 'image_text:input_empty');
        }

        const present = kinds.length > 0;
        const verified = present && interactiveCount > 0 && verifiedCount === interactiveCount && unverifiableCount === 0;
        const needsHuman = interactiveCount > 0 && !verified;
        return {
            present,
            detected: present,
            type: kinds[0] || 'none',
            method: evidence.join(',') || 'none',
            kinds,
            evidence,
            interactive: interactiveCount > 0,
            invisibleDetected,
            serverVerified: false, // Browser DOM observation is never proof of server-side verification
            verified,
            unverifiable: unverifiableCount > 0,
            needsHuman,
            // detection alone is never a claim that anything was solved
            claimsSolved: false
        };
    }

    /**
     * Decide what the engine may do right now.
     * attested = operator explicitly confirmed an unverifiable challenge is complete.
     */
    function decideAction({ mode, challenge, fieldsComplete = true, formValid = true, attested = false, operatorVerified = false, alreadySubmitted = false } = {}) {
        if (alreadySubmitted) return ACTIONS.BLOCK_DUPLICATE;
        if (!fieldsComplete || !formValid) return ACTIONS.PAUSE_FIELDS_INCOMPLETE;
        if (mode === MODES.MANUAL) return ACTIONS.MANUAL_HOLD;
        const c = challenge || { present: false };
        const isPresent = Boolean(c.present || c.detected);
        const isNeedsHuman = (c.needsHuman !== undefined) ? c.needsHuman : (isPresent && !c.verified);
        if (!isPresent || !isNeedsHuman) return ACTIONS.SUBMIT_ONCE;
        if (c.verified) return ACTIONS.SUBMIT_ONCE;
        if (c.unverifiable && (attested || operatorVerified) && !(c.evidence || []).some((e) => /no_token_yet/.test(e))) return ACTIONS.SUBMIT_ONCE;
        return ACTIONS.PAUSE_EXTERNAL_USER;
    }

    const SUCCESS_TEXT = /thank you|thanks for|message (has been )?sent|successfully (sent|submitted)|we(?:'ll| will) (be in touch|get back|contact)|submission (received|successful)|received your|감사합니다|접수(되었|가 완료)|전송(되었|이 완료)|문의가 (접수|등록|성공적으로)/i;
    const ERROR_TEXT = /invalid captcha|verification failed|captcha required|please complete the security check|error submitting|submission failed|필수 항목|올바르지 않|인식에 실패|다시 시도해/i;
    const CONFIRMATION_URL_RE = /(?:[/?#&_-]|^)(?:thank[-_]?you|thanks|success|submitted|complete|completed|confirm|confirmed|done|receipt|status=success|sent=1|submitted=true)(?:[/?#&_-]|$)/i;

    function hasSuccessText(text) { return SUCCESS_TEXT.test(String(text || '')); }
    function hasErrorText(text) { return ERROR_TEXT.test(String(text || '')); }
    function hasConfirmationUrl(url) { return CONFIRMATION_URL_RE.test(String(url || '')); }

    /**
     * MANUAL resume: success only with positive confirmation evidence, otherwise DELIVERY_UNKNOWN.
     * Audit Item (3): Generic page navigation (urlChanged + formRemoved without confirmation URL or success text)
     * MUST NOT create false SUCCESS.
     */
    function classifyManualResume(ev = {}) {
        const pageText = String(ev.pageText || '');
        const currentUrl = String(ev.currentUrl || ev.url || '');
        const hasError = Boolean(ev.hasError || (pageText && hasErrorText(pageText)));
        const serverAck = Boolean(ev.serverAck || ev.hasServerAck);
        const explicitSuccessText = Boolean(ev.successText || ev.hasPositiveDomSuccess || (pageText && hasSuccessText(pageText)));
        const formRemoved = (ev.formRemoved !== undefined) ? Boolean(ev.formRemoved) : (ev.formStillPresent === false);
        const urlChanged = Boolean(ev.urlChanged);
        const urlRedirectSuccess = Boolean(ev.hasUrlRedirectSuccess || (urlChanged && hasConfirmationUrl(currentUrl)));

        const positive = !hasError && Boolean(serverAck || explicitSuccessText || urlRedirectSuccess);
        const isGenericNavOnly = !positive && urlChanged && formRemoved;
        const outcome = positive ? 'SUCCESS' : 'DELIVERY_UNKNOWN';
        const reasonCode = positive
            ? 'MANUAL_REGISTRATION_EVIDENCE_CONFIRMED'
            : (hasError
                ? 'MANUAL_PAGE_ERROR_DETECTED'
                : (isGenericNavOnly ? 'MANUAL_GENERIC_NAVIGATION_NO_CONFIRMATION' : 'MANUAL_CLAIM_NO_EVIDENCE'));
        return {
            outcome,
            status: outcome,
            reasonCode,
            operatorClaimOnly: !positive
        };
    }

    return { MODES, ACTIONS, SEL, detectChallenge, decideAction, classifyManualResume, hasSuccessText, hasErrorText, hasConfirmationUrl };
}));
