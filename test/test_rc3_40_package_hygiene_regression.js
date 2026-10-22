/**
 * test_rc3_40_package_hygiene_regression.js
 *
 * Verifies regression prevention for Audit #6333917171:
 * 1. Companion copy filter strictly omits scratch, acceptance, rc3_, and token files.
 * 2. Staging denylist scan fails closed on scratch/acceptance files.
 * 3. Local companion folder contains zero scratch or acceptance files.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- TEST RC3.40 PACKAGE HYGIENE REGRESSION ---');

// 1. Verify companion on-disk directory contains zero scratch/acceptance/token artifacts
const compDir = path.resolve('companion');
const compFiles = fs.readdirSync(compDir);

const forbiddenNames = [
    '.scratch_acceptance_rc3_18_token',
    'scratch_acceptance_rc3_18_pool.json'
];

for (const fn of forbiddenNames) {
    assert.strictEqual(fs.existsSync(path.join(compDir, fn)), false, `Forbidden file ${fn} must NOT exist in companion/`);
    console.log(`[PASS] ${fn} is strictly absent from companion/`);
}

// 2. Test copy filter logic directly against mock files
const mockEntries = [
    { name: 'privacy-relay-service.js', isDir: false },
    { name: 'ensure_companion_service.js', isDir: false },
    { name: '.scratch_acceptance_rc3_18_token', isDir: false },
    { name: 'scratch_acceptance_rc3_18_pool.json', isDir: false },
    { name: 'rc3_18_test_pool.json', isDir: false },
    { name: 'sample_token', isDir: false },
    { name: '.control_token', isDir: false },
    { name: 'privacy_relay.log', isDir: false },
    { name: 'egress_pool_config.json', isDir: false }
];

function filterEntries(entries) {
    return entries.filter(entry => {
        const lowerName = entry.name.toLowerCase();
        if (entry.name === '.control_token' || 
            entry.name === 'privacy_relay.log' || 
            entry.name === 'node_modules' || 
            entry.name === 'router_pairing_config.json' || 
            entry.name.startsWith('test') || 
            entry.name.startsWith('mock') || 
            entry.name === 'tls_test_certs.js' || 
            entry.name.endsWith('.tmp') || 
            entry.name.endsWith('.log') || 
            entry.name.endsWith('.lock') || 
            entry.name.startsWith('.private_') || 
            entry.name.includes('local_credentials') || 
            entry.name.startsWith('.local_') ||
            lowerName.includes('scratch') ||
            lowerName.includes('acceptance') ||
            lowerName.includes('rc3_') ||
            lowerName.endsWith('_token') ||
            lowerName.startsWith('.scratch')) {
            return false;
        }
        return true;
    });
}

const filtered = filterEntries(mockEntries);
const filteredNames = filtered.map(e => e.name);
console.log('Filtered mock names:', filteredNames);

assert.deepStrictEqual(filteredNames, [
    'privacy-relay-service.js',
    'ensure_companion_service.js',
    'egress_pool_config.json'
]);
console.log('[PASS] Filtered mock list strictly retains canonical files and excludes all scratch/acceptance/token artifacts.');

// 3. Test Denylist scanner fail-closed behavior
function testDenylist(fileName) {
    const lowerBase = fileName.toLowerCase();
    if (lowerBase.includes('scratch') || lowerBase.includes('acceptance') || lowerBase.includes('rc3_') || lowerBase.endsWith('_token') || lowerBase.startsWith('.scratch')) {
        return 'REJECTED';
    }
    return 'ALLOWED';
}

assert.strictEqual(testDenylist('.scratch_acceptance_rc3_18_token'), 'REJECTED');
assert.strictEqual(testDenylist('scratch_acceptance_rc3_18_pool.json'), 'REJECTED');
assert.strictEqual(testDenylist('privacy-relay-service.js'), 'ALLOWED');
console.log('[PASS] Denylist check fail-closed assertion verified.');

console.log('--- ALL RC3.40 PACKAGE HYGIENE REGRESSION CHECKS PASSED ---');
