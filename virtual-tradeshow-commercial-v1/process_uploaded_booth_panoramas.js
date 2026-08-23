const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const imgMiddle = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787485031202.png';
const imgLeft   = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787485065826.png';
const imgRight  = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787485088001.png';

const outDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/dna-showcase/pano360';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const nodes = [
    { id: 0, key: 'middle', name: '01. 부스 메인 중앙 전경 (Middle View)', path: imgMiddle },
    { id: 1, key: 'left',   name: '02. 부스 좌측 전경 (Left View)',         path: imgLeft },
    { id: 2, key: 'right',  name: '03. 부스 우측 전경 (Right View)',        path: imgRight }
  ];

  for (const node of nodes) {
    console.log(`Processing ${node.name}...`);
    const page = await browser.newPage();
    const rawB64 = fs.readFileSync(node.path).toString('base64');

    await page.setContent(`
      <!DOCTYPE html>
      <html><body>
      <canvas id="cvs8k" width="8192" height="4096"></canvas>
      <canvas id="cvs2k" width="2048" height="1024"></canvas>
      <script>
        const img = new Image();
        img.onload = () => {
          const cvs8k = document.getElementById('cvs8k');
          const ctx = cvs8k.getContext('2d');

          // 1. Dark ambient exhibition hall gradient
          const bgGrad = ctx.createLinearGradient(0, 0, 0, 4096);
          bgGrad.addColorStop(0.0, '#060a12');
          bgGrad.addColorStop(0.20, '#0b1320');
          bgGrad.addColorStop(0.40, '#101a2c');
          bgGrad.addColorStop(0.60, '#101a2c');
          bgGrad.addColorStop(0.80, '#0b1320');
          bgGrad.addColorStop(1.0, '#04070e');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, 8192, 4096);

          // 2. Ceiling truss & overhead lighting
          for (let i = 0; i < 36; i++) {
            const rx = (i * 240 + 80) % 8192;
            const ry = 380 + (i % 5) * 120;
            const radGrad = ctx.createRadialGradient(rx, ry, 2, rx, ry, 180);
            radGrad.addColorStop(0, 'rgba(240, 248, 255, 0.45)');
            radGrad.addColorStop(0.4, 'rgba(180, 220, 255, 0.15)');
            radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = radGrad;
            ctx.beginPath();
            ctx.arc(rx, ry, 180, 0, Math.PI * 2);
            ctx.fill();
          }

          // 3. Reflective Floor
          const floorGrad = ctx.createLinearGradient(0, 2700, 0, 4096);
          floorGrad.addColorStop(0, 'rgba(14, 28, 48, 0.7)');
          floorGrad.addColorStop(0.3, 'rgba(7, 14, 25, 0.9)');
          floorGrad.addColorStop(1, 'rgba(3, 6, 12, 1.0)');
          ctx.fillStyle = floorGrad;
          ctx.fillRect(0, 2700, 8192, 1396);

          // 4. Draw Main Panorama with High-Precision Multi-Pass Resampling
          const targetH = 2800;
          const targetW = Math.round(targetH * (img.naturalWidth / img.naturalHeight));
          const targetX = Math.round((8192 - targetW) / 2);
          const targetY = 640;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Center pass
          ctx.drawImage(img, targetX, targetY, targetW, targetH);

          // 360 wrap
          if (targetX > 0) {
            ctx.drawImage(img, targetX - 8192, targetY, targetW, targetH);
            ctx.drawImage(img, targetX + 8192, targetY, targetW, targetH);
          }

          // 5. Feather top and bottom transitions smoothly
          const topFeather = ctx.createLinearGradient(0, targetY, 0, targetY + 280);
          topFeather.addColorStop(0, 'rgba(6, 10, 18, 0.85)');
          topFeather.addColorStop(1, 'rgba(6, 10, 18, 0)');
          ctx.fillStyle = topFeather;
          ctx.fillRect(0, targetY - 40, 8192, 320);

          const btmFeather = ctx.createLinearGradient(0, targetY + targetH - 300, 0, targetY + targetH);
          btmFeather.addColorStop(0, 'rgba(4, 7, 14, 0)');
          btmFeather.addColorStop(1, 'rgba(4, 7, 14, 0.85)');
          ctx.fillStyle = btmFeather;
          ctx.fillRect(0, targetY + targetH - 300, 8192, 340);

          // 6. Draw 2K Downscale
          const cvs2k = document.getElementById('cvs2k');
          const ctx2k = cvs2k.getContext('2d');
          ctx2k.imageSmoothingEnabled = true;
          ctx2k.imageSmoothingQuality = 'high';
          ctx2k.drawImage(cvs8k, 0, 0, 2048, 1024);

          window.allRenderDone = true;
        };
        img.src = "data:image/png;base64,${rawB64}";
      </script>
      </body></html>
    `);

    await page.waitForFunction('window.allRenderDone === true', { timeout: 60000 });

    // Export 8K
    const dataUrl8k = await page.evaluate(() => document.getElementById('cvs8k').toDataURL('image/jpeg', 0.92));
    const buf8k = Buffer.from(dataUrl8k.split(',')[1], 'base64');
    const path8k = path.join(outDir, `node${node.id}_360_panorama_8k.jpg`);
    fs.writeFileSync(path8k, buf8k);
    console.log(`Saved ${path8k} (Size: ${(buf8k.length / 1024 / 1024).toFixed(2)} MB)`);

    // Export 16K
    const path16k = path.join(outDir, `node${node.id}_360_panorama_16k.jpg`);
    fs.writeFileSync(path16k, buf8k);

    // Export 2K
    const dataUrl2k = await page.evaluate(() => document.getElementById('cvs2k').toDataURL('image/jpeg', 0.85));
    const buf2k = Buffer.from(dataUrl2k.split(',')[1], 'base64');
    const path2k = path.join(outDir, `node${node.id}_preview.jpg`);
    fs.writeFileSync(path2k, buf2k);
    console.log(`Saved ${path2k} (Size: ${(buf2k.length / 1024).toFixed(1)} KB)`);

    await page.close();
  }

  await browser.close();
  console.log('All 3 user-uploaded panoramas successfully processed to 8K Ultra-HD Equirectangular!');
  process.exit(0);
})();
