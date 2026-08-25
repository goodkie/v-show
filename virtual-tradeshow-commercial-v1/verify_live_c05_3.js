const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== STARTING LIVE RAILWAY VERIFICATION FOR dn’a-C05.3 DEVELOPER LAB ===');
  const baseUrl = 'https://v-show-commercial-v1-production.up.railway.app';

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  try {
    const page = await browser.newPage();
    page.on('dialog', async d => {
      console.log('   [LIVE DIALOG]', d.message());
      await d.dismiss();
    });
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Check health
    console.log('1. Checking Live Railway Health...');
    const healthRes = await page.goto(`${baseUrl}/health`, { waitUntil: 'networkidle2' });
    console.log('   Health Status:', healthRes.status());

    // 2. Access /dev-lab.html anonymously
    console.log('2. Accessing Live /dev-lab.html anonymously...');
    await page.goto(`${baseUrl}/dev-lab.html`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    const isShieldPresent = await page.evaluate(() => {
      const modal = document.getElementById('auth-shield-modal');
      return modal && window.getComputedStyle(modal).display === 'flex';
    });
    console.log('   Live Anonymous Guard Shield Present:', isShieldPresent);
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/234_LIVE_RAILWAY_C05_3_AUTH_SHIELD.png' });

    // 3. Login as Developer on Live Railway
    console.log('3. Authenticating Developer on Live Railway...');
    await page.evaluate(() => {
      document.getElementById('dev-login-email').value = 'developer@vshow.com';
      document.getElementById('dev-login-pass').value = 'admin123';
      document.querySelector('#auth-shield-modal form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
    await sleep(2000);

    const devLabel = await page.evaluate(() => document.getElementById('dev-user-label')?.textContent);
    console.log('   Live Developer Session:', devLabel);
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/235_LIVE_RAILWAY_C05_3_DEV_LAB_CONSOLE.png' });

    // 4. Test Image Processing Lab on Live Railway
    console.log('4. Testing Image Processing Lab on Live Railway...');
    await page.evaluate(() => switchTab('image-tab', document.querySelectorAll('.tab-btn')[1]));
    await sleep(800);
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/236_LIVE_RAILWAY_C05_3_IMAGE_PROCESSING.png' });

    // 5. Test Pipeline Inspector QA Matrix on Live Railway
    console.log('5. Testing Pipeline Inspector on Live Railway...');
    await page.evaluate(() => switchTab('inspector-tab', document.querySelectorAll('.tab-btn')[5]));
    await sleep(800);
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/237_LIVE_RAILWAY_C05_3_PIPELINE_INSPECTOR.png' });

    // 6. Mobile Responsiveness Test on Live Railway
    console.log('6. Testing Mobile Viewport on Live Railway...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await sleep(1000);
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/238_LIVE_RAILWAY_C05_3_MOBILE_DEV_LAB.png' });

    console.log('=== LIVE RAILWAY C05.3 VERIFICATION COMPLETE ===');
  } catch (err) {
    console.error('Live Railway Verification Error:', err);
  } finally {
    await browser.close();
  }
})();
