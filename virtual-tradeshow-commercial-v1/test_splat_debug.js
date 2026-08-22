// test_splat_debug.js
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox','--disable-setuid-sandbox',
      '--disable-gpu','--use-gl=angle','--use-angle=swiftshader',
      '--enable-webgl','--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--window-size=1400,900',
    ],
  });

  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.toString()}`));
  page.on('requestfailed', req => console.log(`[REQ FAILED] ${req.url()}: ${req.failure().errorText}`));

  console.log('Navigating...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-splat.html', { waitUntil: 'networkidle2' });
  
  console.log('Waiting 15s for splat load...');
  await new Promise(r => setTimeout(r, 15000));

  const state = await page.evaluate(() => {
    const ld = document.getElementById('loading');
    const fill = document.getElementById('ld-fill');
    const status = document.getElementById('ld-status');
    const pct = document.getElementById('ld-pct');
    return {
      loadingClasses: ld ? ld.className : 'null',
      fillWidth: fill ? fill.style.width : 'null',
      statusText: status ? status.textContent : 'null',
      pctText: pct ? pct.textContent : 'null',
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));

  await browser.close();
})();
