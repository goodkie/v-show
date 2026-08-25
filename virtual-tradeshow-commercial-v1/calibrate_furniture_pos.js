const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4340);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4340/demo-furniture.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const testAngles = [0, 0.5, 1.0, 1.57, 2.2, 3.14];
    for (const a of testAngles) {
      await page.evaluate((angle) => {
        camera.fov = 76;
        camera.updateProjectionMatrix();
        photoSphere.rotation.y = angle;
        controls.update();
      }, a);
      await new Promise(r => setTimeout(r, 300));
      const p = `C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/FURNITURE_POS_${a.toString().replace('.', '_')}.png`;
      await page.screenshot({ path: p });
      console.log('Saved furniture pos', a);
    }

  } finally {
    await browser.close();
    server.close();
  }
})();
