const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  console.log('--- 1. Testing Desktop Video Play/Icon Hide & Iframe Navigation ---');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 45000 });

  // VFR 비디오 재생 및 플레이 버튼 opacity 확인
  const vfrBtnBefore = await page.$eval('#vfr-play-btn', el => window.getComputedStyle(el).opacity);
  console.log('VFR Play Button Opacity Before Click:', vfrBtnBefore);

  await page.click('#virtual-fitting-room .video-player-container, #virtual-fitting-room video, #virtual-fitting-room div[onclick*="togglePlayVideo"]');
  await new Promise(r => setTimeout(r, 2000));

  const vfrState = await page.evaluate(() => {
    const v = document.getElementById('vfr-video-player');
    const b = document.getElementById('vfr-play-btn');
    return {
      paused: v ? v.paused : null,
      currentTime: v ? v.currentTime : 0,
      btnOpacity: b ? window.getComputedStyle(b).opacity : null
    };
  });
  console.log('VFR Playback & Icon State After Click:', vfrState);

  // VMA 비디오 재생 및 플레이 버튼 opacity 확인
  const vmaBtnBefore = await page.$eval('#vma-play-btn', el => window.getComputedStyle(el).opacity);
  console.log('VMA Play Button Opacity Before Click:', vmaBtnBefore);

  await page.click('#virtual-makeup-artist .video-player-container, #virtual-makeup-artist video, #virtual-makeup-artist div[onclick*="togglePlayVideo"]');
  await new Promise(r => setTimeout(r, 2000));

  const vmaState = await page.evaluate(() => {
    const v = document.getElementById('vma-video-player');
    const b = document.getElementById('vma-play-btn');
    return {
      paused: v ? v.paused : null,
      currentTime: v ? v.currentTime : 0,
      btnOpacity: b ? window.getComputedStyle(b).opacity : null
    };
  });
  console.log('VMA Playback & Icon State After Click:', vmaState);

  // 데모 iframe sandbox 및 외부 열림 속성 확인
  const iframes = await page.$$eval('.demo-frame', frames => frames.map(f => ({
    src: f.src,
    sandbox: f.getAttribute('sandbox')
  })));
  console.log('Demo Iframes Sandbox Configuration:', iframes);

  // 데모 iframe 내부의 base target 확인
  const demoTarget = await page.evaluate(async () => {
    const res = await fetch('/demo-matterport.html');
    const html = await res.text();
    return {
      hasBaseTargetTop: html.includes('<base target="_top">'),
      hasGlobalLinkHandler: html.includes('target')
    };
  });
  console.log('Demo HTML Base Target Inspection:', demoTarget);

  console.log('\n--- 2. Testing Mobile Responsive Layout (iPhone 14 / 390x844) ---');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 45000 });
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_MOBILE_HERO.png', fullPage: false });

  // 쇼케이스 섹션으로 스크롤 후 스크린샷
  await page.evaluate(() => {
    document.getElementById('virtual-fitting-room').scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_MOBILE_VFR.png', fullPage: false });

  await page.evaluate(() => {
    document.getElementById('virtual-makeup-artist').scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_MOBILE_VMA.png', fullPage: false });

  await browser.close();
  console.log('✅ ALL LIVE VERIFICATIONS & MOBILE SCREENSHOTS COMPLETE');
})();
