const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4337);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4337/demo-cosmetic.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    const testAngles = [-1.30, -1.45, -1.57, -1.70];
    for (const a of testAngles) {
      await page.evaluate((angle) => {
        camera.fov = 76;
        camera.updateProjectionMatrix();
        photoSphere.rotation.y = angle;

        // Calibrate pin positions
        PRODUCTS_DATA[0].worldPos.set(-75, -55, -340); // Cellular Radiance Serum
        PRODUCTS_DATA[1].worldPos.set(-210, -75, -320); // Botanical Cleanser (left counter)
        PRODUCTS_DATA[2].worldPos.set(45, -60, -340); // Multi-Peptide Cream (center right)
        PRODUCTS_DATA[3].worldPos.set(220, -25, -330); // Essence Suite (right tower)

        controls.update();
      }, a);
      await new Promise(r => setTimeout(r, 300));
      const p = `C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/COSMETIC_ANGLE_${a.toString().replace('.', '_').replace('-', 'neg_')}.png`;
      await page.screenshot({ path: p });
      console.log('Saved cosmetic angle', a);
    }

  } finally {
    await browser.close();
    server.close();
  }
})();
