#!/usr/bin/env node
'use strict';
/**
 * scripts/quick_update_firewall_ip.js
 *
 * XPIDER AutoForm Sender Pro — Owner Approval-Gated Dynamic VPN Firewall Update
 * Protocol: OCA-DEV-1.4 (Issue #6 RC3.58 - Directive #6396720543)
 *
 * Usage:
 *   node scripts/quick_update_firewall_ip.js [--dry-run] [--yes] [--token <pat>]
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
  const isConfirmedArg = args.includes('--yes') || args.includes('--confirm');

  let tokenArg = null;
  const tokenIdx = args.indexOf('--token');
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    tokenArg = args[tokenIdx + 1];
  }

  console.log('========================================================================');
  console.log('  XPIDER PRIVATE EGRESS — OWNER FIREWALL ALLOWLIST UPDATE');
  console.log('========================================================================\n');

  const companionDir = path.resolve(__dirname, '..', 'companion');
  const guardian = new FirewallGuardian({ dir: companionDir });

  // Resolve API Token
  let token = tokenArg || process.env.XPIDER_DO_TOKEN || process.env.DO_TOKEN;
  if (!token && guardian.hasToken()) {
    token = guardian._token();
  }

  if (!token) {
    if (isDryRun || !process.stdin.isTTY) {
      console.error('[FAIL] No DigitalOcean API token found in DPAPI storage or environment.');
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
    console.log('[1/3] Detecting public exit IPv4 and network interface...');
    const previewRes = await guardian.preview({ token });
    const { network, firewall, diff } = previewRes;

    console.log(`    - Public Exit IPv4:  ${network.ip}`);
    console.log(`    - Interface / Route: ${network.adapter} (${network.isProton ? 'Proton VPN Active: YES' : 'Physical Network / Non-Proton'})`);
    if (!network.isProton) {
      console.log('    ⚠️ [NOTICE] Active network is not identified as Proton VPN (ProTUN).');
    }

    console.log('\n[2/3] Validating Cloud Infrastructure Association...');
    console.log(`    - Target Droplet ID:  ${DEFAULT_DROPLET_ID} (143.198.40.33)`);
    console.log(`    - Target Firewall ID: ${firewall.id} (${firewall.name})`);
    console.log(`    - Associated Tags:    ${firewall.tags.join(', ') || 'none'}`);

    console.log('\n[3/3] Cloud Firewall Rule Diff (TCP Port 8443):');
    console.log(`    - Current Allowlist:   ${JSON.stringify(diff.currentAddresses)}`);
    console.log(`    - Proposed Allowlist:  ${JSON.stringify(diff.proposedAddresses)}`);
    if (diff.added.length > 0) {
      console.log(`    + Adding New /32:      ${JSON.stringify(diff.added)}`);
    }
    if (diff.removed.length > 0) {
      console.log(`    - Removing Old /32:    ${JSON.stringify(diff.removed)}`);
    }
    console.log(`    * Preserved Static:    ${JSON.stringify(diff.preserved)}`);
    console.log(`    * Rogue 0.0.0.0/0:     ${diff.hasRogue ? 'DETECTED & BEING REMOVED' : 'NONE (STRICT /32 ONLY)'}`);

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

    // 2. Explicit Owner Approval Gate
    console.log('\n------------------------------------------------------------------------');
    let confirmed = isConfirmedArg;
    if (!confirmed) {
      const answer = await askQuestion("Type 'YES' to authorize this firewall update on DigitalOcean: ");
      confirmed = answer.trim() === 'YES';
    }

    if (!confirmed) {
      console.log('\n========================================================================');
      console.log('⚠️ [ABORTED] Owner confirmation denied. 0 changes made to Cloud Firewall.');
      console.log('========================================================================\n');
      process.exit(0);
    }

    // 3. Mutate and Verify
    console.log('\n[MUTATING] Submitting scoped firewall update and verifying persisted state...');
    const applyRes = await guardian.applyUpdate({
      token,
      confirmed: true,
      networkInfo: network
    });

    console.log('\n========================================================================');
    console.log('✅ [PASS] DigitalOcean Cloud Firewall successfully updated and verified.');
    console.log(`   Status:               ${applyRes.status}`);
    console.log(`   Persisted /32 Rules:  ${JSON.stringify(applyRes.persistedAddresses)}`);
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
