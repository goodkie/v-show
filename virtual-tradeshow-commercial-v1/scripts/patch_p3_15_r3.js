const fs = require('fs');
const path = require('path');

const ROOT = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const CLIENT_FILES = [
  path.join(ROOT, '_clean_deploy/client/index.html'),
  path.join(ROOT, '_railway_deploy/client/index.html'),
  path.join(ROOT, 'app_build/client/index.html')
];

CLIENT_FILES.forEach(filePath => {
  let src = fs.readFileSync(filePath, 'utf8');

  // 1. Fix Static #p3dConfirmModal: z-index must be 10200 (above #ownerProductEditorModal at 10010)
  src = src.replace(
    '<div class="viewport-modal" id="p3dConfirmModal" style="display: none; z-index: 10000;">',
    '<div class="viewport-modal" id="p3dConfirmModal" style="display: none; position: fixed; inset: 0; z-index: 10200; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); align-items: center; justify-content: center;">'
  );

  // 2. Fix handleP3dTabSourceUpload (Replace button) to use canonical uploadProductMedia & reset value
  const oldTabUploadRegex = /function handleP3dTabSourceUpload\(event\)[\s\S]*?reader\.readAsDataURL\(file\);\s*\}/;
  const newTabUpload = `async function handleP3dTabSourceUpload(event) {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        await uploadProductMedia(file, 'UPLOAD');
      } catch(err) {
        console.error('[handleP3dTabSourceUpload]', err);
        alert("Couldn't upload this image. Please try again: " + err.message);
      } finally {
        event.target.value = ''; // Reset so selecting the same file again triggers change event
      }
    }`;

  if (oldTabUploadRegex.test(src)) {
    src = src.replace(oldTabUploadRegex, newTabUpload);
    console.log('[OK] Replaced handleP3dTabSourceUpload in', path.basename(path.dirname(filePath)));
  }

  // 3. Reset _p3dState on openOwnerProductEditor to avoid cross-modal state bleed
  const oldOpenEditorStart = `      const prods = window.activeProjectData?.products || [];
      let prod = null;
      let slot = 1;`;

  const newOpenEditorStart = `      // C11.16-P3.15-R3: Cleanly reset transient 3D state on open to prevent cross-session leakage
      if (window._p3dState) {
        window._p3dState.primarySourceImageUrl = null;
        window._p3dState.sourceImageUrl = null;
        window._p3dState.additionalSourceImages = [];
        window._p3dState.isSubmitting = false;
        window._p3dState.isConfirmOpen = false;
        window._p3dState.confirmPendingAction = null;
      }
      const prods = window.activeProjectData?.products || [];
      let prod = null;
      let slot = 1;`;

  if (src.includes(oldOpenEditorStart) && !src.includes('Cleanly reset transient 3D state on open')) {
    src = src.replace(oldOpenEditorStart, newOpenEditorStart);
  }

  // 4. Update productDraft initialization in openOwnerProductEditor
  const oldDraftBlock = `      window.productDraft = {
        draftId: draftId,
        projectId: activeProjectId || window.activeProjectData?.id,
        productId: prod ? (prod.id || ('prod-slot-' + slot)) : ('prod-slot-' + slot),
        slotIndex: slot,
        originatingPinId: origPinId,
        state: prod?.imageUrl ? 'MEDIA_READY' : 'NEW_PRODUCT_DRAFT',
        primaryMedia: prod?.imageUrl ? {
          mediaId: prod.assetId || null,
          url: prod.imageUrl,
          sourceType: 'EXISTING'
        } : null,
        product3dSources: prod?.imageUrl ? [{
          mediaId: prod.assetId || null,
          url: prod.imageUrl,
          viewLabel: 'Front View',
          isPrimary: true
        }] : [],`;

  const newDraftBlock = `      const hasRealExistingImage = Boolean(prod?.imageUrl && !prod.imageUrl.includes('product-placeholder') && !prod.imageUrl.startsWith('blob:'));
      window.productDraft = {
        draftId: draftId,
        projectId: activeProjectId || window.activeProjectData?.id,
        productId: prod ? (prod.id || ('prod-slot-' + slot)) : ('prod-slot-' + slot),
        slotIndex: slot,
        originatingPinId: origPinId,
        state: hasRealExistingImage ? 'MEDIA_READY' : 'NEW_PRODUCT_DRAFT',
        primaryMedia: hasRealExistingImage ? {
          mediaId: prod.assetId || null,
          url: prod.imageUrl,
          sourceType: 'EXISTING'
        } : null,
        product3dSources: hasRealExistingImage ? [{
          mediaId: prod.assetId || null,
          url: prod.imageUrl,
          viewLabel: 'Front View',
          isPrimary: true
        }] : [],`;

  if (src.includes(oldDraftBlock)) {
    src = src.replace(oldDraftBlock, newDraftBlock);
  }

  // 5. In openOwnerProductEditor, after opening modal, render initial state
  const oldOpenEnd = `      if (typeof setProductMediaMode === 'function') setProductMediaMode('IMAGE');
      modal.style.display = 'flex';
    }`;

  const newOpenEnd = `      if (typeof setProductMediaMode === 'function') setProductMediaMode('IMAGE');
      if (typeof renderProduct3dSourceState === 'function') renderProduct3dSourceState();
      modal.style.display = 'flex';
    }`;

  if (src.includes(oldOpenEnd) && !src.includes('renderProduct3dSourceState();\n      modal.style.display = \'flex\';')) {
    src = src.replace(oldOpenEnd, newOpenEnd);
  }

  // 6. Unified Canonical Gating & Render Engine (C11.16-P3.15-R3)
  const CANONICAL_GATING_AND_RENDER = `// ════════════════════════════════════════════════════════════
// C11.16-P3.15-R3: Canonical 3D Readiness & Media Sync Store
// ════════════════════════════════════════════════════════════
const PRODUCT_3D_MIN_VIEWS_STANDARD = 1;
const PRODUCT_3D_MIN_VIEWS_HIGH = 3;
const PRODUCT_3D_MIN_VIEWS_ULTRA = 6;

function getProduct3dReadiness(draft = window.productDraft) {
  const tier = window._p3dState?.currentQuality || 'HIGH';
  const reqMap = { STANDARD: PRODUCT_3D_MIN_VIEWS_STANDARD, HIGH: PRODUCT_3D_MIN_VIEWS_HIGH, ULTRA: PRODUCT_3D_MIN_VIEWS_ULTRA };
  const requiredSourceCount = reqMap[tier] || 3;

  const sources = [];
  const seenUrls = new Set();

  // DERIVE PRIMARY SOURCE SOLELY FROM productDraft.primaryMedia
  const primaryUrl = draft?.primaryMedia?.url;
  const hasPrimary = Boolean(primaryUrl && !primaryUrl.startsWith('blob:') && !primaryUrl.includes('product-placeholder'));
  if (hasPrimary) {
    sources.push({
      mediaId: draft.primaryMedia.mediaId || null,
      url: primaryUrl,
      viewLabel: 'Front View',
      isPrimary: true
    });
    seenUrls.add(primaryUrl);
  }

  const addl = draft?.product3dSources?.filter(s => !s.isPrimary) || window._p3dState?.additionalSourceImages || [];
  addl.forEach(item => {
    const u = typeof item === 'string' ? item : item.url;
    if (u && !seenUrls.has(u)) {
      seenUrls.add(u);
      sources.push(typeof item === 'string' ? { url: u, viewLabel: 'Additional View' } : item);
    }
  });

  const uniqueSourceCount = sources.length;
  const missingSourceCount = Math.max(0, requiredSourceCount - uniqueSourceCount);
  const canGenerate = (uniqueSourceCount >= requiredSourceCount) && hasPrimary;

  return {
    qualityTier: tier,
    uniqueSourceCount,
    requiredSourceCount,
    missingSourceCount,
    canGenerate,
    hasPrimary,
    sources,
    reason: !hasPrimary ? 'Primary product image required.' : (missingSourceCount > 0 ? \`\${missingSourceCount} more view(s) required.\` : 'Ready to generate.')
  };
}
window.getProduct3dReadiness = getProduct3dReadiness;

function renderProduct3dSourceState(draft = window.productDraft) {
  const readiness = getProduct3dReadiness(draft);
  const { qualityTier, uniqueSourceCount, requiredSourceCount, missingSourceCount, canGenerate, hasPrimary } = readiness;
  const tokenCost = qualityTier === 'STANDARD' ? 1 : (qualityTier === 'ULTRA' ? 6 : 3);
  const isDev = window._p3dState?.isDev || Boolean(window.INTERNAL_DEV_BYPASS || window.IS_QA_INTERNAL);

  const primaryUrl = draft?.primaryMedia?.url;

  // DOM elements in 3D Tab
  const filledBox = document.getElementById('p3dTabSourceFilledBox');
  const emptyBox = document.getElementById('p3dTabSourceEmptyBox');
  const imgPreview = document.getElementById('p3dTabSourceImgPreview');

  // DOM elements in Product Image Tab
  const opePreview = document.getElementById('opeImagePreview');
  const opeRemoveBtn = document.getElementById('opeBtnRemoveImg');
  const opeUploadBtn = document.getElementById('opeBtnUploadImg');
  const opeTakeBtn = document.getElementById('opeBtnTakePhoto');
  const opeBadge = document.getElementById('opeUploadedBadge');

  if (hasPrimary && primaryUrl) {
    if (imgPreview) {
      imgPreview.src = primaryUrl;
      imgPreview.style.display = 'block';
      imgPreview.style.maxHeight = '160px';
      imgPreview.style.maxWidth = '100%';
      imgPreview.style.objectFit = 'contain';
      imgPreview.style.objectPosition = 'center';
    }
    if (filledBox) filledBox.style.display = 'flex';
    if (emptyBox) emptyBox.style.display = 'none';

    if (opePreview) {
      opePreview.src = primaryUrl;
      opePreview.style.display = 'block';
      opePreview.style.objectFit = 'contain';
      opePreview.style.objectPosition = 'center';
    }
    if (opeRemoveBtn) opeRemoveBtn.style.display = 'inline-flex';
    if (opeBadge) opeBadge.style.display = 'inline-flex';
    if (opeUploadBtn) opeUploadBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Replace Image';
    if (opeTakeBtn) opeTakeBtn.innerHTML = '<i class="fa-solid fa-camera-rotate"></i> Retake Photo';
  } else {
    if (imgPreview) {
      imgPreview.src = '';
      imgPreview.style.display = 'none';
    }
    if (filledBox) filledBox.style.display = 'none';
    if (emptyBox) emptyBox.style.display = 'flex';

    if (opePreview) {
      opePreview.src = '';
      opePreview.style.display = 'none';
    }
    if (opeRemoveBtn) opeRemoveBtn.style.display = 'none';
    if (opeBadge) opeBadge.style.display = 'none';
    if (opeUploadBtn) opeUploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Product Image';
    if (opeTakeBtn) opeTakeBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Take Photo';
  }

  // Update Readiness Badges & Summary
  const badge = document.getElementById('p3dMultiViewReadinessBadge');
  const costEl = document.getElementById('p3dLiveCostSummary');
  const ctaBtn = document.getElementById('p3dMainCtaBtn');
  const ctaText = document.getElementById('p3dMainCtaText');
  const warn = document.getElementById('p3dWarningBanner');

  if (badge) {
    badge.innerHTML = canGenerate 
      ? \`<i class="fa-solid fa-check"></i> \${uniqueSourceCount} / \${requiredSourceCount} views ready\` 
      : \`\${uniqueSourceCount} / \${requiredSourceCount} views ready (Need \${missingSourceCount} more)\`;
    badge.style.color = canGenerate ? '#4ade80' : '#fbbf24';
    badge.style.background = canGenerate ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)';
  }

  if (costEl) {
    costEl.textContent = isDev 
      ? \`\${qualityTier} · \${tokenCost} Nominal Tokens (QA Mode · Charge: 0)\`
      : \`\${qualityTier} · \${tokenCost} Tokens\`;
  }

  if (ctaBtn) {
    ctaBtn.disabled = !canGenerate;
    ctaBtn.setAttribute('aria-disabled', canGenerate ? 'false' : 'true');

    if (canGenerate) {
      ctaBtn.style.background = 'linear-gradient(135deg, #0284c7, #2563eb)';
      ctaBtn.style.border = '1px solid #38bdf8';
      ctaBtn.style.color = '#ffffff';
      ctaBtn.style.opacity = '1';
      ctaBtn.style.cursor = 'pointer';
      ctaBtn.style.boxShadow = '0 4px 14px rgba(2,132,199,0.35)';
      if (ctaText) ctaText.textContent = isDev ? \`Generate 3D Model (QA Mode)\` : \`Generate 3D Model (\${tokenCost} Token\${tokenCost > 1 ? 's' : ''})\`;
      if (warn) warn.style.display = 'none';
    } else {
      ctaBtn.style.background = '#334155';
      ctaBtn.style.border = '1px solid #475569';
      ctaBtn.style.color = '#94a3b8';
      ctaBtn.style.opacity = '0.6';
      ctaBtn.style.cursor = 'not-allowed';
      ctaBtn.style.boxShadow = 'none';

      if (!hasPrimary) {
        if (ctaText) ctaText.textContent = 'Upload or Snap Product Photo First';
        if (warn) {
          warn.style.display = 'block';
          warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload a product image to generate 3D.';
        }
      } else {
        if (ctaText) ctaText.textContent = \`Add \${missingSourceCount} More View\${missingSourceCount > 1 ? 's' : ''} to Generate\`;
        if (warn) {
          warn.style.display = 'block';
          warn.innerHTML = \`<i class="fa-solid fa-triangle-exclamation"></i> \${missingSourceCount} more view\${missingSourceCount > 1 ? 's' : ''} required for \${qualityTier} Quality 3D. Use <strong>+ Upload View</strong> or <strong>Capture View</strong> below.\`;
        }
      }
    }
  }
}
window.renderProduct3dSourceState = renderProduct3dSourceState;
window.updateP3dMultiViewReadiness = renderProduct3dSourceState;
window.syncProduct3dSourceUI = renderProduct3dSourceState;`;

  // Replace old gating block with new CANONICAL_GATING_AND_RENDER
  const gatingStart = src.indexOf('// C11.16-P3.15-R2: Canonical 3D Readiness & Media Sync Store');
  if (gatingStart > 0) {
    const gatingEnd = src.indexOf('\nfunction selectP3dQuality(', gatingStart);
    if (gatingEnd > 0) {
      src = src.substring(0, gatingStart) + CANONICAL_GATING_AND_RENDER + '\n\n' + src.substring(gatingEnd + 1);
    }
  }

  // 7. Fix openP3dConfirmModal and closeP3dConfirmModal with robust escape hatches and fail-safes
  const CONFIRM_AND_LOCK_ENGINE = `// ── C11.16-P3.15-R3: Robust Modal Lock & Topmost Confirm Architecture ──
function lockUnderlyingModal() {
  const edCard = document.querySelector('#ownerProductEditorModal .viewport-modal-card');
  if (edCard) edCard.setAttribute('aria-hidden', 'true');
}

function unlockUnderlyingModal() {
  const edModal = document.getElementById('ownerProductEditorModal');
  if (edModal) {
    edModal.style.pointerEvents = '';
    edModal.removeAttribute('aria-hidden');
  }
  const edCard = document.querySelector('#ownerProductEditorModal .viewport-modal-card');
  if (edCard) edCard.removeAttribute('aria-hidden');
  document.body.style.pointerEvents = '';
  if (window._p3dState) {
    window._p3dState.isConfirmOpen = false;
  }
}
window.lockUnderlyingModal = lockUnderlyingModal;
window.unlockUnderlyingModal = unlockUnderlyingModal;

function openP3dConfirmModal(action, message) {
  let modal = document.getElementById('p3dConfirmModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'p3dConfirmModal';
    modal.className = 'viewport-modal';
  }

  // Ensure mounted in #appModalRoot above ownerProductEditorModal
  const root = document.getElementById('appModalRoot') || document.body;
  if (modal.parentElement !== root) {
    root.appendChild(modal);
  }

  modal.style.cssText = 'display: flex !important; position: fixed !important; inset: 0 !important; z-index: 10200 !important; background: rgba(0,0,0,0.75) !important; backdrop-filter: blur(8px) !important; align-items: center !important; justify-content: center !important;';

  const msgEl = document.getElementById('p3dConfirmMsg') || document.getElementById('p3dConfirmMessage');
  if (msgEl) msgEl.innerHTML = message;

  const okBtn = document.getElementById('p3dConfirmOkBtn') || document.getElementById('p3dConfirmBtn');
  if (okBtn) {
    okBtn.onclick = (e) => {
      e.preventDefault();
      handleProduct3dConvertRequest();
    };
  }

  window._p3dState.confirmPendingAction = action;
  window._p3dState.isConfirmOpen = true;

  lockUnderlyingModal();
  modal.style.display = 'flex';
}
window.openP3dConfirmModal = openP3dConfirmModal;

function closeP3dConfirmModal() {
  try {
    const modal = document.getElementById('p3dConfirmModal');
    if (modal) modal.style.display = 'none';
    if (window._p3dState) {
      window._p3dState.confirmPendingAction = null;
      window._p3dState.isConfirmOpen = false;
    }
  } finally {
    unlockUnderlyingModal();
  }
}
window.closeP3dConfirmModal = closeP3dConfirmModal;

async function p3dConfirmExecute() {
  const action = window._p3dState?.confirmPendingAction;
  closeP3dConfirmModal();
  if (action === 'generate') await _p3dExecuteGenerate(false);
  else if (action === 'regenerate') await _p3dExecuteGenerate(true);
}
window.p3dConfirmExecute = p3dConfirmExecute;

// Global Escape Key Listener
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    const p3dModal = document.getElementById('p3dConfirmModal');
    if (p3dModal && p3dModal.style.display !== 'none' && getComputedStyle(p3dModal).display !== 'none') {
      e.stopPropagation();
      e.preventDefault();
      closeP3dConfirmModal();
    }
  }
});

// Defensive UI Lock Watchdog (Sec. 30)
setInterval(function() {
  const p3dModal = document.getElementById('p3dConfirmModal');
  const isConfirmVisible = p3dModal && p3dModal.style.display !== 'none' && getComputedStyle(p3dModal).display !== 'none';
  if (!isConfirmVisible) {
    const edModal = document.getElementById('ownerProductEditorModal');
    if (edModal && edModal.style.pointerEvents === 'none') {
      edModal.style.pointerEvents = '';
    }
  }
}, 500);`;

  const oldConfirmStart = src.indexOf('function openP3dConfirmModal(action, message) {');
  if (oldConfirmStart > 0) {
    const oldConfirmEnd = src.indexOf('// ── Execute Generate with Auto-Draft Persistence (UX2) ────────', oldConfirmStart);
    if (oldConfirmEnd > 0) {
      src = src.substring(0, oldConfirmStart) + CONFIRM_AND_LOCK_ENGINE + '\n\n' + src.substring(oldConfirmEnd);
    }
  }

  // 8. Update _p3dExecuteGenerate to release modal lock immediately upon job acknowledgment
  const oldExecuteStart = src.indexOf('async function _p3dExecuteGenerate(isRegen) {');
  if (oldExecuteStart > 0) {
    const oldExecuteEnd = src.indexOf('async function product3dRemove() {', oldExecuteStart);
    if (oldExecuteEnd > 0) {
      const newExecuteGenerate = `async function _p3dExecuteGenerate(isRegen) {
  if (window._p3dState.isSubmitting) return;
  const slot = window._p3dState.currentSlot || parseInt(document.getElementById('opeSlotIndex')?.value, 10) || 1;
  const pid = window._p3dState.currentProjectId || activeProjectId || window.activeProjectData?.id;
  const qualityTier = window._p3dState.currentQuality || 'HIGH';
  if (!slot || !pid) return;

  const prodName = (document.getElementById('opeName')?.value || '').trim() || ('Product Slot ' + slot);
  let prod = (window.activeProjectData?.products || []).find(p => String(p.slotIndex) === String(slot));

  window._p3dState.isSubmitting = true;
  window._p3dState.elapsedSeconds = 0;

  renderProduct3dSection(slot, { ...prod, product3d: { status: 'QUEUED', qualityTier, previousGlbUrl: prod?.product3d?.glbUrl } });

  const token = p3dGetAuthToken();
  const endpoint = '/api/projects/' + pid + '/products/' + slot + '/3d/' + (isRegen ? 'regenerate' : 'generate');

  const imageUrl = window.productDraft?.primaryMedia?.url || window._p3dState?.primarySourceImageUrl || prod?.imageUrl;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ qualityTier, name: prodName, imageUrl })
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (resp.status === 402) {
        alert('Insufficient 3D tokens. Please recharge your token balance.');
      } else {
        alert('Error: ' + (data.error || 'Failed to start 3D conversion'));
      }
      renderProduct3dSection(slot, window.activeProjectData?.products?.find(p => String(p.slotIndex) === String(slot)));
      return;
    }

    if (window.showToast) window.showToast('🚀 ' + qualityTier + ' 3D conversion started!', 'info');
    p3dStartPolling(slot);

  } catch (e) {
    alert('Request failed: ' + e.message);
    renderProduct3dSection(slot, window.activeProjectData?.products?.find(p => String(p.slotIndex) === String(slot)));
  } finally {
    // ALWAYS release submission lock after HTTP request acknowledgment (Sec. 22 & 40)
    window._p3dState.isSubmitting = false;
    unlockUnderlyingModal();
  }
}\n\n`;
      src = src.substring(0, oldExecuteStart) + newExecuteGenerate + src.substring(oldExecuteEnd);
    }
  }

  // 9. Update Release ID in script block
  src = src.replace(/C11\.16-P3\.15-R2/g, 'C11.16-P3.15-R3');

  fs.writeFileSync(filePath, src, 'utf8');
  console.log('[OK] Successfully patched:', filePath);
});

// Also update server releaseId
const SERVER_FILES = [
  path.join(ROOT, '_clean_deploy/server/index.js'),
  path.join(ROOT, '_railway_deploy/server/index.js'),
  path.join(ROOT, 'app_build/server/index.js')
];

SERVER_FILES.forEach(filePath => {
  let src = fs.readFileSync(filePath, 'utf8');
  src = src.replace(/C11\.16-P3\.15-R2/g, 'C11.16-P3.15-R3');
  fs.writeFileSync(filePath, src, 'utf8');
  console.log('[OK] Updated releaseId in server:', filePath);
});

console.log('All client and server files patched for P3.15-R3.');
