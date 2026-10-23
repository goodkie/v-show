/**
 * [TEST] Contact Gate Path 6 v2 Regression Suite
 * Authority: ChatGPT Directive #6359466001 [P0-URGENT-REMAND]
 * Covers: T1-T11 including T6 booking false-positive fix
 * Expectation:
 *   - T1, T7, T9, T10: ACCEPT (legitimate consultation/inquiry forms)
 *   - T2, T3, T4, T5, T6, T8, T11: REJECT (pure booking, newsletter, search, password)
 */

'use strict';
const assert = require('assert');
const { JSDOM } = require('jsdom');

// Load ContactGate from extension source
const contactGateSrc = require('fs').readFileSync(
    require('path').join(__dirname, '../extension/modules/contact-gate.js'), 'utf-8'
);

// Execute in a JSDOM window context to get ContactGate object
function makeContactGate(formHtml) {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${formHtml}</body></html>`, {
        runScripts: 'dangerously'
    });
    // Inject the module code into this DOM's window
    const win = dom.window;
    // Patch console to passthrough
    win.console = console;
    // Execute module
    const fn = new win.Function('module', 'exports', 'require', contactGateSrc);
    const mod = { exports: {} };
    fn(mod, mod.exports, () => ({}));
    const cg = mod.exports;
    const formEl = win.document.querySelector('form');
    return { cg, formEl };
}

const tests = [
    // ── T1: liveyourtoplife consultation (ACCEPT) ──────────────────────────
    {
        id: 'T1',
        label: 'liveyourtoplife consultation form (name+email+phone+program, "SEE CLASS SCHEDULE & PRICING NOW")',
        expect: 'ACCEPT',
        html: `<form action="#" id="mm-custom-form-home">
            <input type="text" name="full_name" id="form-full-name">
            <input type="text" name="email" id="form-email">
            <input type="tel" name="phone" id="form-phone">
            <select name="program"><option value="">Select</option></select>
            <input type="submit" value="SEE CLASS SCHEDULE &amp; PRICING NOW">
        </form>`
    },
    // ── T2: No name field → REJECT ─────────────────────────────────────────
    {
        id: 'T2',
        label: 'No name field (email+phone only) → NON_INQUIRY_NEWSLETTER_FORM',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <input type="submit" value="Subscribe">
        </form>`
    },
    // ── T3: Name+email only, no phone, <3 fields → REJECT ─────────────────
    {
        id: 'T3',
        label: 'Name+email only, no phone, <3 fields → REJECT',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="submit" value="Get Info">
        </form>`
    },
    // ── T4: Name+email+phone + "SUBSCRIBE" → REJECT ───────────────────────
    {
        id: 'T4',
        label: 'Name+email+phone + "SUBSCRIBE TO NEWSLETTER" → REJECT',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <input type="submit" value="SUBSCRIBE TO NEWSLETTER">
        </form>`
    },
    // ── T5: Search form → REJECT ───────────────────────────────────────────
    {
        id: 'T5',
        label: 'Search form (type=search) → REJECT',
        expect: 'REJECT',
        html: `<form action="/search">
            <input type="search" name="q">
            <input type="submit" value="Search">
        </form>`
    },
    // ── T6: BOOK NOW + date picker + name+email+phone → REJECT (booking guard) ──
    {
        id: 'T6',
        label: 'Name+email+phone + date input + "BOOK NOW" → REJECT (booking guard)',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <input type="date" name="appointment_date">
            <input type="submit" value="BOOK NOW">
        </form>`
    },
    // ── T6b: BOOK NOW + select[name=date] + name+email+phone → REJECT ─────
    {
        id: 'T6b',
        label: 'Name+email+phone + select[name=date] + "BOOK NOW" → REJECT',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <select name="date"><option value="2026-10-23">Today</option></select>
            <input type="submit" value="BOOK NOW">
        </form>`
    },
    // ── T6c: BOOK NOW (no date picker, no consultation context) → REJECT ──
    {
        id: 'T6c',
        label: '"BOOK NOW" button alone (no date, no consultation context) → REJECT',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <input type="submit" value="BOOK NOW">
        </form>`
    },
    // ── T7: name+email+company+city + "GET A FREE DEMO" (3-field no-phone) → ACCEPT ──
    {
        id: 'T7',
        label: 'Name+email+company+city + "GET A FREE DEMO" (3-field no-phone path) → ACCEPT',
        expect: 'ACCEPT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="text" name="company">
            <input type="text" name="city">
            <input type="submit" value="GET A FREE DEMO">
        </form>`
    },
    // ── T8: Password field → REJECT ────────────────────────────────────────
    {
        id: 'T8',
        label: 'Name+email+phone + password + "SIGN UP" → REJECT',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <input type="password" name="password">
            <input type="submit" value="SIGN UP">
        </form>`
    },
    // ── T9: "SCHEDULE A CONSULTATION" → ACCEPT ────────────────────────────
    {
        id: 'T9',
        label: 'Name+email+phone + "SCHEDULE A CONSULTATION" → ACCEPT',
        expect: 'ACCEPT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <input type="submit" value="SCHEDULE A CONSULTATION">
        </form>`
    },
    // ── T10: "BOOK AN APPOINTMENT" (appointment context → not pure booking) → ACCEPT ──
    {
        id: 'T10',
        label: 'Name+email+phone + "BOOK AN APPOINTMENT" → ACCEPT (appointment = consultation context)',
        expect: 'ACCEPT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <input type="submit" value="BOOK AN APPOINTMENT">
        </form>`
    },
    // ── T11: Reserve a table (hospitality booking) → REJECT ───────────────
    {
        id: 'T11',
        label: 'Name+email+phone + "RESERVE A TABLE" + date select → REJECT',
        expect: 'REJECT',
        html: `<form action="#">
            <input type="text" name="name">
            <input type="email" name="email">
            <input type="tel" name="phone">
            <select name="date"><option value="2026-10-25">Saturday</option></select>
            <input type="submit" value="RESERVE A TABLE">
        </form>`
    }
];

let passed = 0;
let failed = 0;
const results = [];

console.log('\n=== [PATH 6 BOOKING GUARD v2] REGRESSION SUITE ===\n');

for (const tc of tests) {
    try {
        const { cg, formEl } = makeContactGate(tc.html);
        if (!formEl) throw new Error('formEl not found in DOM');
        const cls = cg.classifyFormIntent(formEl);
        const actual = cls.decision;
        const ok = actual === tc.expect;
        if (ok) {
            console.log(`✅ PASS  [${tc.id}] ${tc.label}`);
            console.log(`        decision=${cls.decision} intent=${cls.intent} score=${cls.score} reason=${cls.reason}`);
            passed++;
            results.push({ id: tc.id, label: tc.label, status: 'PASS', actual, expected: tc.expect, score: cls.score, reason: cls.reason });
        } else {
            console.log(`❌ FAIL  [${tc.id}] ${tc.label}`);
            console.log(`        expected=${tc.expect} actual=${actual} intent=${cls.intent} score=${cls.score} reason=${cls.reason}`);
            failed++;
            results.push({ id: tc.id, label: tc.label, status: 'FAIL', actual, expected: tc.expect, score: cls.score, reason: cls.reason });
        }
    } catch (err) {
        console.log(`❌ ERROR [${tc.id}] ${tc.label}: ${err.message}`);
        failed++;
        results.push({ id: tc.id, label: tc.label, status: 'ERROR', error: err.message });
    }
}

console.log(`\n=== RESULTS: ${passed}/${tests.length} PASS, ${failed} FAIL ===`);

if (failed > 0) {
    console.log('\nFAILED CASES:');
    for (const r of results.filter(r => r.status !== 'PASS')) {
        console.log(`  [${r.id}] ${r.label} — expected=${r.expected} actual=${r.actual}`);
    }
    process.exit(1);
} else {
    console.log('\n✅ ALL PATH 6 BOOKING GUARD v2 TESTS PASSED\n');
}
