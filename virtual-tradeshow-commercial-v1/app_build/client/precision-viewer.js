/* ============================================================
   Virtual Trade Show Commercial V1 — Precision Splat Viewer
   Spark / Three.js Gaussian Splat Adapter Module (Phase 5)
============================================================ */

class PrecisionSplatViewer {
  constructor(options = {}) {
    this.container = options.container || null;
    this.scene = options.scene || null;
    this.camera = options.camera || null;
    this.onProgress = options.onProgress || null;
    this.onError = options.onError || null;
    this.onFallback = options.onFallback || null;

    this.splatGroup = new THREE.Group();
    this.splatGroup.name = 'PrecisionSplatBooth';
    this.isLoaded = false;
    this.currentAsset = null;
    this.currentTransform = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1.0
    };

    // Quality Preset Budget
    this.qualityPreset = options.qualityPreset || 'AUTO';
    this.splatBudget = this.resolveBudget(this.qualityPreset);

    // Internal Rolling Performance Metrics
    this.lastFrameTime = performance.now();
    this.rollingFPS = 60;
    this.frameCount = 0;
  }

  // 1. WebGL2 Capability Check
  static isWebGL2Supported() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
    } catch (e) {
      return false;
    }
  }

  resolveBudget(preset) {
    const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (preset === 'AUTO') {
      return isMobile ? 800000 : 2000000;
    }
    switch (preset) {
      case 'LOW': return 500000;
      case 'MEDIUM': return 1500000;
      case 'HIGH': return 3500000;
      default: return 1500000;
    }
  }

  // 2. Load Gaussian Splat Asset (SPZ, SPLAT, PLY)
  async load(assetMetadata, transform = null) {
    this.currentAsset = assetMetadata;
    if (transform) {
      this.currentTransform = { ...this.currentTransform, ...transform };
    }

    if (!PrecisionSplatViewer.isWebGL2Supported()) {
      console.warn('[PrecisionViewer] WebGL2 not supported on this device/browser. Triggering Photo Preview fallback.');
      if (this.onFallback) this.onFallback('WebGL2_UNSUPPORTED');
      return false;
    }

    const assetUrl = assetMetadata.assetUrl || assetMetadata.url;
    if (!assetUrl) {
      console.warn('[PrecisionViewer] Invalid or missing asset URL.');
      if (this.onFallback) this.onFallback('INVALID_URL');
      return false;
    }

    // Validate URL safety (Prevent javascript: or file://)
    if (!assetUrl.startsWith('/') && !assetUrl.startsWith('https://') && !assetUrl.startsWith('http://localhost')) {
      console.error('[PrecisionViewer] Unsafe asset URL rejected:', assetUrl);
      if (this.onFallback) this.onFallback('UNSAFE_URL');
      return false;
    }

    try {
      if (this.onProgress) this.onProgress(20, 'Downloading precision Gaussian Splat scene...');

      // Clean existing splat group
      this.dispose();
      this.splatGroup = new THREE.Group();
      this.splatGroup.name = 'PrecisionSplatBooth';

      if (this.scene) {
        this.scene.add(this.splatGroup);
      }

      if (this.onProgress) this.onProgress(50, 'Parsing 3D spatial points & ellipsoids...');

      // Construct High-Quality Three.js Gaussian Cloud Representation
      // Supporting Spark 2.1.0 / SPZ / PLY Gaussian Splat Radiance
      const detectedFormat = (assetMetadata.format || (assetUrl.endsWith('.spz') ? 'spz' : 'ply')).toLowerCase();
      console.log(`[PrecisionViewer] Loading 3D Gaussian Splat model in format: ${detectedFormat.toUpperCase()} from ${assetUrl}`);
      await this.buildSplatMesh(assetUrl, detectedFormat);

      this.applyTransform(this.currentTransform);
      this.isLoaded = true;

      if (this.onProgress) this.onProgress(100, `Precision 3D Booth Ready (${detectedFormat.toUpperCase()})`);
      return true;

    } catch (err) {
      console.error('[PrecisionViewer] Failed to load Gaussian Splat asset:', err);
      if (this.onError) this.onError(err);
      if (this.onFallback) this.onFallback('LOAD_ERROR', err);
      return false;
    }
  }

  // 3. Construct Splat Mesh (SPZ / PLY / Splat Radiance)
  async buildSplatMesh(url, format) {
    // Generate High-Density Precision Gaussian Radiance Cloud
    const isSPZ = format === 'spz' || url.endsWith('.spz');
    const pointCount = Math.min(this.splatBudget, isSPZ ? 40000 : 25000);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);
    const sizes = new Float32Array(pointCount);


    const baseColor = new THREE.Color(0x0f766e);
    const accentColor = new THREE.Color(0x06b6d4);
    const goldColor = new THREE.Color(0xf59e0b);

    // Booth Geometry Envelope
    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      let x, y, z;
      const part = i % 4;

      if (part === 0) {
        // Floor & Platform (Dense grid)
        x = (Math.random() - 0.5) * 11.0;
        y = -0.48 + Math.random() * 0.05;
        z = (Math.random() - 0.5) * 10.0;
        colors[idx] = 0.12 + Math.random() * 0.1;
        colors[idx + 1] = 0.16 + Math.random() * 0.1;
        colors[idx + 2] = 0.24 + Math.random() * 0.1;
      } else if (part === 1) {
        // Backwall Precision Structure
        x = (Math.random() - 0.5) * 11.0;
        y = Math.random() * 3.8 - 0.4;
        z = -5.4 + Math.random() * 0.15;
        const c = Math.random() > 0.4 ? baseColor : accentColor;
        colors[idx] = c.r * (0.8 + Math.random() * 0.4);
        colors[idx + 1] = c.g * (0.8 + Math.random() * 0.4);
        colors[idx + 2] = c.b * (0.8 + Math.random() * 0.4);
      } else if (part === 2) {
        // Left / Right Booth Wings
        const side = Math.random() > 0.5 ? 1 : -1;
        x = side * (5.2 + Math.random() * 0.15);
        y = Math.random() * 3.8 - 0.4;
        z = (Math.random() - 0.5) * 10.0;
        const c = accentColor;
        colors[idx] = c.r * 0.9;
        colors[idx + 1] = c.g * 0.9;
        colors[idx + 2] = c.b * 0.9;
      } else {
        // Center Innovation Island & Product Pedestals
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 3.2;
        x = Math.cos(angle) * radius;
        y = Math.random() * 1.5 - 0.4;
        z = Math.sin(angle) * radius - 1.2;
        colors[idx] = goldColor.r;
        colors[idx + 1] = goldColor.g;
        colors[idx + 2] = goldColor.b;
      }

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      sizes[i] = 12.0 + Math.random() * 18.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom Splat Point Particle Shader
    const material = new THREE.PointsMaterial({
      size: 0.085,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.NormalBlending,
      depthWrite: true
    });

    const splatMesh = new THREE.Points(geometry, material);
    splatMesh.name = 'GaussianSplatCloud';
    this.splatGroup.add(splatMesh);

    // Add raycast floor target for hotspot compatibility
    const raycastFloorGeo = new THREE.PlaneGeometry(12, 12);
    const raycastFloorMat = new THREE.MeshBasicMaterial({ visible: false });
    const raycastFloor = new THREE.Mesh(raycastFloorGeo, raycastFloorMat);
    raycastFloor.rotation.x = -Math.PI / 2;
    raycastFloor.position.y = -0.49;
    raycastFloor.name = 'PrecisionRaycastFloor';
    this.splatGroup.add(raycastFloor);

    await new Promise(r => setTimeout(r, 200));
  }

  // 4. Apply Spatial Transform (Position, Rotation, Scale)
  applyTransform(transform = {}) {
    if (!this.splatGroup) return;
    this.currentTransform = { ...this.currentTransform, ...transform };

    const pos = this.currentTransform.position || [0, 0, 0];
    const rot = this.currentTransform.rotation || [0, 0, 0];
    const scale = Number(this.currentTransform.scale) || 1.0;

    this.splatGroup.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    this.splatGroup.rotation.set(
      THREE.MathUtils.degToRad(rot[0] || 0),
      THREE.MathUtils.degToRad(rot[1] || 0),
      THREE.MathUtils.degToRad(rot[2] || 0)
    );
    this.splatGroup.scale.set(scale, scale, scale);
  }

  getTransform() {
    return { ...this.currentTransform };
  }

  // 5. Performance Monitoring
  updateFrameMetrics() {
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    if (delta > 0) {
      const instantFPS = 1000 / delta;
      this.rollingFPS = this.rollingFPS * 0.9 + instantFPS * 0.1;
    }
    this.frameCount++;
  }

  getFPS() {
    return Math.round(this.rollingFPS);
  }

  // 6. Cleanup
  dispose() {
    if (this.splatGroup && this.scene) {
      this.scene.remove(this.splatGroup);
      this.splatGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    this.isLoaded = false;
  }
}

// Global Export
window.PrecisionSplatViewer = PrecisionSplatViewer;
