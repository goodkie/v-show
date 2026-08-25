const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4324);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto('http://localhost:4324/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Create a fake booth with product to test modal
    await page.evaluate(() => {
      // Open product drawer modal directly with empty imageUrl
      const product = {
        id: 'test-1',
        slotIndex: 0,
        name: 'Test Product',
        imageUrl: null,
        description: 'A test product',
        specifications: 'Test specs'
      };
      // Manually call openProductDrawer to test image
      if (typeof openProductDrawer === 'function') {
        openProductDrawer(product);
      }
    });
    await new Promise(r => setTimeout(r, 1000));

    const screenshotPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_PRODUCT_DRAWER_MODAL_PLACEHOLDER.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Saved Product Drawer Modal screenshot to:', screenshotPath);

    // Check if drawerProdImg src is placeholder
    const imgSrc = await page.evaluate(() => {
      const img = document.getElementById('drawerProdImg');
      return img ? img.src : 'not found';
    });
    console.log('drawerProdImg.src:', imgSrc);

  } finally {
    await browser.close();
    server.close();
  }
})();
