const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4342);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4342/demo-furniture.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Test a full 360 degree scan in steps of 0.5 radians
    for (let r = 0; r < 6.28; r += 0.6) {
      await page.evaluate((rad) => {
        camera.fov = 76;
        camera.updateProjectionMatrix();
        controls.reset();
        photoSphere.rotation.y = rad;
        controls.update();
      }, r);
      await new Promise(res => setTimeout(res, 200));
      const p = `C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/SCAN_${r.toFixed(1).replace('.', '_')}.png`;
      await page.screenshot({ path: p });
      console.log('Saved scan', r.toFixed(1));
    }

  } finally {
    await browser.close();
    server.close();
  }
})();
