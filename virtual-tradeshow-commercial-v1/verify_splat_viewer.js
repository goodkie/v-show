// verify_splat_viewer.js
const puppeteer = require('puppeteer');
const path = require('path');
const outDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

const BASE = 'https://v-show-commercial-v1-production.up.railway.app';
const PAGES = [
  { url: `${BASE}/demo-splat.html`, name: '25_SPLAT_VIEWER_LIVE_MAIN' },
  { url: `${BASE}/`,               name: '27_SPLAT_LANDING_3DGS_BTN' },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox','--disable-setuid-sandbox',
      '--disable-gpu','--use-gl=angle','--use-angle=swiftshader',
      '--enable-webgl','--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--window-size=1400,900',
    ],
  });

  for (const pg of PAGES) {
    console.log(`Capturing: ${pg.url}`);
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 900 });
    p.on('console', m => {
      if (m.type() === 'error') console.log(`  PAGE ERR: ${m.text()}`);
      else console.log(`  CONSOLE: ${m.text()}`);
    });
    await p.goto(pg.url, { waitUntil: 'networkidle2', timeout: 60000 });
    const hasSplatHost = await p.$('#splat-host') !== null;
    console.log(`  → #splat-host DOM 존재: ${hasSplatHost}`);
    await new Promise(r => setTimeout(r, 4000));
    const outPath = path.join(outDir, `${pg.name}.png`);
    await p.screenshot({ path: outPath, fullPage: false });
    console.log(`  → 저장: ${outPath}`);
    await p.close();
  }

  await browser.close();
  console.log('\n✅ 3DGS 뷰어 라이브 검증 완료!');
})();
