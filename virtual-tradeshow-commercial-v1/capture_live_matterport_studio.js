const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('Navigating to live production...');
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 60000 });

    // Fill in developer email to bypass confirmation instantly
    await page.type('#business-name-input', 'VANTÉLLE Robotics & Haute');
    await page.type('#work-email-input', 'lead-dev@internal.vshow.com');

    // Wait 500ms for dev mode badge
    await new Promise(r => setTimeout(r, 600));

    // Upload booth photo
    const samplePhotoPath = path.join(__dirname, 'client', 'assets', 'demo', 'dna-showcase', 'pano360', 'node0_preview.jpg');
    const fileInput = await page.$('#booth-file-input');
    await fileInput.uploadFile(samplePhotoPath);

    console.log('Submitting free booth creation...');
    await page.click('#btn-submit-free');

    // Wait for progress overlay to complete and studio to become visible
    await page.waitForSelector('#freeStudioSection', { visible: true, timeout: 30000 });
    console.log('Studio section visible! Waiting for Three.js WebGL rendering...');
    await new Promise(r => setTimeout(r, 4000));

    // Take full screenshot of the Photo Immersive Studio
    const outPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C10R3_PHOTO_IMMERSIVE_STUDIO_LIVE.png';
    await page.screenshot({ path: outPath, fullPage: false });
    console.log('Saved studio screenshot to:', outPath);

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
  }
})();
