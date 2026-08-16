/* ============================================================
   Virtual Trade Show Commercial V1 — Exhibitor Admin Console
   Visual 3D Editor, Precision Reconstruction & Analytics (Phase 4)
============================================================ */

let currentBooth = null;
let products = [];
let hotspots = [];
let editorEngine = null;
let editorRaycastSurfaces = [];
let isPlacementMode = false;
let selectedHotspotId = null;
let authToken = localStorage.getItem('vts_admin_token') || null;
let reconPollTimer = null;

// DOM Elements
const loginModal = document.getElementById('login-modal');
const formLogin = document.getElementById('form-login');
const btnLogout = document.getElementById('btn-logout');
const tabButtons = document.querySelectorAll('.admin-nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

// Authenticated Fetch Helper
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    authToken = null;
    localStorage.removeItem('vts_admin_token');
    loginModal.classList.add('active');
    showToast('세션이 만료되었습니다. 다시 로그인해 주세요.');
    throw new Error('Unauthorized');
  }
  return res;
}

// 1. Authentication Handlers
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-user').value;
  const password = document.getElementById('login-pass').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      authToken = data.token;
      localStorage.setItem('vts_admin_token', authToken);
      loginModal.classList.remove('active');
      showToast('로그인 성공');
      initAdmin();
    } else {
      showToast(data.error || '로그인 실패');
    }
  } catch (err) {
    showToast('로그인 요청 실패');
  }
});

btnLogout.addEventListener('click', () => {
  authToken = null;
  localStorage.removeItem('vts_admin_token');
  loginModal.classList.add('active');
  showToast('로그아웃 되었습니다.');
});

// 2. Tab Navigation
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.style.display = 'none');

    btn.classList.add('active');
    const tabName = btn.dataset.tab;
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) targetPane.style.display = 'block';

    if (tabName === 'hotspot-editor') {
      setTimeout(() => init3DEditor(), 100);
    } else if (tabName === 'reconstruction') {
      loadReconstructionData();
    }
  });
});

document.getElementById('btn-quick-goto-recon').addEventListener('click', () => {
  const reconTabBtn = document.querySelector('.admin-nav-item[data-tab="reconstruction"]');
  if (reconTabBtn) reconTabBtn.click();
});

// 3. Initialize Admin Console
async function initAdmin() {
  if (!authToken) {
    loginModal.classList.add('active');
    return;
  }
  try {
    await loadInitialData();
    setupAdminEvents();
  } catch (e) {
    console.warn('Admin init failed:', e);
  }
}

async function loadInitialData() {
  try {
    const boothsRes = await authFetch('/api/booths?all=true');
    const booths = await boothsRes.json();
    if (booths.length > 0) {
      currentBooth = booths[0];
      renderBoothOverview();
      renderBoothSettings();
      await loadProducts();
      await loadHotspots();
      await loadAnalytics();
      await loadReconstructionData();
    }
  } catch (err) {
    console.error('Error loading initial admin data:', err);
  }
}

// 4. Booth Overview & Settings
function renderBoothOverview() {
  if (!currentBooth) return;
  document.getElementById('current-booth-name-display').textContent = currentBooth.name;
  document.getElementById('current-booth-status-desc').textContent = 
    `상태: ${currentBooth.status === 'published' ? '공개 발행됨 (Published)' : '비공개 준비 중 (Draft)'} | 부스 ID: ${currentBooth.id}`;
  
  const publishBtn = document.getElementById('btn-toggle-publish');
  if (currentBooth.status === 'published') {
    publishBtn.textContent = '부스 비공개로 전환';
    publishBtn.className = 'btn btn-secondary btn-sm';
  } else {
    publishBtn.textContent = '부스 공개 발행하기';
    publishBtn.className = 'btn btn-primary btn-sm';
  }

  const reconText = document.getElementById('recon-status-text');
  reconText.textContent = getReconstructionLabel(currentBooth.reconstructionStatus);

  document.getElementById('btn-preview-public').href = `index.html?booth=${currentBooth.id}`;
}

function getReconstructionLabel(status) {
  switch (status) {
    case 'photo_preview': return 'Photo Preview (기본 텍스처)';
    case 'reconstruction_pending': return '⏳ 3D 재구성 큐 대기 중 (Pending)';
    case 'processing': return '⚙️ GPU 정밀 3D 재구성 연산 중 (Processing)';
    case 'reconstructed': return '✨ 3D Gaussian Splatting 재구성 완료 (검증 대기)';
    case 'verified': return '🏆 검증 및 퍼블릭 승인 완료 (Verified 3D)';
    case 'failed': return '❌ 3D 재구성 실패 (Failed)';
    default: return status;
  }
}

function renderBoothSettings() {
  if (!currentBooth) return;
  document.getElementById('edit-booth-name').value = currentBooth.name;
  document.getElementById('edit-booth-desc').value = currentBooth.description || '';

  const gallery = document.getElementById('booth-photo-gallery');
  gallery.innerHTML = '';
  (currentBooth.photos || []).forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.className = 'gallery-thumb';
    gallery.appendChild(img);
  });
}

// 5. Precision Reconstruction Dashboard (Phase 4)
async function loadReconstructionData() {
  if (!currentBooth) return;
  try {
    const res = await authFetch(`/api/booths/${currentBooth.id}/reconstruction`);
    const data = await res.json();
    renderReconstructionDashboard(data);

    // If job is processing or pending, poll every 3 seconds
    if (data.activeJob && (data.activeJob.status === 'pending' || data.activeJob.status === 'processing')) {
      if (!reconPollTimer) {
        reconPollTimer = setTimeout(() => {
          reconPollTimer = null;
          loadReconstructionData();
        }, 3000);
      }
    }
  } catch (err) {
    console.error('Error loading reconstruction data:', err);
  }
}

function renderReconstructionDashboard(data) {
  const validation = data.validation || { quality: 'poor', validCount: 0, canReconstruct: false };
  const job = data.activeJob;

  // Validation Stats
  document.getElementById('val-photo-count').textContent = `${validation.validCount} 장`;
  
  const qualityBadge = document.getElementById('badge-capture-quality');
  const qualityGrade = document.getElementById('val-quality-grade');
  const canReconText = document.getElementById('val-can-reconstruct');

  qualityBadge.className = 'badge';
  if (validation.quality === 'good') {
    qualityBadge.classList.add('badge-reconstructed');
    qualityBadge.textContent = '품질 우수 (Good)';
    qualityGrade.textContent = 'Good (A)';
    canReconText.textContent = '실행 가능 (권장)';
    canReconText.style.color = '#10b981';
  } else if (validation.quality === 'acceptable') {
    qualityBadge.classList.add('badge-preview');
    qualityBadge.textContent = '적합 (Acceptable)';
    qualityGrade.textContent = 'Acceptable (B)';
    canReconText.textContent = '실행 가능 (프리뷰)';
    canReconText.style.color = '#eab308';
  } else {
    qualityBadge.classList.add('badge-failed');
    qualityBadge.textContent = '사진 부족 (Poor)';
    qualityGrade.textContent = 'Poor (사진 부족)';
    canReconText.textContent = '실행 불가 (3장 이상 필요)';
    canReconText.style.color = '#ef4444';
  }

  // Active Job & Stage
  const statusBadge = document.getElementById('recon-current-status-badge');
  const jobIdText = document.getElementById('recon-job-id-text');
  const progressPercent = document.getElementById('recon-progress-percent');
  const progressBar = document.getElementById('recon-progress-bar');
  const stageText = document.getElementById('recon-stage-text');
  const workerText = document.getElementById('recon-worker-id-text');

  const btnTrigger = document.getElementById('btn-trigger-reconstruction');
  const btnCancel = document.getElementById('btn-cancel-reconstruction');
  const btnVerify = document.getElementById('btn-verify-reconstruction');

  const currentStatus = data.reconstructionStatus || (job ? job.status : 'photo_preview');

  statusBadge.className = 'badge';
  statusBadge.textContent = currentStatus.toUpperCase();

  if (currentStatus === 'reconstruction_pending' || currentStatus === 'pending') {
    statusBadge.classList.add('badge-pending');
  } else if (currentStatus === 'processing') {
    statusBadge.classList.add('badge-processing');
  } else if (currentStatus === 'reconstructed') {
    statusBadge.classList.add('badge-reconstructed');
  } else if (currentStatus === 'verified') {
    statusBadge.classList.add('badge-verified');
  } else if (currentStatus === 'failed') {
    statusBadge.classList.add('badge-failed');
  } else {
    statusBadge.classList.add('badge-preview');
  }

  if (job) {
    jobIdText.textContent = `Job: ${job.id}`;
    progressPercent.textContent = `${job.progress || 0}%`;
    progressBar.style.width = `${job.progress || 0}%`;
    stageText.textContent = formatStageName(job.currentStage);
    workerText.textContent = `Worker: ${job.workerId || '할당 대기 중'}`;

    document.getElementById('diag-reg-cameras').textContent = `${job.diagnostics?.registeredImages || 0} / ${job.diagnostics?.totalImages || validation.validCount}`;
    document.getElementById('diag-sparse-pts').textContent = `${(job.diagnostics?.sparsePoints || 0).toLocaleString()} pts`;
    document.getElementById('diag-asset-format').textContent = job.output?.format ? `Gaussian Splat (${job.output.format.toUpperCase()})` : '생성 대기 중';

    // Action Buttons State
    if (job.status === 'pending' || job.status === 'processing') {
      btnTrigger.style.display = 'none';
      btnCancel.style.display = 'inline-flex';
      btnCancel.dataset.jobId = job.id;
      btnVerify.style.display = 'none';
    } else if (job.status === 'reconstructed') {
      btnTrigger.style.display = 'none';
      btnCancel.style.display = 'none';
      btnVerify.style.display = 'inline-flex';
      btnVerify.dataset.jobId = job.id;
    } else if (job.status === 'verified') {
      btnTrigger.style.display = 'inline-flex';
      btnTrigger.textContent = '🔄 정밀 3D 재구성 다시 실행';
      btnCancel.style.display = 'none';
      btnVerify.style.display = 'none';
    } else { // failed
      btnTrigger.style.display = 'inline-flex';
      btnTrigger.textContent = '🔄 3D 재구성 재시도';
      btnCancel.style.display = 'none';
      btnVerify.style.display = 'none';
    }
  } else {
    jobIdText.textContent = 'No Active Job';
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';
    stageText.textContent = 'Photo Preview 모드 (대기 중)';
    workerText.textContent = 'Worker: 대기 중';
    btnTrigger.style.display = 'inline-flex';
    btnCancel.style.display = 'none';
    btnVerify.style.display = 'none';
  }
}

function formatStageName(stage) {
  switch (stage) {
    case 'preparing': return '1/7 이미지 다운로드 및 검증 (Preparing)';
    case 'colmap_feature_extraction': return '2/7 SIFT 시각적 특징점 추출 (COLMAP)';
    case 'colmap_matching': return '3/7 전수 특징점 매칭 및 에피폴라 기하 분석';
    case 'colmap_mapping': return '4/7 3D 포인트 클라우드 번들 조정 (Mapper)';
    case 'nerfstudio_processing': return '5/7 좌표계 변환 및 데이터셋 패킹';
    case 'splat_training': return '6/7 3D Gaussian Splatting 학습 (Splatfacto)';
    case 'splat_export': return '7/7 웹 최적화 PLY 공간 에셋 익스포트';
    case 'uploading_result': return '완료 결과 업로드 및 메타데이터 등록';
    case 'completed': return '✨ 정밀 3D 재구성 완료';
    default: return stage || '준비 중';
  }
}

// 6. Products CRUD Handlers
async function loadProducts() {
  if (!currentBooth) return;
  const res = await authFetch(`/api/booths/${currentBooth.id}/products`);
  products = await res.json();

  const tbody = document.getElementById('products-table-body');
  tbody.innerHTML = '';
  products.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td><code>${p.sku}</code></td>
      <td>${p.category || '-'}</td>
      <td>${p.moq} 개</td>
      <td>${p.contactForPrice ? '단가 문의' : `$${Number(p.price).toLocaleString()} USD`}</td>
      <td>${p.sampleAvailable ? '✅ 가능' : '❌ 불가'}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="editProduct('${p.id}')">수정</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 7. Visual 3D Hotspot Editor
function init3DEditor() {
  const container = document.getElementById('editor-3d-canvas');
  if (!container || !currentBooth) return;

  if (!editorEngine) {
    editorEngine = BoothEngine.initScene(container);
    animateEditor();

    // Raycaster Surface Click Event for Hotspot Placement
    container.addEventListener('click', onEditorCanvasClick);
  }

  editorRaycastSurfaces = BoothEngine.buildBooth(editorEngine.scene, currentBooth);
  updateEditorProductSelect();
  renderEditorHotspots();
}

function updateEditorProductSelect() {
  const select = document.getElementById('editor-product-select');
  select.innerHTML = '';
  if (products.length === 0) {
    select.innerHTML = '<option value="">등록된 제품 없음</option>';
    return;
  }
  products.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.sku})`;
    select.appendChild(opt);
  });
}

async function loadHotspots() {
  if (!currentBooth) return;
  const res = await authFetch(`/api/booths/${currentBooth.id}/hotspots`);
  hotspots = await res.json();
  renderEditorHotspotsTable();
  if (editorEngine) renderEditorHotspots();
}

function renderEditorHotspotsTable() {
  const tbody = document.getElementById('editor-hotspots-table-body');
  tbody.innerHTML = '';
  hotspots.forEach(hs => {
    const prod = products.find(p => p.id === hs.productId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${hs.label || (prod ? prod.name : '핫스팟')}</strong></td>
      <td><code>${prod ? prod.sku : hs.productId}</code></td>
      <td><code>[${hs.position.x}, ${hs.position.y}, ${hs.position.z}]</code></td>
      <td>${new Date(hs.updatedAt || hs.createdAt).toLocaleString()}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="selectHotspotForEdit('${hs.id}')">선택</button>
        <button class="btn btn-danger btn-sm" onclick="deleteHotspotById('${hs.id}')">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

let editorHotspotObjects = [];

function renderEditorHotspots() {
  if (!editorEngine) return;
  const overlay = document.getElementById('editor-hotspots-overlay');
  overlay.innerHTML = '';

  editorHotspotObjects.forEach(item => editorEngine.scene.remove(item.anchor));

  editorHotspotObjects = hotspots.map(hs => {
    const anchor = new THREE.Object3D();
    anchor.position.set(hs.position.x, hs.position.y, hs.position.z);
    editorEngine.scene.add(anchor);

    const pin = document.createElement('div');
    pin.className = `hotspot-marker admin-marker ${selectedHotspotId === hs.id ? 'selected' : ''}`;
    pin.innerHTML = `<span>📍</span>`;
    pin.title = hs.label || '3D 핫스팟';

    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      selectHotspotForEdit(hs.id);
    });

    overlay.appendChild(pin);

    return { data: hs, anchor, element: pin };
  });
}

function updateEditorHotspotsScreenPosition() {
  if (!editorEngine || !editorEngine.camera) return;
  const container = document.getElementById('editor-viewport-container');
  if (!container) return;

  const tempV = new THREE.Vector3();
  const widthHalf = container.clientWidth / 2;
  const heightHalf = container.clientHeight / 2;

  editorHotspotObjects.forEach(item => {
    item.anchor.getWorldPosition(tempV);
    const behind = tempV.clone().project(editorEngine.camera).z > 1;
    if (behind) {
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

async function onEditorCanvasClick(e) {
  if (!isPlacementMode || !editorEngine) return;

  const point = BoothEngine.raycastBooth(e, document.getElementById('editor-viewport-container'), editorEngine.camera, editorRaycastSurfaces);
  if (!point) {
    showToast('부스 바닥 또는 벽면 표면을 클릭해 주세요.');
    return;
  }

  const selectedProdId = document.getElementById('editor-product-select').value;
  if (!selectedProdId) {
    showToast('연결할 제품을 선택해 주세요.');
    return;
  }

  try {
    if (selectedHotspotId) {
      // Reposition Mode
      const res = await authFetch(`/api/hotspots/${selectedHotspotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: point })
      });
      if (res.ok) {
        showToast('핫스팟 좌표가 성공적으로 수정되었습니다.');
      }
    } else {
      // Create New Hotspot Mode
      const res = await authFetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: currentBooth.id,
          productId: selectedProdId,
          position: point
        })
      });
      if (res.ok) {
        showToast('새 3D 핫스팟이 배치되었습니다.');
      }
    }

    isPlacementMode = false;
    selectedHotspotId = null;
    updateEditorModeUI();
    await loadHotspots();

  } catch (err) {
    showToast('핫스팟 저장 중 오류가 발생했습니다.');
  }
}

window.selectHotspotForEdit = function(id) {
  selectedHotspotId = id;
  const hs = hotspots.find(h => h.id === id);
  if (hs) {
    document.getElementById('editor-product-select').value = hs.productId;
    document.getElementById('btn-reposition-hotspot').disabled = false;
    document.getElementById('btn-delete-selected-hotspot').disabled = false;
    document.getElementById('editor-selected-info').textContent = `선택된 핫스팟: ${hs.label || hs.id}`;
    renderEditorHotspots();
  }
};

window.deleteHotspotById = async function(id) {
  if (!confirm('이 핫스팟을 삭제하시겠습니까?')) return;
  try {
    const res = await authFetch(`/api/hotspots/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('핫스팟이 삭제되었습니다.');
      if (selectedHotspotId === id) selectedHotspotId = null;
      await loadHotspots();
    }
  } catch (e) {
    showToast('핫스팟 삭제 실패');
  }
};

function updateEditorModeUI() {
  const banner = document.getElementById('editor-status-text');
  const btnStart = document.getElementById('btn-start-placement');
  const container = document.getElementById('editor-viewport-container');

  if (isPlacementMode) {
    banner.textContent = '📍 [배치 모드 활성화] 3D 화면의 원하는 부스 표면을 마우스로 클릭하여 핫스팟을 위치시키세요.';
    banner.style.color = '#38bdf8';
    btnStart.textContent = '배치 취소';
    btnStart.className = 'btn btn-danger btn-sm';
    container.classList.add('placement-mode');
  } else {
    banner.textContent = 'ℹ️ 상단에서 제품을 선택한 후 [+ 핫스팟 배치 모드] 버튼을 누르고 부스 표면을 클릭하세요.';
    banner.style.color = 'var(--text-main)';
    btnStart.textContent = '📍 + 핫스팟 배치 모드';
    btnStart.className = 'btn btn-primary btn-sm';
    container.classList.remove('placement-mode');
  }
}

function animateEditor() {
  requestAnimationFrame(animateEditor);
  if (editorEngine && editorEngine.controls) {
    editorEngine.controls.update();
    editorEngine.renderer.render(editorEngine.scene, editorEngine.camera);
    updateEditorHotspotsScreenPosition();
  }
}

// 8. Event Listeners Setup
function setupAdminEvents() {
  // Toggle Publish
  document.getElementById('btn-toggle-publish').addEventListener('click', async () => {
    if (!currentBooth) return;
    const newStatus = currentBooth.status === 'published' ? 'draft' : 'published';
    try {
      const res = await authFetch(`/api/booths/${currentBooth.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        currentBooth = await res.json();
        renderBoothOverview();
        showToast(newStatus === 'published' ? '부스가 공개 발행되었습니다.' : '부스가 비공개로 전환되었습니다.');
      }
    } catch (e) {
      showToast('상태 변경 실패');
    }
  });

  // Trigger Reconstruction
  document.getElementById('btn-trigger-reconstruction').addEventListener('click', async () => {
    if (!currentBooth) return;
    try {
      const res = await authFetch(`/api/booths/${currentBooth.id}/reconstruction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualityPreset: 'standard' })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('정밀 3D 재구성 작업이 큐에 성공적으로 등록되었습니다.');
        await loadReconstructionData();
      } else {
        showToast(data.error || '재구성 요청 실패');
      }
    } catch (e) {
      showToast('재구성 요청 실패');
    }
  });

  // Cancel Reconstruction
  document.getElementById('btn-cancel-reconstruction').addEventListener('click', async (e) => {
    const jobId = e.target.dataset.jobId;
    if (!jobId || !confirm('진행 중인 재구성 작업을 취소하시겠습니까?')) return;
    try {
      const res = await authFetch(`/api/reconstruction/jobs/${jobId}/cancel`, { method: 'POST' });
      if (res.ok) {
        showToast('재구성 작업이 취소되었습니다.');
        await loadReconstructionData();
      }
    } catch (err) {
      showToast('작업 취소 실패');
    }
  });

  // Verify Reconstruction (Human Approval)
  document.getElementById('btn-verify-reconstruction').addEventListener('click', async (e) => {
    const jobId = e.target.dataset.jobId;
    if (!jobId || !confirm('재구성된 3D 부스를 검증 및 퍼블릭으로 승인하시겠습니까?')) return;
    try {
      const res = await authFetch(`/api/reconstruction/jobs/${jobId}/verify`, { method: 'POST' });
      if (res.ok) {
        showToast('3D 부스가 검증 완료 및 승인되었습니다!');
        await loadReconstructionData();
        renderBoothOverview();
      }
    } catch (err) {
      showToast('검증 승인 실패');
    }
  });

  // Placement Mode Toggles
  document.getElementById('btn-start-placement').addEventListener('click', () => {
    isPlacementMode = !isPlacementMode;
    updateEditorModeUI();
  });

  document.getElementById('btn-reposition-hotspot').addEventListener('click', () => {
    if (!selectedHotspotId) return;
    isPlacementMode = true;
    updateEditorModeUI();
  });

  document.getElementById('btn-delete-selected-hotspot').addEventListener('click', () => {
    if (selectedHotspotId) {
      deleteHotspotById(selectedHotspotId);
    }
  });

  document.getElementById('btn-editor-reset-cam').addEventListener('click', () => {
    if (editorEngine && editorEngine.camera && editorEngine.controls) {
      editorEngine.camera.position.set(0, 2.2, 7.5);
      editorEngine.controls.target.set(0, 1.2, -1);
      editorEngine.controls.update();
    }
  });

  // Photo Upload Dropzone
  const dropzone = document.getElementById('photo-dropzone');
  const fileInput = document.getElementById('photo-file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentBooth) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i]);
    }

    try {
      showToast('사진들을 업로드 중입니다...');
      const res = await authFetch(`/api/booths/${currentBooth.id}/photos`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${data.count}장의 사진이 성공적으로 업로드되었습니다.`);
        currentBooth = data.booth;
        renderBoothSettings();
        await loadReconstructionData();
      } else {
        showToast(data.error || '업로드 실패');
      }
    } catch (err) {
      showToast('사진 업로드 실패');
    }
  });
}

// 9. Analytics Loader
async function loadAnalytics() {
  if (!currentBooth) return;
  try {
    const res = await authFetch(`/api/booths/${currentBooth.id}/analytics`);
    const data = await res.json();

    document.getElementById('stat-views').textContent = data.boothViews || 0;
    document.getElementById('stat-clicks').textContent = data.productViews || 0;
    document.getElementById('stat-hs-clicks').textContent = data.hotspotClicks || 0;
    document.getElementById('stat-leads').textContent = data.leadsCount || 0;
    document.getElementById('stat-rfqs').textContent = data.rfqsCount || 0;
    document.getElementById('stat-samples').textContent = data.samplesCount || 0;
    document.getElementById('stat-apts').textContent = data.appointmentsCount || 0;

    // Leads table
    const leadsTbody = document.getElementById('leads-table-body');
    leadsTbody.innerHTML = '';
    (data.leads || []).forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${l.company}</strong></td>
        <td>${l.name}</td>
        <td>${l.email}</td>
        <td>${l.phone || '-'}</td>
        <td>${l.jobTitle || '-'}</td>
        <td>${new Date(l.createdAt).toLocaleString()}</td>
      `;
      leadsTbody.appendChild(tr);
    });

    // RFQs table
    const rfqsTbody = document.getElementById('rfqs-table-body');
    rfqsTbody.innerHTML = '';
    (data.rfqs || []).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${r.productId}</code></td>
        <td>${r.buyerName} (${r.company})</td>
        <td>${r.quantity}</td>
        <td>${r.targetPrice ? `$${r.targetPrice}` : '협의'}</td>
        <td><span class="badge badge-preview">${r.status}</span></td>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
      `;
      rfqsTbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}

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

window.addEventListener('DOMContentLoaded', initAdmin);
