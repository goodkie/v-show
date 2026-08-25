const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    page.on('dialog', async dialog => {
      console.log('Dialog:', dialog.message());
      await dialog.accept();
    });

    console.log('Navigating to live production...');
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2' });

    // Generate unique business name to avoid duplicate popup
    const uniqueBiz = 'Vantelle Luxury ' + Date.now().toString().slice(-4);
    await page.type('#business-name-input', uniqueBiz);
    await page.type('#work-email-input', 'lead-dev@internal.vshow.com');

    // Trigger email input event and wait for dev mode check
    await page.evaluate(() => onWorkEmailInput());
    await new Promise(r => setTimeout(r, 1000));

    // Upload sample booth image
    const samplePhotoPath = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'dna-showcase', 'pano360', 'node0_preview.jpg');
    const fileInput = await page.$('#booth-file-input');
    await fileInput.uploadFile(samplePhotoPath);
    await new Promise(r => setTimeout(r, 500));

    console.log('Submitting free booth creation...');
    await page.click('#btn-submit-free');

    // Wait for studio section to display
    await page.waitForFunction(() => {
      const el = document.getElementById('freeStudioSection');
      return el && window.getComputedStyle(el).display !== 'none';
    }, { timeout: 30000 });

    console.log('Studio section visible! Waiting for WebGL textures and pins...');
    await new Promise(r => setTimeout(r, 4000));

    // Scroll to studio
    await page.evaluate(() => {
      document.getElementById('freeStudioSection').scrollIntoView();
    });
    await new Promise(r => setTimeout(r, 1000));

    const outPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C10R3_PHOTO_IMMERSIVE_STUDIO_LIVE.png';
    await page.screenshot({ path: outPath, fullPage: false });
    console.log('Successfully saved studio screenshot to:', outPath);

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
  }
})();
