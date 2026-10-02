/**
 * contact-discovery-engine.js
 * 
 * High-Recall Contact Page & Form Discovery Ensemble (Issue #6 Comment #49)
 * 
 * Implements:
 * 1. Multi-source parallel candidate generation:
 *    - CommonPathFinder (prioritized english + localized multilingual paths)
 *    - AnchorSemanticFinder (nav/footer/buttons/drawers with semantic scoring & footer prior)
 *    - NavigationGraphFinder (shallow internal graph, max depth 2)
 *    - SitemapFinder (/sitemap.xml, robots declarations, sitemap index)
 *    - RobotsFinder (/robots.txt parsing)
 *    - StructuredDataFinder (JSON-LD ContactPage, contactPoint, schema.org)
 *    - SPARouteFinder (client-side router links, menu expansion re-scan)
 *    - ShadowDOMFinder (deep open shadow root traversal)
 *    - IframeSignalFinder (same-origin DOM / cross-origin diagnostic)
 *    - FormOnCurrentPageFinder (direct page inspection)
 *    - SemanticPageClassifier (pageIntent: CONTACT|SUPPORT|ABOUT|NEWSLETTER|LOGIN|OTHER)
 * 
 * 2. Candidate merge, canonical URL normalization (new URL), and multi-signal scoring model
 * 3. Bounded candidate verification ladder (Stages A -> B -> C -> D -> E: Exhausted)
 * 4. Hostname-level path cache: xpider_contact_discovery_cache_v1
 * 5. Compact discovery ledger and diagnostic taxonomy
 * 6. Strict compatibility with ContactGate and SmartFieldResolver (hard inquiry body gate)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./contact-gate.js'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const ContactGate = require('./contact-gate.js');
        module.exports = factory(ContactGate);
    } else {
        const exports = factory(root.ContactGate);
        root.ContactDiscoveryEngine = exports.ContactDiscoveryEngine;
        root.SniperDiscoveryEngine = exports.SniperDiscoveryEngine;
        root.SemanticGraphDiscoveryEngine = exports.SemanticGraphDiscoveryEngine;
        root.ContactDiscoveryEnsemble = exports.ContactDiscoveryEnsemble;
    }
}(typeof self !== 'undefined' ? self : this, function (ContactGate) {

    // ========================================================================
    // 1. Constants & Path Vocabulary
    // ========================================================================

    const COMMON_CONTACT_PATHS = [
        '/contact',
        '/contact-us',
        '/contactus',
        '/get-in-touch',
        '/getintouch',
        '/inquiry',
        '/inquiries',
        '/enquiry',
        '/enquiries',
        '/ask',
        '/questions',
        '/support/contact',
        '/support',
        '/help/contact',
        '/help',
        '/customer-service',
        '/about/contact',
        '/about-us/contact',
        '/company/contact',
        '/connect',
        '/reach-us',
        '/request-info',
        '/request-information',
        '/contact-form',
        // Multilingual & localized variants
        '/contacto',
        '/contactez-nous',
        '/kontakt',
        '/contatti',
        '/contato',
        '/문의',
        '/문의하기',
        '/고객센터',
        '/상담',
        '/상담문의'
    ];

    const POSITIVE_ANCHOR_TOKENS = [
        'contact', 'contact us', 'get in touch', 'reach us', 'reach out',
        'ask a question', 'send a message', 'request info', 'request information',
        'inquiry', 'inquiries', 'enquiry', 'enquiries', 'write to us', 'talk to us',
        'customer service', 'support', 'help desk', 'connect', 'feedback',
        '문의', '문의하기', '상담', '상담문의', '질문', '연락', '연락처', '고객지원', '고객센터',
        'contacto', 'contactez-nous', 'kontakt', 'contatti', 'contato', 'お問い合わせ'
    ];

    const NEGATIVE_ANCHOR_TOKENS = [
        'newsletter', 'subscribe', 'subscription', 'career', 'careers', 'job', 'jobs',
        'employment', 'login', 'log in', 'signin', 'sign in', 'signup', 'sign up',
        'register', 'cart', 'checkout', 'privacy', 'terms', 'cookie', 'blog', 'news',
        '구독', '채용', '로그인', '회원가입'
    ];

    const FAILURE_REASONS = {
        DISCOVERY_EXHAUSTED: 'CONTACT_DISCOVERY_EXHAUSTED',
        LOAD_FAILED: 'CONTACT_CANDIDATE_LOAD_FAILED',
        REDIRECT_EXTERNAL: 'CONTACT_CANDIDATE_REDIRECT_EXTERNAL',
        PAGE_NO_FORM: 'CONTACT_PAGE_NO_FORM',
        NON_CONTACT_FORM_ONLY: 'NON_CONTACT_FORM_ONLY',
        NO_INQUIRY_MESSAGE_FIELD: 'NO_INQUIRY_MESSAGE_FIELD',
        CROSS_ORIGIN_FORM_CANDIDATE: 'CROSS_ORIGIN_FORM_CANDIDATE',
        SITEMAP_PARSE_FAILED: 'SITEMAP_PARSE_FAILED',
        ROBOTS_FETCH_FAILED: 'ROBOTS_FETCH_FAILED'
    };

    // Performance budget defaults
    const DEFAULT_CONFIG = {
        maxUniqueCandidates: 25,
        maxVerifiedPages: 10,
        maxGraphDepth: 2,
        maxSitemapEntries: 50,
        discoveryTimeoutMs: 30000,
        candidateTimeoutMs: 8000
    };

    // ========================================================================
    // 2. Safe URL Normalizer & Resolver (Section 21 Regression Guard)
    // ========================================================================

    const NON_HTML_DOWNLOADABLE_EXTENSIONS = /\.(vcf|ics|ical|ifb|msg|eml|pdf|doc|docx|rtf|odt|xls|xlsx|csv|tsv|ppt|pptx|zip|rar|7z|tar|gz|bz2|exe|msi|bat|cmd|sh|apk|dmg|pkg|bin|mp3|wav|ogg|mp4|avi|mov|mkv|webm|jpg|jpeg|png|gif|svg|webp|ico|bmp|tiff|xml|json)(\?.*)?$/i;

    function isMeaningfulContactPath(pathOrUrl) {
        if (!pathOrUrl || typeof pathOrUrl !== 'string') return false;
        let pathname = pathOrUrl.trim();
        try {
            if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
                pathname = new URL(pathname).pathname;
            }
        } catch (_) {}
        const clean = pathname.split('?')[0].split('#')[0].trim();
        // [Issue #6 R4.1] Root "/" and "" are VALID source/homepage paths
        if (!clean || clean === '/' || clean === '') return true;
        // Reject empty slug extension-only paths like /.html, /.php, /.asp, /.aspx, or /dir/.html
        if (/(^|\/)\.(html?|php|asp|aspx)$/i.test(clean)) return false;
        return true;
    }

    function resolveCandidateUrl(candidate, baseUrl) {
        if (!candidate || typeof candidate !== 'string') return null;
        const trimmed = candidate.trim();
        if (!trimmed) return null;
        if (/^(javascript|mailto|tel|data|blob|callto|sms):/i.test(trimmed)) return null;

        try {
            // MUST use new URL(candidate, baseUrl) - NEVER string concatenate base + candidate
            const parsed = new URL(trimmed, baseUrl);
            parsed.hash = ''; // strip fragments
            // strip tracking query params
            parsed.searchParams.delete('utm_source');
            parsed.searchParams.delete('utm_medium');
            parsed.searchParams.delete('utm_campaign');
            parsed.searchParams.delete('fbclid');
            parsed.searchParams.delete('gclid');

            let pathname = parsed.pathname;
            if (NON_HTML_DOWNLOADABLE_EXTENSIONS.test(pathname)) {
                return null;
            }
            if (!isMeaningfulContactPath(pathname)) {
                return null;
            }
            if (pathname.length > 1 && pathname.endsWith('/')) {
                pathname = pathname.slice(0, -1);
            }
            parsed.pathname = pathname;
            return parsed.href;
        } catch (e) {
            return null;
        }
    }

    function isSameOrigin(urlStr, baseUrl) {
        try {
            const u1 = new URL(urlStr);
            const u2 = new URL(baseUrl);
            return u1.origin === u2.origin;
        } catch (e) {
            return false;
        }
    }

    function getPathOnly(urlStr) {
        try {
            const u = new URL(urlStr);
            return u.pathname + (u.search || '');
        } catch (e) {
            return urlStr;
        }
    }

    function pathMatchesContactToken(pathStr) {
        if (!pathStr) return false;
        let normalized = pathStr.toLowerCase();
        try { normalized = decodeURIComponent(normalized); } catch (_) {}
        return POSITIVE_ANCHOR_TOKENS.some(tok => {
            const hyphenated = tok.replace(/\s+/g, '-');
            const underscored = tok.replace(/\s+/g, '_');
            const squished = tok.replace(/\s+/g, '');
            return normalized.includes(tok) || 
                   normalized.includes(hyphenated) || 
                   normalized.includes(underscored) || 
                   normalized.includes(squished);
        });
    }

    // ========================================================================
    // 3. Finders Implementation
    // ========================================================================

    const CommonPathFinder = {
        name: 'common_path',
        find(baseUrl, customPaths = []) {
            const paths = customPaths.length > 0 ? customPaths : COMMON_CONTACT_PATHS;
            const candidates = [];
            for (const p of paths) {
                const fullUrl = resolveCandidateUrl(p, baseUrl);
                if (fullUrl) {
                    candidates.push({
                        url: fullUrl,
                        source: 'common_path',
                        confidence: 0.70,
                        signals: ['common_path_match', p],
                        negativeSignals: [],
                        depth: 1,
                        sameOrigin: true
                    });
                }
            }
            return candidates;
        }
    };

    const AnchorSemanticFinder = {
        name: 'anchor',
        find(doc, baseUrl) {
            if (!doc || !doc.querySelectorAll) return [];
            const anchors = Array.from(doc.querySelectorAll('a, button[data-href], [role="link"]'));
            const candidates = [];

            for (const a of anchors) {
                if (a.hasAttribute && a.hasAttribute('download')) continue;
                const rawHref = a.getAttribute('href') || a.getAttribute('data-href') || '';
                if (/^(javascript|mailto|tel|data|blob|callto|sms):/i.test(rawHref.trim())) continue;
                if (NON_HTML_DOWNLOADABLE_EXTENSIONS.test(rawHref.trim())) continue;
                const fullUrl = resolveCandidateUrl(rawHref, baseUrl);
                if (!fullUrl) continue;

                const text = ((a.textContent || '') + ' ' + (a.getAttribute('aria-label') || '') + ' ' + (a.getAttribute('title') || '')).toLowerCase().trim();
                const path = getPathOnly(fullUrl).toLowerCase();

                // Check positive match
                const positiveMatch = POSITIVE_ANCHOR_TOKENS.find(tok => text.includes(tok) || path.includes(tok)) || 
                                     (pathMatchesContactToken(path) ? 'path_match' : null);
                if (!positiveMatch) continue;

                // Check negative match
                const isNegative = NEGATIVE_ANCHOR_TOKENS.some(tok => text.includes(tok) && !text.includes('contact'));

                // Location context check (footer or nav gets higher prior)
                let isFooter = false;
                let isNav = false;
                try {
                    isFooter = !!(a.closest && a.closest('footer, .footer, #footer, [class*="footer"], [id*="footer"]'));
                    isNav = !!(a.closest && a.closest('nav, .nav, header, [role="navigation"], [class*="menu"]'));
                } catch (_) {}

                const signals = [`anchor_text:${positiveMatch}`];
                if (isFooter) signals.push('footer_context');
                if (isNav) signals.push('nav_context');
                if (path.includes('contact') || path.includes('inquiry')) signals.push('path_contact');

                candidates.push({
                    url: fullUrl,
                    source: 'anchor',
                    confidence: isFooter ? 0.88 : (isNav ? 0.85 : 0.75),
                    signals,
                    negativeSignals: isNegative ? ['newsletter_or_auth'] : [],
                    depth: 1,
                    sameOrigin: isSameOrigin(fullUrl, baseUrl),
                    isFooter,
                    isNav
                });
            }

            return candidates;
        }
    };

    const SitemapFinder = {
        name: 'sitemap',
        parseXml(xmlText, baseUrl) {
            const candidates = [];
            if (!xmlText || typeof xmlText !== 'string') return candidates;

            // Bounded regex extraction of <loc> elements
            const locRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
            let match;
            let count = 0;
            const maxEntries = 100;

            while ((match = locRegex.exec(xmlText)) !== null && count < maxEntries) {
                count++;
                const rawUrl = match[1].trim();
                const resolved = resolveCandidateUrl(rawUrl, baseUrl);
                if (!resolved) continue;

                const path = getPathOnly(resolved).toLowerCase();
                const hasContactKeyword = pathMatchesContactToken(path);

                if (hasContactKeyword) {
                    candidates.push({
                        url: resolved,
                        source: 'sitemap',
                        confidence: 0.80,
                        signals: ['sitemap_loc_match', path],
                        negativeSignals: [],
                        depth: 1,
                        sameOrigin: isSameOrigin(resolved, baseUrl)
                    });
                }
            }

            return candidates;
        }
    };

    const RobotsFinder = {
        name: 'robots',
        parseRobots(robotsText, baseUrl) {
            const sitemaps = [];
            const hintedPaths = [];
            if (!robotsText || typeof robotsText !== 'string') return { sitemaps, hintedPaths };

            const lines = robotsText.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (/^sitemap:\s*(https?:\/\/.+)/i.test(trimmed)) {
                    const smMatch = trimmed.match(/^sitemap:\s*(https?:\/\/.+)/i);
                    if (smMatch && smMatch[1]) {
                        const smUrl = resolveCandidateUrl(smMatch[1].trim(), baseUrl);
                        if (smUrl) sitemaps.push(smUrl);
                    }
                } else if (/^(allow|disallow):\s*(\/[^\s#]+)/i.test(trimmed)) {
                    const pathMatch = trimmed.match(/^(allow|disallow):\s*(\/[^\s#]+)/i);
                    if (pathMatch && pathMatch[2]) {
                        const p = pathMatch[2].toLowerCase();
                        if (POSITIVE_ANCHOR_TOKENS.some(tok => p.includes(tok))) {
                            const resolved = resolveCandidateUrl(pathMatch[2], baseUrl);
                            if (resolved) hintedPaths.push(resolved);
                        }
                    }
                }
            }
            return { sitemaps, hintedPaths };
        }
    };

    const StructuredDataFinder = {
        name: 'jsonld',
        find(doc, baseUrl) {
            if (!doc || !doc.querySelectorAll) return [];
            const candidates = [];

            // 1. Inspect <script type="application/ld+json">
            const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
            for (const s of scripts) {
                try {
                    const text = s.textContent || s.innerText || '';
                    if (!text.trim()) continue;
                    const data = JSON.parse(text);
                    this.extractFromJsonLd(data, baseUrl, candidates);
                } catch (_) {}
            }

            // 2. Inspect <link rel="help" / rel="contact">
            const helpLinks = Array.from(doc.querySelectorAll('link[rel="help"], link[rel="contact"]'));
            for (const l of helpLinks) {
                const href = l.getAttribute('href');
                const resolved = resolveCandidateUrl(href, baseUrl);
                if (resolved) {
                    candidates.push({
                        url: resolved,
                        source: 'jsonld',
                        confidence: 0.85,
                        signals: ['rel_help_or_contact_link'],
                        negativeSignals: [],
                        depth: 1,
                        sameOrigin: isSameOrigin(resolved, baseUrl)
                    });
                }
            }

            return candidates;
        },

        extractFromJsonLd(node, baseUrl, candidates) {
            if (!node || typeof node !== 'object') return;

            if (Array.isArray(node)) {
                for (const item of node) this.extractFromJsonLd(item, baseUrl, candidates);
                return;
            }

            const type = (node['@type'] || '').toString();
            // ContactPage type
            if (/ContactPage/i.test(type)) {
                const targetUrl = node.url || node.id || node['@id'] || (node.mainEntityOfPage ? (typeof node.mainEntityOfPage === 'string' ? node.mainEntityOfPage : node.mainEntityOfPage.url) : null);
                if (targetUrl) {
                    const resolved = resolveCandidateUrl(String(targetUrl), baseUrl);
                    if (resolved) {
                        candidates.push({
                            url: resolved,
                            source: 'jsonld',
                            confidence: 0.95,
                            signals: ['schema_ContactPage', targetUrl],
                            negativeSignals: [],
                            depth: 1,
                            sameOrigin: isSameOrigin(resolved, baseUrl)
                        });
                    }
                }
            }

            // contactPoint / ContactPoint
            if (/ContactPoint/i.test(type) || node.contactPoint) {
                const cp = node.contactPoint || node;
                if (cp && cp.url) {
                    const resolved = resolveCandidateUrl(String(cp.url), baseUrl);
                    if (resolved) {
                        candidates.push({
                            url: resolved,
                            source: 'jsonld',
                            confidence: 0.90,
                            signals: ['schema_ContactPoint_url', cp.url],
                            negativeSignals: [],
                            depth: 1,
                            sameOrigin: isSameOrigin(resolved, baseUrl)
                        });
                    }
                }
            }

            for (const val of Object.values(node)) {
                if (val && typeof val === 'object') {
                    this.extractFromJsonLd(val, baseUrl, candidates);
                }
            }
        }
    };

    const SPARouteFinder = {
        name: 'spa',
        find(doc, baseUrl, triggerMenu = true) {
            if (!doc || !doc.querySelectorAll) return [];
            const candidates = [];

            // If requested, attempt one bounded menu/nav expansion if contact links aren't visible
            if (triggerMenu) {
                try {
                    const menuBtn = doc.querySelector('.menu-toggle, .navbar-toggler, [aria-label*="menu" i], [aria-label*="navigation" i], .hamburger, #menu-btn');
                    if (menuBtn && typeof menuBtn.click === 'function' && !menuBtn.__xpider_clicked) {
                        menuBtn.__xpider_clicked = true;
                        menuBtn.click();
                        // Re-scan anchors after menu click
                        const postMenuAnchors = AnchorSemanticFinder.find(doc, baseUrl);
                        for (const c of postMenuAnchors) {
                            c.source = 'spa';
                            c.signals.push('spa_menu_expansion');
                            candidates.push(c);
                        }
                    }
                } catch (_) {}
            }

            // Scan router links: [routerlink], [to], data-route, button with nav actions
            const routerEls = Array.from(doc.querySelectorAll('[routerlink], [data-route], [data-path], [to]'));
            for (const el of routerEls) {
                const target = el.getAttribute('routerlink') || el.getAttribute('data-route') || el.getAttribute('data-path') || el.getAttribute('to');
                const resolved = resolveCandidateUrl(target, baseUrl);
                if (!resolved) continue;

                const text = (el.textContent || '').toLowerCase();
                const path = getPathOnly(resolved).toLowerCase();
                if (POSITIVE_ANCHOR_TOKENS.some(tok => text.includes(tok) || path.includes(tok))) {
                    candidates.push({
                        url: resolved,
                        source: 'spa',
                        confidence: 0.82,
                        signals: ['spa_router_link', target],
                        negativeSignals: [],
                        depth: 1,
                        sameOrigin: isSameOrigin(resolved, baseUrl)
                    });
                }
            }

            return candidates;
        }
    };

    const ShadowDOMFinder = {
        name: 'shadow_dom',
        find(doc, baseUrl, maxDepth = 4) {
            if (!doc) return [];
            const candidates = [];
            const visitedRoots = new Set();

            const traverse = (node, depth) => {
                if (!node || depth > maxDepth) return;

                if (node.shadowRoot && !visitedRoots.has(node.shadowRoot)) {
                    visitedRoots.add(node.shadowRoot);
                    // Extract anchors from shadow root
                    const anchors = AnchorSemanticFinder.find(node.shadowRoot, baseUrl);
                    for (const a of anchors) {
                        a.source = 'shadow_dom';
                        a.signals.push('open_shadow_root');
                        candidates.push(a);
                    }
                    Array.from(node.shadowRoot.children || []).forEach(child => traverse(child, depth + 1));
                }

                Array.from(node.children || []).forEach(child => traverse(child, depth + 1));
            };

            try {
                traverse(doc.body || doc.documentElement || doc, 0);
            } catch (_) {}

            return candidates;
        }
    };

    const IframeSignalFinder = {
        name: 'iframe',
        find(doc, baseUrl) {
            if (!doc || !doc.querySelectorAll) return [];
            const iframes = Array.from(doc.querySelectorAll('iframe'));
            const candidates = [];

            for (const iframe of iframes) {
                const src = iframe.getAttribute('src');
                const title = (iframe.getAttribute('title') || '').toLowerCase();
                const name = (iframe.getAttribute('name') || '').toLowerCase();

                // Path A: src-based candidate (contact-related iframe by URL/title/name)
                if (src) {
                    const resolved = resolveCandidateUrl(src, baseUrl);
                    const isContactRelated = POSITIVE_ANCHOR_TOKENS.some(tok =>
                        title.includes(tok) || name.includes(tok) ||
                        (resolved && resolved.toLowerCase().includes(tok))
                    );
                    if (isContactRelated) {
                        const sameOrigin = resolved ? isSameOrigin(resolved, baseUrl) : false;
                        candidates.push({
                            url: resolved || src,
                            source: 'iframe',
                            confidence: sameOrigin ? 0.75 : 0.40,
                            signals: [sameOrigin ? 'same_origin_iframe' : 'cross_origin_iframe', `title:${title}`],
                            negativeSignals: sameOrigin ? [] : [FAILURE_REASONS.CROSS_ORIGIN_FORM_CANDIDATE],
                            depth: 1,
                            sameOrigin,
                            isCrossOriginIframe: !sameOrigin
                        });
                    }
                }

                // Path B: contentDocument traversal (same-origin accessible iframes, e.g. dynamic / no-src)
                try {
                    const ifrDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                    if (ifrDoc && ifrDoc.querySelectorAll) {
                        const links = Array.from(ifrDoc.querySelectorAll('a'));
                        for (const a of links) {
                            const href = a.getAttribute('href') || '';
                            if (!href || /^(javascript|mailto|tel|data):/i.test(href)) continue;
                            const fullUrl = resolveCandidateUrl(href, baseUrl);
                            if (!fullUrl) continue;
                            const linkText = ((a.textContent || '') + ' ' + (a.getAttribute('aria-label') || '')).toLowerCase();
                            const linkPath = (fullUrl).toLowerCase();
                            const isContact = POSITIVE_ANCHOR_TOKENS.some(tok =>
                                linkText.includes(tok) || linkPath.includes(tok)
                            );
                            if (isContact) {
                                candidates.push({
                                    url: fullUrl,
                                    source: 'iframe_content_doc',
                                    confidence: 0.70,
                                    signals: ['same_origin_iframe_content_doc'],
                                    negativeSignals: [],
                                    depth: 1,
                                    sameOrigin: true,
                                    isCrossOriginIframe: false
                                });
                            }
                        }
                    }
                } catch (_) {}
            }

            return candidates;
        }
    };

    const FormOnCurrentPageFinder = {
        name: 'form_current',
        find(doc, baseUrl) {
            if (!doc || !doc.querySelectorAll) return [];
            const candidates = [];

            // Check if current page itself contains an eligible inquiry form
            const forms = Array.from(doc.querySelectorAll('form, .wpcf7-form, .gform_wrapper, [id*="contact-form"], [class*="contact-form"]'));
            for (const form of forms) {
                if (ContactGate && typeof ContactGate.classifyFormIntent === 'function') {
                    const classification = ContactGate.classifyFormIntent(form);
                    if (classification.eligible) {
                        candidates.push({
                            url: baseUrl,
                            source: 'form_current',
                            confidence: 1.0,
                            signals: ['direct_eligible_form_on_page', `body:${classification.bodyFieldType}`],
                            negativeSignals: [],
                            depth: 0,
                            sameOrigin: true,
                            hasEligibleForm: true
                        });
                        break;
                    }
                }
            }

            return candidates;
        }
    };

    const SemanticPageClassifier = {
        classify(doc, urlStr) {
            if (!doc) {
                return { pageIntent: 'OTHER', contactConfidence: 0.0, hasEligibleInquiryForm: false, signals: [] };
            }

            const title = (doc.title || '').toLowerCase();
            const headings = Array.from(doc.querySelectorAll('h1, h2, h3')).map(h => (h.textContent || '').toLowerCase()).join(' ');
            const bodyText = (doc.body ? doc.body.innerText || doc.body.textContent || '' : '').toLowerCase().slice(0, 3000);
            const path = getPathOnly(urlStr).toLowerCase();

            const signals = [];
            let score = 0;

            // URL signals
            if (POSITIVE_ANCHOR_TOKENS.some(tok => path.includes(tok))) {
                score += 35;
                signals.push('url_contact_keyword');
            }

            // Title / H1 signals
            if (POSITIVE_ANCHOR_TOKENS.some(tok => title.includes(tok) || headings.includes(tok))) {
                score += 30;
                signals.push('title_or_heading_match');
            }

            // Contact details presence (email, phone, address block)
            if (/mailto:|tel:|phone:|email:|전화|이메일/i.test(bodyText)) {
                score += 15;
                signals.push('contact_details_present');
            }

            // Form inspection
            let hasEligibleForm = false;
            let hasNewsletterOnly = false;

            const forms = Array.from(doc.querySelectorAll('form, [id*="form"], [class*="form"]'));
            for (const f of forms) {
                if (ContactGate && typeof ContactGate.classifyFormIntent === 'function') {
                    const c = ContactGate.classifyFormIntent(f);
                    if (c.eligible) {
                        hasEligibleForm = true;
                        score += 50;
                        signals.push('eligible_form_detected');
                        break;
                    } else if (c.intent === 'NEWSLETTER') {
                        hasNewsletterOnly = true;
                    }
                }
            }

            if (hasNewsletterOnly && !hasEligibleForm) {
                score -= 30;
                signals.push('newsletter_only_penalty');
            }

            let pageIntent = 'OTHER';
            if (score >= 40) pageIntent = 'CONTACT';
            else if (/support|help|고객센터/i.test(path) || /support|help/i.test(title)) pageIntent = 'SUPPORT';
            else if (/about|company|회사소개/i.test(path)) pageIntent = 'ABOUT';
            else if (hasNewsletterOnly) pageIntent = 'NEWSLETTER';

            return {
                pageIntent,
                contactConfidence: Math.min(1.0, Math.max(0.0, score / 100)),
                hasEligibleInquiryForm: hasEligibleForm,
                signals
            };
        }
    };

    // ========================================================================
    // 3.1 ENGINE 1 — Sniper URL / Route Discovery (Issue #6 R5)
    // ========================================================================

    const SniperDiscoveryEngine = {
        name: 'SniperURLRouteEngine',
        healthCache: new Map(), // hostname -> { url, lastStatus, lastVerifiedForm, successTimestamp, failCount }

        getKnownGood(host) {
            if (!host) return null;
            const rec = this.healthCache.get(host);
            if (!rec || rec.failCount >= 2) return null;
            return rec.url;
        },

        recordResult(host, url, success, formVerified = false) {
            if (!host) return;
            const rec = this.healthCache.get(host) || { url, failCount: 0 };
            if (success) {
                rec.url = url;
                rec.lastStatus = 200;
                rec.lastVerifiedForm = formVerified;
                rec.successTimestamp = Date.now();
                rec.failCount = 0;
            } else {
                rec.failCount = (rec.failCount || 0) + 1;
            }
            this.healthCache.set(host, rec);
        },

        generateCommonPaths(baseUrl) {
            return CommonPathFinder.find(baseUrl);
        },

        async discover(baseUrl, options = {}) {
            let u;
            try {
                u = new URL(baseUrl);
            } catch (_) {
                return [];
            }
            const candidates = [];
            const host = u.hostname;

            // 1. Root source URL (validated)
            const rootCandidate = resolveCandidateUrl(u.origin + '/', baseUrl);
            if (rootCandidate) {
                candidates.push({
                    url: rootCandidate,
                    source: 'sniper_root_source',
                    confidence: 0.90,
                    signals: ['root_source_url'],
                    negativeSignals: [],
                    depth: 0,
                    sameOrigin: true
                });
            }

            // 2. Prior known-good cached path
            const cached = this.getKnownGood(host);
            if (cached) {
                const res = resolveCandidateUrl(cached, baseUrl);
                if (res) {
                    candidates.push({
                        url: res,
                        source: 'cache_prior',
                        confidence: 0.98,
                        signals: ['cached_known_good_path'],
                        negativeSignals: [],
                        depth: 1,
                        sameOrigin: isSameOrigin(res, baseUrl)
                    });
                }
            }

            // 3. Common contact paths (guaranteed non-empty slug only)
            const commonPaths = this.generateCommonPaths(baseUrl);
            for (const cp of commonPaths) {
                candidates.push(cp);
            }

            // 4. Sitemap declarations & sitemap.xml
            if (options.sitemapXml) {
                try {
                    const smCands = SitemapFinder.parseXml(options.sitemapXml, baseUrl);
                    candidates.push(...smCands);
                } catch (_) {}
            }

            // 5. Robots.txt
            if (options.robotsTxt) {
                try {
                    const rb = RobotsFinder.parse(options.robotsTxt, baseUrl);
                    for (const p of rb.hintedPaths || []) {
                        candidates.push({
                            url: p,
                            source: 'sitemap_robots',
                            confidence: 0.85,
                            signals: ['robots_hinted_path'],
                            negativeSignals: [],
                            depth: 1,
                            sameOrigin: isSameOrigin(p, baseUrl)
                        });
                    }
                } catch (_) {}
            }

            return candidates;
        }
    };

    // ========================================================================
    // 3.2 ENGINE 2 — Semantic DOM / Graph Discovery (Issue #6 R5)
    // ========================================================================

    const SemanticGraphDiscoveryEngine = {
        name: 'SemanticDOMGraphEngine',

        scanSemanticLinks(doc, baseUrl) {
            if (!doc) return [];
            return AnchorSemanticFinder.find(doc, baseUrl);
        },

        expandHiddenMenus(doc) {
            if (!doc || !doc.querySelectorAll) return 0;
            let expandedCount = 0;
            const triggers = Array.from(doc.querySelectorAll('button, a, [role="button"], .hamburger, .menu-toggle, [aria-label*="menu" i], [aria-label*="navigation" i]'));
            for (const btn of triggers.slice(0, 3)) {
                try {
                    const isExpanded = btn.getAttribute('aria-expanded') === 'true';
                    if (!isExpanded && typeof btn.click === 'function') {
                        btn.click();
                        expandedCount++;
                        break; // max 1 expansion cycle
                    }
                } catch (_) {}
            }
            return expandedCount;
        },

        traverseShadowDOM(doc, baseUrl) {
            if (!doc) return [];
            return ShadowDOMFinder.find(doc, baseUrl);
        },

        traverseIframes(doc, baseUrl) {
            if (!doc) return [];
            return IframeSignalFinder.find(doc, baseUrl);
        },

        expandGraph(outgoingUrls, nodeUrl, baseUrl, depth = 1) {
            if (!Array.isArray(outgoingUrls) || depth > 2) return [];
            const candidates = [];
            for (const raw of outgoingUrls) {
                const resolved = resolveCandidateUrl(raw, baseUrl);
                if (resolved && isSameOrigin(resolved, baseUrl)) {
                    const p = getPathOnly(resolved).toLowerCase();
                    if (POSITIVE_ANCHOR_TOKENS.some(tok => p.includes(tok))) {
                        candidates.push({
                            url: resolved,
                            source: 'graph',
                            confidence: depth === 1 ? 0.80 : 0.65,
                            signals: [`graph_depth_${depth}`, `from:${getPathOnly(nodeUrl)}`],
                            negativeSignals: [],
                            depth,
                            sameOrigin: true
                        });
                    }
                }
            }
            return candidates;
        },

        classifyIntent(doc, urlStr) {
            return SemanticPageClassifier.classify(doc, urlStr);
        },

        async discover(doc, baseUrl, options = {}) {
            const candidates = [];
            if (!doc) return candidates;

            // 1. Direct form check on current page
            try {
                const curForms = FormOnCurrentPageFinder.find(doc, baseUrl);
                candidates.push(...curForms);
            } catch (_) {}

            // 2. Semantic link scan (header, footer, nav, mobile menu)
            try {
                const links = this.scanSemanticLinks(doc, baseUrl);
                candidates.push(...links);
            } catch (_) {}

            // 3. Hidden menu expansion (max 1 cycle)
            if (options.expandMenus !== false) {
                try {
                    const expanded = this.expandHiddenMenus(doc);
                    if (expanded > 0) {
                        const afterExpand = this.scanSemanticLinks(doc, baseUrl);
                        candidates.push(...afterExpand);
                    }
                } catch (_) {}
            }

            // 4. Open ShadowDOM traversal
            try {
                const shadow = this.traverseShadowDOM(doc, baseUrl);
                candidates.push(...shadow);
            } catch (_) {}

            // 5. Same-origin iframe traversal
            try {
                const iframes = this.traverseIframes(doc, baseUrl);
                candidates.push(...iframes);
            } catch (_) {}

            // 6. Structured data JSON-LD
            try {
                const jsonld = StructuredDataFinder.find(doc, baseUrl);
                candidates.push(...jsonld);
            } catch (_) {}

            return candidates;
        }
    };

    // ========================================================================
    // 3.3 ContactDiscoveryEnsemble (Fault-tolerant Dual-Engine Orchestrator)
    // ========================================================================

    class ContactDiscoveryEnsemble {
        constructor(config = {}) {
            this.config = Object.assign({}, DEFAULT_CONFIG, config);
            this.sniperEngine = SniperDiscoveryEngine;
            this.semanticEngine = SemanticGraphDiscoveryEngine;
        }

        async discover(baseUrl, pageContext = {}) {
            const registry = new Map(); // canonicalUrl -> candidate record
            const errors = [];

            // 1. Execute Engine 1 (Sniper URL / Route) with fault isolation
            let engine1Candidates = [];
            try {
                engine1Candidates = await this.sniperEngine.discover(baseUrl, pageContext);
            } catch (err) {
                errors.push({ engine: 'SniperURLRouteEngine', error: err.message });
                console.warn('[Ensemble] Engine 1 error (continuing with Engine 2):', err.message);
            }

            // 2. Execute Engine 2 (Semantic DOM / Graph) with fault isolation
            let engine2Candidates = [];
            try {
                const doc = pageContext.document || (typeof document !== 'undefined' ? document : null);
                engine2Candidates = await this.semanticEngine.discover(doc, baseUrl, pageContext);
            } catch (err) {
                errors.push({ engine: 'SemanticDOMGraphEngine', error: err.message });
                console.warn('[Ensemble] Engine 2 error (continuing with Engine 1):', err.message);
            }

            // 3. Candidate Merge & Deduplication into Target-Scoped Registry
            const combined = [...engine1Candidates, ...engine2Candidates];
            for (const cand of combined) {
                if (!cand || !cand.url) continue;
                const canonical = resolveCandidateUrl(cand.url, baseUrl);
                if (!canonical) continue;

                if (!registry.has(canonical)) {
                    registry.set(canonical, {
                        url: canonical,
                        sources: [cand.source || 'unknown'],
                        score: cand.confidence ? Math.round(cand.confidence * 100) : 50,
                        actualLoadedUrl: null,
                        verifiedEligibleForm: false,
                        signals: cand.signals ? [...cand.signals] : [],
                        negativeSignals: cand.negativeSignals ? [...cand.negativeSignals] : [],
                        isFooter: !!cand.isFooter,
                        isNav: !!cand.isNav,
                        depth: cand.depth || 1
                    });
                } else {
                    const existing = registry.get(canonical);
                    const src = cand.source || 'unknown';
                    if (!existing.sources.includes(src)) {
                        existing.sources.push(src);
                        existing.score += 15; // Multi-source corroboration bonus
                    }
                    if (cand.signals) existing.signals.push(...cand.signals);
                    if (cand.negativeSignals) existing.negativeSignals.push(...cand.negativeSignals);
                    if (cand.isFooter) existing.isFooter = true;
                    if (cand.isNav) existing.isNav = true;
                }
            }

            const sorted = Array.from(registry.values()).sort((a, b) => b.score - a.score);
            return {
                baseUrl,
                candidates: sorted.slice(0, this.config.maxUniqueCandidates),
                errors,
                engine1Count: engine1Candidates.length,
                engine2Count: engine2Candidates.length,
                totalCount: sorted.length
            };
        }
    }

    // ========================================================================
    // 4. ContactDiscoveryEngine Core Orchestrator
    // ========================================================================

    class ContactDiscoveryEngine {
        constructor(config = {}) {
            this.config = Object.assign({}, DEFAULT_CONFIG, config);
            this.cache = new Map(); // hostname -> cached path data
            this.visitedGraph = new Set();
            this.discoveryLedger = null;
        }

        /**
         * Initialize discovery ledger for target host
         */
        initLedger(host) {
            this.discoveryLedger = {
                host,
                timestamp: Date.now(),
                sources: {
                    commonPath: 0,
                    anchors: 0,
                    sitemap: 0,
                    jsonld: 0,
                    spa: 0,
                    shadow_dom: 0,
                    iframe: 0,
                    form_current: 0
                },
                graphVisited: 0,
                candidatesUnique: 0,
                verified: 0,
                rejectedNewsletter: 0,
                rejectedNoMessageField: 0,
                eligibleFound: 0,
                selected: null,
                candidatesTrace: []
            };
        }

        /**
         * Log discovery trace
         */
        logLedger() {
            if (!this.discoveryLedger) return;
            const l = this.discoveryLedger;
            console.log(`[DISCOVERY][${l.host}]`);
            console.log(`sources: commonPath=${l.sources.commonPath} anchors=${l.sources.anchors} sitemap=${l.sources.sitemap} jsonld=${l.sources.jsonld} spa=${l.sources.spa}`);
            console.log(`graphVisited=${l.graphVisited} candidatesUnique=${l.candidatesUnique} verified=${l.verified} rejectedNewsletter=${l.rejectedNewsletter} rejectedNoMessageField=${l.rejectedNoMessageField} eligibleFound=${l.eligibleFound} selected=${l.selected || 'none'}`);
        }

        /**
         * Cache management (Section 19: xpider_contact_discovery_cache_v1)
         */
        setCachedPath(host, path, source = 'ensemble', confidence = 0.95) {
            if (!host) return;
            this.cache.set(host, {
                path,
                source,
                lastSuccess: Date.now(),
                confidence,
                failCount: 0
            });
        }

        getCachedPath(host) {
            if (!host) return null;
            const entry = this.cache.get(host);
            if (!entry) return null;
            // Invalidate if failed more than 2 times
            if (entry.failCount >= 2) return null;
            return entry.path;
        }

        recordCacheFailure(host) {
            if (!host) return;
            const entry = this.cache.get(host);
            if (entry) {
                entry.failCount = (entry.failCount || 0) + 1;
                entry.lastFailure = Date.now();
            }
        }

        /**
         * Merge and score candidates from multiple finders
         */
        mergeAndScoreCandidates(rawCandidates, baseUrl, host) {
            const candidateMap = new Map(); // canonicalUrl -> mergedCandidate

            // Check cache first: if known good path exists, inject as high priority candidate
            const cachedPath = this.getCachedPath(host);
            if (cachedPath) {
                const fullCachedUrl = resolveCandidateUrl(cachedPath, baseUrl);
                if (fullCachedUrl) {
                    rawCandidates.unshift({
                        url: fullCachedUrl,
                        source: 'cache_prior',
                        confidence: 0.98,
                        signals: ['cached_known_good_path'],
                        negativeSignals: [],
                        depth: 1,
                        sameOrigin: true
                    });
                }
            }

            for (const cand of rawCandidates) {
                if (!cand || !cand.url) continue;
                const canonicalUrl = resolveCandidateUrl(cand.url, baseUrl);
                if (!canonicalUrl) continue;

                if (!candidateMap.has(canonicalUrl)) {
                    candidateMap.set(canonicalUrl, {
                        url: canonicalUrl,
                        path: getPathOnly(canonicalUrl),
                        sources: [cand.source],
                        signals: [...cand.signals],
                        negativeSignals: [...cand.negativeSignals],
                        depth: cand.depth || 1,
                        sameOrigin: cand.sameOrigin !== undefined ? cand.sameOrigin : isSameOrigin(canonicalUrl, baseUrl),
                        hasEligibleForm: !!cand.hasEligibleForm,
                        isFooter: !!cand.isFooter,
                        isNav: !!cand.isNav,
                        isCrossOriginIframe: !!cand.isCrossOriginIframe
                    });
                } else {
                    const existing = candidateMap.get(canonicalUrl);
                    if (!existing.sources.includes(cand.source)) existing.sources.push(cand.source);
                    existing.signals.push(...cand.signals);
                    existing.negativeSignals.push(...cand.negativeSignals);
                    if (cand.hasEligibleForm) existing.hasEligibleForm = true;
                    if (cand.isFooter) existing.isFooter = true;
                    if (cand.isNav) existing.isNav = true;
                }
            }

            // Calculate final composite score for each candidate (Section 14)
            const ranked = [];
            for (const cand of candidateMap.values()) {
                let score = 0;
                const p = cand.path.toLowerCase();

                // Direct eligible form on page: +100
                if (cand.hasEligibleForm) score += 100;
                // Anchor text strongly contact-like: +30
                if (cand.sources.includes('anchor')) score += 30;
                // Footer link bonus: +15
                if (cand.isFooter) score += 15;
                // Nav link bonus: +10
                if (cand.isNav) score += 10;
                // URL contact keyword: +25
                if (POSITIVE_ANCHOR_TOKENS.some(tok => p.includes(tok))) score += 25;
                // Sitemap match: +20
                if (cand.sources.includes('sitemap')) score += 20;
                // JSON-LD ContactPage: +25
                if (cand.sources.includes('jsonld')) score += 25;
                // Cached known-good: +30
                if (cand.sources.includes('cache_prior')) score += 30;
                // Common path match: +15
                if (cand.sources.includes('common_path')) score += 15;
                // SPA router signal: +15
                if (cand.sources.includes('spa')) score += 15;

                // Multiple sources combined bonus: +15 per extra source
                if (cand.sources.length > 1) {
                    score += (cand.sources.length - 1) * 15;
                }

                // Penalties
                if (cand.negativeSignals.includes('newsletter_or_auth')) score -= 60;
                if (!cand.sameOrigin && !cand.isCrossOriginIframe) score -= 50;
                if (cand.isCrossOriginIframe) {
                    score = Math.max(score, 10);
                }

                cand.score = score;
                ranked.push(cand);
            }

            // Sort descending by score
            ranked.sort((a, b) => b.score - a.score);
            return ranked.slice(0, this.config.maxUniqueCandidates);
        }

        /**
         * Main Discovery Pipeline: discover(origin, pageContext)
         */
        async discover(baseUrl, pageContext = {}) {
            let u;
            try {
                u = new URL(baseUrl);
            } catch (e) {
                return { success: false, reason: 'INVALID_BASE_URL', candidates: [] };
            }

            const host = u.hostname;
            this.initLedger(host);

            const doc = pageContext.document || (typeof document !== 'undefined' ? document : null);
            const rawCandidates = [];

            // Stage A: Form On Current Page
            if (doc) {
                try {
                    const currentFormCand = FormOnCurrentPageFinder.find(doc, baseUrl);
                    if (currentFormCand.length > 0) {
                        this.discoveryLedger.sources.form_current += currentFormCand.length;
                        rawCandidates.push(...currentFormCand);
                    }
                } catch (e) {
                    console.warn(`[Discovery] Current page form finder warning: ${e.message}`);
                }
            }

            // Run Finders in parallel / protected try-catches (Section 15 & Section 23 DISC-14)
            const finderTasks = [
                // 1. CommonPathFinder
                () => {
                    const paths = CommonPathFinder.find(baseUrl);
                    this.discoveryLedger.sources.commonPath += paths.length;
                    rawCandidates.push(...paths);
                },
                // 2. AnchorSemanticFinder
                () => {
                    if (doc) {
                        const anchors = AnchorSemanticFinder.find(doc, baseUrl);
                        this.discoveryLedger.sources.anchors += anchors.length;
                        rawCandidates.push(...anchors);
                    }
                },
                // 3. StructuredDataFinder
                () => {
                    if (doc) {
                        const sData = StructuredDataFinder.find(doc, baseUrl);
                        this.discoveryLedger.sources.jsonld += sData.length;
                        rawCandidates.push(...sData);
                    }
                },
                // 4. SPARouteFinder
                () => {
                    if (doc) {
                        const spaLinks = SPARouteFinder.find(doc, baseUrl, pageContext.triggerMenu !== false);
                        this.discoveryLedger.sources.spa += spaLinks.length;
                        rawCandidates.push(...spaLinks);
                    }
                },
                // 5. ShadowDOMFinder
                () => {
                    if (doc) {
                        const shadowLinks = ShadowDOMFinder.find(doc, baseUrl);
                        this.discoveryLedger.sources.shadow_dom += shadowLinks.length;
                        rawCandidates.push(...shadowLinks);
                    }
                },
                // 6. IframeSignalFinder
                () => {
                    if (doc) {
                        const iframes = IframeSignalFinder.find(doc, baseUrl);
                        this.discoveryLedger.sources.iframe += iframes.length;
                        rawCandidates.push(...iframes);
                    }
                }
            ];

            // Execute local DOM and path tasks safely
            for (const task of finderTasks) {
                try {
                    task();
                } catch (err) {
                    console.warn(`[Discovery] Finder error (safe continue): ${err.message}`);
                }
            }

            // 7. Sitemap & Robots (Metadata sources)
            if (pageContext.sitemapXml) {
                try {
                    const smCandidates = SitemapFinder.parseXml(pageContext.sitemapXml, baseUrl);
                    this.discoveryLedger.sources.sitemap += smCandidates.length;
                    rawCandidates.push(...smCandidates);
                } catch (e) {
                    console.warn(`[Discovery] Sitemap parse error: ${e.message}`);
                }
            }

            if (pageContext.robotsText) {
                try {
                    const { sitemaps, hintedPaths } = RobotsFinder.parseRobots(pageContext.robotsText, baseUrl);
                    for (const p of hintedPaths) {
                        rawCandidates.push({
                            url: p,
                            source: 'sitemap',
                            confidence: 0.75,
                            signals: ['robots_hinted_path'],
                            negativeSignals: [],
                            depth: 1,
                            sameOrigin: true
                        });
                    }
                    if (sitemaps.length > 0 && !pageContext.sitemapXml) {
                        // Sitemaps found via robots
                        this.discoveryLedger.sources.sitemap += sitemaps.length;
                    }
                } catch (e) {
                    console.warn(`[Discovery] Robots parse error: ${e.message}`);
                }
            }

            // Merge & Rank candidates
            const rankedCandidates = this.mergeAndScoreCandidates(rawCandidates, baseUrl, host);
            this.discoveryLedger.candidatesUnique = rankedCandidates.length;
            this.discoveryLedger.candidatesTrace = rankedCandidates.map(c => ({
                path: c.path,
                sources: c.sources,
                score: c.score
            }));

            // Check if immediate eligible form exists on current page (Stage A)
            const normBase = baseUrl.replace(/\/+$/, '');
            const directFormCand = rankedCandidates.find(c => c.hasEligibleForm && (c.url.replace(/\/+$/, '') === normBase));
            if (directFormCand) {
                this.discoveryLedger.eligibleFound = 1;
                this.discoveryLedger.selected = directFormCand.path;
                this.setCachedPath(host, directFormCand.path);
                this.logLedger();
                return {
                    success: true,
                    stage: 'Stage A: Immediate Form Found',
                    selectedUrl: baseUrl,
                    selectedCandidate: directFormCand,
                    candidates: rankedCandidates,
                    ledger: this.discoveryLedger
                };
            }

            return {
                success: rankedCandidates.length > 0,
                stage: rankedCandidates.length > 0 ? 'Candidates Ranked' : 'Exhausted',
                candidates: rankedCandidates,
                ledger: this.discoveryLedger,
                reason: rankedCandidates.length > 0 ? null : FAILURE_REASONS.DISCOVERY_EXHAUSTED
            };
        }

        /**
         * State Machine Candidate Verification Runner
         * Lifecycle: DISCOVERING -> VERIFYING_CANDIDATE -> FORM_FOUND / NEXT_CANDIDATE -> EXHAUSTED -> SETTLED
         */
        async verifyCandidates(candidates, verifierFn, baseUrl) {
            let u;
            try { u = new URL(baseUrl); } catch (_) { return { success: false, reason: 'INVALID_URL' }; }
            const host = u.hostname;
            if (!this.discoveryLedger) {
                this.initLedger(host);
            }

            let verifiedCount = 0;
            const maxVerified = this.config.maxVerifiedPages;

            for (const cand of candidates) {
                if (verifiedCount >= maxVerified) break;
                verifiedCount++;
                if (this.discoveryLedger) this.discoveryLedger.verified = verifiedCount;

                console.log(`[Discovery] Checking ${cand.path} (${cand.sources.join('+')}, score ${cand.score})`);

                try {
                    const result = await verifierFn(cand.url, cand);

                    // Form gate check on verified page
                    if (result && result.hasForm) {
                        if (result.intent === 'NEWSLETTER') {
                            console.log(`[Discovery] Rejected: newsletter-only form on ${cand.path}`);
                            if (this.discoveryLedger) this.discoveryLedger.rejectedNewsletter++;
                            continue; // Continue discovery ladder!
                        }

                        if (!result.hasInquiryBody) {
                            console.log(`[Discovery] Rejected: no inquiry message field on ${cand.path}`);
                            if (this.discoveryLedger) this.discoveryLedger.rejectedNoMessageField++;
                            continue; // Continue discovery ladder!
                        }

                        // Confirmed eligible inquiry form found!
                        console.log(`[Discovery] Eligible inquiry form found on ${cand.path} (${result.bodyFieldType || 'textarea'})`);
                        if (this.discoveryLedger) {
                            this.discoveryLedger.eligibleFound = 1;
                            this.discoveryLedger.selected = cand.path;
                        }
                        this.setCachedPath(host, cand.path);
                        this.logLedger();

                        return {
                            success: true,
                            selectedUrl: cand.url,
                            selectedCandidate: cand,
                            formInfo: result
                        };
                    }
                } catch (e) {
                    console.warn(`[Discovery] Verification failed for ${cand.path}: ${e.message}`);
                }
            }

            // Ladder exhausted without eligible form
            if (this.discoveryLedger) {
                console.log(`[Discovery] Exhausted ${this.discoveryLedger.candidatesUnique} unique candidates / ${verifiedCount} verified pages`);
                console.log(`[Discovery] No eligible inquiry form found`);
                this.recordCacheFailure(host);
                this.logLedger();
            }

            return {
                success: false,
                reason: FAILURE_REASONS.DISCOVERY_EXHAUSTED,
                verifiedCount
            };
        }
    }

    ContactDiscoveryEngine.SniperDiscoveryEngine = SniperDiscoveryEngine;
    ContactDiscoveryEngine.SemanticGraphDiscoveryEngine = SemanticGraphDiscoveryEngine;
    ContactDiscoveryEngine.ContactDiscoveryEnsemble = ContactDiscoveryEnsemble;

    return {
        ContactDiscoveryEngine,
        SniperDiscoveryEngine,
        SemanticGraphDiscoveryEngine,
        ContactDiscoveryEnsemble,
        CommonPathFinder,
        AnchorSemanticFinder,
        NavigationGraphFinder: {
            name: 'graph',
            expand(nodeUrl, outgoingUrls, baseUrl, depth = 1) {
                const candidates = [];
                if (depth > 2) return candidates;
                for (const url of outgoingUrls) {
                    const resolved = resolveCandidateUrl(url, baseUrl);
                    if (resolved && isSameOrigin(resolved, baseUrl)) {
                        const path = getPathOnly(resolved).toLowerCase();
                        if (POSITIVE_ANCHOR_TOKENS.some(tok => path.includes(tok))) {
                            candidates.push({
                                url: resolved,
                                source: 'graph',
                                confidence: 0.70,
                                signals: [`graph_depth_${depth}`, `from:${getPathOnly(nodeUrl)}`],
                                negativeSignals: [],
                                depth,
                                sameOrigin: true
                            });
                        }
                    }
                }
                return candidates;
            }
        },
        SitemapFinder,
        RobotsFinder,
        StructuredDataFinder,
        SPARouteFinder,
        ShadowDOMFinder,
        IframeSignalFinder,
        FormOnCurrentPageFinder,
        SemanticPageClassifier,
        resolveCandidateUrl,
        isMeaningfulContactPath,
        NON_HTML_DOWNLOADABLE_EXTENSIONS,
        FAILURE_REASONS,
        COMMON_CONTACT_PATHS,
        POSITIVE_ANCHOR_TOKENS
    };
}));
