const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const srcDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/dna-showcase/pano360';
const files = [
  'node0_360_panorama_16k.jpg',
  'node1_360_cobots_16k.jpg',
  'node2_360_amr_16k.jpg'
];

(async () => {
  console.log('Optimizing 16K textures for ultra-fast instant web streaming...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--max-old-space-size=8192']
  });
  const page = await browser.newPage();

  for (const filename of files) {
    const filePath = path.join(srcDir, filename);
    const dataUri = 'data:image/jpeg;base64,' + fs.readFileSync(filePath).toString('base64');
    
    console.log(`Compressing ${filename} at 16384x8192 with optimal web quality...`);
    
    const resultBase64 = await page.evaluate(async (imgSrc) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const W = 16384;
          const H = 8192;
          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, W, H);
          // Optimal quality 0.85 delivers 16K crispness at ~4.5MB
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = imgSrc;
      });
    }, dataUri);

    const base64Data = resultBase64.replace(/^data:image\/jpeg;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    console.log(`Optimized 16K ${filename}: ${(fs.statSync(filePath).size / (1024*1024)).toFixed(2)} MB`);
  }

  await browser.close();
  console.log('16K Web Streaming Optimization Complete!');
})();
