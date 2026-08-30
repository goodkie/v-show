/* ============================================================
   dn’a Virtual Trade Show — Master Photo Engine (v2.0)
   Unified Multi-Experience Renderer:
   1. PHOTO_IMMERSIVE (360° Sphere, PANORAMA_YAW_PITCH)
   2. PHOTO_SHOWROOM / MULTI_VIEW_PHOTO (High-DPI 2D Pan/Zoom, NORMALIZED_2D)
   3. DESIGNED_SHOWROOM (Designed Render Canvas, NORMALIZED_2D)
============================================================ */

class PhotoImmersiveEngine {
  constructor(options = {}) {
    this.container = options.container;
    this.manifest = options.manifest || {};
    this.experienceType = this.manifest.experienceType || 'PHOTO_IMMERSIVE';
    this.isEditorMode = !!options.isEditorMode;
    this.onPinpointCreated = options.onPinpointCreated || null;
    this.onProductSelected = options.onProductSelected || null;

    this.currentNodeIdx = 0;
    this.views = this.manifest.views || [];
    this.pinpoints = this.manifest.pinpoints || [];
    this.products = this.manifest.products || [];

    this.hotspotLayer = options.hotspotLayer || null;
    this.sphereRadius = 500;

    // Three.js 360 properties
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.photoSphere = null;
    this.photoMaterial = null;
    this.textureLoader = null;
    this.textureCache = {};
    this.raycaster = new THREE.Raycaster();

    // 2D Photo Showroom properties
    this.img2DElement = null;
    this.img2DContainer = null;
    this.panZoom = { scale: 1.0, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };

    this.init();
  }

  // Spherical coordinate conversions for 360
  static yawPitchToVector3(yaw, pitch, radius = 500) {
    const cosPitch = Math.cos(pitch);
    const x = -radius * cosPitch * Math.sin(yaw);
    const y = radius * Math.sin(pitch);
    const z = -radius * cosPitch * Math.cos(yaw);
    return new THREE.Vector3(x, y, z);
  }

  static vector3ToYawPitch(x, y, z) {
    const radius = Math.sqrt(x * x + y * y + z * z) || 1;
    const yaw = Math.atan2(-x, -z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, y / radius)));
    return { yaw, pitch, radius };
  }

  init() {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (this.experienceType === 'PHOTO_IMMERSIVE') {
      this.init360Sphere();
    } else {
      // 2D Photo Showroom / Multi-View Photo / Designed Showroom
      this.init2DPhotoShowroom();
    }

    this.renderPinpointMarkers();
    window.addEventListener('resize', () => this.handleResize());
  }

  // ============================================================
  // 360° EQUIRECTANGULAR SPHERE PIPELINE
  // ============================================================
  init360Sphere() {
    const width = this.container.clientWidth || 1000;
    const height = this.container.clientHeight || 550;

    this.scene = new THREE.Scene();
    this.textureLoader = new THREE.TextureLoader();

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.01, 2000);
    this.camera.position.set(0, 0, 0.01);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp',
      alpha: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    if (THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableZoom = true;
    this.controls.minDistance = 0.005;
    this.controls.maxDistance = 0.05;
    this.controls.enablePan = false;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.rotateSpeed = -0.42;

    const sphereGeo = new THREE.SphereGeometry(this.sphereRadius, 128, 64);
    sphereGeo.scale(-1, 1, 1);

    this.photoMaterial = new THREE.MeshBasicMaterial({
      side: THREE.FrontSide,
      transparent: true,
      opacity: 1.0,
      depthWrite: false
    });
    this.photoSphere = new THREE.Mesh(sphereGeo, this.photoMaterial);
    this.photoSphere.rotation.y = -Math.PI * 0.5;
    this.photoSphere.position.set(0, 0, 0);
    this.scene.add(this.photoSphere);

    if (this.views.length > 0) {
      this.switchNode(0);
    }

    this.renderer.domElement.addEventListener('click', (e) => this.handleCanvasClick360(e));
    this.animate360();
  }

  animate360() {
    if (this.experienceType !== 'PHOTO_IMMERSIVE') return;
    requestAnimationFrame(() => this.animate360());
    if (this.controls) this.controls.update();
    this.updatePinpointsProjection360();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  handleCanvasClick360(event) {
    const rect = this.container.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
    const intersects = this.raycaster.intersectObject(this.photoSphere);

    if (intersects.length > 0 && this.onPinpointCreated) {
      const hit = intersects[0].point;
      const { yaw, pitch } = PhotoImmersiveEngine.vector3ToYawPitch(hit.x, hit.y, hit.z);

      this.onPinpointCreated({
        yaw: Number(yaw.toFixed(4)),
        pitch: Number(pitch.toFixed(4)),
        coordinateSystem: 'PANORAMA_YAW_PITCH',
        viewId: this.views[this.currentNodeIdx] ? this.views[this.currentNodeIdx].viewId : 'view-0'
      });
    }
  }

  updatePinpointsProjection360() {
    if (!this.hotspotLayer) return;
    const currentView = this.views[this.currentNodeIdx];
    const currentViewId = currentView ? currentView.viewId : 'view-0';
    const activePinpoints = this.pinpoints.filter(p => !p.viewId || p.viewId === currentViewId || p.viewId === `view-${this.currentNodeIdx}`);

    const rect = this.container.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    activePinpoints.forEach(pin => {
      const el = this.hotspotLayer.querySelector(`[data-pin-id="${pin.pinpointId}"]`);
      if (!el) return;

      let pos;
      if (pin.yaw !== undefined && pin.pitch !== undefined) {
        pos = PhotoImmersiveEngine.yawPitchToVector3(Number(pin.yaw), Number(pin.pitch), this.sphereRadius);
      } else {
        pos = new THREE.Vector3(pin.x || 0, pin.y || 0, pin.z || -300);
      }

      const projected = pos.clone().project(this.camera);

      if (projected.z > 1.0) {
        el.style.display = 'none';
      } else {
        el.style.display = 'flex';
        const screenX = (projected.x * halfW) + halfW;
        const screenY = -(projected.y * halfH) + halfH;
        el.style.transform = `translate(-50%, -50%) translate(${screenX}px, ${screenY}px)`;
      }
    });
  }

  // ============================================================
  // 2D PHOTO SHOWROOM / MULTI-VIEW PIPELINE (NORMALIZED_2D)
  // ============================================================
  init2DPhotoShowroom() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'center';
    this.container.style.background = '#030712';

    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.style.width = '100%';
    wrap.style.height = '100%';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.cursor = 'crosshair';

    this.img2DElement = document.createElement('img');
    const currentView = this.views[this.currentNodeIdx] || {};
    const srcUrl = currentView.highResUrl || currentView.previewUrl || currentView.url || '';
    if (!srcUrl) {
      console.error('[PhotoEngine] No image source URL configured for view', currentView);
    }
    this.img2DElement.src = srcUrl;
    this.img2DElement.style.maxWidth = '100%';
    this.img2DElement.style.maxHeight = '100%';
    this.img2DElement.style.objectFit = 'contain';
    this.img2DElement.style.userSelect = 'none';
    this.img2DElement.style.pointerEvents = 'auto';

    wrap.appendChild(this.img2DElement);
    this.container.appendChild(wrap);
    this.img2DContainer = wrap;

    this.img2DElement.addEventListener('click', (e) => this.handleCanvasClick2D(e));
    this.img2DElement.addEventListener('load', () => this.updatePinpointsProjection2D());
  }

  handleCanvasClick2D(event) {
    if (!this.onPinpointCreated || !this.img2DElement) return;
    const rect = this.img2DElement.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

    this.onPinpointCreated({
      u: Number(u.toFixed(4)),
      v: Number(v.toFixed(4)),
      coordinateSystem: 'NORMALIZED_2D',
      viewId: this.views[this.currentNodeIdx] ? this.views[this.currentNodeIdx].viewId : 'view-0'
    });
  }

  updatePinpointsProjection2D() {
    if (!this.hotspotLayer || !this.img2DElement) return;
    const currentView = this.views[this.currentNodeIdx];
    const currentViewId = currentView ? currentView.viewId : 'view-0';
    const activePinpoints = this.pinpoints.filter(p => !p.viewId || p.viewId === currentViewId || p.viewId === `view-${this.currentNodeIdx}`);

    const rect = this.img2DElement.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    const offsetX = rect.left - containerRect.left;
    const offsetY = rect.top - containerRect.top;

    activePinpoints.forEach(pin => {
      const el = this.hotspotLayer.querySelector(`[data-pin-id="${pin.pinpointId}"]`);
      if (!el) return;

      const u = pin.u !== undefined ? pin.u : 0.5;
      const v = pin.v !== undefined ? pin.v : 0.5;

      const screenX = offsetX + (u * rect.width);
      const screenY = offsetY + (v * rect.height);

      el.style.display = 'flex';
      el.style.transform = `translate(-50%, -50%) translate(${screenX}px, ${screenY}px)`;
    });
  }

  // ============================================================
  // COMMON CONTROLS & PINPOINTS
  // ============================================================
  switchNode(index) {
    if (!this.views[index]) return;
    this.currentNodeIdx = index;
    const view = this.views[index];

    if (this.experienceType === 'PHOTO_IMMERSIVE') {
      const previewUrl = view.previewUrl;
      const highResUrl = view.highResUrl || view.previewUrl;

      if (this.textureCache[highResUrl]) {
        this.photoMaterial.map = this.textureCache[highResUrl];
        this.photoMaterial.needsUpdate = true;
      } else {
        if (previewUrl && !this.textureCache[previewUrl]) {
          this.textureLoader.load(previewUrl, (tex) => {
            if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
            this.textureCache[previewUrl] = tex;
            if (!this.textureCache[highResUrl]) {
              this.photoMaterial.map = tex;
              this.photoMaterial.needsUpdate = true;
            }
          });
        }
        this.textureLoader.load(highResUrl, (tex) => {
          if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
          this.textureCache[highResUrl] = tex;
          this.photoMaterial.map = tex;
          this.photoMaterial.needsUpdate = true;
        });
      }
    } else {
      if (this.img2DElement) {
        this.img2DElement.src = view.highResUrl || view.previewUrl || view.url;
      }
    }

    this.renderPinpointMarkers();
  }

  renderPinpointMarkers() {
    if (!this.hotspotLayer) return;
    this.hotspotLayer.innerHTML = '';

    const currentView = this.views[this.currentNodeIdx];
    const currentViewId = currentView ? currentView.viewId : 'view-0';
    const activePinpoints = this.pinpoints.filter(p => !p.viewId || p.viewId === currentViewId || p.viewId === `view-${this.currentNodeIdx}`);

    activePinpoints.forEach(pin => {
      const el = document.createElement('div');
      el.className = 'dn-pinpoint-marker';
      el.dataset.pinId = pin.pinpointId;
      el.dataset.targetId = pin.targetId;
      el.innerHTML = `
        <div class="pin-pulse"></div>
        <div class="pin-capsule">
          <span class="pin-category">${pin.categoryTag || 'PRODUCT'}</span>
          <span class="pin-title">${pin.label}</span>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openProductDrawer(pin.targetId);
      });

      this.hotspotLayer.appendChild(el);
    });

    if (this.experienceType !== 'PHOTO_IMMERSIVE') {
      setTimeout(() => this.updatePinpointsProjection2D(), 50);
    }
  }

  addPinpoint(pinpointData) {
    this.pinpoints.push(pinpointData);
    this.renderPinpointMarkers();
  }

  addProduct(productData) {
    this.products.push(productData);
  }

  openProductDrawer(productId) {
    const prod = this.products.find(p => p.productId === productId || p.id === productId);
    if (this.onProductSelected && prod) {
      this.onProductSelected(prod);
    }
  }

  handleResize() {
    if (this.experienceType === 'PHOTO_IMMERSIVE') {
      if (!this.container || !this.renderer) return;
      const rect = this.container.getBoundingClientRect();
      const width = rect.width || this.container.clientWidth || 1000;
      const height = rect.height || this.container.clientHeight || 550;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    } else {
      this.updatePinpointsProjection2D();
    }
  }

  getPinpointScreenPosition(pinpointId) {
    const pin = this.pinpoints.find(p => p.pinpointId === pinpointId);
    if (!pin) return null;

    if (this.experienceType === 'PHOTO_IMMERSIVE') {
      let pos;
      if (pin.yaw !== undefined && pin.pitch !== undefined) {
        pos = PhotoImmersiveEngine.yawPitchToVector3(Number(pin.yaw), Number(pin.pitch), this.sphereRadius);
      } else {
        pos = new THREE.Vector3(pin.x || 0, pin.y || 0, pin.z || -300);
      }
      const rect = this.container.getBoundingClientRect();
      const projected = pos.clone().project(this.camera);
      return {
        screenX: (projected.x * (rect.width / 2)) + (rect.width / 2),
        screenY: -(projected.y * (rect.height / 2)) + (rect.height / 2),
        visible: projected.z <= 1.0
      };
    } else {
      if (!this.img2DElement) return null;
      const rect = this.img2DElement.getBoundingClientRect();
      const u = pin.u !== undefined ? pin.u : 0.5;
      const v = pin.v !== undefined ? pin.v : 0.5;
      return {
        screenX: rect.left + (u * rect.width),
        screenY: rect.top + (v * rect.height),
        visible: true
      };
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PhotoImmersiveEngine };
}
