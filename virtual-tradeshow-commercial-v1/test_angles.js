const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4322);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4322/demo-matterport.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Test different rotation.y values
    const angles = [0, 0.5, 1.0, 1.57, 2.0, 3.14, -0.5, -1.0, -1.57];
    for (const angle of angles) {
      await page.evaluate((a) => {
        photoSphere.rotation.y = a;
        controls.update();
      }, angle);
      await new Promise(r => setTimeout(r, 400));
      const p = `C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DEMO_ANGLE_${angle.toString().replace('.', '_')}.png`;
      await page.screenshot({ path: p });
      console.log('Saved angle', angle, 'to', p);
    }

  } finally {
    await browser.close();
    server.close();
  }
})();
