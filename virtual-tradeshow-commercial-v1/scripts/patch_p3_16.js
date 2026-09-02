const fs = require('fs');
const path = require('path');

const targets = ['_clean_deploy', '_railway_deploy', 'app_build'];
const baseDir = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';

targets.forEach(dir => {
  const serverPath = path.join(baseDir, dir, 'server/index.js');
  const clientPath = path.join(baseDir, dir, 'client/index.html');

  console.log(`\n=== Patching ${dir} ===`);

  // 1. Patch server/index.js
  let serverCode = fs.readFileSync(serverPath, 'utf8');

  // A. Release ID
  serverCode = serverCode.replace(
    /releaseId:\s*["']C11\.16-P3\.15-R4["']/g,
    'releaseId: "C11.16-P3.16"'
  );

  // B. GET /api/projects/:id/booth-3d/sources - return allSources
  serverCode = serverCode.replace(
    /app\.get\('\/api\/projects\/:id\/booth-3d\/sources'[\s\S]*?res\.json\(\{\s*success:\s*true,\s*sources\s*\}\);/,
    `app.get('/api/projects/:id/booth-3d/sources', async (req, res) => {
  try {
    const projectId = req.params.id;
    const sources = db.listBoothSources(projectId);
    res.json({ success: true, sources, allSources: sources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`
  );

  // C. POST /api/projects/:id/booth-3d/sources - return sources and allSources
  serverCode = serverCode.replace(
    /res\.json\(\{\s*success:\s*true,\s*source:\s*sourceRecord,\s*allSources:\s*db\.listBoothSources\(projectId\)\s*\}\);/,
    `const allSources = db.listBoothSources(projectId);
    res.json({ success: true, source: sourceRecord, sources: allSources, allSources });`
  );

  // D. POST /api/projects/:id/booth-3d/regenerate - server-side 422 gating
  serverCode = serverCode.replace(
    /const sources = db\.listBoothSources\(projectId\);[\s\S]*?if \(sources\.length < minRequired && !isDev\) \{[\s\S]*?return res\.status\(400\)\.json\(\{[\s\S]*?\}\);[\s\S]*?\}/,
    `const sources = db.listBoothSources(projectId);
    const seenHashes = new Set();
    const uniqueSources = (sources || []).filter(s => {
      const k = s.hash || s.url || s.id;
      if (!k || seenHashes.has(k)) return false;
      seenHashes.add(k);
      return true;
    });
    if (uniqueSources.length < minRequired) {
      return res.status(422).json({
        error: \`Insufficient unique source photos. \${qualityTier} requires at least \${minRequired} photos (Current unique: \${uniqueSources.length}).\`,
        code: 'INSUFFICIENT_SOURCE_PHOTOS',
        required: minRequired,
        received: uniqueSources.length
      });
    }`
  );

  // E. Global API 404 & Global API Error Handler before SPA fallback
  if (!serverCode.includes("code: 'API_ROUTE_NOT_FOUND'")) {
    const fallbackTarget = "app.get('*', (req, res) => {";
    const api404Block = `// C11.16-P3.16: Canonical Global API 404 Handler (returns JSON for ANY HTTP method)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API_ROUTE_NOT_FOUND',
    code: 'API_ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method
  });
});

// C11.16-P3.16: Canonical Global API Error Handler (prevents default Express HTML)
app.use((err, req, res, next) => {
  if (req.path && req.path.startsWith('/api/')) {
    console.error('[API Unhandled Error]', req.method, req.path, err);
    return res.status(err.status || 500).json({
      error: err.message || 'INTERNAL_SERVER_ERROR',
      code: err.code || 'API_INTERNAL_ERROR'
    });
  }
  next(err);
});

app.get('*', (req, res) => {`;

    serverCode = serverCode.replace(fallbackTarget, api404Block);
  }

  fs.writeFileSync(serverPath, serverCode, 'utf8');
  console.log(`[OK] Server patched at ${serverPath}`);

  // 2. Patch client/index.html
  let clientCode = fs.readFileSync(clientPath, 'utf8');

  // A. Build info release ID
  clientCode = clientCode.replace(
    /releaseId:\s*["']C11\.16-P3\.15-R4["']/g,
    'releaseId: "C11.16-P3.16"'
  );

  // B. Product 3D Viewer Modal markup
  const oldModalContainer = `<div style="flex: 1 1 auto; min-height: 0; position: relative; background: #060c1a; border-radius: 0 0 16px 16px; overflow: hidden;">
        <canvas id="p3dViewerCanvas" style="width: 100%; height: 100%; display: block; touch-action: none;"></canvas>
        <div id="p3dViewerLoading" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(6,12,26,0.92); z-index: 10;">
          <div style="font-size: 36px; animation: spin 1.2s linear infinite;"><i class="fa-solid fa-rotate-3d" style="color: #6366f1;"></i></div>
          <div style="margin-top: 12px; font-size: 13px; color: #94a3b8;">Loading 3D model…</div>
        </div>
        <div id="p3dViewerError" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; flex-direction: column; background: rgba(6,12,26,0.94); z-index: 10;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: #f87171;"></i>
          <div style="margin-top: 10px; font-size: 13px; color: #f87171;">Failed to load 3D model.</div>
        </div>
        <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 11px; color: rgba(148,163,184,0.7); pointer-events: none; white-space: nowrap;"><i class="fa-solid fa-hand"></i> Drag to rotate &nbsp;&middot;&nbsp; Pinch/Scroll to zoom</div>
      </div>`;

  const newModalContainer = `<div id="p3dViewerCanvasContainer" style="flex: 1 1 auto; min-height: 440px; height: 500px; position: relative; background: #060c1a; border-radius: 0 0 16px 16px; overflow: hidden;">
        <canvas id="p3dViewerCanvas" style="width: 100%; height: 100%; display: block; touch-action: none;"></canvas>
        <div id="p3dViewerLoading" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(6,12,26,0.92); z-index: 10;">
          <div style="font-size: 36px; animation: spin 1.2s linear infinite;"><i class="fa-solid fa-rotate-3d" style="color: #6366f1;"></i></div>
          <div id="p3dViewerLoadingText" style="margin-top: 12px; font-size: 13px; color: #94a3b8;">Loading 3D model…</div>
        </div>
        <div id="p3dViewerError" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; flex-direction: column; background: rgba(6,12,26,0.94); z-index: 10;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: #f87171;"></i>
          <div id="p3dViewerErrorText" style="margin-top: 10px; font-size: 13px; color: #f87171;">Unable to load this 3D model.</div>
          <button type="button" id="p3dViewerRetryBtn" onclick="product3dViewerRetry()" style="margin-top: 12px; padding: 6px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; font-size: 12px; cursor: pointer;">Retry</button>
        </div>
        <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 11px; color: rgba(148,163,184,0.7); pointer-events: none; white-space: nowrap;"><i class="fa-solid fa-hand"></i> Drag to rotate &nbsp;&middot;&nbsp; Pinch/Scroll to zoom</div>
      </div>`;

  clientCode = clientCode.replace(oldModalContainer, newModalContainer);

  // C. Replace 3D Modal Viewer Logic & Booth 3D Media Logic
  const viewerOldLogicTarget = `// ── 3D Modal Viewer Logic ─────────────────────────────────────
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

  const viewerNewLogic = `// ── C11.16-P3.16: Canonical Product 3D Modal Viewer Engine ──────────────
window._p3dModalViewerState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  animationId: null,
  currentGlbUrl: null,
  resizeObserver: null,
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
    // 1. Normalize and validate GLB URL
    const resolvedUrl = glbUrl.startsWith('http') ? glbUrl : (window.location.origin + (glbUrl.startsWith('/') ? '' : '/') + glbUrl);

    // 2. Fetch validation (Section 8)
    const fetchRes = await fetch(resolvedUrl);
    if (!fetchRes.ok) {
      throw new Error('HTTP ' + fetchRes.status + ' ' + fetchRes.statusText);
    }
    const contentType = fetchRes.headers.get('content-type') || '';
    const arrayBuffer = await fetchRes.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 4) {
      throw new Error('EMPTY_BINARY_RESPONSE');
    }

    // Inspect first 4 bytes for glTF magic (0x46546C67 in LE / 0x676C5446 in BE)
    const magic = new DataView(arrayBuffer, 0, 4).getUint32(0, false);
    if (magic !== 0x676C5446) {
      const excerpt = new TextDecoder().decode(arrayBuffer.slice(0, 120));
      if (excerpt.includes('<!DOCTYPE') || excerpt.includes('<html')) {
        throw new Error('INVALID_BINARY_HTML_RESPONSE');
      }
      throw new Error('INVALID_GLB_MAGIC_HEADER');
    }

    // 3. Setup Three.js scene, camera, renderer with container dimensions
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

    // Illumination
    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(3, 5, 4);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x818cf8, 0.7);
    dirLight2.position.set(-3, -2, -3);
    scene.add(dirLight2);

    // Controls
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

    // 4. Parse validated GLB buffer
    const loader = new THREE.GLTFLoader();
    loader.parse(arrayBuffer, '', (gltf) => {
      if (!state.scene) return;
      const model = gltf.scene;

      // Fit camera using Box3 bounding box
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Center model
      model.position.sub(center);
      state.scene.add(model);

      // Camera fit calculation
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

      // Hide loading overlay upon successful render
      if (loadEl) loadEl.style.display = 'none';

      // Start render loop
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

  clientCode = clientCode.replace(viewerOldLogicTarget, viewerNewLogic);

  // D. Booth 3D Media, Canonical Draft, and Gating
  const boothLogicTarget = `      if (btn && btnText) {
        const isDev = isInternalDevAccount(currentViewerAccount);
        const canRun = count >= minRequired || isDev;
        btn.disabled = !canRun;
        btn.style.opacity = canRun ? '1' : '0.5';
        btnText.textContent = canRun ? 'Generate 3D Booth' : \`Add \${minRequired - count} More Photos to Generate\`;
      }`;

  const boothLogicNew = `      if (btn && btnText) {
        // C11.16-P3.16: Strict Human Gate - No developer bypass for insufficient source count
        const canRun = count >= minRequired;
        btn.disabled = !canRun;
        btn.style.opacity = canRun ? '1' : '0.5';
        btnText.textContent = canRun ? 'Generate 3D Booth' : \`Add \${minRequired - count} More Photos to Generate\`;
      }`;

  clientCode = clientCode.replace(boothLogicTarget, boothLogicNew);

  // E. Update openBooth3dRegenerationModal to send auth headers & populate booth3dDraft
  clientCode = clientCode.replace(
    /const res = await fetch\(\`\/api\/projects\/\$\{pid\}\/booth-3d\/sources\`\);/g,
    `const token = p3dGetAuthToken();
      const res = await fetch(\`/api/projects/\${pid}/booth-3d/sources\`, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'x-booth-edit-token': token
        }
      });`
  );

  // F. Helper to resolve project ID cleanly
  if (!clientCode.includes('function getActiveBoothProjectId()')) {
    const helperTarget = "function p3dGetAuthToken() {";
    const helperCode = `function getActiveBoothProjectId() {
  return window.activeProjectId ||
         (typeof activeProjectId !== 'undefined' ? activeProjectId : null) ||
         window.activeProjectData?.id ||
         (window._p3dState && window._p3dState.currentProjectId) ||
         'prj-free-14e56240';
}

function p3dGetAuthToken() {`;
    clientCode = clientCode.replace(helperTarget, helperCode);
  }

  // G. Update booth3dDraft canonical readiness
  if (!clientCode.includes('window.booth3dDraft =')) {
    const draftInitTarget = "let currentSelectedBoothQuality = 'BOOTH_HIGH';";
    const draftInitCode = `let currentSelectedBoothQuality = 'BOOTH_HIGH';
    window.booth3dDraft = {
      projectId: null,
      qualityTier: 'BOOTH_HIGH',
      sourcePhotos: []
    };

    function getBooth3dReadiness(draft) {
      const tier = draft?.qualityTier || currentSelectedBoothQuality || 'BOOTH_HIGH';
      const minRequired = tier === 'BOOTH_ULTRA' ? 60 : (tier === 'BOOTH_STANDARD' ? 12 : 30);
      const photos = draft?.sourcePhotos || currentBoothSourcesList || [];

      const seen = new Set();
      const unique = [];
      photos.forEach(p => {
        const k = p.hash || p.assetId || p.url || p.id;
        if (k && !seen.has(k)) {
          seen.add(k);
          unique.push(p);
        }
      });

      const uniqueCount = unique.length;
      const missing = Math.max(0, minRequired - uniqueCount);
      const canGenerate = uniqueCount >= minRequired;
      return {
        qualityTier: tier,
        persistedUniqueSourceCount: uniqueCount,
        requiredSourceCount: minRequired,
        missingSourceCount: missing,
        canGenerate,
        reason: canGenerate ? 'READY' : \`Need \${missing} more unique photo\${missing === 1 ? '' : 's'}\`
      };
    }`;
    clientCode = clientCode.replace(draftInitTarget, draftInitCode);
  }

  // H. Update renderBoothSourceGrid to use object-fit: contain & update booth3dDraft
  clientCode = clientCode.replace(
    /currentBoothSourcesList = sources \|\| \[\];/g,
    `currentBoothSourcesList = sources || [];
      if (!window.booth3dDraft) window.booth3dDraft = { projectId: getActiveBoothProjectId(), qualityTier: currentSelectedBoothQuality, sourcePhotos: [] };
      window.booth3dDraft.sourcePhotos = currentBoothSourcesList;`
  );

  clientCode = clientCode.replace(
    /style="width: 100%; height: 100%; object-fit: cover;"/g,
    'style="width: 100%; height: 100%; object-fit: contain; background: #030712;"'
  );

  // I. Camera capture response content-type & JSON check
  clientCode = clientCode.replace(
    /const data = await res\.json\(\);[\s\S]*?if \(data\.success\) \{[\s\S]*?renderBoothSourceGrid\(data\.allSources \|\| \[\]\);/g,
    `const contentType = res.headers.get('content-type') || '';
          if (!res.ok || !contentType.includes('application/json')) {
            const errText = await res.text();
            throw new Error(\`Server returned HTTP \${res.status} (\${contentType.split(';')[0] || 'Unknown'}): \${errText.substring(0, 100)}\`);
          }
          const data = await res.json();
          if (data.success) {
            renderBoothSourceGrid(data.allSources || data.sources || []);`
  );

  fs.writeFileSync(clientPath, clientCode, 'utf8');
  console.log(`[OK] Client patched at ${clientPath}`);
});

console.log('\nAll P3.16 patches successfully applied.');
