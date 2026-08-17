/* ============================================================
   Virtual Trade Show Commercial V1 — Exhibitor Admin Console
   Precision Splat Alignment, 3D Hotspot Editor & Analytics (Phase 5)
============================================================ */

let currentBooth = null;
let products = [];
let hotspots = [];
let editorEngine = null;
let editorRaycastSurfaces = [];
let alignEngine = null;
let alignSplatViewer = null;
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
    showToast('Session expired. Please sign in again.');
    throw new Error('Unauthorized');
  }
  return res;
}

// 1. Authentication Handlers
const forcePwdModal = document.getElementById('force-pwd-modal');
const formForcePwd = document.getElementById('form-force-pwd');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      authToken = data.token;
      localStorage.setItem('vts_admin_token', authToken);
      loginModal.classList.remove('active');

      if (data.user && data.user.mustChangePassword) {
        if (forcePwdModal) forcePwdModal.classList.add('active');
        document.getElementById('force-pwd-current').value = password;
        showToast('Please update your initial password.');
      } else {
        showToast('Signed in successfully.');
        initAdmin();
      }
    } else {
      showToast(data.error || 'Authentication failed.');
    }
  } catch (err) {
    showToast('Login request failed.');
  }
});

if (formForcePwd) {
  formForcePwd.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('force-pwd-current').value;
    const newPassword = document.getElementById('force-pwd-new').value;
    const confirmPassword = document.getElementById('force-pwd-confirm').value;

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match.');
      return;
    }

    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (res.ok) {
        alert('Password successfully updated.');
        if (forcePwdModal) forcePwdModal.classList.remove('active');
        initAdmin();
      } else {
        const d = await res.json();
        alert(d.error || 'Password update failed.');
      }
    } catch (err) {
      alert('Error updating password.');
    }
  });
}

btnLogout.addEventListener('click', async () => {
  try {
    if (authToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  } catch (e) {}
  authToken = null;
  localStorage.removeItem('vts_admin_token');
  loginModal.classList.add('active');
  showToast('Signed out.');
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
      setTimeout(() => initAlignmentViewer(), 150);
    } else if (tabName === 'billing') {
      loadBillingInfo();
    } else if (tabName === 'inbox') {
      loadInboxMessages();
    }
  });
});

const quickReconBtn = document.getElementById('btn-quick-goto-recon');
if (quickReconBtn) {
  quickReconBtn.addEventListener('click', () => {
    const reconTabBtn = document.querySelector('.admin-nav-item[data-tab="reconstruction"]');
    if (reconTabBtn) reconTabBtn.click();
  });
}

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
    const meRes = await authFetch('/api/auth/me');
    if (meRes.ok) {
      const meData = await meRes.json();
      const badge = document.getElementById('admin-org-badge');
      if (badge && meData.organization) {
        badge.textContent = `${meData.organization.name} (${meData.user.role === 'organizer_admin' ? 'Organizer' : 'Exhibitor'})`;
      }
    }

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
    `Status: ${currentBooth.status === 'published' ? 'Published (Live)' : 'Draft (Unpublished)'} | Booth ID: ${currentBooth.id}`;
  
  const publishBtn = document.getElementById('btn-toggle-publish');
  if (currentBooth.status === 'published') {
    publishBtn.textContent = 'Unpublish Booth';
    publishBtn.className = 'btn btn-secondary btn-sm';
  } else {
    publishBtn.textContent = 'Publish Booth';
    publishBtn.className = 'btn btn-primary btn-sm';
  }

  const reconText = document.getElementById('recon-status-text');
  reconText.textContent = getReconstructionLabel(currentBooth.reconstructionStatus);

  const previewBtn = document.getElementById('btn-preview-public');
  if (previewBtn) previewBtn.href = `viewer.html?boothId=${currentBooth.id}`;
}

function getReconstructionLabel(status) {
  switch (status) {
    case 'photo_preview': return 'Photo Preview (Standard View)';
    case 'reconstruction_pending': return '⏳ 3D Reconstruction Queue (Pending)';
    case 'processing': return '⚙️ GPU 3D Reconstruction Running (Processing)';
    case 'reconstructed': return '✨ 3DGS Reconstruction Complete (Pending Verification)';
    case 'verified': return '🏆 Verified & Approved (Spark 3D Gaussian Splatting)';
    case 'failed': return '❌ Reconstruction Failed';
    default: return status || 'Photo Preview';
  }
}

let replacingPhotoIndex = -1;

function renderBoothSettings() {
  if (!currentBooth) return;
  document.getElementById('edit-booth-name').value = currentBooth.name;
  document.getElementById('edit-booth-desc').value = currentBooth.description || '';

  const photos = currentBooth.photos || [];
  const gallery = document.getElementById('booth-photo-gallery');
  const countBadge = document.getElementById('booth-photo-count-badge');
  const btnClearAll = document.getElementById('btn-clear-all-photos');

  if (countBadge) countBadge.textContent = `${photos.length} Photos`;
  if (btnClearAll) btnClearAll.style.display = photos.length > 0 ? 'inline-block' : 'none';

  gallery.innerHTML = '';

  if (photos.length === 0) {
    gallery.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 32px 16px; color: var(--text-dim); background: var(--bg-surface-elevated); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="font-size: 24px; margin-bottom: 8px;">📷</div>
        <p style="font-size: 14px; margin: 0;">No multi-view booth photos uploaded yet.</p>
        <p style="font-size: 12px; margin-top: 4px;">Upload 10-20 images above to build your 3D interactive booth tour.</p>
      </div>
    `;
    return;
  }

  photos.forEach((url, idx) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.style.cssText = `
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
      transition: transform 0.15s ease, border-color 0.15s ease;
    `;

    card.innerHTML = `
      <div style="position: relative; width: 100%; height: 130px; background: #0b0f19; display: flex; align-items: center; justify-content: center; overflow: hidden;">
        <img src="${url}" alt="View #${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
        <span style="position: absolute; top: 6px; left: 6px; background: rgba(15,23,42,0.85); color: #38bdf8; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(56,189,248,0.4);">
          #${idx + 1}
        </span>
        <span style="position: absolute; bottom: 6px; left: 6px; background: rgba(0,0,0,0.7); color: #94a3b8; font-size: 10px; padding: 1px 6px; border-radius: 3px; max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${url.split('/').pop()}
        </span>
      </div>
      <div style="padding: 8px; display: flex; gap: 4px; justify-content: space-between; align-items: center; background: var(--bg-surface); border-top: 1px solid var(--border-subtle);">
        <div style="display: flex; gap: 4px;">
          <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 11px;" title="Move Earlier" ${idx === 0 ? 'disabled style="opacity:0.3; padding: 4px 8px; font-size: 11px;"' : ''} onclick="moveBoothPhoto(${idx}, ${idx - 1})">
            ◀
          </button>
          <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 11px;" title="Move Later" ${idx === photos.length - 1 ? 'disabled style="opacity:0.3; padding: 4px 8px; font-size: 11px;"' : ''} onclick="moveBoothPhoto(${idx}, ${idx + 1})">
            ▶
          </button>
        </div>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 11px;" title="Replace this photo" onclick="triggerReplacePhoto(${idx})">
            🔄 Replace
          </button>
          <button type="button" class="btn btn-danger btn-sm" style="padding: 4px 8px; font-size: 11px;" title="Delete this photo" onclick="deleteBoothPhoto(${idx}, '${url}')">
            🗑️
          </button>
        </div>
      </div>
    `;

    gallery.appendChild(card);
  });
}

// Photo Actions
async function deleteBoothPhoto(index, photoUrl) {
  if (!currentBooth) return;
  if (!confirm(`Are you sure you want to delete photo #${index + 1}?`)) return;

  try {
    showToast('Deleting photo...');
    const res = await authFetch(`/api/booths/${currentBooth.id}/photos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, photoUrl })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Photo deleted successfully.');
      currentBooth = data.booth;
      renderBoothSettings();
      await loadReconstructionData();
    } else {
      showToast(data.error || 'Failed to delete photo.');
    }
  } catch (err) {
    showToast('Error deleting photo.');
  }
}

async function moveBoothPhoto(fromIndex, toIndex) {
  if (!currentBooth || !currentBooth.photos) return;
  const photos = [...currentBooth.photos];
  if (toIndex < 0 || toIndex >= photos.length) return;

  const [moved] = photos.splice(fromIndex, 1);
  photos.splice(toIndex, 0, moved);

  try {
    showToast('Updating photo order...');
    const res = await authFetch(`/api/booths/${currentBooth.id}/photos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Photo order updated.');
      currentBooth = data.booth;
      renderBoothSettings();
    } else {
      showToast(data.error || 'Failed to update order.');
    }
  } catch (err) {
    showToast('Error updating order.');
  }
}

function triggerReplacePhoto(index) {
  replacingPhotoIndex = index;
  const replaceInput = document.getElementById('photo-replace-input');
  if (replaceInput) replaceInput.click();
}

async function clearAllBoothPhotos() {
  if (!currentBooth || !currentBooth.photos || currentBooth.photos.length === 0) return;
  if (!confirm(`Delete all ${currentBooth.photos.length} photos from this booth dataset?`)) return;

  try {
    showToast('Clearing all photos...');
    const res = await authFetch(`/api/booths/${currentBooth.id}/photos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAll: true })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('All photos removed.');
      currentBooth = data.booth;
      renderBoothSettings();
      await loadReconstructionData();
    } else {
      showToast(data.error || 'Failed to clear photos.');
    }
  } catch (err) {
    showToast('Error clearing photos.');
  }
}

// Global exposure for inline onclick handlers
window.deleteBoothPhoto = deleteBoothPhoto;
window.moveBoothPhoto = moveBoothPhoto;
window.triggerReplacePhoto = triggerReplacePhoto;
window.clearAllBoothPhotos = clearAllBoothPhotos;


// 5. Precision Reconstruction Dashboard & Alignment
async function loadReconstructionData() {
  if (!currentBooth) return;
  try {
    const res = await authFetch(`/api/booths/${currentBooth.id}/reconstruction`);
    const data = await res.json();
    renderReconstructionDashboard(data);

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

  document.getElementById('val-photo-count').textContent = `${validation.validCount} Photos`;
  
  const qualityBadge = document.getElementById('badge-capture-quality');
  const qualityGrade = document.getElementById('val-quality-grade');
  const canReconText = document.getElementById('val-can-reconstruct');

  qualityBadge.className = 'badge';
  if (validation.quality === 'good') {
    qualityBadge.classList.add('badge-reconstructed');
    qualityBadge.textContent = 'High Quality (Good)';
    qualityGrade.textContent = 'Good (A)';
    canReconText.textContent = 'Ready (Recommended)';
    canReconText.style.color = '#10b981';
  } else if (validation.quality === 'acceptable') {
    qualityBadge.classList.add('badge-preview');
    qualityBadge.textContent = 'Acceptable (B)';
    qualityGrade.textContent = 'Acceptable (B)';
    canReconText.textContent = 'Ready (Preview)';
    canReconText.style.color = '#eab308';
  } else {
    qualityBadge.classList.add('badge-failed');
    qualityBadge.textContent = 'Insufficient (Poor)';
    qualityGrade.textContent = 'Poor (< 3 photos)';
    canReconText.textContent = 'Need more photos';
    canReconText.style.color = '#ef4444';
  }

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
    workerText.textContent = `Worker: ${job.workerId || 'Pending Assignment'}`;

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
      btnTrigger.textContent = '🔄 Re-run 3D Reconstruction';
      btnCancel.style.display = 'none';
      btnVerify.style.display = 'none';
    } else {
      btnTrigger.style.display = 'inline-flex';
      btnTrigger.textContent = '🔄 Retry Reconstruction';
      btnCancel.style.display = 'none';
      btnVerify.style.display = 'none';
    }
  } else {
    jobIdText.textContent = 'No Active Job';
    progressPercent.textContent = '0%';
    progressBar.style.width = '0%';
    stageText.textContent = 'Photo Preview Mode (Idle)';
    workerText.textContent = 'Worker: Ready';
    btnTrigger.style.display = 'inline-flex';
    btnCancel.style.display = 'none';
    btnVerify.style.display = 'none';
  }
}

function formatStageName(stage) {
  switch (stage) {
    case 'preparing': return '1/7 Downloading & Validating Assets (Preparing)';
    case 'colmap_feature_extraction': return '2/7 SIFT Feature Extraction (COLMAP)';
    case 'colmap_matching': return '3/7 Exhaustive Feature Matching & Epipolar Geometry';
    case 'colmap_mapping': return '4/7 3D Point Cloud Bundle Adjustment (Mapper)';
    case 'nerfstudio_processing': return '5/7 Coordinate Transformation & Dataset Packaging';
    case 'splat_training': return '6/7 3D Gaussian Splatting Training (Splatfacto)';
    case 'splat_export': return '7/7 Web-Optimized PLY/SPZ Spatial Asset Export';
    case 'uploading_result': return 'Uploading Results & Registering Metadata';
    case 'completed': return '✨ Precision 3D Reconstruction Completed';
    default: return stage || 'Idle';
  }
}

// 6. Precision Alignment 3D Viewport Handler
function initAlignmentViewer() {
  const canvasContainer = document.getElementById('align-3d-canvas');
  if (!canvasContainer || !currentBooth) return;

  if (!alignEngine) {
    alignEngine = BoothEngine.initScene(canvasContainer);
    animateAlign();
  }

  const spatialModel = currentBooth.spatialModel || {
    type: 'gaussian_splat',
    assetUrl: '/uploads/models/demo_booth_splat.ply',
    format: 'ply'
  };

  const transform = spatialModel.transform || {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1.0
  };

  document.getElementById('slider-pos-x').value = transform.position?.[0] || 0;
  document.getElementById('val-pos-x').textContent = (transform.position?.[0] || 0).toFixed(2);

  document.getElementById('slider-pos-y').value = transform.position?.[1] || 0;
  document.getElementById('val-pos-y').textContent = (transform.position?.[1] || 0).toFixed(2);

  document.getElementById('slider-pos-z').value = transform.position?.[2] || 0;
  document.getElementById('val-pos-z').textContent = (transform.position?.[2] || 0).toFixed(2);

  document.getElementById('slider-rot-y').value = transform.rotation?.[1] || 0;
  document.getElementById('val-rot-y').textContent = `${transform.rotation?.[1] || 0}°`;

  document.getElementById('slider-scale').value = transform.scale || 1.0;
  document.getElementById('val-scale').textContent = `${(transform.scale || 1.0).toFixed(2)}x`;

  if (!alignSplatViewer) {
    alignSplatViewer = new PrecisionSplatViewer({
      scene: alignEngine.scene,
      renderer: alignEngine.renderer,
      qualityPreset: 'MEDIUM'
    });
  }

  alignSplatViewer.load(spatialModel, transform);
}

function updateAlignTransformFromUI() {
  if (!alignSplatViewer) return;

  const posX = parseFloat(document.getElementById('slider-pos-x').value);
  const posY = parseFloat(document.getElementById('slider-pos-y').value);
  const posZ = parseFloat(document.getElementById('slider-pos-z').value);
  const rotY = parseFloat(document.getElementById('slider-rot-y').value);
  const scale = parseFloat(document.getElementById('slider-scale').value);

  document.getElementById('val-pos-x').textContent = posX.toFixed(2);
  document.getElementById('val-pos-y').textContent = posY.toFixed(2);
  document.getElementById('val-pos-z').textContent = posZ.toFixed(2);
  document.getElementById('val-rot-y').textContent = `${rotY}°`;
  document.getElementById('val-scale').textContent = `${scale.toFixed(2)}x`;

  alignSplatViewer.applyTransform({
    position: [posX, posY, posZ],
    rotation: [0, rotY, 0],
    scale: scale
  });
}

function animateAlign() {
  requestAnimationFrame(animateAlign);
  if (alignEngine && alignEngine.controls) {
    alignEngine.controls.update();
    alignEngine.renderer.render(alignEngine.scene, alignEngine.camera);
    if (alignSplatViewer) {
      alignSplatViewer.updateFrameMetrics();
      const fpsEl = document.getElementById('align-fps-badge');
      if (fpsEl && alignSplatViewer.frameCount % 20 === 0) {
        fpsEl.textContent = `${alignSplatViewer.getFPS()} FPS`;
      }
    }
  }
}

// 7. Products CRUD Handlers
async function loadProducts() {
  if (!currentBooth) return;
  const res = await authFetch(`/api/booths/${currentBooth.id}/products`);
  products = await res.json();

  const tbody = document.getElementById('products-table-body');
  tbody.innerHTML = '';
  products.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td><code>${escapeHtml(p.sku)}</code></td>
      <td>${escapeHtml(p.category || '-')}</td>
      <td>${p.moq} Units</td>
      <td>${p.contactForPrice ? 'Contact for Price' : `$${Number(p.price).toLocaleString()} USD`}</td>
      <td>${p.sampleAvailable ? '✅ Available' : '❌ Unavailable'}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 8. Visual 3D Hotspot Editor
function init3DEditor() {
  const container = document.getElementById('editor-3d-canvas');
  if (!container || !currentBooth) return;

  if (!editorEngine) {
    editorEngine = BoothEngine.initScene(container);
    animateEditor();
    container.addEventListener('click', onEditorCanvasClick);
  }

  editorRaycastSurfaces = BoothEngine.buildPhotoPreviewBooth(editorEngine.scene, currentBooth);
  updateEditorProductSelect();
  renderEditorHotspots();
}

function updateEditorProductSelect() {
  const select = document.getElementById('editor-product-select');
  select.innerHTML = '';
  if (products.length === 0) {
    select.innerHTML = '<option value="">No products registered</option>';
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
      <td><strong>${escapeHtml(hs.label || (prod ? prod.name : 'Hotspot'))}</strong></td>
      <td><code>${escapeHtml(prod ? prod.sku : hs.productId)}</code></td>
      <td><code>[${hs.position.x}, ${hs.position.y}, ${hs.position.z}]</code></td>
      <td>${new Date(hs.updatedAt || hs.createdAt).toLocaleString()}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="selectHotspotForEdit('${hs.id}')">Select</button>
        <button class="btn btn-danger btn-sm" onclick="deleteHotspotById('${hs.id}')">Delete</button>
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
    pin.title = hs.label || '3D Hotspot';

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
    showToast('Please click on a valid floor or wall surface.');
    return;
  }

  const selectedProdId = document.getElementById('editor-product-select').value;
  if (!selectedProdId) {
    showToast('Please select a target product.');
    return;
  }

  try {
    if (selectedHotspotId) {
      const res = await authFetch(`/api/hotspots/${selectedHotspotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: point })
      });
      if (res.ok) {
        showToast('Hotspot coordinates updated.');
      }
    } else {
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
        showToast('New 3D hotspot placed.');
      }
    }

    isPlacementMode = false;
    selectedHotspotId = null;
    updateEditorModeUI();
    await loadHotspots();

  } catch (err) {
    showToast('Error saving hotspot.');
  }
}

window.selectHotspotForEdit = function(id) {
  selectedHotspotId = id;
  const hs = hotspots.find(h => h.id === id);
  if (hs) {
    document.getElementById('editor-product-select').value = hs.productId;
    document.getElementById('btn-reposition-hotspot').disabled = false;
    document.getElementById('btn-delete-selected-hotspot').disabled = false;
    document.getElementById('editor-selected-info').textContent = `Selected: ${hs.label || hs.id}`;
    renderEditorHotspots();
  }
};

window.deleteHotspotById = async function(id) {
  if (!confirm('Are you sure you want to delete this hotspot?')) return;
  try {
    const res = await authFetch(`/api/hotspots/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Hotspot deleted.');
      if (selectedHotspotId === id) selectedHotspotId = null;
      await loadHotspots();
    }
  } catch (e) {
    showToast('Failed to delete hotspot.');
  }
};

function updateEditorModeUI() {
  const banner = document.getElementById('editor-status-text');
  const btnStart = document.getElementById('btn-start-placement');
  const container = document.getElementById('editor-viewport-container');

  if (isPlacementMode) {
    banner.textContent = '📍 [Placement Mode Active] Click any surface in the 3D viewport to position your hotspot.';
    banner.style.color = '#38bdf8';
    btnStart.textContent = 'Cancel Placement';
    btnStart.className = 'btn btn-danger btn-sm';
    container.classList.add('placement-mode');
  } else {
    banner.textContent = 'ℹ️ Select a product above, click [+ Place Hotspot], then click on the booth surface.';
    banner.style.color = 'var(--text-main)';
    btnStart.textContent = '📍 + Place Hotspot';
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

// 9. Event Listeners Setup
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
        showToast(newStatus === 'published' ? 'Booth published successfully.' : 'Booth moved to draft.');
      }
    } catch (e) {
      showToast('Failed to update status.');
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
        showToast('3D reconstruction job queued successfully.');
        await loadReconstructionData();
      } else {
        showToast(data.error || 'Reconstruction request failed.');
      }
    } catch (e) {
      showToast('Reconstruction request failed.');
    }
  });

  // Cancel Reconstruction
  document.getElementById('btn-cancel-reconstruction').addEventListener('click', async (e) => {
    const jobId = e.target.dataset.jobId;
    if (!jobId || !confirm('Cancel the active reconstruction job?')) return;
    try {
      const res = await authFetch(`/api/reconstruction/jobs/${jobId}/cancel`, { method: 'POST' });
      if (res.ok) {
        showToast('Reconstruction job cancelled.');
        await loadReconstructionData();
      }
    } catch (err) {
      showToast('Cancellation failed.');
    }
  });

  // Verify Reconstruction (Human Approval Gate)
  document.getElementById('btn-verify-reconstruction').addEventListener('click', async (e) => {
    const jobId = e.target.dataset.jobId;
    if (!jobId || !confirm('Verify and approve this reconstructed 3D booth for public publishing?')) return;
    try {
      const res = await authFetch(`/api/reconstruction/jobs/${jobId}/verify`, { method: 'POST' });
      if (res.ok) {
        showToast('3D booth verified and approved!');
        await loadReconstructionData();
        renderBoothOverview();
      }
    } catch (err) {
      showToast('Verification approval failed.');
    }
  });

  // Alignment Sliders
  ['slider-pos-x', 'slider-pos-y', 'slider-pos-z', 'slider-rot-y', 'slider-scale'].forEach(id => {
    const slider = document.getElementById(id);
    if (slider) slider.addEventListener('input', updateAlignTransformFromUI);
  });

  // Save Alignment Transform
  document.getElementById('btn-save-alignment').addEventListener('click', async () => {
    if (!currentBooth || !alignSplatViewer) return;
    const transform = alignSplatViewer.getTransform();

    try {
      const updatedSpatialModel = {
        ...(currentBooth.spatialModel || { type: 'gaussian_splat', format: 'ply' }),
        transform
      };

      const res = await authFetch(`/api/booths/${currentBooth.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spatialModel: updatedSpatialModel })
      });

      if (res.ok) {
        currentBooth = await res.json();
        showToast('Precision alignment saved.');
      } else {
        showToast('Failed to save alignment.');
      }
    } catch (e) {
      showToast('Failed to save alignment.');
    }
  });

  // Reset Alignment
  document.getElementById('btn-align-reset').addEventListener('click', () => {
    document.getElementById('slider-pos-x').value = 0;
    document.getElementById('slider-pos-y').value = 0;
    document.getElementById('slider-pos-z').value = 0;
    document.getElementById('slider-rot-y').value = 0;
    document.getElementById('slider-scale').value = 1.0;
    updateAlignTransformFromUI();
    showToast('Alignment reset to defaults.');
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
      showToast('Uploading photos...');
      const res = await authFetch(`/api/booths/${currentBooth.id}/photos`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${data.count} photos uploaded successfully.`);
        currentBooth = data.booth;
        renderBoothSettings();
        await loadReconstructionData();
      } else {
        showToast(data.error || 'Upload failed.');
      }
    } catch (err) {
      showToast('Photo upload failed.');
    } finally {
      fileInput.value = '';
    }
  });

  // Photo Replace Input
  const replaceInput = document.getElementById('photo-replace-input');
  if (replaceInput) {
    replaceInput.addEventListener('change', async (e) => {
      const file = e.target.files ? e.target.files[0] : null;
      if (!file || replacingPhotoIndex < 0 || !currentBooth) return;

      const formData = new FormData();
      formData.append('photo', file);
      formData.append('index', replacingPhotoIndex);

      try {
        showToast(`Replacing photo #${replacingPhotoIndex + 1}...`);
        const res = await authFetch(`/api/booths/${currentBooth.id}/photos/replace`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          showToast(`Photo #${replacingPhotoIndex + 1} replaced successfully.`);
          currentBooth = data.booth;
          renderBoothSettings();
          await loadReconstructionData();
        } else {
          showToast(data.error || 'Failed to replace photo.');
        }
      } catch (err) {
        showToast('Error replacing photo.');
      } finally {
        replaceInput.value = '';
        replacingPhotoIndex = -1;
      }
    });
  }
}


// 10. Analytics Loader
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

    const leadsTbody = document.getElementById('leads-table-body');
    leadsTbody.innerHTML = '';
    (data.leads || []).forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(l.company)}</strong></td>
        <td>${escapeHtml(l.name)}</td>
        <td>${escapeHtml(l.email)}</td>
        <td>${escapeHtml(l.phone || '-')}</td>
        <td>${escapeHtml(l.jobTitle || '-')}</td>
        <td>${new Date(l.createdAt).toLocaleString()}</td>
      `;
      leadsTbody.appendChild(tr);
    });

    const rfqsTbody = document.getElementById('rfqs-table-body');
    rfqsTbody.innerHTML = '';
    (data.rfqs || []).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${escapeHtml(r.productId)}</code></td>
        <td>${escapeHtml(r.buyerName)} (${escapeHtml(r.company)})</td>
        <td>${r.quantity}</td>
        <td>${r.targetPrice ? `$${r.targetPrice}` : 'Negotiable'}</td>
        <td><span class="badge badge-preview">${escapeHtml(r.status)}</span></td>
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
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// 11. Stripe Billing & In-App Messages Logic
async function loadBillingInfo() {
  if (!authToken) return;
  try {
    const res = await authFetch('/api/billing/my-subscription');
    const data = await res.json();
    if (!res.ok) return;

    document.getElementById('plan-name-display').textContent = data.subscription.plan.toUpperCase();
    document.getElementById('billing-status-badge').textContent = `${data.subscription.plan.toUpperCase()} (${data.subscription.status.toUpperCase()})`;
    document.getElementById('plan-products-usage').textContent = `${data.usage.productsCount} / ${data.entitlements.maxProducts}`;
    document.getElementById('plan-hotspots-usage').textContent = `${hotspots.length} / ${data.entitlements.maxHotspots}`;

    const precEl = document.getElementById('plan-precision-status');
    if (data.entitlements.precision3D) {
      precEl.textContent = 'Eligible';
      precEl.style.color = 'var(--accent)';
    } else {
      precEl.textContent = 'Requires PRO Plan (Locked)';
      precEl.style.color = 'var(--text-muted)';
    }
  } catch (err) {
    console.error('Error loading billing info:', err);
  }
}

let pendingCheckoutPlan = null;

function startUpgradeCheckout(requestedPlan) {
  pendingCheckoutPlan = requestedPlan;
  const modal = document.getElementById('checkout-consent-modal');
  if (!modal) return;

  const headline = document.getElementById('consent-plan-headline');
  if (headline) {
    headline.textContent = requestedPlan === 'pro'
      ? 'PRO Plan ($299 / month)'
      : 'BUSINESS Plan ($799 / month)';
  }

  document.getElementById('chk-consent-terms').checked = false;
  document.getElementById('chk-consent-recurring').checked = false;

  modal.style.display = 'flex';
}

async function proceedWithConsentCheckout() {
  if (!authToken || !pendingCheckoutPlan) return;

  const consentTerms = document.getElementById('chk-consent-terms').checked;
  const consentRecurring = document.getElementById('chk-consent-recurring').checked;

  if (!consentTerms || !consentRecurring) {
    alert('You must accept the Terms of Service and monthly recurring subscription terms to proceed.');
    return;
  }

  document.getElementById('checkout-consent-modal').style.display = 'none';

  try {
    showToast(`Creating checkout session for ${pendingCheckoutPlan.toUpperCase()} plan...`);
    const res = await authFetch('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestedPlan: pendingCheckoutPlan,
        consentTerms: true,
        consentRecurring: true
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to create checkout session.');

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else if (data.simulation) {
      showToast(data.message);
      await loadBillingInfo();
    }
  } catch (err) {
    alert(err.message);
  }
}

async function openCustomerPortal() {
  if (!authToken) return;
  try {
    const res = await authFetch('/api/billing/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to open customer portal.');

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.message || 'Stripe Customer Portal is in Test Mode.');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function loadInboxMessages() {
  if (!authToken) return;
  try {
    const res = await authFetch('/api/communications/messages');
    const messages = await res.json();
    const list = document.getElementById('admin-inbox-list');
    if (!list) return;

    const unreadCount = messages.filter(m => !m.readBy || !m.readBy.some(r => r.orgId === currentBooth?.organizationId)).length;
    const badge = document.getElementById('nav-inbox-badge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!messages || messages.length === 0) {
      list.innerHTML = '<div style="color: var(--text-muted); padding: 16px;">No announcements or messages in inbox.</div>';
      return;
    }

    list.innerHTML = messages.map(m => `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <strong style="font-size: 15px; color: var(--text-main);">${escapeHtml(m.subject)}</strong>
          <span class="badge badge-preview">${escapeHtml(m.category)}</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 10px 0;">${escapeHtml(m.body)}</p>
        <div style="font-size: 11px; color: var(--text-muted);">From: ${escapeHtml(m.senderName)} &bull; ${new Date(m.createdAt).toLocaleString()}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading inbox:', err);
  }
}

function openContactOwnerModal() {
  const subject = prompt('Enter inquiry subject for platform operations:');
  if (!subject) return;
  const body = prompt('Enter your detailed message:');
  if (!body) return;

  authFetch('/api/communications/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'support', subject, body })
  }).then(res => res.json()).then(data => {
    if (data.success) {
      showToast('Support message dispatched to platform operations.');
      loadInboxMessages();
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.adminApp = {
  startUpgradeCheckout,
  proceedWithConsentCheckout,
  openCustomerPortal,
  loadBillingInfo,
  loadInboxMessages,
  openContactOwnerModal
};

window.addEventListener('DOMContentLoaded', () => {
  initAdmin();
});
