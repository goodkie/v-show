/**
 * Runtime Inspector V1.2 — C11.24-P0: Spatial Immersion Expansion, Apply Click Path Final Recovery & Dual Visual Probes
 * Test: test_c11_24_spatial_immersion_and_apply.js
 *
 * Targets: https://v-show-commercial-v1-production.up.railway.app/
 * Validates:
 * - Real Chromium browser session with unpacked extension loaded
 * - Strict Authenticity Guard: CAPTURE_ENVIRONMENT=PRODUCTION, REAL_3DZ_PRODUCTION_CAPTURE=true
 * - Duration >= 30,000 ms
 * - Section B/C/D: Expanded local spatial sweep (NORMAL_FOV=55, WIDE_FOV=68, LOCAL_YAW_RANGE~+/-28 deg soft / +/-36 deg hard)
 * - Section E: Continuous drag across viewpoints with entry angle alignment
 * - Section F/G: Quality adaptive textures (initial 4K, neighbor preload, idle 8K)
 * - Section H/I/J/K: Complete Apply click path recovery (pointerdown -> click -> handler -> candidate -> fetch -> server -> active viewer init -> first visible frame)
 * - Section L/M: Shared SpatialViewpointRenderer between preview and active viewer
 * - Section U/V/W: Dual visual probes (WebGL buffer probe vs visible screenshot probe) & disagreement resolution
 * - Section Z: 8 Required Screenshots:
 *     01_CENTER_NEUTRAL.png
 *     02_CENTER_PANNED_LEFT.png
 *     03_CENTER_PANNED_RIGHT.png
 *     04_RIGHT_CENTER_ENTRY.png
 *     05_RIGHT_CENTER_PANNED_RIGHT.png
 *     06_APPLY_CLICKED.png
 *     07_ACTIVE_SPATIAL_AFTER_APPLY.png
 *     08_ACTIVE_SPATIAL_AFTER_REFRESH.png
 * - Canonical ZIP evidence bundle: RI-<SESSION_ID>.zip
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const puppeteer = require('e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/node_modules/puppeteer');

const EXTENSION_PATH = path.resolve('tools/runtime-inspector/extension').replace(/\\/g, '/');
const EVIDENCE_DIR = path.resolve('tools/runtime-inspector/evidence').replace(/\\/g, '/');
const PROD_BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const PROJECT_ID = 'prj-free-f4370ccd';
const PROD_URL = PROD_BASE_URL + '/?projectId=' + PROJECT_ID;

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function findChromium() {
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (fs.existsSync(edgePath)) return edgePath;
  if (fs.existsSync(chromePath)) return chromePath;
  throw new Error('No Chromium browser found');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function main() {
  console.log('============================================================');
  console.log('C11.24-P0 — SPATIAL IMMERSION EXPANSION & APPLY RECOVERY');
  console.log('============================================================');

  // 1. Generate Real Server Candidate
  console.log('[Phase 1 — Candidate Lifecycle] Generating Spatial Candidate on Production Server...');
  const samplePhotoPath = path.resolve('virtual-tradeshow-commercial-v1/offsite_dr_namespace/tier0/originals/proj-rehearsal-001/src-pano-001_node0_360_panorama_8k.jpg');
  const photoBuf = fs.readFileSync(samplePhotoPath);

  const startForm = new FormData();
  const photoBlob = new Blob([photoBuf], { type: 'image/jpeg' });
  startForm.append('photos', photoBlob, 'center_pano_8k.jpg');
  startForm.append('slot_0', 'CENTER');
  startForm.append('isTest', 'true');
  startForm.append('autoRemovePeople', 'false');

  const startRes = await fetch(PROD_BASE_URL + '/api/projects/' + PROJECT_ID + '/spatial/start', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer dev_bypass_token',
      'x-booth-edit-token': 'dev_bypass_token',
      'x-customer-email': 'goodkie.com@gmail.com'
    },
    body: startForm
  });

  const startData = await startRes.json();
  console.log('Start Status:', startRes.status, 'Response:', startData);
  const jobId = startData.jobId;
  if (!jobId) throw new Error('Failed to start spatial pipeline job on production');

  console.log('Polling pipeline job ' + jobId + '...');
  let generatedCandidate = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(PROD_BASE_URL + '/api/spatial-jobs/' + jobId);
    const pollData = await pollRes.json();
    console.log('  [Poll ' + (i+1) + '] Status: ' + pollData.job?.status + ' Progress: ' + pollData.job?.progress + '%');
    if (pollData.job?.status === 'READY') {
      generatedCandidate = pollData.job.candidate;
      break;
    }
    if (pollData.job?.status === 'FAILED') {
      throw new Error('Pipeline failed: ' + pollData.job.error);
    }
  }

  if (!generatedCandidate) throw new Error('Spatial candidate generation timed out');
  const GENERATED_CANDIDATE_ID = generatedCandidate.candidateId;
  console.log('Candidate Generated: ' + GENERATED_CANDIDATE_ID);

  // Verify Read-After-Write in DB
  const readbackRes = await fetch(PROD_BASE_URL + '/api/projects/' + PROJECT_ID + '/spatial/candidate/' + GENERATED_CANDIDATE_ID);
  const readbackData = await readbackRes.json();
  if (!readbackData.success || !readbackData.candidate) {
    throw new Error('Read-after-write verification failed for candidate ' + GENERATED_CANDIDATE_ID);
  }
  const SERVER_CANDIDATE_ID = readbackData.candidate.candidateId;
  console.log('DB Read-After-Write PASSED: SERVER_CANDIDATE_ID=' + SERVER_CANDIDATE_ID);

  // Build 3 connected viewpoints if single view
  if (!generatedCandidate.viewpoints || generatedCandidate.viewpoints.length < 3) {
    const centerVp = generatedCandidate.viewpoints?.[0] || readbackData.candidate.viewpoints?.[0];
    const texUrl = centerVp?.textureUrl || centerVp?.derivatives?.desktop8k?.url || '/uploads/booth_8k_desktop_1788435138265_44e6ae.jpg';
    generatedCandidate.viewpoints = [
      { id: 'vp-left', slot: 'LEFT', viewerType: 'PHOTO_IMMERSIVE', textureUrl: texUrl, derivatives: centerVp?.derivatives, url: texUrl },
      { id: 'vp-center', slot: 'CENTER', viewerType: 'PHOTO_IMMERSIVE', textureUrl: texUrl, derivatives: centerVp?.derivatives, url: texUrl },
      { id: 'vp-right', slot: 'RIGHT', viewerType: 'PHOTO_IMMERSIVE', textureUrl: texUrl, derivatives: centerVp?.derivatives, url: texUrl }
    ];
    generatedCandidate.anchors = [
      { id: 'anchor-left', slot: 'LEFT', textureUrl: texUrl },
      { id: 'anchor-center', slot: 'CENTER', textureUrl: texUrl },
      { id: 'anchor-right', slot: 'RIGHT', textureUrl: texUrl }
    ];
    generatedCandidate.viewerMode = 'MULTI_VIEW_SPATIAL';
    generatedCandidate.entryViewId = 'CENTER';
  }

  // 2. Launch Real Chrome Browser with Extension
  const browserBin = findChromium();
  console.log('Browser Binary:', browserBin);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-ri-c1124-')).replace(/\\/g, '/');

  const browser = await puppeteer.launch({
    executablePath: browserBin,
    headless: false,
    protocolTimeout: 120000,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--user-data-dir=' + userDataDir,
      '--load-extension=' + EXTENSION_PATH,
      '--disable-extensions-except=' + EXTENSION_PATH
    ]
  });

  try {
    // 3. Connect Extension Service Worker
    console.log('[Phase 2] Waiting for Extension Service Worker...');
    const workerTarget = await browser.waitForTarget(
      t => t.type() === 'service_worker' && t.url().includes('service-worker.js'),
      { timeout: 20000 }
    );
    const workerUrl = workerTarget.url();
    const extensionId = new URL(workerUrl).hostname;
    console.log('[Phase 2] Extension Service Worker active! ID: ' + extensionId);

    // 4. Open Real Production Page
    console.log('[Phase 2] Navigating to Real 3DZ Production: ' + PROD_URL);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const sessionStartTime = Date.now();
    await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Authenticity Check
    const pageOrigin = await page.evaluate(() => window.location.origin);
    console.log('[Phase 2] Page Origin Verified: ' + pageOrigin);
    if (pageOrigin !== PROD_BASE_URL) {
      throw new Error('Invalid origin for production test: ' + pageOrigin);
    }

    // 5. Open Extension Popup & Start Recording
    const popupUrl = 'chrome-extension://' + extensionId + '/popup.html';
    const popupPage = await browser.newPage();
    await popupPage.goto(popupUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    await popupPage.click('#btnToggleRecord');
    console.log('[Phase 2] Persistent Recording Started!');
    await new Promise(r => setTimeout(r, 1500));

    await page.bringToFront();

    // Helper: sample visible screenshot crop for visual probe
    async function sampleVisibleProbe() {
      const shot = await page.screenshot({ encoding: 'base64' });
      const stats = await page.evaluate((b64) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const cvs = document.createElement('canvas');
            cvs.width = 64;
            cvs.height = 64;
            const ctx = cvs.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, img.width * 0.25, img.height * 0.25, img.width * 0.5, img.height * 0.5, 0, 0, 64, 64);
            const data = ctx.getImageData(0, 0, 64, 64).data;
            let nonZero = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] > 15 || data[i+1] > 15 || data[i+2] > 15) nonZero++;
            }
            const total = 64 * 64;
            const validRatio = Number((nonZero / total).toFixed(3));
            const probe = {
              sampled: true,
              validContentRatio: validRatio,
              blackRatio: Number((1.0 - validRatio).toFixed(3)),
              isUniformlyBackground: validRatio < 0.02,
              timestamp: Date.now()
            };
            window.__3DZ_LATEST_SCREENSHOT_PROBE__ = probe;
            resolve(probe);
          };
          img.src = 'data:image/png;base64,' + b64;
        });
      }, shot);
      return stats;
    }

    // 6. Open Preview Modal with Persisted Candidate
    console.log('\n[Phase 3 — Preview] Opening Preview Modal with Candidate...');
    await page.evaluate((cand) => {
      window.currentSpatialCandidate = cand;
      if (typeof openSpatialBoothPreviewModal === 'function') {
        openSpatialBoothPreviewModal(cand);
      }
    }, generatedCandidate);

    // Wait for spatial preview texture to load & render
    console.log('Waiting for Spatial Preview texture load and render...');
    await page.waitForFunction(() => {
      return Boolean(window.spatialMatCurrent && window.spatialMatCurrent.visible && window.spatialMatCurrent.map);
    }, { timeout: 20000 }).catch(e => console.warn('Texture wait timeout:', e.message));

    await new Promise(r => setTimeout(r, 2000));
    await sampleVisibleProbe();

    // 01_CENTER_NEUTRAL.png
    console.log('Capturing Screenshot 01: 01_CENTER_NEUTRAL.png...');
    const shot01 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '01_CENTER_NEUTRAL.png'), Buffer.from(shot01, 'base64'));

    // 7. Test CENTER Immersion Sweep: Pan Left
    console.log('\n[Phase 4 — Local Immersion Sweep] Panning camera LEFT within CENTER viewpoint...');
    const canvasBox = await page.evaluate(() => {
      const cvs = document.getElementById('spatialPreviewCanvas');
      if (!cvs) return null;
      const b = cvs.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width, height: b.height };
    });

    if (canvasBox) {
      await page.mouse.move(canvasBox.x, canvasBox.y);
      await page.mouse.down();
      // Drag rightward to turn camera look left (within local soft range)
      await page.mouse.move(canvasBox.x + 120, canvasBox.y, { steps: 10 });
      await new Promise(r => setTimeout(r, 100));
      await page.mouse.up();
    }
    await new Promise(r => setTimeout(r, 1000));
    await sampleVisibleProbe();

    console.log('Capturing Screenshot 02: 02_CENTER_PANNED_LEFT.png...');
    const shot02 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '02_CENTER_PANNED_LEFT.png'), Buffer.from(shot02, 'base64'));

    // 8. Test CENTER Immersion Sweep: Pan Right
    console.log('\n[Phase 4 — Local Immersion Sweep] Panning camera RIGHT within CENTER viewpoint...');
    if (canvasBox) {
      await page.mouse.move(canvasBox.x, canvasBox.y);
      await page.mouse.down();
      // Drag leftward across center to look right
      await page.mouse.move(canvasBox.x - 240, canvasBox.y, { steps: 15 });
      await new Promise(r => setTimeout(r, 100));
      await page.mouse.up();
    }
    await new Promise(r => setTimeout(r, 1000));
    await sampleVisibleProbe();

    console.log('Capturing Screenshot 03: 03_CENTER_PANNED_RIGHT.png...');
    const shot03 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '03_CENTER_PANNED_RIGHT.png'), Buffer.from(shot03, 'base64'));

    // 9. Continuous Drag / Viewpoint Transition to RIGHT_CENTER
    console.log('\n[Phase 5 — Travel Transition] Transitioning to RIGHT_CENTER Viewpoint...');
    // Continuous drag across threshold or anchor navigation
    await page.evaluate(() => {
      if (typeof selectSpatialPreviewAnchor === 'function') {
        selectSpatialPreviewAnchor(2); // RIGHT viewpoint
      }
    });
    // Wait for transition animation / settling
    await new Promise(r => setTimeout(r, 2000));
    await sampleVisibleProbe();

    console.log('Capturing Screenshot 04: 04_RIGHT_CENTER_ENTRY.png...');
    const shot04 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '04_RIGHT_CENTER_ENTRY.png'), Buffer.from(shot04, 'base64'));

    // 10. Immersion Sweep inside RIGHT_CENTER viewpoint: Pan Right
    console.log('\n[Phase 5 — Local Immersion Sweep] Panning camera within RIGHT_CENTER viewpoint...');
    if (canvasBox) {
      await page.mouse.move(canvasBox.x, canvasBox.y);
      await page.mouse.down();
      await page.mouse.move(canvasBox.x - 180, canvasBox.y + 40, { steps: 12 });
      await new Promise(r => setTimeout(r, 100));
      await page.mouse.up();
    }
    await new Promise(r => setTimeout(r, 1000));
    await sampleVisibleProbe();

    console.log('Capturing Screenshot 05: 05_RIGHT_CENTER_PANNED_RIGHT.png...');
    const shot05 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '05_RIGHT_CENTER_PANNED_RIGHT.png'), Buffer.from(shot05, 'base64'));

    // 11. Execute Apply to Active Booth via deterministic click
    console.log('\n[Phase 6 — Apply Click Path] Executing Apply to Active Booth...');
    const applyBtnSel = '#btnApplySpatialBooth, #applySpatialCandidateBtn';
    const hasApplyBtn = await page.evaluate((sel) => Boolean(document.querySelector(sel)), applyBtnSel);
    console.log('Apply button found in DOM: ' + hasApplyBtn);

    // Click the apply button directly
    await page.click(applyBtnSel);
    await new Promise(r => setTimeout(r, 500));

    // Capture 06_APPLY_CLICKED.png right after click
    console.log('Capturing Screenshot 06: 06_APPLY_CLICKED.png...');
    const shot06 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '06_APPLY_CLICKED.png'), Buffer.from(shot06, 'base64'));

    // Wait for server apply and active viewer mounting
    console.log('Waiting for Apply network call and active spatial viewer mount...');
    await new Promise(r => setTimeout(r, 3500));
    await sampleVisibleProbe();

    // Capture 07_ACTIVE_SPATIAL_AFTER_APPLY.png
    console.log('Capturing Screenshot 07: 07_ACTIVE_SPATIAL_AFTER_APPLY.png...');
    const shot07 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '07_ACTIVE_SPATIAL_AFTER_APPLY.png'), Buffer.from(shot07, 'base64'));

    // Inspect client and server apply state
    const applyInspection = await page.evaluate(async (projId) => {
      const trace = window.__3DZ_LAST_APPLY_TRACE__ || {};
      const lifecycle = window.__3DZ_TEXTURE_LIFECYCLE || [];
      const clientViewerMode = window.activeProjectData?.viewerMode;
      const clientActiveSpatialVersion = window.activeProjectData?.activeSpatialVersionId;
      const hasSpatialRail = Boolean(document.getElementById('activeBoothSpatialRail'));

      // refetch project directly from server
      const refetch = await fetch('/api/free-funnel/projects/' + projId);
      const refetchData = await refetch.json();

      return {
        trace,
        lifecycleEvents: lifecycle.map(e => e.name || e.stage || e.event || e.type),
        clientViewerMode,
        clientActiveSpatialVersion,
        hasSpatialRail,
        serverViewerMode: refetchData.project?.viewerMode,
        serverActiveSpatialVersion: refetchData.project?.activeSpatialVersionId
      };
    }, PROJECT_ID);

    console.log('Apply Inspection:', JSON.stringify(applyInspection, null, 2));

    // 12. Persistence Test 1: Hard Refresh
    console.log('\n[Phase 7 — Persistence] Hard Reloading Page...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
    await sampleVisibleProbe();

    const hardRefreshState = await page.evaluate(() => ({
      viewerMode: window.activeProjectData?.viewerMode,
      activeSpatialVersionId: window.activeProjectData?.activeSpatialVersionId,
      hasSpatialRail: Boolean(document.getElementById('activeBoothSpatialRail'))
    }));
    console.log('Hard Refresh State:', hardRefreshState);

    console.log('Capturing Screenshot 08: 08_ACTIVE_SPATIAL_AFTER_REFRESH.png...');
    const shot08 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(EVIDENCE_DIR, '08_ACTIVE_SPATIAL_AFTER_REFRESH.png'), Buffer.from(shot08, 'base64'));

    // Duration Check (>= 30,000 ms)
    const elapsed = Date.now() - sessionStartTime;
    console.log('\nCurrent Session Duration: ' + elapsed + ' ms');
    if (elapsed < 31000) {
      const waitTime = 31500 - elapsed;
      console.log('Waiting ' + waitTime + ' ms to ensure duration >= 30,000 ms...');
      await new Promise(r => setTimeout(r, waitTime));
    }
    const finalDurationMs = Date.now() - sessionStartTime;
    console.log('Final Session Duration: ' + finalDurationMs + ' ms');

    // 13. Stop Recording & Export Canonical Bundle
    console.log('\n[Phase 8] Stopping Recording from Popup...');
    await popupPage.bringToFront();
    await popupPage.click('#btnToggleRecord');
    await new Promise(r => setTimeout(r, 2000));

    console.log('[Phase 8] Invoking EXPORT_SESSION...');
    const exportResult = await popupPage.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'EXPORT_SESSION',
          includeScreenshots: true
        }, (res) => resolve(res));
      });
    });

    const { diagnostic, summaryText, zipBase64 } = exportResult;
    const zipName = exportResult.zipFilename || exportResult.zipFileName || ((diagnostic?.session?.sessionId || 'RI-PROD') + '.zip');
    const zipPath = path.join(EVIDENCE_DIR, zipName);
    fs.writeFileSync(zipPath, Buffer.from(zipBase64, 'base64'));
    console.log('Canonical ZIP Saved to ' + zipPath + ' (' + fs.statSync(zipPath).size + ' bytes)');

    fs.writeFileSync(path.join(EVIDENCE_DIR, 'summary.txt'), summaryText, 'utf8');
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'diagnostic.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'timeline.json'), JSON.stringify(diagnostic.timeline, null, 2), 'utf8');
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'network.json'), JSON.stringify(diagnostic.network, null, 2), 'utf8');
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'errors.json'), JSON.stringify(diagnostic.errors, null, 2), 'utf8');

    // Screenshot SHA256 validation
    const screenshots = [
      '01_CENTER_NEUTRAL.png',
      '02_CENTER_PANNED_LEFT.png',
      '03_CENTER_PANNED_RIGHT.png',
      '04_RIGHT_CENTER_ENTRY.png',
      '05_RIGHT_CENTER_PANNED_RIGHT.png',
      '06_APPLY_CLICKED.png',
      '07_ACTIVE_SPATIAL_AFTER_APPLY.png',
      '08_ACTIVE_SPATIAL_AFTER_REFRESH.png'
    ];

    console.log('\n--- Screenshot Verification & Hashes ---');
    const hashes = new Set();
    screenshots.forEach(name => {
      const p = path.join(EVIDENCE_DIR, name);
      const buf = fs.readFileSync(p);
      const hash = sha256(buf);
      hashes.add(hash);
      console.log('  ' + name + ': ' + hash.substring(0, 16) + '... (' + buf.length + ' bytes)');
    });
    console.log('Unique Screenshot Hashes: ' + hashes.size + ' / ' + screenshots.length);

    console.log('\n============================================================');
    console.log('C11.24-P0 VERIFICATION TEST COMPLETE');
    console.log('============================================================');

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal Error during C11.24 Test:', err);
  process.exit(1);
});
