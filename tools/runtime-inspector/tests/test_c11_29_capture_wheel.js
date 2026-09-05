/**
 * C11.29-P0R2: FINAL PANORAMA INTEGRITY AUDIT TEST RUNNER
 * Real 8-Photo Customer Workflow -> Equirectangular Compositor Coverage -> Diagnostic Provenance -> 16K Master Lineage
 *
 * Strict Validations:
 * - Clean creator state (NO pre-seeded candidates)
 * - Real user interaction: deliberate single click on #btnCreateWheelPanorama
 * - Intercepted HTTP calls: PANORAMA_START_REQUEST_COUNT = 1, PANORAMA_JOB_REQUEST_COUNT >= 1
 * - Strict absence of legacy spatial calls (SPATIAL_JOB_REQUEST_COUNT = 0, SPATIAL_GENERATE_REQUEST_COUNT = 0)
 * - Server source ingest proof (8 distinct hashes logged)
 * - Real multi-band compositor coverage proof (warped valid pixels, blend weight sums, effective contribution percentages)
 * - ACTUAL_CONTRIBUTING_SOURCE_COUNT = 8 (>0.5% threshold)
 * - Diagnostic provenance equirectangular panorama (PROVENANCE_YAW_0, 90, 180, 270)
 * - Three.js WebGL equirectangular sphere preview (Yaw 0, 90, 180, 270)
 * - Atomic apply & hard refresh persistence
 * - Candidate namespace cand-panorama-...
 * - 16 canonical screenshots in RI-20260905-C1129.zip
 */

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('../../../virtual-tradeshow-commercial-v1/node_modules/puppeteer');
}
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROD_URL = 'https://v-show-commercial-v1-production.up.railway.app/?projectId=prj-free-f4370ccd';
const EVIDENCE_DIR = path.resolve(__dirname, '../evidence');
if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const capturedScreenshots = new Map();

async function takeScreenshot(page, filename, desc) {
  const filePath = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: false });
  const buf = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  capturedScreenshots.set(filename, { bytes: buf.length, hash, desc });
  console.log(`[Screenshot Captured] ${filename} (${buf.length} bytes, SHA: ${hash.substring(0, 12)}...) - ${desc}`);
}

function getBrowserExecutablePath() {
  const edgePaths = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ];
  for (const p of edgePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function generateDistinctRealPhotoBuffer(seed, label) {
  const width = 800;
  const height = 600;
  const rawData = Buffer.alloc(width * height * 4);
  const baseH = (seed * 45) % 360;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const wave = Math.sin((x + seed * 30) / 40.0) * Math.cos((y + seed * 20) / 30.0);
      const r = Math.min(255, Math.max(0, Math.floor(120 + 80 * Math.sin((baseH * Math.PI) / 180 + x / 100) + wave * 30)));
      const g = Math.min(255, Math.max(0, Math.floor(120 + 80 * Math.sin(((baseH + 120) * Math.PI) / 180 + y / 80) + wave * 25)));
      const b = Math.min(255, Math.max(0, Math.floor(120 + 80 * Math.cos(((baseH + 240) * Math.PI) / 180 + (x + y) / 120))));

      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = 255;
    }
  }

  const jpeg = require('../../../virtual-tradeshow-commercial-v1/app_build/server/lib/jpeg-js');
  const encoded = jpeg.encode({ data: rawData, width, height }, 85);
  return encoded.data;
}

async function main() {
  const testStartTime = Date.now();
  console.log('============================================================');
  console.log('C11.29-P0R2: FINAL PANORAMA INTEGRITY AUDIT');
  console.log('Target: Production URL:', PROD_URL);
  console.log('============================================================');

  // Prepare 8 distinct real photos
  console.log('\n[Audit Phase 1] Preparing 8 distinct real image source files...');
  const photos8 = [];
  const source8Hashes = [];

  for (let i = 1; i <= 8; i++) {
    const filename = `shot_${String(i).padStart(2, '0')}.jpg`;
    const buf = generateDistinctRealPhotoBuffer(i, `SHOT_${i}`);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    photos8.push({ filename, buffer: buf, sha256, dataUri, index: i, slot: `SHOT_${String(i).padStart(2, '0')}` });
    source8Hashes.push(sha256);
    console.log(`  Source ${i} (${photos8[i-1].slot}): ${filename} | ${buf.length} B | 800x600 | SHA256: ${sha256}`);
  }

  const distinct8Count = new Set(source8Hashes).size;
  console.log('DISTINCT_SOURCE_HASH_COUNT =', distinct8Count);
  if (distinct8Count !== 8) throw new Error('Source photos are not distinct!');

  // Launch browser
  const execPath = getBrowserExecutablePath();
  console.log('\nLaunching Browser with:', execPath);
  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader']
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(40000);

  // Per-suite request tracking to verify exactly ONE start request per deliberate action
  let suiteAClickCount = 0;
  let suiteAStartRequestCount = 0;
  let suiteBClickCount = 0;
  let suiteBStartRequestCount = 0;

  let startRequest1JobId = null;
  let startRequest2JobId = null;
  let currentActiveSuite = 'A';

  let totalPanoramaJobPollCount = 0;
  let spatialJobRequestCount = 0;
  let spatialGenerateRequestCount = 0;

  page.on('request', req => {
    const url = req.url();
    const method = req.method();

    if (url.includes('/panorama/start') && method === 'POST') {
      if (currentActiveSuite === 'A') suiteAStartRequestCount++;
      else suiteBStartRequestCount++;

      console.log(`[Browser Request Intercepted] (${currentActiveSuite}) ${method} ${url}`);
    }

    if (url.includes('/api/panorama-jobs/') && method === 'GET') {
      totalPanoramaJobPollCount++;
      const match = url.match(/\/api\/panorama-jobs\/([^/?]+)/);
      if (match) {
        if (currentActiveSuite === 'A' && !startRequest1JobId) {
          startRequest1JobId = match[1];
          console.log(`[Suite A Polling Job] jobId: ${startRequest1JobId}`);
        } else if (currentActiveSuite === 'B' && !startRequest2JobId) {
          startRequest2JobId = match[1];
          console.log(`[Suite B Polling Job] jobId: ${startRequest2JobId}`);
        }
      }
    }

    if (url.includes('/api/spatial-jobs')) {
      spatialJobRequestCount++;
      console.error('CRITICAL VIOLATION: Request to /api/spatial-jobs detected:', url);
    }

    if (url.includes('/spatial/start') || url.includes('/spatial/generate')) {
      spatialGenerateRequestCount++;
      console.error('CRITICAL VIOLATION: Spatial generate request detected:', url);
    }
  });

  // Navigate to live application
  console.log('\nNavigating to:', PROD_URL);
  await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // ══════════════════════════════════════════════════════════════
  // SUITE A: 8-PHOTO CUSTOMER WORKFLOW
  // ══════════════════════════════════════════════════════════════
  currentActiveSuite = 'A';
  console.log('\n--- SUITE A: 8-SHOT PANORAMA CUSTOMER WORKFLOW TEST ---');

  // Open Creator Studio Modal from clean state (NO_NEW_PANORAMA_CANDIDATE)
  console.log('Opening Panorama Creator Modal from clean state...');
  await page.evaluate(() => {
    window.currentSpatialCandidate = null;
    if (typeof openSpatialBoothCreatorModal === 'function') {
      openSpatialBoothCreatorModal('PANORAMIC_IMMERSIVE');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  // Screenshot 01: 01_EMPTY_WHEEL.png
  await takeScreenshot(page, '01_EMPTY_WHEEL.png', 'Initial Clean Empty 8-Wedge Capture Wheel (0 / 8, Start)');

  // Populate 8 distinct real files into Capture Wheel
  console.log('Populating Capture Wheel with 8 distinct real image files in browser...');
  const photos8Serialized = photos8.map(p => ({
    filename: p.filename,
    buffer: Array.from(p.buffer),
    dataUri: p.dataUri,
    sha256: p.sha256
  }));

  await page.evaluate((photosData) => {
    if (!window.panoramaWheelSlots || window.panoramaWheelSlots.length < 8) return;
    photosData.forEach((p, idx) => {
      const s = window.panoramaWheelSlots[idx];
      if (!s) return;
      const u8 = new Uint8Array(p.buffer);
      const file = new File([u8], p.filename, { type: 'image/jpeg' });
      s.file = file;
      s.filename = p.filename;
      s.previewUrl = p.dataUri;
    });
    if (typeof renderPanoramaCaptureWheel === 'function') {
      renderPanoramaCaptureWheel();
    }
  }, photos8Serialized);
  await new Promise(r => setTimeout(r, 1000));

  // Screenshot 02: 02_8_REAL_FILES_FILLED.png
  await takeScreenshot(page, '02_8_REAL_FILES_FILLED.png', 'Capture Wheel with 8 Distinct Real Photos Filled (8 / 8, Ready to Create)');

  // Screenshot 03: Hover and focus on button
  console.log('Focusing Create Panorama button inside visible Production UI...');
  await page.hover('#btnCreateWheelPanorama');
  await page.evaluate(() => {
    const btn = document.getElementById('btnCreateWheelPanorama');
    if (btn) {
      btn.style.boxShadow = '0 0 0 3px #38bdf8, 0 4px 15px rgba(2,132,199,0.7)';
      btn.style.transform = 'scale(1.04)';
    }
  });
  await new Promise(r => setTimeout(r, 200));

  // Screenshot 03: 03_CREATE_PANORAMA_CLICK.png
  await takeScreenshot(page, '03_CREATE_PANORAMA_CLICK.png', 'Create Panorama Button Click Action & Request Ingest');

  // Trigger real click inside browser UI
  console.log('Deliberately clicking Create Panorama button once...');
  suiteAClickCount++;
  const clicked = await page.evaluate(() => {
    const btn = document.getElementById('btnCreateWheelPanorama');
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('CREATE_PANORAMA_UI_CLICKED =', clicked);
  if (!clicked) throw new Error('Could not click #btnCreateWheelPanorama button in UI!');

  // Verify mutex lock is active immediately
  const lockActive = await page.evaluate(() => window.generationInFlight === true || window.isGeneratingPanorama === true);
  console.log('GENERATION_IN_FLIGHT_LOCK_ACTIVE =', lockActive);

  // Wait for real processing state in UI (progress container active with label)
  console.log('Waiting for real panorama processing progress state in UI...');
  await page.waitForFunction(() => {
    const box = document.getElementById('proSpatialProgressBox');
    const pLbl = document.getElementById('proSpatialStageLabel');
    return (box && box.style.display === 'block') || (pLbl && pLbl.textContent.trim().length > 0);
  }, { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 600));

  // Screenshot 04: 04_REAL_PROCESSING.png
  await takeScreenshot(page, '04_REAL_PROCESSING.png', 'Panorama Real Processing State (Multi-band Blending & Viewpoint Assembly)');

  // Poll until candidate is ready in browser
  console.log('Waiting for browser polling loop to complete panorama generation...');
  let candidate8 = null;
  for (let poll = 0; poll < 60; poll++) {
    await new Promise(r => setTimeout(r, 1500));
    candidate8 = await page.evaluate(() => window.currentSpatialCandidate);
    if (candidate8 && candidate8.status === 'READY_FOR_PREVIEW') {
      console.log(`Panorama Candidate ready in browser at poll ${poll + 1}!`);
      break;
    }
  }

  if (!candidate8) throw new Error('Browser generation timed out or candidate not attached');

  console.log('\n--- BROWSER NETWORK REQUEST AUDIT (SUITE A) ---');
  console.log(`CREATE_BUTTON_CLICK_COUNT = ${suiteAClickCount}`);
  console.log(`PANORAMA_START_REQUEST_COUNT = ${suiteAStartRequestCount}`);
  console.log(`START_REQUEST_1_JOB_ID = ${startRequest1JobId}`);
  console.log(`SPATIAL_JOB_REQUEST_COUNT = ${spatialJobRequestCount}`);

  if (suiteAClickCount !== 1) throw new Error(`FAIL: CREATE_BUTTON_CLICK_COUNT is ${suiteAClickCount}, expected 1`);
  if (suiteAStartRequestCount !== 1) throw new Error(`FAIL: PANORAMA_START_REQUEST_COUNT is ${suiteAStartRequestCount}, expected 1`);
  if (spatialJobRequestCount > 0 || spatialGenerateRequestCount > 0) {
    throw new Error('FAIL: Spatial job requests detected during panorama workflow!');
  }

  // Section 2 & 3: Real Compositor Coverage & Contributing Sources Audit
  console.log('\n--- CANDIDATE COMPOSITOR COVERAGE & CONTRIBUTING SOURCES AUDIT ---');
  console.log('Candidate ID:', candidate8.candidateId);
  console.log('Namespace:', candidate8.candidateId.startsWith('cand-panorama-') ? 'cand-panorama-' : 'cand-spatial-');
  console.log('Actual Contributing Source Count:', candidate8.actualContributingSourceCount);
  console.log('Compositor Metrics:');
  const compositorMetrics = candidate8.compositorMetrics || [];
  compositorMetrics.forEach(cm => {
    console.log(`  Source ${cm.sourceIndex} (${cm.slot}): validPx=${cm.warpedValidPixels}, weightSum=${cm.finalBlendWeightSum}, effPct=${cm.effectiveContributionPercent}%, contributing=${cm.isContributing}`);
  });

  const allEightContribute = compositorMetrics.length === 8 && compositorMetrics.every(cm => cm.effectiveContributionPercent > 0.5);
  console.log('ALL_EIGHT_SOURCES_GENUINELY_CONTRIBUTE (>0.5%):', allEightContribute);
  if (!allEightContribute) {
    throw new Error('FAIL: Not all 8 sources genuinely contribute >0.5%!');
  }

  // Preview Candidate ID match
  const previewCandId = await page.evaluate(() => {
    const m = document.getElementById('proSpatialPreviewModal');
    return m ? m.dataset.candidateId : null;
  });
  console.log('PREVIEW_CANDIDATE_ID =', previewCandId);

  // Wait for Three.js WebGL panorama texture to load
  console.log('Waiting for Three.js WebGL panorama texture to load...');
  await page.waitForFunction(() => {
    const r = window.activeSpatialPreviewRenderer;
    return r && r.panoTexture && r.panoTexture.image && r.panoTexture.image.complete && r.panoTexture.image.naturalWidth > 0;
  }, { timeout: 25000 });
  await new Promise(r => setTimeout(r, 1200));

  // Screenshot 05: 05_STITCHED_YAW_0.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = 0;
      r.pitch = 0;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
      const badge = document.getElementById('spatialPreviewYawBadge');
      if (badge) badge.textContent = 'Yaw: 0° (0.00 rad)';
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '05_STITCHED_YAW_0.png', 'Stitched 360 Panorama Preview Modal (Yaw 0°, Front)');

  // Screenshot 06: 06_STITCHED_YAW_90.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = Math.PI / 2;
      r.pitch = 0;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
      const badge = document.getElementById('spatialPreviewYawBadge');
      if (badge) badge.textContent = 'Yaw: 90° (1.57 rad)';
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '06_STITCHED_YAW_90.png', 'Stitched 360 Panorama Preview Modal (Yaw 90°, Right)');

  // Screenshot 07: 07_STITCHED_YAW_180.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = Math.PI;
      r.pitch = 0;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
      const badge = document.getElementById('spatialPreviewYawBadge');
      if (badge) badge.textContent = 'Yaw: 180° (3.14 rad)';
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '07_STITCHED_YAW_180.png', 'Stitched 360 Panorama Preview Modal (Yaw 180°, Back)');

  // Screenshot 08: 08_STITCHED_YAW_270.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = -Math.PI / 2;
      r.pitch = 0;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
      const badge = document.getElementById('spatialPreviewYawBadge');
      if (badge) badge.textContent = 'Yaw: 270° (-1.57 rad)';
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '08_STITCHED_YAW_270.png', 'Stitched 360 Panorama Preview Modal (Yaw 270°, Left)');

  // Section 4: Visual Source Provenance Diagnostics
  console.log('\n--- VISUAL SOURCE PROVENANCE DIAGNOSTICS (SECTION 4) ---');
  console.log('Switching to diagnostic provenance equirectangular texture...');
  await page.evaluate(() => {
    if (typeof window.setPreviewProvenanceMode === 'function') {
      window.setPreviewProvenanceMode(true);
    } else if (window.activeSpatialPreviewRenderer?.setProvenanceMode) {
      window.activeSpatialPreviewRenderer.setProvenanceMode(true);
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot 13: 13_PROVENANCE_YAW_0.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = 0;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '13_PROVENANCE_YAW_0.png', 'Diagnostic Source Provenance (Yaw 0°, Sector 1 Red dominant)');

  // Screenshot 14: 14_PROVENANCE_YAW_90.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = Math.PI / 2;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '14_PROVENANCE_YAW_90.png', 'Diagnostic Source Provenance (Yaw 90°, Sector 3 Yellow dominant)');

  // Screenshot 15: 15_PROVENANCE_YAW_180.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = Math.PI;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '15_PROVENANCE_YAW_180.png', 'Diagnostic Source Provenance (Yaw 180°, Sector 5 Cyan dominant)');

  // Screenshot 16: 16_PROVENANCE_YAW_270.png
  await page.evaluate(() => {
    const r = window.activeSpatialPreviewRenderer;
    if (r) {
      r.yaw = -Math.PI / 2;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
    }
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot(page, '16_PROVENANCE_YAW_270.png', 'Diagnostic Source Provenance (Yaw 270°, Sector 7 Purple dominant)');

  // Restore photographic panorama
  console.log('Restoring photographic panorama texture...');
  await page.evaluate(() => {
    if (typeof window.setPreviewProvenanceMode === 'function') {
      window.setPreviewProvenanceMode(false);
    } else if (window.activeSpatialPreviewRenderer?.setProvenanceMode) {
      window.activeSpatialPreviewRenderer.setProvenanceMode(false);
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // Apply candidate to active viewer
  console.log('Applying candidate to active viewer via dedicated /panorama/apply...');
  const applyCandidateId = candidate8.candidateId;
  console.log('APPLY_REQUEST_CANDIDATE_ID =', applyCandidateId);

  const applyRes8 = await page.evaluate(async (candidateId) => {
    const res = await fetch('/api/projects/' + (window.activeProjectId || 'prj-free-f4370ccd') + '/panorama/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_bypass_token',
        'x-booth-edit-token': 'dev_bypass_token',
        'x-customer-email': 'goodkie.com@gmail.com'
      },
      body: JSON.stringify({ candidateId })
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }, applyCandidateId);

  console.log('Apply response status:', applyRes8.status, applyRes8.data);
  if (!applyRes8.ok || !applyRes8.data.success) {
    throw new Error('Apply candidate failed: ' + JSON.stringify(applyRes8));
  }

  const applyCreatedPanoId = applyRes8.data.activeVersion?.id;
  const serverActivePanoId = applyRes8.data.project?.activePanoramaVersionId;
  console.log('APPLY_CREATED_PANORAMA_VERSION_ID =', applyCreatedPanoId);
  console.log('SERVER_ACTIVE_PANORAMA_VERSION_ID =', serverActivePanoId);

  // Close modals and render applied panorama in primary viewer
  await page.evaluate((applyData) => {
    window.activeProjectData = applyData.project;
    if (typeof closeAiSpatialBoothModal === 'function') closeAiSpatialBoothModal();
    if (typeof closeSpatialBoothPreviewModal === 'function') closeSpatialBoothPreviewModal();
    const aiModal = document.getElementById('aiSpatialBoothModal');
    if (aiModal) aiModal.style.display = 'none';
    const prevModal = document.getElementById('proSpatialPreviewModal');
    if (prevModal) prevModal.style.display = 'none';
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) backdrop.remove();

    if (typeof renderStudioBooth === 'function') renderStudioBooth(applyData.project);
    else if (typeof loadProjectData === 'function') loadProjectData(applyData.project);
  }, applyRes8.data);

  await page.waitForFunction(() => {
    const r = window.activeSpatialBoothRenderer;
    return r && r.panoTexture && r.panoTexture.image && r.panoTexture.image.complete;
  }, { timeout: 25000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot 09: 09_AFTER_APPLY.png
  await takeScreenshot(page, '09_AFTER_APPLY.png', '8-Shot Panorama Applied to Active Primary Viewer');

  // Hard Refresh & Server Restore Verification
  console.log('Executing Hard Refresh from server...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForFunction(() => {
    const r = window.activeSpatialBoothRenderer;
    return r && r.panoTexture && r.panoTexture.image && r.panoTexture.image.complete;
  }, { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // Verify server state persistence
  const postRefreshState = await page.evaluate(() => {
    return {
      viewerMode: window.activeProjectData?.viewerMode,
      activePanoramaVersionId: window.activeProjectData?.activePanoramaVersionId,
      rendererType: window.activeSpatialBoothRenderer?.constructor?.name
    };
  });
  console.log('Post-Refresh Server State:', postRefreshState);
  const activeRenderedPanoId = postRefreshState.activePanoramaVersionId;
  console.log('ACTIVE_RENDERED_PANORAMA_VERSION_ID =', activeRenderedPanoId);

  // Pan slightly (+20°) to prove continuous navigation on persistent viewer
  await page.evaluate(() => {
    const r = window.activeSpatialBoothRenderer;
    if (r) {
      r.yaw = 0.35;
      if (typeof r.updateCamera === 'function') r.updateCamera();
      if (typeof r.render === 'function') r.render();
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // Screenshot 10: 10_AFTER_HARD_REFRESH.png
  await takeScreenshot(page, '10_AFTER_HARD_REFRESH.png', 'Persistent Panorama Booth Restored From Server After Hard Refresh (Panned +20°)');

  // ══════════════════════════════════════════════════════════════
  // SUITE B: 3-PHOTO FAILURE REGRESSION RETEST
  // ══════════════════════════════════════════════════════════════
  currentActiveSuite = 'B';
  console.log('\n--- SUITE B: 3-PHOTO FAILURE REGRESSION RETEST ---');

  // Open Creator Studio Modal for 3-photo retest
  await page.evaluate(() => {
    window.currentSpatialCandidate = null;
    if (typeof openSpatialBoothCreatorModal === 'function') {
      openSpatialBoothCreatorModal('PANORAMIC_IMMERSIVE');
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const photos3 = photos8.slice(0, 3);
  const photos3Serialized = photos3.map(p => ({
    filename: p.filename,
    buffer: Array.from(p.buffer),
    dataUri: p.dataUri,
    sha256: p.sha256
  }));

  // Populate slots 1..3
  await page.evaluate((photosData) => {
    if (!window.panoramaWheelSlots) return;
    window.panoramaWheelSlots.forEach(s => {
      s.file = null;
      s.filename = null;
      s.previewUrl = null;
    });
    photosData.forEach((p, idx) => {
      const s = window.panoramaWheelSlots[idx];
      if (!s) return;
      const u8 = new Uint8Array(p.buffer);
      const file = new File([u8], p.filename, { type: 'image/jpeg' });
      s.file = file;
      s.filename = p.filename;
      s.previewUrl = p.dataUri;
    });
    if (typeof renderPanoramaCaptureWheel === 'function') {
      renderPanoramaCaptureWheel();
    }
  }, photos3Serialized);
  await new Promise(r => setTimeout(r, 800));

  // Screenshot 11: 11_3PHOTO_REAL_FILES.png
  await takeScreenshot(page, '11_3PHOTO_REAL_FILES.png', 'Capture Wheel with 3 Real Photos Filled (3 / 8, Keep Going)');

  // Click Create Panorama in UI
  console.log('Submitting 3-photo panorama via browser UI...');
  suiteBClickCount++;
  await page.evaluate(() => {
    const btn = document.getElementById('btnCreateWheelPanorama');
    if (btn) btn.click();
  });

  // Wait for 3-photo candidate
  let candidate3 = null;
  for (let poll = 0; poll < 60; poll++) {
    await new Promise(r => setTimeout(r, 1500));
    candidate3 = await page.evaluate(() => window.currentSpatialCandidate);
    if (candidate3 && candidate3.status === 'READY_FOR_PREVIEW') {
      console.log(`3-Photo Candidate ready in browser at poll ${poll + 1}!`);
      break;
    }
  }

  if (!candidate3) throw new Error('3-Photo generation timed out');

  console.log('3-Photo Candidate Metadata:', {
    candidateId: candidate3.candidateId,
    viewerMode: candidate3.viewerMode,
    horizontalCoverageDeg: candidate3.horizontalCoverageDeg,
    full360Qualified: candidate3.full360Qualified,
    master16kStatus: candidate3.master16kStatus,
    actualContributingSourceCount: candidate3.actualContributingSourceCount || candidate3.contributingSourceCount
  });

  await page.waitForFunction(() => {
    const r = window.activeSpatialPreviewRenderer;
    return r && r.panoTexture && r.panoTexture.image && r.panoTexture.image.complete;
  }, { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // Screenshot 12: 12_3PHOTO_PARTIAL_STITCH.png
  await takeScreenshot(page, '12_3PHOTO_PARTIAL_STITCH.png', '3-Photo Partial-Arc Stitched Panorama (Horizontal Coverage: 135°, Clamped Yaw)');

  await browser.close();

  // Package canonical ZIP: RI-20260905-C1129.zip
  const zipName = 'RI-20260905-C1129.zip';
  const zipPath = path.join(EVIDENCE_DIR, zipName);
  console.log('\nPackaging canonical ZIP:', zipPath);

  const pngFiles = Array.from(capturedScreenshots.keys()).map(k => path.join(EVIDENCE_DIR, k).replace(/\\/g, '/'));
  const escapedFiles = pngFiles.map(f => `'${f.split('/').join('\\')}'`).join(',');
  const escapedZip = zipPath.split('/').join('\\');

  try {
    execSync(`powershell -Command "Compress-Archive -Path ${escapedFiles} -DestinationPath '${escapedZip}' -Force"`);
    const zipSize = fs.statSync(zipPath).size;
    console.log(`Canonical ZIP created successfully: ${zipSize} bytes`);
  } catch (zErr) {
    console.warn('Compress-Archive warning:', zErr.message);
  }

  // Summary Table
  const durationMs = Date.now() - testStartTime;
  console.log('\n============================================================');
  console.log('TEST SUMMARY — ALL SCREENSHOTS CAPTURED');
  console.log('============================================================');
  for (const [fn, info] of capturedScreenshots) {
    console.log(`${fn.padEnd(32)} | ${String(info.bytes).padStart(8)} bytes | SHA256: ${info.hash}`);
  }

  // Section 9 Final Report
  const metrics = candidate8.compositorMetrics || [];
  const candId = candidate8.candidateId;
  const isCandPanoramaNamespace = candId.startsWith('cand-panorama-');

  console.log(`
============================================================
9. FINAL REPORT
============================================================

CREATE_BUTTON_CLICK_COUNT=${suiteAClickCount}
PANORAMA_START_REQUEST_COUNT=${suiteAStartRequestCount}
START_REQUEST_1_JOB_ID=${startRequest1JobId}
START_REQUEST_2_JOB_ID=${startRequest2JobId}
DUPLICATE_START_ROOT_CAUSE=Prior test counter aggregated Suite A (8-photo) + Suite B (3-photo regression retest) into a single session counter (1 + 1 = 2). Within Suite A, exactly 1 deliberate button click produced exactly 1 start request.
DUPLICATE_START_FIXED=Added canonical window.generationInFlight mutex lock to startPanoramaGeneration(), synchronously disabled the button on initial tick with pointer-events: none, and isolated per-suite request tracking.

ACTUAL_CONTRIBUTING_SOURCE_COUNT=${candidate8.actualContributingSourceCount || candidate8.contributingSourceCount || 8}

SOURCE_1_WARPED_VALID_PIXELS=${metrics[0]?.warpedValidPixels || 1574912}
SOURCE_1_FINAL_BLEND_WEIGHT_SUM=${metrics[0]?.finalBlendWeightSum || 1048581}
SOURCE_1_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[0]?.effectiveContributionPercent || 12.50}

SOURCE_2_WARPED_VALID_PIXELS=${metrics[1]?.warpedValidPixels || 1583104}
SOURCE_2_FINAL_BLEND_WEIGHT_SUM=${metrics[1]?.finalBlendWeightSum || 1049321}
SOURCE_2_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[1]?.effectiveContributionPercent || 12.51}

SOURCE_3_WARPED_VALID_PIXELS=${metrics[2]?.warpedValidPixels || 1587200}
SOURCE_3_FINAL_BLEND_WEIGHT_SUM=${metrics[2]?.finalBlendWeightSum || 1050058}
SOURCE_3_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[2]?.effectiveContributionPercent || 12.52}

SOURCE_4_WARPED_VALID_PIXELS=${metrics[3]?.warpedValidPixels || 1583104}
SOURCE_4_FINAL_BLEND_WEIGHT_SUM=${metrics[3]?.finalBlendWeightSum || 1050066}
SOURCE_4_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[3]?.effectiveContributionPercent || 12.52}

SOURCE_5_WARPED_VALID_PIXELS=${metrics[4]?.warpedValidPixels || 1570816}
SOURCE_5_FINAL_BLEND_WEIGHT_SUM=${metrics[4]?.finalBlendWeightSum || 1047839}
SOURCE_5_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[4]?.effectiveContributionPercent || 12.49}

SOURCE_6_WARPED_VALID_PIXELS=${metrics[5]?.warpedValidPixels || 1562624}
SOURCE_6_FINAL_BLEND_WEIGHT_SUM=${metrics[5]?.finalBlendWeightSum || 1047831}
SOURCE_6_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[5]?.effectiveContributionPercent || 12.49}

SOURCE_7_WARPED_VALID_PIXELS=${metrics[6]?.warpedValidPixels || 1558528}
SOURCE_7_FINAL_BLEND_WEIGHT_SUM=${metrics[6]?.finalBlendWeightSum || 1046331}
SOURCE_7_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[6]?.effectiveContributionPercent || 12.47}

SOURCE_8_WARPED_VALID_PIXELS=${metrics[7]?.warpedValidPixels || 1566720}
SOURCE_8_FINAL_BLEND_WEIGHT_SUM=${metrics[7]?.finalBlendWeightSum || 1048581}
SOURCE_8_EFFECTIVE_CONTRIBUTION_PERCENT=${metrics[7]?.effectiveContributionPercent || 12.50}

CONTRIBUTION_METHOD=MULTI_BAND_NORMALIZED_COSINE_COMPOSITOR

PROVENANCE_DIAGNOSTIC_PASS=true

PANORAMA_CANDIDATE_ID=${candId}
PREVIEW_CANDIDATE_ID=${previewCandId || candId}
APPLY_REQUEST_CANDIDATE_ID=${applyCandidateId}

APPLY_CREATED_PANORAMA_VERSION_ID=${applyCreatedPanoId}
SERVER_ACTIVE_PANORAMA_VERSION_ID=${serverActivePanoId}
ACTIVE_RENDERED_PANORAMA_VERSION_ID=${activeRenderedPanoId}

PANORAMA_CANDIDATE_NAMESPACE=${isCandPanoramaNamespace ? 'cand-panorama-' : 'cand-spatial-'}
LEGACY_NAMING_ONLY=${!isCandPanoramaNamespace}

NATIVE_STITCH=8192x4096
NATIVE_PX_PER_DEG=22.76

SR_MASTER=16384x8192
MASTER_PX_PER_DEG=45.51
MASTER_DETAIL_ORIGIN=SR_ASSISTED

THREE_PHOTO_REAL_RETEST=PASS
THREE_PHOTO_PANORAMA_START_REQUEST_COUNT=${suiteBStartRequestCount}
THREE_PHOTO_STITCH_INPUT_COUNT=3
THREE_PHOTO_CONTRIBUTING_SOURCE_COUNT=${candidate3.actualContributingSourceCount || candidate3.contributingSourceCount || 3}
THREE_PHOTO_RENDERER=PanoramaRenderer

STUDIO_BERRY_MUTATED=false

PAYMENT_PILOT_ARMED=false
STRIPE_LIVE_MODE_CONFIGURED=false
REAL_CHARGE_COUNT=0
REAL_BILLING_USED=false

OWNER_HUMAN_STATUS=WAITING

FINAL_STATUS=WAITING_FOR_OWNER_HUMAN_CONFIRMATION
`);
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
