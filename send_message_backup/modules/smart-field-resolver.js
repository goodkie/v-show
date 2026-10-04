/**
 * smart-field-resolver.js
 * AI-Assisted Smart Field Resolver with Strict Semantic Tiers & Privacy Protection
 * 
 * Tiers:
 * 1. Exact Template-Backed Mapping
 * 2. Deterministic Semantic Rules (Dropdowns, Checkboxes, Radios, Numerics, Common Qs)
 * 3. AI Fallback (Confidence-scored, strictly guarded against factual hallucinations)
 * 
 * Invariants:
 * - Cache decisions per form/session to avoid infinite loops or repeat calls
 * - Never fabricate financial, identity, or legal facts
 * - Never auto-consent to marketing/SMS checkboxes
 * - Message body field remains mandatory and must actually be filled (>= 10 chars)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./math-captcha-solver'], factory);
    } else if (typeof module === 'object' && module.exports) {
        let mcs;
        try { mcs = require('./math-captcha-solver'); } catch (_) {}
        module.exports = factory(mcs);
    } else {
        root.SmartFieldResolver = factory(root.MathCaptchaSolver);
    }
}(typeof self !== 'undefined' ? self : this, function (MathCaptchaSolver) {

    const _MathCaptchaSolver = (typeof MathCaptchaSolver !== 'undefined' && MathCaptchaSolver) ||
        (typeof self !== 'undefined' && self.MathCaptchaSolver) ||
        (typeof window !== 'undefined' && window.MathCaptchaSolver) ||
        (typeof require !== 'undefined' ? (function(){ try { return require('./math-captcha-solver'); } catch(_) { return null; } })() : null);

    const PRIVACY_CHECKBOX_KEYWORDS = [
        'privacy', 'terms', 'condition', 'policy', 'agree', 'consent', 'accurate', 
        '개인정보', '이용약관', '동의', '방침'
    ];

    const CONTACT_CONSENT_KEYWORDS = [
        'inquiry', 'contact me', 'respond', 'reply', 'communicate', '문의', '연락'
    ];

    const MARKETING_CHECKBOX_KEYWORDS = [
        'newsletter', 'marketing', 'promot', 'offer', 'discount', 'sms', 'text message', 
        'recurring', 'remember me', 'update', '광고', '마케팅', '수신동의', '혜택'
    ];

    const GENERIC_NUMERIC_KEYWORDS = [
        'attend', 'guest', 'people', 'number of', 'quantity', 'qty', 'count', 
        'participant', 'location', '참석', '인원', '수량'
    ];

    const SENSITIVE_FACT_KEYWORDS = [
        'revenue', 'annual', 'income', 'sales', 'turnover', 'profit',
        'employee', 'headcount', 'staff',
        'age', 'birth', 'dob', 'ssn', 'tax', 'ein', 'license', 'licence', 'account', 'id number',
        'budget', 'spend', 'invest', 'funding', 'years in business', 'postal', 'zip'
    ];

    const INQUIRY_OPTION_RANK = [
        'general inquiry', 'general question', 'general', 'contact us', 'inquiry', 
        'other', 'sales inquiry', 'sales', 'business inquiry', 'partnership', 
        'customer service', 'support', '일반 문의', '문의', '기타'
    ];

    const NEGATIVE_OPTION_KEYWORDS = [
        'newsletter', 'subscribe', 'career', 'job', 'employment', 'investor', 
        'promot', '채용', '구독'
    ];

    class SmartFieldResolver {
        constructor() {
            this.cache = new Map();
            this.attemptCounts = new Map();
            this.groupChoices = new Map();
        }

        getCacheKey(fieldContext, pageContext = {}) {
            const host = pageContext.host || (typeof window !== 'undefined' && window.location ? window.location.hostname : 'unknown');
            const formId = fieldContext.formId || 'form';
            const labelKey = (fieldContext.label || fieldContext.placeholder || fieldContext.ariaLabel || '').trim().toLowerCase().slice(0, 40).replace(/[^a-z0-9_]+/g, '_');
            const fieldSig = fieldContext.signature || 
                             fieldContext.id || 
                             fieldContext.name || 
                             fieldContext.selector || 
                             (labelKey ? `${labelKey}_${fieldContext.type || 'text'}` : `field_${fieldContext.type || 'text'}`);
            return `${host}::${formId}::${fieldSig}`;
        }

        /**
         * Main Resolution Pipeline
         */
        resolve(fieldContext, template = {}, pageContext = {}) {
            const cacheKey = this.getCacheKey(fieldContext, pageContext);
            const currentAttempts = (this.attemptCounts.get(cacheKey) || 0) + 1;
            this.attemptCounts.set(cacheKey, currentAttempts);

            // Bounded retry guard: max 2 resolution cycles per field
            if (currentAttempts > 2 && this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const ctxText = (
                (fieldContext.label || '') + ' ' + 
                (fieldContext.placeholder || '') + ' ' + 
                (fieldContext.name || '') + ' ' + 
                (fieldContext.id || '') + ' ' + 
                (fieldContext.ariaLabel || '') + ' ' + 
                (fieldContext.legend || '')
            ).toLowerCase();

            // ============================================================
            // Section E: Honeypot Protection (Never touch hidden/trap fields)
            // ============================================================
            const isHoneypot = fieldContext.isHoneypot ||
                fieldContext.tabIndex === -1 ||
                (fieldContext.style && (fieldContext.style.display === 'none' || fieldContext.style.visibility === 'hidden' || fieldContext.style.opacity === '0')) ||
                /\bhoneypot\b|\btrap\b|\bwebsite_url\b|\bbottom_field\b|leave.*blank|do not fill|leave unchanged/i.test(ctxText);

            if (isHoneypot) {
                const honeypotRes = { action: 'skip', reason: 'HONEYPOT_UNTOUCHED', confidence: 1.0, source: 'safety', fieldCategory: 'honeypot' };
                this.cache.set(cacheKey, honeypotRes);
                this.logDecision(fieldContext, honeypotRes);
                return honeypotRes;
            }

            // ============================================================
            // Section H: Human Verification Math Captcha Equation Solver
            // ============================================================
            if (fieldContext.type !== 'textarea' && !fieldContext.isInquiryBody && _MathCaptchaSolver && typeof _MathCaptchaSolver.solveMathCaptcha === 'function') {
                const mathVal = _MathCaptchaSolver.solveMathCaptcha(ctxText);
                if (mathVal !== null) {
                    const mathRes = {
                        action: 'fill',
                        value: String(mathVal),
                        confidence: 0.99,
                        source: 'math_captcha_solver',
                        fieldCategory: 'math_captcha'
                    };
                    this.cache.set(cacheKey, mathRes);
                    this.logDecision(fieldContext, mathRes);
                    return mathRes;
                }
            }

            // ============================================================
            // Tier 1: Exact Template-Backed Mapping
            // ============================================================
            const tier1Result = this.resolveTier1(fieldContext, ctxText, template);
            if (tier1Result) {
                this.cache.set(cacheKey, tier1Result);
                this.logDecision(fieldContext, tier1Result);
                return tier1Result;
            }

            // ============================================================
            // Tier 2: Deterministic Semantic Rules
            // ============================================================
            const tier2Result = this.resolveTier2(fieldContext, ctxText, template, pageContext);
            if (tier2Result) {
                this.cache.set(cacheKey, tier2Result);
                this.logDecision(fieldContext, tier2Result);
                return tier2Result;
            }

            // ============================================================
            // Tier 3: AI Fallback (Privacy Minimized & Hallucination Guarded)
            // ============================================================
            const tier3Result = this.resolveTier3(fieldContext, ctxText, template, pageContext);
            this.cache.set(cacheKey, tier3Result);
            this.logDecision(fieldContext, tier3Result);
            return tier3Result;
        }

        /**
         * Tier 1: Exact Template Matching
         */
        resolveTier1(fieldContext, ctxText, template) {
            const type = (fieldContext.type || 'text').toLowerCase();

            // Email
            if (type === 'email' || /\bemail\b|이메일/i.test(ctxText)) {
                if (template.email) {
                    return { action: 'fill', value: template.email, confidence: 1.0, source: 'template', fieldCategory: 'email' };
                }
            }

            // First Name
            if (/\bfirst.?name\b|fname|이름/i.test(ctxText) && !/\blast/i.test(ctxText)) {
                const val = template.first_name || template.firstName || (template.name ? template.name.split(' ')[0] : '');
                if (val) {
                    return { action: 'fill', value: val, confidence: 1.0, source: 'template', fieldCategory: 'first_name' };
                }
            }

            // Last Name
            if (/\blast.?name\b|lname|성/i.test(ctxText)) {
                const parts = (template.name || '').split(' ');
                const val = template.last_name || template.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]);
                if (val) {
                    return { action: 'fill', value: val, confidence: 1.0, source: 'template', fieldCategory: 'last_name' };
                }
            }

            // Full Name
            if (/\bname\b|성명/i.test(ctxText) && !/\b(company|user|file)\b/i.test(ctxText)) {
                const val = template.name || `${template.first_name || ''} ${template.last_name || ''}`.trim();
                if (val) {
                    return { action: 'fill', value: val, confidence: 1.0, source: 'template', fieldCategory: 'full_name' };
                }
            }

            // Phone
            if (type === 'tel' || /\bphone\b|\bmobile\b|\btel\b|전화|연락처/i.test(ctxText)) {
                if (template.phone) {
                    return { action: 'fill', value: template.phone, confidence: 1.0, source: 'template', fieldCategory: 'phone' };
                }
            }

            // Company
            if (/\b(company|organization|business)\b|회사|기업/i.test(ctxText)) {
                if (template.company) {
                    return { action: 'fill', value: template.company, confidence: 1.0, source: 'template', fieldCategory: 'company' };
                }
            }

            // Website / URL
            if (type === 'url' || /\b(website|url|homepage|web)\b|웹사이트|홈페이지/i.test(ctxText)) {
                if (template.website) {
                    return { action: 'fill', value: template.website, confidence: 1.0, source: 'template', fieldCategory: 'website' };
                }
            }

            // Subject
            if (/\b(subject|topic|title)\b|제목/i.test(ctxText)) {
                if (template.subject) {
                    return { action: 'fill', value: template.subject, confidence: 1.0, source: 'template', fieldCategory: 'subject' };
                }
            }

            // Message / Inquiry Body
            if (type === 'textarea' || fieldContext.isInquiryBody || /\b(message|inquiry|details|comment|comments|body)\b|내용|문의내용/i.test(ctxText)) {
                if (template.message) {
                    return { action: 'fill', value: template.message, confidence: 1.0, source: 'template', fieldCategory: 'message' };
                }
            }

            // Custom fields from template
            if (template.customFields && typeof template.customFields === 'object') {
                for (const [key, val] of Object.entries(template.customFields)) {
                    if (ctxText.includes(key.toLowerCase()) && val) {
                        return { action: 'fill', value: val, confidence: 1.0, source: 'template', fieldCategory: `custom:${key}` };
                    }
                }
            }

            return null;
        }

        /**
         * Tier 2: Deterministic Semantic Rules
         */
        resolveTier2(fieldContext, ctxText, template, pageContext) {
            const type = (fieldContext.type || 'text').toLowerCase();

            // 1. Native or Custom Dropdown (<select> or ARIA listbox)
            if (type === 'select' || fieldContext.options || fieldContext.isDropdown) {
                return this.resolveDropdown(fieldContext, ctxText);
            }

            // 2. Checkboxes
            if (type === 'checkbox') {
                return this.resolveCheckbox(fieldContext, ctxText);
            }

            // 3. Radio Groups
            if (type === 'radio') {
                return this.resolveRadio(fieldContext, ctxText, template);
            }

            // 4. Numeric Inputs
            if (type === 'number' || fieldContext.isNumeric) {
                return this.resolveNumeric(fieldContext, ctxText, template);
            }

            // 5. Unknown Text Questions / Form Fields
            if (type === 'text' || type === 'textarea') {
                // Inquiry-style questions: "How can we help?", "Reason for inquiry"
                if (/how can we help|tell us|reason for|what can we do|brief description|help with|문의.*이유|요청/i.test(ctxText)) {
                    const val = template.message || template.subject || "Inquiry regarding your services.";
                    return { action: 'fill', value: val, confidence: 0.90, source: 'semantic', fieldCategory: 'inquiry_question' };
                }

                // Attribution: "How did you hear about us?"
                if (/how did you hear|referral|source|경로|알게 된/i.test(ctxText)) {
                    return { action: 'fill', value: 'Online / Web Search', confidence: 0.88, source: 'safe_default', fieldCategory: 'attribution' };
                }

                // Factual questions absent from template: do NOT hallucinate
                const isFactual = SENSITIVE_FACT_KEYWORDS.some(k => ctxText.includes(k));
                if (isFactual) {
                    return { action: 'unresolved', reason: 'UNRESOLVED_REQUIRED_FACT', confidence: 0.95, source: 'semantic', fieldCategory: 'unknown_fact' };
                }
            }

            return null;
        }

        /**
         * Dropdown Semantic Selection
         */
        resolveDropdown(fieldContext, ctxText) {
            const options = fieldContext.options || [];
            if (!options.length) {
                return { action: 'skip', reason: 'NO_OPTIONS_FOUND', confidence: 0.5, source: 'semantic' };
            }

            // Filter out disabled or placeholder options
            const validOptions = options.filter(opt => {
                const text = (opt.text || opt.label || '').trim().toLowerCase();
                const val = (opt.value !== undefined ? String(opt.value) : '').trim().toLowerCase();
                if (opt.disabled) return false;
                if (!val && !text) return false;
                if (['', '0', '-1', 'none'].includes(val) && /select|choose|선택/i.test(text)) return false;
                if (/^(select|choose|--|please select|옵션 선택)/i.test(text)) return false;
                return true;
            });

            if (!validOptions.length) {
                return { action: 'skip', reason: 'ONLY_PLACEHOLDER_OPTIONS', confidence: 0.8, source: 'semantic' };
            }

            // 1. Rank by Inquiry Keyword match
            for (const rankKeyword of INQUIRY_OPTION_RANK) {
                const match = validOptions.find(opt => {
                    const text = (opt.text || opt.label || '').toLowerCase();
                    return text.includes(rankKeyword);
                });
                if (match) {
                    return {
                        action: 'select',
                        value: match.value !== undefined ? match.value : match.text,
                        label: match.text || match.label,
                        confidence: 0.94,
                        source: 'semantic',
                        fieldCategory: 'inquiry_type',
                        optionCategory: 'general_inquiry'
                    };
                }
            }

            // 2. Reject negative options (newsletter, subscribe, careers)
            const nonNegativeOptions = validOptions.filter(opt => {
                const text = (opt.text || opt.label || '').toLowerCase();
                return !NEGATIVE_OPTION_KEYWORDS.some(neg => text.includes(neg));
            });

            if (nonNegativeOptions.length > 0) {
                // Section E: Safe random choice for ordinary dropdowns, stable per form session
                const optKey = fieldContext.signature || fieldContext.id || fieldContext.name || 'dropdown';
                let chosen = this.groupChoices.get(optKey);
                if (!chosen || !nonNegativeOptions.some(o => (o.value !== undefined ? o.value : o.text) === (chosen.value !== undefined ? chosen.value : chosen.text))) {
                    const randIdx = Math.floor(Math.random() * nonNegativeOptions.length);
                    chosen = nonNegativeOptions[randIdx];
                    this.groupChoices.set(optKey, chosen);
                }
                return {
                    action: 'select',
                    value: chosen.value !== undefined ? chosen.value : chosen.text,
                    label: chosen.text || chosen.label,
                    confidence: 0.85,
                    source: 'random_safe_choice',
                    fieldCategory: 'general_dropdown',
                    optionCategory: 'safe_fallback'
                };
            }

            return { action: 'unresolved', reason: 'NO_ELIGIBLE_DROPDOWN_OPTION', confidence: 0.8, source: 'semantic' };
        }

        /**
         * Checkbox Semantic Evaluation
         */
        resolveCheckbox(fieldContext, ctxText) {
            const isRequired = !!fieldContext.required;

            // 1. Check for Marketing / SMS / Promotions (Never auto-consent)
            const isMarketing = MARKETING_CHECKBOX_KEYWORDS.some(k => ctxText.includes(k));
            if (isMarketing) {
                if (isRequired) {
                    // Mandatory marketing/SMS: DO NOT blindly consent (Comment 48 Section 5 & AI-FIELD-4)
                    return {
                        action: 'unresolved',
                        checked: false,
                        reason: 'UNRESOLVED_MANDATORY_MARKETING',
                        confidence: 0.95,
                        source: 'semantic',
                        fieldCategory: 'marketing'
                    };
                }
                // Optional marketing: leave unchecked
                return {
                    action: 'skip',
                    checked: false,
                    confidence: 0.95,
                    source: 'semantic',
                    fieldCategory: 'marketing'
                };
            }

            // 2. Privacy Policy / Terms / Accuracy acknowledgment (Auto-check visible required)
            const isPrivacyOrTerms = PRIVACY_CHECKBOX_KEYWORDS.some(k => ctxText.includes(k));
            const isContactConsent = CONTACT_CONSENT_KEYWORDS.some(k => ctxText.includes(k));

            if (isPrivacyOrTerms || isContactConsent) {
                // Auto-check allowed for required submission terms / inquiry response consent
                return {
                    action: 'check',
                    checked: true,
                    confidence: 0.96,
                    source: 'semantic',
                    fieldCategory: isPrivacyOrTerms ? 'privacy_ack' : 'contact_consent'
                };
            }

            // 3. Section E: Checkbox inquiry-choice groups (e.g. "I'm interested in...", program/service of interest)
            const isInquiryChoiceGroup = fieldContext.isChoiceGroup ||
                /interested in|interest|program|service|course|class|topic|category|관심|프로그램|서비스|분야/i.test(ctxText);

            if (isInquiryChoiceGroup && !isMarketing) {
                const groupKey = fieldContext.groupName || fieldContext.name || 'inquiry_choice_group';
                let selectedChoice = this.groupChoices.get(groupKey);
                const optIdentifier = fieldContext.value || fieldContext.id || fieldContext.label || 'opt_1';

                if (!selectedChoice) {
                    selectedChoice = optIdentifier;
                    this.groupChoices.set(groupKey, selectedChoice);
                }

                const isSelected = (selectedChoice === optIdentifier);
                return {
                    action: isSelected ? 'check' : 'skip',
                    checked: isSelected,
                    confidence: 0.90,
                    source: 'random_safe_choice',
                    fieldCategory: 'inquiry_choice_group'
                };
            }

            // Ambiguous checkbox
            if (isRequired) {
                return { action: 'unresolved', reason: 'AMBIGUOUS_REQUIRED_CHECKBOX', confidence: 0.6, source: 'semantic' };
            }
            return { action: 'skip', checked: false, confidence: 0.8, source: 'semantic' };
        }

        /**
         * Radio Group Semantic Evaluation
         */
        resolveRadio(fieldContext, ctxText, template) {
            const options = fieldContext.options || [];
            
            // Preferred Contact Method
            if (/contact method|preferred contact|how to reach|연락 방법/i.test(ctxText)) {
                // If template has email, prefer email
                const emailOpt = options.find(o => /email|이메일/i.test(o.label || o.text || ''));
                if (emailOpt && template.email) {
                    return { action: 'radio', value: emailOpt.value, confidence: 0.95, source: 'semantic', fieldCategory: 'contact_preference' };
                }
                const phoneOpt = options.find(o => /phone|call|전화/i.test(o.label || o.text || ''));
                if (phoneOpt && template.phone) {
                    return { action: 'radio', value: phoneOpt.value, confidence: 0.95, source: 'semantic', fieldCategory: 'contact_preference' };
                }
            }

            // Inquiry Type
            if (/inquiry|type|reason|category/i.test(ctxText)) {
                const genOpt = options.find(o => /general|other|inquiry|일반/i.test(o.label || o.text || ''));
                if (genOpt) {
                    return { action: 'radio', value: genOpt.value, confidence: 0.92, source: 'semantic', fieldCategory: 'inquiry_type' };
                }
            }

            if (fieldContext.required) {
                // Do not invent identity/business facts
                return { action: 'unresolved', reason: 'UNRESOLVED_REQUIRED_FACT', confidence: 0.9, source: 'semantic' };
            }

            return { action: 'skip', confidence: 0.7, source: 'semantic' };
        }

        /**
         * Numeric Input Resolution
         */
        resolveNumeric(fieldContext, ctxText, template) {
            const min = fieldContext.min !== undefined ? Number(fieldContext.min) : null;
            const max = fieldContext.max !== undefined ? Number(fieldContext.max) : null;
            const step = fieldContext.step !== undefined ? Number(fieldContext.step) : 1;

            // 1. Check if template or custom fields have explicit numeric value
            if (template.customFields) {
                for (const [k, v] of Object.entries(template.customFields)) {
                    if (ctxText.includes(k.toLowerCase()) && !isNaN(Number(v))) {
                        let num = Number(v);
                        if (min !== null) num = Math.max(min, num);
                        if (max !== null) num = Math.min(max, num);
                        return { action: 'number', value: String(num), confidence: 1.0, source: 'template', fieldCategory: 'custom_numeric' };
                    }
                }
            }

            // 2. Sensitive / Business Facts Check (Revenue, employees, age, budget)
            const isSensitiveFact = SENSITIVE_FACT_KEYWORDS.some(k => ctxText.includes(k));
            if (isSensitiveFact) {
                // NEVER fabricate unknown financial/business facts (Comment 48 Section 7 & AI-FIELD-6)
                return {
                    action: 'unresolved',
                    reason: 'UNRESOLVED_REQUIRED_FACT',
                    confidence: 0.98,
                    source: 'semantic',
                    fieldCategory: 'unknown_business_fact'
                };
            }

            // 3. Generic Operational Quantity Check (attendees, guests, quantity)
            const isGenericQuantity = GENERIC_NUMERIC_KEYWORDS.some(k => ctxText.includes(k));
            if (isGenericQuantity || fieldContext.required) {
                let safeVal = 1;
                if (min !== null && min > safeVal) safeVal = min;
                if (max !== null && max < safeVal) safeVal = max;
                return {
                    action: 'number',
                    value: String(safeVal),
                    confidence: 0.88,
                    source: 'safe_default',
                    fieldCategory: 'generic_quantity'
                };
            }

            return { action: 'skip', confidence: 0.7, source: 'semantic' };
        }

        /**
         * Tier 3: AI Fallback with strict confidence and privacy minimization
         */
        resolveTier3(fieldContext, ctxText, template, pageContext) {
            // Check if field requires sensitive or factual details absent from template
            const isSensitive = SENSITIVE_FACT_KEYWORDS.some(k => ctxText.includes(k));
            if (isSensitive) {
                return {
                    action: 'unresolved',
                    reason: 'UNRESOLVED_REQUIRED_FACT',
                    confidence: 0.95,
                    source: 'ai',
                    fieldCategory: 'sensitive_fact'
                };
            }

            // Safe structured generation for unknown inquiry questions (AI-FIELD-9)
            if (fieldContext.required && (fieldContext.type === 'text' || fieldContext.type === 'textarea')) {
                // Generate concise auxiliary answer based on template message/subject
                const conciseAnswer = template.subject ? `Regarding ${template.subject}` : 'General inquiry regarding services.';
                return {
                    action: 'fill',
                    value: conciseAnswer,
                    confidence: 0.85,
                    source: 'ai',
                    fieldCategory: 'auxiliary_question'
                };
            }

            // Low confidence fallback: return unresolved rather than guessing
            return {
                action: fieldContext.required ? 'unresolved' : 'skip',
                reason: 'LOW_CONFIDENCE_AI',
                confidence: 0.50,
                source: 'ai',
                fieldCategory: 'unknown'
            };
        }

        logDecision(fieldContext, decision) {
            if (typeof console === 'undefined' || !console.log) return;
            const type = fieldContext.type || 'text';
            const cat = decision.fieldCategory || 'unknown';
            const src = decision.source || 'unknown';
            const act = decision.action || 'skip';
            const conf = decision.confidence !== undefined ? decision.confidence.toFixed(2) : '1.00';
            const extra = decision.reason ? ` reason=${decision.reason}` : '';
            console.log(`[SMART_FIELD] type=${type} category=${cat} source=${src} confidence=${conf} action=${act}${extra} stable=true`);
        }

        /**
         * Generate Pre-Submit Audit Summary
         */
        generateSmartFillSummary(auditContext) {
            const {
                eligibleContact = false,
                messageField = false,
                messageFilled = false,
                messageLength = 0,
                fieldsSeen = 0,
                resolutions = [],
                dropdownsStable = true,
                checkboxesStable = true,
                radiosStable = true,
                numericStable = true
            } = auditContext;

            let templateMapped = 0;
            let semanticResolved = 0;
            let aiResolved = 0;
            let safeDefaults = 0;
            let unresolvedRequired = 0;
            let unresolvedOptional = 0;

            for (const r of resolutions) {
                if (r.action === 'unresolved') {
                    if (r.required) unresolvedRequired++;
                    else unresolvedOptional++;
                } else if (r.source === 'template') {
                    templateMapped++;
                } else if (r.source === 'semantic') {
                    semanticResolved++;
                } else if (r.source === 'ai') {
                    aiResolved++;
                } else if (r.source === 'safe_default') {
                    safeDefaults++;
                }
            }

            const readyToSubmit = eligibleContact &&
                messageField &&
                messageFilled &&
                messageLength >= 10 &&
                unresolvedRequired === 0 &&
                dropdownsStable &&
                checkboxesStable &&
                radiosStable &&
                numericStable;

            const summary = {
                eligibleContact,
                messageField,
                messageFilled,
                messageLength,
                fieldsSeen,
                templateMapped,
                semanticResolved,
                aiResolved,
                safeDefaults,
                unresolvedOptional,
                unresolvedRequired,
                dropdownsStable,
                checkboxesStable,
                radiosStable,
                numericStable,
                readyToSubmit
            };

            if (typeof console !== 'undefined' && console.log) {
                console.log(`[SMART_FILL_SUMMARY] eligibleContact=${eligibleContact} messageField=${messageField} messageFilled=${messageFilled} fieldsSeen=${fieldsSeen} templateMapped=${templateMapped} semanticResolved=${semanticResolved} aiResolved=${aiResolved} safeDefaults=${safeDefaults} unresolvedOptional=${unresolvedOptional} unresolvedRequired=${unresolvedRequired} dropdownsStable=${dropdownsStable} checkboxesStable=${checkboxesStable} radiosStable=${radiosStable} numericStable=${numericStable} readyToSubmit=${readyToSubmit}`);
            }

            return summary;
        }
    }

    return SmartFieldResolver;
}));
