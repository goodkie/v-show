#!/usr/bin/env node
'use strict';
/**
 * scripts/quick_update_firewall_ip.js
 *
 * XPIDER AutoForm Sender Pro — Owner Approval-Gated Dynamic VPN Firewall Update
 * Protocol: OCA-DEV-1.4 (Issue #6 RC3.59 - P0 Security Hold Directive #6397334700)
 *
 * Security Policies:
 *  1. Zero CLI Bypass: --yes / --confirm flags are strictly removed. Interactive TTY confirmation is mandatory.
 *  2. Zero Process-Table Leakage: --token CLI argument is strictly removed. Token must come from DPAPI or env.
 *  3. Network & Routing Verification: On Windows, verifies active default route is on Proton VPN (10.2.0.x).
 *  4. Pre-Write Concurrency Guard: Enforces snapshot matching between preview and live state before PUT.
 *
 * Usage:
 *   node scripts/quick_update_firewall_ip.js [--dry-run]
 */

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const {
  FirewallGuardian,
  redactSecrets,
  DEFAULT_FIREWALL_ID,
  DEFAULT_DROPLET_ID
} = require('../companion/firewall-guardian');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  // Security policy enforcement: reject command-line bypass attempts
  if (args.includes('--yes') || args.includes('--confirm')) {
    console.warn('⚠️ [SECURITY POLICY NOTICE] Command-line confirmation bypass (--yes/--confirm) is strictly prohibited under P0 security rules.');
    console.warn('   Interactive human verification on a valid TTY is non-bypassable.\n');
  }

  // Security policy enforcement: reject PAT passed via CLI arguments to prevent process-table exposure
  if (args.includes('--token')) {
    console.warn('⚠️ [SECURITY POLICY NOTICE] Passing API tokens via command-line arguments (--token) is strictly prohibited.');
    console.warn('   Arguments are visible in OS process tables (tasklist / ps). Token will NOT be read from command line.\n');
  }

  console.log('========================================================================');
  console.log('  XPIDER PRIVATE EGRESS — OWNER FIREWALL ALLOWLIST UPDATE (RC3.59)');
  console.log('========================================================================\n');

  const companionDir = path.resolve(__dirname, '..', 'companion');
  const guardian = new FirewallGuardian({ dir: companionDir });

  // Resolve API Token securely: ONLY from DPAPI storage or secure environment variable
  let token = process.env.XPIDER_DO_TOKEN || process.env.DO_TOKEN;
  if (!token && guardian.hasToken()) {
    token = guardian._token();
  }

  if (!token) {
    if (isDryRun || !process.stdin.isTTY) {
      console.error('❌ [FAIL-CLOSED] No DigitalOcean API token found in DPAPI storage or environment variable (XPIDER_DO_TOKEN).');
      console.error('   Non-interactive or dry-run execution requires pre-configured DPAPI token.');
      process.exit(1);
    }
    console.log('No stored DPAPI token found. Please provide a DigitalOcean Personal Access Token.');
    console.log('Scopes required: firewall:read, firewall:update\n');
    const inputToken = await askQuestion('Enter DigitalOcean PAT: ');
    token = (inputToken || '').trim();
    if (!token) {
      console.error('[ABORTED] No token entered. Exiting.');
      process.exit(1);
    }
    const saveChoice = await askQuestion('Store encrypted via Windows DPAPI for future single-click use? [Y/N]: ');
    if (/^y/i.test(saveChoice.trim())) {
      const saveRes = await guardian.setToken(token);
      if (saveRes.ok) console.log('✅ Token successfully stored with Windows DPAPI encryption.');
      else console.warn(`⚠️ Warning: Could not store token (${saveRes.error}); continuing in memory.`);
    }
    console.log('');
  }

  try {
    // 1. Detect Network & Generate Preview
    console.log('[1/4] Detecting public exit IPv4 and verifying network routing...');
    const previewRes = await guardian.preview({ token });
    const { network, firewall, diff, snapshot } = previewRes;

    console.log(`    - Public Exit IPv4:     ${network.ip}`);
    console.log(`    - Adapter:              ${network.adapter}`);
    console.log(`    - Active Default Route: ${network.defaultRoute ? network.defaultRoute.interfaceIp : 'N/A'} (Metric ${network.defaultRoute ? network.defaultRoute.metric : 'N/A'})`);
    console.log(`    - Proton VPN Route:     ${network.isProtonDefaultRoute ? 'VERIFIED (10.2.0.x default route)' : 'NOT DETECTED / UNCERTAIN'}`);

    // Enforce network routing validation on Windows
    if (process.platform === 'win32' && !network.isProtonDefaultRoute) {
      console.error('\n❌ [FAIL-CLOSED] NETWORK_ROUTE_UNCERTAIN: Active default route does not use Proton VPN (10.2.0.x).');
      console.error('   Active default route interface: ' + (network.defaultRoute ? network.defaultRoute.interfaceIp : 'unknown'));
      console.error('   Firewall allowlist updates are strictly prohibited unless traffic is routed through Proton VPN.');
      process.exit(1);
    }

    console.log('\n[2/4] Validating Cloud Infrastructure Association...');
    console.log(`    - Target Droplet ID:     ${DEFAULT_DROPLET_ID} (143.198.40.33)`);
    console.log(`    - Target Firewall ID:    ${firewall.id} (${firewall.name})`);
    console.log(`    - Associated Tags:       ${firewall.tags.join(', ') || 'none'}`);
    console.log(`    - Live Firewall SHA256:  ${snapshot.slice(0, 16)}...`);

    console.log('\n[3/4] Cloud Firewall Rule Diff (TCP Port 8443):');
    console.log(`    - Current Allowlist:      ${JSON.stringify(diff.currentAddresses)}`);
    console.log(`    - Proposed Allowlist:     ${JSON.stringify(diff.proposedAddresses)}`);
    if (diff.added.length > 0) {
      console.log(`    + Adding New /32:         ${JSON.stringify(diff.added)}`);
    }
    if (diff.removed.length > 0) {
      console.log(`    - Removing /32:           ${JSON.stringify(diff.removed)}`);
    }
    console.log(`    * Preserved Static:       ${JSON.stringify(diff.preserved)}`);
    console.log(`    * Mode:                   Strictly Additive-Only (Unrelated ports & rules preserved)`);

    if (diff.noop) {
      console.log('\n========================================================================');
      console.log('✅ [STATUS: ALREADY IN SYNC] Target IP is already authorized.');
      console.log('   No changes required on DigitalOcean Cloud Firewall.');
      console.log('========================================================================\n');
      process.exit(0);
    }

    if (isDryRun) {
      console.log('\n========================================================================');
      console.log('🔍 [PREVIEW / DRY-RUN COMPLETE] Exact diff shown above. 0 changes made.');
      console.log('========================================================================\n');
      process.exit(0);
    }

    // 2. Explicit Owner Approval Gate (Strict TTY & uppercase YES required)
    console.log('\n------------------------------------------------------------------------');
    if (!process.stdin.isTTY) {
      console.error('❌ [FAIL-CLOSED] Interactive TTY required for Owner confirmation. Aborting with 0 changes.');
      process.exit(1);
    }

    const answer = await askQuestion("Type 'YES' (exact uppercase) to authorize this firewall update on DigitalOcean: ");
    const confirmed = answer.trim() === 'YES';

    if (!confirmed) {
      console.log('\n========================================================================');
      console.log('⚠️ [ABORTED] Owner confirmation denied. 0 changes made to Cloud Firewall.');
      console.log('========================================================================\n');
      process.exit(0);
    }

    // 3. Mutate with Pre-Write Concurrency Guard and Verify
    console.log('\n[4/4] Submitting scoped firewall update and verifying persisted state...');
    const applyRes = await guardian.applyUpdate({
      token,
      confirmed: true,
      expectedSnapshot: diff.snapshot,
      networkInfo: network
    });

    console.log('\n========================================================================');
    console.log('✅ [PASS] DigitalOcean Cloud Firewall successfully updated and verified.');
    console.log(`   Status:                  ${applyRes.status}`);
    console.log(`   Persisted /32 Rules:     ${JSON.stringify(applyRes.persistedAddresses)}`);
    console.log(`   Persisted Snapshot:      ${applyRes.snapshot ? applyRes.snapshot.slice(0, 16) + '...' : 'OK'}`);
    console.log('   Self-healing reconnect will automatically restore connection within 30s.');
    console.log('========================================================================\n');
    process.exit(0);
  } catch (err) {
    const scrubbed = redactSecrets(err.message || String(err));
    console.error(`\n❌ [ERROR] ${scrubbed}`);
    if (err.code) console.error(`   Error Code: ${err.code}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
