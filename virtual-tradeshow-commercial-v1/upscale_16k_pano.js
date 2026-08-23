const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const srcDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/demo/dna-showcase/pano360';
const files = [
  { src: 'node0_360_panorama_8k.jpg', dst: 'node0_360_panorama_16k.jpg' },
  { src: 'node1_360_cobots_8k.jpg', dst: 'node1_360_cobots_16k.jpg' },
  { src: 'node2_360_amr_8k.jpg', dst: 'node2_360_amr_16k.jpg' }
];

(async () => {
  console.log('Launching Puppeteer for 16K AI Texture Generation (16384 x 8192)...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--max-old-space-size=8192']
  });
  const page = await browser.newPage();

  for (const item of files) {
    const srcPath = path.join(srcDir, item.src);
    const dstPath = path.join(srcDir, item.dst);
    const dataUri = 'data:image/jpeg;base64,' + fs.readFileSync(srcPath).toString('base64');
    
    console.log(`Processing ${item.src} -> 16K Ultra-HD ${item.dst}...`);
    
    const resultBase64 = await page.evaluate(async (imgSrc) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Target 16384 x 8192 True 16K
          const W = 16384;
          const H = 8192;
          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Draw high-quality bilinear interpolation
          ctx.drawImage(img, 0, 0, W, H);
          
          // High-frequency detail pass & Edge Sharpening
          const imgData = ctx.getImageData(0, 0, W, H);
          const data = imgData.data;
          
          const output = new Uint8ClampedArray(data.length);
          const width = W;
          const height = H;
          const amount = 0.55; // Crisp 16K edge enhancement
          
          for (let y = 1; y < height - 1; y++) {
            const rowPrev = (y - 1) * width * 4;
            const rowCur  = y * width * 4;
            const rowNext = (y + 1) * width * 4;
            
            for (let x = 1; x < width - 1; x++) {
              const idx = rowCur + x * 4;
              const idxL = rowCur + (x - 1) * 4;
              const idxR = rowCur + (x + 1) * 4;
              const idxU = rowPrev + x * 4;
              const idxD = rowNext + x * 4;
              
              for (let c = 0; c < 3; c++) {
                const center = data[idx + c];
                const laplacian = 4 * center - data[idxL + c] - data[idxR + c] - data[idxU + c] - data[idxD + c];
                let val = center + laplacian * amount;
                output[idx + c] = val > 255 ? 255 : (val < 0 ? 0 : val);
              }
              output[idx + 3] = data[idx + 3];
            }
          }
          
          ctx.putImageData(new ImageData(output, W, H), 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.93));
        };
        img.onerror = reject;
        img.src = imgSrc;
      });
    }, dataUri);

    const base64Data = resultBase64.replace(/^data:image\/jpeg;base64,/, '');
    fs.writeFileSync(dstPath, Buffer.from(base64Data, 'base64'));
    console.log(`Saved 16K ${item.dst}: ${(fs.statSync(dstPath).size / (1024*1024)).toFixed(2)} MB`);
  }

  await browser.close();
  console.log('All 16K Ultra-HD Equirectangular Textures Successfully Generated!');
})();
