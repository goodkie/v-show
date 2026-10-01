/**
 * contact-gate.js
 * Strict Contact-Inquiry Eligibility & Negative Newsletter Classifier
 * 
 * Rules:
 * 1. Hard Eligibility Gate: A form is eligible ONLY IF it contains a genuine inquiry-body field:
 *    - Native visible textarea
 *    - Visible [contenteditable="true"]
 *    - Visible [role="textbox"] (multiline or labeled message)
 *    - Clearly labeled inquiry single-line input
 * 2. Negative Classifier: Explicitly rejects newsletter, subscription, mailing list, login, search, signup forms.
 * 3. Body-field gate comes BEFORE numeric form scoring. Numeric score must NEVER override the hard inquiry-body requirement.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ContactGate = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const INQUIRY_SEMANTIC_TOKENS = [
        'message', 'inquiry', 'enquiry', 'question', 'comments', 'comment', 
        'details', 'description', 'request', 'reason', 'notes', 'how can we help', 
        'tell us', 'your message', '문의', '질문', '메시지', '내용', '상담 내용', 
        '요청 사항', '설명', '문의내용', '문의사항'
    ];

    const NEWSLETTER_NEGATIVE_TOKENS = [
        'subscribe', 'newsletter', 'mailing list', 'email updates', 'join our list', 
        'join list', 'get updates', 'notify me', 'sign up for updates', 'get offers', 
        'promotions', 'promo', 'coupon', 'download gate', 'email capture', '구독', '뉴스레터'
    ];

    const OTHER_NEGATIVE_TOKENS = [
        'login', 'log in', 'sign in', 'signin', '로그인', 
        'search', '검색', '찾기',
        'register account', 'create account', '회원가입'
    ];

    function isElementVisible(el) {
        if (!el) return false;
        try {
            if (typeof window !== 'undefined' && window.getComputedStyle) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return false;
                }
            }
            if (el.hidden || el.type === 'hidden') return false;
            if (el.offsetWidth === 0 && el.offsetHeight === 0 && !el.getClientRects?.().length) {
                // In some unit test DOMs offsetWidth is 0, so check style directly
                if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
            }
            return true;
        } catch (_) {
            return true;
        }
    }

    function getElementContextText(el) {
        if (!el) return '';
        const parts = [
            el.getAttribute?.('placeholder') || '',
            el.getAttribute?.('name') || '',
            el.getAttribute?.('id') || '',
            el.getAttribute?.('aria-label') || '',
            el.getAttribute?.('title') || '',
            el.className || ''
        ];
        // Check associated label
        try {
            if (el.id && el.ownerDocument) {
                const lbl = el.ownerDocument.querySelector(`label[for="${CSS.escape ? CSS.escape(el.id) : el.id}"]`);
                if (lbl) parts.push(lbl.textContent || '');
            }
            if (el.closest) {
                const parentLabel = el.closest('label');
                if (parentLabel) parts.push(parentLabel.textContent || '');
            }
        } catch (_) {}
        return parts.join(' ').toLowerCase();
    }

    function detectInquiryBodyField(formEl) {
        if (!formEl || !formEl.querySelectorAll) return null;

        // 1. Visible Native textareas
        const textareas = Array.from(formEl.querySelectorAll('textarea')).filter(isElementVisible);
        for (const ta of textareas) {
            const ctx = getElementContextText(ta);
            // Check if textarea is explicitly for newsletter comments only (AI-FIELD-11)
            const isNewsletterOnly = NEWSLETTER_NEGATIVE_TOKENS.some(tok => ctx.includes(tok)) &&
                !INQUIRY_SEMANTIC_TOKENS.some(tok => ctx.includes(tok));
            if (!isNewsletterOnly) {
                return { el: ta, type: 'textarea', name: ta.name || ta.id || 'textarea' };
            }
        }

        // 2. Visible [contenteditable="true"]
        const editables = Array.from(formEl.querySelectorAll('[contenteditable="true"]')).filter(isElementVisible);
        for (const ce of editables) {
            return { el: ce, type: 'contenteditable', name: ce.id || ce.className || 'contenteditable' };
        }

        // 3. Visible [role="textbox"] (multiline or semantic inquiry)
        const roleTextboxes = Array.from(formEl.querySelectorAll('[role="textbox"]')).filter(isElementVisible);
        for (const rtb of roleTextboxes) {
            const isMultiline = rtb.getAttribute('aria-multiline') === 'true';
            const ctx = getElementContextText(rtb);
            const hasSemantic = INQUIRY_SEMANTIC_TOKENS.some(tok => ctx.includes(tok));
            if (isMultiline || hasSemantic) {
                return { el: rtb, type: 'role-textbox', name: rtb.id || 'role-textbox' };
            }
        }

        // 4. Semantic single-line fallback: only if clearly labeled/described as inquiry text
        const inputs = Array.from(formEl.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])')).filter(isElementVisible);
        for (const inp of inputs) {
            const type = (inp.type || 'text').toLowerCase();
            if (['email', 'tel', 'phone', 'number', 'password', 'file'].includes(type)) continue;

            const ctx = getElementContextText(inp);
            // Must have clear inquiry token
            const hasInquiryToken = INQUIRY_SEMANTIC_TOKENS.some(tok => ctx.includes(tok));
            // Must NOT have exclusion tokens (like name, email, phone, search)
            const isExcluded = ['first name', 'last name', 'email', 'phone', 'search', 'company', 'website'].some(ex => ctx.includes(ex));

            if (hasInquiryToken && !isExcluded) {
                return { el: inp, type: 'semantic-input', name: inp.name || inp.id || 'semantic-input' };
            }
        }

        return null;
    }

    function classifyFormIntent(formEl, pageContext = {}) {
        if (!formEl || !formEl.querySelectorAll) {
            return {
                eligible: false,
                intent: 'OTHER',
                hasInquiryBodyField: false,
                bodyFieldType: null,
                inquiryBodyElement: null,
                positiveSignals: [],
                negativeSignals: ['NO_FORM_ELEMENT'],
                fieldsCount: 0,
                submitText: '',
                decision: 'REJECT',
                reason: 'NO_FORM_ELEMENT',
                score: -999
            };
        }

        const positiveSignals = [];
        const negativeSignals = [];

        // 1. Gather all form text and identifiers
        const formId = (formEl.id || '').toLowerCase();
        const formClass = (formEl.className || '').toString().toLowerCase();
        const formAction = (formEl.getAttribute?.('action') || '').toLowerCase();
        const fullFormText = ((formEl.innerText || formEl.textContent || '')).toLowerCase();
        const headingText = Array.from(formEl.querySelectorAll('h1, h2, h3, h4, h5, legend, .title, .form-title'))
            .map(h => (h.textContent || '').trim().toLowerCase())
            .join(' ');

        // 2. Scan buttons
        const buttons = Array.from(formEl.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]'));
        const submitButton = buttons.find(b => {
            const type = (b.getAttribute?.('type') || '').toLowerCase();
            return type === 'submit' || b.tagName === 'BUTTON' || (b.className && b.className.includes('submit'));
        }) || buttons[0];

        const submitText = submitButton ? ((submitButton.textContent || submitButton.value || '')).trim().toLowerCase() : '';

        // 3. Scan inputs count
        const allInputs = Array.from(formEl.querySelectorAll('input:not([type="hidden"]), select, textarea, [contenteditable="true"]')).filter(isElementVisible);
        const textInputs = Array.from(formEl.querySelectorAll('input[type="text"], input[type="email"], input:not([type])')).filter(isElementVisible);
        const emailInputs = Array.from(formEl.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]')).filter(isElementVisible);
        const checkboxes = Array.from(formEl.querySelectorAll('input[type="checkbox"]')).filter(isElementVisible);

        // Check for inquiry body field (Hard Gate)
        const inquiryBody = detectInquiryBodyField(formEl);
        const hasInquiryBodyField = !!inquiryBody;

        // 4. Evaluate Negative Signals
        const combinedHeaderAndButton = `${headingText} ${submitText} ${formId} ${formClass} ${formAction}`;

        for (const tok of NEWSLETTER_NEGATIVE_TOKENS) {
            if (combinedHeaderAndButton.includes(tok)) {
                negativeSignals.push(`newsletter_token:${tok}`);
            }
        }

        for (const tok of OTHER_NEGATIVE_TOKENS) {
            if (combinedHeaderAndButton.includes(tok)) {
                negativeSignals.push(`other_token:${tok}`);
            }
        }

        // Email-only or minimal newsletter pattern: 1 or 2 fields, no message field, email present
        if (!hasInquiryBodyField) {
            if (allInputs.length <= 2 && emailInputs.length >= 1) {
                negativeSignals.push('minimal_email_capture_form');
            }
            if (checkboxes.some(cb => getElementContextText(cb).includes('newsletter') || getElementContextText(cb).includes('subscribe'))) {
                negativeSignals.push('newsletter_checkbox_present');
            }
        }

        // 5. Evaluate Positive Signals
        if (hasInquiryBodyField) {
            positiveSignals.push(`inquiry_body:${inquiryBody.type}`);
        }
        if (['contact', 'inquiry', 'message', 'support', '문의', '상담'].some(t => combinedHeaderAndButton.includes(t))) {
            positiveSignals.push('contact_header_or_id');
        }
        if (['send', 'submit', 'inquire', 'contact', '보내기', '문의하기'].some(t => submitText.includes(t))) {
            positiveSignals.push(`submit_contact_text:${submitText}`);
        }

        // 6. Intent Classification & Decision
        let intent = 'OTHER';
        let decision = 'REJECT';
        let reason = 'NO_INQUIRY_MESSAGE_FIELD';

        // Check strong newsletter intent
        const hasStrongNewsletterIntent = negativeSignals.some(s => s.startsWith('newsletter_token')) ||
            submitText.includes('subscribe') || submitText.includes('join') ||
            headingText.includes('newsletter') || headingText.includes('subscribe');

        if (hasStrongNewsletterIntent) {
            intent = 'NEWSLETTER';
            // Even if a textarea exists, if it's explicitly a newsletter subscription form, reject it (AI-FIELD-11)
            const isPureNewsletter = !positiveSignals.some(s => s.startsWith('contact_header'));
            if (!hasInquiryBodyField || isPureNewsletter) {
                decision = 'REJECT';
                reason = 'NEWSLETTER_REJECTED';
            }
        } else if (negativeSignals.some(s => s.includes('login') || s.includes('sign in'))) {
            intent = 'LOGIN';
            decision = 'REJECT';
            reason = 'LOGIN_FORM_REJECTED';
        } else if (negativeSignals.some(s => s.includes('search'))) {
            intent = 'SEARCH';
            decision = 'REJECT';
            reason = 'SEARCH_FORM_REJECTED';
        } else if (hasInquiryBodyField) {
            // HARD RULE: Only eligible if inquiry body field exists!
            intent = 'CONTACT_INQUIRY';
            decision = 'ACCEPT';
            reason = 'ELIGIBLE_CONTACT_INQUIRY';
        } else {
            // No inquiry body field
            intent = allInputs.length <= 2 ? 'NEWSLETTER' : 'OTHER';
            decision = 'REJECT';
            reason = 'NO_INQUIRY_MESSAGE_FIELD';
        }

        const score = decision === 'ACCEPT' ? (100 + positiveSignals.length * 50) : -999;

        const result = {
            eligible: decision === 'ACCEPT',
            intent,
            hasInquiryBodyField,
            bodyFieldType: inquiryBody ? inquiryBody.type : null,
            inquiryBodyElement: inquiryBody ? inquiryBody.el : null,
            positiveSignals,
            negativeSignals,
            fieldsCount: allInputs.length,
            submitText,
            decision,
            reason,
            score
        };

        // Form classification runtime logging (Privacy safe)
        if (typeof console !== 'undefined' && console.log) {
            console.log(`[FORM_CLASSIFY] intent=${intent} eligible=${result.eligible} hasInquiryBody=${hasInquiryBodyField} bodyFieldType=${result.bodyFieldType || 'none'} fields=${result.fieldsCount} submitText="${submitText.substring(0, 20)}" positiveSignals=${positiveSignals.length} negativeSignals=${negativeSignals.length} decision=${decision} reason=${reason}`);
        }

        return result;
    }

    return {
        INQUIRY_SEMANTIC_TOKENS,
        NEWSLETTER_NEGATIVE_TOKENS,
        OTHER_NEGATIVE_TOKENS,
        isElementVisible,
        getElementContextText,
        detectInquiryBodyField,
        classifyFormIntent
    };
}));
