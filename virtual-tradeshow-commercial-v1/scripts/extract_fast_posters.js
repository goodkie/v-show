const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function extractFast() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });

  const videos = [
    {
      name: 'fashion.mp4',
      src: 'file:///' + path.resolve('app_build/client/assets/demo/virtual-fitting-room/fashion.mp4').replace(/\\/g, '/'),
      out: path.resolve('app_build/client/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg')
    },
    {
      name: 'makeup.mp4',
      src: 'file:///' + path.resolve('app_build/client/assets/demo/virtual-makeup-artist/makeup.mp4').replace(/\\/g, '/'),
      out: path.resolve('app_build/client/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg')
    }
  ];

  for (const v of videos) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="margin:0; background:#000; overflow:hidden;">
        <video id="v" src="${v.src}" style="width:100vw; height:100vh; object-fit:cover;" muted playsinline></video>
      </body>
      </html>
    `;
    await page.setContent(html);

    // Play to the end
    await page.evaluate(async () => {
      const vid = document.getElementById('v');
      await new Promise((res) => {
        vid.onloadedmetadata = () => res();
      });
      // seek to end
      vid.currentTime = Math.max(0, vid.duration - 0.2);
      await new Promise(r => setTimeout(r, 600));
    });

    await page.screenshot({ path: v.out, type: 'jpeg', quality: 90 });
    console.log(`📸 Extracted ${v.name} poster to ${v.out}`);
    await page.close();
  }

  await browser.close();
  console.log('✅ ALL POSTERS EXTRACTED');
}

extractFast().catch(console.error);
