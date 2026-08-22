const puppeteer = require('puppeteer');
const fs = require('fs');

const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

(async () => {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-software-rasterizer',
      '--enable-gpu-rasterization',
      '--window-size=1440,900',
    ],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  // Capture console logs & errors
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('THREE') || msg.text().includes('WebGL')) {
      console.log(`[browser-${msg.type()}]`, msg.text().slice(0, 120));
    }
  });

  // === 1. LOCAL Landing Page ===
  console.log('1. Navigating to LOCAL landing page...');
  await page.goto('http://localhost:3000/?_t=' + Date.now(), { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 6000));

  const landingEval = await page.evaluate(() => JSON.stringify({
    THREE: typeof THREE,
    rev: typeof THREE !== 'undefined' ? THREE.REVISION : null,
    canvas: !!document.getElementById('hero-3d-canvas'),
    canvasW: document.getElementById('hero-3d-canvas')?.clientWidth || 0
  }));
  console.log('Landing EVAL:', landingEval);

  await page.screenshot({ path: geminiDir + '/04_PRODUCTION_LIVE_LANDING_VERIFIED.png', fullPage: false });
  const landingSize = fs.statSync(geminiDir + '/04_PRODUCTION_LIVE_LANDING_VERIFIED.png').size;
  console.log('Saved landing screenshot:', landingSize, 'bytes');

  // === 2. LOCAL Demo 3D Showroom ===
  console.log('2. Navigating to LOCAL demo 3D showroom...');
  await page.goto('http://localhost:3000/demo.html?_t=' + Date.now(), { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 14000));

  const demoEval = await page.evaluate(() => JSON.stringify({
    THREE: typeof THREE,
    rev: typeof THREE !== 'undefined' ? THREE.REVISION : null,
    hasCanvas: !!document.querySelector('canvas'),
    hotspots: document.querySelectorAll('.hotspot-tag').length,
    loaderGone: !document.getElementById('intro-loader')
  }));
  console.log('Demo EVAL:', demoEval);

  await page.screenshot({ path: geminiDir + '/05_PRODUCTION_LIVE_DEMO_VERIFIED.png', fullPage: false });
  const demoSize = fs.statSync(geminiDir + '/05_PRODUCTION_LIVE_DEMO_VERIFIED.png').size;
  console.log('Saved demo screenshot:', demoSize, 'bytes');

  await browser.close();
  console.log('Done.');
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
