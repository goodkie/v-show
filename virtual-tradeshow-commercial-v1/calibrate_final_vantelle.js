const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4332);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4332/demo-fashion.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    await page.evaluate(() => {
      camera.fov = 78;
      camera.updateProjectionMatrix();
      photoSphere.rotation.y = -0.92;

      // Pin 0: Left side on rack / podium
      PRODUCTS_DATA[0].worldPos.set(-240, -40, -320);

      // Pin 1: Center-Left black leather suit mannequin
      PRODUCTS_DATA[1].worldPos.set(-130, -30, -340);

      // Pin 2: Center-bottom white bag stand with satchel
      PRODUCTS_DATA[2].worldPos.set(-20, -90, -340);

      // Pin 3: Center-Right red blazer mannequin
      PRODUCTS_DATA[3].worldPos.set(110, -40, -340);

      controls.update();
    });

    await new Promise(r => setTimeout(r, 1000));

    const p = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/VANTELLE_FINAL_PERFECT.png';
    await page.screenshot({ path: p });
    console.log('Saved perfect calibrated screenshot to:', p);

  } finally {
    await browser.close();
    server.close();
  }
})();
