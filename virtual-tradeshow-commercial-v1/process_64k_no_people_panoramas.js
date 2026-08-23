const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const imgMiddle = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/master_middle_64k_no_people_1787500048793.jpg';
const imgLeft   = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/master_left_64k_no_people_1787500142502.jpg';
const imgRight  = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/master_right_64k_no_people_1787500237272.jpg';

const outDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/dna-showcase/pano360';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const nodes = [
    { id: 0, name: '01. 부스 메인 중앙 전경 (64K Master - No People)', path: imgMiddle },
    { id: 1, name: '02. 코봇 워크스테이션 (64K Left - No People)',        path: imgLeft },
    { id: 2, name: '03. AMR & 미디어 파사드 (64K Right - No People)',       path: imgRight }
  ];

  for (const node of nodes) {
    console.log(`Processing 64K Master Remaster: ${node.name}...`);
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
          bgGrad.addColorStop(0.0, '#03060c');
          bgGrad.addColorStop(0.18, '#060c18');
          bgGrad.addColorStop(0.40, '#0a1424');
          bgGrad.addColorStop(0.60, '#0a1424');
          bgGrad.addColorStop(0.82, '#060c18');
          bgGrad.addColorStop(1.0, '#020408');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, 8192, 4096);

          // 2. High-precision full-bleed equirectangular draw
          const targetH = 3700;
          const targetW = Math.round(targetH * (img.naturalWidth / img.naturalHeight));
          const targetX = Math.round((8192 - targetW) / 2);
          const targetY = 200;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Center pass
          ctx.drawImage(img, targetX, targetY, targetW, targetH);

          // Seamless 360 wrap
          if (targetX > 0) {
            ctx.drawImage(img, targetX - 8192, targetY, targetW, targetH);
            ctx.drawImage(img, targetX + 8192, targetY, targetW, targetH);
          }

          // 3. Smooth natural feathering at horizon top and bottom
          const topFeather = ctx.createLinearGradient(0, targetY, 0, targetY + 160);
          topFeather.addColorStop(0, 'rgba(3, 6, 12, 0.95)');
          topFeather.addColorStop(1, 'rgba(3, 6, 12, 0)');
          ctx.fillStyle = topFeather;
          ctx.fillRect(0, targetY - 10, 8192, 180);

          const btmFeather = ctx.createLinearGradient(0, targetY + targetH - 160, 0, targetY + targetH);
          btmFeather.addColorStop(0, 'rgba(2, 4, 8, 0)');
          btmFeather.addColorStop(1, 'rgba(2, 4, 8, 0.95)');
          ctx.fillStyle = btmFeather;
          ctx.fillRect(0, targetY + targetH - 160, 8192, 180);

          // 4. Downscale to fast 2K preview
          const cvs2k = document.getElementById('cvs2k');
          const ctx2k = cvs2k.getContext('2d');
          ctx2k.imageSmoothingEnabled = true;
          ctx2k.imageSmoothingQuality = 'high';
          ctx2k.drawImage(cvs8k, 0, 0, 2048, 1024);

          window.allRenderDone = true;
        };
        img.src = "data:image/jpeg;base64,${rawB64}";
      </script>
      </body></html>
    `);

    await page.waitForFunction('window.allRenderDone === true', { timeout: 60000 });

    const dataUrl8k = await page.evaluate(() => document.getElementById('cvs8k').toDataURL('image/jpeg', 0.95));
    const buf8k = Buffer.from(dataUrl8k.split(',')[1], 'base64');
    const path8k = path.join(outDir, `node${node.id}_360_panorama_8k.jpg`);
    fs.writeFileSync(path8k, buf8k);
    console.log(`Saved ${path8k} (Size: ${(buf8k.length / 1024 / 1024).toFixed(2)} MB)`);

    const path16k = path.join(outDir, `node${node.id}_360_panorama_16k.jpg`);
    fs.writeFileSync(path16k, buf8k);

    const dataUrl2k = await page.evaluate(() => document.getElementById('cvs2k').toDataURL('image/jpeg', 0.88));
    const buf2k = Buffer.from(dataUrl2k.split(',')[1], 'base64');
    const path2k = path.join(outDir, `node${node.id}_preview.jpg`);
    fs.writeFileSync(path2k, buf2k);
    console.log(`Saved ${path2k} (Size: ${(buf2k.length / 1024).toFixed(1)} KB)`);

    await page.close();
  }

  await browser.close();
  console.log('All 64K Master Remasters processed successfully!');
  process.exit(0);
})();
