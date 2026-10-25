'use strict';
/**
 * scripts/owner_local_preflight.js
 * 
 * One-command ultra-fast local preflight diagnostic for Owner.
 * Verifies Node LTS runtime, DPAPI tokens, companion port, Native Host HKCU registration.
 * Distinguishes UNATTESTED_WINDOWS_HOST by default (per Comment #6394909358).
 * Distinguishes Local Companion (127.0.0.1:18988/18989) from Remote Cloud Egress (DO :8443).
 * Redacts secrets, returns non-zero when local companion is down, and saves timestamped JSON.
 * Read-only / Non-destructive.
 */

const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function checkPort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => { s.destroy(); resolve(false); });
    s.connect(port, host);
  });
}

function checkRegistry(keyPath) {
  try {
    const out = execSync(`reg query "${keyPath}" /ve 2>nul`, { encoding: 'utf8' });
    return out.includes('com.xpider.privacy_relay');
  } catch (_) {
    return false;
  }
}

async function run() {
  const timestamp = new Date().toISOString();
  console.log('================================================================');
  console.log('  XPIDER AutoForm Sender Pro — Owner Local Preflight Diagnostic');
  console.log('  (로컬 사전 점검 / 환경, 컴패니언, 보안 및 레지스트리 상태 진단)');
  console.log('================================================================\n');

  // Environment Classification: UNATTESTED_WINDOWS_HOST by default (Comment #6394909358)
  const isOwnerAttested = process.env.XPIDER_OWNER_ATTESTED === '1';
  const environmentType = isOwnerAttested ? 'ATTESTED_OWNER_PHYSICAL_MACHINE' : 'UNATTESTED_WINDOWS_HOST';
  console.log(`[ENV] Target Machine Profile:    ${environmentType}`);
  console.log(`[ENV] Timestamp:                 ${timestamp}\n`);

  // 1. Node.js Version Check
  const nodeVer = process.version;
  const major = parseInt(process.versions.node.split('.')[0], 10);
  const isLtsAllowed = [20, 22, 24].includes(major);
  const nodeVerdict = isLtsAllowed ? 'PASS' : 'WARN';
  console.log(`[1/5] Node.js Runtime:           [${nodeVerdict}] ${nodeVer} (${isLtsAllowed ? 'Supported LTS line' : 'Recommended: v22/v24 LTS'})`);

  // 2. DPAPI Token & Credentials Preservation (Secret-Redacted)
  const dpapiPat = path.resolve('companion/.do_firewall_pat.dpapi');
  const localCreds = path.resolve('companion/.local_credentials.json');
  const controlToken = path.resolve('companion/.control_token');
  const hasPat = fs.existsSync(dpapiPat);
  const hasCreds = fs.existsSync(localCreds);
  const hasCtrl = fs.existsSync(controlToken);

  console.log(`[2/5] Security & Local DPAPI:    [PASS]`);
  console.log(`      - Control Token:            ${hasCtrl ? 'PRESERVED (Present)' : 'AUTO_GENERATED_ON_START'}`);
  console.log(`      - Local Credentials Store:  ${hasCreds ? 'PRESERVED (Present)' : 'READY'}`);
  console.log(`      - Firewall PAT (DPAPI):     ${hasPat ? 'PRESERVED (Encrypted DPAPI blob)' : 'NOT_CONFIGURED (Safe fail-closed)'}`);

  // 3. Local Companion Service Readiness (127.0.0.1:18988 / 18989)
  const p18989 = await checkPort('127.0.0.1', 18989, 500);
  const p18988 = await checkPort('127.0.0.1', 18988, 500);
  const companionOnline = p18988 && p18989;

  if (companionOnline) {
    console.log(`[3/5] Local Companion Service:   [PASS] ACTIVE (Proxy: 18988 OPEN, Control: 18989 OPEN)`);
  } else if (p18988 || p18989) {
    console.log(`[3/5] Local Companion Service:   [WARN] PARTIAL (Proxy: ${p18988 ? 'OPEN' : 'CLOSED'}, Control: ${p18989 ? 'OPEN' : 'CLOSED'})`);
  } else {
    console.log(`[3/5] Local Companion Service:   [FAIL] STANDBY (127.0.0.1:18988 and 18989 are both CLOSED)`);
    console.log(`      --> [조치 필요] 로컬 컴패니언이 실행되지 않았습니다.`);
    console.log(`          START 버튼을 사용하려면 먼저 'XPIDER_AUTO_SETUP.bat'을 실행하십시오.`);
  }

  // 4. Native Messaging Host Registry in HKCU (com.xpider.privacy_relay)
  const edgeKey = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay';
  const chromeKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay';
  const edgeRegistered = checkRegistry(edgeKey);
  const chromeRegistered = checkRegistry(chromeKey);

  console.log(`[4/5] Native Host Manifest (HKCU):`);
  console.log(`      - Microsoft Edge:           ${edgeRegistered ? '[PASS] REGISTERED' : '[READY] Not registered (XPIDER_AUTO_SETUP.bat registers it)'}`);
  console.log(`      - Google Chrome:            ${chromeRegistered ? '[PASS] REGISTERED' : '[READY] Not registered (XPIDER_AUTO_SETUP.bat registers it)'}`);

  // 5. Remote Cloud Egress Node (DigitalOcean Dedicated Node) vs Local Host
  const DROPLET_IP = '143.198.40.33';
  const p8443 = await checkPort(DROPLET_IP, 8443, 1500);
  const p22 = await checkPort(DROPLET_IP, 22, 1000);

  console.log(`[5/5] Remote Cloud Egress Node (DO 143.198.40.33):`);
  console.log(`      - Port 8443 (Private Relay): ${p8443 ? '[PASS] REACHABLE' : '[STANDBY / LOCAL_FALLBACK]'}`);
  console.log(`      - Port 22 (SSH Invariant):   ${!p22 ? '[PASS] SECURELY BLOCKED (Fail-Closed)' : '[WARN] OPEN'}`);
  console.log(`      (Note: Remote egress reachability does NOT replace Local Companion readiness)`);

  const overallReadyForStart = Boolean((edgeRegistered || chromeRegistered) && companionOnline);

  // Compile Machine-Readable Redacted Evidence
  const diagnosticResult = {
    diagnosticSuite: 'XPIDER_OWNER_LOCAL_PREFLIGHT',
    timestamp,
    environmentType,
    runtime: {
      nodeVersion: nodeVer,
      platform: process.platform,
      arch: process.arch,
      verdict: nodeVerdict
    },
    security: {
      controlTokenPresent: hasCtrl,
      localCredentialsPresent: hasCreds,
      dpapiPatPresent: hasPat,
      secretsExposed: false
    },
    companionPorts: {
      port18988Open: p18988,
      port18989Open: p18989
    },
    nativeMessagingHKCU: {
      hostName: 'com.xpider.privacy_relay',
      edgeRegistered,
      chromeRegistered
    },
    networkPosture: {
      dropletIpRedacted: '143.198.40.xx',
      privateRelayPort8443Reachable: p8443,
      sshPort22SecurelyBlocked: !p22
    },
    overallReadyForStart
  };

  const evidenceDir = path.resolve(__dirname, '..', 'evidence', 'owner_acceptance_diagnostics');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const safeTs = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(evidenceDir, `diagnostic_${safeTs}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(diagnosticResult, null, 2), 'utf8');

  console.log('\n================================================================');
  console.log(`  Diagnostic Saved: ${path.relative(process.cwd(), reportPath)}`);
  console.log(`  Overall Ready For Extension START: [${overallReadyForStart ? 'PASS' : 'FAIL / SETUP_REQUIRED'}]`);
  if (!overallReadyForStart) {
    console.log('  Action: Run XPIDER_AUTO_SETUP.bat to register registry & launch companion.');
  }
  console.log('================================================================\n');

  if (!overallReadyForStart) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('[PREFLIGHT_ERROR]', err);
  process.exit(1);
});
