/**
 * P3.15-R1 Comprehensive Patch Script
 * Implements:
 * 1. GET /api/build-info & window.__3DZ_BUILD_INFO__
 * 2. POST /api/projects/:id/media endpoint
 * 3. Support pre-uploaded media in POST /api/projects/:id/products
 * 4. Client unified uploadProductMedia (file + camera)
 * 5. Client previewOwnerProductImage & camera use photo
 * 6. Client product creation context preservation in pinChooserActionAddNew
 * 7. Client saveOwnerProduct canonical transaction (save + attach + read-after-write)
 * 8. Client 3D technical view count gating (STANDARD 1, HIGH 3, ULTRA 6)
 * 9. Client single routers: handleProduct3dGenerateRequest, handleProduct3dConvertRequest
 * 10. Sync across _clean_deploy, _railway_deploy, app_build
 */

const fs = require('fs');
const path = require('path');

const ROOT = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const SERVER_FILES = [
  path.join(ROOT, '_clean_deploy/server/index.js'),
  path.join(ROOT, '_railway_deploy/server/index.js'),
  path.join(ROOT, 'app_build/server/index.js')
];
const CLIENT_FILES = [
  path.join(ROOT, '_clean_deploy/client/index.html'),
  path.join(ROOT, '_railway_deploy/client/index.html'),
  path.join(ROOT, 'app_build/client/index.html')
];

const RELEASE_ID = 'C11.16-P3.15-R1';

// ── 1. PATCH SERVER ──────────────────────────────────────────
function patchServer(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // 1A. Add /api/build-info if not present
  if (!src.includes('/api/build-info')) {
    const buildInfoEndpoint = `
// ── C11.16-P3.15-R1: Runtime Build Info Endpoint ────────────────
const P315_BUILD_INFO = {
  gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '${RELEASE_ID}',
  buildTimestamp: new Date().toISOString(),
  releaseId: '${RELEASE_ID}'
};

app.get('/api/build-info', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || P315_BUILD_INFO.gitCommit,
    buildTimestamp: P315_BUILD_INFO.buildTimestamp,
    releaseId: P315_BUILD_INFO.releaseId
  });
});

`;
    // Insert after app initialization or before first app.get
    const marker = "app.use('/uploads', express.static(UPLOADS_DIR));";
    if (src.includes(marker)) {
      src = src.replace(marker, marker + '\n' + buildInfoEndpoint);
      changes++;
      console.log(`[OK] Server 1A: /api/build-info added in ${path.basename(filePath)}`);
    } else {
      console.log(`[WARN] Server 1A marker not found in ${path.basename(filePath)}`);
    }
  }

  // 1B. Add POST /api/projects/:id/media endpoint
  if (!src.includes('/api/projects/:id/media')) {
    const mediaEndpoint = `
// ── C11.16-P3.15-R1: Canonical Project Media Upload Endpoint ────
app.post(['/api/projects/:id/media', '/api/projects/:id/upload'], upload.single('image'), async (req, res) => {
  let uploadedFilePath = null;
  try {
    const token = extractAuthToken(req);
    const project = (db.read().projects || []).find(p => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!db.verifyEditAccess(project, token)) return res.status(403).json({ error: 'Cross-tenant access forbidden.' });

    let finalUrl = null;
    let byteSize = 0;
    let mimeType = 'image/jpeg';
    let sha256 = null;
    const assetId = \`ast-prod-\${uuidv4().substring(0, 8)}\`;

    if (req.file) {
      uploadedFilePath = req.file.path;
      const magic = validateImageMagicBytes(req.file.path);
      if (!magic.valid) {
        try { fs.unlinkSync(req.file.path); } catch(e) {}
        return res.status(400).json({ error: 'Security validation failed: Invalid image file magic bytes. Only genuine PNG, JPG, and WebP images are allowed.' });
      }
      const fileBuf = fs.readFileSync(req.file.path);
      sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
      byteSize = req.file.size;
      mimeType = magic.mime;
      finalUrl = \`/uploads/\${req.file.filename}\`;
    } else if (req.body && req.body.dataUrl && req.body.dataUrl.startsWith('data:image/')) {
      const matches = req.body.dataUrl.match(/^data:image\\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        byteSize = buffer.length;
        mimeType = \`image/\${matches[1]}\`;
        const filename = \`capture-\${Date.now()}-\${uuidv4().substring(0, 8)}.\${ext}\`;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        finalUrl = \`/uploads/\${filename}\`;
      }
    }

    if (!finalUrl) {
      return res.status(400).json({ error: 'No image file or dataUrl provided.' });
    }

    res.json({
      success: true,
      mediaId: assetId,
      assetId,
      url: finalUrl,
      imageUrl: finalUrl,
      byteSize,
      mimeType,
      sha256,
      sourceType: req.body?.sourceType || (req.file ? 'FILE_UPLOAD' : 'CAMERA_CAPTURE')
    });
  } catch (err) {
    if (uploadedFilePath) {
      try { fs.unlinkSync(uploadedFilePath); } catch(e) {}
    }
    res.status(500).json({ error: err.message });
  }
});

`;
    const insertBefore = "app.post('/api/projects/:id/products', upload.single('productImage'), async (req, res) => {";
    if (src.includes(insertBefore)) {
      src = src.replace(insertBefore, mediaEndpoint + insertBefore);
      changes++;
      console.log(`[OK] Server 1B: /api/projects/:id/media added in ${path.basename(filePath)}`);
    } else {
      console.log(`[WARN] Server 1B marker not found in ${path.basename(filePath)}`);
    }
  }

  // 1C. In app.post('/api/projects/:id/products', preserve req.body.imageUrl / assetId / imageMeta
  const oldProductBodyHandling = `    const prodData = { ...req.body };
    if (req.file) {`;
  const newProductBodyHandling = `    const prodData = { ...req.body };
    // C11.16-P3.15-R1: Preserve pre-uploaded media reference if provided in body
    if (req.body.imageUrl && !req.file) {
      prodData.imageUrl = req.body.imageUrl;
      prodData.assetId = req.body.assetId || \`ast-prod-\${uuidv4().substring(0, 8)}\`;
      prodData.imageMeta = req.body.imageMeta || {
        assetId: prodData.assetId,
        storageRef: req.body.imageUrl,
        createdAt: new Date().toISOString()
      };
    }
    if (req.file) {`;

  if (src.includes(oldProductBodyHandling)) {
    src = src.replace(oldProductBodyHandling, newProductBodyHandling);
    changes++;
    console.log(`[OK] Server 1C: Pre-uploaded media support added to POST /products in ${path.basename(filePath)}`);
  }

  fs.writeFileSync(filePath, src, 'utf8');
  console.log(`[DONE] Server patched: ${filePath} (${changes} changes)`);
}

// ── 2. PATCH CLIENT ──────────────────────────────────────────
function patchClient(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  let changes = 0;

  // 2A. Add window.__3DZ_BUILD_INFO__ in <head>
  if (!src.includes('window.__3DZ_BUILD_INFO__')) {
    const buildInfoScript = `  <script>window.__3DZ_BUILD_INFO__ = { gitCommit: "${RELEASE_ID}", releaseId: "${RELEASE_ID}" };</script>\n`;
    src = src.replace('<head>', '<head>\n' + buildInfoScript);
    changes++;
    console.log(`[OK] Client 2A: window.__3DZ_BUILD_INFO__ added`);
  }

  // 2B. Add Uploaded Badge and clean styling to Product Image tab action box
  const oldOpeImgBox = `<div id="opeImageUploadBox" style="background: #030712; border: 1.5px dashed rgba(56,189,248,0.35); border-radius: 12px; padding: 16px; text-align: center; position: relative;">
                <img id="opeImagePreview" src="" style="max-height: 180px; max-width: 100%; border-radius: 8px; object-fit: contain; object-position: center; display: none; margin: 0 auto 12px auto; border: 1px solid rgba(255,255,255,0.1);">`;

  const newOpeImgBox = `<div id="opeImageUploadBox" style="background: #030712; border: 1.5px dashed rgba(56,189,248,0.35); border-radius: 12px; padding: 16px; text-align: center; position: relative;">
                <div id="opeUploadedBadge" style="display: none; align-items: center; gap: 5px; background: rgba(34,197,94,0.18); color: #4ade80; border: 1px solid rgba(34,197,94,0.4); border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 800; margin: 0 auto 10px auto; width: fit-content;">
                  <i class="fa-solid fa-circle-check"></i> Image Persisted on Server
                </div>
                <img id="opeImagePreview" src="" style="max-height: 180px; max-width: 100%; border-radius: 8px; object-fit: contain !important; object-position: center !important; display: none; margin: 0 auto 12px auto; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5);">`;

  if (src.includes(oldOpeImgBox)) {
    src = src.replace(oldOpeImgBox, newOpeImgBox);
    changes++;
    console.log(`[OK] Client 2B: Uploaded badge added to opeImageUploadBox`);
  }

  // 2C. Update pinChooserActionAddNew to preserve pendingProductCreationContext
  const oldPinChooserAddNew = `    function pinChooserActionAddNew() {
      const pinId = window.currentEditingPinId;
      closePinChooserModal();
      
      const pin = (window.activeProjectData?.pinpoints || []).find(p => p.id === pinId || p.pinId === pinId);
      window.pendingPinAttachment = {
        pinId: pinId,
        coords: pin ? { u: pin.u, v: pin.v } : (window.lastPlacedPinCoords || { u: 0.5, v: 0.5 })
      };

      // Determine next product slot index
      const prods = window.activeProjectData?.products || [];
      const nextSlot = prods.length + 1;
      openOwnerProductEditor(nextSlot);
    }`;

  const newPinChooserAddNew = `    function pinChooserActionAddNew() {
      const pinId = window.currentEditingPinId;
      closePinChooserModal();
      
      const pin = (window.activeProjectData?.pinpoints || []).find(p => p.id === pinId || p.pinId === pinId);
      const coords = pin ? { u: pin.u, v: pin.v } : (window.lastPlacedPinCoords || { u: 0.5, v: 0.5 });
      
      // C11.16-P3.15-R1: Store stable pendingProductCreationContext
      window.pendingProductCreationContext = {
        projectId: activeProjectId || window.activeProjectData?.id,
        pinId: pinId,
        source: "PIN_CONTENT_EDITOR",
        pinCoords: coords
      };
      window.pendingPinAttachment = {
        projectId: activeProjectId || window.activeProjectData?.id,
        pinId: pinId,
        source: "PIN_CONTENT_EDITOR",
        action: "CREATE_NEW_PRODUCT",
        pinCoords: coords
      };
      window.originatingContentPinId = pinId;

      // Determine next product slot index
      const prods = window.activeProjectData?.products || [];
      const nextSlot = prods.length + 1;
      openOwnerProductEditor(nextSlot, { pinId, pinCoords: coords });
    }`;

  if (src.includes(oldPinChooserAddNew)) {
    src = src.replace(oldPinChooserAddNew, newPinChooserAddNew);
    changes++;
    console.log(`[OK] Client 2C: pinChooserActionAddNew context preservation fixed`);
  }

  // 2D. Update openOwnerProductEditor to initialize window.productDraft and preserve context
  const oldOpenEditorContext = `      if (options.pinId) {
        window.pendingPinAttachment = {
          projectId: activeProjectId || window.activeProjectData?.id,
          pinId: options.pinId,
          source: "PIN_CONTENT_EDITOR",
          action: "CREATE_NEW_PRODUCT",
          pinCoords: options.pinCoords || null
        };
        window.originatingContentPinId = options.pinId;
      } else if (!prod) {
        window.pendingPinAttachment = null;
      }`;

  const newOpenEditorContext = `      if (options.pinId) {
        window.pendingProductCreationContext = {
          projectId: activeProjectId || window.activeProjectData?.id,
          pinId: options.pinId,
          source: "PIN_CONTENT_EDITOR",
          pinCoords: options.pinCoords || null
        };
        window.pendingPinAttachment = { ...window.pendingProductCreationContext };
        window.originatingContentPinId = options.pinId;
      } else if (window.pendingProductCreationContext?.pinId) {
        window.pendingPinAttachment = { ...window.pendingProductCreationContext };
        window.originatingContentPinId = window.pendingProductCreationContext.pinId;
      } else if (!prod) {
        window.pendingPinAttachment = null;
        window.pendingProductCreationContext = null;
      }

      // C11.16-P3.15-R1: Stable Product Draft Identity & State Model
      window.productDraft = {
        draftProductId: prod ? (prod.id || 'prod-slot-' + slot) : ('prod-draft-' + Date.now().toString(36)),
        slotIndex: slot,
        state: prod ? 'MEDIA_READY' : 'NEW_PRODUCT_DRAFT',
        primaryImage: prod?.imageUrl ? { mediaId: prod.assetId || null, url: prod.imageUrl, sourceType: 'EXISTING' } : null,
        additional3dSources: prod?.additionalSourceImages || []
      };`;

  if (src.includes(oldOpenEditorContext)) {
    src = src.replace(oldOpenEditorContext, newOpenEditorContext);
    changes++;
    console.log(`[OK] Client 2D: openOwnerProductEditor productDraft model added`);
  }

  // 2E. Add unified uploadProductMedia and previewOwnerProductImage functions
  const oldRemoveProductImage = `    function removeOwnerProductImage() {
      const input = document.getElementById('opeImageInput');
      const preview = document.getElementById('opeImagePreview');
      const removeBtn = document.getElementById('opeBtnRemoveImg');
      if (input) input.value = '';
      if (preview) {
        preview.src = '';
        preview.style.display = 'none';
      }
      if (removeBtn) removeBtn.style.display = 'none';
    }`;

  const newMediaFunctions = `    // ═══════════════════════════════════════════════════════════
    // CANONICAL PRODUCT MEDIA UPLOAD & PERSISTENCE (C11.16-P3.15-R1)
    // Shared between File Upload and Camera Capture
    // ═══════════════════════════════════════════════════════════
    async function uploadProductMedia(fileOrBlob, sourceType = 'UPLOAD') {
      const pid = activeProjectId || window.activeProjectData?.id;
      if (!pid) throw new Error('No active project found');
      const token = getEditAuthToken();

      const preview = document.getElementById('opeImagePreview');
      const badge = document.getElementById('opeUploadedBadge');
      const removeBtn = document.getElementById('opeBtnRemoveImg');
      const uploadBtn = document.getElementById('opeBtnUploadImg');
      const takeBtn = document.getElementById('opeBtnTakePhoto');

      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
      }

      try {
        let res;
        if (fileOrBlob instanceof Blob && !(fileOrBlob instanceof File)) {
          const fd = new FormData();
          fd.append('image', fileOrBlob, 'capture_' + Date.now() + '.jpg');
          fd.append('sourceType', sourceType);
          res = await fetch(\`/api/projects/\${pid}/media\`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
            body: fd
          });
        } else {
          const fd = new FormData();
          fd.append('image', fileOrBlob);
          fd.append('sourceType', sourceType);
          res = await fetch(\`/api/projects/\${pid}/media\`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
            body: fd
          });
        }

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Server rejected media upload');
        }

        // Canonical server persistence confirmed
        window.productDraft = window.productDraft || {};
        window.productDraft.primaryImage = {
          mediaId: data.mediaId || data.assetId,
          url: data.url,
          sourceType: sourceType,
          byteSize: data.byteSize,
          mimeType: data.mimeType,
          sha256: data.sha256
        };
        window.productDraft.state = 'MEDIA_READY';

        // Update UI
        if (preview) {
          preview.src = data.url;
          preview.style.display = 'block';
          preview.style.objectFit = 'contain';
          preview.style.objectPosition = 'center';
        }
        if (badge) badge.style.display = 'inline-flex';
        if (removeBtn) removeBtn.style.display = 'inline-flex';
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Replace Image';
        }
        if (takeBtn) {
          takeBtn.innerHTML = '<i class="fa-solid fa-camera-rotate"></i> Retake Photo';
        }

        // Automatically sync to 3D Front View candidate
        if (window._p3dState) {
          window._p3dState.sourceImageUrl = data.url;
          window._p3dState.primarySourceImageUrl = data.url;
        }
        const p3dPreview = document.getElementById('p3dTabSourceImgPreview');
        const p3dFilled = document.getElementById('p3dTabSourceFilledBox');
        const p3dEmpty = document.getElementById('p3dTabSourceEmptyBox');
        if (p3dPreview) { p3dPreview.src = data.url; p3dPreview.style.display = 'block'; }
        if (p3dFilled) p3dFilled.style.display = 'block';
        if (p3dEmpty) p3dEmpty.style.display = 'none';

        if (typeof updateP3dMultiViewReadiness === 'function') updateP3dMultiViewReadiness();
        if (window.showToast) window.showToast('✅ Image uploaded and persisted to server!', 'success');
        return data;
      } catch(err) {
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Product Image';
        }
        throw err;
      }
    }
    window.uploadProductMedia = uploadProductMedia;

    function previewOwnerProductImage(input) {
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      uploadProductMedia(file, 'UPLOAD').catch(err => {
        console.error('[previewOwnerProductImage]', err);
        alert('Image upload failed: ' + err.message);
      });
    }
    window.previewOwnerProductImage = previewOwnerProductImage;

    function removeOwnerProductImage() {
      const input = document.getElementById('opeImageInput');
      const preview = document.getElementById('opeImagePreview');
      const badge = document.getElementById('opeUploadedBadge');
      const removeBtn = document.getElementById('opeBtnRemoveImg');
      const uploadBtn = document.getElementById('opeBtnUploadImg');
      const takeBtn = document.getElementById('opeBtnTakePhoto');

      if (input) input.value = '';
      if (preview) {
        preview.src = '';
        preview.style.display = 'none';
      }
      if (badge) badge.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'none';
      if (uploadBtn) uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Product Image';
      if (takeBtn) takeBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Take Photo';

      if (window.productDraft) {
        window.productDraft.primaryImage = null;
        window.productDraft.state = 'NEW_PRODUCT_DRAFT';
      }
    }
    window.removeOwnerProductImage = removeOwnerProductImage;`;

  if (src.includes(oldRemoveProductImage)) {
    src = src.replace(oldRemoveProductImage, newMediaFunctions);
    changes++;
    console.log(`[OK] Client 2E: uploadProductMedia, previewOwnerProductImage, removeOwnerProductImage added`);
  }

  // 2F. Update useProductCameraPhoto to call uploadProductMedia directly
  const oldUseCamera = `function useProductCameraPhoto() {
  var canvas = document.getElementById("camCaptureCanvas");
  if (!canvas) { closeCameraModal(); return; }
  canvas.toBlob(function(blob) {
    if (!blob) { closeCameraModal(); return; }
    var file = new File([blob], "camera_"+Date.now()+".jpg", {type:"image/jpeg"});
    var dt = new DataTransfer(); dt.items.add(file);
    var fi = document.getElementById("opeImageInput");
    if (fi) {
      Object.defineProperty(fi, "files", {value: dt.files, configurable: true});
      if (typeof previewOwnerProductImage === "function") previewOwnerProductImage(fi);
    }
    closeCameraModal();
    if (window.showToast) window.showToast("\uD83D\uDCF8 Photo captured!", "success");
  }, "image/jpeg", 0.92);
}`;

  const newUseCamera = `function useProductCameraPhoto() {
  var canvas = document.getElementById("camCaptureCanvas");
  if (!canvas) { closeCameraModal(); return; }
  canvas.toBlob(function(blob) {
    if (!blob) { closeCameraModal(); return; }
    closeCameraModal();
    uploadProductMedia(blob, 'CAMERA').catch(function(err) {
      console.error('[Camera Upload]', err);
      alert('Camera image upload failed: ' + err.message);
    });
  }, "image/jpeg", 0.92);
}`;

  if (src.includes(oldUseCamera)) {
    src = src.replace(oldUseCamera, newUseCamera);
    changes++;
    console.log(`[OK] Client 2F: useProductCameraPhoto linked to uploadProductMedia`);
  }

  // 2G. Update saveOwnerProduct canonical transaction
  const oldSaveOwnerProductFull = `    async function saveOwnerProduct(e) {
      e.preventDefault();
      if (!activeProjectId) return;

      const slot = parseInt(document.getElementById('opeSlotIndex').value, 10) || 1;
      const name = document.getElementById('opeName').value.trim();
      if (!name) {
        alert('Product Name is required.');
        return;
      }

      const sku = document.getElementById('opeSku').value.trim();
      const category = document.getElementById('opeCategory').value.trim();
      const price = document.getElementById('opePrice').value.trim();
      const availability = document.getElementById('opeAvailability').value;
      const shortDescription = document.getElementById('opeShortDesc').value.trim();
      const description = document.getElementById('opeDesc').value.trim();
      const fileInput = document.getElementById('opeImageInput');

      const formData = new FormData();
      formData.append('slotIndex', slot);
      formData.append('name', name);
      if (sku) formData.append('sku', sku);
      if (category) formData.append('category', category);
      if (price) formData.append('price', price);
      if (availability) formData.append('availability', availability);
      if (shortDescription) formData.append('shortDescription', shortDescription);
      if (description) formData.append('description', description);
      if (description) formData.append('specifications', description);

      if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('productImage', fileInput.files[0]);
      }

      const token = getEditAuthToken();
      const btnSave = document.getElementById('opeBtnSave');
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        const res = await fetch(\`/api/projects/\${activeProjectId}/products\`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: formData
        });

        const data = await res.json();
        if (res.ok && data.success) {
          activeProjectData = data.project || activeProjectData;
          
          // Save catalog memberships
          const selectedCatalogs = Array.from(document.querySelectorAll('.ope-catalog-cb:checked')).map(cb => cb.value);
          const prodId = data.product?.id || \`prod-slot-\${slot}\`;
          await syncProductCatalogMemberships(prodId, selectedCatalogs);

          // Attach product to pending pin if creating from blank pin (C11.16-P3.10)
          if (window.pendingPinAttachment && window.pendingPinAttachment.pinId) {
            const pinId = window.pendingPinAttachment.pinId;
            const pin = (activeProjectData.pinpoints || []).find(p => p.id === pinId || p.pinId === pinId);
            if (pin) {
              pin.isDraft = false;
              pin.status = 'ACTIVE';
              pin.publicVisible = true;
              if (!Array.isArray(pin.productIds)) pin.productIds = [];
              if (!pin.productIds.includes(prodId)) pin.productIds.push(prodId);
              pin.productId = pin.productIds[0];
              pin.targetId = pin.productId;
              pin.pinType = pin.productIds.length > 1 ? 'PRODUCT_GROUP_PIN' : 'PRODUCT_PIN';

              try {
                await fetch(\`/api/projects/\${activeProjectId}/pins/\${pinId}\`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
                  body: JSON.stringify(pin)
                });
              } catch(e) {}
            }
            window.pendingPinAttachment = null;
          }
  

          setupStudioProducts(activeProjectData);
          closeOwnerProductEditor();
        } else {
          if (res.status === 403 && (data.code === 'PRODUCT_LIMIT_EXCEEDED' || data.code === 'ENTITLEMENT_REQUIRED')) {
            openPlanModal('product_limit_exceeded');
          } else {
            alert(data.error || data.message || 'Failed to save product.');
          }
        }
      } catch (err) {
        alert('Network error while saving product: ' + err.message);
      } finally {
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.innerHTML = '<i class="fa-solid fa-check"></i> Save Product';
        }
      }
    }`;

  const newSaveOwnerProductFull = `    async function saveOwnerProduct(e) {
      e.preventDefault();
      if (!activeProjectId) return;

      const slot = parseInt(document.getElementById('opeSlotIndex').value, 10) || 1;
      const name = document.getElementById('opeName').value.trim();
      if (!name) {
        alert('Product Name is required.');
        return;
      }

      const sku = document.getElementById('opeSku').value.trim();
      const category = document.getElementById('opeCategory').value.trim();
      const price = document.getElementById('opePrice').value.trim();
      const availability = document.getElementById('opeAvailability').value;
      const shortDescription = document.getElementById('opeShortDesc').value.trim();
      const description = document.getElementById('opeDesc').value.trim();
      const fileInput = document.getElementById('opeImageInput');

      window.productDraft = window.productDraft || {};
      window.productDraft.state = 'PRODUCT_SAVING';

      const formData = new FormData();
      formData.append('slotIndex', slot);
      formData.append('name', name);
      if (sku) formData.append('sku', sku);
      if (category) formData.append('category', category);
      if (price) formData.append('price', price);
      if (availability) formData.append('availability', availability);
      if (shortDescription) formData.append('shortDescription', shortDescription);
      if (description) formData.append('description', description);
      if (description) formData.append('specifications', description);

      // Supply persisted media URL if pre-uploaded
      if (window.productDraft.primaryImage?.url) {
        formData.append('imageUrl', window.productDraft.primaryImage.url);
        formData.append('assetId', window.productDraft.primaryImage.mediaId || '');
      } else if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('productImage', fileInput.files[0]);
      }

      const token = getEditAuthToken();
      const btnSave = document.getElementById('opeBtnSave');
      if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      try {
        const res = await fetch(\`/api/projects/\${activeProjectId}/products\`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'x-booth-edit-token': token },
          body: formData
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          if (res.status === 403 && (data.code === 'PRODUCT_LIMIT_EXCEEDED' || data.code === 'ENTITLEMENT_REQUIRED')) {
            openPlanModal('product_limit_exceeded');
          } else {
            alert(data.error || data.message || 'Failed to save product.');
          }
          return; // DO NOT CLOSE ON FAILED SAVE
        }

        window.productDraft.state = 'PRODUCT_CREATED';
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
        closeOwnerProductEditor();
        if (window.showToast) window.showToast('✅ Product saved and attached to Pin!', 'success');
      } catch (err) {
        alert('Network error while saving product: ' + err.message);
      } finally {
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.innerHTML = '<i class="fa-solid fa-check"></i> Save Product';
        }
      }
    }`;

  if (src.includes(oldSaveOwnerProductFull)) {
    src = src.replace(oldSaveOwnerProductFull, newSaveOwnerProductFull);
    changes++;
    console.log(`[OK] Client 2G: saveOwnerProduct canonical transaction updated`);
  }

  // 2H. Update view gating policy and single router architecture for 3D Generate
  const oldUpdateP3dMultiViewReadiness = `function updateP3dMultiViewReadiness() {
  const tier = window._p3dState?.currentQuality || 'HIGH';
  const minRequired = tier === 'STANDARD' ? 1 : (tier === 'ULTRA' ? 6 : 3);
  const tokenCost = tier === 'STANDARD' ? 1 : (tier === 'ULTRA' ? 6 : 3);
  
  const hasPrimary = Boolean(window._p3dState?.sourceImageUrl || document.getElementById('p3dTabSourceImgPreview')?.src);
  const addlCount = (window._p3dState?.additionalSourceImages || []).length;
  const totalCount = (hasPrimary ? 1 : 0) + addlCount;

  const badge = document.getElementById('p3dMultiViewReadinessBadge');
  const costEl = document.getElementById('p3dLiveCostSummary');
  const ctaBtn = document.getElementById('p3dMainCtaBtn');
  const ctaText = document.getElementById('p3dMainCtaText');

  if (badge) {
    const isMet = totalCount >= minRequired;
    badge.innerHTML = isMet 
      ? \`<i class="fa-solid fa-check"></i> \${totalCount} / \${minRequired} views ready\` 
      : \`\${totalCount} / \${minRequired} views ready (Need \${minRequired - totalCount} more)\`;
    badge.style.color = isMet ? '#4ade80' : '#fbbf24';
    badge.style.background = isMet ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)';
  }

  if (costEl) {
    const isDev = window._p3dState?.isDev;
    costEl.textContent = isDev 
      ? \`\${tier} · \${tokenCost} Nominal Tokens (QA Mode · Charge: 0)\`
      : \`\${tier} · \${tokenCost} Tokens\`;
  }

  if (ctaBtn && ctaText) {
    const isDev = window._p3dState?.isDev;
    const canGenerate = (totalCount >= minRequired || isDev) && hasPrimary;
    ctaBtn.disabled = !canGenerate;
    ctaBtn.style.opacity = canGenerate ? '1' : '0.5';
    if (!hasPrimary) {
      ctaText.textContent = 'Upload or Snap Product Photo First';
    } else if (totalCount < minRequired && !isDev) {
      ctaText.textContent = \`Add \${minRequired - totalCount} More Views to Generate (\${tier})\`;
    } else {
      ctaText.textContent = \`Generate 3D Model (\${tokenCost} Tokens)\`;
    }
  }
}`;

  const newUpdateP3dMultiViewReadiness = `// C11.16-P3.15-R1: Technical View Count Policy
const PRODUCT_3D_MIN_VIEWS_STANDARD = 1;
const PRODUCT_3D_MIN_VIEWS_HIGH = 3;
const PRODUCT_3D_MIN_VIEWS_ULTRA = 6;

function updateP3dMultiViewReadiness() {
  const tier = window._p3dState?.currentQuality || 'HIGH';
  const minRequired = tier === 'STANDARD' ? PRODUCT_3D_MIN_VIEWS_STANDARD : (tier === 'ULTRA' ? PRODUCT_3D_MIN_VIEWS_ULTRA : PRODUCT_3D_MIN_VIEWS_HIGH);
  const tokenCost = tier === 'STANDARD' ? 1 : (tier === 'ULTRA' ? 6 : 3);
  
  const hasPrimary = Boolean(
    window.productDraft?.primaryImage?.url ||
    window._p3dState?.sourceImageUrl ||
    window._p3dState?.primarySourceImageUrl ||
    document.getElementById('p3dTabSourceImgPreview')?.src
  );
  const addlCount = (window._p3dState?.additionalSourceImages || []).length;
  const totalCount = (hasPrimary ? 1 : 0) + addlCount;

  const badge = document.getElementById('p3dMultiViewReadinessBadge');
  const costEl = document.getElementById('p3dLiveCostSummary');
  const ctaBtn = document.getElementById('p3dMainCtaBtn');
  const ctaText = document.getElementById('p3dMainCtaText');
  const warn = document.getElementById('p3dWarningBanner');

  const isMet = (totalCount >= minRequired) && hasPrimary;

  if (badge) {
    badge.innerHTML = isMet 
      ? \`<i class="fa-solid fa-check"></i> \${totalCount} / \${minRequired} views ready\` 
      : \`\${totalCount} / \${minRequired} views ready (Need \${Math.max(1, minRequired - totalCount)} more)\`;
    badge.style.color = isMet ? '#4ade80' : '#fbbf24';
    badge.style.background = isMet ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)';
  }

  if (costEl) {
    const isDev = window._p3dState?.isDev;
    costEl.textContent = isDev 
      ? \`\${tier} · \${tokenCost} Nominal Tokens (QA Mode · Charge: 0)\`
      : \`\${tier} · \${tokenCost} Tokens\`;
  }

  if (ctaBtn && ctaText) {
    const isDev = window._p3dState?.isDev;
    ctaBtn.disabled = !isMet;
    ctaBtn.setAttribute('aria-disabled', isMet ? 'false' : 'true');
    ctaBtn.style.opacity = isMet ? '1' : '0.5';
    ctaBtn.style.cursor = isMet ? 'pointer' : 'not-allowed';

    if (!hasPrimary) {
      ctaText.textContent = 'Upload or Snap Product Photo First';
      if (warn) {
        warn.style.display = 'block';
        warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload a product image to generate 3D.';
      }
    } else if (!isMet) {
      const needed = minRequired - totalCount;
      ctaText.textContent = \`Add \${needed} More View\${needed > 1 ? 's' : ''} to Generate\`;
      if (warn) {
        warn.style.display = 'block';
        warn.innerHTML = \`<i class="fa-solid fa-triangle-exclamation"></i> \${needed} more view\${needed > 1 ? 's' : ''} required for \${tier} Quality 3D. Use <strong>+ Upload View</strong> or <strong>Capture View</strong> below.\`;
      }
    } else {
      ctaText.textContent = isDev ? \`Generate 3D Model (QA Mode)\` : \`Generate 3D Model (\${tokenCost} Tokens)\`;
      if (warn) warn.style.display = 'none';
    }
  }
}`;

  if (src.includes(oldUpdateP3dMultiViewReadiness)) {
    src = src.replace(oldUpdateP3dMultiViewReadiness, newUpdateP3dMultiViewReadiness);
    changes++;
    console.log(`[OK] Client 2H: updateP3dMultiViewReadiness view gating updated`);
  }

  // 2I. Remove the overriding block in renderProduct3dSection (lines 10480-10486)
  const oldCtaOverride = `    const ctaBtn = document.getElementById('p3dMainCtaBtn');
    if (ctaBtn) {
      ctaBtn.disabled = !hasImage;
      ctaBtn.style.opacity = hasImage ? '1' : '0.6';
      ctaBtn.style.cursor = hasImage ? 'pointer' : 'not-allowed';
      ctaBtn.innerHTML = '<i class="fa-solid fa-cube"></i> <span>Generate 3D Model</span>';
    }`;

  const newCtaOverride = `    // C11.16-P3.15-R1: Delegated to updateP3dMultiViewReadiness for deterministic gating
    updateP3dMultiViewReadiness();`;

  if (src.includes(oldCtaOverride)) {
    src = src.replace(oldCtaOverride, newCtaOverride);
    changes++;
    console.log(`[OK] Client 2I: ctaBtn overriding block neutralized`);
  }

  // 2J. Canonical Single Router for Generate and Convert
  const oldRouterBlock = `// ── Primary Action Click Router ───────────────────────────────
function handleP3dMainCtaClick() {
  if (window._p3dState.isSubmitting) return;
  const p3d = window._p3dState.product3d;
  const status = p3d?.status || 'NOT_GENERATED';
  const isReady = (status === 'READY' || status === 'NEEDS_REVIEW') && !!(p3d?.glbUrl);
  
  if (isReady) {
    product3dOpenViewer();
  } else {
    product3dGenerate();
  }
}`;

  const newRouterBlock = `// ── C11.16-P3.15-R1: Single Canonical Generate Router (P3D_GENERATE_ROUTER_COUNT = 1) ──
function handleProduct3dGenerateRequest() {
  if (window._p3dState.isSubmitting) return;
  const p3d = window._p3dState.product3d;
  const status = p3d?.status || 'NOT_GENERATED';
  const isReady = (status === 'READY' || status === 'NEEDS_REVIEW') && !!(p3d?.glbUrl);
  
  if (isReady) {
    product3dOpenViewer();
    return;
  }

  // Check technical view gating before opening confirm modal
  const tier = window._p3dState?.currentQuality || 'HIGH';
  const minRequired = tier === 'STANDARD' ? PRODUCT_3D_MIN_VIEWS_STANDARD : (tier === 'ULTRA' ? PRODUCT_3D_MIN_VIEWS_ULTRA : PRODUCT_3D_MIN_VIEWS_HIGH);
  const hasPrimary = Boolean(
    window.productDraft?.primaryImage?.url ||
    window._p3dState?.sourceImageUrl ||
    window._p3dState?.primarySourceImageUrl ||
    document.getElementById('p3dTabSourceImgPreview')?.src
  );
  const addlCount = (window._p3dState?.additionalSourceImages || []).length;
  const totalCount = (hasPrimary ? 1 : 0) + addlCount;

  if (!hasPrimary) {
    alert('Please upload or snap a product photo first.');
    return;
  }
  if (totalCount < minRequired) {
    alert(\`\${minRequired - totalCount} more view(s) required for \${tier} Quality 3D. Please add views before generating.\`);
    return;
  }

  product3dGenerate();
}
window.handleProduct3dGenerateRequest = handleProduct3dGenerateRequest;
window.handleP3dMainCtaClick = handleProduct3dGenerateRequest;

// ── C11.16-P3.15-R1: Single Canonical Convert Router (P3D_CONVERT_ROUTER_COUNT = 1) ──
async function handleProduct3dConvertRequest() {
  await p3dConfirmExecute();
}
window.handleProduct3dConvertRequest = handleProduct3dConvertRequest;`;

  if (src.includes(oldRouterBlock)) {
    src = src.replace(oldRouterBlock, newRouterBlock);
    changes++;
    console.log(`[OK] Client 2J: Single canonical generate & convert routers registered`);
  }

  fs.writeFileSync(filePath, src, 'utf8');
  console.log(`[DONE] Client patched: ${filePath} (${changes} changes)`);
}

// ── RUN PATCH ────────────────────────────────────────────────
console.log('=== EXECUTING P3.15-R1 CODE PATCHES ===\n');

SERVER_FILES.forEach(patchServer);
CLIENT_FILES.forEach(patchClient);

console.log('\n=== VALIDATING DIV & FORM INTEGRITY ===');
CLIENT_FILES.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  const od = (c.match(/<div[\s>]/g)||[]).length;
  const cd = (c.match(/<\/div>/g)||[]).length;
  const of = (c.match(/<form[\s>]/g)||[]).length;
  const cf = (c.match(/<\/form>/g)||[]).length;
  console.log(path.basename(path.dirname(f)) + ' divs:', od, '/', cd, od === cd ? '✅' : '❌ MISMATCH');
  console.log(path.basename(path.dirname(f)) + ' forms:', of, '/', cf, of === cf ? '✅' : '❌ MISMATCH');
});

console.log('\n=== COMPLETED PATCHES ===');
