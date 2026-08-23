const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const img1 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787485031202.png';
const img2 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787485065826.png';
const img3 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787485088001.png';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const list = [
    { name: 'Upload 1 (media_1787485031202.png)', path: img1 },
    { name: 'Upload 2 (media_1787485065826.png)', path: img2 },
    { name: 'Upload 3 (media_1787485088001.png)', path: img3 }
  ];
  
  for (const item of list) {
    const stat = fs.statSync(item.path);
    const b64 = fs.readFileSync(item.path).toString('base64');
    await page.setContent(`<html><body><img id="im" src="data:image/png;base64,${b64}"></body></html>`);
    const dims = await page.evaluate(() => {
      const el = document.getElementById('im');
      return { w: el.naturalWidth, h: el.naturalHeight };
    });
    console.log(`${item.name} -> Dimensions: ${dims.w} x ${dims.h}, File Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  }
  await browser.close();
  process.exit(0);
})();
