const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/?projectId=prj-free-14e56240', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3500));

  await page.evaluate(() => {
    window.VIEWER_MODE = 'OWNER_EDITOR';
    window.isProjectOwner = true;
    setupStudioProducts(window.activeProjectData);
  });

  const res = await page.evaluate(() => {
    const blank = createInstantBlankPin({ u: 0.5, v: 0.5, hitPoint: new THREE.Vector3(0, 0, -400) });
    const card = document.querySelector(`[data-pin-id="${blank.id}"]`);
    if (card) card.click();
    const modal = document.getElementById('productPinContentEditorModal');
    return {
      blankId: blank.id,
      cardFound: !!card,
      modalDisplay: modal ? modal.style.display : null,
      activeTarget: window.currentEditingPinTarget
    };
  });
  console.log('Click test result:', res);
  await browser.close();
})();
