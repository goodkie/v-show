const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  const iframes = await page.frames();
  console.log(`Total Frames: ${iframes.length}`);

  for (let i = 0; i < iframes.length; i++) {
    const frame = iframes[i];
    const url = frame.url();
    if (!url.includes('demo-')) continue;

    const data = await frame.evaluate(() => {
      try {
        const mat = window.photoMaterial;
        const tex = mat ? mat.map : null;
        const rend = window.renderer;
        const can = document.getElementById('three-canvas');
        return {
          title: document.title,
          canvasClientWidth: can ? can.clientWidth : 0,
          canvasClientHeight: can ? can.clientHeight : 0,
          canvasWidth: can ? can.width : 0,
          canvasHeight: can ? can.height : 0,
          pixelRatio: rend ? rend.getPixelRatio() : 0,
          maxTextureSize: rend ? rend.capabilities.maxTextureSize : 0,
          textureLoaded: !!tex,
          textureImageSrc: (tex && tex.image) ? (tex.image.src ? tex.image.src.slice(-60) : 'NO_SRC') : 'NO_TEX',
          textureWidth: (tex && tex.image) ? (tex.image.naturalWidth || tex.image.width || 0) : 0,
          textureHeight: (tex && tex.image) ? (tex.image.naturalHeight || tex.image.height || 0) : 0,
          minFilter: tex ? tex.minFilter : 0,
          magFilter: tex ? tex.magFilter : 0,
          generateMipmaps: tex ? tex.generateMipmaps : null,
          anisotropy: tex ? tex.anisotropy : 0
        };
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log(`\n--- FRAME [${i}] ${url} ---`);
    console.log(JSON.stringify(data, null, 2));
  }

  await browser.close();
})();
