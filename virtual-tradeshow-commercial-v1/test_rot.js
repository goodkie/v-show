const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const outDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

function makeTest(rotY) {
  return `<!DOCTYPE html>
<html>
<head><meta charset='utf-8'><style>body{margin:0;overflow:hidden;background:#000;}</style>
<script src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'></script>
</head>
<body>
<canvas id='c'></canvas>
<script>
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1600/900, 1, 2000);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, 100);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setSize(1600, 900);
renderer.setPixelRatio(2);
renderer.outputEncoding = THREE.sRGBEncoding;

const loader = new THREE.TextureLoader();
loader.load('/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg', (tex) => {
  tex.encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  const sphereGeo = new THREE.SphereGeometry(500, 128, 64);
  sphereGeo.scale(-1, 1, 1);
  const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide }));
  sphere.rotation.y = ${rotY};
  scene.add(sphere);
  
  // Test Pin directly in front
  const pin = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00c2ff }));
  pin.position.set(0, -30, 200);
  scene.add(pin);
  
  renderer.render(scene, camera);
});
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const q = req.url.split('?')[0];
  if (q.startsWith('/test-rot-')) {
    const rot = parseFloat(q.replace('/test-rot-', '').replace('.html', ''));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(makeTest(rot));
    return;
  }
  let filePath = path.join(baseDir, decodeURIComponent(q));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.jpg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(6010, async () => {
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--window-size=1600,900'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
    
    // Test rotations: 0, PI/2, PI, 3PI/2
    const rots = [0, 1.5708, 3.14159, 4.71239];
    for (let i = 0; i < rots.length; i++) {
      await page.goto('http://127.0.0.1:6010/test-rot-' + rots[i] + '.html', { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: path.join(outDir, '71_ROT_' + i + '.png') });
      console.log('Saved 71_ROT_' + i + '.png for rotY = ' + rots[i]);
    }
    await browser.close();
  } catch(e) {
    console.error(e);
  }
  server.close();
  process.exit(0);
});
