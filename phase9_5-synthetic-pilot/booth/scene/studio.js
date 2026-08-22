/* AUREX Deterministic 3D Synthetic Studio Engine */
(function() {
  const width = 1600;
  const height = 1200;
  const container = document.getElementById('viewport');

  // 1. Scene & Renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b14);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(54.4, width / height, 0.1, 100);

  // 2. Texture Generator for High-Contrast SfM Features
  function createTextTexture(text, subtext, bg, fg, w = 2048, h = 1024) {
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // High-contrast grid lines for SfM corner detectors
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 4;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.fillStyle = fg;
    ctx.font = "bold 68px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, h / 2 - (subtext ? 30 : -20));

    if (subtext) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "36px sans-serif";
      ctx.fillText(subtext, w / 2, h / 2 + 50);
    }
    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 3. Materials
  const matNavy = new THREE.MeshStandardMaterial({ color: 0x0b132b, roughness: 0.35, metalness: 0.2 });
  const matBlue = new THREE.MeshStandardMaterial({ color: 0x1c64f2, roughness: 0.25, metalness: 0.4 });
  const matCyan = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.2, metalness: 0.5 });
  const matAlum = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.85 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.3 });
  const matWallWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, metalness: 0.05 });

  // 4. Floor (10m x 8m)
  const floorGeo = new THREE.BoxGeometry(10.0, 0.05, 8.0);
  const floorTex = createTextTexture("AUREX SMART FACTORY", "ZONE D-401 • INDUSTRIAL AUTOMATION", "#151c28", "#38bdf8", 2048, 2048);
  floorTex.repeat.set(2, 2);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
  floor.position.set(0, -0.025, -1.0);
  floor.receiveShadow = true;
  scene.add(floor);

  // 5. Overhead Suspended Header
  const headerGeo = new THREE.BoxGeometry(8.5, 0.8, 5.5);
  const headerTex = createTextTexture("AUREX AUTOMATION TECHNOLOGIES", "INTELLIGENT ROBOTICS & SMART MANUFACTURING", "#0b132b", "#00e5ff", 2048, 512);
  const header = new THREE.Mesh(headerGeo, new THREE.MeshStandardMaterial({ map: headerTex, roughness: 0.3, metalness: 0.3 }));
  header.position.set(0, 4.0, -1.0);
  header.castShadow = true;
  scene.add(header);

  // 6. Rear Wall & Big Display Screen
  const rearWall = new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.8, 0.2), matNavy);
  rearWall.position.set(0, 1.9, -3.95);
  rearWall.receiveShadow = true;
  scene.add(rearWall);

  const screenTex = createTextTexture("SMART FACTORY PLATFORM", "AUTONOMOUS LOGISTICS • DIGITAL TWIN AI", "#0f172a", "#38bdf8", 2048, 1024);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.3), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 2.2, -3.83);
  scene.add(screen);

  // 7. Central Island — AXR-500 AMR
  const amrIsland = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.15, 32), matDark);
  amrIsland.position.set(0, 0.075, 0.0);
  amrIsland.receiveShadow = true;
  scene.add(amrIsland);

  const amrBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 1.4), matWallWhite);
  amrBody.position.set(0, 0.32, 0.0);
  amrBody.castShadow = true;
  scene.add(amrBody);

  const amrTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 24), matBlue);
  amrTop.position.set(0, 0.55, -0.1);
  scene.add(amrTop);

  // 8. Left Zone — Cobot C7 & Conveyor FLEX-20
  const leftDesk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 1.4), matDark);
  leftDesk.position.set(-3.1, 0.425, -1.5);
  leftDesk.castShadow = true; leftDesk.receiveShadow = true;
  scene.add(leftDesk);

  const cobotBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.2, 16), matAlum);
  cobotBase.position.set(-3.1, 0.95, -1.5);
  scene.add(cobotBase);

  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 16), matBlue);
  arm1.position.set(-3.1, 1.35, -1.5);
  arm1.rotation.z = Math.PI / 6;
  scene.add(arm1);

  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 16), matWallWhite);
  arm2.position.set(-2.8, 1.7, -1.5);
  arm2.rotation.z = -Math.PI / 4;
  scene.add(arm2);

  const conv = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.6), matAlum);
  conv.position.set(-2.5, 0.35, -2.8);
  conv.castShadow = true;
  scene.add(conv);

  // 9. Right Zone — Vision & Sensor Tower
  const rightDesk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.3), matDark);
  rightDesk.position.set(3.0, 0.45, -1.0);
  rightDesk.castShadow = true; rightDesk.receiveShadow = true;
  scene.add(rightDesk);

  const visPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 16), matAlum);
  visPole.position.set(3.1, 1.45, -1.0);
  scene.add(visPole);

  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.35), matCyan);
  camBox.position.set(3.1, 1.95, -0.9);
  scene.add(camBox);

  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 24), matDark);
  lidar.position.set(2.4, 1.01, -0.8);
  scene.add(lidar);

  // 10. Front Info Kiosk
  const kioskTex = createTextTexture("AUREX", "INFO DESK", "#0b132b", "#ffffff", 1024, 512);
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.6), new THREE.MeshStandardMaterial({ map: kioskTex, roughness: 0.4 }));
  kiosk.position.set(-2.8, 0.5, 2.0);
  kiosk.castShadow = true;
  scene.add(kiosk);

  // 11. Fixed Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight1.position.set(-5, 7, 5);
  dirLight1.castShadow = true;
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xdbeafe, 0.9);
  dirLight2.position.set(5, 7, 5);
  scene.add(dirLight2);

  const ptLight = new THREE.PointLight(0x00d2ff, 1.2, 12);
  ptLight.position.set(0, 3.8, 0);
  scene.add(ptLight);

  // 12. Global Render Function
  window.renderPose = function(pos, target, fov) {
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(target[0], target[1], target[2]);
    camera.fov = fov || 54.4;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', 0.95);
  };

  window.studioReady = true;
})();
