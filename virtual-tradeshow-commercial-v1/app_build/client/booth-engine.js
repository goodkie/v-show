/**
 * Virtual Trade Show Commercial V1 — Shared Booth 3D Engine
 * Standardized coordinate system and raycasting surfaces for both Admin & Buyer Viewer.
 */

window.BoothEngine = (function() {
  const textureLoader = new THREE.TextureLoader();

  /**
   * Initializes a Three.js scene, camera, renderer, and OrbitControls
   */
  function initScene(container, options = {}) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17);
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.035);

    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(0, 2.2, 7.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 15;
    controls.target.set(0, 1.2, -1);

    // Standard Booth Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xe0f2fe, 1.2);
    dirLight.position.set(5, 12, 8);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const accentLight = new THREE.PointLight(0x06b6d4, 2.5, 15);
    accentLight.position.set(0, 4, -2);
    scene.add(accentLight);

    const resizeHandler = () => {
      if (!camera || !renderer || !container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', resizeHandler);

    return {
      scene,
      camera,
      renderer,
      controls,
      container,
      dispose: () => {
        window.removeEventListener('resize', resizeHandler);
        renderer.dispose();
      }
    };
  }

  /**
   * Constructs the standardized 3D Booth Environment & returns clickable raycast surfaces
   */
  function buildBooth(scene, booth) {
    // Clean existing booth meshes
    const toRemove = [];
    scene.traverse(child => {
      if (child.isMesh && child.userData && child.userData.boothMesh) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(m => scene.remove(m));

    const raycastSurfaces = [];

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(24, 24);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.2,
      metalness: 0.5
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    floor.userData = { boothMesh: true, surfaceName: 'floor' };
    scene.add(floor);
    raycastSurfaces.push(floor);

    // 2. Booth Platform
    const platformGeo = new THREE.CylinderGeometry(6.5, 6.8, 0.2, 32);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.3
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(0, -0.4, -1);
    platform.receiveShadow = true;
    platform.userData = { boothMesh: true, surfaceName: 'platform' };
    scene.add(platform);
    raycastSurfaces.push(platform);

    // 3. Grid Helper
    const grid = new THREE.GridHelper(24, 24, 0x0284c7, 0x1e293b);
    grid.position.y = -0.49;
    grid.userData = { boothMesh: true };
    scene.add(grid);

    // 4. Backwall Main Display Panel (Mode A: Photo Preview)
    const backwallGeo = new THREE.BoxGeometry(10, 4.5, 0.2);
    let backwallMat;
    if (booth.photos && booth.photos.length > 0) {
      const mainPhotoTex = textureLoader.load(booth.photos[0]);
      backwallMat = [
        new THREE.MeshStandardMaterial({ color: 0x1e293b }),
        new THREE.MeshStandardMaterial({ color: 0x1e293b }),
        new THREE.MeshStandardMaterial({ color: 0x1e293b }),
        new THREE.MeshStandardMaterial({ color: 0x1e293b }),
        new THREE.MeshStandardMaterial({ map: mainPhotoTex, roughness: 0.5 }), // Front display
        new THREE.MeshStandardMaterial({ color: 0x0f172a })
      ];
    } else {
      backwallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    }
    const backwall = new THREE.Mesh(backwallGeo, backwallMat);
    backwall.position.set(0, 1.85, -5.5);
    backwall.castShadow = true;
    backwall.receiveShadow = true;
    backwall.userData = { boothMesh: true, surfaceName: 'backwall' };
    scene.add(backwall);
    raycastSurfaces.push(backwall);

    // 5. Left & Right Wing Panels
    const wingGeo = new THREE.BoxGeometry(4.5, 3.8, 0.15);

    // Left Wing
    let leftMat;
    if (booth.photos && booth.photos.length > 1) {
      leftMat = new THREE.MeshStandardMaterial({ map: textureLoader.load(booth.photos[1]), roughness: 0.5 });
    } else {
      leftMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    }
    const leftWing = new THREE.Mesh(wingGeo, leftMat);
    leftWing.position.set(-5.2, 1.5, -3.2);
    leftWing.rotation.y = Math.PI / 4;
    leftWing.userData = { boothMesh: true, surfaceName: 'leftWing' };
    scene.add(leftWing);
    raycastSurfaces.push(leftWing);

    // Right Wing
    let rightMat;
    if (booth.photos && booth.photos.length > 2) {
      rightMat = new THREE.MeshStandardMaterial({ map: textureLoader.load(booth.photos[2]), roughness: 0.5 });
    } else {
      rightMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    }
    const rightWing = new THREE.Mesh(wingGeo, rightMat);
    rightWing.position.set(5.2, 1.5, -3.2);
    rightWing.rotation.y = -Math.PI / 4;
    rightWing.userData = { boothMesh: true, surfaceName: 'rightWing' };
    scene.add(rightWing);
    raycastSurfaces.push(rightWing);

    // 6. Product Pedestals
    const p1 = createPedestalMesh(-2.8, -0.4, -3.5, 0.8, 0.9, 'pedestalLeft');
    const p2 = createPedestalMesh(2.6, -0.4, -3.2, 0.8, 0.9, 'pedestalRight');
    const p3 = createPedestalMesh(0.0, -0.4, -1.8, 1.2, 0.7, 'pedestalCenter');
    
    scene.add(p1); raycastSurfaces.push(p1);
    scene.add(p2); raycastSurfaces.push(p2);
    scene.add(p3); raycastSurfaces.push(p3);

    return raycastSurfaces;
  }

  function createPedestalMesh(x, y, z, radius, height, name) {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.1, height, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.7
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { boothMesh: true, surfaceName: name };
    return mesh;
  }

  /**
   * Raycast from mouse/touch coordinate against valid booth surfaces
   */
  function raycastBooth(event, camera, surfaces, container) {
    const rect = container.getBoundingClientRect();
    const clientX = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : null);
    const clientY = event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : null);

    if (clientX === null || clientY === null) return null;

    const mouse = new THREE.Vector2();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(surfaces, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        point: hit.point,
        normal: hit.face ? hit.face.normal : null,
        surface: hit.object.userData.surfaceName || 'surface'
      };
    }
    return null;
  }

  return {
    initScene,
    buildBooth,
    raycastBooth
  };
})();
