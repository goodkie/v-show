/**
 * contact-gate.js
 * Strict Contact-Inquiry Eligibility & Negative Non-Inquiry Classifier (R6.7)
 * 
 * Rules:
 * 1. Hard Eligibility Gate (LONG_TEXT_GATE): A form is eligible ONLY IF it contains a genuine inquiry-body field:
 *    - Native visible enabled textarea
 *    - Visible enabled [contenteditable="true"]
 *    - Visible enabled [role="textbox"] with aria-multiline="true"
 *    - Custom rich-text/multiline component with clear inquiry semantics
 *    - Capable of meaningful free-form text, NOT a one-line subject/search/text field.
 * 2. Explicit Auto-Skip Classes (Without genuine long-text inquiry body):
 *    - SUBSCRIBE (NON_INQUIRY_SUBSCRIBE_FORM)
 *    - NEWSLETTER (NON_INQUIRY_NEWSLETTER_FORM)
 *    - BOOKING (NON_INQUIRY_BOOKING_FORM)
 *    - APPOINTMENT (NON_INQUIRY_APPOINTMENT_FORM)
 *    - RESERVATION (NON_INQUIRY_RESERVATION_FORM)
 *    - LOGIN (NON_INQUIRY_LOGIN_FORM)
 *    - SEARCH (NON_INQUIRY_SEARCH_FORM)
 *    - General missing body (NO_LONG_TEXT_INQUIRY_FIELD)
 * 3. Booking Special Rule:
 *    - Dominant booking semantics (date/time/party/service + Book/Reserve button) are skipped even if a tiny "notes" field exists.
 *    - A separate genuine contact form on the same page remains eligible.
 * 4. AI Form Intent Classifier:
 *    - Hard rule: AI can NEVER override longTextInquiry=false.
 * 5. Scoring Order:
 *    - Numeric score can NEVER override NO_LONG_TEXT_INQUIRY_FIELD or NON_INQUIRY_* classifications.
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
        'details', 'description', 'request', 'reason', 'how can we help', 
        'tell us', 'your message', 'additional information', '문의', '질문', '메시지', 
        '내용', '상담 내용', '상담내용', '요청 사항', '요청사항', '설명', '문의내용', '문의사항'
    ];

    const NEWSLETTER_NEGATIVE_TOKENS = [
        'subscribe', 'newsletter', 'mailing list', 'email updates', 'join our list', 
        'join list', 'get updates', 'notify me', 'sign up for updates', 'get offers', 
        'promotions', 'promo', 'coupon', 'download gate', 'email capture', 'email signup',
        'sign up', 'signup', 'join', '구독', '뉴스레터'
    ];

    const BOOKING_NEGATIVE_TOKENS = [
        'booking', 'book now', 'book online', 'book a', 'schedule a', 'schedule appointment',
        'reserve', 'reservation', 'appointment', 'schedule', 'party size', 'class schedule',
        'service selection', 'check in', 'check out', 'guests', 'seats', 'table reservation',
        'make a reservation', 'book', '예약', '일정', '스케줄'
    ];

    const OTHER_NEGATIVE_TOKENS = [
        'login', 'log in', 'sign in', 'signin', '로그인', 
        'search', '검색', '찾기',
        'register account', 'create account', '회원가입',
        'password', '비밀번호'
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
            if (el.hidden || el.type === 'hidden' || el.disabled) return false;
            if (el.offsetWidth === 0 && el.offsetHeight === 0 && !el.getClientRects?.().length) {
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

    /**
     * Strict Long-Text Inquiry Body Field Detection (R6.7 & R6.8 P0-2)
     */
    function detectInquiryBodyField(formEl) {
        if (!formEl || !formEl.querySelectorAll) {
            console.log('[LONG_TEXT_GATE] found=false');
            return null;
        }

        // Assert valid container type: raw input/button cannot be a form container
        const tag = (formEl.tagName || '').toUpperCase();
        if (['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SPAN', 'LABEL'].includes(tag)) {
            console.log(`[LONG_TEXT_GATE] found=false reason=INVALID_CONTAINER_TAG_${tag}`);
            return null;
        }

        // 1. Visible Native textareas
        const textareas = Array.from(formEl.querySelectorAll('textarea')).filter(isElementVisible);
        for (const ta of textareas) {
            const ctx = getElementContextText(ta);
            const isNewsletterOnly = NEWSLETTER_NEGATIVE_TOKENS.some(tok => ctx.includes(tok)) &&
                !INQUIRY_SEMANTIC_TOKENS.some(tok => ctx.includes(tok));
            const isSearchOnly = ctx.includes('search') && !INQUIRY_SEMANTIC_TOKENS.some(tok => ctx.includes(tok));
            if (!isNewsletterOnly && !isSearchOnly) {
                const semantic = INQUIRY_SEMANTIC_TOKENS.find(tok => ctx.includes(tok)) || 'message';
                console.log(`[LONG_TEXT_GATE] found=true type=textarea semantic=${semantic}`);
                return { el: ta, type: 'textarea', name: ta.name || ta.id || 'textarea', semantic };
            }
        }

        // 2. Visible [contenteditable="true"]
        const editables = Array.from(formEl.querySelectorAll('[contenteditable="true"]')).filter(isElementVisible);
        for (const ce of editables) {
            const ctx = getElementContextText(ce);
            const semantic = INQUIRY_SEMANTIC_TOKENS.find(tok => ctx.includes(tok)) || 'contenteditable';
            console.log(`[LONG_TEXT_GATE] found=true type=contenteditable semantic=${semantic}`);
            return { el: ce, type: 'contenteditable', name: ce.id || ce.className || 'contenteditable', semantic };
        }

        // 3. Visible [role="textbox"] (aria-multiline=true or semantic inquiry)
        const roleTextboxes = Array.from(formEl.querySelectorAll('[role="textbox"]')).filter(isElementVisible);
        for (const rtb of roleTextboxes) {
            const isMultiline = rtb.getAttribute('aria-multiline') === 'true';
            const ctx = getElementContextText(rtb);
            const hasSemantic = INQUIRY_SEMANTIC_TOKENS.some(tok => ctx.includes(tok));
            if (isMultiline || hasSemantic) {
                const semantic = INQUIRY_SEMANTIC_TOKENS.find(tok => ctx.includes(tok)) || 'role-textbox';
                console.log(`[LONG_TEXT_GATE] found=true type=role-textbox semantic=${semantic}`);
                return { el: rtb, type: 'role-textbox', name: rtb.id || 'role-textbox', semantic };
            }
        }

        // 4. Custom multiline rich-text / component container with explicit inquiry semantics
        const richEditors = Array.from(formEl.querySelectorAll('.ql-editor, .fr-element, .note-editable, .mce-content-body')).filter(isElementVisible);
        for (const re of richEditors) {
            console.log('[LONG_TEXT_GATE] found=true type=rich-editor semantic=message');
            return { el: re, type: 'rich-editor', name: re.id || 'rich-editor', semantic: 'message' };
        }

        console.log('[LONG_TEXT_GATE] found=false');
        return null;
    }

    /**
     * Authoritative Intent Classifier & Eligibility Gate (R6.7)
     */
    function classifyFormIntent(formEl, pageContext = {}) {
        if (!formEl || !formEl.querySelectorAll) {
            console.log('[LONG_TEXT_GATE] found=false type=none semantic=none');
            console.log('[FORM_INTENT] intent=OTHER confidence=0.00 negativeClass=NO_FORM_ELEMENT');
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

        // Assert valid container element: raw input, textarea, button cannot be a logical container
        const tag = (formEl.tagName || '').toUpperCase();
        if (['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SPAN', 'LABEL'].includes(tag)) {
            console.log(`[FORM_GATE_INVARIANT_VIOLATION] reason=INVALID_CONTAINER_TYPE_${tag} -> eligible=false`);
            console.log('[LONG_TEXT_GATE] found=false type=none semantic=none');
            console.log('[FORM_INTENT] intent=OTHER confidence=0.00 negativeClass=INVALID_CONTAINER_TYPE');
            return {
                eligible: false,
                intent: 'OTHER',
                hasInquiryBodyField: false,
                bodyFieldType: null,
                inquiryBodyElement: null,
                positiveSignals: [],
                negativeSignals: [`INVALID_CONTAINER_TYPE_${tag}`],
                fieldsCount: 0,
                submitText: '',
                decision: 'REJECT',
                reason: 'INVALID_CONTAINER_TYPE',
                score: -999
            };
        }

        const positiveSignals = [];
        const negativeSignals = [];

        // Check page URL context for Shopify Help/Search pages
        const currentUrl = (pageContext && pageContext.url ? pageContext.url : (typeof window !== 'undefined' && window.location ? window.location.href : '')).toLowerCase();
        const isShopifyHelpOrSearch = currentUrl.includes('help.shopify.com') || currentUrl.includes('shopify.com/search') || (currentUrl.includes('/search') && !currentUrl.includes('contact'));
        if (isShopifyHelpOrSearch) {
            negativeSignals.push('shopify_help_search_page');
        }

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

        // 3. Scan inputs
        const allInputs = Array.from(formEl.querySelectorAll('input:not([type="hidden"]), select, textarea, [contenteditable="true"]')).filter(isElementVisible);
        const emailInputs = Array.from(formEl.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]')).filter(isElementVisible);
        const nameInputs = Array.from(formEl.querySelectorAll('input[name*="name" i], input[id*="name" i], input[name*="fname" i], input[name*="lname" i]')).filter(isElementVisible);
        const dateInputs = Array.from(formEl.querySelectorAll('input[type="date"], input[name*="date" i], input[id*="date" i], select[name*="date" i]')).filter(isElementVisible);
        const timeInputs = Array.from(formEl.querySelectorAll('input[type="time"], input[name*="time" i], input[id*="time" i], select[name*="time" i]')).filter(isElementVisible);
        const checkboxes = Array.from(formEl.querySelectorAll('input[type="checkbox"]')).filter(isElementVisible);

        // Check for genuine inquiry body field (Hard Gate)
        const inquiryBody = detectInquiryBodyField(formEl);
        const hasInquiryBodyField = !!inquiryBody;

        // 4. Evaluate Negative Signals
        const combinedContext = `${headingText} ${submitText} ${formId} ${formClass} ${formAction}`;

        for (const tok of NEWSLETTER_NEGATIVE_TOKENS) {
            if (combinedContext.includes(tok)) {
                negativeSignals.push(`newsletter_token:${tok}`);
            }
        }

        for (const tok of BOOKING_NEGATIVE_TOKENS) {
            if (combinedContext.includes(tok)) {
                negativeSignals.push(`booking_token:${tok}`);
            }
        }

        for (const tok of OTHER_NEGATIVE_TOKENS) {
            if (combinedContext.includes(tok)) {
                negativeSignals.push(`other_token:${tok}`);
            }
        }

        // Email-only or minimal newsletter pattern
        if (!hasInquiryBodyField) {
            if (allInputs.length <= 2 && emailInputs.length >= 1) {
                negativeSignals.push('minimal_email_capture_form');
            }
            if (checkboxes.some(cb => getElementContextText(cb).includes('newsletter') || getElementContextText(cb).includes('subscribe'))) {
                negativeSignals.push('newsletter_checkbox_present');
            }
        }

        // 5. Intent Determination & Classification
        let intent = 'OTHER';
        let decision = 'REJECT';
        let reason = 'NO_LONG_TEXT_INQUIRY_FIELD';

        const isSubscribeButton = submitText.includes('subscribe') || submitText.includes('join') || submitText.includes('sign up') || submitText.includes('signup') || submitText.includes('get updates') || submitText.includes('구독');
        const isBookingButton = submitText.includes('book') || submitText.includes('reserve') || submitText.includes('schedule') || submitText.includes('appointment') || submitText.includes('예약');
        const hasBookingFields = (dateInputs.length > 0 || timeInputs.length > 0) || negativeSignals.some(s => s.startsWith('booking_token'));

        if (isShopifyHelpOrSearch || formAction.includes('search') || (negativeSignals.some(s => s.includes('search')) && !hasInquiryBodyField)) {
            intent = 'SEARCH';
            decision = 'REJECT';
            reason = 'NON_INQUIRY_SEARCH_FORM';
        } else if (isBookingButton || hasBookingFields) {
            if (headingText.includes('appointment') || submitText.includes('appointment')) {
                intent = 'APPOINTMENT';
            } else if (headingText.includes('reservation') || submitText.includes('reservation') || submitText.includes('reserve')) {
                intent = 'RESERVATION';
            } else {
                intent = 'BOOKING';
            }

            if (!hasInquiryBodyField) {
                decision = 'REJECT';
                if (intent === 'APPOINTMENT') reason = 'NON_INQUIRY_APPOINTMENT_FORM';
                else if (intent === 'RESERVATION') reason = 'NON_INQUIRY_RESERVATION_FORM';
                else reason = 'NON_INQUIRY_BOOKING_FORM';
            } else {
                const isOnlyTinyNotes = inquiryBody && (inquiryBody.name.includes('note') || inquiryBody.semantic === 'notes') &&
                                       (dateInputs.length > 0 || timeInputs.length > 0 || isBookingButton);
                const hasStrongContactHeader = ['contact', 'inquiry', 'message', '문의', '연락'].some(t => headingText.includes(t) || formId.includes(t));
                
                if (isOnlyTinyNotes && !hasStrongContactHeader) {
                    decision = 'REJECT';
                    reason = 'NON_INQUIRY_BOOKING_FORM';
                } else {
                    intent = 'CONTACT_INQUIRY';
                    decision = 'ACCEPT';
                    reason = 'ELIGIBLE_CONTACT_INQUIRY';
                }
            }
        } else if (isSubscribeButton || negativeSignals.some(s => s.startsWith('newsletter_token')) || (allInputs.length <= 2 && emailInputs.length >= 1)) {
            intent = isSubscribeButton ? 'SUBSCRIBE' : 'NEWSLETTER';
            if (!hasInquiryBodyField) {
                decision = 'REJECT';
                reason = intent === 'SUBSCRIBE' ? 'NON_INQUIRY_SUBSCRIBE_FORM' : 'NON_INQUIRY_NEWSLETTER_FORM';
            } else {
                const isPureNewsletter = !['contact', 'inquiry', '문의'].some(t => headingText.includes(t) || formId.includes(t));
                if (isPureNewsletter) {
                    decision = 'REJECT';
                    reason = 'NON_INQUIRY_NEWSLETTER_FORM';
                } else {
                    intent = 'CONTACT_INQUIRY';
                    decision = 'ACCEPT';
                    reason = 'ELIGIBLE_CONTACT_INQUIRY';
                }
            }
        } else if (negativeSignals.some(s => s.includes('login') || s.includes('sign in') || s.includes('password'))) {
            intent = 'LOGIN';
            decision = 'REJECT';
            reason = 'NON_INQUIRY_LOGIN_FORM';
        } else if (negativeSignals.some(s => s.includes('search')) || formAction.includes('search')) {
            intent = 'SEARCH';
            decision = 'REJECT';
            reason = 'NON_INQUIRY_SEARCH_FORM';
        } else if (hasInquiryBodyField) {
            // HARD RULE: Only eligible if genuine inquiry body field exists!
            intent = 'CONTACT_INQUIRY';
            decision = 'ACCEPT';
            reason = 'ELIGIBLE_CONTACT_INQUIRY';
            positiveSignals.push(`inquiry_body:${inquiryBody.type}`);
        } else {
            intent = 'OTHER';
            decision = 'REJECT';
            reason = 'NO_LONG_TEXT_INQUIRY_FIELD';
        }

        // HARD INVARIANT: If bodyCandidates === 0 / !hasInquiryBodyField, eligible can NEVER be true!
        if (!hasInquiryBodyField) {
            decision = 'REJECT';
            if (!reason) {
                reason = 'NO_LONG_TEXT_INQUIRY_FIELD';
            }
        }

        // Scoring: numeric score can NEVER override hard reject
        const score = decision === 'ACCEPT' ? (100 + positiveSignals.length * 50) : -999;

        const result = {
            eligible: decision === 'ACCEPT',
            isEligible: decision === 'ACCEPT',
            gatePassed: decision === 'ACCEPT',
            intent,
            formIntent: intent,
            bodyCandidates: hasInquiryBodyField ? 1 : 0,
            hasInquiryBodyField,
            longTextInquiry: hasInquiryBodyField,
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

        const confidence = (decision === 'ACCEPT' ? 0.95 : 0.85).toFixed(2);
        const negativeClass = negativeSignals[0] || 'none';
        console.log(`[LONG_TEXT_GATE] found=${hasInquiryBodyField} type=${inquiryBody ? inquiryBody.type : 'none'} semantic=${inquiryBody ? inquiryBody.semantic : 'none'}`);
        console.log(`[FORM_INTENT] intent=${intent} confidence=${confidence} negativeClass=${negativeClass}`);
        if (typeof console !== 'undefined' && console.log) {
            console.log(`[FORM_CLASSIFY] intent=${intent} eligible=${result.eligible} hasInquiryBody=${hasInquiryBodyField} bodyFieldType=${result.bodyFieldType || 'none'} decision=${decision} reason=${reason}`);
        }

        return result;
    }

    /**
     * AI Form Intent Classifier (Secondary Classifier)
     * Hard rule: AI can NEVER override longTextInquiry=false (R6.7-F9)
     */
    function classifyFormIntentWithAI(formEl, pageContext = {}) {
        const baseResult = classifyFormIntent(formEl, pageContext);
        
        // Structured AI evaluation representation
        const aiEvaluation = {
            intent: baseResult.intent,
            confidence: baseResult.eligible ? 0.95 : 0.85,
            longTextInquiry: baseResult.hasInquiryBodyField,
            reason: baseResult.reason
        };

        // Hard deterministic safety rule:
        // AI cannot mark a form eligible if longTextInquiry=false
        if (!aiEvaluation.longTextInquiry) {
            return {
                ...baseResult,
                eligible: false,
                aiDecision: 'REJECT_HARD_SAFETY_RULE',
                reason: baseResult.reason || 'NO_LONG_TEXT_INQUIRY_FIELD'
            };
        }

        return {
            ...baseResult,
            aiConfidence: aiEvaluation.confidence,
            aiReason: aiEvaluation.reason
        };
    }

    function findOptimalForm(container) {
        if (!container || !container.tagName) return null;
        const tag = container.tagName.toUpperCase();
        if (['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SPAN', 'LABEL', 'SELECT'].includes(tag)) {
            return null;
        }
        const classification = classifyFormIntent(container);
        if (!classification.eligible) {
            return null;
        }
        return container;
    }

    return {
        INQUIRY_SEMANTIC_TOKENS,
        NEWSLETTER_NEGATIVE_TOKENS,
        BOOKING_NEGATIVE_TOKENS,
        OTHER_NEGATIVE_TOKENS,
        isElementVisible,
        getElementContextText,
        detectInquiryBodyField,
        classifyFormIntent,
        classifyFormIntentWithAI,
        findOptimalForm
    };
}));
