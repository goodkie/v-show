/* ============================================================
   Virtual Trade Show Commercial V1 — Exhibitor Admin Console
   Phase 2 Hardened with Visual 3D Hotspot Editor
============================================================ */

let currentBoothId = 'booth-demo-01';
let currentBooth = null;
let products = [];
let hotspots = [];
let selectedHotspotId = null;
let isPlacementMode = false;
let isRepositionMode = false;

// 3D Editor Scene Variables
let editorEngine = null;
let editorRaycastSurfaces = [];
let editorHotspotObjects = [];

// Initialize Admin
document.addEventListener('DOMContentLoaded', () => {
  setupAuth();
  setupTabs();
  setupModals();
  setupBoothHandlers();
  setupProductCRUD();
  setupPhotoUpload();
  setupVisualHotspotEditor();
});

// Helper for authenticated API calls
async function authFetch(url, options = {}) {
  const token = localStorage.getItem('vts_admin_token');
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('vts_admin_token');
    document.getElementById('login-modal').classList.add('active');
    throw new Error('Authentication expired. Please login again.');
  }
  return res;
}

// 1. Auth & Session
function setupAuth() {
  const token = localStorage.getItem('vts_admin_token');
  const loginModal = document.getElementById('login-modal');

  if (token) {
    loginModal.classList.remove('active');
    loadAllDashboardData();
  }

  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('vts_admin_token', data.token);
        loginModal.classList.remove('active');
        showToast('관리자 로그인 성공');
        loadAllDashboardData();
      } else {
        showToast(data.error || '로그인 실패: 자격 증명을 확인하세요.');
      }
    } catch (err) {
      showToast('서버 연결 실패');
    }
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('vts_admin_token');
    window.location.reload();
  });
}

// 2. Tab Navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.admin-nav-item');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = `tab-${tab.dataset.tab}`;
      document.querySelectorAll('.tab-pane').forEach(p => {
        p.style.display = (p.id === targetId) ? 'block' : 'none';
      });

      if (tab.dataset.tab === 'hotspot-editor') {
        initEditor3D();
      }
    });
  });
}

// 3. Load All Data
async function loadAllDashboardData() {
  await loadBooth();
  await loadProducts();
  await loadHotspots();
  await loadAnalytics();
}

async function loadBooth() {
  try {
    const res = await authFetch(`/api/booths/${currentBoothId}`);
    if (!res.ok) throw new Error('Booth not found');
    currentBooth = await res.json();

    document.getElementById('current-booth-name-display').textContent = currentBooth.name;
    document.getElementById('current-booth-status-desc').textContent = 
      `상태: ${currentBooth.status.toUpperCase()} | 생성일: ${new Date(currentBooth.createdAt).toLocaleDateString()}`;
    
    document.getElementById('recon-status-text').textContent = 
      currentBooth.reconstructionStatus === 'reconstructed' ? '3D Precision Reconstructed' : 'Photo Preview Mode';

    const btnPublish = document.getElementById('btn-toggle-publish');
    if (currentBooth.status === 'published') {
      btnPublish.textContent = '발행 취소 (Draft로 변경)';
      btnPublish.className = 'btn btn-secondary btn-sm';
    } else {
      btnPublish.textContent = '부스 발행하기 (Publish)';
      btnPublish.className = 'btn btn-primary btn-sm';
    }

    document.getElementById('btn-preview-public').href = `index.html?boothId=${currentBooth.id}`;
    document.getElementById('edit-booth-name').value = currentBooth.name || '';
    document.getElementById('edit-booth-desc').value = currentBooth.description || '';

    renderPhotoGallery(currentBooth.photos || []);

  } catch (err) {
    console.error(err);
  }
}

function renderPhotoGallery(photos) {
  const gallery = document.getElementById('booth-photo-gallery');
  gallery.innerHTML = '';
  photos.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.className = 'gallery-thumb';
    img.alt = 'Booth Capture';
    gallery.appendChild(img);
  });
}

// 4. Booth Handlers
function setupBoothHandlers() {
  document.getElementById('btn-save-booth-info').addEventListener('click', async () => {
    const name = document.getElementById('edit-booth-name').value;
    const desc = document.getElementById('edit-booth-desc').value;

    try {
      const res = await authFetch(`/api/booths/${currentBoothId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc })
      });
      if (res.ok) {
        showToast('부스 정보가 저장되었습니다.');
        loadBooth();
      }
    } catch (e) {
      showToast('저장 실패');
    }
  });

  document.getElementById('btn-toggle-publish').addEventListener('click', async () => {
    const nextStatus = (currentBooth.status === 'published') ? 'draft' : 'published';
    try {
      const res = await authFetch(`/api/booths/${currentBoothId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        showToast(`부스 상태가 ${nextStatus.toUpperCase()} 로 변경되었습니다.`);
        loadBooth();
      }
    } catch (e) {
      showToast('상태 변경 실패');
    }
  });

  document.getElementById('btn-req-recon').addEventListener('click', async () => {
    try {
      const res = await authFetch(`/api/booths/${currentBoothId}/reconstruction`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('정밀 3D 재구성 작업이 대기열에 등록되었습니다.');
        loadBooth();
      } else {
        showToast(data.error || '재구성 요청 실패');
      }
    } catch (e) {
      showToast('요청 전송 실패');
    }
  });
}

// 5. Photo Upload Handler
function setupPhotoUpload() {
  const dropzone = document.getElementById('photo-dropzone');
  const fileInput = document.getElementById('photo-file-input');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--brand-accent)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-subtle)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-subtle)';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadPhotos(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      uploadPhotos(fileInput.files);
    }
  });
}

async function uploadPhotos(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('photos', files[i]);
  }

  showToast(`${files.length}장의 사진 업로드 중...`);

  try {
    const res = await authFetch(`/api/booths/${currentBoothId}/photos`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`업로드 완료! Photo Preview가 갱신되었습니다.`);
      loadBooth();
    } else {
      showToast(data.error || '사진 업로드 실패');
    }
  } catch (e) {
    showToast('업로드 네트워크 오류');
  }
}

// 6. Products CRUD
async function loadProducts() {
  try {
    const res = await authFetch(`/api/booths/${currentBoothId}/products`);
    products = await res.json();

    const tbody = document.getElementById('products-table-body');
    tbody.innerHTML = '';

    products.forEach(p => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${p.name}</strong></td>
        <td><code>${p.sku}</code></td>
        <td>${p.category || '-'}</td>
        <td>${p.moq} 개</td>
        <td>${p.contactForPrice ? '단가 문의' : `$${Number(p.price).toLocaleString()} USD`}</td>
        <td>${p.sampleAvailable ? '✅ 가능' : '❌ 불가'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="deleteProduct('${p.id}')">삭제</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Update product select in 3D Editor toolbar
    const select = document.getElementById('editor-product-select');
    select.innerHTML = '';
    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.sku})`;
      select.appendChild(opt);
    });

  } catch (e) {
    console.error(e);
  }
}

function setupProductCRUD() {
  document.getElementById('btn-open-add-product').addEventListener('click', () => {
    document.getElementById('form-product-crud').reset();
    document.getElementById('crud-product-id').value = '';
    document.getElementById('modal-add-product').classList.add('active');
  });

  document.getElementById('form-product-crud').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      boothId: currentBoothId,
      name: document.getElementById('crud-name').value,
      sku: document.getElementById('crud-sku').value,
      category: document.getElementById('crud-category').value,
      moq: Number(document.getElementById('crud-moq').value) || 1,
      price: Number(document.getElementById('crud-price').value) || 0,
      contactForPrice: document.getElementById('crud-contact-price').checked,
      description: document.getElementById('crud-desc').value,
      images: [document.getElementById('crud-image').value].filter(Boolean),
      sampleAvailable: document.getElementById('crud-sample-avail').checked
    };

    try {
      const res = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('신규 제품이 등록되었습니다.');
        document.getElementById('modal-add-product').classList.remove('active');
        loadProducts();
      }
    } catch (e) {
      showToast('제품 등록 실패');
    }
  });
}

window.deleteProduct = async function(productId) {
  if (!confirm('이 제품을 삭제하시겠습니까? 연결된 3D 핫스팟도 함께 제거됩니다.')) return;
  try {
    const res = await authFetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('제품이 삭제되었습니다.');
      loadProducts();
      loadHotspots();
    }
  } catch (e) {
    showToast('삭제 실패');
  }
};

// 7. Visual 3D Hotspot Editor (Part C)
function setupVisualHotspotEditor() {
  const btnStartPlacement = document.getElementById('btn-start-placement');
  const btnReposition = document.getElementById('btn-reposition-hotspot');
  const btnDelete = document.getElementById('btn-delete-selected-hotspot');
  const btnResetCam = document.getElementById('btn-editor-reset-cam');

  btnStartPlacement.addEventListener('click', () => {
    if (products.length === 0) {
      showToast('먼저 제품을 1개 이상 등록해 주세요.');
      return;
    }
    isPlacementMode = true;
    isRepositionMode = false;
    document.getElementById('editor-viewport-container').classList.add('placement-mode');
    document.getElementById('editor-status-text').textContent = '🎯 3D 부스 표면을 클릭하여 선택한 제품의 핫스팟을 배치하세요.';
    btnStartPlacement.classList.replace('btn-primary', 'btn-accent');
  });

  btnReposition.addEventListener('click', () => {
    if (!selectedHotspotId) return;
    isRepositionMode = true;
    isPlacementMode = false;
    document.getElementById('editor-viewport-container').classList.add('placement-mode');
    document.getElementById('editor-status-text').textContent = '🔄 새 위치로 지정할 부스 표면을 클릭하세요.';
  });

  btnDelete.addEventListener('click', async () => {
    if (!selectedHotspotId) return;
    if (!confirm('선택한 핫스팟을 삭제하시겠습니까?')) return;
    try {
      const res = await authFetch(`/api/hotspots/${selectedHotspotId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('핫스팟이 삭제되었습니다.');
        selectedHotspotId = null;
        updateSelectedUI();
        loadHotspots();
      }
    } catch (e) {
      showToast('삭제 실패');
    }
  });

  btnResetCam.addEventListener('click', () => {
    if (editorEngine && editorEngine.camera && editorEngine.controls) {
      editorEngine.camera.position.set(0, 2.2, 7.5);
      editorEngine.controls.target.set(0, 1.2, -1);
      editorEngine.controls.update();
    }
  });
}

function initEditor3D() {
  const container = document.getElementById('editor-3d-canvas');
  if (editorEngine) return; // Already initialized

  editorEngine = BoothEngine.initScene(container);
  editorRaycastSurfaces = BoothEngine.buildBooth(editorEngine.scene, currentBooth);

  // Click handler for 3D Viewport Raycasting
  const viewportCard = document.getElementById('editor-viewport-container');
  viewportCard.addEventListener('click', handleEditor3DClick);

  // Animation Loop
  function animateEditor() {
    requestAnimationFrame(animateEditor);
    if (editorEngine) {
      editorEngine.controls.update();
      editorEngine.renderer.render(editorEngine.scene, editorEngine.camera);
      updateEditorHotspotsScreenPosition();
    }
  }
  animateEditor();

  renderEditorHotspots();
}

async function handleEditor3DClick(event) {
  if (!isPlacementMode && !isRepositionMode) return;

  const hit = BoothEngine.raycastBooth(
    event,
    editorEngine.camera,
    editorRaycastSurfaces,
    document.getElementById('editor-viewport-container')
  );

  if (!hit) {
    return; // Clicked background or overlay
  }

  const { point } = hit;

  if (isPlacementMode) {
    const selectedProdId = document.getElementById('editor-product-select').value;
    const selectedProd = products.find(p => p.id === selectedProdId);

    const payload = {
      boothId: currentBoothId,
      productId: selectedProdId,
      label: selectedProd ? selectedProd.name : 'Product Pin',
      position: {
        x: point.x,
        y: point.y + 0.15, // slight offset from surface
        z: point.z
      }
    };

    try {
      const res = await authFetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const newHs = await res.json();
      if (res.ok) {
        showToast('3D 핫스팟이 성공적으로 배치되었습니다.');
        isPlacementMode = false;
        document.getElementById('editor-viewport-container').classList.remove('placement-mode');
        document.getElementById('btn-start-placement').classList.replace('btn-accent', 'btn-primary');
        document.getElementById('editor-status-text').textContent = '✅ 핫스팟이 생성되었습니다.';
        selectedHotspotId = newHs.id;
        loadHotspots();
      } else {
        showToast(newHs.error || '핫스팟 배치 실패');
      }
    } catch (e) {
      showToast('배치 통신 오류');
    }
  } else if (isRepositionMode) {
    const payload = {
      position: {
        x: point.x,
        y: point.y + 0.15,
        z: point.z
      }
    };

    try {
      const res = await authFetch(`/api/hotspots/${selectedHotspotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('핫스팟 위치가 새로 갱신되었습니다.');
        isRepositionMode = false;
        document.getElementById('editor-viewport-container').classList.remove('placement-mode');
        document.getElementById('editor-status-text').textContent = '✅ 위치 갱신 완료.';
        loadHotspots();
      }
    } catch (e) {
      showToast('재배치 통신 오류');
    }
  }
}

async function loadHotspots() {
  try {
    const res = await authFetch(`/api/booths/${currentBoothId}/hotspots`);
    hotspots = await res.json();

    // Table render
    const tbody = document.getElementById('editor-hotspots-table-body');
    tbody.innerHTML = '';

    hotspots.forEach(h => {
      const prod = products.find(p => p.id === h.productId);
      const prodSku = prod ? prod.sku : h.productId;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${h.label || 'Hotspot'}</strong></td>
        <td><code>${prodSku}</code></td>
        <td><code>[${h.position.x.toFixed(2)}, ${h.position.y.toFixed(2)}, ${h.position.z.toFixed(2)}]</code></td>
        <td>${new Date(h.updatedAt || h.createdAt).toLocaleString()}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="selectHotspot('${h.id}')">선택</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    renderEditorHotspots();
    updateSelectedUI();

  } catch (e) {
    console.error(e);
  }
}

function renderEditorHotspots() {
  if (!editorEngine) return;

  const overlay = document.getElementById('editor-hotspots-overlay');
  overlay.innerHTML = '';

  // Remove old anchor objects
  editorHotspotObjects.forEach(item => {
    editorEngine.scene.remove(item.anchor);
  });

  editorHotspotObjects = hotspots.map(hs => {
    const anchor = new THREE.Object3D();
    anchor.position.set(hs.position.x, hs.position.y, hs.position.z);
    editorEngine.scene.add(anchor);

    const pin = document.createElement('div');
    pin.className = `hotspot-marker admin-marker ${selectedHotspotId === hs.id ? 'selected' : ''}`;
    pin.innerHTML = `<span>📍</span>`;
    pin.title = hs.label;

    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      selectHotspot(hs.id);
    });

    overlay.appendChild(pin);

    return {
      data: hs,
      anchor,
      element: pin
    };
  });
}

function updateEditorHotspotsScreenPosition() {
  if (!editorEngine || !editorEngine.camera) return;

  const container = document.getElementById('editor-viewport-container');
  const widthHalf = container.clientWidth / 2;
  const heightHalf = container.clientHeight / 2;
  const tempV = new THREE.Vector3();

  editorHotspotObjects.forEach(item => {
    item.anchor.getWorldPosition(tempV);
    const behindCamera = tempV.clone().project(editorEngine.camera).z > 1;
    if (behindCamera) {
      item.element.style.display = 'none';
      return;
    }

    tempV.project(editorEngine.camera);
    const x = (tempV.x * widthHalf) + widthHalf;
    const y = -(tempV.y * heightHalf) + heightHalf;

    item.element.style.display = 'flex';
    item.element.style.left = `${x}px`;
    item.element.style.top = `${y}px`;
  });
}

window.selectHotspot = function(id) {
  selectedHotspotId = id;
  updateSelectedUI();
  renderEditorHotspots();
};

function updateSelectedUI() {
  const btnReposition = document.getElementById('btn-reposition-hotspot');
  const btnDelete = document.getElementById('btn-delete-selected-hotspot');
  const selectedInfo = document.getElementById('editor-selected-info');

  if (selectedHotspotId) {
    const hs = hotspots.find(h => h.id === selectedHotspotId);
    btnReposition.disabled = false;
    btnDelete.disabled = false;
    selectedInfo.textContent = hs ? `[선택됨: ${hs.label || hs.id}]` : '';
  } else {
    btnReposition.disabled = true;
    btnDelete.disabled = true;
    selectedInfo.textContent = '';
  }
}

// 8. Analytics & Leads (Real Events Calculation)
async function loadAnalytics() {
  try {
    const res = await authFetch(`/api/booths/${currentBoothId}/analytics`);
    const data = await res.json();

    document.getElementById('stat-views').textContent = data.boothViews || 0;
    document.getElementById('stat-clicks').textContent = data.productViews || 0;
    document.getElementById('stat-hs-clicks').textContent = data.hotspotClicks || 0;
    document.getElementById('stat-leads').textContent = data.leadsCount || 0;
    document.getElementById('stat-rfqs').textContent = data.rfqsCount || 0;
    document.getElementById('stat-samples').textContent = data.samplesCount || 0;
    document.getElementById('stat-apts').textContent = data.appointmentsCount || 0;

    // Render Leads Table
    const leadsTbody = document.getElementById('leads-table-body');
    leadsTbody.innerHTML = '';
    (data.leads || []).forEach(lead => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${lead.company}</strong></td>
        <td>${lead.name}</td>
        <td>${lead.email}</td>
        <td>${lead.phone || '-'}</td>
        <td>${lead.jobTitle || '-'}</td>
        <td>${new Date(lead.createdAt).toLocaleString()}</td>
      `;
      leadsTbody.appendChild(tr);
    });

    // Render RFQs Table
    const rfqsTbody = document.getElementById('rfqs-table-body');
    rfqsTbody.innerHTML = '';
    (data.rfqs || []).forEach(rfq => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${rfq.productId}</code></td>
        <td>${rfq.buyerName} (${rfq.company})</td>
        <td>${rfq.quantity} 개</td>
        <td>${rfq.targetPrice ? `$${rfq.targetPrice}` : '협의'}</td>
        <td><span class="badge badge-reconstructed">${rfq.status}</span></td>
        <td>${new Date(rfq.createdAt).toLocaleString()}</td>
      `;
      rfqsTbody.appendChild(tr);
    });

  } catch (e) {
    console.error(e);
  }
}

function setupModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => {
        if (m.id !== 'login-modal') m.classList.remove('active');
      });
    });
  });
}

function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
