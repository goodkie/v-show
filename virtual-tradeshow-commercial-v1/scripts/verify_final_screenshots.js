const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/?_t=' + Date.now(), { waitUntil: 'networkidle2', timeout: 45000 });

  // 1. 헤더 & Hero 스크린샷
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_HEADER_HERO.png', fullPage: false });

  // 2. 파트너쉽 신청 링크 클릭
  const link = await page.$('a[onclick*="openPartnershipModal"]');
  if (link) {
    await link.click();
    await new Promise(r => setTimeout(r, 600));
    console.log('Clicked partnership link!');
  }

  // 모달 캡처
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_PARTNERSHIP_MODAL.png', fullPage: false });

  // 3. How It Works 섹션 캡처
  await page.evaluate(() => {
    document.getElementById('how-it-works').scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_STEP3_VERIFIED.png', fullPage: false });

  await browser.close();
  console.log('✅ ALL SCREENSHOTS CAPTURED SUCCESS!');
})();
