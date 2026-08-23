const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const dir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/dna-showcase/pano360';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const files = ['node0_360_panorama_8k.jpg', 'node1_360_cobots_8k.jpg', 'node2_360_amr_8k.jpg'];
  
  for (let i = 0; i < files.length; i++) {
    const page = await browser.newPage();
    const realFile = path.join(dir, files[i]);
    const b64 = fs.readFileSync(realFile).toString('base64');
    
    await page.setContent(`
      <!DOCTYPE html>
      <html><body>
      <canvas id="cvs" width="2048" height="1024"></canvas>
      <script>
        const img = new Image();
        img.onload = () => {
          const cvs = document.getElementById('cvs');
          const ctx = cvs.getContext('2d');
          ctx.drawImage(img, 0, 0, 2048, 1024);
          window.imgReady = true;
        };
        img.onerror = () => { window.imgError = true; };
        img.src = "data:image/jpeg;base64,${b64}";
      </script>
      </body></html>
    `);
    
    await page.waitForFunction('window.imgReady === true || window.imgError === true', { timeout: 30000 });
    const isError = await page.evaluate(() => window.imgError);
    if (isError) {
      console.error('Error loading image', files[i]);
      await page.close();
      continue;
    }
    
    const dataUrl = await page.evaluate(() => {
      return document.getElementById('cvs').toDataURL('image/jpeg', 0.85);
    });
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    const outPath = path.join(dir, 'node' + i + '_preview.jpg');
    fs.writeFileSync(outPath, buffer);
    console.log('Saved node' + i + '_preview.jpg, size:', buffer.length);
    await page.close();
  }
  
  await browser.close();
  process.exit(0);
})();
