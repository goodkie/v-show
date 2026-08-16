/* ============================================================
   Virtual Trade Show Commercial V1 — Exhibitor Admin Console
============================================================ */

let currentBoothId = 'booth-demo-01';
let currentBooth = null;
let products = [];
let hotspots = [];

// Initialize Admin
document.addEventListener('DOMContentLoaded', () => {
  setupAuth();
  setupTabs();
  setupModals();
  setupBoothHandlers();
  setupProductCRUD();
  setupHotspotCRUD();
  setupPhotoUpload();
});

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
        showToast('관리자 로그인에 성공하였습니다.');
        loadAllDashboardData();
      } else {
        showToast(data.error || '로그인에 실패했습니다.');
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
    const res = await fetch(`/api/booths/${currentBoothId}`);
    if (!res.ok) throw new Error('Booth not found');
    currentBooth = await res.json();

    document.getElementById('current-booth-name-display').textContent = currentBooth.name;
    document.getElementById('current-booth-status-desc').textContent = 
      `상태: ${currentBooth.status.toUpperCase()} | 생성일: ${new Date(currentBooth.createdAt).toLocaleDateString()}`;
    
    // Status text & buttons
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

    // Public Viewer link
    document.getElementById('btn-preview-public').href = `index.html?boothId=${currentBooth.id}`;

    // Edit form inputs
    document.getElementById('edit-booth-name').value = currentBooth.name || '';
    document.getElementById('edit-booth-desc').value = currentBooth.description || '';

    // Render photo gallery
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
  // Save booth basic info
  document.getElementById('btn-save-booth-info').addEventListener('click', async () => {
    const name = document.getElementById('edit-booth-name').value;
    const desc = document.getElementById('edit-booth-desc').value;

    try {
      const res = await fetch(`/api/booths/${currentBoothId}`, {
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

  // Toggle publish
  document.getElementById('btn-toggle-publish').addEventListener('click', async () => {
    const nextStatus = (currentBooth.status === 'published') ? 'draft' : 'published';
    try {
      const res = await fetch(`/api/booths/${currentBoothId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        showToast(`부스 상태가 ${nextStatus} 로 변경되었습니다.`);
        loadBooth();
      }
    } catch (e) {
      showToast('상태 변경 실패');
    }
  });

  // Request Precision Reconstruction
  document.getElementById('btn-req-recon').addEventListener('click', async () => {
    try {
      const res = await fetch(`/api/booths/${currentBoothId}/reconstruction`, { method: 'POST' });
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
    const res = await fetch(`/api/booths/${currentBoothId}/photos`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`업로드 완료! Photo Preview가 생성되었습니다.`);
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
    const res = await fetch(`/api/booths/${currentBoothId}/products`);
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

    // Also update hotspot product select dropdown
    const select = document.getElementById('hs-product-select');
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
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('신규 제품이 성공적으로 등록되었습니다.');
        document.getElementById('modal-add-product').classList.remove('active');
        loadProducts();
      }
    } catch (e) {
      showToast('제품 등록 실패');
    }
  });
}

window.deleteProduct = async function(productId) {
  if (!confirm('이 제품을 삭제하시겠습니까? 연결된 핫스팟도 함께 제거됩니다.')) return;
  try {
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('제품이 삭제되었습니다.');
      loadProducts();
      loadHotspots();
    }
  } catch (e) {
    showToast('삭제 실패');
  }
};

// 7. Hotspots CRUD
async function loadHotspots() {
  try {
    const res = await fetch(`/api/booths/${currentBoothId}/hotspots`);
    hotspots = await res.json();

    const tbody = document.getElementById('hotspots-table-body');
    tbody.innerHTML = '';

    hotspots.forEach(h => {
      const linkedProd = products.find(p => p.id === h.productId);
      const prodName = linkedProd ? linkedProd.name : h.productId;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${h.label || 'Hotspot'}</strong></td>
        <td>${prodName}</td>
        <td><code>[${h.position.x}, ${h.position.y}, ${h.position.z}]</code></td>
        <td><span class="badge badge-preview">${h.type}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="deleteHotspot('${h.id}')">삭제</button>
        </td>
      `;
      tbody.appendChild(row);
    });

  } catch (e) {
    console.error(e);
  }
}

function setupHotspotCRUD() {
  document.getElementById('btn-open-add-hotspot').addEventListener('click', () => {
    document.getElementById('modal-add-hotspot').classList.add('active');
  });

  document.getElementById('form-hotspot-crud').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      boothId: currentBoothId,
      productId: document.getElementById('hs-product-select').value,
      label: document.getElementById('hs-label').value,
      position: {
        x: Number(document.getElementById('hs-pos-x').value) || 0,
        y: Number(document.getElementById('hs-pos-y').value) || 0,
        z: Number(document.getElementById('hs-pos-z').value) || 0
      }
    };

    try {
      const res = await fetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('3D 핫스팟이 성공적으로 등록되었습니다.');
        document.getElementById('modal-add-hotspot').classList.remove('active');
        loadHotspots();
      }
    } catch (e) {
      showToast('핫스팟 등록 실패');
    }
  });
}

window.deleteHotspot = async function(hotspotId) {
  if (!confirm('이 핫스팟을 삭제하시겠습니까?')) return;
  try {
    const res = await fetch(`/api/hotspots/${hotspotId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('핫스팟이 삭제되었습니다.');
      loadHotspots();
    }
  } catch (e) {
    showToast('삭제 실패');
  }
};

// 8. Analytics & Leads
async function loadAnalytics() {
  try {
    const res = await fetch(`/api/booths/${currentBoothId}/analytics`);
    const data = await res.json();

    document.getElementById('stat-views').textContent = data.boothViews || 0;
    document.getElementById('stat-clicks').textContent = data.productClicks || 0;
    document.getElementById('stat-leads').textContent = data.leadsCount || 0;
    document.getElementById('stat-rfqs').textContent = data.rfqsCount || 0;

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
