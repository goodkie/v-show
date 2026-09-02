const fs = require('fs');
const path = require('path');
const vm = require('vm');

const targets = ['_clean_deploy', '_railway_deploy', 'app_build'];
const baseDir = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';

const modalViewerBlock = `// ── C11.16-P3.16: Canonical Product 3D Modal Viewer Engine ──────────────
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

function openProduct3dViewer(productIdOrSlot) {
  if (typeof productIdOrSlot === 'string' && (productIdOrSlot.endsWith('.glb') || productIdOrSlot.includes('/uploads/product3d/'))) {
    _p3dOpenViewerWithUrl(productIdOrSlot, '3D Product');
    return;
  }
  const project = window.activeProjectData || null;
  let product = null;
  if (project && project.products) {
    product = project.products.find(p => p.id === productIdOrSlot || String(p.slotIndex) === String(productIdOrSlot) || p.slot === productIdOrSlot);
  }
  if (!product && window.productDraft) {
    if (window.productDraft.id === productIdOrSlot || String(window.productDraft.slotIndex) === String(productIdOrSlot)) {
      product = window.productDraft;
    }
  }
  if (!product && window._p3dState && window._p3dState.product3d && window._p3dState.product3d.glbUrl) {
    product = { product3d: window._p3dState.product3d, name: window._p3dState.currentProductName || 'Product 3D' };
  }
  if (!product && window._currentPublicProduct3d && window._currentPublicProduct3d.glbUrl) {
    product = { product3d: window._currentPublicProduct3d, name: window._currentPublicProductName || 'Product 3D' };
  }

  const glbUrl = product?.product3d?.glbUrl || product?.glbUrl;
  const title = product?.name || product?.title || '3D Product';

  if (!glbUrl) {
    console.error('[Product3DViewer] No GLB URL found for product:', productIdOrSlot);
    if (window.showToast) window.showToast('No 3D model asset available for this product.', 'warning');
    return;
  }

  _p3dOpenViewerWithUrl(glbUrl, title);
}

function product3dOpenViewer() {
  openProduct3dViewer();
}

function publicOpenProduct3dViewer() {
  openProduct3dViewer();
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
  const container = document.getElementById('p3dViewerCanvasContainer');
  const loadEl = document.getElementById('p3dViewerLoading');
  const errEl = document.getElementById('p3dViewerError');
  const errText = document.getElementById('p3dViewerErrorText');

  if (!canvas || !container) {
    console.error('[Product3DViewer] Canvas or container element missing');
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

    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
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
      if (errText) errText.textContent = 'Unable to load this 3D model.';
    });

  } catch (err) {
    console.error('[Product3DViewer] Viewer init failure:', err);
    if (loadEl) loadEl.style.display = 'none';
    if (errEl) errEl.style.display = 'flex';
    if (errText) errText.textContent = 'Unable to load this 3D model.';
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
  if (s) {
    s.isRendering = false;
    if (s.animationId) {
      cancelAnimationFrame(s.animationId);
      s.animationId = null;
    }
  }
}

function product3dViewerReset() {
  const s = window._p3dModalViewerState;
  if (s && s.controls) {
    s.controls.reset();
  }
}

function closeProduct3dViewer() {
  const modal = document.getElementById('product3dViewerModal');
  if (modal) modal.style.display = 'none';
  _p3dDisposeModalViewer();
}

function _p3dDisposeModalViewer() {
  _p3dStopModalAnimationLoop();
  const s = window._p3dModalViewerState;
  if (!s) return;

  if (s.controls) {
    if (typeof s.controls.dispose === 'function') s.controls.dispose();
    s.controls = null;
  }
  if (s.scene) {
    s.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    s.scene = null;
  }
  if (s.renderer) {
    s.renderer.dispose();
    s.renderer = null;
  }
  s.camera = null;
  s.isRendering = false;
}

function _p3dDisposeViewer() {
  _p3dDisposeModalViewer();
}

function p3dDisposeThreeJsResources() {
  _p3dDisposeModalViewer();
}`;

targets.forEach(dir => {
  const clientPath = path.join(baseDir, dir, 'client/index.html');
  let html = fs.readFileSync(clientPath, 'utf8');

  // 1. Release ID
  html = html.replace(
    'releaseId: "C11.16-P3.15-R4"',
    'releaseId: "C11.16-P3.16"'
  );

  // 2. Camera capture JSON validation
  const oldCameraRes = `          const data = await res.json();
          if (data.success) {
            renderBoothSourceGrid(data.allSources || []);
            if (window.showToast) window.showToast('✅ Camera photo added to Booth sources!', 'success');
          }`;

  const newCameraRes = `          const contentType = res.headers.get('content-type') || '';
          if (!res.ok || !contentType.includes('application/json')) {
            const errText = await res.text();
            throw new Error(\`Server returned HTTP \${res.status} (\${contentType.split(';')[0] || 'Unknown'}): \${errText.substring(0, 100)}\`);
          }
          const data = await res.json();
          if (data.success) {
            renderBoothSourceGrid(data.allSources || data.sources || []);
            if (window.showToast) window.showToast('✅ Camera photo added to Booth sources!', 'success');
          }`;

  if (html.includes(oldCameraRes)) {
    html = html.replace(oldCameraRes, newCameraRes);
  }

  // 3. Open booth modal with auth headers & sources
  const oldBoothFetch = `      // Load policy & current sources
      const pid = activeProjectId || window.activeProjectData?.id;
      try {
        const res = await fetch(\`/api/projects/\${pid}/booth-3d/sources\`);
        const data = await res.json();
        if (data.success) {
          currentBoothSourcesList = data.sources || [];
          renderBoothSourceGrid(currentBoothSourcesList);
        }
      } catch (e) {
        console.warn('Error fetching booth sources:', e.message);
      }`;

  const newBoothFetch = `      // Load policy & current sources
      const pid = activeProjectId || window.activeProjectData?.id;
      try {
        const token = p3dGetAuthToken();
        const res = await fetch(\`/api/projects/\${pid}/booth-3d/sources\`, {
          headers: {
            'Authorization': 'Bearer ' + token,
            'x-booth-edit-token': token
          }
        });
        const data = await res.json();
        if (data.success) {
          currentBoothSourcesList = data.allSources || data.sources || [];
          renderBoothSourceGrid(currentBoothSourcesList);
        }
      } catch (e) {
        console.warn('Error fetching booth sources:', e.message);
      }`;

  if (html.includes(oldBoothFetch)) {
    html = html.replace(oldBoothFetch, newBoothFetch);
  }

  // 4. Booth Gating Enforcement (Strictly disable below minimum)
  const oldGating = `        const isDev = isInternalDevAccount(currentViewerAccount);
        const canRun = count >= minRequired || isDev;
        btn.disabled = !canRun;
        btn.style.opacity = canRun ? '1' : '0.5';
        btnText.textContent = canRun ? 'Generate 3D Booth' : \`Add \${minRequired - count} More Photos to Generate\`;`;

  const newGating = `        const canRun = count >= minRequired;
        btn.disabled = !canRun;
        btn.style.opacity = canRun ? '1' : '0.5';
        btn.style.pointerEvents = canRun ? 'auto' : 'none';
        btnText.textContent = canRun ? 'Generate 3D Booth' : \`Add \${minRequired - count} More Photos to Generate\`;`;

  if (html.includes(oldGating)) {
    html = html.replace(oldGating, newGating);
  }

  // 5. Replace Old Modal Viewer Logic with Canonical Engine
  const oldViewerBlock = `// ── 3D Modal Viewer Logic ─────────────────────────────────────
function product3dOpenViewer() {
  const p3d = window._p3dState.product3d;
  if (!p3d?.glbUrl) return;
  _p3dOpenViewerWithUrl(p3d.glbUrl, window._p3dState.currentProductName || 'Product 3D');
}

function publicOpenProduct3dViewer() {
  const p3d = window._currentPublicProduct3d;
  if (!p3d?.glbUrl) return;
  _p3dOpenViewerWithUrl(p3d.glbUrl, window._currentPublicProductName || 'Product 3D');
}

function _p3dOpenViewerWithUrl(glbUrl, title) {
  const modal = document.getElementById('product3dViewerModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const titleEl = document.getElementById('p3dViewerTitle');
  if (titleEl) titleEl.textContent = title;
  const loadEl = document.getElementById('p3dViewerLoading');
  if (loadEl) loadEl.style.display = 'flex';
  const errEl = document.getElementById('p3dViewerError');
  if (errEl) errEl.style.display = 'none';

  _p3dDisposeViewer();
  _p3dInitViewer(glbUrl);
}

function closeProduct3dViewer() {
  const modal = document.getElementById('product3dViewerModal');
  if (modal) modal.style.display = 'none';
  _p3dDisposeViewer();
}

function p3dDisposeThreeJsResources() {
  _p3dDisposeViewer();
}

function product3dViewerReset() {
  const s = window._p3dState;
  if (s.viewerControls) {
    s.viewerControls.reset();
  }
}`;

  if (html.includes(oldViewerBlock)) {
    html = html.replace(oldViewerBlock, modalViewerBlock);
  }

  // Validate that all embedded script tags parse cleanly
  const scriptMatches = [...html.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];
  scriptMatches.forEach((m, idx) => {
    if (m[1].trim()) {
      new vm.Script(m[1]);
    }
  });

  fs.writeFileSync(clientPath, html, 'utf8');
  console.log(`[OK] Client cleanly patched and validated at ${clientPath}`);
});
