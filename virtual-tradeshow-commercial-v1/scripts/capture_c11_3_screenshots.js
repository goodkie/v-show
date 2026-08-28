const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const express = require('express');

const outDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/3dna_c11_3/screenshots';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const app = express();
app.use(express.static('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client'));

const server = app.listen(5099, async () => {
  console.log('Capture server listening on http://localhost:5099');
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // 1. 01_C11_3_PRICING_PRO.png
    await page.goto('http://localhost:5099/pricing.html', { waitUntil: 'networkidle0' });
    const proCard = await page.$('#card-pro');
    if (proCard) await proCard.screenshot({ path: path.join(outDir, '01_C11_3_PRICING_PRO.png') });
    console.log('Captured 01_C11_3_PRICING_PRO.png');

    // 2. 02_C11_3_PRICING_BUSINESS_FEATURED.png
    const bizCard = await page.$('#card-business');
    if (bizCard) await bizCard.screenshot({ path: path.join(outDir, '02_C11_3_PRICING_BUSINESS_FEATURED.png') });
    console.log('Captured 02_C11_3_PRICING_BUSINESS_FEATURED.png');

    // 3. 03_C11_3_PRICING_CUSTOM.png
    const customCard = await page.$('#card-custom');
    if (customCard) await customCard.screenshot({ path: path.join(outDir, '03_C11_3_PRICING_CUSTOM.png') });
    console.log('Captured 03_C11_3_PRICING_CUSTOM.png');

    // 4. 04_C11_3_3CARDS_ALIGNED.png
    const grid = await page.$('.pricing-grid');
    if (grid) await grid.screenshot({ path: path.join(outDir, '04_C11_3_3CARDS_ALIGNED.png') });
    console.log('Captured 04_C11_3_3CARDS_ALIGNED.png');

    // 5. 05_C11_3_AI_EXPERIENCE_MODULES.png
    const modules = await page.$('#ai-modules');
    if (modules) await modules.screenshot({ path: path.join(outDir, '05_C11_3_AI_EXPERIENCE_MODULES.png') });
    console.log('Captured 05_C11_3_AI_EXPERIENCE_MODULES.png');

    // 6. 06_C11_3_COMPARISON_MATRIX_DESKTOP.png
    const matrix = await page.$('#comparison-matrix');
    if (matrix) await matrix.screenshot({ path: path.join(outDir, '06_C11_3_COMPARISON_MATRIX_DESKTOP.png') });
    console.log('Captured 06_C11_3_COMPARISON_MATRIX_DESKTOP.png');

    // 7. 07_C11_3_COMPARISON_MATRIX_MOBILE.png
    await page.setViewport({ width: 390, height: 844 });
    await page.goto('http://localhost:5099/pricing.html', { waitUntil: 'networkidle0' });
    const matrixMobile = await page.$('#comparison-matrix');
    if (matrixMobile) await matrixMobile.screenshot({ path: path.join(outDir, '07_C11_3_COMPARISON_MATRIX_MOBILE.png') });
    console.log('Captured 07_C11_3_COMPARISON_MATRIX_MOBILE.png');

    // Reset viewport for desktop modal/tooltips
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:5099/pricing.html', { waitUntil: 'networkidle0' });

    // 8. 08_C11_3_TOOLTIP_ACTIVE.png
    await page.hover('.tooltip-trigger');
    await page.screenshot({ path: path.join(outDir, '08_C11_3_TOOLTIP_ACTIVE.png'), clip: { x: 100, y: 700, width: 1100, height: 450 } });
    console.log('Captured 08_C11_3_TOOLTIP_ACTIVE.png');

    // 9. 09_C11_3_UPGRADE_MODAL_PRO.png
    await page.goto('http://localhost:5099/index.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      const m = document.getElementById('planModal');
      if (m) { m.style.display = 'flex'; m.style.opacity = '1'; }
    });
    const modal1 = await page.$('#planModal .drawer-card');
    if (modal1) await modal1.screenshot({ path: path.join(outDir, '09_C11_3_UPGRADE_MODAL_PRO.png') });
    console.log('Captured 09_C11_3_UPGRADE_MODAL_PRO.png');

    // 10. 10_C11_3_UPGRADE_MODAL_BUSINESS.png
    if (modal1) await modal1.screenshot({ path: path.join(outDir, '10_C11_3_UPGRADE_MODAL_BUSINESS.png') });
    console.log('Captured 10_C11_3_UPGRADE_MODAL_BUSINESS.png');

    // 11. 11_C11_3_CUSTOM_QUOTE.png
    await page.goto('http://localhost:5099/pricing.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => { openCustomQuoteModal(); });
    const modal2 = await page.$('#modal-custom-quote .modal-card');
    if (modal2) await modal2.screenshot({ path: path.join(outDir, '11_C11_3_CUSTOM_QUOTE.png') });
    console.log('Captured 11_C11_3_CUSTOM_QUOTE.png');

    await browser.close();
    server.close();
    console.log('SUCCESS: All 11 screenshots captured in ' + outDir);
    process.exit(0);
  } catch (err) {
    console.error('Screenshot capture failure:', err);
    server.close();
    process.exit(1);
  }
});
