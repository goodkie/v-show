const puppeteer = require(path.resolve(__dirname, '../app_build/node_modules/puppeteer'));
const path = require('path');
const fs = require('fs');

(async () => {
  let execPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(execPath)) execPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 });
  await page.goto('http://localhost:3789', { waitUntil: 'networkidle0' });

  const overflows = await page.evaluate(() => {
    const docWidth = window.innerWidth;
    const elements = document.querySelectorAll('*');
    const over = [];
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > docWidth + 1) {
        over.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          right: rect.right,
          width: rect.width,
          docWidth
        });
      }
    });
    return over.slice(0, 15);
  });

  console.log('Overflow elements on mobile:', overflows);
  await browser.close();
})();