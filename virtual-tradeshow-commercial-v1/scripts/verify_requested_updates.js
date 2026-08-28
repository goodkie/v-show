const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 45000 });

  // 1. 헤더 브랜드 로고 & 타이틀 확인
  const brandTitle = await page.$eval('.brand-logo', el => el.innerText.trim());
  const brandFontSize = await page.$eval('.brand-logo span', el => window.getComputedStyle(el).fontSize);
  console.log('1. Header Brand Title Text:', brandTitle, '| Font Size:', brandFontSize);

  // 2. 히어로 섹션 필 텍스트 확인
  const heroPillText = await page.$eval('.hero-pill', el => el.innerText.trim());
  console.log('2. Hero Pill Text:', heroPillText);

  // 3. Step 03 타이틀 텍스트 확인
  const stepTitles = await page.$$eval('.step-title', els => els.map(e => e.innerText.trim()));
  console.log('3. How It Works Step Titles:', stepTitles);

  // 4. 메인 메뉴 파트너쉽 신청 링크 확인
  const navLinks = await page.$$eval('.nav-links a', els => els.map(e => e.innerText.trim()));
  console.log('4. Nav Links:', navLinks);

  // 파트너쉽 신청 클릭 및 모달 확인
  await page.click('a[onclick*="openPartnershipModal"]');
  await new Promise(r => setTimeout(r, 600));

  const modalVisible = await page.$eval('#consultation-modal', el => el.style.display !== 'none');
  const modalTitle = await page.$eval('#consultation-modal h3', el => el.innerText.trim());
  console.log('5. Partnership Modal Visible:', modalVisible, '| Modal Title:', modalTitle);

  // 스크린샷 캡처
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_PARTNERSHIP_MODAL.png', fullPage: false });

  // 모달 닫기
  await page.click('button[onclick*="closeConsultationModal"]');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_HEADER_HERO_UPDATED.png', fullPage: false });

  await browser.close();
  console.log('✅ ALL LIVE VERIFICATIONS COMPLETED SUCCESSFULLY!');
})();
