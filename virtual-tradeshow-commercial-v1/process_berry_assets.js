const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const rawImagePath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787631842143.jpg';
  const imgBase64 = fs.readFileSync(rawImagePath).toString('base64');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>body { margin: 0; background: #000; }</style></head>
    <body>
      <img id="srcImg" src="data:image/jpeg;base64,${imgBase64}" />
      <canvas id="c"></canvas>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForSelector('#srcImg');

  // Let's get dimensions of srcImg
  const dims = await page.evaluate(() => {
    const img = document.getElementById('srcImg');
    return { width: img.naturalWidth, height: img.naturalHeight };
  });
  console.log('Source Image Dimensions:', dims);

  // In the screenshot (width: ~1024, height: ~512 or similar), let's crop the booth canvas area
  // In the screenshot:
  // Studio player is roughly from X: 15% to 66%, Y: 18% to 72%
  // Let's accurately locate the inner viewport box
  const crops = await page.evaluate(() => {
    const img = document.getElementById('srcImg');
    const W = img.naturalWidth;
    const H = img.naturalHeight;

    // Viewport box in the screenshot:
    // Left: ~150/1024 = 0.146 * W, Top: ~94/512 = 0.183 * H
    // Width: ~530/1024 = 0.517 * W, Height: ~276/512 = 0.539 * H
    const vpX = Math.round(W * 0.148);
    const vpY = Math.round(H * 0.174);
    const vpW = Math.round(W * 0.518);
    const vpH = Math.round(H * 0.550);

    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    function getCrop(x, y, w, h) {
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    }

    // 1. Clean Full Booth Panorama Texture (with expanded margins)
    const panoData = getCrop(vpX, vpY, vpW, vpH);

    // 2. Product 1: Black Tailored Suit (Left mannequin)
    const p1Data = getCrop(vpX + Math.round(vpW * 0.0), vpY + Math.round(vpH * 0.20), Math.round(vpW * 0.25), Math.round(vpH * 0.75));

    // 3. Product 2: Paris Luxury Handbag & Rack (Center rack)
    const p2Data = getCrop(vpX + Math.round(vpW * 0.32), vpY + Math.round(vpH * 0.40), Math.round(vpW * 0.28), Math.round(vpH * 0.58));

    // 4. Product 3: Crimson Power Blazer (Right mannequin)
    const p3Data = getCrop(vpX + Math.round(vpW * 0.56), vpY + Math.round(vpH * 0.20), Math.round(vpW * 0.26), Math.round(vpH * 0.75));

    return { panoData, p1Data, p2Data, p3Data };
  });

  const destPanoDir = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'berry-showcase', 'pano360');
  const destProdDir = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'berry-showcase', 'products');
  fs.mkdirSync(destPanoDir, { recursive: true });
  fs.mkdirSync(destProdDir, { recursive: true });

  fs.writeFileSync(path.join(destPanoDir, 'node0_preview.jpg'), Buffer.from(crops.panoData, 'base64'));
  fs.writeFileSync(path.join(destPanoDir, 'node0_360_panorama_8k.jpg'), Buffer.from(crops.panoData, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'noir_leather.jpg'), Buffer.from(crops.p1Data, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'ivory_silk.jpg'), Buffer.from(crops.p2Data, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'crimson_blazer.jpg'), Buffer.from(crops.p3Data, 'base64'));

  console.log('Successfully extracted and saved high-definition Berry showroom assets!');

  await browser.close();
})();
