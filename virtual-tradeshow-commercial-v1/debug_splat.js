const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--window-size=1600,900'],
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err.message));

  await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-splat.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 8000));
  
  const res = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('*')).filter(el => el.textContent && el.textContent.includes('Processing splats'));
    return divs.map(d => ({ tag: d.tagName, className: d.className, outerHTML: d.outerHTML.substring(0, 150) }));
  });
  console.log('Processing divs:', res);
  await browser.close();
})();
