const assert = require('assert');
const CG = require('../extension/modules/challenge-gate');
const { SEL, ACTIONS, MODES } = CG;

console.log('=== TEST: challenge-gate (dual-mode decision logic) ===');
const mk = (map) => ({ querySelector: (s) => map[s] || null });
let n = 0; const ok = (m) => console.log(`  PASS ${++n}: ${m}`);

// 1. no challenge -> AUTO submits once; detection never claims solved
{
  const c = CG.detectChallenge(mk({}));
  assert.strictEqual(c.present, false);
  assert.strictEqual(c.claimsSolved, false);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: c }), ACTIONS.SUBMIT_ONCE);
  ok('no challenge => AUTO SUBMIT_ONCE');
}
// 2. unresolved recaptcha (widget, empty token) -> AUTO pauses, never submits
{
  const c = CG.detectChallenge(mk({ [SEL.recaptchaWidget]: {}, [SEL.recaptchaToken]: { value: '' } }));
  assert.ok(c.present && c.needsHuman && !c.verified);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: c }), ACTIONS.PAUSE_EXTERNAL_USER);
  ok('unresolved reCAPTCHA => CAPTCHA_PENDING_EXTERNAL_USER (tab kept, no submit)');
}
// 3. page-produced token appears -> verified -> single submit
{
  const c = CG.detectChallenge(mk({ [SEL.hcaptchaWidget]: {}, [SEL.hcaptchaToken]: { value: 'abc' } }));
  assert.ok(c.verified);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: c }), ACTIONS.SUBMIT_ONCE);
  ok('verified hCaptcha => SUBMIT_ONCE');
}
// 4. invisible reCAPTCHA is non-interactive pre-submit, but NEVER claims verified/serverVerified
{
  const c = CG.detectChallenge(mk({ [SEL.recaptchaWidget]: {}, [SEL.recaptchaToken]: { value: '' }, [SEL.invisibleRecaptcha]: {} }));
  assert.strictEqual(c.needsHuman, false);
  assert.strictEqual(c.invisibleDetected, true);
  assert.strictEqual(c.verified, false);
  assert.strictEqual(c.serverVerified, false);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: c }), ACTIONS.SUBMIT_ONCE);
  ok('invisible reCAPTCHA => non-interactive pre-submit, never claims verified/serverVerified');
}
// 5. text/image captcha is unverifiable: pause until operator attests; attestation with empty input still pauses
{
  const empty = CG.detectChallenge(mk({ [SEL.textCaptchaInput]: { value: '' } }));
  assert.ok(empty.unverifiable && !empty.verified);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: empty }), ACTIONS.PAUSE_EXTERNAL_USER);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: empty, attested: true }), ACTIONS.SUBMIT_ONCE);
  ok('text captcha: pauses; operator attestation allows exactly one submit');
}
// 6. MANUAL always holds, even with no challenge or verified challenge
{
  const none = CG.detectChallenge(mk({}));
  const ver = CG.detectChallenge(mk({ [SEL.turnstileWidget]: {}, [SEL.turnstileToken]: { value: 'x' } }));
  assert.strictEqual(CG.decideAction({ mode: MODES.MANUAL, challenge: none }), ACTIONS.MANUAL_HOLD);
  assert.strictEqual(CG.decideAction({ mode: MODES.MANUAL, challenge: ver }), ACTIONS.MANUAL_HOLD);
  ok('MANUAL => MANUAL_HOLD regardless of challenge state (engine never submits)');
}
// 7. duplicate + incomplete-form guards take precedence
{
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: { present: false }, alreadySubmitted: true }), ACTIONS.BLOCK_DUPLICATE);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: { present: false }, fieldsComplete: false }), ACTIONS.PAUSE_FIELDS_INCOMPLETE);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: { present: false }, formValid: false }), ACTIONS.PAUSE_FIELDS_INCOMPLETE);
  ok('already-submitted => BLOCK_DUPLICATE; incomplete/invalid form => PAUSE_FIELDS_INCOMPLETE');
}
// 8. manual resume: no evidence or generic navigation => DELIVERY_UNKNOWN, never SUCCESS
{
  assert.strictEqual(CG.classifyManualResume({}).outcome, 'DELIVERY_UNKNOWN');
  assert.strictEqual(CG.classifyManualResume({ urlChanged: true }).outcome, 'DELIVERY_UNKNOWN');
  // Audit Item (3): generic page navigation (formRemoved + urlChanged to non-confirmation URL) MUST NOT be SUCCESS
  const genericNav = CG.classifyManualResume({ formRemoved: true, urlChanged: true, currentUrl: 'https://example.com/about' });
  assert.strictEqual(genericNav.outcome, 'DELIVERY_UNKNOWN');
  assert.strictEqual(genericNav.reasonCode, 'MANUAL_GENERIC_NAVIGATION_NO_CONFIRMATION');
  // Positive confirmation URL or confirmation text => SUCCESS
  assert.strictEqual(CG.classifyManualResume({ successText: true }).outcome, 'SUCCESS');
  assert.strictEqual(CG.classifyManualResume({ formRemoved: true, urlChanged: true, currentUrl: 'https://example.com/thank-you' }).outcome, 'SUCCESS');
  assert.ok(CG.hasSuccessText('Thank you! Your message has been sent') && !CG.hasSuccessText('Please fill the form'));
  ok('manual resume: SUCCESS only with positive confirmation text/URL; generic navigation => DELIVERY_UNKNOWN');
}
// 9. mixed: one verified + one unresolved => still pending
{
  const c = CG.detectChallenge(mk({ [SEL.recaptchaWidget]: {}, [SEL.recaptchaToken]: { value: 't' }, [SEL.hcaptchaWidget]: {}, [SEL.hcaptchaToken]: { value: '' } }));
  assert.ok(!c.verified);
  assert.strictEqual(CG.decideAction({ mode: MODES.AUTO, challenge: c }), ACTIONS.PAUSE_EXTERNAL_USER);
  ok('partially verified challenges => still pending');
}
console.log(`ALL ${n} challenge-gate tests passed`);

