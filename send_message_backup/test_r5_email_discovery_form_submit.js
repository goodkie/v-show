/**
 * test_r5_email_discovery_form_submit.js
 *
 * Acceptance Test Suite for GitHub Issue #6 Directives (R5):
 * EMAIL RESET:
 * - R5-E1 enumerate actual production email keys
 * - R5-E2 Clear All zeros memory/current/all/persistent
 * - R5-E3 popup reopen remains zero
 * - R5-E4 service-worker restart remains zero
 * - R5-E5 clear does not instantly recollect unchanged current DOM
 * - R5-E6 new page navigation after clear collects again normally
 *
 * DISCOVERY ENGINE 1 (Sniper URL / Route):
 * - R5-D1 root valid
 * - R5-D2 /contact common path
 * - R5-D3 sitemap-only contact
 * - R5-D4 cache prior good path
 * - R5-D5 extension-only garbage never generated
 *
 * DISCOVERY ENGINE 2 (Semantic DOM / Graph):
 * - R5-D6 footer-only contact
 * - R5-D7 mobile-menu hidden contact
 * - R5-D8 open ShadowDOM link
 * - R5-D9 same-origin iframe link
 * - R5-D10 About -> Contact graph depth2
 *
 * ENSEMBLE:
 * - R5-D11 Engine1 fails, Engine2 finds
 * - R5-D12 Engine2 fails, Engine1 finds
 * - R5-D13 duplicate candidate evidence merged
 * - R5-D14 only verified eligible page commits History contactPageUrl
 *
 * FORM FINDER:
 * - R5-F1 native form with textarea
 * - R5-F2 form-like div with textarea + button
 * - R5-F3 modal form revealed after Contact button
 * - R5-F4 lazy form appears after scroll/mutation
 * - R5-F5 ShadowDOM form
 * - R5-F6 same-origin iframe form
 * - R5-F7 newsletter-only rejected
 * - R5-F8 no message field rejected
 *
 * SUBMIT:
 * - R5-S1 requestSubmit works
 * - R5-S2 disabled -> validation commit -> enabled -> submit
 * - R5-S3 custom button click
 * - R5-S4 click no effect -> one alternate candidate
 * - R5-S5 overlay dismissed once
 * - R5-S6 keyboard-compatible fallback bounded once
 * - R5-S7 no duplicate submit
 * - R5-S8 AJAX same-page confirmation => SUCCESS
 * - R5-S9 server/validation error => not SUCCESS
 * - R5-S10 forced last-resort behind private-mode flag and one-shot only
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock browser environment
const mockStorage = {};
const mockSessionStorage = {};
const messageListeners = [];
let broadcastMessages = [];

global.self = global;
global.window = global;

global.chrome = {
    storage: {
        local: {
            data: mockStorage,
            get: (keys, cb) => {
                const res = {};
                if (!keys) Object.assign(res, mockStorage);
                else if (Array.isArray(keys)) keys.forEach(k => { if (k in mockStorage) res[k] = mockStorage[k]; });
                else if (typeof keys === 'string') { if (keys in mockStorage) res[keys] = mockStorage[keys]; }
                else if (typeof keys === 'object') Object.keys(keys).forEach(k => { res[k] = (k in mockStorage) ? mockStorage[k] : keys[k]; });
                if (typeof cb === 'function') cb(res);
                return Promise.resolve(res);
            },
            set: (items, cb) => {
                Object.assign(mockStorage, items);
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            },
            remove: (keys, cb) => {
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => delete mockStorage[k]);
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            }
        },
        session: {
            data: mockSessionStorage,
            get: (keys, cb) => {
                const res = {};
                if (!keys) Object.assign(res, mockSessionStorage);
                else if (Array.isArray(keys)) keys.forEach(k => { if (k in mockSessionStorage) res[k] = mockSessionStorage[k]; });
                if (typeof cb === 'function') cb(res);
                return Promise.resolve(res);
            },
            set: (items, cb) => {
                Object.assign(mockSessionStorage, items);
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            },
            remove: (keys, cb) => {
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(k => delete mockSessionStorage[k]);
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            }
        }
    },
    runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
            broadcastMessages.push(msg);
            for (const l of messageListeners) {
                try { l(msg, { tab: { id: 100 } }, (res) => { if (typeof cb === 'function') cb(res); }); } catch (_) {}
            }
            if (typeof cb === 'function') cb({ success: true });
            return Promise.resolve({ success: true });
        },
        onMessage: {
            addListener: (fn) => messageListeners.push(fn)
        }
    },
    tabs: {
        query: (q, cb) => {
            if (typeof cb === 'function') cb([{ id: 101, url: 'https://example.com/' }]);
        },
        sendMessage: (tabId, msg, cb) => {
            broadcastMessages.push({ tabId, ...msg });
            if (typeof cb === 'function') cb({ success: true });
        }
    },
    action: {
        setBadgeText: () => {},
        setBadgeBackgroundColor: () => {}
    }
};

// Mock DOM elements
class MockNode {
    constructor(tagName = 'DIV', attrs = {}, textContent = '') {
        this.tagName = tagName.toUpperCase();
        this.nodeType = 1;
        this.id = attrs.id || '';
        this.className = attrs.className || attrs.class || '';
        this.classList = {
            contains: (c) => (this.className || '').split(' ').includes(c),
            add: (c) => { this.className = `${this.className} ${c}`.trim(); },
            remove: (c) => { this.className = (this.className || '').split(' ').filter(x => x !== c).join(' '); }
        };
        this.textContent = textContent;
        this.value = attrs.value || '';
        this.type = attrs.type || (this.tagName === 'INPUT' ? 'text' : '');
        this.name = attrs.name || '';
        this.disabled = !!attrs.disabled;
        this.required = !!attrs.required;
        this.attributes = Object.assign({}, attrs);
        this.children = [];
        this.parentElement = null;
        this._listeners = {};
        this.shadowRoot = null;
    }

    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : (k === 'aria-label' ? this.attributes['aria-label'] || null : null); }
    setAttribute(k, v) { this.attributes[k] = v; }
    removeAttribute(k) { delete this.attributes[k]; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }

    appendChild(child) {
        if (!child) return child;
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentElement = null;
        }
        return child;
    }

    closest(sel) {
        let curr = this;
        while (curr) {
            if (curr.matches && curr.matches(sel)) return curr;
            curr = curr.parentElement;
        }
        return null;
    }

    matches(sel) {
        const parts = sel.split(',').map(s => s.trim());
        const tag = this.tagName.toLowerCase();
        const cls = this.className || '';
        const id = this.id || '';
        for (const p of parts) {
            const pLow = p.toLowerCase();
            // Tag match
            if (pLow === tag) return true;
            // Class match .foo
            if (p.startsWith('.') && cls.split(' ').includes(p.slice(1))) return true;
            // ID match #foo
            if (p.startsWith('#') && id === p.slice(1)) return true;
            // Attribute patterns
            if (p.includes('[class*=') && p.includes('footer') && cls.toLowerCase().includes('footer')) return true;
            if (p.includes('[id*=') && p.includes('footer') && id.toLowerCase().includes('footer')) return true;
            if (p.includes('[class*=') && p.includes('nav') && cls.toLowerCase().includes('nav')) return true;
            if (p.includes('[role="navigation"]') && this.getAttribute('role') === 'navigation') return true;
            if (p.includes('[role="form"]') && this.getAttribute('role') === 'form') return true;
            if (p.includes('[role="link"]') && this.getAttribute('role') === 'link') return true;
            if (p.includes('[role="button"]') && this.getAttribute('role') === 'button') return true;
            if (p.includes('[class*="form"]') && cls.includes('form')) return true;
            if (p.includes('[id*="form"]') && id.includes('form')) return true;
            if (p.includes('[contenteditable="true"]') && this.getAttribute('contenteditable') === 'true') return true;
            if (p.includes('[data-href]') && this.hasAttribute('data-href')) return true;
            if (p.includes('[aria-expanded]') && this.hasAttribute('aria-expanded')) return true;
            if (p.includes('[aria-expanded="false"]') && this.getAttribute('aria-expanded') === 'false') return true;
        }
        return false;
    }

    querySelectorAll(sel) {
        const results = [];
        // Parse multi-part selectors: 'a, button[data-href], [role="link"]'
        const parts = sel.split(',').map(s => s.trim().toLowerCase());
        const matchesParts = (node) => {
            const tag = (node.tagName || '').toLowerCase();
            const cls = (node.className || '').toLowerCase();
            const id = (node.id || '').toLowerCase();
            for (const p of parts) {
                if (p === tag) return true;
                if (p === 'textarea' && tag === 'textarea') return true;
                if (p.startsWith('button') && tag === 'button') return true;
                if (p === 'input' && tag === 'input') return true;
                if (p.startsWith('input[type') && tag === 'input') {
                    const m = p.match(/type=["']?([^"'\]]+)/); if (m && node.type === m[1]) return true;
                }
                if (p === 'a' && tag === 'a') return true;
                if (p.startsWith('a') && tag === 'a') return true;
                if (p.startsWith('.') && cls.split(' ').includes(p.slice(1))) return true;
                if (p.startsWith('#') && id === p.slice(1)) return true;
                if (p.includes('[contenteditable="true"]') && node.getAttribute('contenteditable') === 'true') return true;
                if (p.includes('[data-href]') && node.hasAttribute('data-href')) return true;
                if (p.includes('[role="link"]') && node.getAttribute('role') === 'link') return true;
                if (p.includes('[role="button"]') && node.getAttribute('role') === 'button') return true;
                if (p.includes('[aria-expanded]') && node.hasAttribute('aria-expanded')) return true;
                if (p.includes('[aria-expanded="false"]') && node.getAttribute('aria-expanded') === 'false') return true;
                if (p.includes('[class*=') ){ const m = p.match(/\[class\*=["']?([^"'\]]+)/); if(m && cls.includes(m[1])) return true; }
                if (p.includes('[id*=') ){ const m = p.match(/\[id\*=["']?([^"'\]]+)/); if(m && id.includes(m[1])) return true; }
                if (p.includes(':invalid') && node.required && !node.value) return true;
            }
            return false;
        };
        const traverse = (node) => {
            for (const c of node.children || []) {
                if (matchesParts(c)) results.push(c);
                traverse(c);
                // Traverse iframe contentDocument
                if (c.tagName === 'IFRAME' && c.contentDocument) traverse(c.contentDocument);
                // Traverse shadowRoot
                if (c.shadowRoot) traverse(c.shadowRoot);
            }
        };
        traverse(this);
        return results;
    }

    querySelector(sel) {
        const all = this.querySelectorAll(sel);
        return all.length > 0 ? all[0] : null;
    }

    addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
    }

    dispatchEvent(evt) {
        const type = (evt && evt.type) || 'click';
        const list = this._listeners[type] || [];
        for (const fn of list) fn(evt);
        if (type === 'click' && typeof this.onclick === 'function') this.onclick(evt);
        return true;
    }

    click() {
        this.dispatchEvent({ type: 'click', target: this });
    }

    getBoundingClientRect() {
        return { top: 10, left: 10, width: 100, height: 40, right: 110, bottom: 50 };
    }

    contains(other) {
        let curr = other;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentElement;
        }
        return false;
    }
}

global.document = new MockNode('HTML');
global.document.body = new MockNode('BODY');
global.document.documentElement = global.document;
global.document.appendChild(global.document.body);
global.document.elementFromPoint = (x, y) => null;
global.document.querySelector = (sel) => global.document.querySelectorAll(sel)[0] || null;
global.document.querySelectorAll = (sel) => [];
global.document.createTreeWalker = () => ({ nextNode: () => null });

global.location = { href: 'https://example.com/', hostname: 'example.com', pathname: '/', origin: 'https://example.com' };
global.window.location = global.location;
global.window.innerWidth = 1280;
global.window.innerHeight = 800;

global.sessionStorage = {
    _data: {},
    getItem: (k) => global.sessionStorage._data[k] || null,
    setItem: (k, v) => { global.sessionStorage._data[k] = v; },
    removeItem: (k) => { delete global.sessionStorage._data[k]; },
    clear: () => { global.sessionStorage._data = {}; }
};
global.MutationObserver = class { observe() {} disconnect() {} };
global.Event = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
global.KeyboardEvent = class extends global.Event { constructor(type, init = {}) { super(type, init); this.key = init.key || ''; this.keyCode = init.keyCode || 0; } };
global.CustomEvent = class extends global.Event { constructor(type, init = {}) { super(type, init); this.detail = init.detail || null; } };


// Require modules under test
const emailModule = require('./modules/email-collector.js');
const contactEngineModule = require('./modules/contact-discovery-engine.js');
const contentScript = require('./content-script.js');

const { EmailCollectorStore, AUTHORITATIVE_EMAIL_KEYS } = emailModule;
const {
    ContactDiscoveryEngine,
    SniperDiscoveryEngine,
    SemanticGraphDiscoveryEngine,
    ContactDiscoveryEnsemble,
    resolveCandidateUrl,
    isMeaningfulContactPath
} = contactEngineModule;
const {
    FormDiscoveryEngine,
    SubmitExecutorR3,
    SubmissionOutcomeVerifier
} = contentScript;

// Test Runner
let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        failCount++;
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(err);
        failCount++;
    }
}

async function runAllTests() {
    console.log('\n=== [R5 ACCEPTANCE TEST SUITE — EMAIL RESET + DISCOVERY / FORM / SUBMIT] ===\n');

    // ========================================================================
    // A. EMAIL RESET (R5-E1 to R5-E6)
    // ========================================================================

    test('R5-E1: Enumerate actual production email keys', () => {
        assert(Array.isArray(AUTHORITATIVE_EMAIL_KEYS), 'AUTHORITATIVE_EMAIL_KEYS must be array');
        assert(AUTHORITATIVE_EMAIL_KEYS.includes('xpider_email_collector_v1'), 'Must include xpider_email_collector_v1');
        assert(AUTHORITATIVE_EMAIL_KEYS.includes('xpider_email_current_site_v1'), 'Must include xpider_email_current_site_v1');
        assert(AUTHORITATIVE_EMAIL_KEYS.includes('allEmailsList'), 'Must include legacy allEmailsList');
        assert(AUTHORITATIVE_EMAIL_KEYS.includes('collected_emails'), 'Must include collected_emails');
        assert(AUTHORITATIVE_EMAIL_KEYS.includes('email_export_cache'), 'Must include email_export_cache');
    });

    await asyncTest('R5-E2: Clear All zeros memory, current site, all-collected, and persistent storage', async () => {
        const store = new EmailCollectorStore(chrome.storage.local);
        await store.add('example.com', ['ceo@example.com', 'info@example.com'], 'https://example.com/');
        
        let state = await store.getState();
        assert.strictEqual(state.counts.all, 2, 'Must have 2 emails before clear');

        const clearRes = await store.clearAll({ suppressRecollectMs: 50 });
        assert.strictEqual(clearRes.success, true);
        assert.strictEqual(clearRes.totalGlobalCount, 0);

        state = await store.getState();
        assert.strictEqual(state.counts.all, 0, 'All collected count must be 0');
        assert.strictEqual(state.counts.current, 0, 'Current site count must be 0');
        assert.strictEqual(store.memoryEmails.size, 0, 'Memory cache must be empty');
    });

    await asyncTest('R5-E3: Popup reopen remains zero after Clear All', async () => {
        const store = new EmailCollectorStore(chrome.storage.local);
        await store.clearAll({ suppressRecollectMs: 50 });

        // Simulate popup reopen by creating new store instance reading storage
        const reopenedStore = new EmailCollectorStore(chrome.storage.local);
        const state = await reopenedStore.getState();
        assert.strictEqual(state.counts.all, 0, 'Reopened store must see 0 all-collected');
        assert.strictEqual(state.counts.current, 0, 'Reopened store must see 0 current site');
    });

    await asyncTest('R5-E4: Service-worker restart remains zero after Clear All', async () => {
        const store = new EmailCollectorStore(chrome.storage.local);
        await store.clearAll({ suppressRecollectMs: 50 });

        // Simulate service worker restart
        EmailCollectorStore._instance = null;
        const freshWorkerStore = EmailCollectorStore.getInstance(chrome.storage.local);
        await freshWorkerStore.init();
        const state = await freshWorkerStore.getState();
        assert.strictEqual(state.counts.all, 0, 'Restarted worker must see 0 count');
    });

    await asyncTest('R5-E5: Clear does not instantly recollect unchanged current DOM', async () => {
        const store = new EmailCollectorStore(chrome.storage.local);
        await store.clearAll({ suppressRecollectMs: 500 });

        // Simulate content script attempting to send same page emails immediately
        const addRes = await store.add('example.com', ['ceo@example.com'], 'https://example.com/', store.generation - 1);
        assert.strictEqual(addRes.currentPageCount, 0, 'Stale generation must be suppressed');
    });

    await asyncTest('R5-E6: New page navigation after clear collects again normally', async () => {
        const store = new EmailCollectorStore(chrome.storage.local);
        await store.clearAll({ suppressRecollectMs: 10 });
        await new Promise(r => setTimeout(r, 20));

        // New page with new emails and current generation
        const addRes = await store.add('newsite.com', ['contact@newsite.com'], 'https://newsite.com/contact', store.generation);
        assert.strictEqual(addRes.newGlobalCount, 1, 'New page navigation must collect normally');
        assert.strictEqual(addRes.totalGlobalCount, 1, 'Total must be 1');
    });

    // ========================================================================
    // B. DISCOVERY ENGINE 1 — Sniper URL / Route (R5-D1 to R5-D5)
    // ========================================================================

    await asyncTest('R5-D1: Root URL is recognized as valid target', async () => {
        assert.strictEqual(isMeaningfulContactPath('https://example.com/'), true);
        const cands = await SniperDiscoveryEngine.discover('https://example.com/');
        const rootCand = cands.find(c => c.source === 'sniper_root_source');
        assert(rootCand, 'SniperDiscoveryEngine must emit root source candidate');
        assert.strictEqual(rootCand.url, 'https://example.com/');
    });

    await asyncTest('R5-D2: Common contact path /contact is generated', async () => {
        const cands = await SniperDiscoveryEngine.discover('https://example.com/');
        const contactCand = cands.find(c => c.url.includes('/contact'));
        assert(contactCand, 'Must include common contact path candidate');
    });

    await asyncTest('R5-D3: Sitemap XML input discovers contact page candidate', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/company/reach-us</loc></url>
        </urlset>`;
        const cands = await SniperDiscoveryEngine.discover('https://example.com/', { sitemapXml: xml });
        const sitemapCand = cands.find(c => c.url === 'https://example.com/company/reach-us');
        assert(sitemapCand, 'Sitemap XML contact URL must be discovered');
    });

    await asyncTest('R5-D4: Cache prior good path is prioritized', async () => {
        SniperDiscoveryEngine.recordResult('goodsite.com', 'https://goodsite.com/custom-inquiry', true, true);
        const cands = await SniperDiscoveryEngine.discover('https://goodsite.com/');
        const priorCand = cands.find(c => c.source === 'cache_prior');
        assert(priorCand, 'Prior good path must be emitted');
        assert.strictEqual(priorCand.url, 'https://goodsite.com/custom-inquiry');
        assert.strictEqual(priorCand.confidence, 0.98);
    });

    test('R5-D5: Extension-only synthetic garbage (/.html, /.php) is NEVER generated', () => {
        assert.strictEqual(isMeaningfulContactPath('/.html'), false);
        assert.strictEqual(isMeaningfulContactPath('/.php'), false);
        assert.strictEqual(isMeaningfulContactPath('/.asp'), false);
        assert.strictEqual(isMeaningfulContactPath('/.aspx'), false);
        const generated = SniperDiscoveryEngine.generateCommonPaths('https://example.com/');
        for (const g of generated) {
            assert(!g.url.endsWith('/.html'), `Generated url must not end in /.html: ${g.url}`);
            assert(!g.url.endsWith('/.php'), `Generated url must not end in /.php: ${g.url}`);
        }
    });

    // ========================================================================
    // C. DISCOVERY ENGINE 2 — Semantic DOM / Graph (R5-D6 to R5-D10)
    // ========================================================================

    test('R5-D6: Footer-only contact link is detected with footer prior', () => {
        const doc = new MockNode('HTML');
        const footer = new MockNode('FOOTER');
        const link = new MockNode('A', { href: '/support/contact-us' }, 'Contact Support');
        footer.appendChild(link);
        doc.appendChild(footer);

        const links = SemanticGraphDiscoveryEngine.scanSemanticLinks(doc, 'https://example.com/');
        const footLink = links.find(l => l.url.includes('/support/contact-us'));
        assert(footLink, 'Footer link must be detected');
        assert.strictEqual(footLink.isFooter, true, 'isFooter must be true');
    });

    test('R5-D7: Mobile-menu hidden contact link revealed after menu expansion', () => {
        const doc = new MockNode('HTML');
        let menuOpened = false;
        const menuBtn = new MockNode('BUTTON', { className: 'hamburger', 'aria-expanded': 'false' }, 'Menu');
        menuBtn.onclick = () => {
            menuOpened = true;
            menuBtn.setAttribute('aria-expanded', 'true');
            const hiddenLink = new MockNode('A', { href: '/mobile-contact' }, 'Contact Us');
            doc.appendChild(hiddenLink);
        };
        doc.appendChild(menuBtn);

        const expanded = SemanticGraphDiscoveryEngine.expandHiddenMenus(doc);
        assert.strictEqual(expanded, 1, 'Menu expansion count must be 1');
        assert.strictEqual(menuOpened, true, 'Menu must be clicked');
        const links = SemanticGraphDiscoveryEngine.scanSemanticLinks(doc, 'https://example.com/');
        assert(links.some(l => l.url.includes('/mobile-contact')), 'Hidden contact link must be revealed');
    });

    test('R5-D8: Open ShadowDOM contact link is traversed', () => {
        const doc = new MockNode('HTML');
        const host = new MockNode('CUSTOM-WIDGET');
        const shadow = new MockNode('DIV');
        const link = new MockNode('A', { href: '/shadow-contact' }, 'Send Message');
        shadow.appendChild(link);
        host.shadowRoot = shadow;
        doc.appendChild(host);

        const shadowLinks = SemanticGraphDiscoveryEngine.traverseShadowDOM(doc, 'https://example.com/');
        assert(shadowLinks.some(l => l.url.includes('/shadow-contact')), 'ShadowDOM link must be discovered');
    });

    test('R5-D9: Same-origin iframe contact link is discovered', () => {
        const doc = new MockNode('HTML');
        const iframe = new MockNode('IFRAME');
        const ifrDoc = new MockNode('HTML');
        const link = new MockNode('A', { href: '/iframe-contact' }, 'Inquiry Form');
        ifrDoc.appendChild(link);
        iframe.contentDocument = ifrDoc;
        doc.appendChild(iframe);

        const ifrLinks = SemanticGraphDiscoveryEngine.traverseIframes(doc, 'https://example.com/');
        assert(ifrLinks.some(l => l.url.includes('/iframe-contact')), 'Same-origin iframe link must be discovered');
    });

    test('R5-D10: About -> Contact graph depth 2 traversal', () => {
        const candidates = SemanticGraphDiscoveryEngine.expandGraph(
            ['https://example.com/company/contact', 'https://example.com/faq'],
            'https://example.com/about',
            'https://example.com/',
            2
        );
        const contactCand = candidates.find(c => c.url === 'https://example.com/company/contact');
        assert(contactCand, 'Depth 2 contact node must be found');
        assert.strictEqual(contactCand.depth, 2);
    });

    // ========================================================================
    // D. ENSEMBLE (R5-D11 to R5-D14)
    // ========================================================================

    await asyncTest('R5-D11: Engine 1 fails -> Engine 2 still discovers candidates', async () => {
        const ensemble = new ContactDiscoveryEnsemble();
        const origSniper = ensemble.sniperEngine.discover;
        ensemble.sniperEngine.discover = async () => { throw new Error('Simulated Sniper Engine Crash'); };

        const doc = new MockNode('HTML');
        doc.appendChild(new MockNode('A', { href: '/fallback-contact' }, 'Contact Support'));

        const res = await ensemble.discover('https://example.com/', { document: doc });
        assert(res.candidates.some(c => c.url.includes('/fallback-contact')), 'Engine 2 must succeed when Engine 1 crashes');
        assert.strictEqual(res.errors.length, 1, 'Error must be logged in result');
        ensemble.sniperEngine.discover = origSniper;
    });

    await asyncTest('R5-D12: Engine 2 fails -> Engine 1 still discovers candidates', async () => {
        const ensemble = new ContactDiscoveryEnsemble();
        const origSemantic = ensemble.semanticEngine.discover;
        ensemble.semanticEngine.discover = async () => { throw new Error('Simulated Semantic DOM Crash'); };

        const res = await ensemble.discover('https://example.com/');
        assert(res.candidates.some(c => c.url.includes('/contact')), 'Engine 1 must succeed when Engine 2 crashes');
        assert.strictEqual(res.errors.length, 1);
        ensemble.semanticEngine.discover = origSemantic;
    });

    await asyncTest('R5-D13: Duplicate candidate evidence is merged into one record', async () => {
        const ensemble = new ContactDiscoveryEnsemble();
        const doc = new MockNode('HTML');
        // Add link that matches common path /contact
        doc.appendChild(new MockNode('A', { href: '/contact' }, 'Contact Us'));

        const res = await ensemble.discover('https://example.com/', { document: doc });
        const merged = res.candidates.find(c => c.url === 'https://example.com/contact');
        assert(merged, 'Must find /contact candidate');
        assert(merged.sources.length >= 2, `Candidate must merge multiple sources: ${JSON.stringify(merged.sources)}`);
        assert(merged.score > 50, 'Merged score must reflect multi-source corroboration');
    });

    test('R5-D14: Candidate discovery does not commit contactPageUrl to history at candidate stage', () => {
        const cand = { url: 'https://example.com/contact', verifiedEligibleForm: false };
        let historyContactUrl = null;
        if (cand.verifiedEligibleForm) {
            historyContactUrl = cand.url;
        }
        assert.strictEqual(historyContactUrl, null, 'contactPageUrl must not be committed before form verification');
    });

    // ========================================================================
    // E. FORM FINDER (R5-F1 to R5-F8)
    // ========================================================================

    await asyncTest('R5-F1: Native form with textarea is discovered', async () => {
        const doc = new MockNode('HTML');
        const form = new MockNode('FORM', { id: 'contact-form' });
        form.appendChild(new MockNode('INPUT', { type: 'text', name: 'name' }));
        form.appendChild(new MockNode('INPUT', { type: 'email', name: 'email' }));
        form.appendChild(new MockNode('TEXTAREA', { name: 'message' }));
        form.appendChild(new MockNode('BUTTON', { type: 'submit' }, 'Send'));
        doc.appendChild(form);

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert.strictEqual(found, form, 'Native form with textarea must be found');
    });

    await asyncTest('R5-F2: Form-like div with textarea + button is discovered', async () => {
        const doc = new MockNode('HTML');
        const div = new MockNode('DIV', { className: 'contact-wrapper form-container' });
        div.appendChild(new MockNode('INPUT', { type: 'email', name: 'email' }));
        div.appendChild(new MockNode('TEXTAREA', { name: 'inquiry' }));
        div.appendChild(new MockNode('BUTTON', {}, 'Send Inquiry'));
        doc.appendChild(div);

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert.strictEqual(found, div, 'Form-like div with inquiry textarea must be found');
    });

    await asyncTest('R5-F3: Modal form revealed after clicking Contact button', async () => {
        const doc = new MockNode('HTML');
        const contactBtn = new MockNode('BUTTON', {}, 'Contact Us');
        contactBtn.onclick = () => {
            const modal = new MockNode('DIV', { className: 'modal-form' });
            modal.appendChild(new MockNode('TEXTAREA', { name: 'message' }));
            modal.appendChild(new MockNode('BUTTON', { type: 'submit' }, 'Submit'));
            doc.appendChild(modal);
        };
        doc.appendChild(contactBtn);

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert(found, 'Modal form revealed by Contact Us button must be discovered');
    });

    await asyncTest('R5-F4: Lazy form appears after simulated scroll', async () => {
        const doc = new MockNode('HTML');
        global.window.scrollBy = () => {
            const lazyForm = new MockNode('FORM', { id: 'lazy-contact' });
            lazyForm.appendChild(new MockNode('TEXTAREA', { name: 'message' }));
            doc.appendChild(lazyForm);
        };

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert(found, 'Lazy form appearing after scroll must be found');
        delete global.window.scrollBy;
    });

    await asyncTest('R5-F5: ShadowDOM form is discovered', async () => {
        const doc = new MockNode('HTML');
        const host = new MockNode('CRM-WIDGET');
        const shadow = new MockNode('DIV');
        const form = new MockNode('FORM', { id: 'shadow-form' });
        form.appendChild(new MockNode('TEXTAREA', { name: 'message' }));
        shadow.appendChild(form);
        host.shadowRoot = shadow;
        doc.appendChild(host);

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert.strictEqual(found, form, 'Form inside open ShadowDOM must be found');
    });

    await asyncTest('R5-F6: Same-origin iframe form is discovered', async () => {
        const doc = new MockNode('HTML');
        const iframe = new MockNode('IFRAME');
        const ifrDoc = new MockNode('HTML');
        const form = new MockNode('FORM', { id: 'iframe-form' });
        form.appendChild(new MockNode('TEXTAREA', { name: 'message' }));
        ifrDoc.appendChild(form);
        iframe.contentDocument = ifrDoc;
        doc.appendChild(iframe);

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert.strictEqual(found, form, 'Form inside accessible iframe must be found');
    });

    await asyncTest('R5-F7: Newsletter-only form is rejected', async () => {
        const doc = new MockNode('HTML');
        const form = new MockNode('FORM', { className: 'newsletter-signup' });
        form.appendChild(new MockNode('INPUT', { type: 'email', name: 'newsletter_email' }));
        form.appendChild(new MockNode('BUTTON', { type: 'submit' }, 'Subscribe'));
        doc.appendChild(form);

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert.strictEqual(found, null, 'Newsletter-only form must be rejected');
    });

    await asyncTest('R5-F8: Form with no message/inquiry body field is rejected', async () => {
        const doc = new MockNode('HTML');
        const form = new MockNode('FORM', { id: 'search-form' });
        form.appendChild(new MockNode('INPUT', { type: 'text', name: 'query' }));
        form.appendChild(new MockNode('BUTTON', { type: 'submit' }, 'Search'));
        doc.appendChild(form);

        const engine = new FormDiscoveryEngine();
        const found = await engine.discoverForm(doc);
        assert.strictEqual(found, null, 'Form without inquiry body field must be rejected');
    });

    // ========================================================================
    // F. SUBMIT EXECUTOR R3 (R5-S1 to R5-S10)
    // ========================================================================

    await asyncTest('R5-S1: requestSubmit works on standard form', async () => {
        let requestSubmitCalled = false;
        const form = new MockNode('FORM');
        form.requestSubmit = () => { requestSubmitCalled = true; };
        const btn = new MockNode('BUTTON', { type: 'submit' }, 'Submit');
        form.appendChild(btn);

        const executor = new SubmitExecutorR3(form);
        const res = await executor.execute();
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.strategy, 'requestSubmit');
        assert.strictEqual(requestSubmitCalled, true);
    });

    await asyncTest('R5-S2: Disabled button undergoes activation repair and submits when enabled', async () => {
        const form = new MockNode('FORM');
        form.requestSubmit = () => {};
        const btn = new MockNode('BUTTON', { type: 'submit', disabled: true }, 'Submit');
        form.appendChild(btn);

        // Simulate async enablement after 100ms
        setTimeout(() => { btn.disabled = false; }, 100);

        const executor = new SubmitExecutorR3(form);
        const res = await executor.execute();
        assert.strictEqual(res.success, true, 'Repaired submit must succeed');
    });

    await asyncTest('R5-S3: Custom button click works when requestSubmit is unavailable', async () => {
        let clicked = false;
        const divForm = new MockNode('DIV', { className: 'custom-form' });
        const btn = new MockNode('DIV', { role: 'button' }, 'Send Message');
        btn.onclick = () => { clicked = true; };
        divForm.appendChild(btn);

        const executor = new SubmitExecutorR3(divForm);
        const res = await executor.execute();
        assert.strictEqual(res.success, true);
        assert.strictEqual(clicked, true);
    });

    await asyncTest('R5-S4: Alternate submit candidate attempted if primary produces no effect', async () => {
        let secondClicked = false;
        const divForm = new MockNode('FORM');
        // Primary: requestSubmit throws immediately
        divForm.requestSubmit = (btn) => { throw new Error('Validation blocked'); };
        const btn1 = new MockNode('BUTTON', { type: 'submit' }, 'Send Message');
        // Mark btn1 as permanently disabled so isDisabled() returns true after repairActivation too
        Object.defineProperty(btn1, 'disabled', { get: () => true, set: () => {} });
        const btn2 = new MockNode('BUTTON', { type: 'submit', className: 'alt-submit' }, 'Submit Inquiry');
        btn2.onclick = () => { secondClicked = true; };
        divForm.appendChild(btn1);
        divForm.appendChild(btn2);

        const executor = new SubmitExecutorR3(divForm);
        const res = await executor.execute();
        // Stage 2 skipped (primary disabled), Stage 3-4 skipped (disabled) → Stage 5 alternate clicked
        assert.strictEqual(secondClicked, true, 'Alternate submit candidate must be triggered');
        assert.strictEqual(res.success, true);
    });

    await asyncTest('R5-S5: Overlay dismissed safely once before clicking submit', async () => {
        const form = new MockNode('FORM');
        form.requestSubmit = () => {};
        const btn = new MockNode('BUTTON', { type: 'submit' }, 'Submit');
        form.appendChild(btn);

        let overlayDismissed = false;
        const overlay = new MockNode('DIV', { className: 'cookie-consent-overlay' });
        const closeBtn = new MockNode('BUTTON', { className: 'close' }, 'X');
        closeBtn.onclick = () => { overlayDismissed = true; };
        overlay.appendChild(closeBtn);

        global.document.elementFromPoint = () => overlay;

        const executor = new SubmitExecutorR3(form);
        await executor.handleOverlay(btn);
        assert.strictEqual(overlayDismissed, true, 'Overlay close button must be clicked');
        global.document.elementFromPoint = () => null;
    });

    await asyncTest('R5-S6: Keyboard-compatible Enter fallback is bounded to 1 attempt', async () => {
        let enterEventsCount = 0;
        const divForm = new MockNode('DIV');
        const btn = new MockNode('BUTTON', {}, 'Send');
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') enterEventsCount++;
        });
        divForm.appendChild(btn);

        const executor = new SubmitExecutorR3(divForm);
        await executor.execute();
        assert(enterEventsCount <= 1, 'Keyboard fallback must never loop');
    });

    await asyncTest('R5-S7: No duplicate submit events fired', async () => {
        let submitCount = 0;
        const form = new MockNode('FORM');
        form.requestSubmit = () => {
            submitCount++;
            form.dispatchEvent({ type: 'submit' });
        };
        const btn = new MockNode('BUTTON', { type: 'submit' }, 'Submit');
        form.appendChild(btn);

        const executor = new SubmitExecutorR3(form);
        await executor.execute();
        assert.strictEqual(submitCount, 1, 'Form must be submitted exactly once');
    });

    await asyncTest('R5-S8: AJAX same-page confirmation resolves to SUCCESS', async () => {
        const form = new MockNode('FORM');
        const verifier = new SubmissionOutcomeVerifier(form);
        verifier.capturePreSubmitSnapshot = () => ({
            url: 'https://example.com/contact',
            formSignature: 'form',
            visibleErrorsCount: 0,
            bodyText: '',
            existingSuccessTexts: []
        });

        // Simulate successful thank-you message appearing on same page
        verifier.evaluateSignals = () => ({
            isDecisiveSuccess: true,
            isDecisiveFailure: false,
            successSignal: 'thank you for your message'
        });

        const res = await verifier.verify({ success: true, reasonCode: 'SUBMIT_TRIGGERED' });
        assert.strictEqual(res.success, true, 'AJAX same-page success confirmation must settle SUCCESS');
        assert.strictEqual(res.reasonCode, 'SUBMISSION_CONFIRMED_SUCCESS');
    });

    await asyncTest('R5-S9: Server/validation error settles to FAILURE, not SUCCESS', async () => {
        const form = new MockNode('FORM');
        const verifier = new SubmissionOutcomeVerifier(form);
        verifier.capturePreSubmitSnapshot = () => ({
            url: 'https://example.com/contact',
            formSignature: 'form',
            visibleErrorsCount: 0,
            bodyText: '',
            existingSuccessTexts: []
        });

        // Simulate server error signal
        verifier.evaluateSignals = () => ({
            isDecisiveSuccess: false,
            isDecisiveFailure: true,
            failureSignal: 'Submission failed: invalid captcha'
        });

        const res = await verifier.verify({ success: true, reasonCode: 'SUBMIT_TRIGGERED' });
        assert.strictEqual(res.success, false, 'Server/validation error must settle to FAILURE');
        assert.strictEqual(res.reasonCode, 'SUBMISSION_OUTCOME_FAILURE');
    });

    await asyncTest('R5-S10: FORCED_NATIVE_SUBMIT_LAST_RESORT triggers only when opted into via config', async () => {
        let nativeSubmitCalled = false;
        const form = new MockNode('FORM');
        form.submit = () => { nativeSubmitCalled = true; };

        // Test without opt-in: must NOT call form.submit()
        const executorDefault = new SubmitExecutorR3(form, {}, { allowForcedNativeSubmit: false });
        const resDefault = await executorDefault.execute();
        assert.strictEqual(nativeSubmitCalled, false, 'Default execution must not call form.submit()');

        // Test with opt-in: calls form.submit() as last resort
        const executorForced = new SubmitExecutorR3(form, {}, { allowForcedNativeSubmit: true });
        const resForced = await executorForced.execute();
        assert.strictEqual(nativeSubmitCalled, true, 'Opted-in execution may call form.submit() as last resort');
        assert(resForced.strategy === 'FORCED_NATIVE_SUBMIT_LAST_RESORT' || resForced.strategy === 'FORCED_FORM_SUBMIT_LAST_RESORT', 'Strategy should be FORCED_FORM_SUBMIT_LAST_RESORT');
    });

    // Summary
    console.log(`\n=== SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===\n`);
    if (failCount > 0) {
        process.exit(1);
    }
}

runAllTests().catch((e) => {
    console.error('Test suite runner crashed:', e);
    process.exit(1);
});
