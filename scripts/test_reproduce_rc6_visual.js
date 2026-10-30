const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const extPath = path.resolve('XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA/extension');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-visual-'));

console.log('Testing unpacked extension visual layout at:', extPath);
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9390;
const browser = spawn(browserPath, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${tmpDir}`,
  `--disable-extensions-except=${extPath}`,
  `--load-extension=${extPath}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=400,800'
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

function putJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'PUT' }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
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
  return res.result ? res.result.value : res;
}

async function run() {
  await new Promise(r => setTimeout(r, 2000));
  const list = await getJson(`http://localhost:${port}/json`);
  let bgTarget = list.find(t => t.type === 'service_worker' || t.title.includes('XPIDER'));
  console.log('Discovered targets:', list.map(t => ({ type: t.type, title: t.title, url: t.url })));

  // Create popup page target
  const newTab = await putJson(`http://localhost:${port}/json/new?chrome-extension://ldlijlaccfeelfdhgnjbibniocefckjj/popup.html`);
  console.log('Opened popup tab:', newTab.id);

  const ws = await connectWs(newTab.webSocketDebuggerUrl);
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'DOM.enable');
  await cdp(ws, 'CSS.enable');

  // Set side-panel viewport
  await cdp(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 380,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false
  });

  await new Promise(r => setTimeout(r, 1500));

  // Inspect banner and URL list layout
  const diagnostics = await ev(ws, `
    (() => {
      const urls = [
        'https://jgmma.com',
        'https://acme-global-logistics.example.com/inquiry-form-portal/en/contact',
        'https://consulting-services-group.example.org/contact-us?dept=sales',
        'https://technology-partners-network.example.net/feedback/submit',
        'https://korea-auto-logistics.example.co.kr/cs/online-inquiry'
      ];
      if (typeof renderUrlsPreview === 'function') {
        renderUrlsPreview(urls);
      }
      
      const previewArea = document.getElementById('file-urls-preview');
      const previewList = document.getElementById('preview-list');
      const items = Array.from(document.querySelectorAll('.preview-item'));
      const mismatchBanner = document.getElementById('build-mismatch-banner');
      const buildBadge = document.getElementById('build-provenance-badge');

      const itemStyles = items.map(el => {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          text: el.textContent,
          rect: { width: rect.width, height: rect.height, top: rect.top },
          lineHeight: cs.lineHeight,
          fontSize: cs.fontSize,
          height: cs.height,
          padding: cs.padding,
          overflow: cs.overflow,
          whiteSpace: cs.whiteSpace
        };
      });

      return {
        buildBadgeText: buildBadge ? buildBadge.textContent : null,
        mismatchBannerVisible: mismatchBanner ? mismatchBanner.style.display !== 'none' : false,
        mismatchText: mismatchBanner ? mismatchBanner.innerText : '',
        previewAreaRect: previewArea ? previewArea.getBoundingClientRect() : null,
        itemCount: items.length,
        itemStyles
      };
    })()
  `);

  console.log('Layout diagnostics:', JSON.stringify(diagnostics, null, 2));

  // Capture screenshot of side-panel with URL preview
  const screenshot = await cdp(ws, 'Page.captureScreenshot', { format: 'png' });
  const outDir = path.resolve('evidence/v7_rc7_audit');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'rc7_fixed_layout_and_handshake_sidepanel.png');
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to:', outPath);

  ws.close();
  browser.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Visual test failed:', err);
  browser.kill();
  process.exit(1);
});
