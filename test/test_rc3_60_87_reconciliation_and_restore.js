const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('  TEST SUITE: RC3.60 .87 TERMINAL RELEASE & RESTORE REGRESSION');
console.log('========================================================================');

// 1. Verify popup.js contracts
console.log('\n>>> [TEST 1] Contract assertions across extension/popup.js...');
const popupJs = fs.readFileSync(path.resolve('extension/popup.js'), 'utf8');

// Check restoreStartButton exists at outer level
assert(popupJs.includes('function restoreStartButton()'), 'restoreStartButton must be defined');
assert(popupJs.includes('var _restoreStartButton = restoreStartButton;'), '_restoreStartButton alias must exist');

// Check CAMPAIGN_FINISHED calls restoreStartButton()
assert(popupJs.includes('CAMPAIGN_FINISHED'), 'CAMPAIGN_FINISHED must be handled');
assert(/action === 'CAMPAIGN_FINISHED'[\s\S]*?restoreStartButton\(\)/.test(popupJs), 'CAMPAIGN_FINISHED must call restoreStartButton()');

// Check onCampaignFinishedOwnerTestCheck calls restoreStartButton()
assert(/function onCampaignFinishedOwnerTestCheck[\s\S]*?restoreStartButton\(\)/.test(popupJs), 'onCampaignFinishedOwnerTestCheck must call restoreStartButton()');

// Check CAPTCHA Lab completion sets updateAutoSetupUI('COMPLETED')
assert(popupJs.includes("updateAutoSetupUI('COMPLETED')"), "updateAutoSetupUI('COMPLETED') must be called on test completion");

// Check checkAndRefreshPrivacyReadinessHUD handles finished status
assert(popupJs.includes('CAMPAIGN: FINISHED'), 'checkAndRefreshPrivacyReadinessHUD must report CAMPAIGN: FINISHED when completed');

// Check restoreUserSettings restores template, delays, public URLs without fixtures
assert(popupJs.includes('tpl.firstName'), 'restoreUserSettings must restore template firstName');
assert(popupJs.includes('tpl.message'), 'restoreUserSettings must restore template message');
assert(popupJs.includes('xpider_owner_original_profile'), 'restoreUserSettings must support persistent xpider_owner_original_profile');
assert(popupJs.includes('filter(u => !isLoopback(u))'), 'restoreUserSettings must filter out loopback fixtures from restored public list');

console.log('  ✅ PASS: All popup.js contract assertions verified.');

// 2. Verify companion measured DNS and IPv6 protection
console.log('\n>>> [TEST 2] Companion measured DNS & IPv6 protection...');
const relayServiceJs = fs.readFileSync(path.resolve('companion/privacy-relay-service.js'), 'utf8');

assert(relayServiceJs.includes('measureDnsAndIpv6Protection'), 'privacy-relay-service.js must implement measureDnsAndIpv6Protection');
assert(relayServiceJs.includes('dnsProtection: this.lastMeasuredDnsProtection'), 'getStatus() must return measured dnsProtection');
assert(relayServiceJs.includes('ipv6Protection: this.lastMeasuredIpv6Protection'), 'getStatus() must return measured ipv6Protection');
assert(relayServiceJs.includes('decodoQuotaStatus:'), 'getStatus() must return decodoQuotaStatus');

console.log('  ✅ PASS: Companion measured DNS/IPv6 and Decodo quota tracking verified.');

// 3. Verify privacy-gateway.js preflight integration
console.log('\n>>> [TEST 3] PrivacyGateway preflight integration...');
const privGateJs = fs.readFileSync(path.resolve('extension/modules/privacy-gateway.js'), 'utf8');

assert(privGateJs.includes('companionDns'), 'privacy-gateway.js must extract companionDns');
assert(privGateJs.includes('companionIpv6'), 'privacy-gateway.js must extract companionIpv6');

console.log('  ✅ PASS: PrivacyGateway preflight integration verified.');

// 4. Live execution of companion verifyDnsAndIpv6Protection
console.log('\n>>> [TEST 4] Live execution of verifyDnsAndIpv6Protection...');
const residentialAdapter = require('../companion/residential-proxy-adapter');

(async () => {
    const netProt = await residentialAdapter.verifyDnsAndIpv6Protection(1500);
    console.log('  Measured DNS Protection:', netProt.dnsProtection);
    console.log('  Measured IPv6 Protection:', netProt.ipv6Protection);
    assert.strictEqual(netProt.dnsProtection, 'VERIFIED_REMOTE_PROXY_CONNECT');
    assert(
        netProt.ipv6Protection === 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED' ||
        netProt.ipv6Protection === 'IPV6_ROUTE_ACTIVE_BLOCKED_AT_PROXY',
        'IPv6 protection must be verified'
    );
    console.log('  ✅ PASS: Live measured DNS & IPv6 protection verified.');

    console.log('\n========================================================================');
    console.log('  🏆 ALL TESTS PASSED: RC3.60 .87 CONTRACTS AND CHECKS 100% VERIFIED');
    console.log('========================================================================');
})();

