const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));
const fs = require('fs');

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4329);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4329/demo-fashion.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Test adjustments
    await page.evaluate(() => {
      camera.fov = 78;
      camera.updateProjectionMatrix();
      photoSphere.rotation.y = -0.32;

      // Update positions
      PRODUCTS_DATA[0].worldPos.set(-200, -35, -330);
      PRODUCTS_DATA[1].worldPos.set(-118, -35, -345);
      PRODUCTS_DATA[2].worldPos.set(-35, -35, -350);
      PRODUCTS_DATA[3].worldPos.set(72, -75, -340);

      controls.update();
    });

    await new Promise(r => setTimeout(r, 1000));

    const p = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/VANTELLE_CALIBRATED.png';
    await page.screenshot({ path: p });
    console.log('Saved calibrated screenshot to:', p);

  } finally {
    await browser.close();
    server.close();
  }
})();
