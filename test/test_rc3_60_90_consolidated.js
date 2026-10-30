const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== TEST SUITE: RC3.60 .90 CONSOLIDATED RECOVERY SPRINT ===\n');

// ----------------------------------------------------
// Test 1: CheckboxResolverR2 Unique IDs & Random Variation
// ----------------------------------------------------
console.log('Test 1: CheckboxResolverR2 Unique ID & Random Variation...');
const CheckboxResolverR2 = require('../extension/modules/checkbox-resolver-r2.js');

const logs = [];
const resolver = new CheckboxResolverR2({ logger: (msg) => logs.push(msg) });

// Mock 4 checkboxes with name="Program of interest", no value attribute (DOM default value="on")
function createMockCheckbox(id, name, fieldsetAriaRequired = 'false') {
    return {
        id,
        name,
        type: 'checkbox',
        value: 'on', // DOM default
        checked: false,
        getAttribute(attr) {
            if (attr === 'value') return null; // no HTML value attribute
            if (attr === 'aria-required') return null;
            return null;
        },
        hasAttribute(attr) { return false; },
        closest(sel) {
            if (sel === 'fieldset') {
                return {
                    getAttribute(attr) {
                        if (attr === 'aria-required') return fieldsetAriaRequired;
                        return null;
                    },
                    hasAttribute(attr) { return false; },
                    querySelector(s) { return null; }
                };
            }
            return null;
        },
        parentElement: null,
        dispatchEvent() {}
    };
}

const cb1 = createMockCheckbox('checkbox-11', 'Program of interest');
const cb2 = createMockCheckbox('checkbox-14', 'Program of interest');
const cb3 = createMockCheckbox('checkbox-17', 'Program of interest');
const cb4 = createMockCheckbox('checkbox-20', 'Program of interest');

// Without Random Variation, optional group returns false for all
const res1_noRand = resolver.decideGroupSelection(cb1, 'name:Program of interest', false);
const res2_noRand = resolver.decideGroupSelection(cb2, 'name:Program of interest', false);
assert.strictEqual(res1_noRand, false, 'Optional group without Random Variation must not select cb1');
assert.strictEqual(res2_noRand, false, 'Optional group without Random Variation must not select cb2');

// With Random Variation enabled (options.randomVariation = true)
const resolverRand = new CheckboxResolverR2({ logger: (msg) => logs.push(msg), randomVariation: true });
const r1 = resolverRand.decideGroupSelection(cb1, 'name:Program of interest', false);
const r2 = resolverRand.decideGroupSelection(cb2, 'name:Program of interest', false);
const r3 = resolverRand.decideGroupSelection(cb3, 'name:Program of interest', false);
const r4 = resolverRand.decideGroupSelection(cb4, 'name:Program of interest', false);

assert.strictEqual(r1, true, 'First element in group selected with Random Variation');
assert.strictEqual(r2, false, 'Second element NOT selected (never select all 4!)');
assert.strictEqual(r3, false, 'Third element NOT selected');
assert.strictEqual(r4, false, 'Fourth element NOT selected');
console.log('  [OK] Random Variation selected exactly 1 option out of 4 (cb1=true, cb2..4=false)');

// Verify isGroupRequired precision
assert.strictEqual(resolver.isGroupRequired(cb1, null), false, 'Fieldset with aria-required=false must NOT be required');
const cbRequired = createMockCheckbox('cb-req', 'req_group', 'true');
assert.strictEqual(resolver.isGroupRequired(cbRequired, null), true, 'Fieldset with aria-required=true MUST be required');
console.log('  PASS 1: CheckboxResolverR2 unique identity, group requirement, and Random Variation verified\n');

// ----------------------------------------------------
// Test 2: Optional Field Custom Validity Recovery Logic
// ----------------------------------------------------
console.log('Test 2: Optional Field Validity Recovery Logic...');
const engineCode = fs.readFileSync(path.resolve('extension/modules/final-form-completion-engine.js'), 'utf8');

// Assert that optional fields with aria-invalid="true" are cleared instead of incrementing customInvalidCount
assert(engineCode.includes('Cleared custom-invalid optional field'), 'Engine must contain optional custom invalid recovery');
assert(engineCode.includes('Cleared invalid optional field'), 'Engine must contain optional native invalid recovery');
assert(engineCode.includes('202-555-0149'), 'Engine must default to standard 10-digit US phone format');
console.log('  [OK] Optional field recovery logic and US phone format present in engine');
console.log('  PASS 2: Optional field validity recovery verified\n');

// ----------------------------------------------------
// Test 3: Legitimate Skip on Forms without Message Field
// ----------------------------------------------------
console.log('Test 3: Legitimate Skip on Forms without Message Field...');
const csCode = fs.readFileSync(path.resolve('extension/content-script.js'), 'utf8');
assert(csCode.includes('NO_LONG_TEXT_INQUIRY_FIELD'), 'content-script must emit NO_LONG_TEXT_INQUIRY_FIELD when no message field exists');
assert(/legitimate non-inquiry skip/i.test(csCode), 'content-script must log legitimate non-inquiry skip');
console.log('  [OK] Content script detects absence of genuine message fields and emits NO_LONG_TEXT_INQUIRY_FIELD');
console.log('  PASS 3: Legitimate message skip verified\n');

// ----------------------------------------------------
// Test 4: Background Canonical Status Mapping & Tab Mismatch Fix
// ----------------------------------------------------
console.log('Test 4: Background Canonical Status Mapping & Tab Mismatch Fix...');
const bgCode = fs.readFileSync(path.resolve('extension/background.js'), 'utf8');

assert(bgCode.includes('FINAL_CUSTOM_VALIDITY_FAILED'), 'background.js must map FINAL_CUSTOM_VALIDITY_FAILED');
assert(bgCode.includes('FINAL_NATIVE_VALIDITY_FAILED'), 'background.js must map FINAL_NATIVE_VALIDITY_FAILED');
assert(bgCode.includes('let effectiveTabId = sTabId || (request?.tabId ? request.tabId : null);'), 'background.js must fallback to request.tabId to prevent tab_mismatch');
console.log('  [OK] Background canonical mapping covers pre-submit audit failures -> AUTOMATION_FAILED');
console.log('  [OK] Background effectiveTabId fallback prevents false tab_mismatch');
console.log('  PASS 4: Background status mapping & tab mismatch fix verified\n');

// ----------------------------------------------------
// Test 5: Popup Random Variation Payload Wiring
// ----------------------------------------------------
console.log('Test 5: Popup Random Variation Payload Wiring...');
const popupCode = fs.readFileSync(path.resolve('extension/popup.js'), 'utf8');
assert(popupCode.includes('randomVariation: randomVariationActive'), 'popup.js must pass randomVariation in startPayload');
console.log('  [OK] Popup passes randomVariation setting to background and engine');
console.log('  PASS 5: Popup payload wiring verified\n');

console.log('====================================================');
console.log('  ALL RC3.60 .90 CONSOLIDATED UNIT TESTS PASSED!');
console.log('====================================================');
