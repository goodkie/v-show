const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  const consoleLogs = [];
  const failedRequests = [];

  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('requestfailed', req => failedRequests.push(`${req.url()} - ${req.failure().errorText}`));

  console.log('Navigating to landing page to diagnose video and 360 images...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 60000 });

  // 비디오 엘리먼트 진단
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
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      parentClass: v.parentElement ? v.parentElement.className : ''
    }));
  });

  console.log('--- VIDEO DIAGNOSTICS ---');
  console.log(JSON.stringify(videoStats, null, 2));

  console.log('\n--- FAILED REQUESTS ---');
  console.log(failedRequests);

  console.log('\n--- CONSOLE ERRORS ---');
  console.log(consoleLogs.filter(l => l.includes('error') || l.includes('Error') || l.includes('404')));

  await browser.close();
})();
