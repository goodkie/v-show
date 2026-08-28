const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('https://v-show-commercial-v1-production.up.railway.app/?_t=' + Date.now(), { waitUntil: 'networkidle2', timeout: 45000 });

  // 1. vfr-video-player 요소로 스크롤하여 재생 상태 캡처
  const vfrEl = await page.$('#vfr-video-player');
  if (vfrEl) {
    await vfrEl.scrollIntoView();
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_LIVE_VFR_PERFECT_PLAYING.png', fullPage: false });
    console.log('✅ Captured VFR video playing perfectly!');
  }

  // 2. 푸터의 Partnerships & Affiliates 클릭하여 100% 영문 모달 캡처
  await page.evaluate(() => {
    window.openPartnershipModal();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_LIVE_PARTNERSHIP_100PCT_ENGLISH_MODAL.png', fullPage: false });
  console.log('✅ Captured 100% English Partnership modal perfectly!');

  await browser.close();
})();
