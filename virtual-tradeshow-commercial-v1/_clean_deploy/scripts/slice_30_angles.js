const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const gridImgPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787407708333.jpg';
const heroImgPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787407919379.jpg';

const outDir = path.join(__dirname, '../client/assets/demo/dna-showcase/angles');
const heroDir = path.join(__dirname, '../client/assets/demo/dna-showcase/hero');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(heroDir)) fs.mkdirSync(heroDir, { recursive: true });

// Copy high res hero
fs.copyFileSync(heroImgPath, path.join(heroDir, 'dna_robotic_hero_master.jpg'));
fs.copyFileSync(heroImgPath, path.join(heroDir, 'dna_showcase_photoreal_hero.jpg'));
fs.copyFileSync(gridImgPath, path.join(outDir, 'grid_contact_sheet.jpg'));

console.log('Saved master hero and grid contact sheet');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const gridBase64 = fs.readFileSync(gridImgPath).toString('base64');
  const dataUrl = 'data:image/jpeg;base64,' + gridBase64;

  const slices = await page.evaluate(async (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const results = [];
        const totalW = img.width;
        const totalH = img.height;
        
        // Accurate bounds
        const startX = totalW * 0.062;
        const startY = totalH * 0.052;
        const gridW = totalW - startX;
        const gridH = totalH - startY;

        const cellW = gridW / 10;
        const cellH = gridH / 3;

        const rowNames = ['floor', 'eye', '6ft'];

        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 10; c++) {
            const canvas = document.createElement('canvas');
            canvas.width = 960;
            canvas.height = 640;
            const ctx = canvas.getContext('2d');
            
            const sx = startX + c * cellW;
            const sy = startY + r * cellH;
            ctx.drawImage(img, sx, sy, cellW, cellH, 0, 0, canvas.width, canvas.height);
            results.push({
              name: 'angle_' + rowNames[r] + '_' + String(c + 1).padStart(2, '0') + '.jpg',
              data: canvas.toDataURL('image/jpeg', 0.94),
              row: rowNames[r],
              col: c + 1
            });
          }
        }
        resolve(results);
      };
      img.src = url;
    });
  }, dataUrl);

  slices.forEach(s => {
    const buf = Buffer.from(s.data.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
    fs.writeFileSync(path.join(outDir, s.name), buf);
  });
  console.log('Successfully sliced ' + slices.length + ' angle images into ' + outDir);

  await browser.close();
})();
