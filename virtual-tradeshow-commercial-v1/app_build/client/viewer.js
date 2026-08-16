/* ============================================================
   Virtual Trade Show Commercial V1 — 3D Viewer Engine
   Three.js Space Rendering & Hotspot Interaction
============================================================ */

let scene, camera, renderer, controls;
let currentBooth = null;
let products = [];
let hotspots = [];
let hotspotObjects = [];
let ws = null;

// DOM Elements
const viewport = document.getElementById('viewport-3d');
const overlay = document.getElementById('hotspots-overlay');
const navBoothName = document.getElementById('nav-booth-name');
const badgeRecon = document.getElementById('badge-recon-status');
const hudTitle = document.getElementById('hud-booth-title');
const hudDesc = document.getElementById('hud-booth-desc');

// Initialize Viewer
async function initViewer() {
  const urlParams = new URLSearchParams(window.location.search);
  const boothId = urlParams.get('boothId') || 'booth-demo-01';

  setupThreeJS();
  setupEventListeners();
  await loadBoothData(boothId);
  setupWebSocket(boothId);
  animate();
}

// 1. Three.js Scene Setup
function setupThreeJS() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f17);
  scene.fog = new THREE.FogExp2(0x0b0f17, 0.035);

  const aspect = viewport.clientWidth / viewport.clientHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  camera.position.set(0, 2.2, 7.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  // OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 + 0.05; // Do not go below floor
  controls.minDistance = 2;
  controls.maxDistance = 15;
  controls.target.set(0, 1.2, -1);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xe0f2fe, 1.2);
  dirLight.position.set(5, 12, 8);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const accentLight = new THREE.PointLight(0x06b6d4, 2.5, 15);
  accentLight.position.set(0, 4, -2);
  scene.add(accentLight);

  // Resize handler
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

// 2. Load Booth & Build 3D Photo Preview Environment
async function loadBoothData(boothId) {
  try {
    // Fetch booth details
    const boothRes = await fetch(`/api/booths/${boothId}`);
    if (!boothRes.ok) throw new Error('Failed to load booth data');
    currentBooth = await boothRes.json();

    // Fetch products
    const prodRes = await fetch(`/api/booths/${boothId}/products`);
    products = await prodRes.json();

    // Fetch hotspots
    const hsRes = await fetch(`/api/booths/${boothId}/hotspots`);
    hotspots = await hsRes.json();

    // Update UI HUD
    navBoothName.textContent = currentBooth.name;
    hudTitle.textContent = currentBooth.name;
    hudDesc.textContent = currentBooth.description || 'Virtual Exhibition Space';
    
    // Status Badge
    updateStatusBadge(currentBooth.reconstructionStatus);

    // Build 3D Booth Environment
    buildBoothEnvironment(currentBooth);

    // Render Hotspots
    renderHotspots(hotspots);

  } catch (error) {
    console.error('Error loading booth data:', error);
    hudTitle.textContent = '부스 로딩 실패';
    hudDesc.textContent = '부스 정보를 불러올 수 없습니다. 관리자에서 새 부스를 등록해 주세요.';
  }
}

function updateStatusBadge(status) {
  badgeRecon.className = 'badge';
  if (status === 'reconstructed' || status === 'verified') {
    badgeRecon.classList.add('badge-reconstructed');
    badgeRecon.textContent = '3D Precision Reconstructed';
  } else {
    badgeRecon.classList.add('badge-preview');
    badgeRecon.textContent = 'Photo Preview Mode';
  }
}

// 3. Build 3D Space (Mode A: Photo Preview Structure)
function buildBoothEnvironment(booth) {
  // Clear previous booth meshes if any
  const toRemove = [];
  scene.traverse(child => {
    if (child.isMesh && child.userData.boothStructure) {
      toRemove.push(child);
    }
  });
  toRemove.forEach(m => scene.remove(m));

  const textureLoader = new THREE.TextureLoader();

  // Floor
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
  floor.userData.boothStructure = true;
  scene.add(floor);

  // Booth Platform
  const platformGeo = new THREE.CylinderGeometry(6.5, 6.8, 0.2, 32);
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
    metalness: 0.3
  });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, -0.4, -1);
  platform.receiveShadow = true;
  platform.userData.boothStructure = true;
  scene.add(platform);

  // Grid Helper on floor
  const grid = new THREE.GridHelper(24, 24, 0x0284c7, 0x1e293b);
  grid.position.y = -0.49;
  grid.userData.boothStructure = true;
  scene.add(grid);

  // Backwall Main Display Panel (Using 1st uploaded photo if available)
  const backwallGeo = new THREE.BoxGeometry(10, 4.5, 0.2);
  let backwallMat;
  if (booth.photos && booth.photos.length > 0) {
    const mainPhotoTex = textureLoader.load(booth.photos[0]);
    backwallMat = [
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
      new THREE.MeshStandardMaterial({ map: mainPhotoTex, roughness: 0.5 }), // Front face
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    ];
  } else {
    backwallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  }

  const backwall = new THREE.Mesh(backwallGeo, backwallMat);
  backwall.position.set(0, 1.85, -5.5);
  backwall.castShadow = true;
  backwall.receiveShadow = true;
  backwall.userData.boothStructure = true;
  scene.add(backwall);

  // Left & Right Display Wing Panels (Using 2nd/3rd photo)
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
  leftWing.userData.boothStructure = true;
  scene.add(leftWing);

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
  rightWing.userData.boothStructure = true;
  scene.add(rightWing);

  // Product Display Pedestals
  createPedestal(-2.8, -0.4, -3.5, 0.8, 0.9);
  createPedestal(2.6, -0.4, -3.2, 0.8, 0.9);
  createPedestal(0.0, -0.4, -1.8, 1.2, 0.7);
}

function createPedestal(x, y, z, radius, height) {
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
  mesh.userData.boothStructure = true;
  scene.add(mesh);
}

// 4. Hotspots 3D to 2D Screen Projection
function renderHotspots(list) {
  hotspotObjects = list.map(hs => {
    // 3D Anchor Object in Three.js
    const anchor = new THREE.Object3D();
    anchor.position.set(hs.position.x, hs.position.y, hs.position.z);
    scene.add(anchor);

    // DOM Marker Pin
    const pin = document.createElement('div');
    pin.className = 'hotspot-marker';
    pin.setAttribute('data-hotspot-id', hs.id);
    pin.innerHTML = `<span>+</span><div class="hotspot-pulse"></div>`;
    pin.title = hs.label || 'View Product';

    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      openProductModal(hs.productId);
    });

    overlay.appendChild(pin);

    return {
      data: hs,
      anchor,
      element: pin
    };
  });
}

function updateHotspotsScreenPosition() {
  if (!camera) return;

  const tempV = new THREE.Vector3();
  const widthHalf = viewport.clientWidth / 2;
  const heightHalf = viewport.clientHeight / 2;

  hotspotObjects.forEach(item => {
    item.anchor.getWorldPosition(tempV);
    
    // Check if behind camera
    const behindCamera = tempV.clone().project(camera).z > 1;
    if (behindCamera) {
      item.element.style.display = 'none';
      return;
    }

    tempV.project(camera);
    const x = (tempV.x * widthHalf) + widthHalf;
    const y = -(tempV.y * heightHalf) + heightHalf;

    item.element.style.display = 'flex';
    item.element.style.left = `${x}px`;
    item.element.style.top = `${y}px`;
  });
}

// 5. Modals & Engagement Handlers
function setupEventListeners() {
  // Modal close handlers
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    });
  });

  // Reset View
  document.getElementById('btn-reset-view').addEventListener('click', () => {
    camera.position.set(0, 2.2, 7.5);
    controls.target.set(0, 1.2, -1);
    controls.update();
  });

  // Open Catalog
  document.getElementById('btn-open-catalog').addEventListener('click', openCatalogModal);

  // Digital Business Card
  document.getElementById('btn-exchange-card').addEventListener('click', () => {
    document.getElementById('modal-lead').classList.add('active');
  });

  // Appointment Booking
  document.getElementById('btn-book-appointment').addEventListener('click', () => {
    document.getElementById('modal-appointment').classList.add('active');
  });

  // Live Showhost
  document.getElementById('btn-live-showhost').addEventListener('click', () => {
    document.getElementById('modal-showhost').classList.add('active');
  });

  // Action Buttons from Product Modal
  document.getElementById('btn-action-rfq').addEventListener('click', () => {
    const prodId = document.getElementById('modal-product').dataset.currentProdId;
    openRFQModal(prodId);
  });

  document.getElementById('btn-action-sample').addEventListener('click', () => {
    const prodId = document.getElementById('modal-product').dataset.currentProdId;
    openSampleModal(prodId);
  });

  // Form Submissions
  setupForms();
}

function openProductModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) {
    showToast('제품 정보를 찾을 수 없습니다.');
    return;
  }

  const modal = document.getElementById('modal-product');
  modal.dataset.currentProdId = prod.id;
  document.getElementById('modal-prod-title').textContent = prod.name;
  document.getElementById('modal-prod-sku').textContent = `SKU: ${prod.sku} | ${prod.category || 'General'}`;
  document.getElementById('modal-prod-desc').textContent = prod.description || '상세 설명이 등록되지 않았습니다.';
  document.getElementById('modal-prod-moq').textContent = `${prod.moq} 개`;
  document.getElementById('modal-prod-price').textContent = prod.contactForPrice ? '단가 문의 (Contact for Price)' : `$${Number(prod.price).toLocaleString()} USD`;
  document.getElementById('modal-prod-sample').textContent = prod.sampleAvailable ? '신청 가능' : '제공 불가';
  
  const imgEl = document.getElementById('modal-prod-image');
  if (prod.images && prod.images.length > 0) {
    imgEl.src = prod.images[0];
    imgEl.style.display = 'block';
  } else {
    imgEl.src = 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80';
    imgEl.style.display = 'block';
  }

  // Specifications
  const specsTbody = document.getElementById('modal-prod-specs').querySelector('tbody');
  specsTbody.innerHTML = '';
  if (prod.specifications && Object.keys(prod.specifications).length > 0) {
    Object.entries(prod.specifications).forEach(([k, v]) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${k}</td><td><strong>${v}</strong></td>`;
      specsTbody.appendChild(row);
    });
  } else {
    specsTbody.innerHTML = '<tr><td colspan="2">기본 기술 사양서 준비 중</td></tr>';
  }

  modal.classList.add('active');
}

function openCatalogModal() {
  const container = document.getElementById('catalog-list-container');
  container.innerHTML = '';

  products.forEach(p => {
    const card = document.createElement('div');
    card.style.background = 'var(--bg-surface-elevated)';
    card.style.borderRadius = 'var(--radius-sm)';
    card.style.overflow = 'hidden';
    card.style.border = '1px solid var(--border-subtle)';
    card.style.cursor = 'pointer';

    const img = (p.images && p.images[0]) ? p.images[0] : 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=400&q=80';
    card.innerHTML = `
      <img src="${img}" style="width:100%; height:120px; object-fit:cover;">
      <div style="padding: 12px;">
        <h4 style="font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</h4>
        <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 8px;">${p.sku}</div>
        <div style="font-size: 13px; font-weight:600; color: var(--brand-accent);">${p.contactForPrice ? '단가 문의' : `$${Number(p.price).toLocaleString()} USD`}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      document.getElementById('modal-catalog').classList.remove('active');
      openProductModal(p.id);
    });

    container.appendChild(card);
  });

  document.getElementById('modal-catalog').classList.add('active');
}

function openRFQModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;
  document.getElementById('rfq-product-id').value = prod.id;
  document.getElementById('rfq-product-name').value = `${prod.name} (${prod.sku})`;
  document.getElementById('modal-product').classList.remove('active');
  document.getElementById('modal-rfq').classList.add('active');
}

function openSampleModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;
  document.getElementById('sample-product-id').value = prod.id;
  document.getElementById('sample-product-name').value = `${prod.name} (${prod.sku})`;
  document.getElementById('modal-product').classList.remove('active');
  document.getElementById('modal-sample').classList.add('active');
}

function setupForms() {
  // Lead Form
  document.getElementById('form-lead').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      boothId: currentBooth.id,
      company: document.getElementById('lead-company').value,
      name: document.getElementById('lead-name').value,
      email: document.getElementById('lead-email').value,
      phone: document.getElementById('lead-phone').value,
      jobTitle: document.getElementById('lead-job').value,
      notes: document.getElementById('lead-notes').value
    };

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('디지털 명함이 성공적으로 전달되었습니다!');
        document.getElementById('modal-lead').classList.remove('active');
        document.getElementById('form-lead').reset();
      }
    } catch (err) {
      showToast('전송 실패: 네트워크 상태를 확인하세요.');
    }
  });

  // RFQ Form
  document.getElementById('form-rfq').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      boothId: currentBooth.id,
      productId: document.getElementById('rfq-product-id').value,
      buyerName: document.getElementById('rfq-name').value,
      company: document.getElementById('rfq-company').value,
      email: document.getElementById('rfq-email').value,
      quantity: Number(document.getElementById('rfq-quantity').value),
      targetPrice: Number(document.getElementById('rfq-target-price').value) || undefined,
      notes: document.getElementById('rfq-notes').value
    };

    try {
      const res = await fetch('/api/rfqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('견적 요청(RFQ)이 정상적으로 접수되었습니다.');
        document.getElementById('modal-rfq').classList.remove('active');
        document.getElementById('form-rfq').reset();
      }
    } catch (err) {
      showToast('RFQ 전송 실패');
    }
  });

  // Sample Form
  document.getElementById('form-sample').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      boothId: currentBooth.id,
      productId: document.getElementById('sample-product-id').value,
      buyerName: document.getElementById('sample-name').value,
      company: document.getElementById('sample-company').value,
      email: document.getElementById('sample-email').value,
      quantity: Number(document.getElementById('sample-qty').value),
      shippingAddress: document.getElementById('sample-address').value
    };

    try {
      const res = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('샘플 신청서가 등록되었습니다.');
        document.getElementById('modal-sample').classList.remove('active');
        document.getElementById('form-sample').reset();
      }
    } catch (err) {
      showToast('샘플 신청 실패');
    }
  });

  // Appointment Form
  document.getElementById('form-appointment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      boothId: currentBooth.id,
      buyerName: document.getElementById('apt-name').value,
      company: document.getElementById('apt-company').value,
      email: document.getElementById('apt-email').value,
      requestedTime: document.getElementById('apt-time').value,
      notes: document.getElementById('apt-notes').value
    };

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('상담 일정이 성공적으로 예약되었습니다.');
        document.getElementById('modal-appointment').classList.remove('active');
        document.getElementById('form-appointment').reset();
      }
    } catch (err) {
      showToast('상담 예약 실패');
    }
  });
}

// 6. WebSocket Signaling
function setupWebSocket(boothId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_room', roomId: `booth-room-${boothId}` }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'room_joined') {
        const text = document.getElementById('showhost-status-text');
        if (text) {
          text.textContent = data.peerCount > 0 
            ? `부스 담당 쇼호스트 온라인 (${data.peerCount}명 참가 중)` 
            : `쇼호스트 상담 채널 준비 완료 (연결 대기 중)`;
        }
      }
    } catch (e) {
      console.error('WS parse error:', e);
    }
  };
}

// Toast Helper
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// 7. Animation Loop
function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
    updateHotspotsScreenPosition();
  }
}

// Run on page load
window.addEventListener('DOMContentLoaded', initViewer);
