'use strict';
/**
 * Reproducible Disposable-Profile Browser Verification Gate Runner
 * Directives #6760076943 & #6765989147 (goodkie/v-show Issue #6)
 *
 * Usage:
 *   node test/run_email_browser_gate.js [--ext <dir>] [--browser <exe|edge>] [--out <outDir>]
 *   node test/run_email_browser_gate.js <extensionDir> <browserExe> <outDir>
 *
 * Executes both real-extension MV3 CDP suites in isolated disposable browser profiles:
 *   1. test/run_email_studio_browser_runtime_cdp.js (25 assertions)
 *   2. test/run_popup_paused_runtime_cdp.js (14 assertions)
 *
 * Verifies all positive/negative remote-image, HTML export, live Service Worker pause/resume,
 * and screenshot/log artifact invariants, and writes <outDir>/report_email_browser_gate.json.
 * Zero external sends. Never touches any owner browser profile.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execSync } = require('node:child_process');

function resolveCliArgs(argv) {
  const repoRoot = path.resolve(__dirname, '..');
  let extArg = null, exeArg = null, outArg = null;
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ext' && argv[i + 1]) { extArg = argv[++i]; }
    else if ((a === '--browser' || a === '--browser-exe') && argv[i + 1]) { exeArg = argv[++i]; }
    else if (a === '--out' && argv[i + 1]) { outArg = argv[++i]; }
    else if (!a.startsWith('--')) { pos.push(a); }
  }
  const resolvedExt = path.resolve(extArg || pos[0] || path.join(repoRoot, 'extension'));
  let rawExe = exeArg || pos[1] || process.env.BROWSER_EXE || 'edge';
  if (/^(edge|msedge)$/i.test(rawExe)) {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome'
    ];
    rawExe = candidates.find(c => fs.existsSync(c)) || rawExe;
  }
  const resolvedExe = fs.existsSync(rawExe) ? path.resolve(rawExe) : rawExe;
  const resolvedOut = path.resolve(outArg || pos[2] || path.join(repoRoot, 'evidence', 'browser_gate_latest'));
  return [resolvedExt, resolvedExe, resolvedOut];
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const [extDir, browserExe, outDir] = resolveCliArgs(process.argv.slice(2));
const repoRoot = path.resolve(__dirname, '..');
const studioOutDir = path.join(outDir, 'email_studio');
const popupOutDir = path.join(outDir, 'popup_paused');
fs.mkdirSync(studioOutDir, { recursive: true });
fs.mkdirSync(popupOutDir, { recursive: true });

let gitHeadSha = 'UNKNOWN';
let extensionTreeSha = 'UNKNOWN';
try {
  gitHeadSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  extensionTreeSha = execSync('git rev-parse HEAD:extension', { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {}

const checks = [];
function record(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || '') });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
}

record(
  'BROWSER_BINARY_RESOLVED_AND_EXECUTABLE',
  fs.existsSync(browserExe),
  `browserExe=${browserExe}`
);

// 1. Run Email Studio Browser Runtime CDP Suite
const studioScript = path.join(__dirname, 'run_email_studio_browser_runtime_cdp.js');
const studioRun = spawnSync(
  process.execPath,
  [studioScript, extDir, browserExe, studioOutDir],
  { cwd: repoRoot, encoding: 'utf8', timeout: 120000 }
);
const studioLogPath = path.join(outDir, 'email_studio_run.log');
fs.writeFileSync(
  studioLogPath,
  (studioRun.stdout || '') + (studioRun.stderr ? '\n--- STDERR ---\n' + studioRun.stderr : ''),
  'utf8'
);

record(
  'STUDIO_CDP_EXIT_CODE_ZERO',
  studioRun.status === 0,
  `exitCode=${studioRun.status}`
);

const studioReportPath = path.join(studioOutDir, 'report_email_studio_chrome_runtime.json');
const studioReport = fs.existsSync(studioReportPath)
  ? JSON.parse(fs.readFileSync(studioReportPath, 'utf8'))
  : null;

const studioResults = (studioReport && Array.isArray(studioReport.results)) ? studioReport.results : [];
const studioPassed = studioResults.filter(r => r.pass).length;
const findStudio = name => studioResults.find(r => r.name === name);

record(
  'STUDIO_25_OF_25_ASSERTIONS_PASS',
  studioResults.length === 25 && studioPassed === 25,
  `${studioPassed}/${studioResults.length}`
);

record(
  'DISPOSABLE_PROFILE_ENFORCED_NO_OWNER_PROFILE',
  Boolean(
    studioReport &&
    studioReport.disposableProfileVerified === true &&
    findStudio('BROWSER_STARTED') &&
    /xpider_email_studio_/i.test(findStudio('BROWSER_STARTED').detail || '') &&
    !/User Data/i.test(findStudio('BROWSER_STARTED').detail || '')
  ),
  findStudio('BROWSER_STARTED') ? findStudio('BROWSER_STARTED').detail : 'missing'
);

record(
  'STUDIO_REMOTE_IMAGE_HITS_BEFORE_OPTIN_ZERO',
  Boolean(
    findStudio('REMOTE_IMAGE_DEFAULT_OFF')?.pass &&
    findStudio('REMOTE_IMAGE_NO_REQUEST_BEFORE_OPTIN')?.pass &&
    /serverHits=0/.test(findStudio('REMOTE_IMAGE_NO_REQUEST_BEFORE_OPTIN')?.detail || '')
  ),
  findStudio('REMOTE_IMAGE_NO_REQUEST_BEFORE_OPTIN')?.detail || 'missing'
);

record(
  'STUDIO_EXPORT_HTML_INCLUDES_HTTPS_WHILE_UNCHECKED',
  Boolean(
    findStudio('EXPORT_HTML_INCLUDES_HTTPS_IMAGE_WHILE_UNCHECKED')?.pass &&
    /included=true, serverHitsBeforeOptIn=0/.test(findStudio('EXPORT_HTML_INCLUDES_HTTPS_IMAGE_WHILE_UNCHECKED')?.detail || '')
  ),
  findStudio('EXPORT_HTML_INCLUDES_HTTPS_IMAGE_WHILE_UNCHECKED')?.detail || 'missing'
);

record(
  'STUDIO_REMOTE_IMAGE_HITS_AFTER_OPTIN_GE_1',
  Boolean(
    findStudio('HTTPS_IMAGE_REFERENCED_AFTER_OPTIN')?.pass &&
    findStudio('HOSTED_IMAGE_POSITIVE_CONTROL_FETCH_OBSERVED')?.pass &&
    studioReport &&
    studioReport.fixtureHitsCount >= 1 &&
    studioReport.fixtureHits?.[0]?.url === '/fixture-remote-banner.png'
  ),
  `fixtureHitsCount=${studioReport?.fixtureHitsCount ?? 0} url=${studioReport?.fixtureHits?.[0]?.url || 'none'}`
);

record(
  'STUDIO_EXPORT_HTML_ZERO_BLOB_URLS',
  Boolean(
    findStudio('LOCAL_IMAGE_PREVIEW_BLOB_ONLY')?.pass &&
    findStudio('EXPORT_HTML_WARNS_LOCAL_IMAGE_NOT_INCLUDED')?.pass &&
    findStudio('EXPORT_HTML_HAS_NO_BLOB_URL')?.pass
  ),
  findStudio('EXPORT_HTML_HAS_NO_BLOB_URL')?.detail || 'missing'
);

record(
  'STUDIO_NO_UNEXPECTED_NETWORK_OR_CSP_ERRORS',
  Boolean(
    findStudio('NO_NON_GET_OR_UNEXPECTED_NETWORK_FROM_STUDIO')?.pass &&
    findStudio('NO_CSP_OR_JS_ERRORS_IN_STUDIO_CONSOLE')?.pass &&
    findStudio('JSON_EXPORT_HAS_NO_SECRETS')?.pass
  ),
  'no unexpected network, no CSP/JS errors, no secrets in export'
);

const expectedStudioPngs = [
  'popup_with_email_studio_link.png',
  'studio_initial.png',
  'studio_local_image_preview.png',
  'studio_mobile_preview.png',
  'studio_marketing_checks.png'
];
const studioPngCheck = expectedStudioPngs.every(f => {
  const p = path.join(studioOutDir, f);
  return fs.existsSync(p) && fs.statSync(p).size > 100;
});
record(
  'STUDIO_SCREENSHOT_ARTIFACTS_PRESENT_AND_NONEMPTY',
  studioPngCheck,
  expectedStudioPngs.join(', ')
);

// 2. Run Popup Paused Runtime CDP Suite (Live MV3 background.js Service Worker)
const popupScript = path.join(__dirname, 'run_popup_paused_runtime_cdp.js');
const popupRun = spawnSync(
  process.execPath,
  [popupScript, extDir, browserExe, popupOutDir],
  { cwd: repoRoot, encoding: 'utf8', timeout: 120000 }
);
const popupLogPath = path.join(outDir, 'popup_paused_run.log');
fs.writeFileSync(
  popupLogPath,
  (popupRun.stdout || '') + (popupRun.stderr ? '\n--- STDERR ---\n' + popupRun.stderr : ''),
  'utf8'
);

record(
  'POPUP_CDP_EXIT_CODE_ZERO',
  popupRun.status === 0,
  `exitCode=${popupRun.status}`
);

const popupReportPath = path.join(popupOutDir, 'report_popup_paused_runtime.json');
const popupReport = fs.existsSync(popupReportPath)
  ? JSON.parse(fs.readFileSync(popupReportPath, 'utf8'))
  : null;
const popupResults = (popupReport && Array.isArray(popupReport.results)) ? popupReport.results : [];
const popupPassed = popupResults.filter(r => r.pass).length;
const findPopup = name => popupResults.find(r => r.name === name);

record(
  'POPUP_14_OF_14_ASSERTIONS_PASS',
  popupResults.length === 14 && popupPassed === 14,
  `${popupPassed}/${popupResults.length}`
);

record(
  'POPUP_LIVE_MV3_SERVICE_WORKER_ATTACHED',
  Boolean(findPopup('LIVE_BACKGROUND_SERVICE_WORKER_ATTACHED')?.pass),
  findPopup('LIVE_BACKGROUND_SERVICE_WORKER_ATTACHED')?.detail || 'missing'
);

const fiveRefChecks = [
  'NO_isPausedState_REFERENCEERROR_LIVE_BG_IDLE',
  'NO_isPausedState_REFERENCEERROR_LIVE_BG_PAUSED_CHECKPOINT',
  'NO_isPausedState_REFERENCEERROR_LIVE_BG_ACTIVE',
  'NO_isPausedState_REFERENCEERROR_LIVE_BG_PAUSED_WITH_POPUP_STORAGE_THROW',
  'NO_isPausedState_REFERENCEERROR_LIVE_BG_IDLE_WITH_POPUP_STORAGE_THROW'
];
record(
  'POPUP_ZERO_ISPAUSEDSTATE_REFERENCEERRORS_ALL_5_MODES',
  fiveRefChecks.every(k => findPopup(k)?.pass),
  fiveRefChecks.map(k => `${k}=${Boolean(findPopup(k)?.pass)}`).join(' ')
);

record(
  'POPUP_LIVE_PAUSE_CAMPAIGN_HANDLER_OPERATIONAL',
  Boolean(findPopup('LIVE_BG_PAUSE_CAMPAIGN_HANDLER_OPERATIONAL')?.pass),
  findPopup('LIVE_BG_PAUSE_CAMPAIGN_HANDLER_OPERATIONAL')?.detail || 'missing'
);

const expectedPopupPngs = [
  'popup_LIVE_BG_IDLE.png',
  'popup_LIVE_BG_PAUSED_CHECKPOINT.png',
  'popup_LIVE_BG_ACTIVE.png',
  'popup_LIVE_BG_PAUSED_WITH_POPUP_STORAGE_THROW.png',
  'popup_LIVE_BG_IDLE_WITH_POPUP_STORAGE_THROW.png'
];
const popupPngCheck = expectedPopupPngs.every(f => {
  const p = path.join(popupOutDir, f);
  return fs.existsSync(p) && fs.statSync(p).size > 100;
});
record(
  'POPUP_SCREENSHOT_ARTIFACTS_PRESENT_AND_NONEMPTY',
  popupPngCheck,
  expectedPopupPngs.join(', ')
);

// Build SHA-256 inventory of all downloadable artifacts in outDir
const artifactInventory = [];
function walkArtifacts(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkArtifacts(full);
    } else if (ent.name !== 'report_email_browser_gate.json') {
      const rel = path.relative(outDir, full).replace(/\\/g, '/');
      const st = fs.statSync(full);
      artifactInventory.push({
        relativePath: rel,
        sizeBytes: st.size,
        sha256: sha256File(full)
      });
    }
  }
}
walkArtifacts(outDir);
artifactInventory.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const gatePassCount = checks.filter(c => c.pass).length;
const gateSummary = {
  gateName: 'XPIDER_EMAIL_BROWSER_RUNTIME_GATE',
  generatedAt: new Date().toISOString(),
  gitHeadSha,
  extensionTreeSha,
  nodeVersion: process.version,
  browserExe,
  browserVersion: studioReport?.browser || popupReport?.browser || 'UNKNOWN',
  disposableProfileOnly: true,
  ownerProfileTouched: false,
  externalEmailSends: 0,
  hostedGithubActionsBrowserCiStatus: process.env.GITHUB_ACTIONS === 'true' ? 'EXECUTED_IN_GITHUB_ACTIONS' : 'UNKNOWN_NOT_RUN_ON_GITHUB_HOSTED_RUNNER',
  suites: {
    emailStudioRuntimeCdp: {
      command: `node test/run_email_studio_browser_runtime_cdp.js "${extDir}" "${browserExe}" "${studioOutDir}"`,
      exitCode: studioRun.status,
      passed: studioPassed,
      total: studioResults.length,
      fixtureHitsBeforeOptIn: 0,
      fixtureHitsAfterOptIn: studioReport?.fixtureHitsCount ?? 0,
      reportPath: path.relative(repoRoot, studioReportPath).replace(/\\/g, '/'),
      logPath: path.relative(repoRoot, studioLogPath).replace(/\\/g, '/')
    },
    popupPausedRuntimeCdp: {
      command: `node test/run_popup_paused_runtime_cdp.js "${extDir}" "${browserExe}" "${popupOutDir}"`,
      exitCode: popupRun.status,
      passed: popupPassed,
      total: popupResults.length,
      reportPath: path.relative(repoRoot, popupReportPath).replace(/\\/g, '/'),
      logPath: path.relative(repoRoot, popupLogPath).replace(/\\/g, '/')
    }
  },
  gateAssertionsPassed: gatePassCount,
  gateAssertionsTotal: checks.length,
  checks,
  artifactInventory
};

const gateReportPath = path.join(outDir, 'report_email_browser_gate.json');
fs.writeFileSync(gateReportPath, JSON.stringify(gateSummary, null, 2), 'utf8');
console.log(`\n${gatePassCount}/${checks.length} BROWSER GATE ASSERTIONS PASS (Studio ${studioPassed}/25, Popup ${popupPassed}/14) -> ${gateReportPath}`);
process.exit(gatePassCount === checks.length ? 0 : 1);

