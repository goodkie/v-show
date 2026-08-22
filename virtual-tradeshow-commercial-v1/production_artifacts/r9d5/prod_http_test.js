const https = require('https');

const urls = [
  '/assets/demo/wilo/authentic-booth/view_01.jpg',
  '/assets/demo/wilo/authentic-booth/view_02.jpg',
  '/assets/demo/wilo/authentic-booth/view_03.jpg',
  '/assets/demo/wilo/authentic-booth/view_04.jpg',
  '/assets/demo/wilo/authentic-booth/view_05.jpg',
  '/assets/demo/wilo/authentic-booth/view_06.jpg',
  '/assets/demo/wilo/authentic-booth/view_07.jpg',
  '/assets/demo/wilo/authentic-booth/view_08.jpg',
  '/assets/demo/wilo/authentic-booth/view_09.jpg',
  '/assets/demo/wilo/authentic-booth/view_10.jpg',
  '/assets/demo/wilo/authentic-booth/view_11.jpg',
  '/assets/demo/wilo/authentic-booth/view_12.jpg',
];

let passed = 0, failed = 0;

async function testUrl(path) {
  return new Promise((resolve) => {
    https.get(`https://v-show-commercial-v1-production.up.railway.app${path}`, res => {
      let size = 0;
      res.on('data', d => size += d.length);
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        const ok = res.statusCode === 200 && ct.includes('image') && size > 1000;
        console.log(`[${ok ? 'PASS' : 'FAIL'}] HTTP ${res.statusCode} ${ct} ${(size/1024).toFixed(1)}KB -> ${path}`);
        resolve(ok);
      });
    }).on('error', err => {
      console.log(`[FAIL] ERROR: ${err.message} -> ${path}`);
      resolve(false);
    });
  });
}

(async () => {
  console.log('Testing Production HTTP Image URLs on Railway:');
  for (const u of urls) {
    const ok = await testUrl(u);
    if (ok) passed++; else failed++;
  }
  console.log(`\nPRODUCTION HTTP SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  process.exit(failed > 0 ? 1 : 0);
})();
