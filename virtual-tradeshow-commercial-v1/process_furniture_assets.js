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

  const rawImagePath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787640962230.png';
  const imgBase64 = fs.readFileSync(rawImagePath).toString('base64');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>body { margin: 0; background: #000; }</style></head>
    <body>
      <img id="srcImg" src="data:image/png;base64,${imgBase64}" />
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

    // 2. Product 1: Nordic Linen 3-Seater Sofa & Oak Coffee Table (Left Living Suite)
    // X: ~150 to ~315, Y: ~240 to ~350
    const p1 = getCrop(Math.round(W * 0.150), Math.round(H * 0.580), Math.round(W * 0.165), Math.round(H * 0.320));

    // 3. Product 2: Artisan Walnut Lounge Accent Armchair
    // X: ~315 to ~410, Y: ~255 to ~360
    const p2 = getCrop(Math.round(W * 0.315), Math.round(H * 0.610), Math.round(W * 0.095), Math.round(H * 0.310));

    // 4. Product 3: Scandinavian Solid Oak Dining Table & Chairs (Center Pavilion)
    // X: ~370 to ~490, Y: ~235 to ~325
    const p3 = getCrop(Math.round(W * 0.365), Math.round(H * 0.560), Math.round(W * 0.125), Math.round(H * 0.260));

    // 5. Product 4: Chesterfield Espresso Leather Sofa Suite (Right Living Pavilion)
    // X: ~745 to ~895, Y: ~240 to ~345
    const p4 = getCrop(Math.round(W * 0.745), Math.round(H * 0.580), Math.round(W * 0.155), Math.round(H * 0.300));

    return { fullPano, p1, p2, p3, p4 };
  });

  const destPanoDir = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'furniture-showcase', 'pano360');
  const destProdDir = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'furniture-showcase', 'products');
  fs.mkdirSync(destPanoDir, { recursive: true });
  fs.mkdirSync(destProdDir, { recursive: true });

  fs.writeFileSync(path.join(destPanoDir, 'node0_preview.jpg'), Buffer.from(crops.fullPano, 'base64'));
  fs.writeFileSync(path.join(destPanoDir, 'node0_360_panorama_8k.jpg'), Buffer.from(crops.fullPano, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'linen_sofa.jpg'), Buffer.from(crops.p1, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'lounge_chair.jpg'), Buffer.from(crops.p2, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'dining_table.jpg'), Buffer.from(crops.p3, 'base64'));
  fs.writeFileSync(path.join(destProdDir, 'leather_sofa.jpg'), Buffer.from(crops.p4, 'base64'));

  console.log('Successfully generated Nova Living furniture master assets!');

  await browser.close();
})();
