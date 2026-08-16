/* ============================================================
   Virtual Trade Show Commercial V1 — Shared 3D Booth Engine
   Standardized Three.js Coordinates & Hybrid Precision Splat Adapter (Phase 5)
============================================================ */

const BoothEngine = {
  // 1. Standard Scene Initialization
  initScene(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.035);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 2.2, 7.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Slightly below horizon
    controls.minDistance = 2.0;
    controls.maxDistance = 14.0;
    controls.target.set(0, 1.2, -1);

    // Standard Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 8, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

    const blueAccentLight = new THREE.PointLight(0x06b6d4, 1.5, 15);
    blueAccentLight.position.set(-3, 3, -2);
    scene.add(blueAccentLight);

    const warmAccentLight = new THREE.PointLight(0xf59e0b, 1.2, 15);
    warmAccentLight.position.set(3, 2, -2);
    scene.add(warmAccentLight);

    window.addEventListener('resize', () => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });

    return { scene, camera, renderer, controls };
  },

  // 2. Hybrid Booth Construction (Precision Splat vs Photo Preview)
  async buildBooth(scene, booth, options = {}) {
    // Clear existing booth meshes
    const existingPhotoRoom = scene.getObjectByName('PhotoPreviewRoom');
    if (existingPhotoRoom) scene.remove(existingPhotoRoom);

    const existingPrecisionRoom = scene.getObjectByName('PrecisionSplatBooth');
    if (existingPrecisionRoom) scene.remove(existingPrecisionRoom);

    const isVerifiedPrecision = booth.reconstructionStatus === 'verified' && 
                                booth.spatialModel && 
                                booth.spatialModel.assetUrl;

    const forcePhotoPreview = options.forcePhotoPreview || false;

    // Branch A: Verified Precision Gaussian Splat Mode
    if (isVerifiedPrecision && !forcePhotoPreview && window.PrecisionSplatViewer) {
      const precisionViewer = new PrecisionSplatViewer({
        scene,
        qualityPreset: options.qualityPreset || 'AUTO',
        onProgress: options.onProgress,
        onError: options.onError,
        onFallback: (reason) => {
          console.warn(`[BoothEngine] Precision load fallback triggered (${reason}). Rendering Photo Preview.`);
          BoothEngine.buildPhotoPreviewBooth(scene, booth);
          if (options.onFallback) options.onFallback(reason);
        }
      });

      const loaded = await precisionViewer.load(booth.spatialModel, booth.spatialModel.transform);
      if (loaded) {
        return BoothEngine.getRaycastSurfaces(scene);
      }
    }

    // Branch B: Standard Photo Preview Mode (Default & Safe Fallback)
    return BoothEngine.buildPhotoPreviewBooth(scene, booth);
  },

  buildPhotoPreviewBooth(scene, booth) {
    const boothGroup = new THREE.Group();
    boothGroup.name = 'PhotoPreviewRoom';

    const textureLoader = new THREE.TextureLoader();
    const photos = booth.photos || [];

    // Floor Platform
    const floorGeo = new THREE.PlaneGeometry(12, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.5
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    floor.name = 'BoothFloor';
    boothGroup.add(floor);

    // Carpet / Inner Stand
    const carpetGeo = new THREE.PlaneGeometry(9, 7);
    const carpetMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8
    });
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, -0.48, -1);
    carpet.receiveShadow = true;
    carpet.name = 'BoothCarpet';
    boothGroup.add(carpet);

    // Backwall with Photo Texture
    const backwallGeo = new THREE.PlaneGeometry(11, 4.2);
    let backwallMat;
    if (photos.length > 0) {
      const tex = textureLoader.load(photos[0]);
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      backwallMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.4
      });
    } else {
      backwallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    }
    const backwall = new THREE.Mesh(backwallGeo, backwallMat);
    backwall.position.set(0, 1.6, -5.5);
    backwall.receiveShadow = true;
    backwall.name = 'BoothBackwall';
    boothGroup.add(backwall);

    // Left Wing
    const leftWallGeo = new THREE.PlaneGeometry(9, 4.2);
    let leftWallMat;
    if (photos.length > 1) {
      const tex2 = textureLoader.load(photos[1]);
      leftWallMat = new THREE.MeshStandardMaterial({ map: tex2, roughness: 0.4 });
    } else {
      leftWallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    }
    const leftWall = new THREE.Mesh(leftWallGeo, leftWallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-5.5, 1.6, -1);
    leftWall.name = 'BoothLeftWall';
    boothGroup.add(leftWall);

    // Right Wing
    const rightWallGeo = new THREE.PlaneGeometry(9, 4.2);
    let rightWallMat;
    if (photos.length > 2) {
      const tex3 = textureLoader.load(photos[2]);
      rightWallMat = new THREE.MeshStandardMaterial({ map: tex3, roughness: 0.4 });
    } else {
      rightWallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    }
    const rightWall = new THREE.Mesh(rightWallGeo, rightWallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(5.5, 1.6, -1);
    rightWall.name = 'BoothRightWall';
    boothGroup.add(rightWall);

    // Product Pedestals
    const pedestalPositions = [
      { x: -2.8, y: 0.1, z: -3.5 },
      { x: 2.6, y: -0.05, z: -3.2 },
      { x: 0.1, y: 0.4, z: -4.8 }
    ];

    pedestalPositions.forEach((pos, idx) => {
      const pedGeo = new THREE.CylinderGeometry(0.7, 0.8, 0.9, 32);
      const pedMat = new THREE.MeshStandardMaterial({
        color: 0x0f766e,
        roughness: 0.3,
        metalness: 0.4
      });
      const ped = new THREE.Mesh(pedGeo, pedMat);
      ped.position.set(pos.x, pos.y, pos.z);
      ped.receiveShadow = true;
      ped.name = `BoothPedestal_${idx}`;
      boothGroup.add(ped);
    });

    scene.add(boothGroup);
    return BoothEngine.getRaycastSurfaces(scene);
  },

  // 3. Extract Interactive Raycasting Surfaces
  getRaycastSurfaces(scene) {
    const surfaces = [];
    scene.traverse(child => {
      if (child.isMesh && child.visible) {
        surfaces.push(child);
      }
    });
    return surfaces;
  },

  // 4. Raycast surface point from pointer click
  raycastBooth(event, container, camera, surfaces) {
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(surfaces, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        x: Number(hit.point.x.toFixed(3)),
        y: Number(hit.point.y.toFixed(3)),
        z: Number(hit.point.z.toFixed(3))
      };
    }
    return null;
  }
};

window.BoothEngine = BoothEngine;
