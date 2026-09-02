const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('https://v-show-commercial-v1-production.up.railway.app/?projectId=prj-free-14e56240', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewer-container', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  // Initialize Owner Mode
  await page.evaluate(() => {
    window.VIEWER_MODE = 'OWNER_EDITOR';
    window.isProjectOwner = true;
    setupStudioProducts(window.activeProjectData);
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- TEST 1: Hit Test & Real Mouse Click on Pin ---');
  const tagInfo = await page.evaluate(() => {
    const tags = Array.from(document.querySelectorAll('.hotspot-tag'));
    const visibleTag = tags.find(t => {
      const rect = t.getBoundingClientRect();
      return rect.width > 0 && rect.x > 50 && rect.x < 1300 && rect.y > 50 && rect.y < 800;
    });
    if (!visibleTag) return null;
    const rect = visibleTag.getBoundingClientRect();
    return {
      pinId: visibleTag.getAttribute('data-pin-id'),
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  });

  if (!tagInfo) {
    console.error('No visible tag found for click test');
  } else {
    console.log(`Clicking pin ${tagInfo.pinId} at (${tagInfo.centerX}, ${tagInfo.centerY})`);
    await page.mouse.click(tagInfo.centerX, tagInfo.centerY);
    await new Promise(r => setTimeout(r, 800));

    const ppceCheck = await page.evaluate(() => {
      const modal = document.getElementById('productPinContentEditorModal');
      return {
        visible: modal ? window.getComputedStyle(modal).display !== 'none' : false,
        zIndex: modal ? window.getComputedStyle(modal).zIndex : null,
        editingPinId: window.currentEditingContentPin?.id
      };
    });
    console.log('PPCE Modal State:', ppceCheck);

    console.log('--- TEST 2: Click + Add Product to this Pin ---');
    await page.evaluate(() => {
      const btn = document.getElementById('ppceBtnAddProduct');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const chooserCheck = await page.evaluate(() => {
      const ppce = document.getElementById('productPinContentEditorModal');
      const chooser = document.getElementById('pinFirstChoiceModal');
      return {
        ppceZIndex: ppce ? parseInt(window.getComputedStyle(ppce).zIndex, 10) : 0,
        chooserZIndex: chooser ? parseInt(window.getComputedStyle(chooser).zIndex, 10) : 0,
        chooserVisible: chooser ? window.getComputedStyle(chooser).display !== 'none' : false,
        isAbove: chooser && ppce ? parseInt(window.getComputedStyle(chooser).zIndex, 10) > parseInt(window.getComputedStyle(ppce).zIndex, 10) : false
      };
    });
    console.log('Chooser Modal Check (Above PPCE):', chooserCheck);

    console.log('--- TEST 3: Click Add New Product ---');
    await page.evaluate(() => {
      const btn = document.getElementById('btnPinFirstAddNewProduct');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const productEditorCheck = await page.evaluate(() => {
      const pe = document.getElementById('ownerProductEditorModal');
      return {
        peVisible: pe ? window.getComputedStyle(pe).display !== 'none' : false,
        peZIndex: pe ? window.getComputedStyle(pe).zIndex : null,
        pendingPin: window.pendingPinAttachment
      };
    });
    console.log('Product Editor State:', productEditorCheck);
  }

  await browser.close();
})();
