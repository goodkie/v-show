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

  // Initialize Owner Mode and open Owner Product Editor
  await page.evaluate(() => {
    window.VIEWER_MODE = 'OWNER_EDITOR';
    window.isProjectOwner = true;
    openOwnerProductEditor();
  });
  await new Promise(r => setTimeout(r, 1000));

  const forensic = await page.evaluate(() => {
    const modal = document.getElementById('ownerProductEditorModal');
    const card = modal?.querySelector('.viewport-modal-card');
    const form = document.getElementById('ownerProductForm');
    const body = form?.querySelector('.viewport-modal-body');
    const media = document.getElementById('productMediaTabsContainer');
    const nameGroup = document.getElementById('opeName')?.parentElement;

    const modalRect = modal?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    const formRect = form?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();

    const bodyComputed = body ? window.getComputedStyle(body) : null;
    const formComputed = form ? window.getComputedStyle(form) : null;
    const cardComputed = card ? window.getComputedStyle(card) : null;

    // Check all children of form/body for horizontal overflow
    const allElements = Array.from(modal.querySelectorAll('*'));
    const overflowing = [];
    allElements.forEach(el => {
      const r = el.getBoundingClientRect();
      if (cardRect && (r.right > cardRect.right + 2 || r.left < cardRect.left - 2)) {
        overflowing.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          rect: { left: r.left, right: r.right, width: r.width },
          cardRight: cardRect.right,
          style: el.getAttribute('style')
        });
      }
    });

    return {
      modalViewportWidth: window.innerWidth,
      modalContentWidth: cardRect?.width,
      modalScrollWidth: card?.scrollWidth,
      modalOverflowX: cardComputed?.overflowX,
      formContainerDisplay: formComputed?.display,
      formContainerGridTemplate: formComputed?.gridTemplateColumns,
      formContainerFlexDirection: formComputed?.flexDirection,
      bodyDisplay: bodyComputed?.display,
      bodyFlexDirection: bodyComputed?.flexDirection,
      bodyOverflowX: bodyComputed?.overflowX,
      productMediaWidth: media?.getBoundingClientRect()?.width,
      productFieldsContainerWidth: bodyRect?.width,
      overflowingElementsCount: overflowing.length,
      sampleOverflowing: overflowing.slice(0, 10)
    };
  });

  console.log('DOM Forensic Analysis for Product Modal:', JSON.stringify(forensic, null, 2));

  await browser.close();
})();
