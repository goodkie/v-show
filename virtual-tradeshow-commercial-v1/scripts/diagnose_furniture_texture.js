const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  console.log('Navigating directly to demo-furniture.html...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-furniture.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  const diag = await page.evaluate(() => {
    const mat = window.photoMaterial;
    const tex = mat ? mat.map : null;
    return {
      matExists: !!mat,
      texExists: !!tex,
      texImage: tex && tex.image ? (tex.image.src || 'NO_SRC') : 'NO_IMAGE',
      imageComplete: tex && tex.image ? tex.image.complete : false,
      imageNaturalWidth: tex && tex.image ? tex.image.naturalWidth : 0,
      imageNaturalHeight: tex && tex.image ? tex.image.naturalHeight : 0,
      sphereVisible: window.photoSphere ? window.photoSphere.visible : false
    };
  });

  console.log('--- FURNITURE DIAG ---');
  console.log(JSON.stringify(diag, null, 2));

  console.log('\n--- CONSOLE ERRORS ---');
  console.log(consoleErrors);

  await browser.close();
})();
