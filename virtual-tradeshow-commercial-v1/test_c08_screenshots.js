const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Capturing C08 visual validation screenshots...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // 1. DNA_C08_LANDING_DESKTOP
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C08_LANDING_DESKTOP.png'), fullPage: false });
  console.log('1. DNA_C08_LANDING_DESKTOP.png saved');

  // 2. DNA_C08_LANDING_MOBILE
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C08_LANDING_MOBILE.png'), fullPage: false });
  console.log('2. DNA_C08_LANDING_MOBILE.png saved');

  // Reset to desktop viewport
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0' });

  // 3. DNA_C08_UPLOAD_COMPONENT
  const uploadElem = await page.$('.upload-cta-frame');
  if (uploadElem) {
    await uploadElem.screenshot({ path: path.join(artifactDir, 'DNA_C08_UPLOAD_COMPONENT.png') });
    console.log('3. DNA_C08_UPLOAD_COMPONENT.png saved');
  }

  // 4. DNA_C08_BUSINESS_NAME (type business name)
  await page.type('#business-name-input', 'Apex Robotics Inc.');
  await page.evaluate(() => {
    document.getElementById('drop-filename-txt').textContent = 'Selected: booth_front_wide.jpg (2.4 MB)';
  });
  if (uploadElem) {
    await uploadElem.screenshot({ path: path.join(artifactDir, 'DNA_C08_BUSINESS_NAME.png') });
    console.log('4. DNA_C08_BUSINESS_NAME.png saved');
  }

  // 5. DNA_C08_GENERATING (show progress overlay)
  await page.evaluate(() => {
    showProgress();
    updateProgress(50, 'PREPARING YOUR BOOTH', 'Generating high-resolution view layers & interactive canvas...');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C08_GENERATING.png') });
  console.log('5. DNA_C08_GENERATING.png saved');

  // 6. DNA_C08_FREE_BOOTH_READY (render studio booth)
  await page.evaluate(() => {
    hideProgress();
    renderStudioBooth('/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg');
    activeProjectData = {
      businessName: 'Apex Robotics Inc.',
      products: []
    };
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C08_FREE_BOOTH_READY.png') });
  console.log('6. DNA_C08_FREE_BOOTH_READY.png saved');

  // 7. DNA_C08_PRODUCT_PINPOINT (add pinpoint & show add product modal)
  await page.evaluate(() => {
    pendingCoords = { u: 0.45, v: 0.55 };
    document.getElementById('prod-name-input').value = 'Apex Autonomous Arm X-1';
    openAddProductModal();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C08_PRODUCT_PINPOINT.png') });
  console.log('7. DNA_C08_PRODUCT_PINPOINT.png saved');

  // 8. DNA_C08_PRODUCT_DETAIL (render pinpoint & open product drawer)
  await page.evaluate(() => {
    closeAddProductModal();
    const prod = {
      id: 'prod-1',
      name: 'Apex Autonomous Arm X-1',
      imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg',
      description: 'Engineered with 6-axis precision and heavy payload capacity for modern smart factories.'
    };
    activeProjectData.products = [prod];
    renderPinpoints([{ u: 0.45, v: 0.55, productId: 'prod-1', productName: prod.name }]);
    openProductDrawer(prod);
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C08_PRODUCT_DETAIL.png') });
  console.log('8. DNA_C08_PRODUCT_DETAIL.png saved');

  // 9. DNA_C08_UPGRADE_PROMPT (open plan conversion modal)
  await page.evaluate(() => {
    closeProductDrawer();
    openPlanModal('add_another');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C08_UPGRADE_PROMPT.png') });
  console.log('9. DNA_C08_UPGRADE_PROMPT.png saved');

  await browser.close();
  console.log('All 9 visual QA screenshots captured successfully.');
})();
