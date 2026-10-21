/**
 * Master Test Gate Runner & Machine-Readable Manifest Generator
 * Directives: Issue #6 Finalization Sprint (#6311090907, #6311145870)
 * 
 * Executes exhaustive test suites across Layers A through H, records:
 * - layer / category
 * - test name / target
 * - status (PASS / FAIL)
 * - duration ms
 * - stdout / log snippet
 * 
 * Outputs:
 * - test_manifest.json
 * - scratch/test_manifest_summary.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TEST_DEFINITIONS = [
  // --- LAYER A: Syntax, Integrity & Parity ---
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: 'Syntax Compilation: extension/background.js',
    type: 'syntax',
    command: process.execPath,
    args: ['--check', 'extension/background.js']
  },
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: 'Syntax Compilation: extension/content-script.js',
    type: 'syntax',
    command: process.execPath,
    args: ['--check', 'extension/content-script.js']
  },
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: 'Syntax Compilation: extension/modules/privacy-gateway.js',
    type: 'syntax',
    command: process.execPath,
    args: ['--check', 'extension/modules/privacy-gateway.js']
  },
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: 'Syntax Compilation: extension/popup.js',
    type: 'syntax',
    command: process.execPath,
    args: ['--check', 'extension/popup.js']
  },
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: 'Syntax Compilation: companion/privacy-relay-service.js',
    type: 'syntax',
    command: process.execPath,
    args: ['--check', 'companion/privacy-relay-service.js']
  },
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: 'Syntax Compilation: companion/private-egress-provisioner.js',
    type: 'syntax',
    command: process.execPath,
    args: ['--check', 'companion/private-egress-provisioner.js']
  },
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: 'Syntax Compilation: private-egress/proxy-service.js',
    type: 'syntax',
    command: process.execPath,
    args: ['--check', 'private-egress/proxy-service.js']
  },
  {
    layer: 'Layer A: Syntax, Integrity & Parity',
    name: '100% SHA256 Byte Parity: extension vs backup directories',
    type: 'parity',
    command: process.execPath,
    args: ['-e', `
      const fs = require('fs');
      const crypto = require('crypto');
      const files = ['background.js', 'content-script.js', 'solver-content.js', 'modules/privacy-gateway.js', 'popup.html', 'popup.js'];
      for (const f of files) {
        const h1 = crypto.createHash('sha256').update(fs.readFileSync('extension/' + f)).digest('hex');
        const h2 = crypto.createHash('sha256').update(fs.readFileSync('send_message_backup/' + f)).digest('hex');
        const h3 = crypto.createHash('sha256').update(fs.readFileSync('send_message_backup/build/extension/' + f)).digest('hex');
        if (h1 !== h2 || h1 !== h3) {
          console.error('PARITY_MISMATCH', f);
          process.exit(1);
        }
      }
      console.log('ALL_FILES_100_PERCENT_PARITY_VERIFIED');
    `]
  },

  // --- LAYER B: Sprint Core Hardening (F1-F4, C1-C8, P0-A to P0-F) ---
  {
    layer: 'Layer B: Sprint Core Hardening',
    name: 'F1-F4 / C1-C8 CAPTCHA & Circuit Breaker Suite',
    type: 'unit',
    command: process.execPath,
    args: ['test_sprint_f1_f4_captcha_and_circuit_breaker.js']
  },
  {
    layer: 'Layer B: Sprint Core Hardening',
    name: 'P0-A to P0-F Private Egress Repair & Mutex Suite',
    type: 'unit',
    command: process.execPath,
    args: ['test_sprint_track_a_egress_repair.js']
  },

  // --- LAYER C: CAPTCHA Flag Isolation & Exception Containment ---
  {
    layer: 'Layer C: CAPTCHA Flag & Exception Containment',
    name: 'RC3.33 Lexical Scope, Token Reset & Exception Containment',
    type: 'unit',
    command: process.execPath,
    args: ['test_rc3_33_captcha_flag_and_exception_containment.js']
  },
  {
    layer: 'Layer C: CAPTCHA Flag & Exception Containment',
    name: 'RC3.32 Site Token Rejection Behavioral Classification',
    type: 'unit',
    command: process.execPath,
    args: ['test_rc3_32_site_rejection_behavioral.js']
  },
  {
    layer: 'Layer C: CAPTCHA Flag & Exception Containment',
    name: 'RC3.31 Authoritative Acceptance Suite (23 Verification Points)',
    type: 'unit',
    command: process.execPath,
    args: ['test_rc3_31_acceptance.js']
  },
  {
    layer: 'Layer C: CAPTCHA Flag & Exception Containment',
    name: 'RC3.31 CAPTCHA Rejection Detector Sandbox Suite',
    type: 'unit',
    command: process.execPath,
    args: ['test_rc3_31_captcha_rejection_detector.js']
  },

  // --- LAYER D: Behavioral Lifecycle & Idempotency ---
  {
    layer: 'Layer D: Behavioral Lifecycle & Idempotency',
    name: 'R6.9G.7 Target-Pump Atomicity & Slot Acquisition',
    type: 'unit',
    command: process.execPath,
    args: ['test_r6_9g7_atomicity_and_lifecycle.js']
  },
  {
    layer: 'Layer D: Behavioral Lifecycle & Idempotency',
    name: 'Phase 0+1 Completion Idempotency & Stale Event Guard',
    type: 'unit',
    command: process.execPath,
    args: ['test_phase0_1_behavioral.js']
  },

  // --- LAYER E: Isolated Boot Chain & Build Handshake ---
  {
    layer: 'Layer E: Isolated Boot Chain & Handshake',
    name: 'RC3.27 Isolated Boot Chain & Build Provenance Handshake',
    type: 'unit',
    command: process.execPath,
    args: ['test_rc3_27_isolated_boot_chain.js']
  },

  // --- LAYER F: Provider Gate, Telemetry & Security ---
  {
    layer: 'Layer F: Provider Gate & Telemetry',
    name: 'RC3.25 Live Provider Gate & Failure Recovery',
    type: 'unit',
    command: process.execPath,
    args: ['test_rc3_25_live_provider_gate.js']
  },

  // --- LAYER G: DPAPI Fail-Closed Credential Security ---
  {
    layer: 'Layer G: Credential Security & Invariants',
    name: 'Windows DPAPI Fail-Closed Storage Security',
    type: 'unit',
    command: process.execPath,
    args: ['test_winsec_failclosed.js']
  },

  // --- LAYER H: Controlled Browser E2E Rehearsal ---
  {
    layer: 'Layer H: Controlled Browser E2E Rehearsal',
    name: 'Edge CDP Full Lifecycle Rehearsal (Form, Autofill, Submit, Turnstile)',
    type: 'browser_e2e',
    command: process.execPath,
    args: ['run_edge_sprint_controlled_e2e_rehearsal.js']
  }
];

function runAll() {
  console.log('========================================================================');
  console.log(' XPIDER AUTOFORM SENDER PRO — EXHAUSTIVE AUTOMATED TEST GATE');
  console.log(' PROTOCOL: OCA-DEV-1.4 | DIRECTIVE: #6311090907 / #6311145870');
  console.log('========================================================================\n');

  const startTime = Date.now();
  const results = [];
  let totalPass = 0;
  let totalFail = 0;

  for (let i = 0; i < TEST_DEFINITIONS.length; i++) {
    const t = TEST_DEFINITIONS[i];
    const testNum = i + 1;
    process.stdout.write(`[${testNum}/${TEST_DEFINITIONS.length}] [${t.layer.split(':')[0]}] ${t.name}... `);

    const t0 = Date.now();
    const res = spawnSync(t.command, t.args, {
      cwd: path.resolve(__dirname, '..'),
      env: process.env,
      encoding: 'utf8'
    });
    const durationMs = Date.now() - t0;
    const passed = (res.status === 0);

    if (passed) {
      totalPass++;
      console.log(`\x1b[32mPASS\x1b[0m (${durationMs}ms)`);
    } else {
      totalFail++;
      console.log(`\x1b[31mFAIL\x1b[0m (${durationMs}ms)`);
    }

    const logOutput = (res.stdout || '') + (res.stderr || '');
    results.push({
      testIndex: testNum,
      layer: t.layer,
      name: t.name,
      type: t.type,
      command: `${t.command} ${t.args.join(' ')}`,
      passed,
      exitCode: res.status,
      durationMs,
      logSnippet: logOutput.trim().substring(0, 500)
    });
  }

  const totalDurationMs = Date.now() - startTime;

  console.log('\n========================================================================');
  console.log(` TEST RUN COMPLETE: ${totalPass} PASSED, ${totalFail} FAILED in ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log('========================================================================\n');

  // Build Manifest Object
  const manifest = {
    metadata: {
      project: 'xpider-autoform-sender-pro',
      protocol: 'OCA-DEV-1.4',
      authoritySource: 'goodkie/v-show Issue #6',
      branch: 'upgrade/phase-0-1',
      timestamp: new Date().toISOString(),
      platform: `${process.platform} ${process.arch}`,
      nodeVersion: process.version,
      totalTests: TEST_DEFINITIONS.length,
      passed: totalPass,
      failed: totalFail,
      allPassed: (totalFail === 0),
      durationMs: totalDurationMs
    },
    tests: results
  };

  const manifestPath = path.resolve(__dirname, '..', 'test_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[MANIFEST] Machine-readable manifest saved: ${manifestPath}`);

  // Build Markdown Summary Table
  let md = `# XPIDER Automated Test Gate Manifest\n\n`;
  md += `**Timestamp**: ${manifest.metadata.timestamp}\n`;
  md += `**Platform**: Node ${manifest.metadata.nodeVersion} (${manifest.metadata.platform})\n`;
  md += `**Summary**: **${totalPass}/${TEST_DEFINITIONS.length} PASSED** (Total Duration: ${(totalDurationMs / 1000).toFixed(2)}s)\n\n`;
  md += `| Layer | Test Name | Status | Duration | Exit Code |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: |\n`;

  for (const r of results) {
    const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
    md += `| ${r.layer.split(':')[0]} | ${r.name} | ${statusIcon} | ${r.durationMs}ms | ${r.exitCode} |\n`;
  }

  const summaryPath = path.resolve(__dirname, '..', 'scratch', 'test_manifest_summary.md');
  fs.writeFileSync(summaryPath, md, 'utf8');
  console.log(`[REPORT] Markdown summary saved: ${summaryPath}\n`);

  if (totalFail > 0) {
    process.exit(1);
  }
}

runAll();
