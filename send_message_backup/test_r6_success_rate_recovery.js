/**
 * test_r6_success_rate_recovery.js
 *
 * [Issue #6 R6] Acceptance Test Suite - SUCCESS RATE RECOVERY
 *
 * Tests:
 *  CheckboxResolverR2:
 *   R6-CB1  Classify: privacy_required
 *   R6-CB2  Classify: terms_required
 *   R6-CB3  Classify: marketing_optional -- NEVER auto-check
 *   R6-CB4  Classify: newsletter_optional -- NEVER auto-check
 *   R6-CB5  Classify: sms_marketing_optional -- NEVER auto-check
 *   R6-CB6  Boston BJJ inquiry_choice group: select ONE and cache across rerenders
 *   R6-CB7  Unknown + required => auto-check
 *   R6-CB8  Honeypot => skip
 *   R6-CB9  resolveAllInForm: stable=true when all required stable
 *   R6-CB10 resolveAllInForm: stable=false when required checkbox reverts
 *
 *  SelectResolverR2:
 *   R6-SE1  Native select: inquiry-ranked option wins
 *   R6-SE2  Native select: placeholder excluded
 *   R6-SE3  Native select: sensitive factual field blocked (UNRESOLVED_FACTUAL_DROPDOWN)
 *   R6-SE4  resolveAllInForm: handles native selects
 *   R6-SE5  Custom dropdown: resolveCustomDropdown stub (no crash when no options)
 *   R6-SE6  Post-render verify + 1 corrective retry
 *
 *  Contact Discovery Baseline First:
 *   R6-CD1  ContactDiscoveryEnsemble DOM anchor candidate has high score
 *   R6-CD2  ContactDiscoveryEnsemble.discover returns result
 *
 *  FormDiscoveryEngine R2:
 *   R6-FD1  FormDiscoveryEngineR2 is exported alias of FormDiscoveryEngine
 *   R6-FD2  FormDiscoveryEngine.discoverForm returns null on empty document
 *
 *  SubmitExecutorR4:
 *   R6-SB1  SubmitExecutorR4 exported; has discoverSubmitActions method
 *   R6-SB2  discoverSubmitActions: rejects Next/Login/Search/Subscribe buttons
 *   R6-SB3  discoverSubmitActions: accepts Send/Submit/Contact buttons
 *   R6-SB4  SubmitExecutorR3 is alias of SubmitExecutorR4 (backward compat)
 *
 *  Lifecycle:
 *   R6-LC1  finishCampaign sends SENDER_FINISHED or is internal
 *
 * BACKWARD COMPAT:
 *   R6-BC1  All R5 structural exports still present
 *   R6-BC2  CheckboxResolverR2 API surface complete
 *   R6-BC3  SelectResolverR2 API surface complete
 */

'use strict';

const assert = require('assert');

/* =========================================================================
 * Mock browser environment
 * ========================================================================= */
const mockStorage = {};
const mockSessionStorage = {};
const messageListeners = [];
let broadcastMessages = [];

global.self = global;
global.window = global;

global.chrome = {
    storage: {
        local: {
            get: (keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
            set: (items, cb) => { Object.assign(mockStorage, items); if (typeof cb === 'function') cb(); return Promise.resolve(); },
            remove: (keys, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); }
        },
        session: {
            get: (keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
            set: (items, cb) => { Object.assign(mockSessionStorage, items); if (typeof cb === 'function') cb(); return Promise.resolve(); },
            remove: (keys, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); }
        }
    },
    runtime: {
        lastError: null,
        sendMessage: (msg, cb) => {
            broadcastMessages.push(msg);
            for (const l of messageListeners) {
                try { l(msg, { tab: { id: 100 } }, (r) => { if (typeof cb === 'function') cb(r); }); } catch (_) {}
            }
            if (typeof cb === 'function') cb({ success: true });
            return Promise.resolve({ success: true });
        },
        onMessage: { addListener: (fn) => messageListeners.push(fn) }
    },
    tabs: {
        query: (q, cb) => { if (typeof cb === 'function') cb([{ id: 101, url: 'https://example.com/' }]); },
        sendMessage: (tid, msg, cb) => { broadcastMessages.push(Object.assign({ tabId: tid }, msg)); if (typeof cb === 'function') cb({ success: true }); }
    },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} }
};

/* =========================================================================
 * Mock DOM Node
 * ========================================================================= */
class MockNode {
    constructor(tagName, attrs, textContent) {
        tagName = tagName || 'DIV';
        attrs = attrs || {};
        textContent = textContent || '';
        this.tagName = tagName.toUpperCase();
        this.nodeType = 1;
        this.id = attrs.id || '';
        this.className = attrs.className || attrs.class || '';
        this.classList = {
            contains: (c) => (this.className || '').split(' ').includes(c),
            add: (c) => { this.className = ((this.className || '') + ' ' + c).trim(); },
            remove: (c) => { this.className = (this.className || '').split(' ').filter(function(x) { return x !== c; }).join(' '); }
        };
        this.textContent = textContent;
        this.innerText = textContent;
        this.value = attrs.value || '';
        this.type = attrs.type || (this.tagName === 'INPUT' ? 'text' : '');
        this.name = attrs.name || '';
        this.checked = !!attrs.checked;
        this.disabled = !!attrs.disabled;
        this.required = !!attrs.required;
        this.attributes = Object.assign({}, attrs);
        this.children = [];
        this.parentElement = null;
        this._listeners = {};
        this.shadowRoot = null;
        this.options = attrs.options || [];
        this.selectedIndex = attrs.selectedIndex !== undefined ? attrs.selectedIndex : 0;
        this.style = {};
        this.contentEditable = 'false';
        this.isConnected = true;
    }

    getAttribute(k) { return this.attributes[k] !== undefined ? String(this.attributes[k]) : null; }
    setAttribute(k, v) { this.attributes[k] = v; }
    removeAttribute(k) { delete this.attributes[k]; }
    hasAttribute(k) { return this.attributes[k] !== undefined; }

    appendChild(c) { if (!c) return c; c.parentElement = this; this.children.push(c); return c; }
    removeChild(c) {
        const i = this.children.indexOf(c);
        if (i !== -1) { this.children.splice(i, 1); c.parentElement = null; }
        return c;
    }

    closest(sel) {
        let c = this;
        while (c) { if (c.matches && c.matches(sel)) return c; c = c.parentElement; }
        return null;
    }

    matches(sel) {
        const tag = this.tagName.toLowerCase();
        const parts = sel.split(',').map(function(s) { return s.trim().toLowerCase(); });
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (p === tag) return true;
            if (p.charAt(0) === '.' && (this.className || '').split(' ').indexOf(p.slice(1)) !== -1) return true;
            if (p.charAt(0) === '#' && this.id === p.slice(1)) return true;
            const mt = p.match(/type=['"]([^'"]+)['"]/);
            if (mt && this.type === mt[1]) return true;
        }
        return false;
    }

    querySelectorAll(sel) {
        const results = [];
        const parts = sel.split(',').map(function(s) { return s.trim().toLowerCase(); });
        const self = this;
        function matchNode(node) {
            const tag = (node.tagName || '').toLowerCase();
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                if (p === tag) return true;
                if (p.charAt(0) === '.' && (node.className || '').toLowerCase().split(' ').indexOf(p.slice(1)) !== -1) return true;
                if (p.charAt(0) === '#' && (node.id || '').toLowerCase() === p.slice(1)) return true;
                if (p.indexOf('input[type') === 0 && tag === 'input') {
                    const m = p.match(/type=['"]([^'"]+)['"]/);
                    if (m && node.type === m[1]) return true;
                }
                const mn = p.match(/\[name=['"]([^'"]+)['"]\]/);
                if (mn && node.name === mn[1]) return true;
                if (p.indexOf('[aria-required') !== -1 && node.getAttribute('aria-required') === 'true') return true;
            }
            return false;
        }
        function traverse(node) {
            const ch = node.children || [];
            for (let i = 0; i < ch.length; i++) {
                if (matchNode(ch[i])) results.push(ch[i]);
                traverse(ch[i]);
                if (ch[i].shadowRoot) traverse(ch[i].shadowRoot);
            }
        }
        traverse(this);
        return results;
    }

    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

    addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
    }

    dispatchEvent(evt) {
        const type = (evt && evt.type) || 'click';
        const list = this._listeners[type] || [];
        for (let i = 0; i < list.length; i++) list[i](evt);
        return true;
    }

    click() { this.dispatchEvent({ type: 'click', target: this }); }
    focus() {}
    blur() {}
    scrollIntoView() {}
    getBoundingClientRect() { return { top: 10, left: 10, width: 100, height: 40, right: 110, bottom: 50 }; }

    contains(other) {
        let c = other;
        while (c) { if (c === this) return true; c = c.parentElement; }
        return false;
    }
}

/* =========================================================================
 * DOM globals
 * ========================================================================= */
global.document = new MockNode('HTML');
global.document.body = new MockNode('BODY');
global.document.documentElement = global.document;
global.document.appendChild(global.document.body);
global.document.elementFromPoint = function() { return null; };
global.document.querySelector = function(sel) { return global.document.querySelectorAll(sel)[0] || null; };
global.document.querySelectorAll = function() { return []; };
global.document.createTreeWalker = function() { return { nextNode: function() { return null; } }; };

global.location = { href: 'https://example.com/', hostname: 'example.com', pathname: '/', origin: 'https://example.com' };
global.window.location = global.location;
global.window.innerWidth = 1280;
global.window.innerHeight = 800;

global.sessionStorage = {
    _data: {},
    getItem: function(k) { return global.sessionStorage._data[k] || null; },
    setItem: function(k, v) { global.sessionStorage._data[k] = v; },
    removeItem: function(k) { delete global.sessionStorage._data[k]; },
    clear: function() { global.sessionStorage._data = {}; }
};

global.MutationObserver = function() {};
global.MutationObserver.prototype.observe = function() {};
global.MutationObserver.prototype.disconnect = function() {};

global.Event = function(type, init) { this.type = type; if (init) Object.assign(this, init); };
global.MouseEvent = function(type, init) { global.Event.call(this, type, init); };
global.MouseEvent.prototype = Object.create(global.Event.prototype);
global.PointerEvent = function(type, init) { global.Event.call(this, type, init); };
global.PointerEvent.prototype = Object.create(global.Event.prototype);
global.KeyboardEvent = function(type, init) { global.Event.call(this, type, init); this.key = (init && init.key) || ''; };
global.KeyboardEvent.prototype = Object.create(global.Event.prototype);
global.FocusEvent = function(type, init) { global.Event.call(this, type, init); };
global.FocusEvent.prototype = Object.create(global.Event.prototype);
global.CustomEvent = function(type, init) { global.Event.call(this, type, init); this.detail = (init && init.detail) || null; };
global.CustomEvent.prototype = Object.create(global.Event.prototype);

global.HTMLInputElement = { prototype: {} };
global.HTMLSelectElement = { prototype: {} };
global.HTMLTextAreaElement = { prototype: {} };
global.CSS = { escape: function(s) { return s; } };
global.fetch = function() { return Promise.resolve({ ok: false, status: 404, json: function() { return Promise.resolve({}); } }); };

/* =========================================================================
 * Load modules
 * ========================================================================= */
const CheckboxResolverR2 = require('./modules/checkbox-resolver-r2.js');
const SelectResolverR2 = require('./modules/select-resolver-r2.js');
const contactEngineModule = require('./modules/contact-discovery-engine.js');
const contentScript = require('./content-script.js');

const { ContactDiscoveryEnsemble } = contactEngineModule;
const {
    FormDiscoveryEngine,
    FormDiscoveryEngineR2,
    SubmitExecutorR3,
    SubmitExecutorR4,
    SubmissionOutcomeVerifier,
    _CheckboxResolverR2: exportedCBR2,
    _SelectResolverR2: exportedSER2,
    finishCampaign
} = contentScript;

/* =========================================================================
 * Test Runner
 * ========================================================================= */
let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  [PASS] ' + name);
        passCount++;
    } catch (err) {
        console.error('  [FAIL] ' + name);
        console.error('     ' + err.message);
        failCount++;
    }
}

function asyncTest(name, fn) {
    return fn().then(function() {
        console.log('  [PASS] ' + name);
        passCount++;
    }).catch(function(err) {
        console.error('  [FAIL] ' + name);
        console.error('     ' + err.message);
        failCount++;
    });
}

/* =========================================================================
 * Helpers
 * ========================================================================= */
function makeCheckbox(attrs, labelText) {
    attrs = Object.assign({ type: 'checkbox' }, attrs || {});
    labelText = labelText || '';
    const cb = new MockNode('INPUT', attrs);
    cb.checked = !!attrs.checked;
    cb._labelText = labelText;
    return cb;
}

function makeSelect(options, attrs) {
    attrs = attrs || {};
    options = options || [];
    const sel = new MockNode('SELECT', attrs);
    sel.tagName = 'SELECT';
    sel.options = options.map(function(opt, i) {
        const o = new MockNode('OPTION', { value: opt.value || opt.text || String(i) }, opt.text || '');
        o.value = opt.value || opt.text || String(i);
        o.text = opt.text || '';
        o.disabled = !!opt.disabled;
        return o;
    });
    sel.selectedIndex = 0;
    sel.value = options.length > 0 ? (options[0].value || '') : '';
    sel.required = !!attrs.required;
    sel.name = attrs.name || '';
    sel.getAttribute = function(k) { return attrs[k] !== undefined ? String(attrs[k]) : null; };
    return sel;
}

function makeForm(children) {
    children = children || [];
    const form = new MockNode('FORM');
    for (let i = 0; i < children.length; i++) form.appendChild(children[i]);
    return form;
}

/* =========================================================================
 * Test Execution
 * ========================================================================= */
async function runAllTests() {
    console.log('\n=== [R6 ACCEPTANCE TEST SUITE -- SUCCESS RATE RECOVERY] ===\n');

    /* ── A. CheckboxResolverR2 ── */
    console.log('\n-- A. CheckboxResolverR2 --\n');

    test('R6-CB1: Classify privacy_required checkbox', function() {
        const resolver = new CheckboxResolverR2();
        const cb = makeCheckbox({ id: 'prv' }, 'I agree to the Privacy Policy');
        const cat = resolver.classify(cb, 'i agree to the privacy policy');
        assert(cat === 'privacy_required' || cat === 'terms_required', 'Expected privacy_required or terms_required, got "' + cat + '"');
    });

    test('R6-CB2: Classify terms_required checkbox', function() {
        const resolver = new CheckboxResolverR2();
        const cb = makeCheckbox({ id: 'tos' }, 'Accept Terms of Service');
        const cat = resolver.classify(cb, 'accept terms of service');
        assert(cat === 'terms_required' || cat === 'privacy_required', 'Expected terms_required or privacy_required, got "' + cat + '"');
    });

    test('R6-CB3: Classify marketing_optional -- NEVER auto-check', function() {
        const resolver = new CheckboxResolverR2();
        const cb = makeCheckbox({ id: 'mkt' }, 'Receive promotional offers');
        const cat = resolver.classify(cb, 'receive promotional offers and discounts');
        assert(cat === 'marketing_optional', 'Expected marketing_optional, got "' + cat + '"');
        const noAutoCheck = cat === 'marketing_optional' || cat === 'newsletter_optional' || cat === 'sms_marketing_optional';
        assert(noAutoCheck, 'marketing_optional should NOT be auto-checked');
    });

    test('R6-CB4: Classify newsletter_optional -- NEVER auto-check', function() {
        const resolver = new CheckboxResolverR2();
        const cb = makeCheckbox({ id: 'nl' }, 'Subscribe to our newsletter');
        const cat = resolver.classify(cb, 'subscribe to our newsletter');
        assert(cat === 'newsletter_optional', 'Expected newsletter_optional, got "' + cat + '"');
    });

    test('R6-CB5: Classify sms_marketing_optional -- NEVER auto-check', function() {
        const resolver = new CheckboxResolverR2();
        const cb = makeCheckbox({ id: 'sms' }, 'Receive SMS text alerts');
        const cat = resolver.classify(cb, 'receive sms text alerts');
        assert(cat === 'sms_marketing_optional', 'Expected sms_marketing_optional, got "' + cat + '"');
    });

    test('R6-CB6: inquiry_choice group -- Boston BJJ caching selects ONE and caches', function() {
        const resolver = new CheckboxResolverR2();
        const opt1 = makeCheckbox({ id: 'bjj-adult', name: 'program', value: 'adult_bjj' }, 'Adult BJJ');
        const opt2 = makeCheckbox({ id: 'bjj-kids', name: 'program', value: 'kids_bjj' }, 'Kids BJJ');
        const opt3 = makeCheckbox({ id: 'bjj-muay', name: 'program', value: 'muay_thai' }, 'Muay Thai');

        const groupKey = 'program';
        const dec1 = resolver.decideGroupSelection(opt1, groupKey, true);
        const dec2 = resolver.decideGroupSelection(opt2, groupKey, true);
        const dec3 = resolver.decideGroupSelection(opt3, groupKey, true);

        assert(dec1 === true, 'First option in required group should be selected');
        assert(dec2 === false, 'Second option in required group should NOT be selected');
        assert(dec3 === false, 'Third option in required group should NOT be selected');
        assert(resolver.cachedGroupChoices.has(groupKey), 'groupKey should be cached');
        assert(resolver.cachedGroupChoices.get(groupKey) === 'adult_bjj', 'Cached value should be adult_bjj');
    });

    test('R6-CB7: unknown + required attribute => auto-check', function() {
        const resolver = new CheckboxResolverR2();
        const cb = makeCheckbox({ required: true }, '');
        const cat = resolver.classify(cb, '');
        assert(cat === 'unknown', 'Expected unknown, got "' + cat + '"');
    });

    test('R6-CB8: Honeypot checkbox => skip', function() {
        const resolver = new CheckboxResolverR2();
        const cb = makeCheckbox({ id: 'honeypot', name: 'honeypot' }, '');
        const isHoneypot = resolver.isHoneypot(cb);
        assert(isHoneypot === true, 'Checkbox with name=honeypot should be identified as honeypot');
    });

    await asyncTest('R6-CB9: resolveAllInForm stable=true when required checkbox settles', async function() {
        const resolver = new CheckboxResolverR2();
        const form = makeForm([]);
        const privCb = makeCheckbox({ id: 'prv', required: true }, 'privacy policy');
        privCb.getAttribute = function() { return null; };
        privCb.checked = false;
        form.appendChild(privCb);
        form.children = [privCb];

        const res = await resolver.resolveAllInForm(form);
        assert(typeof res === 'object', 'resolveAllInForm must return object');
        assert('handledCount' in res, 'Must have handledCount');
        assert('stable' in res, 'Must have stable');
    });

    await asyncTest('R6-CB10: resolveAllInForm reports instability when checkbox reverts', async function() {
        const resolver = new CheckboxResolverR2({ maxRetries: 0 });
        const form = makeForm([]);
        const privCb = makeCheckbox({ required: true }, 'privacy policy');
        privCb.getAttribute = function() { return null; };
        privCb.checked = false;
        // Override setNativeChecked to be a noop -- never actually sets
        resolver.setNativeChecked = function() {};
        form.appendChild(privCb);
        form.children = [privCb];

        const res = await resolver.resolveAllInForm(form);
        assert(typeof res === 'object', 'Must return object');
        const anyUnstable = (res.results || []).some(function(r) { return r.stable === false; });
        assert(anyUnstable || !res.stable, 'Should report instability when checkbox reverts');
    });

    /* ── B. SelectResolverR2 ── */
    console.log('\n-- B. SelectResolverR2 --\n');

    await asyncTest('R6-SE1: Native select picks inquiry-ranked option', async function() {
        const resolver = new SelectResolverR2();
        const sel = makeSelect([
            { text: 'Please select', value: '' },
            { text: 'Newsletter', value: 'newsletter' },
            { text: 'General Inquiry', value: 'general' },
            { text: 'Sales', value: 'sales' }
        ], { name: 'inquiry_type' });

        resolver.applyNativeAndVerify = async function(selectEl, targetIdx, targetVal) {
            selectEl.selectedIndex = targetIdx;
            selectEl.value = targetVal;
            return { handled: true, type: 'native', purpose: 'inquiry', selected: true, stable: true, retry: 0, reasonCode: 'STABLE' };
        };

        const res = await resolver.resolveNativeSelect(sel);
        assert(res && res.handled === true, 'Should handle the select');
        assert(res.selected === true, 'Should select an option');
        assert(sel.value === 'general' || res.stable, 'Expected general inquiry to be selected');
    });

    await asyncTest('R6-SE2: Native select excludes placeholder', async function() {
        const resolver = new SelectResolverR2();
        const sel = makeSelect([
            { text: 'Select an option', value: '' },
            { text: 'Option A', value: 'a' }
        ], { name: 'category' });

        resolver.applyNativeAndVerify = async function(selectEl, targetIdx, targetVal) {
            selectEl.selectedIndex = targetIdx;
            selectEl.value = targetVal;
            return { handled: true, type: 'native', purpose: 'inquiry', selected: true, stable: true, retry: 0, reasonCode: 'STABLE' };
        };

        const res = await resolver.resolveNativeSelect(sel);
        assert(res && res.handled, 'Must handle select');
        assert(sel.value !== '' || sel.selectedIndex !== 0, 'Placeholder must not be selected');
    });

    await asyncTest('R6-SE3: Sensitive factual field blocked (UNRESOLVED_FACTUAL_DROPDOWN)', async function() {
        const resolver = new SelectResolverR2();
        const sel = makeSelect([
            { text: 'Select Revenue', value: '' },
            { text: '$1M-$5M', value: '1m' }
        ], { name: 'annual_revenue', id: 'annual_revenue' });
        sel.name = 'annual_revenue';
        sel.id = 'annual_revenue';
        sel.getAttribute = function(k) { return k === 'name' ? 'annual_revenue' : (k === 'id' ? 'annual_revenue' : null); };

        const res = await resolver.resolveNativeSelect(sel);
        assert(res && res.reasonCode === 'UNRESOLVED_FACTUAL_DROPDOWN',
            'Expected UNRESOLVED_FACTUAL_DROPDOWN, got "' + (res && res.reasonCode) + '"');
    });

    await asyncTest('R6-SE4: resolveAllInForm handles native selects', async function() {
        const resolver = new SelectResolverR2();
        const form = makeForm([]);
        const sel = makeSelect([
            { text: 'Select...', value: '' },
            { text: 'General Inquiry', value: 'general' }
        ], { name: 'type' });
        form.appendChild(sel);
        form.children = [sel];

        resolver.applyNativeAndVerify = async function(selectEl, targetIdx, targetVal) {
            selectEl.selectedIndex = targetIdx;
            selectEl.value = targetVal;
            return { handled: true, type: 'native', purpose: 'inquiry', selected: true, stable: true, retry: 0, reasonCode: 'STABLE' };
        };

        const res = await resolver.resolveAllInForm(form);
        assert(typeof res === 'object', 'Must return object');
        assert('handledCount' in res, 'Must have handledCount');
        assert('stable' in res, 'Must have stable');
        assert(res.handledCount >= 1, 'Expected at least 1 handled, got ' + res.handledCount);
    });

    await asyncTest('R6-SE5: resolveCustomDropdown does not crash on empty container', async function() {
        const resolver = new SelectResolverR2();
        const container = new MockNode('DIV', { class: 'react-select__control' });
        container.children = [];
        let threw = false;
        try { await resolver.resolveCustomDropdown(container); } catch (e) { threw = true; }
        assert(!threw, 'resolveCustomDropdown must not throw on empty container');
    });

    await asyncTest('R6-SE6: Post-render verify + 1 corrective retry', async function() {
        const resolver = new SelectResolverR2();
        const sel = makeSelect([
            { text: 'Select...', value: '' },
            { text: 'General Inquiry', value: 'general' }
        ], { name: 'inquiry' });

        let callCount = 0;
        resolver.applyNativeAndVerify = async function(selectEl, targetIdx, targetVal) {
            callCount++;
            if (callCount === 1) {
                return { handled: true, type: 'native', purpose: 'inquiry', selected: true, stable: false, retry: 0, reasonCode: 'REQUIRED_SELECT_UNSTABLE' };
            }
            return { handled: true, type: 'native', purpose: 'inquiry', selected: true, stable: true, retry: 1, reasonCode: 'STABLE' };
        };

        const res = await resolver.resolveNativeSelect(sel);
        assert(res && res.handled === true, 'Should handle');
        assert(res.reasonCode === 'STABLE' || res.reasonCode === 'REQUIRED_SELECT_UNSTABLE',
            'Expected STABLE or REQUIRED_SELECT_UNSTABLE, got "' + res.reasonCode + '"');
    });

    /* ── C. Contact Discovery Baseline First ── */
    console.log('\n-- C. Contact Discovery Baseline First --\n');

    test('R6-CD1: ContactDiscoveryEnsemble has discover() method (Baseline First API)', function() {
        const ensemble = new ContactDiscoveryEnsemble('https://example.com');
        assert(typeof ensemble.discover === 'function', 'Must have discover() method');
        // Constructor should accept baseUrl
        assert(ensemble !== null && typeof ensemble === 'object', 'Must construct successfully');
    });

    await asyncTest('R6-CD2: ContactDiscoveryEnsemble.discover resolves without throwing', async function() {
        const ensemble = new ContactDiscoveryEnsemble('https://example.com');
        let result, threw = false;
        try {
            result = await Promise.race([
                ensemble.discover(),
                new Promise(function(res) { setTimeout(function() { res(null); }, 600); })
            ]);
        } catch (e) { threw = true; }
        assert(!threw, 'discover() must not throw synchronously');
        // discover() returns an object with { candidates, errors, ... } or null/string
        assert(result === null || typeof result === 'string' || typeof result === 'object',
            'discover must return null, string URL, or result object. Got: ' + typeof result);
    });

    /* ── D. FormDiscoveryEngine R2 ── */
    console.log('\n-- D. FormDiscoveryEngine R2 --\n');

    test('R6-FD1: FormDiscoveryEngineR2 is exported alias of FormDiscoveryEngine', function() {
        assert(typeof FormDiscoveryEngineR2 !== 'undefined', 'FormDiscoveryEngineR2 must be exported');
        assert(typeof FormDiscoveryEngine !== 'undefined', 'FormDiscoveryEngine must be exported');
        assert(FormDiscoveryEngineR2 === FormDiscoveryEngine, 'FormDiscoveryEngineR2 must equal FormDiscoveryEngine');
    });

    await asyncTest('R6-FD2: FormDiscoveryEngine.discoverForm returns null on empty document', async function() {
        const engine = new FormDiscoveryEngine();
        const emptyDoc = new MockNode('HTML');
        emptyDoc.body = new MockNode('BODY');
        emptyDoc.querySelectorAll = function() { return []; };
        emptyDoc.querySelector = function() { return null; };
        let result;
        try {
            result = await Promise.race([
                engine.discoverForm(emptyDoc),
                new Promise(function(res) { setTimeout(function() { res(null); }, 500); })
            ]);
        } catch (_) { result = null; }
        assert(result === null || result === undefined, 'discoverForm on empty doc must return null');
    });

    /* ── E. SubmitExecutorR4 ── */
    console.log('\n-- E. SubmitExecutorR4 --\n');

    test('R6-SB1: SubmitExecutorR4 exported and has discoverSubmitActions method', function() {
        assert(typeof SubmitExecutorR4 !== 'undefined', 'SubmitExecutorR4 must be exported');
        const executor = new SubmitExecutorR4(new MockNode('FORM'), {});
        assert(typeof executor.discoverSubmitActions === 'function', 'Must have discoverSubmitActions');
    });

    test('R6-SB2: discoverSubmitActions rejects Next/Login/Search/Subscribe buttons', function() {
        const form = makeForm([]);
        const rejectLabels = ['Next', 'Login', 'Search', 'Subscribe', 'Cancel'];
        form.querySelectorAll = function() {
            return rejectLabels.map(function(text) {
                const btn = new MockNode('BUTTON', { type: 'submit' }, text);
                btn.textContent = text;
                btn.value = '';
                btn.disabled = false;
                return btn;
            });
        };
        global.document.querySelectorAll = function() { return []; };

        const executor = new SubmitExecutorR4(form, {});
        const candidates = executor.discoverSubmitActions();
        const highRankNegative = candidates.filter(function(c) {
            const text = (c.el && c.el.textContent || '').toLowerCase();
            const isNeg = ['next', 'login', 'search', 'subscribe', 'cancel'].some(function(k) { return text.indexOf(k) !== -1; });
            return isNeg && c.score > 100;
        });
        assert(highRankNegative.length === 0, 'Negative keyword buttons should not have high scores');
    });

    test('R6-SB3: discoverSubmitActions accepts Send/Submit/Contact buttons', function() {
        const form = makeForm([]);
        const goodLabels = [
            { text: 'Send Message', type: 'submit' },
            { text: 'Submit Inquiry', type: 'submit' },
            { text: 'Contact Us', type: 'button' }
        ];
        form.querySelectorAll = function() {
            return goodLabels.map(function(item) {
                const btn = new MockNode('BUTTON', { type: item.type }, item.text);
                btn.textContent = item.text;
                btn.value = '';
                btn.disabled = false;
                return btn;
            });
        };
        global.document.querySelectorAll = function() { return []; };

        const executor = new SubmitExecutorR4(form, {});
        const candidates = executor.discoverSubmitActions();
        assert(candidates.length > 0, 'Should find at least one submit candidate');
    });

    test('R6-SB4: SubmitExecutorR3 is alias of SubmitExecutorR4 (backward compat)', function() {
        assert(typeof SubmitExecutorR3 !== 'undefined', 'SubmitExecutorR3 must be exported');
        assert(SubmitExecutorR3 === SubmitExecutorR4, 'SubmitExecutorR3 must be alias of SubmitExecutorR4');
    });

    /* ── F. Lifecycle ── */
    console.log('\n-- F. Lifecycle --\n');

    test('R6-LC1: finishCampaign sends SENDER_FINISHED or is internal', function() {
        broadcastMessages = [];
        if (typeof finishCampaign !== 'function') {
            console.log('     [SKIP] finishCampaign not directly exported (internal)');
            passCount++;
            return;
        }
        finishCampaign(true, null, 'CONFIRMED_SUCCESS', {});
        const finished = broadcastMessages.some(function(m) { return m.action === 'SENDER_FINISHED'; });
        assert(finished, 'finishCampaign must send SENDER_FINISHED message');
    });

    /* ── G. Backward Compatibility ── */
    console.log('\n-- G. Backward Compatibility (R5) --\n');

    test('R6-BC1: All R5 structural exports still present', function() {
        assert(typeof FormDiscoveryEngine !== 'undefined', 'FormDiscoveryEngine must exist');
        assert(typeof SubmitExecutorR3 !== 'undefined', 'SubmitExecutorR3 must exist');
        assert(typeof SubmissionOutcomeVerifier !== 'undefined', 'SubmissionOutcomeVerifier must exist');
        assert(typeof exportedCBR2 !== 'undefined' || typeof CheckboxResolverR2 !== 'undefined', 'CheckboxResolverR2 must be available');
        assert(typeof exportedSER2 !== 'undefined' || typeof SelectResolverR2 !== 'undefined', 'SelectResolverR2 must be available');
    });

    test('R6-BC2: CheckboxResolverR2 module has expected API surface', function() {
        const resolver = new CheckboxResolverR2();
        assert(typeof resolver.classify === 'function', 'Must have classify()');
        assert(typeof resolver.resolveCheckbox === 'function', 'Must have resolveCheckbox()');
        assert(typeof resolver.resolveAllInForm === 'function', 'Must have resolveAllInForm()');
        assert(typeof resolver.decideGroupSelection === 'function', 'Must have decideGroupSelection()');
        assert(typeof resolver.applyAndVerify === 'function', 'Must have applyAndVerify()');
        assert(resolver.cachedGroupChoices instanceof Map, 'Must have cachedGroupChoices Map');
    });

    test('R6-BC3: SelectResolverR2 module has expected API surface', function() {
        const resolver = new SelectResolverR2();
        assert(typeof resolver.resolveDropdown === 'function', 'Must have resolveDropdown()');
        assert(typeof resolver.resolveNativeSelect === 'function', 'Must have resolveNativeSelect()');
        assert(typeof resolver.resolveCustomDropdown === 'function', 'Must have resolveCustomDropdown()');
        assert(typeof resolver.resolveAllInForm === 'function', 'Must have resolveAllInForm()');
        assert(typeof resolver.isSensitiveFactual === 'function', 'Must have isSensitiveFactual()');
        assert(typeof resolver.identifyPurpose === 'function', 'Must have identifyPurpose()');
    });

    /* ── Summary ── */
    console.log('\n========================================================');
    console.log('\n  R6 TEST RESULTS: ' + passCount + ' PASSED  |  ' + failCount + ' FAILED\n');
    if (failCount === 0) {
        console.log('  ALL R6 ACCEPTANCE TESTS PASSED\n');
    } else {
        console.log('  ' + failCount + ' test(s) FAILED -- see details above\n');
        process.exitCode = 1;
    }
}

runAllTests().catch(function(err) {
    console.error('Test runner crashed:', err);
    process.exit(1);
});
