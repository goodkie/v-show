const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
// In Node 24 WebSocket is global

const extPath = path.resolve('XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension');
const extId = 'ldlijlaccfeelfdhgnjbibniocefckjj';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-repro-'));

console.log('Testing unpacked extension at:', extPath);
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9388;
const browser = spawn(browserPath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${tmpDir}`,
  `--disable-extensions-except=${extPath}`,
  `--load-extension=${extPath}`,
  '--no-first-run',
  '--no-default-browser-check'
]);

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function connectWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
  });
}

let cdpId = 1;
function cdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = cdpId++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function ev(ws, expr) {
  const res = await cdp(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) {
    throw new Error('Eval Exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result ? res.result.value : undefined;
}

(async () => {
  try {
    await new Promise(r => setTimeout(r, 2000));
    const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
    console.log('Targets:', targets.map(t => ({ id: t.id, type: t.type, url: t.url })));

    // Connect to page target
    const pageTarget = targets.find(t => t.type === 'page');
    const ws = await connectWs(pageTarget.webSocketDebuggerUrl);

    // Collect console logs
    await cdp(ws, 'Console.enable');
    await cdp(ws, 'Runtime.enable');
    ws.addEventListener('message', (evt) => {
      const m = JSON.parse(evt.data);
      if (m.method === 'Runtime.consoleAPICalled') {
        console.log('[POPUP_CONSOLE]', m.params.type, m.params.args.map(a => a.value || a.description).join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        console.error('[POPUP_EXCEPTION]', m.params.exceptionDetails.text, m.params.exceptionDetails.exception);
      }
    });

    const popupUrl = `chrome-extension://${extId}/popup.html`;
    console.log('Navigating to popupUrl:', popupUrl);
    await cdp(ws, 'Page.navigate', { url: popupUrl });
    await new Promise(r => setTimeout(r, 2500));

    // Setup a fake paused checkpoint and fake uploaded URLs in storage
    await ev(ws, `new Promise(resolve => {
      chrome.storage.local.set({
        xpider_isPaused: true,
        xpider_isActive: false,
        xpider_total: 78,
        xpider_queue: ['https://jgparksmartialarts.com', 'https://jeongsustc.com', 'https://test3.com'],
        xpider_paused_checkpoint: {
          campaignRunId: 'test_run_123',
          campaignMode: 'MANUAL',
          remainingQueue: ['https://jgparksmartialarts.com', 'https://jeongsustc.com'],
          visitedUrls: ['https://u1.com'],
          totalTargets: 78
        }
      }, resolve);
    })`);

    // Reload popup
    await cdp(ws, 'Page.navigate', { url: popupUrl });
    await new Promise(r => setTimeout(r, 2000));

    // Check rendered elements
    const state = await ev(ws, `(() => {
      const banner = document.getElementById('resumable-campaign-banner');
      const resumeBtn = document.getElementById('resume-campaign-btn');
      const countEl = document.getElementById('resumable-remaining-count');
      const modal = document.getElementById('resume-mode-modal-overlay');
      const campPill = document.getElementById('campaign-ready-pill');
      
      // Also render preview urls
      if (typeof renderUrlsPreview === 'function') {
        renderUrlsPreview(['https://jgparksmartialarts.com', 'https://jeongsustc.com']);
      }
      const previewArea = document.getElementById('file-urls-preview');
      const previewItems = document.querySelectorAll('.preview-item');
      let previewItemStyles = null;
      if (previewItems.length > 0) {
        const s = window.getComputedStyle(previewItems[0]);
        previewItemStyles = {
          color: s.color,
          backgroundColor: s.backgroundColor,
          fontSize: s.fontSize,
          opacity: s.opacity,
          display: s.display
        };
      }

      return {
        bannerFound: !!banner,
        bannerDisplay: banner ? window.getComputedStyle(banner).display : null,
        bannerVisibility: banner ? window.getComputedStyle(banner).visibility : null,
        resumeBtnFound: !!resumeBtn,
        countText: countEl ? countEl.textContent : null,
        modalFound: !!modal,
        modalDisplay: modal ? window.getComputedStyle(modal).display : null,
        campPillText: campPill ? campPill.textContent : null,
        previewAreaDisplay: previewArea ? window.getComputedStyle(previewArea).display : null,
        previewItemStyles
      };
    })()`);
    console.log('Diagnostic State:', JSON.stringify(state, null, 2));

    // Now click the Resume button!
    console.log('Clicking Resume button...');
    const clickResult = await ev(ws, `(async () => {
      const resumeBtn = document.getElementById('resume-campaign-btn');
      if (!resumeBtn) return { error: 'resumeBtn not found' };
      
      const beforeClickModal = document.getElementById('resume-mode-modal-overlay');
      const beforeDisplay = beforeClickModal ? window.getComputedStyle(beforeClickModal).display : null;
      
      resumeBtn.click();
      await new Promise(r => setTimeout(r, 600));

      const afterClickModal = document.getElementById('resume-mode-modal-overlay');
      const afterDisplay = afterClickModal ? window.getComputedStyle(afterClickModal).display : null;
      const afterClass = afterClickModal ? afterClickModal.className : null;

      return {
        beforeDisplay,
        afterDisplay,
        afterClass,
        modalVisible: afterClickModal ? (afterDisplay !== 'none' && !afterClickModal.classList.contains('hidden')) : false
      };
    })()`);
    console.log('Click Result:', JSON.stringify(clickResult, null, 2));

    // Capture screenshot of popup with high-contrast preview list and open modal
    const evidenceDir = path.resolve('evidence/v7_rc6_audit');
    fs.mkdirSync(evidenceDir, { recursive: true });
    const shotRes = await cdp(ws, 'Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(evidenceDir, 'owner_rc6_resume_modal_and_url_contrast.png');
    fs.writeFileSync(shotPath, Buffer.from(shotRes.data, 'base64'));
    console.log('Saved screenshot evidence to:', shotPath);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    browser.kill();
  }
})();
