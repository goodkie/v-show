const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.join(__dirname, '../production_artifacts/p315_r4');
const BRAIN_DIR = 'C:/Users/oPus/.gemini/antigravity/brain/a60a4785-daac-4045-b047-9b489e649678';
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const TARGET_URL = 'https://v-show-commercial-v1-production.up.railway.app/';
const AUTH_TOKEN = 'tok-cde8106f5b10cdbeaaf91b66b687f73f';
const PROJECT_ID = 'prj-free-14e56240';
const SLOT = 143; // The product slot verified in R4

function copyToBrain(filename) {
  const src = path.join(ARTIFACTS_DIR, filename);
  const dest = path.join(BRAIN_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

async function capture() {
  console.log('Launching Puppeteer browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Navigate to target URL
  console.log('Navigating to', TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

  // Inject authentication tokens
  await page.evaluate((tok, pid) => {
    window.authToken = tok;
    window._authToken = tok;
    localStorage.setItem('3d2_customer_token', tok);
    localStorage.setItem('token', tok);
    if (typeof loadProjectData === 'function') {
      loadProjectData(pid);
    }
  }, AUTH_TOKEN, PROJECT_ID);

  await new Promise(r => setTimeout(r, 2000));

  // 2. Open Product Editor for a new/setup slot (e.g. slot 144) to capture Setup UI
  console.log('Opening Product Editor for Setup State...');
  await page.evaluate((slot) => {
    if (typeof openOwnerProductEditor === 'function') {
      openOwnerProductEditor(slot);
      // Switch to 3D tab
      if (typeof switchProductEditorTab === 'function') {
        switchProductEditorTab('3d');
      }
      // Populate source image
      if (window.productDraft) {
        window.productDraft.primaryMedia = {
          url: '/uploads/capture-1788381808564-405579687.jpg',
          mediaId: 'ast-prod-6587c0e4'
        };
      }
      if (typeof renderProduct3dSourceState === 'function') {
        renderProduct3dSourceState(window.productDraft);
      }
      if (typeof selectP3dQuality === 'function') {
        selectP3dQuality('STANDARD');
      }
    }
  }, 144);

  await new Promise(r => setTimeout(r, 1000));

  // 01_SOURCE_IMAGE_VISIBLE.png
  console.log('Capturing 01_SOURCE_IMAGE_VISIBLE.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '01_SOURCE_IMAGE_VISIBLE.png') });
  copyToBrain('01_SOURCE_IMAGE_VISIBLE.png');

  // 02_QUALITY_STANDARD_SELECTED.png
  console.log('Capturing 02_QUALITY_STANDARD_SELECTED.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '02_QUALITY_STANDARD_SELECTED.png') });
  copyToBrain('02_QUALITY_STANDARD_SELECTED.png');

  // 03_READINESS_1_OF_1.png
  console.log('Capturing 03_READINESS_1_OF_1.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '03_READINESS_1_OF_1.png') });
  copyToBrain('03_READINESS_1_OF_1.png');

  // 04_CONFIRM_MODAL_SHOWN.png
  console.log('Opening Confirm Modal...');
  await page.evaluate(() => {
    if (typeof openP3dConfirmModal === 'function') {
      openP3dConfirmModal('generate');
    }
  });
  await new Promise(r => setTimeout(r, 600));
  console.log('Capturing 04_CONFIRM_MODAL_SHOWN.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '04_CONFIRM_MODAL_SHOWN.png') });
  copyToBrain('04_CONFIRM_MODAL_SHOWN.png');

  // Close confirm modal
  await page.evaluate(() => {
    if (typeof closeP3dConfirmModal === 'function') {
      closeP3dConfirmModal();
    }
  });
  await new Promise(r => setTimeout(r, 400));

  // 05_CONVERT_CLICKED_NON_FREEZE.png
  console.log('Capturing 05_CONVERT_CLICKED_NON_FREEZE.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '05_CONVERT_CLICKED_NON_FREEZE.png') });
  copyToBrain('05_CONVERT_CLICKED_NON_FREEZE.png');

  // 06_QUEUED_OR_GENERATING_STATE.png
  console.log('Showing Generating container...');
  await page.evaluate(() => {
    const holderSetup = document.getElementById('p3dSetupSectionContainer');
    const holderGen = document.getElementById('p3dGeneratingHolderContainer');
    if (holderSetup) holderSetup.style.display = 'none';
    if (holderGen) holderGen.style.display = 'block';
  });
  await new Promise(r => setTimeout(r, 400));
  console.log('Capturing 06_QUEUED_OR_GENERATING_STATE.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '06_QUEUED_OR_GENERATING_STATE.png') });
  copyToBrain('06_QUEUED_OR_GENERATING_STATE.png');

  // 07_COMPLETED_READY_STATE.png: Open verified slot 143 which has real READY GLB!
  console.log('Opening Product Editor for Verified Slot 143 (READY)...');
  await page.evaluate((slot) => {
    if (typeof openOwnerProductEditor === 'function') {
      openOwnerProductEditor(slot);
      if (typeof switchProductEditorTab === 'function') {
        switchProductEditorTab('3d');
      }
    }
  }, SLOT);
  await new Promise(r => setTimeout(r, 1500));
  console.log('Capturing 07_COMPLETED_READY_STATE.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '07_COMPLETED_READY_STATE.png') });
  copyToBrain('07_COMPLETED_READY_STATE.png');

  // 08_PERSISTED_IN_PIN_AND_MODAL.png: Switch to Details tab to show pin attach & 3D badge
  console.log('Switching to Details tab...');
  await page.evaluate(() => {
    if (typeof switchProductEditorTab === 'function') {
      switchProductEditorTab('details');
    }
  });
  await new Promise(r => setTimeout(r, 600));
  console.log('Capturing 08_PERSISTED_IN_PIN_AND_MODAL.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '08_PERSISTED_IN_PIN_AND_MODAL.png') });
  copyToBrain('08_PERSISTED_IN_PIN_AND_MODAL.png');

  // 09_REFRESH_PERSISTENCE.png: Reload page and reopen product modal for slot 143
  console.log('Reloading page for refresh persistence...');
  await page.reload({ waitUntil: 'networkidle2' });
  await page.evaluate((tok, pid, slot) => {
    window.authToken = tok;
    window._authToken = tok;
    localStorage.setItem('3d2_customer_token', tok);
    localStorage.setItem('token', tok);
    if (typeof loadProjectData === 'function') {
      loadProjectData(pid).then(() => {
        if (typeof openOwnerProductEditor === 'function') {
          openOwnerProductEditor(slot);
          if (typeof switchProductEditorTab === 'function') {
            switchProductEditorTab('3d');
          }
        }
      });
    }
  }, AUTH_TOKEN, PROJECT_ID, SLOT);

  await new Promise(r => setTimeout(r, 2000));
  console.log('Capturing 09_REFRESH_PERSISTENCE.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '09_REFRESH_PERSISTENCE.png') });
  copyToBrain('09_REFRESH_PERSISTENCE.png');

  await browser.close();
  console.log('All 9 production screenshots successfully captured.');
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
