const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// 1. 임시 로컬 스트리밍 HTTP 서버 (206 partial content 지원)
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, '..', 'app_build', 'client', reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Not Found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (reqPath.endsWith('.mp4')) {
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } else {
    res.writeHead(200);
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(4899, async () => {
  console.log('Local extraction server listening on 4899');
  
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-gpu'] 
  });

  const videos = [
    { 
      url: 'http://127.0.0.1:4899/assets/demo/virtual-fitting-room/fashion.mp4',
      name: 'fashion.mp4',
      out: path.join(__dirname, '..', 'app_build', 'client', 'assets', 'demo', 'virtual-fitting-room', 'fashion-poster-last-frame.jpg')
    },
    { 
      url: 'http://127.0.0.1:4899/assets/demo/virtual-makeup-artist/makeup.mp4',
      name: 'makeup.mp4',
      out: path.join(__dirname, '..', 'app_build', 'client', 'assets', 'demo', 'virtual-makeup-artist', 'makeup-poster-last-frame.jpg')
    }
  ];

  for (const v of videos) {
    const page = await browser.newPage();
    const html = `
      <html>
        <body style="margin:0;background:#000;">
          <video id="vid" src="${v.url}" muted playsinline></video>
          <canvas id="can"></canvas>
        </body>
      </html>
    `;
    await page.setContent(html);

    const meta = await page.evaluate(async () => {
      const vid = document.getElementById('vid');
      await new Promise((res, rej) => {
        vid.onloadedmetadata = () => res();
        vid.onerror = () => rej(new Error('Video load failed'));
      });

      const dur = vid.duration;
      const w = vid.videoWidth || 1920;
      const h = vid.videoHeight || 1080;
      const targetTime = Math.max(0, dur - 0.2);

      vid.currentTime = targetTime;
      await new Promise(r => vid.onseeked = r);

      const can = document.getElementById('can');
      can.width = w;
      can.height = h;
      const ctx = can.getContext('2d');
      ctx.drawImage(vid, 0, 0, w, h);
      return {
        w, h, dur, targetTime,
        data: can.toDataURL('image/jpeg', 0.92)
      };
    });

    const base64 = meta.data.replace(/^data:image\/jpeg;base64,/, '');
    fs.writeFileSync(v.out, Buffer.from(base64, 'base64'));

    console.log(`✅ Extracted Last Frame for ${v.name}:`);
    console.log(` - Resolution: ${meta.w}x${meta.h}`);
    console.log(` - Duration: ${meta.dur.toFixed(2)}s`);
    console.log(` - Timestamp: ${meta.targetTime.toFixed(2)}s`);
    console.log(` - Saved to: ${v.out} (${(fs.statSync(v.out).size / 1024).toFixed(1)} KB)\n`);

    await page.close();
  }

  await browser.close();
  server.close();
  console.log('=== ALL LAST FRAME POSTERS EXTRACTED AND VERIFIED ===');
  process.exit(0);
});
