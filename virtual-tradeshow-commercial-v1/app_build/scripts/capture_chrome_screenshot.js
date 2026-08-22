const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

// Use Chrome's built-in screenshot via --screenshot flag (non-headless render)
// This forces a full GPU render pass

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url1 = 'http://localhost:3000/?_t=' + Date.now();
const url2 = 'http://localhost:3000/demo.html?preset=OVERVIEW&_t=' + Date.now();

const out1 = path.join(geminiDir, '04_PRODUCTION_LIVE_LANDING_VERIFIED.png').replace(/\//g, '\\');
const out2 = path.join(geminiDir, '05_PRODUCTION_LIVE_DEMO_VERIFIED.png').replace(/\//g, '\\');

function captureWithChrome(url, outPath, delay) {
  return new Promise((resolve, reject) => {
    // Use chrome --screenshot (renders to file, needs a display but works on Windows)
    const cmd = `"${chrome}" --headless=new --screenshot="${outPath}" --window-size=1440,900 --no-sandbox --enable-webgl --ignore-gpu-blocklist --virtual-time-budget=${delay} "${url}"`;
    console.log('Running:', cmd.slice(0, 120) + '...');
    exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Chrome error:', stderr.slice(0, 300));
        reject(err);
      } else {
        const size = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
        console.log('Saved:', outPath, size, 'bytes');
        resolve(size);
      }
    });
  });
}

(async () => {
  console.log('=== Landing Page ===');
  await captureWithChrome(url1, out1, 8000);

  console.log('=== Demo 3D Showroom ===');
  await captureWithChrome(url2, out2, 12000);

  console.log('Done.');
})().catch(e => { console.error(e.message); process.exit(1); });
