/* ============================================================
   Virtual Trade Show Commercial V1 — Shared 3D Booth Engine
   Real-time WebGL / Three.js 3D Booth Renderer & Raycast System
   Experience Type: ONE_PHOTO_3D_BOOTH
============================================================ */

const BoothEngine = {
  // 1. Standard Scene Initialization
  initScene(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    scene.fog = new THREE.FogExp2(0x060911, 0.03);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2.2, 7.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // Slightly below horizon
    controls.minPolarAngle = 0.1;
    controls.minDistance = 2.0;
    controls.maxDistance = 14.0;
    controls.target.set(0, 1.3, -1.2);

    // Standard Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.3);
    mainLight.position.set(6, 9, 6);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

    const cyanSpot = new THREE.PointLight(0x38bdf8, 2.2, 18);
    cyanSpot.position.set(-3.5, 4.5, -1);
    scene.add(cyanSpot);

    const warmSpot = new THREE.PointLight(0xfbbf24, 1.6, 18);
    warmSpot.position.set(3.5, 3.8, -1);
    scene.add(warmSpot);

    const onResize = () => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer, controls, cleanup: () => window.removeEventListener('resize', onResize) };
  },

  // 2. Dynamic Canvas Signage Texture Generator
  createSignageTexture(businessName) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#0284c7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 256);

    // Border trim
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 1012, 244);

    // Business Name Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.fillText((businessName || 'COMMERCIAL EXHIBITOR').toUpperCase(), 512, 115);

    // Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.shadowBlur = 0;
    ctx.fillText('3D VIRTUAL SHOWROOM • POWERED BY DN’A', 512, 185);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  },

  // 3. Build Real 3D Booth Environment (ONE_PHOTO_3D_BOOTH)
  buildOnePhoto3DBooth(scene, boothData = {}) {
    const existing = scene.getObjectByName('OnePhoto3DBoothRoom');
    if (existing) scene.remove(existing);

    const boothGroup = new THREE.Group();
    boothGroup.name = 'OnePhoto3DBoothRoom';

    const textureLoader = new THREE.TextureLoader();
    const photoUrl = boothData.photoUrl || boothData.sourceAsset?.previewUrl || (boothData.photos && boothData.photos[0]) || '';
    const bizName = boothData.businessName || boothData.name || 'Commercial Exhibitor';

    // A. Exhibition Hall Floor (Glossy reflective floor)
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x080e1a,
      roughness: 0.18,
      metalness: 0.65
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    floor.name = 'BoothFloor';
    boothGroup.add(floor);

    // Floor Boundary Grid / Carpet
    const carpetGeo = new THREE.PlaneGeometry(11, 8.5);
    const carpetMat = new THREE.MeshStandardMaterial({
      color: 0x111c30,
      roughness: 0.75,
      metalness: 0.2
    });
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, -0.47, -1.2);
    carpet.receiveShadow = true;
    carpet.name = 'BoothCarpet';
    boothGroup.add(carpet);

    // B. Backwall Display Structure
    const backwallGeo = new THREE.PlaneGeometry(10, 4.4);
    let backwallMat;
    if (photoUrl) {
      const photoTex = textureLoader.load(photoUrl);
      photoTex.wrapS = THREE.ClampToEdgeWrapping;
      photoTex.wrapT = THREE.ClampToEdgeWrapping;
      backwallMat = new THREE.MeshStandardMaterial({
        map: photoTex,
        roughness: 0.35,
        metalness: 0.15
      });
    } else {
      backwallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    }
    const backwall = new THREE.Mesh(backwallGeo, backwallMat);
    backwall.position.set(0, 1.7, -5.2);
    backwall.receiveShadow = true;
    backwall.name = 'BoothBackwall';
    boothGroup.add(backwall);

    // Backwall Metallic Frame Bezel
    const frameGeo = new THREE.BoxGeometry(10.3, 4.6, 0.15);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.2,
      metalness: 0.85
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 1.7, -5.28);
    frame.name = 'BoothBackwallFrame';
    boothGroup.add(frame);

    // C. Overhead Illuminated Fascia Header Signage (Dynamic Business Name)
    const signageTex = BoothEngine.createSignageTexture(bizName);
    const signageGeo = new THREE.BoxGeometry(10.5, 1.2, 0.35);
    const signageMats = [
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 }), // right
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 }), // left
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 }), // top
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 }), // bottom
      new THREE.MeshStandardMaterial({ map: signageTex, roughness: 0.2, metalness: 0.2, emissive: 0x0284c7, emissiveIntensity: 0.15 }), // front
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 })  // back
    ];
    const signage = new THREE.Mesh(signageGeo, signageMats);
    signage.position.set(0, 4.4, -4.6);
    signage.castShadow = true;
    signage.name = 'BoothSignage';
    boothGroup.add(signage);

    // D. Left & Right Architectural Partition Wings
    const wingGeo = new THREE.BoxGeometry(0.3, 4.8, 5.0);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.6
    });

    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(-5.15, 1.9, -2.7);
    leftWing.receiveShadow = true;
    leftWing.name = 'BoothLeftWall';
    boothGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.set(5.15, 1.9, -2.7);
    rightWing.receiveShadow = true;
    rightWing.name = 'BoothRightWall';
    boothGroup.add(rightWing);

    // E. Product Presentation Pedestals / Podium Surfaces
    const pedestalPositions = [
      { x: -2.8, y: 0.2, z: -3.2, name: 'BoothPedestal_0' },
      { x: 2.8, y: 0.2, z: -3.2, name: 'BoothPedestal_1' },
      { x: 0.0, y: 0.15, z: -4.2, name: 'BoothPedestal_2' }
    ];

    pedestalPositions.forEach((pos) => {
      const pedGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.9, 32);
      const pedMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.25,
        metalness: 0.55
      });
      const ped = new THREE.Mesh(pedGeo, pedMat);
      ped.position.set(pos.x, pos.y, pos.z);
      ped.receiveShadow = true;
      ped.castShadow = true;
      ped.name = pos.name;
      boothGroup.add(ped);

      // Glass Top Ring on Pedestal
      const topGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.06, 32);
      const topMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.1,
        metalness: 0.9,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.2
      });
      const topMesh = new THREE.Mesh(topGeo, topMat);
      topMesh.position.set(pos.x, pos.y + 0.48, pos.z);
      topMesh.name = `${pos.name}_Top`;
      boothGroup.add(topMesh);
    });

    scene.add(boothGroup);
    return BoothEngine.getRaycastSurfaces(scene);
  },

  // 4. Extract Interactive Raycasting Surfaces
  getRaycastSurfaces(scene) {
    const surfaces = [];
    scene.traverse(child => {
      if (child.isMesh && child.visible && child.name && !child.name.includes('Frame')) {
        surfaces.push(child);
      }
    });
    return surfaces;
  },

  // 5. Raycast 3D surface point from pointer click
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
        z: Number(hit.point.z.toFixed(3)),
        targetObjectId: hit.object.name || 'BoothSurface'
      };
    }
    return null;
  }
};

window.BoothEngine = BoothEngine;
