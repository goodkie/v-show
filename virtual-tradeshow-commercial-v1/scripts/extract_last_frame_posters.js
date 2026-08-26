const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const fashionVideoPath = path.resolve('app_build/client/assets/demo/virtual-fitting-room/fashion.mp4');
const makeupVideoPath = path.resolve('app_build/client/assets/demo/virtual-makeup-artist/makeup.mp4');

const fashionPosterPath = path.resolve('app_build/client/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg');
const makeupPosterPath = path.resolve('app_build/client/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg');

async function extractLastFrame(videoPath, outputPath) {
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--allow-file-access-from-files'] 
  });
  const page = await browser.newPage();

  // Load video via file URL in HTML
  const fileUrl = 'file:///' + videoPath.replace(/\\/g, '/');
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0; background:#000;">
        <video id="v" src="${fileUrl}" muted playsinline></video>
        <canvas id="c"></canvas>
      </body>
    </html>
  `;
  await page.setContent(htmlContent);

  const videoMeta = await page.evaluate(async () => {
    const v = document.getElementById('v');
    await new Promise((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = (e) => rej(new Error('Video load error: ' + (v.error ? v.error.message : 'unknown')));
    });

    const duration = v.duration;
    const width = v.videoWidth;
    const height = v.videoHeight;

    // Seek to last frame (duration - 0.2s)
    const targetSeek = Math.max(0, duration - 0.2);
    v.currentTime = targetSeek;

    await new Promise((res) => {
      v.onseeked = () => res();
    });

    const c = document.getElementById('c');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, width, height);

    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    return {
      duration,
      width,
      height,
      targetSeek,
      dataUrl
    };
  });

  const base64Data = videoMeta.dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));

  console.log(`✅ Extracted Last Frame for ${path.basename(videoPath)}:`);
  console.log(` - Resolution: ${videoMeta.width}x${videoMeta.height}`);
  console.log(` - Duration: ${videoMeta.duration.toFixed(2)}s`);
  console.log(` - Last Decodable Timestamp: ${videoMeta.targetSeek.toFixed(2)}s`);
  console.log(` - Poster saved to: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)\n`);

  await browser.close();
  return videoMeta;
}

async function run() {
  console.log('=== [LAST FRAME POSTER EXTRACTION PIPELINE] ===\n');
  const fashionMeta = await extractLastFrame(fashionVideoPath, fashionPosterPath);
  const makeupMeta = await extractLastFrame(makeupVideoPath, makeupPosterPath);
  console.log('=== ALL LAST FRAME POSTERS GENERATED SUCCESSFULLY ===');
}

run().catch(console.error);
