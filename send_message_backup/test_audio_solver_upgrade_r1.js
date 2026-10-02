/**
 * X PIDER Audio CAPTCHA Solver Upgrade R1 Test Suite
 * Validates reCAPTCHA v2 Audio Challenge Solving Engine Enhancements:
 * 1. Element & Download Link Discovery (Modern & Legacy Selectors)
 * 2. Automatic Play / Buffering Trigger
 * 3. CORS Resilient Fetch via Background Worker
 * 4. English & Korean Spoken Number Normalization
 * 5. Native Input Property Dispatch & Human-like Verify Click
 * 6. Multi-Engine STT Support (Wit.ai, Whisper, Zero-Key Mode)
 * 7. Source/Build 100% Parity
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log("=== [AUDIO SOLVER UPGRADE R1 ACCEPTANCE SUITE] ===");

let passed = 0;
let failed = 0;

function report(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

async function reportAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

// -------------------------------------------------------------
// Load modules
// -------------------------------------------------------------
const { XpiderSolverCore } = require('./solver-core.js');

// Mock DOM for XpiderSolverContent testing
class MockElement {
    constructor(tagName, attributes = {}) {
        this.tagName = tagName.toUpperCase();
        this.attributes = { ...attributes };
        this.innerText = attributes.innerText || '';
        this.value = attributes.value || '';
        this.src = attributes.src || '';
        this.href = attributes.href || '';
        this.style = {};
        this.events = [];
        this.children = [];
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    remove() {}

    getAttribute(name) {
        return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    setAttribute(name, val) {
        this.attributes[name] = val;
    }

    querySelector(selector) {
        if (selector === '#audio-source' && (this.attributes.id === 'audio-source' || this.attributes['id'] === 'audio-source')) return this;
        if (selector.includes('payload') && this.attributes.href && this.attributes.href.includes('payload')) return this;
        for (const child of this.children) {
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        for (const child of this.children) {
            if (selector.includes('button') && child.tagName === 'BUTTON') results.push(child);
            results.push(...child.querySelectorAll(selector));
        }
        return results;
    }

    dispatchEvent(evt) {
        this.events.push(evt.type || evt);
        return true;
    }

    click() {
        this.dispatchEvent({ type: 'click' });
    }

    getBoundingClientRect() {
        return { top: 100, left: 100, width: 80, height: 30 };
    }
}

class MockDocument {
    constructor() {
        this.elements = new Map();
        this.body = new MockElement('body');
    }

    setElement(selector, el) {
        this.elements.set(selector, el);
    }

    querySelector(selector) {
        if (this.elements.has(selector)) return this.elements.get(selector);
        for (const [sel, el] of this.elements.entries()) {
            if (sel.includes(selector) || selector.includes(sel)) return el;
        }
        return null;
    }

    querySelectorAll(selector) {
        const out = [];
        for (const [sel, el] of this.elements.entries()) {
            if (selector.includes('button') && el.tagName === 'BUTTON') out.push(el);
            else if (selector.includes('a') && el.tagName === 'A') out.push(el);
        }
        return out;
    }

    createElement(tag) {
        return new MockElement(tag);
    }
}

async function runTests() {
    // =========================================================
    // 1. Audio Element & Download URL Discovery
    // =========================================================
    console.log("\n--- 1. AUDIO DISCOVERY & NORMALIZATION ---");

    // Setup Mock Environment
    global.window = {
        location: { href: 'https://www.google.com/recaptcha/api2/bframe?hl=ko' },
        HTMLInputElement: { prototype: { value: '' } },
        PointerEvent: function(type, props) { this.type = type; Object.assign(this, props); },
        MouseEvent: function(type, props) { this.type = type; Object.assign(this, props); },
        KeyboardEvent: function(type, props) { this.type = type; Object.assign(this, props); },
        Event: function(type, props) { this.type = type; Object.assign(this, props); }
    };
    global.document = new MockDocument();
    global.chrome = {
        storage: {
            local: {
                get: (keys, cb) => cb ? cb({}) : Promise.resolve({}),
                set: (obj, cb) => cb ? cb() : Promise.resolve()
            }
        },
        runtime: {
            sendMessage: (msg, cb) => cb ? cb({ text: '1234' }) : Promise.resolve({ text: '1234' })
        }
    };

    const { XpiderSolverContent } = require('./solver-content.js');
    const solverContent = new XpiderSolverContent({ showHUD: false });

    report("AUDIO-DISC-1: Modern download link (.rc-audiochallenge-download-link without 't') is discovered", () => {
        global.document = new MockDocument();
        const dlLink = new MockElement('a', {
            class: 'rc-audiochallenge-download-link',
            href: 'https://www.google.com/recaptcha/api2/payload/audio.mp3?p=06AGdBq...'
        });
        global.document.setElement('.rc-audiochallenge-download-link', dlLink);

        const foundUrl = solverContent.getAudioUrl();
        assert.ok(foundUrl, 'Audio URL was not found');
        assert.ok(foundUrl.includes('payload/audio.mp3'), `Unexpected URL: ${foundUrl}`);
    });

    report("AUDIO-DISC-2: Legacy download link (.rc-audiochallenge-tdownload-link with 't') is discovered", () => {
        global.document = new MockDocument();
        const dlLink = new MockElement('a', {
            class: 'rc-audiochallenge-tdownload-link',
            href: 'https://www.google.com/recaptcha/api2/payload/audio.mp3?p=legacy...'
        });
        global.document.setElement('.rc-audiochallenge-tdownload-link', dlLink);

        const foundUrl = solverContent.getAudioUrl();
        assert.ok(foundUrl, 'Legacy Audio URL was not found');
        assert.ok(foundUrl.includes('p=legacy'), `Unexpected URL: ${foundUrl}`);
    });

    report("AUDIO-DISC-3: Audio element with id #audio-source is discovered", () => {
        global.document = new MockDocument();
        const audioSource = new MockElement('audio', {
            id: 'audio-source',
            src: 'https://www.google.com/recaptcha/api2/payload?p=source_tag'
        });
        audioSource.src = 'https://www.google.com/recaptcha/api2/payload?p=source_tag';
        global.document.setElement('#audio-source', audioSource);

        const foundUrl = solverContent.getAudioUrl();
        assert.ok(foundUrl, '#audio-source URL was not found');
        assert.ok(foundUrl.includes('source_tag'), `Unexpected URL: ${foundUrl}`);
    });

    report("AUDIO-DISC-4: Relative audio URL resolved cleanly to absolute URL against iframe origin", () => {
        global.document = new MockDocument();
        const relLink = new MockElement('a', {
            class: 'rc-audiochallenge-download-link',
            href: '/recaptcha/api2/payload/audio.mp3?p=relative'
        });
        global.document.setElement('.rc-audiochallenge-download-link', relLink);

        const foundUrl = solverContent.getAudioUrl();
        assert.strictEqual(foundUrl, 'https://www.google.com/recaptcha/api2/payload/audio.mp3?p=relative');
    });

    // =========================================================
    // 2. Normalization of Spoken Digits (English & Korean)
    // =========================================================
    report("AUDIO-NORM-1: Spoken English words normalized to numeric digits", () => {
        const input1 = "three five nine two";
        assert.strictEqual(solverContent.normalizeAudioDigits(input1), "3592");

        const input2 = "one zero four eight seven";
        assert.strictEqual(solverContent.normalizeAudioDigits(input2), "10487");
    });

    report("AUDIO-NORM-2: Spoken Korean words normalized to numeric digits", () => {
        const koInput1 = "삼 오 구 이";
        assert.strictEqual(solverContent.normalizeAudioDigits(koInput1), "3592");

        const koInput2 = "하나 둘 셋 넷";
        assert.strictEqual(solverContent.normalizeAudioDigits(koInput2), "1234");

        const koInput3 = "영 칠 팔 육";
        assert.strictEqual(solverContent.normalizeAudioDigits(koInput3), "0786");
    });

    report("AUDIO-NORM-3: Mixed numbers and tokens correctly normalized", () => {
        const mixed = "7 four 2 nine [pause]";
        assert.strictEqual(solverContent.normalizeAudioDigits(mixed), "7429");
    });

    // =========================================================
    // 3. Play Button Buffering Trigger & DOM Interaction
    // =========================================================
    console.log("\n--- 2. AUTOMATIC PLAY TRIGGER & EVENT INJECTION ---");

    await reportAsync("AUDIO-PLAY-1: Clicks '재생' (Play) button to buffer audio when source is pending", async () => {
        global.document = new MockDocument();
        let playClicked = false;
        const playBtn = new MockElement('button', {
            class: 'rc-audiochallenge-play-button',
            innerText: '재생'
        });
        playBtn.dispatchEvent = (evt) => {
            if (evt.type === 'click' || evt === 'click') playClicked = true;
            return true;
        };
        global.document.setElement('.rc-audiochallenge-play-button', playBtn);

        const input = new MockElement('input', { id: 'audio-response' });
        global.document.setElement('#audio-response', input);

        await solverContent.solveChallenge(input);
        assert.ok(playClicked, "Play button was not triggered when audioUrl was pending");
    });

    report("AUDIO-SUBMIT-1: Native input setter called and events dispatched on #audio-response", () => {
        let nativeSetVal = '';
        Object.defineProperty(global.window.HTMLInputElement.prototype, 'value', {
            set: function(val) { nativeSetVal = val; },
            get: function() { return nativeSetVal; },
            configurable: true
        });

        global.document = new MockDocument();
        const input = new MockElement('input', { id: 'audio-response' });
        const verifyBtn = new MockElement('button', {
            id: 'recaptcha-verify-button',
            innerText: '확인'
        });
        global.document.setElement('#audio-response', input);
        global.document.setElement('#recaptcha-verify-button', verifyBtn);

        solverContent.submit(input, "three five nine two");

        assert.strictEqual(nativeSetVal, "3592", "Native value setter did not receive normalized digits");
        assert.ok(input.events.includes('input'), "Input event not dispatched");
        assert.ok(input.events.includes('change'), "Change event not dispatched");
    });

    // =========================================================
    // 4. Background Audio Fetch & Multi-Tier STT Engine
    // =========================================================
    console.log("\n--- 3. MULTI-ENGINE STT & BACKGROUND AUDIO FETCH ---");

    const core = new XpiderSolverCore();

    report("AUDIO-CORE-1: _normalizeDigits handles diverse word forms", () => {
        assert.strictEqual(core._normalizeDigits("six seven eight nine"), "6789");
        assert.strictEqual(core._normalizeDigits("오 육 칠 팔"), "5678");
    });

    await reportAsync("AUDIO-FETCH-1: Background worker fetches audio from audioUrl when audioData is null", async () => {
        let fetchedUrl = null;
        global.fetch = async (url, options) => {
            fetchedUrl = url;
            return {
                ok: true,
                status: 200,
                blob: async () => ({ type: 'audio/mpeg3' })
            };
        };

        // Mock transcription implementation to verify fetch was made
        core._transcribeFreeFallback = async (blob, url) => "9876";

        const res = await core.transcribeAudio(null, "https://www.google.com/recaptcha/api2/payload/audio.mp3?p=direct_bg");
        assert.strictEqual(fetchedUrl, "https://www.google.com/recaptcha/api2/payload/audio.mp3?p=direct_bg", "Direct audioUrl was not fetched");
        assert.strictEqual(res, "9876", "Transcription result mismatch");
    });

    await reportAsync("AUDIO-STT-1: Wit.ai transcription with regex streaming parser", async () => {
        global.fetch = async (url, options) => {
            if (url.includes('api.wit.ai')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => `{"text": "three eight one"}`
                };
            }
            return { ok: false, status: 404 };
        };

        const mockBlob = { type: 'audio/wav' };
        const text = await core._transcribeWitAi(mockBlob, "dummy_test_key", "https://example.com/audio.wav");
        assert.strictEqual(text, "three eight one");
    });

    await reportAsync("AUDIO-STT-2: OpenAI Whisper API transcription support", async () => {
        global.fetch = async (url, options) => {
            if (url.includes('api.openai.com')) {
                assert.ok(options.headers.Authorization.includes('test_whisper_key'));
                return {
                    ok: true,
                    status: 200,
                    text: async () => "54321"
                };
            }
            return { ok: false, status: 404 };
        };

        const mockBlob = new Blob(['dummy audio content'], { type: 'audio/mp3' });
        const text = await core._transcribeWhisper(mockBlob, "test_whisper_key");
        assert.strictEqual(text, "54321");
    });

    // =========================================================
    // 5. Source / Build Parity
    // =========================================================
    console.log("\n--- 4. PRODUCTION BUILD PARITY ---");

    const filesToVerify = [
        'solver-core.js',
        'solver-content.js',
        'background.js'
    ];

    for (const f of filesToVerify) {
        report(`AUDIO-PARITY: ${f} matches 100% between source and build`, () => {
            const src = fs.readFileSync(path.join(__dirname, f));
            const bld = fs.readFileSync(path.join(__dirname, 'build/extension', f));

            const h1 = crypto.createHash('sha256').update(src).digest('hex');
            const h2 = crypto.createHash('sha256').update(bld).digest('hex');

            assert.strictEqual(h1, h2, `Hash mismatch for ${f}: ${h1} vs ${h2}`);
            assert.strictEqual(src.length, bld.length, `Byte length mismatch for ${f}`);
        });
    }

    console.log(`\n=== AUDIO SOLVER SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Fatal test runner error:", err);
    process.exit(1);
});
