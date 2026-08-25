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

  const rawImagePath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787634770565.jpg';
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

  const crops = await page.evaluate(() => {
    const img = document.getElementById('srcImg');
    const W = img.naturalWidth;
    const H = img.naturalHeight;

    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    function getCrop(x, y, w, h) {
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    }

    // 1. Full Master Panorama
    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    const fullPano = canvas.toDataURL('image/jpeg', 0.98).split(',')[1];

    // 2. Product 1: Scarlet Wrap Cardigan & Culottes Set (Left mannequin)
    // X: ~280/1024 = 0.273, Y: ~245/512 = 0.478, W: ~50/1024 = 0.048, H: ~130/512 = 0.254
    const p1 = getCrop(Math.round(W * 0.280), Math.round(H * 0.480), Math.round(W * 0.052), Math.round(H * 0.260));

    // 3. Product 2: Ivory Silk Structured Blouse & Trousers
    const p2 = getCrop(Math.round(W * 0.355), Math.round(H * 0.480), Math.round(W * 0.052), Math.round(H * 0.260));

    // 4. Product 3: Midnight Noir Tailored Leather Ensemble (Center)
    const p3 = getCrop(Math.round(W * 0.435), Math.round(H * 0.480), Math.round(W * 0.052), Math.round(H * 0.260));

    // 5. Product 4: Vantelle Paris Top-Handle Satchel & Gift Stand
    const p4 = getCrop(Math.round(W * 0.540), Math.round(H * 0.570), Math.round(W * 0.090), Math.round(H * 0.170));

    return { fullPano, p1, p2, p3, p4 };
  });

  const destPanoDir = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'vantelle-showcase', 'pano360');
  const destProdDir = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'vantelle-showcase', 'products');
  fs.mkdirSync(destPanoDir, { recursive: true });
  fs.mkdirSync(destProdDir, { recursive: true });

  fs.writeFileSync(path.join(destPanoDir, 'node0_preview.jpg'), Buffer.from(crops.fullPano, 'base64'));
  fs.writeFileSync(path.join(destPanoDir, 'node0_360_panorama_8k.jpg'), Buffer.from(crops.fullPano, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'scarlet_wrap_set.jpg'), Buffer.from(crops.p1, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'ivory_silk_suit.jpg'), Buffer.from(crops.p2, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'midnight_noir_leather.jpg'), Buffer.from(crops.p3, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'vantelle_satchel.jpg'), Buffer.from(crops.p4, 'base64'));

  console.log('Successfully generated Vantelle Paris master assets!');

  await browser.close();
})();
