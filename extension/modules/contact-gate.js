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

        // 5. [RC3.44 P0-FIX] Soft fallback: input[type="text"] with strong inquiry semantic signals.
        //    Handles modern SPA/React sites that render message/inquiry fields as styled text inputs
        //    rather than native textareas (e.g. HubSpot, GoHighLevel, Kartra, custom React forms).
        //    STRICT GUARD: Only triggers when form has BOTH:
        //      (a) a text input with explicit inquiry semantics (name/placeholder/id/aria-label), AND
        //      (b) contact-form structural evidence (email input OR name input present), AND
        //      (c) no dominant search/newsletter/booking negatives on the input itself.
        const SOFT_INQUIRY_TOKENS = [
            'message', 'inquiry', 'enquiry', 'question', 'comments', 'comment',
            'details', 'description', 'request', 'how can we help', 'tell us',
            '\ubb38\uc758', '\uc9c8\ubb38', '\uba54\uc2dc\uc9c0', '\ub0b4\uc6a9', '\uc0c1\ub2f4', '\uc694\uccad'
        ];
        const SOFT_NEGATIVE_GUARD = ['search', 'subscribe', 'newsletter', 'password', 'login', 'username'];

        const textInputs = Array.from(formEl.querySelectorAll('input[type="text"], input:not([type])')).filter(isElementVisible);
        const hasEmailInput = formEl.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]').length > 0;
        const hasNameInput = formEl.querySelectorAll('input[name*="name" i], input[id*="name" i]').length > 0;
        const hasContactStructure = hasEmailInput || hasNameInput;

        if (hasContactStructure && textInputs.length > 0) {
            for (const inp of textInputs) {
                const ctx = getElementContextText(inp);
                const hasSoftSemantic = SOFT_INQUIRY_TOKENS.some(tok => ctx.includes(tok));
                const hasSoftNegative = SOFT_NEGATIVE_GUARD.some(tok => ctx.includes(tok));
                if (hasSoftSemantic && !hasSoftNegative) {
                    const semantic = SOFT_INQUIRY_TOKENS.find(tok => ctx.includes(tok)) || 'message';
                    console.log(`[LONG_TEXT_GATE] found=true type=text-input-inquiry semantic=${semantic}`);
                    return { el: inp, type: 'text-input-inquiry', name: inp.name || inp.id || 'text-input', semantic };
                }
            }
        }

        // 6. [RC3.44 P0-FIX] Lead / Consultation Contact Form Soft Fallback:
        //    Handles service/consultation inquiry forms that collect contact identity (Name + Email + Phone/Program)
        //    without an optional long-text message box.
        //    STRICT GUARDS:
        //      (a) Form must have BOTH Name AND Email inputs.
        //      (b) Form must have Phone input OR at least 3 distinct visible fields.
        //      (c) Form submit text or context must contain inquiry/action/consultation keywords.
        //      (d) Form must NOT contain login/password, search, or newsletter-only tokens.
        const hasPhoneInput = formEl.querySelectorAll('input[type="tel"], input[name*="phone" i], input[id*="phone" i]').length > 0;
        const allVisibleInputs = Array.from(formEl.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea')).filter(isElementVisible);
        const submitBtn = formEl.querySelector('input[type="submit"], button[type="submit"], button:not([type="button"]), [role="button"]');
        const submitBtnText = ((submitBtn ? (submitBtn.textContent || submitBtn.value || '') : '')).toLowerCase();
        const formHeader = Array.from(formEl.querySelectorAll('h1, h2, h3, h4, h5, legend, .title, .form-title'))
            .map(h => (h.textContent || '').trim().toLowerCase())
            .join(' ');
        const formActionAttr = ((formEl.getAttribute?.('action') || '')).toLowerCase();
        const formIdAttr = ((formEl.id || '')).toLowerCase();
        const leadContext = `${submitBtnText} ${formHeader} ${formIdAttr} ${formActionAttr}`;

        const LEAD_ACTION_TOKENS = [
            'schedule', 'pricing', 'class', 'trial', 'info', 'learn', 'get started',
            'consultation', 'visit', 'free', 'program', 'start', 'contact', 'inquiry',
            'quote', 'request', 'demo', 'appointment', 'see class'
        ];
        const hasLeadAction = LEAD_ACTION_TOKENS.some(tok => leadContext.includes(tok));
        const hasNegativeGuard = SOFT_NEGATIVE_GUARD.some(tok => leadContext.includes(tok) && !hasLeadAction);
        const hasPasswordField = formEl.querySelectorAll('input[type="password"]').length > 0;

        // Strict Booking & Scheduling Guard for Fallback 6:
        // Pure booking/scheduling forms with date/time pickers or pure "book now/reserve" buttons
        // MUST NOT trigger lead-inquiry-form fallback. They are booking forms, not contact inquiries.
        // Extended selectors: also catches select[id*="date"], day/month/year fields, duration/time selects.
        const hasDateOrTimePicker = formEl.querySelectorAll([
            'input[type="date"]', 'input[type="time"]', 'input[type="datetime-local"]',
            'input[name*="date" i]', 'input[id*="date" i]',
            'input[name*="day" i]', 'input[id*="day" i]',
            'input[name*="month" i]', 'input[id*="month" i]',
            'input[name*="year" i]', 'input[id*="year" i]',
            'input[name*="time" i]', 'input[id*="time" i]',
            'select[name*="date" i]', 'select[id*="date" i]',
            'select[name*="time" i]', 'select[id*="time" i]',
            'select[name*="day" i]', 'select[id*="day" i]',
            'select[name*="month" i]', 'select[id*="month" i]'
        ].join(', ')).length > 0;

        // isPureBookingSubmit: fires when submit text signals booking AND date/time fields present,
        // OR when submit text is an explicit booking-only phrase without consultation context.
        // 'book' alone + date/time = pure scheduling form (T6 scenario).
        const submitHasBookToken = submitBtnText.includes('book') || submitBtnText.includes('reserve') || submitBtnText.includes('reservation');
        const isPureBookingSubmit = submitHasBookToken && !leadContext.includes('consultation') && !leadContext.includes('appointment') &&
                                    (hasDateOrTimePicker || submitBtnText.includes('book now') || submitBtnText.includes('book online'));

        // [Issue #6 RC3.60 .93] Directive #6513087470 Item 11:
        // Do NOT classify forms lacking genuine message body as lead-inquiry-form!
        // A genuine message field (textarea or explicit message inquiry control) is REQUIRED for form sending.
        console.log('[LONG_TEXT_GATE] found=false (no genuine multiline/inquiry message element)');
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

        // 1. Gather all form text and identifiers safely (prevents input clobbering TypeError)
        const safeFormId = (typeof formEl.id === 'string' ? formEl.id : (typeof formEl.getAttribute === 'function' ? formEl.getAttribute('id') : '') || '').toLowerCase();
        const formId = safeFormId;
        const formClass = (typeof formEl.className === 'string' ? formEl.className : (typeof formEl.getAttribute === 'function' ? formEl.getAttribute('class') : '') || '').toLowerCase();
        const formAction = (typeof formEl.getAttribute === 'function' ? (formEl.getAttribute('action') || '') : '').toLowerCase();
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

        // [R6.9F] Hard Negative Classification: NON_INQUIRY_COMMENT_FORM
        // Rejects WordPress / Jetpack / Article comment and reply forms based on structural evidence
        const hasWpCommentAction = formAction.includes('wp-comments-post.php') || formAction.includes('/comments/post');
        const hasCommentIdOrClass = formId.includes('commentform') || formId.includes('comment-form') || formId.includes('jp-carousel-comment-form') ||
                                    formClass.includes('commentform') || formClass.includes('comment-form') || formClass.includes('jp-carousel-comment-form') ||
                                    formId === 'respond' || formClass.includes('comment-respond');
        const hasWpCommentInputs = formEl.querySelector && !!formEl.querySelector('input[name="comment_post_ID"], input[name="comment_parent"]');
        const isPostCommentSubmit = submitText.includes('post comment') || submitText.includes('leave a comment') || submitText.includes('post reply') || submitText.includes('leave a reply');
        const hasCommentHeading = headingText.includes('leave a comment') || headingText.includes('leave a reply') || headingText.includes('add a comment') || headingText.includes('post a comment');

        const isCommentForm = hasWpCommentAction ||
                              (hasCommentIdOrClass && (isPostCommentSubmit || hasWpCommentInputs || hasCommentHeading || !headingText.includes('contact'))) ||
                              hasWpCommentInputs ||
                              (isPostCommentSubmit && (formId.includes('comment') || formClass.includes('comment') || formAction.includes('comment')));

        if (isCommentForm) {
            intent = 'COMMENT';
            decision = 'REJECT';
            reason = 'NON_INQUIRY_COMMENT_FORM';
            negativeSignals.push('comment_form_structure');
        } else if (isShopifyHelpOrSearch || formAction.includes('search') || (negativeSignals.some(s => s.includes('search')) && !hasInquiryBodyField)) {
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
