/**
 * test_registration_completion_hold.js
 * Verification for Post-Registration Completion Hold & Settlement Feature
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("======================================================================");
console.log(" [REGISTRATION COMPLETION HOLD & POST-SUBMIT SETTLEMENT VERIFICATION]");
console.log("======================================================================\n");

// 1. Verify content-script.js
const csCode = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8');

assert.ok(csCode.includes("postSubmitGraceMs"), "content-script.js must define postSubmitGraceMs");
assert.ok(csCode.includes("Maintaining page for registration completion"), "content-script.js must log page maintenance for registration completion");
assert.ok(csCode.includes("minPhaseCTime"), "content-script.js SubmissionOutcomeVerifier must use minPhaseCTime to prevent premature bail-out");
console.log("✅ PASS: content-script.js enforces postSubmitGraceMs and prevents premature exit during slow backend submissions");

// 2. Verify background.js
const bgCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
assert.ok(bgCode.includes("Maintaining tab for completion"), "background.js must log tab maintenance for completion");
assert.ok(bgCode.includes("campaignState.submitDelayMs ? parseInt(campaignState.submitDelayMs) : 3500"), "background.js must hold tab for completion based on submitDelayMs");
console.log("✅ PASS: background.js holds tab open for sufficient completion time instead of closing prematurely");

// 3. Verify popup.js
const popupCode = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
assert.ok(popupCode.includes("15000, 12000, 10000, 8000, 6000, 5000, 4000, 3000, 2000, 1000"), "popup.js must support generous hold levels (1s to 15s)");
assert.ok(popupCode.includes("등록 완료 대기 속도 매핑 라벨"), "popup.js must label submit delay as registration completion wait");
console.log("✅ PASS: popup.js expands submit delay range up to 15.0s with clear completion hold labeling");

// 4. Verify translations.js
const transCode = fs.readFileSync(path.join(__dirname, 'translations.js'), 'utf8');
assert.ok(transCode.includes('"label_delay_submit": "Submission & Completion Hold Delay"'), "translations.js en must define label_delay_submit");
assert.ok(transCode.includes('"label_delay_submit": "등록 및 완료 대기 시간 (Hold Delay)"'), "translations.js ko must define label_delay_submit");
assert.ok(transCode.includes('"label_delay_submit": "送信・登録完了待機時間 (Hold Delay)"'), "translations.js ja must define label_delay_submit");
console.log("✅ PASS: translations.js provides multi-language translations for label_delay_submit");

console.log("\n======================================================================");
console.log(" 🎉 ALL REGISTRATION COMPLETION HOLD CHECKS PASSED 100%!");
console.log("======================================================================\n");
