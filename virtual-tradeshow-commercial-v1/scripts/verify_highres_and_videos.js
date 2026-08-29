const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  console.log('Navigating to live production landing page...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 60000 });

  await new Promise(r => setTimeout(r, 3000));

  // 1. 비디오 엘리먼트 상태 재진단
  const videoStats = await page.evaluate(() => {
    const vids = Array.from(document.querySelectorAll('video'));
    return vids.map((v, i) => ({
      index: i,
      src: v.currentSrc || v.src,
      paused: v.paused,
      muted: v.muted,
      autoplay: v.autoplay,
      readyState: v.readyState,
      currentTime: v.currentTime,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      error: v.error ? { code: v.error.code, message: v.error.message } : null
    }));
  });

  console.log('--- LIVE VIDEO STATS ---');
  console.log(JSON.stringify(videoStats, null, 2));

  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

  // 2. AI Virtual Fitting & Makeup 섹션 캡처
  await page.evaluate(() => {
    const el = document.querySelector('.vfr-container') || document.querySelector('#vfr-section') || document.querySelector('video');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'PROD_LIVE_HIGHRES_VIDEO_PLAYING.png'), fullPage: false });

  // 3. Examples Showcase (Nova Living, Lumiere, Vantelle, 3DNa) 섹션 캡처
  await page.evaluate(() => {
    const el = document.querySelector('#examples') || document.querySelector('.showcase-container');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(artifactDir, 'PROD_LIVE_HIGHRES_EXAMPLES_UPGRADED.png'), fullPage: false });

  console.log('✅ Captured live verification screenshots!');
  await browser.close();
})();
