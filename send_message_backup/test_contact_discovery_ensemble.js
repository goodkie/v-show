/**
 * test_contact_discovery_ensemble.js
 * 
 * Comprehensive Test Suite for Advanced Contact Discovery Ensemble (Issue #6 Comment #49)
 * 
 * Verifies:
 * - DISC-1: Root has direct /contact-us anchor
 * - DISC-2: No anchor; /contact common path exists
 * - DISC-3: No common path; robots points to sitemap containing /company/reach-us
 * - DISC-4: JSON-LD ContactPage URL only
 * - DISC-5: Footer-only "Get in Touch" link
 * - DISC-6: SPA menu hides contact link until menu opened
 * - DISC-7: Open ShadowDOM contains contact button/form
 * - DISC-8: High-score newsletter page plus lower-score real contact page
 * - DISC-9: Contact page has email-only subscription form
 * - DISC-10: Contact page has eligible textarea inquiry form
 * - DISC-11: Absolute candidate URL must not be base-concatenated
 * - DISC-12: Candidate 1 formless; candidate 2 valid (target resolver remains alive)
 * - DISC-13: Sitemap fetch fails -> other finders continue
 * - DISC-14: One finder throws exception -> ensemble continues
 * - DISC-15: Duplicate URL discovered from anchor+sitemap+common path -> one merged candidate
 * - DISC-16: Cross-origin iframe form hint -> diagnostic candidate, no unsafe DOM assumption
 * - DISC-17: No eligible inquiry page after all sources -> CONTACT_DISCOVERY_EXHAUSTED
 * - DISC-18: Cached known-good contact path prioritized early
 * - DISC-19: Message field absent on every form -> no submit regardless discovery confidence
 * - DISC-20: Multilingual localized path /문의 discovered
 */

const assert = require('assert');
const ContactGate = require('./modules/contact-gate.js');
const {
    ContactDiscoveryEngine,
    CommonPathFinder,
    AnchorSemanticFinder,
    SitemapFinder,
    RobotsFinder,
    StructuredDataFinder,
    SPARouteFinder,
    ShadowDOMFinder,
    IframeSignalFinder,
    FormOnCurrentPageFinder,
    SemanticPageClassifier,
    resolveCandidateUrl,
    FAILURE_REASONS
} = require('./modules/contact-discovery-engine.js');

// Mock DOM Factory Helper
function createMockElement(tag, attrs = {}, children = []) {
    const el = {
        tagName: tag.toUpperCase(),
        id: attrs.id || '',
        name: attrs.name || '',
        type: attrs.type || (tag.toLowerCase() === 'textarea' ? 'textarea' : 'text'),
        value: attrs.value || '',
        textContent: attrs.textContent || '',
        innerText: attrs.innerText || attrs.textContent || '',
        className: attrs.className || '',
        placeholder: attrs.placeholder || '',
        title: attrs.title || '',
        href: attrs.href || '',
        src: attrs.src || '',
        action: attrs.action || '',
        required: !!attrs.required,
        hidden: false,
        style: attrs.style || { display: 'block', visibility: 'visible' },
        children: [...children],
        parentElement: null,
        shadowRoot: attrs.shadowRoot || null,
        getAttribute(attr) {
            return attrs[attr] !== undefined ? attrs[attr] : null;
        },
        setAttribute(attr, val) {
            attrs[attr] = val;
        },
        closest(sel) {
            let cur = el;
            while (cur) {
                if (cur.matches && cur.matches(sel)) return cur;
                cur = cur.parentElement;
            }
            return null;
        },
        matches(sel) {
            if (!sel) return false;
            const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
            return parts.some(part => {
                if (part.includes(':not(')) {
                    const basePart = part.split(':not(')[0].trim();
                    const notPart = part.split(':not(')[1].replace(/\)$/, '').trim();
                    if (basePart && !el.matches(basePart)) return false;
                    return !el.matches(notPart);
                }
                if (part.startsWith('.')) {
                    return (el.className || '').split(/\s+/).includes(part.slice(1)) || (el.className || '').includes(part.slice(1));
                }
                if (part.startsWith('#')) return el.id === part.slice(1);
                if (part.includes('[')) {
                    const m = part.match(/\[([a-z0-9_-]+)([*^$]?=)?"?([^"\]]*)"?\]/i);
                    if (m) {
                        const attrName = m[1];
                        const op = m[2];
                        const expected = m[3] ? m[3].toLowerCase() : '';
                        const actual = String(el.getAttribute(attrName) || (el[attrName] !== undefined ? el[attrName] : '')).toLowerCase();
                        if (!op) return el.getAttribute(attrName) !== null || el[attrName] !== undefined;
                        if (op === '*=') return actual.includes(expected);
                        if (op === '^=') return actual.startsWith(expected);
                        if (op === '$=') return actual.endsWith(expected);
                        return actual === expected;
                    }
                }
                if (part === '*') return true;
                return el.tagName.toLowerCase() === part.toLowerCase();
            });
        },
        querySelectorAll(selector) {
            const matches = [];
            const check = (node) => {
                if (node.matches(selector)) matches.push(node);
                for (const child of node.children) check(child);
            };
            for (const child of el.children) check(child);
            return matches;
        },
        querySelector(selector) {
            const all = el.querySelectorAll(selector);
            return all.length > 0 ? all[0] : null;
        },
        click() {
            if (typeof attrs.onclick === 'function') attrs.onclick();
        }
    };

    for (const child of children) {
        child.parentElement = el;
    }
    return el;
}

function createMockDocument(children = [], title = "Test Page") {
    const body = createMockElement('body', {}, children);
    const doc = createMockElement('html', {}, [body]);
    doc.title = title;
    doc.body = body;
    doc.documentElement = doc;
    return doc;
}

// Test reporting helper
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(testName, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ [PASS] ${testName}`);
        passedTests++;
    } catch (e) {
        console.error(`❌ [FAIL] ${testName}: ${e.message}`);
        console.error(e.stack);
        failedTests++;
    }
}

async function reportAsync(testName, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`✅ [PASS] ${testName}`);
        passedTests++;
    } catch (e) {
        console.error(`❌ [FAIL] ${testName}: ${e.message}`);
        console.error(e.stack);
        failedTests++;
    }
}

async function runAllTests() {
    console.log("=== STARTING ADVANCED CONTACT DISCOVERY ENSEMBLE SUITE (DISC-1 to DISC-20) ===");

    // DISC-1: Root has direct /contact-us anchor
    await reportAsync("DISC-1: Root has direct /contact-us anchor is discovered and ranked high", async () => {
        const anchor = createMockElement('a', { href: '/contact-us', textContent: 'Contact Us' });
        const doc = createMockDocument([anchor]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc });
        assert.strictEqual(res.success, true);
        const contactCand = res.candidates.find(c => c.path === '/contact-us');
        assert(contactCand, "Candidate /contact-us should be found");
        assert(contactCand.sources.includes('anchor'), "Source should include anchor");
        assert(contactCand.score >= 50, "Score should be high due to anchor and path match");
    });

    // DISC-2: No anchor; /contact common path exists
    await reportAsync("DISC-2: No anchor; common path finder discovers /contact", async () => {
        const doc = createMockDocument([]); // empty doc
        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc });

        assert.strictEqual(res.success, true);
        const contactCand = res.candidates.find(c => c.path === '/contact');
        assert(contactCand, "Should discover common path /contact");
        assert(contactCand.sources.includes('common_path'));
    });

    // DISC-3: No common path; robots points to sitemap containing /company/reach-us
    await reportAsync("DISC-3: Robots points to sitemap containing /company/reach-us", async () => {
        const robotsText = "User-agent: *\nDisallow: /admin\nSitemap: https://testsite.com/sitemap_index.xml";
        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>https://testsite.com/blog</loc></url>
            <url><loc>https://testsite.com/company/reach-us</loc></url>
        </urlset>`;

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { robotsText, sitemapXml });
        assert.strictEqual(res.success, true);
        const sitemapCand = res.candidates.find(c => c.path === '/company/reach-us');
        assert(sitemapCand, "Should discover sitemap entry /company/reach-us");
        assert(sitemapCand.sources.includes('sitemap'));
    });

    // DISC-4: JSON-LD ContactPage URL only
    await reportAsync("DISC-4: JSON-LD ContactPage URL discovered and prioritized", async () => {
        const jsonLdContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ContactPage",
            "url": "https://testsite.com/customer-care/connect"
        });
        const script = createMockElement('script', { type: 'application/ld+json', textContent: jsonLdContent });
        const doc = createMockDocument([script]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc });
        assert.strictEqual(res.success, true);
        const jsonCand = res.candidates.find(c => c.path === '/customer-care/connect');
        assert(jsonCand, "Should discover JSON-LD ContactPage URL");
        assert(jsonCand.sources.includes('jsonld'));
        assert(jsonCand.score >= 50);
    });

    // DISC-5: Footer-only "Get in Touch" link
    await reportAsync("DISC-5: Footer-only 'Get in Touch' link receives footer context boost", async () => {
        const link = createMockElement('a', { href: '/support/reach-out', textContent: 'Get in Touch' });
        const footer = createMockElement('footer', { className: 'site-footer' }, [link]);
        const doc = createMockDocument([footer]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc });
        const footerCand = res.candidates.find(c => c.path === '/support/reach-out');
        assert(footerCand, "Should discover footer contact link");
        assert(footerCand.isFooter, "Should identify footer context");
        assert(footerCand.score >= 45, "Should receive footer prior boost");
    });

    // DISC-6: SPA menu hides contact link until menu opened
    await reportAsync("DISC-6: SPA menu hides contact link until menu opened (single expansion)", async () => {
        let menuOpened = false;
        const hiddenNav = createMockElement('div', { id: 'mobile-nav' });
        const menuBtn = createMockElement('button', {
            className: 'menu-toggle',
            onclick: () => {
                menuOpened = true;
                const dynamicLink = createMockElement('a', { href: '/spa/contact', textContent: 'Contact' });
                hiddenNav.children.push(dynamicLink);
            }
        });
        const doc = createMockDocument([menuBtn, hiddenNav]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc, triggerMenu: true });
        assert.strictEqual(menuOpened, true, "Menu toggle should have been clicked");
        const spaCand = res.candidates.find(c => c.path === '/spa/contact');
        assert(spaCand, "Dynamic SPA menu contact link should be found");
        assert(spaCand.sources.includes('spa'));
    });

    // DISC-7: Open ShadowDOM contains contact button/form
    await reportAsync("DISC-7: Open ShadowDOM contains contact button/link", async () => {
        const shadowHost = createMockElement('div', { id: 'custom-web-component' });
        const shadowLink = createMockElement('a', { href: '/shadow/contact-us', textContent: 'Contact Team' });
        shadowHost.shadowRoot = createMockElement('div', {}, [shadowLink]);
        const doc = createMockDocument([shadowHost]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc });
        const shadowCand = res.candidates.find(c => c.path === '/shadow/contact-us');
        assert(shadowCand, "Shadow DOM link should be discovered");
        assert(shadowCand.sources.includes('shadow_dom'));
    });

    // DISC-8: High-score newsletter page plus lower-score real contact page
    await reportAsync("DISC-8: Newsletter page rejected, real inquiry page selected", async () => {
        const engine = new ContactDiscoveryEngine();
        const candidates = [
            {
                url: 'https://testsite.com/newsletter',
                path: '/newsletter',
                sources: ['anchor'],
                score: 80,
                hasEligibleForm: false
            },
            {
                url: 'https://testsite.com/contact-inquiry',
                path: '/contact-inquiry',
                sources: ['anchor'],
                score: 65,
                hasEligibleForm: true
            }
        ];

        const mockVerifier = async (url) => {
            if (url.includes('newsletter')) {
                return { hasForm: true, intent: 'NEWSLETTER', hasInquiryBody: false };
            }
            if (url.includes('contact-inquiry')) {
                return { hasForm: true, intent: 'CONTACT_INQUIRY', hasInquiryBody: true, bodyFieldType: 'textarea' };
            }
            return { hasForm: false };
        };

        const res = await engine.verifyCandidates(candidates, mockVerifier, 'https://testsite.com');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.selectedUrl, 'https://testsite.com/contact-inquiry');
        assert.strictEqual(engine.discoveryLedger.rejectedNewsletter, 1, "Should count 1 newsletter rejection");
        assert.strictEqual(engine.discoveryLedger.eligibleFound, 1, "Should count 1 eligible form found");
    });

    // DISC-9: Contact page has email-only subscription form
    await reportAsync("DISC-9: Email-only subscription form on contact page continues discovery", async () => {
        const engine = new ContactDiscoveryEngine();
        const candidates = [
            { url: 'https://testsite.com/contact1', path: '/contact1', sources: ['common_path'], score: 50 },
            { url: 'https://testsite.com/contact2', path: '/contact2', sources: ['sitemap'], score: 40 }
        ];

        const mockVerifier = async (url) => {
            if (url.includes('contact1')) {
                // Subscription form only! (no inquiry body)
                return { hasForm: true, intent: 'NEWSLETTER', hasInquiryBody: false };
            }
            if (url.includes('contact2')) {
                return { hasForm: true, intent: 'CONTACT_INQUIRY', hasInquiryBody: true, bodyFieldType: 'textarea' };
            }
            return { hasForm: false };
        };

        const res = await engine.verifyCandidates(candidates, mockVerifier, 'https://testsite.com');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.selectedUrl, 'https://testsite.com/contact2', "Should advance to candidate 2");
    });

    // DISC-10: Contact page has eligible textarea inquiry form
    await reportAsync("DISC-10: Contact page has eligible textarea inquiry form selected directly", async () => {
        const nameInp = createMockElement('input', { type: 'text', name: 'name' });
        const emailInp = createMockElement('input', { type: 'email', name: 'email' });
        const ta = createMockElement('textarea', { name: 'message', placeholder: 'Write your inquiry...' });
        const form = createMockElement('form', { action: '/submit-contact' }, [nameInp, emailInp, ta]);
        const doc = createMockDocument([form]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc });
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.selectedUrl, 'https://testsite.com');
        assert.strictEqual(res.selectedCandidate.hasEligibleForm, true);
    });

    // DISC-11: Absolute candidate URL must not be base-concatenated
    report("DISC-11: Absolute candidate URL is resolved safely without double domain concatenation", () => {
        const base = "https://example.com";
        const absolute = "https://example.com/contact-us";
        const resolved = resolveCandidateUrl(absolute, base);
        assert.strictEqual(resolved, "https://example.com/contact-us");
        assert(!resolved.includes("example.comhttps://"), "Must not create invalid concatenation");

        const relative = "/reach-out";
        assert.strictEqual(resolveCandidateUrl(relative, base), "https://example.com/reach-out");

        const protocolRelative = "//cdn.example.com/support";
        assert.strictEqual(resolveCandidateUrl(protocolRelative, base), "https://cdn.example.com/support");
    });

    // DISC-12: Candidate 1 formless; candidate 2 valid -> resolver remains alive
    await reportAsync("DISC-12: Candidate 1 formless; candidate 2 valid; target resolver processes candidate 2", async () => {
        const engine = new ContactDiscoveryEngine();
        const candidates = [
            { url: 'https://testsite.com/formless', path: '/formless', sources: ['common_path'], score: 50 },
            { url: 'https://testsite.com/valid-contact', path: '/valid-contact', sources: ['anchor'], score: 45 }
        ];

        let candidate1Checked = false;
        let candidate2Checked = false;

        const mockVerifier = async (url) => {
            if (url.includes('formless')) {
                candidate1Checked = true;
                return { hasForm: false }; // formless
            }
            if (url.includes('valid-contact')) {
                candidate2Checked = true;
                return { hasForm: true, intent: 'CONTACT_INQUIRY', hasInquiryBody: true };
            }
            return { hasForm: false };
        };

        const res = await engine.verifyCandidates(candidates, mockVerifier, 'https://testsite.com');
        assert.strictEqual(candidate1Checked, true);
        assert.strictEqual(candidate2Checked, true);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.selectedUrl, 'https://testsite.com/valid-contact');
    });

    // DISC-13: Sitemap fetch fails -> other finders continue
    await reportAsync("DISC-13: Sitemap fetch or parse failure is non-fatal and other finders continue", async () => {
        const anchor = createMockElement('a', { href: '/contact-anchor', textContent: 'Contact Us' });
        const doc = createMockDocument([anchor]);

        const engine = new ContactDiscoveryEngine();
        // Provide malformed sitemap
        const res = await engine.discover('https://testsite.com', {
            document: doc,
            sitemapXml: "MALFORMED_GARBAGE_XML<<<>>"
        });

        assert.strictEqual(res.success, true);
        const cand = res.candidates.find(c => c.path === '/contact-anchor');
        assert(cand, "Should still discover anchor candidate despite sitemap failure");
    });

    // DISC-14: One finder throws exception -> ensemble continues
    await reportAsync("DISC-14: One finder throwing error does not terminate discovery ensemble", async () => {
        const badDoc = {
            querySelectorAll(sel) {
                if (sel.includes('application/ld+json')) throw new Error("JSON-LD parse explode");
                return [];
            }
        };

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: badDoc });
        // CommonPathFinder should still run
        assert.strictEqual(res.success, true);
        assert(res.candidates.length > 0, "Should still yield common path candidates");
    });

    // DISC-15: Duplicate URL discovered from anchor+sitemap+common path -> one merged candidate
    await reportAsync("DISC-15: Duplicate URL discovered from multiple finders merges into 1 high-scored candidate", async () => {
        const anchor = createMockElement('a', { href: '/contact', textContent: 'Contact' });
        const doc = createMockDocument([anchor]);
        const sitemapXml = `<urlset><url><loc>https://testsite.com/contact</loc></url></urlset>`;

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc, sitemapXml });
        assert.strictEqual(res.success, true);

        const contactCandidates = res.candidates.filter(c => c.path === '/contact');
        assert.strictEqual(contactCandidates.length, 1, "Duplicate /contact must be merged into exactly 1 candidate");
        const merged = contactCandidates[0];
        assert(merged.sources.includes('common_path'));
        assert(merged.sources.includes('anchor'));
        assert(merged.sources.includes('sitemap'));
        assert(merged.score > 60, "Combined evidence should boost score");
    });

    // DISC-16: Cross-origin iframe form hint
    await reportAsync("DISC-16: Cross-origin iframe form hint marked diagnostic (no unsafe DOM access)", async () => {
        const iframe = createMockElement('iframe', {
            src: 'https://thirdparty-forms.com/embed/contact?id=123',
            title: 'Contact Form Widget'
        });
        const doc = createMockDocument([iframe]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://testsite.com', { document: doc });
        const iframeCand = res.candidates.find(c => c.url.includes('thirdparty-forms.com'));
        assert(iframeCand, "Cross origin iframe candidate recorded");
        assert.strictEqual(iframeCand.sameOrigin, false);
        assert(iframeCand.negativeSignals.includes(FAILURE_REASONS.CROSS_ORIGIN_FORM_CANDIDATE));
    });

    // DISC-17: No eligible inquiry page after all sources -> CONTACT_DISCOVERY_EXHAUSTED
    await reportAsync("DISC-17: No eligible inquiry page after all sources settles as CONTACT_DISCOVERY_EXHAUSTED", async () => {
        const engine = new ContactDiscoveryEngine();
        const candidates = [
            { url: 'https://testsite.com/page1', path: '/page1', sources: ['common_path'], score: 30 },
            { url: 'https://testsite.com/page2', path: '/page2', sources: ['common_path'], score: 30 }
        ];

        const mockVerifier = async () => {
            return { hasForm: false }; // None have forms
        };

        const res = await engine.verifyCandidates(candidates, mockVerifier, 'https://testsite.com');
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.reason, FAILURE_REASONS.DISCOVERY_EXHAUSTED);
        assert.strictEqual(engine.discoveryLedger.verified, 2);
        assert.strictEqual(engine.discoveryLedger.eligibleFound, 0);
    });

    // DISC-18: Cached known-good contact path prioritized early
    await reportAsync("DISC-18: Cached known-good contact path prioritized early on repeat visit", async () => {
        const engine = new ContactDiscoveryEngine();
        engine.setCachedPath('repeat-domain.com', '/support/custom-inquiry-gateway', 'previous_success', 0.99);

        const res = await engine.discover('https://repeat-domain.com');
        assert.strictEqual(res.success, true);
        const topCand = res.candidates[0];
        assert.strictEqual(topCand.path, '/support/custom-inquiry-gateway', "Cached path should be top priority candidate");
        assert(topCand.sources.includes('cache_prior'));
    });

    // DISC-19: Message field absent on every form -> no submit regardless discovery confidence
    await reportAsync("DISC-19: Form without inquiry message field is rejected regardless discovery score", async () => {
        const engine = new ContactDiscoveryEngine();
        const candidates = [
            { url: 'https://testsite.com/contact-high-score', path: '/contact-high-score', sources: ['anchor', 'sitemap'], score: 95 }
        ];

        const mockVerifier = async () => {
            // Form exists, but NO inquiry body field
            return { hasForm: true, intent: 'OTHER', hasInquiryBody: false };
        };

        const res = await engine.verifyCandidates(candidates, mockVerifier, 'https://testsite.com');
        assert.strictEqual(res.success, false, "Must not accept form lacking inquiry message field");
        assert.strictEqual(engine.discoveryLedger.rejectedNoMessageField, 1);
    });

    // DISC-20: Multilingual localized path /문의 discovered
    await reportAsync("DISC-20: Multilingual localized contact path /문의 discovered", async () => {
        const koreanLink = createMockElement('a', { href: '/문의', textContent: '상담문의' });
        const doc = createMockDocument([koreanLink]);

        const engine = new ContactDiscoveryEngine();
        const res = await engine.discover('https://korean-site.kr', { document: doc });
        assert.strictEqual(res.success, true);
        const krCand = res.candidates.find(c => decodeURIComponent(c.path).includes('문의'));
        assert(krCand, "Multilingual korean inquiry link /문의 should be discovered");
    });

    console.log(`\n=================================================================`);
    console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
    console.log(`=================================================================\n`);

    if (failedTests > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error("Fatal suite failure:", err);
    process.exit(1);
});
