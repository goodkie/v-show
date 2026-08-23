const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
const outDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{margin:0;overflow:hidden;background:#000;}
#c{width:100vw;height:100vh;display:block;}
.pin{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;background:#00c2ff;border-radius:50%;color:#000;font-weight:bold;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px #00c2ff;font-family:sans-serif;}
.pin::after{content:'+';}
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
<canvas id="c"></canvas>
<div id="host"></div>
<script>
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 2000);
camera.position.set(0, 0, 0.01);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(2);
renderer.outputEncoding = THREE.sRGBEncoding;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
controls.minDistance = 0.005;
controls.maxDistance = 0.05;
controls.rotateSpeed = -0.4;
controls.maxPolarAngle = Math.PI * 0.85;
controls.minPolarAngle = Math.PI * 0.15;

const loader = new THREE.TextureLoader();
loader.load('/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg', (tex) => {
  tex.encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16;
  const sphereGeo = new THREE.SphereGeometry(500, 128, 64);
  sphereGeo.scale(-1, 1, 1);
  const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide }));
  sphere.rotation.y = Math.PI * 0.5;
  scene.add(sphere);
});

// Pins on sphere: R = 450
function createPin(id, x, y, z, label) {
  const p = new THREE.Vector3(x, y, z);
  const el = document.createElement('div');
  el.className = 'pin';
  el.title = label;
  document.getElementById('host').appendChild(el);
  return { pos: p, el: el };
}

// 1. Center Vision Screen: (0, 40, 440)
// 2. CoBot Array: (0, -120, 430)
// 3. AMR 1 on left floor: (-210, -160, 320)
// 4. AI Vision LED Wall on left: (-320, 30, 280)
// 5. Canopy Arch: (0, 240, 340)
const pins = [
  createPin('p1', 0, 40, 440, 'Center Vision Wall'),
  createPin('p2', 0, -120, 430, 'CoBot X16 Array'),
  createPin('p3', -210, -160, 320, 'Vector AMR 600'),
  createPin('p4', -320, 30, 280, 'AI Vision Wall'),
  createPin('p5', 0, 240, 340, 'Canopy Arch')
];

function updatePins() {
  pins.forEach(pin => {
    const wp = pin.pos.clone();
    wp.project(camera);
    // Check if in front of camera
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const dot = pin.pos.dot(camDir);
    if (dot <= 0 || wp.z > 1.0) {
      pin.el.style.display = 'none';
      return;
    }
    pin.el.style.display = 'flex';
    pin.el.style.left = ((wp.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    pin.el.style.top  = ((-(wp.y * 0.5) + 0.5) * window.innerHeight) + 'px';
  });
}

function anim() {
  requestAnimationFrame(anim);
  controls.update();
  updatePins();
  renderer.render(scene, camera);
}
anim();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(baseDir, 'test-360-pins.html'), html, 'utf8');

const server = http.createServer((req, res) => {
  let filePath = path.join(baseDir, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.jpg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(6025, async () => {
  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--window-size=1600,900'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
    await page.goto('http://127.0.0.1:6025/test-360-pins.html', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
    
    // Front View with Pins
    await page.screenshot({ path: path.join(outDir, '75_TEST_360_PINS_FRONT.png') });
    console.log('Saved 75_TEST_360_PINS_FRONT.png');

    // Drag left to see AMR and AI Vision Wall
    await page.mouse.move(800, 450);
    await page.mouse.down();
    await page.mouse.move(1200, 450, { steps: 35 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(outDir, '76_TEST_360_PINS_LEFT.png') });
    console.log('Saved 76_TEST_360_PINS_LEFT.png');

    await browser.close();
  } catch(e) {
    console.error(e);
  }
  server.close();
  process.exit(0);
});
