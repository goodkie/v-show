const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4343);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4343/demo-furniture.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Test specific rotations around -0.92 to 0
    const list = [-0.92, -0.80, -0.45, -0.20, 0, 0.20, 0.45];
    for (const rot of list) {
      await page.evaluate((val) => {
        camera.fov = 76;
        camera.updateProjectionMatrix();
        photoSphere.rotation.y = val;
        controls.target.set(0, 0, 0);
        camera.position.set(0, 0, 0.01);
        camera.lookAt(0, 0, -1);
        controls.update();
      }, rot);
      await new Promise(res => setTimeout(res, 200));
      const p = `C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/FURN_ROT_${rot.toString().replace('.', '_').replace('-', 'neg_')}.png`;
      await page.screenshot({ path: p });
      console.log('Saved rot', rot);
    }

  } finally {
    await browser.close();
    server.close();
  }
})();
