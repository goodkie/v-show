const fs = require('fs');
const path = require('path');
const vm = require('vm');

const baseDir = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const targets = ['_clean_deploy', '_railway_deploy', 'app_build'];

// ── 1. Canonical Modal Viewer Code Block ────────────────────────────
const canonicalViewerCode = `// ── C11.16-P3.16: Canonical Product 3D Modal Viewer Engine ──────────────
window._p3dModalViewerState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  animationId: null,
  currentGlbUrl: null,
  isRendering: false
};

function ensureThreeDependencies(callback) {
  if (window.THREE && window.THREE.GLTFLoader && window.THREE.OrbitControls) {
    return callback();
  }
  function loadScript(src, cb) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = () => console.error('[ThreeLoader] Failed loading:', src);
    document.head.appendChild(s);
  }
  if (!window.THREE) {
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', () => {
      loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', () => {
        loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', () => {
          callback();
        });
      });
    });
  } else if (!window.THREE.GLTFLoader) {
    loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', () => {
      if (!window.THREE.OrbitControls) {
        loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', callback);
      } else {
        callback();
      }
    });
  } else if (!window.THREE.OrbitControls) {
    loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', callback);
  } else {
    callback();
  }
}

function product3dOpenViewer(arg1, arg2) {
  let glbUrl = null;
  let title = '3D Product';

  if (typeof arg1 === 'string' && (arg1.endsWith('.glb') || arg1.includes('/uploads/product3d/'))) {
    glbUrl = arg1;
    title = (typeof arg2 === 'string' && arg2) ? arg2 : '3D Product';
  } else if (typeof arg1 === 'number' || (typeof arg1 === 'string' && !isNaN(Number(arg1)))) {
    const slotNum = Number(arg1);
    const prod = window.activeProjectData?.products?.find(p => p.slotIndex === slotNum || p.slot === slotNum);
    if (prod?.product3d?.glbUrl) glbUrl = prod.product3d.glbUrl;
    if (prod?.name) title = prod.name;
  }

  if (!glbUrl && window._p3dState?.product3d?.glbUrl) {
    glbUrl = window._p3dState.product3d.glbUrl;
    title = window._p3dState.currentProductName || title;
  }
  if (!glbUrl && window.productDraft?.product3d?.glbUrl) {
    glbUrl = window.productDraft.product3d.glbUrl;
    title = window.productDraft.name || title;
  }
  if (!glbUrl) {
    const products = window.activeProjectData?.products || [];
    const readyProd = products.find(p => p.product3d?.glbUrl && (p.product3d?.status === 'READY' || p.product3d?.status === 'NEEDS_REVIEW')) || products.find(p => p.product3d?.glbUrl);
    if (readyProd) {
      glbUrl = readyProd.product3d.glbUrl;
      title = readyProd.name || title;
    }
  }
  if (!glbUrl && window._currentPublicProduct3d?.glbUrl) {
    glbUrl = window._currentPublicProduct3d.glbUrl;
    title = window._currentPublicProductName || title;
  }

  if (!glbUrl) {
    console.warn('[Product3DViewer] No GLB URL found.');
    if (window.showToast) window.showToast('No 3D model asset available yet.', 'warning');
    return;
  }

  _p3dOpenViewerWithUrl(glbUrl, title);
}

function publicOpenProduct3dViewer(url, title) {
  product3dOpenViewer(url, title);
}

function _p3dOpenViewerWithUrl(glbUrl, title) {
  const modal = document.getElementById('product3dViewerModal');
  if (!modal) return;
  modal.style.display = 'flex';

  const titleEl = document.getElementById('p3dViewerTitle');
  if (titleEl) titleEl.textContent = title || '3D Product';

  const loadEl = document.getElementById('p3dViewerLoading');
  if (loadEl) loadEl.style.display = 'flex';

  const errEl = document.getElementById('p3dViewerError');
  if (errEl) errEl.style.display = 'none';

  _p3dDisposeModalViewer();

  ensureThreeDependencies(() => {
    _p3dInitModalViewer(glbUrl, title);
  });
}

function product3dViewerRetry() {
  const s = window._p3dModalViewerState;
  if (s && s.currentGlbUrl) {
    _p3dOpenViewerWithUrl(s.currentGlbUrl, document.getElementById('p3dViewerTitle')?.textContent || '3D Product');
  }
}

async function _p3dInitModalViewer(glbUrl, title) {
  const state = window._p3dModalViewerState;
  state.currentGlbUrl = glbUrl;

  const canvas = document.getElementById('p3dViewerCanvas');
  const container = document.getElementById('p3dViewerCanvasContainer') || canvas?.parentElement;
  const loadEl = document.getElementById('p3dViewerLoading');
  const errEl = document.getElementById('p3dViewerError');
  const errText = document.getElementById('p3dViewerErrorText');

  if (!canvas || !container) {
    console.error('[Product3DViewer] Canvas or container missing');
    return;
  }

  try {
    const resolvedUrl = glbUrl.startsWith('http') ? glbUrl : (window.location.origin + (glbUrl.startsWith('/') ? '' : '/') + glbUrl);

    const fetchRes = await fetch(resolvedUrl);
    if (!fetchRes.ok) {
      throw new Error('HTTP ' + fetchRes.status + ' ' + fetchRes.statusText);
    }
    const arrayBuffer = await fetchRes.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 4) {
      throw new Error('EMPTY_BINARY_RESPONSE');
    }

    const magic = new DataView(arrayBuffer, 0, 4).getUint32(0, false);
    if (magic !== 0x676C5446) {
      const excerpt = new TextDecoder().decode(arrayBuffer.slice(0, 120));
      if (excerpt.includes('<!DOCTYPE') || excerpt.includes('<html')) {
        throw new Error('INVALID_BINARY_HTML_RESPONSE');
      }
      throw new Error('INVALID_GLB_MAGIC_HEADER');
    }

    const THREE = window.THREE;
    const W = Math.max(container.clientWidth || 800, 320);
    const H = Math.max(container.clientHeight || 500, 240);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.05, 1000);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(3, 5, 4);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x818cf8, 0.7);
    dirLight2.position.set(-3, -2, -3);
    scene.add(dirLight2);

    let controls = null;
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.0;
      controls.addEventListener('start', () => { controls.autoRotate = false; });
    }

    state.renderer = renderer;
    state.scene = scene;
    state.camera = camera;
    state.controls = controls;

    const loader = new THREE.GLTFLoader();
    loader.parse(arrayBuffer, '', (gltf) => {
      if (!state.scene) return;
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      model.position.sub(center);
      state.scene.add(model);

      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
      if (!isFinite(cameraDistance) || cameraDistance < 0.1) cameraDistance = 3.0;

      camera.near = Math.max(0.01, cameraDistance / 100);
      camera.far = Math.max(100, cameraDistance * 100);
      camera.position.set(cameraDistance * 0.7, cameraDistance * 0.4, cameraDistance * 1.1);
      camera.updateProjectionMatrix();

      if (controls) {
        controls.target.set(0, 0, 0);
        controls.maxDistance = cameraDistance * 10;
        controls.minDistance = cameraDistance * 0.05;
        controls.update();
        controls.saveState();
      }

      if (loadEl) loadEl.style.display = 'none';
      _p3dStartModalAnimationLoop();
    }, (err) => {
      console.error('[Product3DViewer] GLTF parse error:', err);
      if (loadEl) loadEl.style.display = 'none';
      if (errEl) errEl.style.display = 'flex';
      if (errText) errText.textContent = 'Unable to parse 3D model.';
    });

  } catch (err) {
    console.error('[Product3DViewer] Viewer init failure:', err);
    if (loadEl) loadEl.style.display = 'none';
    if (errEl) errEl.style.display = 'flex';
    if (errText) errText.textContent = 'Unable to load 3D model: ' + err.message;
  }
}

function _p3dStartModalAnimationLoop() {
  _p3dStopModalAnimationLoop();
  const s = window._p3dModalViewerState;
  s.isRendering = true;
  function loop() {
    if (!s.isRendering) return;
    s.animationId = requestAnimationFrame(loop);
    if (s.controls) s.controls.update();
    if (s.renderer && s.scene && s.camera) {
      s.renderer.render(s.scene, s.camera);
    }
  }
  loop();
}

function _p3dStopModalAnimationLoop() {
  const s = window._p3dModalViewerState;
  s.isRendering = false;
  if (s.animationId) {
    cancelAnimationFrame(s.animationId);
    s.animationId = null;
  }
}

function _p3dDisposeModalViewer() {
  _p3dStopModalAnimationLoop();
  const s = window._p3dModalViewerState;
  if (s.controls) {
    try { s.controls.dispose(); } catch(e) {}
    s.controls = null;
  }
  if (s.scene) {
    s.scene.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      }
    });
    s.scene = null;
  }
  if (s.renderer) {
    try { s.renderer.dispose(); } catch(e) {}
    s.renderer = null;
  }
  s.camera = null;
  s.currentGlbUrl = null;
}

function closeProduct3dViewer() {
  const modal = document.getElementById('product3dViewerModal');
  if (modal) modal.style.display = 'none';
  _p3dDisposeModalViewer();
}

function p3dDisposeThreeJsResources() {
  _p3dDisposeModalViewer();
}

function product3dViewerReset() {
  const s = window._p3dModalViewerState;
  if (s.controls) {
    s.controls.reset();
  }
}
`;

// ── 2. Replacement acceptCapturedPhoto Function ─────────────────────
const canonicalAcceptCapturedPhoto = `async function acceptCapturedPhoto() {
      if (!lastCapturedDataUrl || !currentCameraCaptureTarget) {
        closeCameraCaptureModal();
        return;
      }

      const token = p3dGetAuthToken();
      const pid = activeProjectId || window.activeProjectData?.id;
      const target = currentCameraCaptureTarget;

      try {
        if (target.type === 'BOOTH') {
          const res = await fetch(\`/api/projects/\${pid}/booth-3d/sources\`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
              'x-booth-edit-token': token,
              'x-project-id': pid || ''
            },
            body: JSON.stringify({
              dataUrl: lastCapturedDataUrl,
              viewLabel: target.viewLabel || 'Camera View',
              sourceType: 'CAMERA_CAPTURE',
              capturedAt: new Date().toISOString()
            })
          });
          const ct = res.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
            const raw = await res.text();
            throw new Error(\`Server returned non-JSON response (\${res.status}): \${raw.slice(0, 120)}\`);
          }
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.message || data.error || \`HTTP \${res.status}\`);
          }
          if (data.success) {
            currentBoothSourcesList = data.allSources || data.sources || [];
            renderBoothSourceGrid(currentBoothSourcesList);
            if (window.showToast) window.showToast('✅ Camera photo added to Booth sources!', 'success');
          }
        } else if (target.type === 'PRODUCT') {
          const slot = target.slotIndex || 1;
          const res = await fetch(\`/api/projects/\${pid}/products/\${slot}/sources\`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
              'x-booth-edit-token': token,
              'x-project-id': pid || ''
            },
            body: JSON.stringify({
              dataUrl: lastCapturedDataUrl,
              viewLabel: target.viewLabel || 'Camera View',
              sourceType: 'CAMERA_CAPTURE',
              capturedAt: new Date().toISOString()
            })
          });
          const ct = res.headers.get('content-type') || '';
          if (!ct.includes('application/json')) {
            const raw = await res.text();
            throw new Error(\`Server returned non-JSON response (\${res.status}): \${raw.slice(0, 120)}\`);
          }
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.message || data.error || \`HTTP \${res.status}\`);
          }
          if (data.success && data.product) {
            const filledBox = document.getElementById('p3dTabSourceFilledBox');
            const emptyBox = document.getElementById('p3dTabSourceEmptyBox');
            const imgPreview = document.getElementById('p3dTabSourceImgPreview');
            if (imgPreview && data.source?.url) imgPreview.src = data.source.url;
            if (filledBox) filledBox.style.display = 'flex';
            if (emptyBox) emptyBox.style.display = 'none';
            if (window.showToast) window.showToast('✅ Camera photo set as product source!', 'success');
          }
        }
      } catch (e) {
        console.error('[Capture Save Error]', e);
        alert('Could not save captured photo: ' + e.message);
      } finally {
        closeCameraCaptureModal();
      }
    }

    // ============================================================
    `;

// ── 3. Replacement handleBoothMultiFilesUploaded Function ───────────
const canonicalHandleMultiUpload = `async function handleBoothMultiFilesUploaded(input) {
      if (!input.files || input.files.length === 0) return;
      const pid = activeProjectId || window.activeProjectData?.id;
      const token = p3dGetAuthToken();

      for (const file of Array.from(input.files)) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const res = await fetch(\`/api/projects/\${pid}/booth-3d/sources\`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'Authorization': 'Bearer ' + token,
                'x-booth-edit-token': token,
                'x-project-id': pid || ''
              },
              body: JSON.stringify({
                dataUrl: e.target.result,
                viewLabel: file.name.replace(/\\.[^/.]+$/, ''),
                sourceType: 'FILE_UPLOAD'
              })
            });
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
              const raw = await res.text();
              throw new Error(\`Server returned non-JSON response (\${res.status}): \${raw.slice(0, 120)}\`);
            }
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.message || data.error || \`HTTP \${res.status}\`);
            }
            if (data.success) {
              currentBoothSourcesList = data.allSources || data.sources || [];
              renderBoothSourceGrid(currentBoothSourcesList);
            }
          } catch(err) {
            console.error('Upload source error:', err);
            if (window.showToast) window.showToast('Upload error: ' + err.message, 'error');
          }
        };
        reader.readAsDataURL(file);
      }
      input.value = '';
    }

    `;

targets.forEach(dir => {
  console.log(`\n================ Processing ${dir} ================`);

  // ────────────────────────────────────────────────────────────────
  // Part A: server/index.js
  // ────────────────────────────────────────────────────────────────
  const serverFile = path.join(baseDir, dir, 'server', 'index.js');
  let serverCode = fs.readFileSync(serverFile, 'utf8');

  // Replace app.use(express.json()); with 50mb limit and error handler
  const oldJsonParserRegex = /app\.use\(express\.json\(\)\);/;
  if (oldJsonParserRegex.test(serverCode)) {
    const newJsonParser = `// JSON Body Parser with 50mb limit for high-res photo uploads and camera captures
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Uploaded image or payload exceeds the 50MB size limit.'
    });
  }
  if (err && err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: 'INVALID_JSON_BODY',
      code: 'INVALID_JSON_BODY',
      message: err.message
    });
  }
  next(err);
});`;
    serverCode = serverCode.replace(oldJsonParserRegex, newJsonParser);
    console.log(`[OK] ${dir}/server/index.js: Updated express.json to 50MB limit + JSON error handler`);
  } else {
    console.log(`[INFO] ${dir}/server/index.js: express.json({ limit: '50mb' }) already present or not matched`);
  }

  // Ensure global API error handler uses both req.path and req.originalUrl
  serverCode = serverCode.replace(
    /if\s*\(\s*req\.path\s*&&\s*req\.path\.startsWith\('\/api\/'\)\s*\)/g,
    `if ((req.path && req.path.startsWith('/api/')) || (req.originalUrl && req.originalUrl.startsWith('/api/')))`
  );

  fs.writeFileSync(serverFile, serverCode, 'utf8');

  // ────────────────────────────────────────────────────────────────
  // Part B: client/index.html
  // ────────────────────────────────────────────────────────────────
  const clientFile = path.join(baseDir, dir, 'client', 'index.html');
  let clientHtml = fs.readFileSync(clientFile, 'utf8');

  // 1. Add id="p3dViewerCanvasContainer" and id="p3dViewerErrorText" to modal markup
  clientHtml = clientHtml.replace(
    /<div style="flex: 1 1 auto; min-height: 0; position: relative; background: #060c1a; border-radius: 0 0 16px 16px; overflow: hidden;">/g,
    `<div id="p3dViewerCanvasContainer" style="flex: 1 1 auto; min-height: 0; position: relative; background: #060c1a; border-radius: 0 0 16px 16px; overflow: hidden;">`
  );
  clientHtml = clientHtml.replace(
    /<div style="margin-top: 10px; font-size: 13px; color: #f87171;">Failed to load 3D model\.<\/div>/g,
    `<div id="p3dViewerErrorText" style="margin-top: 10px; font-size: 13px; color: #f87171;">Failed to load 3D model.</div>`
  );

  // 2. Replace Old Modal Viewer Logic with Substring Bounds
  const startViewer = clientHtml.indexOf('// ── 3D Modal Viewer Logic ─────────────────────────────────────');
  const endViewer = clientHtml.indexOf('// ── Public product detail integration ─────────────────────────', startViewer);
  if (startViewer > 0 && endViewer > startViewer) {
    clientHtml = clientHtml.substring(0, startViewer) + canonicalViewerCode + '\n' + clientHtml.substring(endViewer);
    console.log(`[OK] ${dir}/client/index.html: Replaced old modal viewer logic with canonical engine`);
  } else if (clientHtml.includes('window._p3dModalViewerState')) {
    console.log(`[INFO] ${dir}/client/index.html: Canonical viewer engine already present`);
  } else {
    console.warn(`[WARN] ${dir}/client/index.html: Could not locate viewer block boundaries`);
  }

  // 3. Replace acceptCapturedPhoto with Substring Bounds
  const startAccept = clientHtml.indexOf('async function acceptCapturedPhoto()');
  const endAccept = clientHtml.indexOf('// ─── P3.12: BOOTH 3D REGENERATION ENGINE', startAccept);
  if (startAccept > 0 && endAccept > startAccept) {
    clientHtml = clientHtml.substring(0, startAccept) + canonicalAcceptCapturedPhoto + clientHtml.substring(endAccept);
    console.log(`[OK] ${dir}/client/index.html: Replaced acceptCapturedPhoto with canonical safe version`);
  } else {
    console.warn(`[WARN] ${dir}/client/index.html: Could not locate acceptCapturedPhoto boundaries`);
  }

  // 4. Replace handleBoothMultiFilesUploaded with Substring Bounds
  const startUpload = clientHtml.indexOf('async function handleBoothMultiFilesUploaded(input)');
  const endUpload = clientHtml.indexOf('function openBoothCameraCapture()', startUpload);
  if (startUpload > 0 && endUpload > startUpload) {
    clientHtml = clientHtml.substring(0, startUpload) + canonicalHandleMultiUpload + clientHtml.substring(endUpload);
    console.log(`[OK] ${dir}/client/index.html: Replaced handleBoothMultiFilesUploaded with canonical safe version`);
  } else {
    console.warn(`[WARN] ${dir}/client/index.html: Could not locate handleBoothMultiFilesUploaded boundaries`);
  }

  // 5. Fix openBooth3dRegenerationModal to include Authorization header
  const openBoothIdx = clientHtml.indexOf('async function openBooth3dRegenerationModal()');
  if (openBoothIdx > 0) {
    const fetchLine = 'const res = await fetch(`/api/projects/${pid}/booth-3d/sources`);';
    const fetchLineIdx = clientHtml.indexOf(fetchLine, openBoothIdx);
    if (fetchLineIdx > 0 && fetchLineIdx - openBoothIdx < 500) {
      const fixedFetch = `const token = p3dGetAuthToken();
      try {
        const res = await fetch(\`/api/projects/\${pid}/booth-3d/sources\`, {
          headers: {
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token,
            'x-project-id': pid || ''
          }
        });`;
      const replaceStart = clientHtml.indexOf('try {', openBoothIdx);
      clientHtml = clientHtml.substring(0, replaceStart) + fixedFetch + clientHtml.substring(fetchLineIdx + fetchLine.length);
      console.log(`[OK] ${dir}/client/index.html: Added auth headers to openBooth3dRegenerationModal`);
    }
  }

  // 6. Update updateBoothSourceValidationUI to enforce strict gating
  clientHtml = clientHtml.replace(
    /const canRun = count >= minRequired \|\| isDev;/g,
    'const canRun = count >= minRequired;'
  );

  // Validate script syntax in HTML
  const scriptMatches = [...clientHtml.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];
  scriptMatches.forEach((m, idx) => {
    if (m[1].trim()) {
      try {
        new vm.Script(m[1]);
      } catch (scriptErr) {
        console.error(`[ERROR] Script #${idx} syntax error in ${clientFile}:`, scriptErr.message);
        throw scriptErr;
      }
    }
  });

  fs.writeFileSync(clientFile, clientHtml, 'utf8');
  console.log(`[OK] All script blocks in ${dir}/client/index.html parsed cleanly!`);
});

console.log('\n✅ All clean runtime fixes successfully applied and verified!');
