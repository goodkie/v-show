/**
 * challenge-gate.js  (RC7 major: dual start modes)
 *
 * Pure, DOM-injectable decision logic. It NEVER solves, injects tokens into, or otherwise interacts with a
 * challenge. It only OBSERVES the live page and decides whether the engine may proceed.
 *
 * Modes
 *  - AUTO   : after the form is complete, a challenge that genuinely needs a human/external extension keeps the
 *             tab open and waits (CAPTCHA_PENDING_EXTERNAL_USER). Once the challenge is independently verified
 *             (or the operator attests an unverifiable challenge) exactly ONE submission is made. No per-site popup.
 *  - MANUAL : after fields are stable the whole queue pauses (MANUAL_HOLD). The operator registers in the browser
 *             and explicitly resumes. Success is claimed only on positive evidence, otherwise DELIVERY_UNKNOWN.
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
        recaptchaWidget: 'iframe[src*="recaptcha"], .g-recaptcha',
        hcaptchaWidget: 'iframe[src*="hcaptcha"], .h-captcha',
        turnstileWidget: 'iframe[src*="turnstile"], .cf-turnstile',
        recaptchaToken: '[name="g-recaptcha-response"], #g-recaptcha-response, .g-recaptcha-response',
        hcaptchaToken: '[name="h-captcha-response"], #h-captcha-response',
        turnstileToken: '[name="cf-turnstile-response"], #cf-turnstile-response',
        invisibleRecaptcha: '.grecaptcha-badge, [data-size="invisible"]',
        textCaptchaInput: 'input[name*="captcha" i], input[id*="captcha" i], input[placeholder*="captcha" i]',
        imageCaptcha: 'img[src*="captcha" i], img[id*="captcha" i], img[class*="captcha" i]'
    });

    const val = (el) => (el && typeof el.value === 'string' ? el.value.trim() : '');

    /**
     * Observe the page. verified=true ONLY when every interactive challenge on the page carries an
     * independent completion signal that the page itself produced (we never write tokens).
     */
    function detectChallenge(doc) {
        const q = (s) => (doc && doc.querySelector ? doc.querySelector(s) : null);
        const kinds = [];
        const evidence = [];
        let interactiveCount = 0;
        let verifiedCount = 0;
        let unverifiableCount = 0;

        const token = (widgetSel, tokenSel, kind) => {
            const widget = q(widgetSel);
            const tok = q(tokenSel);
            if (!widget && !tok) return;
            kinds.push(kind);
            const invisible = kind === 'recaptcha' && !!q(SEL.invisibleRecaptcha);
            if (invisible) { evidence.push(`${kind}:invisible_non_interactive`); return; }
            interactiveCount++;
            if (val(tok)) { verifiedCount++; evidence.push(`${kind}:page_token_present`); }
            else evidence.push(`${kind}:no_token_yet`);
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
            kinds, evidence,
            interactive: interactiveCount > 0,
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

    /** MANUAL resume: success only with positive evidence, otherwise DELIVERY_UNKNOWN (never a bare claim). */
    function classifyManualResume(ev = {}) {
        const serverAck = Boolean(ev.serverAck || ev.hasServerAck);
        const successText = Boolean(ev.successText || ev.hasPositiveDomSuccess || ev.hasUrlRedirectSuccess);
        const formRemoved = (ev.formRemoved !== undefined) ? Boolean(ev.formRemoved) : (ev.formStillPresent === false);
        const urlChanged = Boolean(ev.urlChanged || ev.hasUrlRedirectSuccess);
        const positive = !!(serverAck || successText || (formRemoved && urlChanged));
        const outcome = positive ? 'SUCCESS' : 'DELIVERY_UNKNOWN';
        return {
            outcome,
            status: outcome,
            reasonCode: positive ? 'MANUAL_REGISTRATION_EVIDENCE_CONFIRMED' : 'MANUAL_CLAIM_NO_EVIDENCE',
            operatorClaimOnly: !positive
        };
    }

    const SUCCESS_TEXT = /thank you|thanks for|message (has been )?sent|successfully (sent|submitted)|we(?:'ll| will) (be in touch|get back|contact)|submission (received|successful)|received your|감사합니다|접수(되었|가 완료)|전송(되었|이 완료)|문의가 (접수|등록)/i;
    function hasSuccessText(text) { return SUCCESS_TEXT.test(String(text || '')); }

    return { MODES, ACTIONS, SEL, detectChallenge, decideAction, classifyManualResume, hasSuccessText };
}));

