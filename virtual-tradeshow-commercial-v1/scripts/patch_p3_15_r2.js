const fs = require('fs');
const path = require('path');

const ROOT = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const CLIENT_FILES = [
  path.join(ROOT, '_clean_deploy/client/index.html'),
  path.join(ROOT, '_railway_deploy/client/index.html'),
  path.join(ROOT, 'app_build/client/index.html')
];

// Read template file
CLIENT_FILES.forEach(filePath => {
  let src = fs.readFileSync(filePath, 'utf8');

  // 1. Fix line 10822 crash: remove "window.handleP3dMainCtaClick = handleP3dMainCtaClick;"
  src = src.replace('window.handleP3dMainCtaClick = handleP3dMainCtaClick;\n', '// handleP3dMainCtaClick assigned canonically below\n');
  src = src.replace('window.handleP3dMainCtaClick = handleP3dMainCtaClick;', '// handleP3dMainCtaClick assigned canonically below');

  // 2. Canonical Gating & Sync Functions
  const CANONICAL_GATING_AND_SYNC = `// ════════════════════════════════════════════════════════════
// C11.16-P3.15-R2: Canonical 3D Readiness & Media Sync Store
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

  const primaryUrl = draft?.primaryMedia?.url 
    || window._p3dState?.primarySourceImageUrl 
    || window._p3dState?.sourceImageUrl 
    || document.getElementById('opeImagePreview')?.src;

  const hasPrimary = Boolean(primaryUrl && !primaryUrl.startsWith('blob:') && !primaryUrl.includes('product-placeholder'));
  if (hasPrimary) {
    sources.push({
      mediaId: draft?.primaryMedia?.mediaId || null,
      url: primaryUrl,
      viewLabel: 'Front View',
      isPrimary: true
    });
    seenUrls.add(primaryUrl);
  }

  const addl = window._p3dState?.additionalSourceImages || draft?.product3dSources?.filter(s => !s.isPrimary) || [];
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

function syncProduct3dSourceUI() {
  const readiness = getProduct3dReadiness();
  const primaryUrl = window.productDraft?.primaryMedia?.url 
    || window._p3dState?.primarySourceImageUrl 
    || window._p3dState?.sourceImageUrl;

  const filledBox = document.getElementById('p3dTabSourceFilledBox');
  const emptyBox = document.getElementById('p3dTabSourceEmptyBox');
  const imgPreview = document.getElementById('p3dTabSourceImgPreview');

  if (primaryUrl && !primaryUrl.includes('product-placeholder')) {
    if (imgPreview) {
      imgPreview.src = primaryUrl;
      imgPreview.style.display = 'block';
      imgPreview.style.objectFit = 'contain';
      imgPreview.style.objectPosition = 'center';
    }
    if (filledBox) filledBox.style.display = 'flex';
    if (emptyBox) emptyBox.style.display = 'none';
  } else {
    if (imgPreview) {
      imgPreview.src = '';
      imgPreview.style.display = 'none';
    }
    if (filledBox) filledBox.style.display = 'none';
    if (emptyBox) emptyBox.style.display = 'flex';
  }

  updateP3dMultiViewReadiness();
}
window.syncProduct3dSourceUI = syncProduct3dSourceUI;

function updateP3dMultiViewReadiness() {
  const readiness = getProduct3dReadiness();
  const { qualityTier, uniqueSourceCount, requiredSourceCount, missingSourceCount, canGenerate, hasPrimary } = readiness;
  const tokenCost = qualityTier === 'STANDARD' ? 1 : (qualityTier === 'ULTRA' ? 6 : 3);
  const isDev = window._p3dState?.isDev || Boolean(window.INTERNAL_DEV_BYPASS || window.IS_QA_INTERNAL);

  const badge = document.getElementById('p3dMultiViewReadinessBadge');
  const costEl = document.getElementById('p3dLiveCostSummary');
  const ctaBtn = document.getElementById('p3dMainCtaBtn');
  const ctaText = document.getElementById('p3dMainCtaText');
  const warn = document.getElementById('p3dWarningBanner');

  // Strict DOM holder synchronization
  const filledBox = document.getElementById('p3dTabSourceFilledBox');
  const emptyBox = document.getElementById('p3dTabSourceEmptyBox');
  const imgPreview = document.getElementById('p3dTabSourceImgPreview');
  if (hasPrimary) {
    if (filledBox) filledBox.style.display = 'flex';
    if (emptyBox) emptyBox.style.display = 'none';
    if (imgPreview && !imgPreview.src) {
      imgPreview.src = window.productDraft?.primaryMedia?.url || window._p3dState?.primarySourceImageUrl || '';
      imgPreview.style.display = 'block';
    }
  } else {
    if (filledBox) filledBox.style.display = 'none';
    if (emptyBox) emptyBox.style.display = 'flex';
  }

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
}`;

  // Replace old updateP3dMultiViewReadiness block
  const startIdx = src.indexOf('// C11.16-P3.15-R1: Technical View Count Policy');
  if (startIdx > 0) {
    const endIdx = src.indexOf('\nfunction selectP3dQuality(', startIdx);
    if (endIdx > 0) {
      src = src.substring(0, startIdx) + CANONICAL_GATING_AND_SYNC + '\n\n' + src.substring(endIdx + 1);
    }
  }

  // 3. Tab switching sync in setProductMediaMode
  const setMediaModeOld = `    if (secImg) secImg.style.display = 'none';\n    if (sec3d) sec3d.style.display = 'block';`;
  const setMediaModeNew = `    if (secImg) secImg.style.display = 'none';\n    if (sec3d) sec3d.style.display = 'block';\n    if (typeof syncProduct3dSourceUI === 'function') syncProduct3dSourceUI();`;
  if (src.includes(setMediaModeOld) && !src.includes('syncProduct3dSourceUI();\n\n    const p3d = window._p3dState.product3d;')) {
    src = src.replace(setMediaModeOld, setMediaModeNew);
  }

  // 4. Open Owner Product Editor: Canonical productDraft Store
  const oldDraftInit = `      // C11.16-P3.15-R1: Stable Product Draft Identity & State Model
      window.productDraft = {
        draftProductId: prod ? (prod.id || 'prod-slot-' + slot) : ('prod-draft-' + Date.now().toString(36)),
        slotIndex: slot,
        state: prod ? 'MEDIA_READY' : 'NEW_PRODUCT_DRAFT',
        primaryImage: prod?.imageUrl ? { mediaId: prod.assetId || null, url: prod.imageUrl, sourceType: 'EXISTING' } : null,
        additional3dSources: prod?.additionalSourceImages || []
      };`;

  const newDraftInit = `      // C11.16-P3.15-R2: One Canonical Product Draft Store
      const draftId = 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
      const origPinId = options.pinId || window.pendingProductCreationContext?.pinId || window.currentEditingPinId || window.currentEditingContentPin?.id || null;

      window.productDraft = {
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
        }] : [],
        fields: {
          name: prod?.name || '',
          sku: prod?.sku || '',
          category: prod?.category || '',
          price: prod?.price || '',
          availability: prod?.availability || 'ACTIVE',
          shortDescription: prod?.shortDescription || '',
          description: prod?.description || prod?.specifications || ''
        }
      };

      if (origPinId) {
        window.pendingProductCreationContext = {
          projectId: window.productDraft.projectId,
          pinId: origPinId,
          source: "PIN_CONTENT_EDITOR",
          draftId: draftId,
          pinCoords: options.pinCoords || window.lastPlacedPinCoords || null
        };
        window.pendingPinAttachment = { ...window.pendingProductCreationContext };
        window.originatingContentPinId = origPinId;
      }`;

  if (src.includes(oldDraftInit)) {
    src = src.replace(oldDraftInit, newDraftInit);
  }

  // 5. In uploadProductMedia, update productDraft.primaryMedia & product3dSources
  const oldUploadMediaSync = `        // Canonical server persistence confirmed
        window.productDraft = window.productDraft || {};
        window.productDraft.primaryImage = {
          mediaId: data.mediaId || data.assetId,
          url: data.url,
          sourceType: sourceType,
          byteSize: data.byteSize,
          mimeType: data.mimeType,
          sha256: data.sha256
        };
        window.productDraft.state = 'MEDIA_READY';`;

  const newUploadMediaSync = `        // Canonical server persistence confirmed (C11.16-P3.15-R2)
        window.productDraft = window.productDraft || {};
        const mediaObj = {
          mediaId: data.mediaId || data.assetId,
          url: data.url,
          sourceType: sourceType,
          byteSize: data.byteSize,
          mimeType: data.mimeType,
          sha256: data.sha256
        };
        window.productDraft.primaryMedia = mediaObj;
        window.productDraft.primaryImage = mediaObj; // backwards-compat
        window.productDraft.product3dSources = [{ ...mediaObj, viewLabel: 'Front View', isPrimary: true }];
        window.productDraft.state = 'MEDIA_READY';`;

  if (src.includes(oldUploadMediaSync)) {
    src = src.replace(oldUploadMediaSync, newUploadMediaSync);
  }

  // 6. In saveOwnerProduct, pass attachToPinId and handle atomic pin attachment with read-after-write
  const oldPinAttachBlock = `      // Supply persisted media URL if pre-uploaded
      if (window.productDraft.primaryImage?.url) {
        formData.append('imageUrl', window.productDraft.primaryImage.url);
        formData.append('assetId', window.productDraft.primaryImage.mediaId || '');
      } else if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('productImage', fileInput.files[0]);
      }`;

  const newPinAttachBlock = `      // Supply persisted media URL if pre-uploaded
      const draftMedia = window.productDraft.primaryMedia || window.productDraft.primaryImage;
      if (draftMedia?.url) {
        formData.append('imageUrl', draftMedia.url);
        formData.append('assetId', draftMedia.mediaId || '');
      } else if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('productImage', fileInput.files[0]);
      }

      // Pass originating pin ID for atomic server-side pin attachment
      const attachPinId = window.productDraft?.originatingPinId || window.pendingProductCreationContext?.pinId || window.pendingPinAttachment?.pinId;
      if (attachPinId) {
        formData.append('attachToPinId', attachPinId);
        const pinCoords = window.pendingProductCreationContext?.pinCoords || window.lastPlacedPinCoords;
        if (pinCoords) {
          formData.append('pinCoords', JSON.stringify(pinCoords));
        }
      }`;

  if (src.includes(oldPinAttachBlock)) {
    src = src.replace(oldPinAttachBlock, newPinAttachBlock);
  }

  // 7. In saveOwnerProduct response handling, ensure pin attachment read-after-write and modal restore
  const oldSaveSuccessHandler = `        window.productDraft.state = 'PRODUCT_CREATED';
        activeProjectData = data.project || activeProjectData;
        const prodId = data.product?.id || ('prod-slot-' + slot);

        // Save catalog memberships
        const selectedCatalogs = Array.from(document.querySelectorAll('.ope-catalog-cb:checked')).map(cb => cb.value);
        await syncProductCatalogMemberships(prodId, selectedCatalogs);

        // Attach product to originating pin if context exists
        const attachPinId = window.pendingProductCreationContext?.pinId || window.pendingPinAttachment?.pinId;
        if (attachPinId) {
          window.productDraft.state = 'PIN_ATTACHING';
          let pin = (activeProjectData.pinpoints || []).find(p => p.id === attachPinId || p.pinId === attachPinId);
          if (!pin) {
            // Upsert local stub if not found
            const coords = window.pendingProductCreationContext?.pinCoords || { u: 0.5, v: 0.5 };
            pin = { id: attachPinId, pinId: attachPinId, u: coords.u, v: coords.v, productIds: [] };
            activeProjectData.pinpoints = activeProjectData.pinpoints || [];
            activeProjectData.pinpoints.push(pin);
          }

          pin.isDraft = false;
          pin.status = 'ACTIVE';
          pin.publicVisible = true;
          if (!Array.isArray(pin.productIds)) pin.productIds = [];
          if (!pin.productIds.includes(prodId)) pin.productIds.push(prodId);
          pin.productId = pin.productIds[0];
          pin.targetId = pin.productId;
          pin.pinType = pin.productIds.length > 1 ? 'PRODUCT_GROUP_PIN' : 'PRODUCT_PIN';

          try {
            const pinRes = await fetch(\`/api/projects/\${activeProjectId}/pins/\${attachPinId}\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
              body: JSON.stringify(pin)
            });
            if (!pinRes.ok) {
              const pinErr = await pinRes.json().catch(() => ({}));
              throw new Error(pinErr.error || 'Failed to attach product to pin');
            }
          } catch(pinSaveErr) {
            console.error('[Pin Attach Error]', pinSaveErr);
            alert('Product created, but pin attach failed: ' + pinSaveErr.message);
            return; // Keep modal open
          }

          window.pendingPinAttachment = null;
          window.pendingProductCreationContext = null;
        }

        window.productDraft.state = 'COMPLETE';
        setupStudioProducts(activeProjectData);
        closeOwnerProductEditor();`;

  const newSaveSuccessHandler = `        window.productDraft.state = 'PRODUCT_CREATED';
        if (data.project) {
          window.activeProjectData = data.project;
          activeProjectData = data.project;
        }
        const prodId = data.product?.id || ('prod-slot-' + slot);

        // Save catalog memberships
        const selectedCatalogs = Array.from(document.querySelectorAll('.ope-catalog-cb:checked')).map(cb => cb.value);
        await syncProductCatalogMemberships(prodId, selectedCatalogs);

        // Attach product to originating pin if context exists
        const targetPinId = window.productDraft?.originatingPinId || window.pendingProductCreationContext?.pinId || window.pendingPinAttachment?.pinId;
        if (targetPinId) {
          window.productDraft.state = 'PIN_ATTACHING';
          let pin = (activeProjectData.pinpoints || []).find(p => p.id === targetPinId || p.pinId === targetPinId);
          if (!pin) {
            const coords = window.pendingProductCreationContext?.pinCoords || window.lastPlacedPinCoords || { u: 0.5, v: 0.5 };
            pin = { id: targetPinId, pinId: targetPinId, u: coords.u, v: coords.v, productIds: [] };
            activeProjectData.pinpoints = activeProjectData.pinpoints || [];
            activeProjectData.pinpoints.push(pin);
          }

          pin.isDraft = false;
          pin.status = 'ACTIVE';
          pin.publicVisible = true;
          if (!Array.isArray(pin.productIds)) pin.productIds = [];
          if (!pin.productIds.includes(prodId)) pin.productIds.push(prodId);
          pin.productId = pin.productIds[0];
          pin.targetId = pin.productId;
          pin.pinType = pin.productIds.length > 1 ? 'PRODUCT_GROUP_PIN' : 'PRODUCT_PIN';

          try {
            const pinRes = await fetch(\`/api/projects/\${activeProjectId}/pins/\${targetPinId}\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
              body: JSON.stringify(pin)
            });
            if (!pinRes.ok) {
              const pinErr = await pinRes.json().catch(() => ({}));
              throw new Error(pinErr.error || 'Failed to attach product to pin');
            }
            const pinData = await pinRes.json();
            if (pinData.project) {
              window.activeProjectData = pinData.project;
              activeProjectData = pinData.project;
            }
          } catch(pinSaveErr) {
            console.error('[Pin Attach Error]', pinSaveErr);
            alert('Product was created, but could not be attached to this Pin: ' + pinSaveErr.message);
            return; // DO NOT CLOSE ON FAILED ATTACH
          }
        }

        window.productDraft.state = 'COMPLETE';
        setupStudioProducts(activeProjectData);
        if (typeof renderProductCardsTray === 'function') {
          renderProductCardsTray(activeProjectData.products || []);
        }

        // Close Product Editor
        const edModal = document.getElementById('ownerProductEditorModal');
        if (edModal) edModal.style.display = 'none';

        // Reopen and update Pin Content Editor if originated from pin
        if (targetPinId) {
          window.pendingPinAttachment = null;
          window.pendingProductCreationContext = null;
          window.originatingContentPinId = null;
          openProductPinContentEditorModal(targetPinId);
        }`;

  if (src.includes(oldSaveSuccessHandler)) {
    src = src.replace(oldSaveSuccessHandler, newSaveSuccessHandler);
  }

  // 8. In _p3dExecuteGenerate, make sure imageUrl uses draft primaryMedia url
  const oldGenFetch = `      body: JSON.stringify({ qualityTier, name: prodName, imageUrl: prod?.imageUrl })`;
  const newGenFetch = `      body: JSON.stringify({ qualityTier, name: prodName, imageUrl: (window.productDraft?.primaryMedia?.url || window._p3dState?.primarySourceImageUrl || prod?.imageUrl) })`;
  if (src.includes(oldGenFetch)) {
    src = src.replace(oldGenFetch, newGenFetch);
  }

  fs.writeFileSync(filePath, src, 'utf8');
  console.log('[OK] Successfully patched:', filePath);
});

console.log('All client files successfully updated.');
