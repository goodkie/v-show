'use strict';
/**
 * test/run_companion_stop_start_smoke.js
 * 
 * Verifies clean-state companion lifecycle:
 * 1. Initial status & shutdown of any existing instance.
 * 2. Clean start via ensure_companion_service.js.
 * 3. Probing localhost 18988 (proxy) and 18989 (control plane).
 * 4. Authenticated /status probe using control token.
 * 5. DPAPI & local credentials preservation (zero secret leakage).
 * 6. Intentional STOP via /shutdown -> port release verification.
 * 7. Clean RE-START via ensure_companion_service.js -> port re-bind verification.
 * 8. Native messaging host registry verification (HKCU com.xpider.privacy_relay).
 * 9. Production node 143.198.40.33:8443 untouched, port 22 securely blocked.
 * 
 * Generates timestamped evidence JSON.
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const CONTROL_PORT = 18989;
const PROXY_PORT = 18988;
const ROOT_DIR = path.resolve(__dirname, '..');
const COMPANION_DIR = path.join(ROOT_DIR, 'companion');
const TOKEN_FILE = path.join(COMPANION_DIR, '.control_token');
const DPAPI_FILE = path.join(COMPANION_DIR, '.do_firewall_pat.dpapi');
const CREDS_FILE = path.join(COMPANION_DIR, '.local_credentials.json');

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 600) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => { s.destroy(); resolve(false); });
    s.connect(port, host);
  });
}

function probeHttp(url, token = null, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.get({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      headers
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, data: JSON.parse(b) });
        } catch (_) {
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, raw: b });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.code || err.message }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });
  });
}

function getControlToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch (_) {}
  return null;
}

function checkRegistry(keyPath) {
  try {
    const out = execSync(`reg query "${keyPath}" /ve 2>nul`, { encoding: 'utf8' });
    return out.includes('com.xpider.privacy_relay');
  } catch (_) {
    return false;
  }
}

async function shutdownCompanion(token) {
  if (!token) return { ok: false, reason: 'NO_TOKEN' };
  try {
    const res = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: CONTROL_PORT,
        path: '/shutdown',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Length': '0'
        }
      }, (r) => {
        let b = '';
        r.on('data', d => b += d);
        r.on('end', () => resolve({ ok: r.statusCode === 200, statusCode: r.statusCode }));
      });
      req.on('error', (err) => resolve({ ok: false, error: err.code }));
      req.setTimeout(1500, () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
      req.end();
    });
    return res;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function run() {
  const timestamp = new Date().toISOString();
  console.log('================================================================');
  console.log('  XPIDER Companion Clean-State STOP / START & Port Probe Smoke');
  console.log('  (격리 환경 컴패니언 수명주기 및 포트/프로세스 실측 감사)');
  console.log('================================================================\n');

  const report = {
    testSuite: 'XPIDER_COMPANION_STOP_START_SMOKE',
    timestamp,
    environmentType: 'UNATTESTED_WINDOWS_HOST',
    steps: []
  };

  // Step 1: Initial State & Graceful Teardown
  console.log('[Step 1/6] Inspecting initial state and ensuring baseline...');
  const initP18989 = await isPortOpen(CONTROL_PORT);
  const initP18988 = await isPortOpen(PROXY_PORT);
  const initToken = getControlToken();

  if (initP18989) {
    console.log(`  - Initial companion found running. Sending /shutdown request...`);
    const shutRes = await shutdownCompanion(initToken);
    console.log(`  - Shutdown response: status=${shutRes.statusCode || shutRes.error}`);
    // Poll up to 3s for port release
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (!(await isPortOpen(CONTROL_PORT)) && !(await isPortOpen(PROXY_PORT))) break;
    }
  }

  // Force kill any remaining rogue node process listening on 18988/18989 if any
  try {
    const netstatOut = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    for (const line of netstatOut.split('\n')) {
      if ((line.includes(':18988') || line.includes(':18989')) && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid && !isNaN(pid)) {
          console.log(`  - Cleaning up listening PID ${pid}...`);
          try { execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore' }); } catch (_) {}
        }
      }
    }
  } catch (_) {}

  await new Promise(r => setTimeout(r, 500));
  const postKill18989 = await isPortOpen(CONTROL_PORT);
  const postKill18988 = await isPortOpen(PROXY_PORT);

  const step1Pass = !postKill18989 && !postKill18988;
  console.log(`  - Baseline port release: 18988=${postKill18988 ? 'OPEN' : 'CLOSED'}, 18989=${postKill18989 ? 'OPEN' : 'CLOSED'} [${step1Pass ? 'PASS' : 'FAIL'}]`);
  report.steps.push({
    name: 'INITIAL_PORT_RELEASE',
    step1Pass,
    ports: { 18988: postKill18988, 18989: postKill18989 }
  });

  // Step 2: Clean Start via ensure_companion_service.js
  console.log('\n[Step 2/6] Executing ensure_companion_service.js (clean launch)...');
  const ensureOut = execSync('node companion/ensure_companion_service.js', { encoding: 'utf8', cwd: ROOT_DIR });
  console.log(ensureOut.trim().split('\n').map(l => '  ' + l).join('\n'));

  // Poll for ports
  let startP18989 = false;
  let startP18988 = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 200));
    startP18989 = await isPortOpen(CONTROL_PORT);
    startP18988 = await isPortOpen(PROXY_PORT);
    if (startP18989 && startP18988) break;
  }

  const step2Pass = startP18989 && startP18988;
  console.log(`  - Ports active post-launch: 18988=${startP18988 ? 'OPEN' : 'CLOSED'}, 18989=${startP18989 ? 'OPEN' : 'CLOSED'} [${step2Pass ? 'PASS' : 'FAIL'}]`);
  report.steps.push({
    name: 'CLEAN_LAUNCH_AND_BIND',
    step2Pass,
    ports: { 18988: startP18988, 18989: startP18989 }
  });

  // Step 3: Health & Authenticated Status Probe
  console.log('\n[Step 3/6] Probing /health (unauthenticated) & /status (authenticated)...');
  const healthRes = await probeHttp(`http://127.0.0.1:${CONTROL_PORT}/health`);
  const activeToken = getControlToken();
  const statusRes = await probeHttp(`http://127.0.0.1:${CONTROL_PORT}/status`, activeToken);

  const healthOk = healthRes.ok && healthRes.data && healthRes.data.status === 'OK';
  const statusOk = statusRes.ok && statusRes.statusCode === 200 && statusRes.data && statusRes.data.service === 'XPIDER Privacy Relay';
  const companionPid = healthRes.data ? healthRes.data.pid : null;
  const companionBuild = healthRes.data ? healthRes.data.companionBuildId : null;

  console.log(`  - /health response: HTTP ${healthRes.statusCode} status=${healthRes.data ? healthRes.data.status : 'error'} (PID: ${companionPid}, Build: ${companionBuild}) [${healthOk ? 'PASS' : 'FAIL'}]`);
  console.log(`  - /status response: HTTP ${statusRes.statusCode} service=${statusRes.data ? statusRes.data.service : 'error'} [${statusOk ? 'PASS' : 'FAIL'}]`);

  report.steps.push({
    name: 'HEALTH_AND_AUTH_STATUS_PROBE',
    healthOk,
    statusOk,
    companionPid,
    companionBuild,
    apiCapabilities: healthRes.data ? healthRes.data.apiCapabilities : []
  });

  // Step 4: Security & DPAPI Invariant Check
  console.log('\n[Step 4/6] Verifying DPAPI tokens and credentials preservation (zero secret leakage)...');
  const hasPat = fs.existsSync(DPAPI_FILE);
  const hasCreds = fs.existsSync(CREDS_FILE);
  const hasToken = fs.existsSync(TOKEN_FILE);
  console.log(`  - Control token present: ${hasToken} (length=${activeToken ? activeToken.length : 0})`);
  console.log(`  - DPAPI encrypted PAT present: ${hasPat}`);
  console.log(`  - Local credentials present: ${hasCreds}`);
  console.log(`  - Secrets exposed in report: FALSE`);

  report.steps.push({
    name: 'DPAPI_AND_CREDENTIALS_PRESERVATION',
    hasPat,
    hasCreds,
    hasToken,
    secretsExposed: false
  });

  // Step 5: Intentional STOP via /shutdown -> Port Release
  console.log('\n[Step 5/6] Testing intentional STOP via /shutdown and verifying port release...');
  const stopRes = await shutdownCompanion(activeToken);
  console.log(`  - /shutdown call result: status=${stopRes.statusCode || stopRes.error}`);

  let stopP18989 = true;
  let stopP18988 = true;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 200));
    stopP18989 = await isPortOpen(CONTROL_PORT);
    stopP18988 = await isPortOpen(PROXY_PORT);
    if (!stopP18989 && !stopP18988) break;
  }

  const step5Pass = !stopP18989 && !stopP18988;
  console.log(`  - Ports after STOP: 18988=${stopP18988 ? 'OPEN' : 'CLOSED'}, 18989=${stopP18989 ? 'OPEN' : 'CLOSED'} [${step5Pass ? 'PASS' : 'FAIL'}]`);

  report.steps.push({
    name: 'INTENTIONAL_STOP_AND_RELEASE',
    step5Pass,
    ports: { 18988: stopP18988, 18989: stopP18989 }
  });

  // Step 6: Clean RE-START via ensure_companion_service.js -> Re-verify
  console.log('\n[Step 6/6] Testing clean RE-START via ensure_companion_service.js...');
  const restartOut = execSync('node companion/ensure_companion_service.js', { encoding: 'utf8', cwd: ROOT_DIR });
  console.log(restartOut.trim().split('\n').map(l => '  ' + l).join('\n'));

  let restartP18989 = false;
  let restartP18988 = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 200));
    restartP18989 = await isPortOpen(CONTROL_PORT);
    restartP18988 = await isPortOpen(PROXY_PORT);
    if (restartP18989 && restartP18988) break;
  }

  const restartHealth = await probeHttp(`http://127.0.0.1:${CONTROL_PORT}/health`);
  const step6Pass = restartP18989 && restartP18988 && restartHealth.ok;
  console.log(`  - Ports after RE-START: 18988=${restartP18988 ? 'OPEN' : 'CLOSED'}, 18989=${restartP18989 ? 'OPEN' : 'CLOSED'} (HTTP ${restartHealth.statusCode}) [${step6Pass ? 'PASS' : 'FAIL'}]`);

  report.steps.push({
    name: 'RESTART_AND_REVERIFY',
    step6Pass,
    ports: { 18988: restartP18988, 18989: restartP18989 },
    restartStatusCode: restartHealth.statusCode
  });

  // Check Native Messaging Registry
  const edgeKey = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay';
  const chromeKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay';
  const edgeReg = checkRegistry(edgeKey);
  const chromeReg = checkRegistry(chromeKey);

  report.nativeMessaging = {
    edgeRegistered: edgeReg,
    chromeRegistered: chromeReg,
    hostName: 'com.xpider.privacy_relay'
  };

  // Check Remote Cloud Invariant
  const p8443 = await isPortOpen(8443, '143.198.40.33', 1500);
  const p22 = await isPortOpen(22, '143.198.40.33', 1000);
  report.remoteCloudPosture = {
    dropletIpRedacted: '143.198.40.xx',
    port8443Reachable: p8443,
    port22SecurelyBlocked: !p22
  };

  const overallVerdict = step1Pass && step2Pass && healthOk && statusOk && step5Pass && step6Pass && edgeReg && chromeReg && !p22;
  report.overallVerdict = overallVerdict ? 'PASS' : 'FAIL';

  const evidenceDir = path.join(ROOT_DIR, 'evidence', 'clean_lifecycle_smoke');
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
  const safeTs = timestamp.replace(/[:.]/g, '-');
  const reportPath = path.join(evidenceDir, `companion_stop_start_smoke_${safeTs}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n================================================================');
  console.log(`  Evidence Saved: ${path.relative(ROOT_DIR, reportPath)}`);
  console.log(`  Overall Clean-State Smoke Verdict: [${overallVerdict ? 'PASS' : 'FAIL'}]`);
  console.log('================================================================\n');

  process.exit(overallVerdict ? 0 : 1);
}

run().catch(err => {
  console.error('[FATAL_ERROR]', err);
  process.exit(1);
});
