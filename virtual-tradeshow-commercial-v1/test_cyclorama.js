const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const outDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

const testHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin:0; background:#030712; overflow:hidden; }
#c { width:100vw; height:100vh; display:block; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
<canvas id="c"></canvas>
<script>
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 1, 2000);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(2);
renderer.outputEncoding = THREE.sRGBEncoding;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = true;
controls.rotateSpeed = -0.4;
controls.target.set(0, -10, 200);
controls.maxAzimuthAngle = Math.PI * 0.45;
controls.minAzimuthAngle = -Math.PI * 0.45;
controls.maxPolarAngle = Math.PI * 0.65;
controls.minPolarAngle = Math.PI * 0.35;

// High-Res Cylindrical Cyclorama
const loader = new THREE.TextureLoader();
loader.load('/assets/demo/dna-showcase/ultra/node0_entrance_8k.jpg', (tex) => {
  tex.encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  
  // Radius 250, Height 280, 160 deg arc
  const cylGeo = new THREE.CylinderGeometry(250, 250, 280, 64, 16, true, Math.PI * 0.05, Math.PI * 0.90);
  cylGeo.scale(-1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(cylGeo, mat);
  mesh.rotation.y = Math.PI * 0.5;
  mesh.position.set(0, 0, 0);
  scene.add(mesh);
  
  // Add a test pin directly on the AMR
  const pinGeo = new THREE.SphereGeometry(6, 16, 16);
  const pinMat = new THREE.MeshBasicMaterial({ color: 0x00c2ff });
  const pin = new THREE.Mesh(pinGeo, pinMat);
  pin.position.set(-10, -65, 235);
  scene.add(pin);
  
  // Add pin on CoBot array
  const pin2 = new THREE.Mesh(pinGeo, new THREE.MeshBasicMaterial({ color: 0xff0055 }));
  pin2.position.set(130, -35, 195);
  scene.add(pin2);
});

function anim() {
  requestAnimationFrame(anim);
  controls.update();
  renderer.render(scene, camera);
}
anim();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(baseDir, 'test-cyclorama.html'), testHtml, 'utf8');

const server = http.createServer((req, res) => {
  let filePath = path.join(baseDir, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.jpg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(6005, async () => {
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--window-size=1600,900'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
    await page.goto('http://127.0.0.1:6005/test-cyclorama.html', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2500));
    
    // Front View
    await page.screenshot({ path: path.join(outDir, '69_CYCLORAMA_FRONT.png') });
    console.log('Saved 69_CYCLORAMA_FRONT.png');
    
    // Rotate Left
    await page.mouse.move(800, 450);
    await page.mouse.down();
    await page.mouse.move(1200, 450, { steps: 30 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(outDir, '70_CYCLORAMA_LEFT.png') });
    console.log('Saved 70_CYCLORAMA_LEFT.png');

    await browser.close();
  } catch(e) {
    console.error(e);
  }
  server.close();
  process.exit(0);
});
