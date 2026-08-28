const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 45000 });

  // 1. 헤더 화면 캡처
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_HEADER_HERO_UPDATED.png', fullPage: false });

  // 2. 파트너쉽 신청 클릭
  await page.evaluate(() => openPartnershipModal());
  await new Promise(r => setTimeout(r, 600));

  const modalDisplay = await page.$eval('#consultation-modal', el => window.getComputedStyle(el).display);
  const modalTitle = await page.$eval('#consultation-modal h3', el => el.innerText.trim());
  console.log('Partnership Modal State -> Display:', modalDisplay, '| Title:', modalTitle);

  // 모달 팝업 상태 캡처
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_PARTNERSHIP_MODAL_OPEN.png', fullPage: false });

  // 3. How It Works 섹션으로 이동 후 캡처
  await page.evaluate(() => {
    document.getElementById('how-it-works').scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_HOW_IT_WORKS_STEP3.png', fullPage: false });

  await browser.close();
  console.log('✅ ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
})();
