/* ============================================================
   dn’a Virtual Trade Show — Photo Immersive Master Engine (v1.0)
   Standard Data-Driven Equirectangular Sphere, Pinpoints & Buyer Tools
============================================================ */

class PhotoImmersiveEngine {
  constructor(options = {}) {
    this.container = options.container;
    this.manifest = options.manifest || {};
    this.isEditorMode = !!options.isEditorMode;
    this.onPinpointCreated = options.onPinpointCreated || null;
    this.onProductSelected = options.onProductSelected || null;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.photoSphere = null;
    this.photoMaterial = null;
    this.textureLoader = null;
    this.textureCache = {};

    this.currentNodeIdx = 0;
    this.views = this.manifest.views || [];
    this.pinpoints = this.manifest.pinpoints || [];
    this.products = this.manifest.products || [];

    this.hotspotLayer = options.hotspotLayer || null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.init();
  }

  init() {
    if (!this.container) return;
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

    this.container.innerHTML = '';
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

    // True Equirectangular Inverted Sphere
    const sphereGeo = new THREE.SphereGeometry(500, 128, 64);
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

    // Initial View Texture Load
    if (this.views.length > 0) {
      this.switchNode(0);
    }

    // Render Pinpoint Markers
    this.renderPinpointMarkers();

    // Editor Click Handler for Instant Pinpoint Visual Creation
    this.renderer.domElement.addEventListener('click', (e) => this.handleCanvasClick(e));
    window.addEventListener('resize', () => this.handleResize());

    this.animate();
  }

  switchNode(index) {
    if (!this.views[index]) return;
    this.currentNodeIdx = index;
    const view = this.views[index];
    const previewUrl = view.previewUrl;
    const highResUrl = view.highResUrl || view.previewUrl;

    if (this.textureCache[highResUrl]) {
      this.photoMaterial.map = this.textureCache[highResUrl];
      this.photoMaterial.needsUpdate = true;
    } else {
      // Load 2K preview texture first for instant feedback
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

      // Progressively load 8K/16K master texture
      this.textureLoader.load(highResUrl, (tex) => {
        if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        this.textureCache[highResUrl] = tex;
        this.photoMaterial.map = tex;
        this.photoMaterial.needsUpdate = true;
      });
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
  }

  updatePinpointsProjection() {
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

      const pos = new THREE.Vector3(pin.x || 0, pin.y || 0, pin.z || -300);
      const projected = pos.clone().project(this.camera);

      // Check if marker is in front of camera
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

  handleCanvasClick(event) {
    const rect = this.container.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
    const intersects = this.raycaster.intersectObject(this.photoSphere);

    if (intersects.length > 0 && this.onPinpointCreated) {
      const hit = intersects[0].point;
      this.onPinpointCreated({
        x: Math.round(hit.x),
        y: Math.round(hit.y),
        z: Math.round(hit.z),
        viewId: this.views[this.currentNodeIdx] ? this.views[this.currentNodeIdx].viewId : 'view-0'
      });
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
    if (!this.container || !this.renderer) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || this.container.clientWidth || 1000;
    const height = rect.height || this.container.clientHeight || 550;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    this.updatePinpointsProjection();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PhotoImmersiveEngine };
}
