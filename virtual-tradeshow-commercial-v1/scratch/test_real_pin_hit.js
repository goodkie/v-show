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

  await page.evaluate(() => {
    window.VIEWER_MODE = 'OWNER_EDITOR';
    window.isProjectOwner = true;
    setupStudioProducts(window.activeProjectData);
  });
  await new Promise(r => setTimeout(r, 1000));

  // Perform browser hit testing at the location of rendered hotspot tags
  const hitTestResults = await page.evaluate(() => {
    const tags = Array.from(document.querySelectorAll('.hotspot-tag'));
    return tags.slice(0, 5).map(tag => {
      const rect = tag.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hitEl = document.elementFromPoint(centerX, centerY);
      const elementsAtPoint = document.elementsFromPoint(centerX, centerY).map(el => `${el.tagName}.${el.className}#${el.id}`);
      
      return {
        tagId: tag.id,
        pinId: tag.getAttribute('data-pin-id'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        hitElement: hitEl ? `${hitEl.tagName}.${hitEl.className}#${hitEl.id}` : null,
        isTagHit: hitEl === tag || tag.contains(hitEl),
        elementsAtPoint: elementsAtPoint
      };
    });
  });

  console.log('Hit Test Results:', JSON.stringify(hitTestResults, null, 2));

  // Test Real Mouse Click on first visible tag
  if (hitTestResults.length > 0 && hitTestResults[0].rect.width > 0) {
    const r = hitTestResults[0].rect;
    console.log(`Clicking at real coordinates: ${r.x + r.width/2}, ${r.y + r.height/2}`);
    await page.mouse.click(r.x + r.width/2, r.y + r.height/2);
    await new Promise(r => setTimeout(r, 800));

    const modalState = await page.evaluate(() => {
      const modal = document.getElementById('productPinContentEditorModal');
      return {
        display: modal ? window.getComputedStyle(modal).display : null,
        editingPin: window.currentEditingContentPin?.id,
        editingTarget: window.currentEditingPinTarget?.id
      };
    });
    console.log('Modal state after real mouse click:', modalState);
  }

  await browser.close();
})();
