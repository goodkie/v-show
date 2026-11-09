#!/usr/bin/env node
/**
 * Directive #6731090998 regression: submit-outcome honesty, SEMI_AUTO hold semantics,
 * no-message option propagation observability, post-submit cross-origin redirect handling.
 * Synthetic / source-level + vm-executed pure logic only. No network, no public forms.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const bg = read('extension/background.js');
const cs = read('extension/content-script.js');
const popup = read('extension/popup.js');
const REPORT = path.join(ROOT, 'dist', 'report_submit_nomessage_semiauto_regression.json');

const report = { suite: 'XPIDER_SUBMIT_NOMESSAGE_SEMIAUTO_REGRESSION', directive: '#6731090998', assertions: [], status: 'RUNNING' };
let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}

// ---- extract classifyPostSubmitNavigation from the REAL background.js ----
const m = bg.match(/function classifyPostSubmitNavigation\(input\) \{[\s\S]*?\n\}\n/);
A('B1_CLASSIFIER_PRESENT_IN_BACKGROUND_SOURCE', !!m);
const sandbox = { URL };
vm.createContext(sandbox);
vm.runInContext(m[0] + '\nthis.fn = classifyPostSubmitNavigation;', sandbox);
const cls = sandbox.fn;
const ATT = 'https://www.iskf.example.com/contact';
let r = cls({ submitInFlight: true, currentUrl: 'https://form-service.example.test/thanks?language=en', attemptUrl: ATT });
A('B2_CROSS_ORIGIN_THANKS_SUPPRESSES_REINJECTION_AND_IS_TERMINAL_THANKS',
    r.suppressInjection === true && r.crossOrigin === true && r.looksLikeThanks === true && r.outcomeStage === 'CLIENT_REDIRECT_THANKS', r);
let rReal = cls({ submitInFlight: true, currentUrl: 'https://formspree.io/thanks?language=en', attemptUrl: ATT });
A('B2B_REAL_FORMSPREE_CROSS_ORIGIN_URL_RECOGNIZED',
    rReal.suppressInjection === true && rReal.crossOrigin === true && rReal.looksLikeThanks === true && rReal.outcomeStage === 'CLIENT_REDIRECT_THANKS', rReal);
r = cls({ submitInFlight: true, currentUrl: 'https://tracker.other.example/landing', attemptUrl: ATT });
A('B3_CROSS_ORIGIN_NON_THANKS_IS_UNVERIFIED_AND_SUPPRESSED',
    r.suppressInjection === true && r.looksLikeThanks === false && r.outcomeStage === 'CLIENT_REDIRECT_UNVERIFIED', r);
r = cls({ submitInFlight: true, currentUrl: 'https://www.iskf.example.com/contact/thank-you', attemptUrl: ATT });
A('B4_SAME_ORIGIN_NOT_SUPPRESSED_EXISTING_VERIFIER_PATH_PRESERVED', r.suppressInjection === false && r.crossOrigin === false, r);
r = cls({ submitInFlight: false, currentUrl: 'https://form-service.example.test/thanks', attemptUrl: ATT });
A('B5_NO_SUBMIT_IN_FLIGHT_NEVER_SUPPRESSES_OR_PROMOTES', r.suppressInjection === false && r.outcomeStage === 'NONE', r);
r = cls({ submitInFlight: true, currentUrl: 'chrome-error://chromewebdata/', attemptUrl: ATT });
A('B6_NON_HTTP_URL_IGNORED', r.suppressInjection === false, r);

// ---- source guards on the REAL files ----
A('S1_URL_ONLY_SUCCESS_PROMOTION_REQUIRES_SUBMIT_EVIDENCE',
    /submitEvidenceForUrlPromotion/.test(bg) && /if \(!isConfirmedProof && submitEvidenceForUrlPromotion/.test(bg));
A('S2_NAVWATCHER_SUPPRESSES_REINJECTION_ON_POST_SUBMIT_CROSS_ORIGIN',
    /classifyPostSubmitNavigation\(\{[\s\S]*?\}\);\s*if \(postSubmitNav\.suppressInjection\) \{[\s\S]*?return;\s*\}/.test(bg) &&
    bg.indexOf('postSubmitNav.suppressInjection') < bg.indexOf('startInjection(1500)'));
A('S3_NO_MESSAGE_OPTION_STAGES_POPUP_BACKGROUND_CONTENT',
    /\[NO_MESSAGE_OPTION\] stage=popup_sent/.test(popup) && /\[NO_MESSAGE_OPTION\] stage=background_received/.test(bg) && /\[NO_MESSAGE_OPTION\] stage=content_received/.test(cs));
A('S4_SEMI_AUTO_HOLD_HAS_EXPLICIT_REASON_AND_NO_AUTOSUBMIT',
    /SEMI_AUTO: CAPTCHA ACTION REQUIRED reasonCode=SEMI_AUTO_CAPTCHA_ACTION_REQUIRED/.test(cs) && /autoSubmit=false/.test(cs) && /holdMode: holdModeLabel/.test(cs));
A('S5_SUBMIT_TRIGGERED_LOG_CARRIES_STAGE_AND_DENIES_DELIVERY',
    /\[SUBMIT_OUTCOME_STAGE\] stage=\$\{submitOutcome\.outcomeStage \|\| 'SUBMIT_ATTEMPT_STARTED'\}[\s\S]{0,200}deliveryConfirmed=false/.test(cs));
A('S6_REQUESTSUBMIT_NO_BUTTON_REQUIRES_VERIFIED_NATIVE_SUBMIT_EVENT_AND_VALIDITY',
    /nativeValid && nativeSubmitSeen/.test(cs) && /form\.addEventListener\('submit', onNativeSubmit, true\)/.test(cs) && !/form\.requestSubmit\(\);\s*return \{ success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'requestSubmit_no_button'/.test(cs));

// ---- jsdom execution of the exact native-submit verification snippet from content-script.js ----
const sn = cs.match(/let nativeSubmitSeen = false;[\s\S]*?finally \{\s*try \{ form\.removeEventListener\('submit', onNativeSubmit, true\); \} catch \(_\) \{\s*\}\s*\}/);
A('R0_SNIPPET_EXTRACTED_FROM_REAL_CONTENT_SCRIPT', !!sn);
function runSnippet(html, mutate) {
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
    const form = dom.window.document.querySelector('form');
    if (mutate) mutate(form, dom.window);
    // jsdom lacks navigation; stub so a real submit does not try to navigate
    dom.window.HTMLFormElement.prototype.submit = function () {};
    const ctx = { form };
    vm.createContext(ctx);
    vm.runInContext(`${sn[0]}\nthis.result = { nativeValid, nativeSubmitSeen };`, ctx);
    return ctx.result;
}
let res = runSnippet('<form action="https://form-service.example.test/f/x" method="post"><input name="email" type="email" value="op@uat-local.test"><input type="submit" style="display:none"></form>');
A('R1_VALID_EMAIL_ONLY_FORM_NATIVE_SUBMIT_EVENT_VERIFIED', res.nativeValid === true && res.nativeSubmitSeen === true, res);
res = runSnippet('<form><input name="email" type="email" required value=""></form>');
A('R2_INVALID_REQUIRED_EMPTY_FORM_NOT_REPORTED_AS_SUBMITTED', res.nativeValid === false && res.nativeSubmitSeen === false, res);
res = runSnippet('<form><input name="email" type="email" required value="op@uat-local.test"></form>');
A('R3_VALID_REQUIRED_FILLED_FORM_VERIFIED', res.nativeValid === true && res.nativeSubmitSeen === true, res);

// ---- AST-free TDZ guard re-check for newly edited files ----
for (const [n, src] of [['background.js', bg], ['content-script.js', cs], ['popup.js', popup]]) {
    let ok = true; let err = null;
    try { new vm.Script(src, { filename: n }); } catch (e) { ok = false; err = e.message; }
    A(`P_${n.replace(/\W/g, '_')}_PARSES`, ok, { err });
}

report.status = failures ? 'FAILED' : 'SUCCESS';
report.total = report.assertions.length; report.failed = failures;
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`\n${report.total - failures}/${report.total} PASS -> ${REPORT}`);
process.exit(failures ? 1 : 0);
