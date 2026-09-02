const fs = require('fs');
const path = require('path');

const ROOT = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const CLIENT_FILES = [
  path.join(ROOT, '_clean_deploy/client/index.html'),
  path.join(ROOT, '_railway_deploy/client/index.html'),
  path.join(ROOT, 'app_build/client/index.html')
];

const NEW_USE_CAMERA = `function useProductCameraPhoto() {
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

const NEW_VIEW_GATING = `// C11.16-P3.15-R1: Technical View Count Policy
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

  if (ctaBtn) {
    const isDev = window._p3dState?.isDev;
    ctaBtn.disabled = !isMet;
    ctaBtn.setAttribute('aria-disabled', isMet ? 'false' : 'true');
    ctaBtn.style.opacity = isMet ? '1' : '0.5';
    ctaBtn.style.cursor = isMet ? 'pointer' : 'not-allowed';

    if (!hasPrimary) {
      if (ctaText) ctaText.textContent = 'Upload or Snap Product Photo First';
      if (warn) {
        warn.style.display = 'block';
        warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload a product image to generate 3D.';
      }
    } else if (!isMet) {
      const needed = minRequired - totalCount;
      if (ctaText) ctaText.textContent = \`Add \${needed} More View\${needed > 1 ? 's' : ''} to Generate\`;
      if (warn) {
        warn.style.display = 'block';
        warn.innerHTML = \`<i class="fa-solid fa-triangle-exclamation"></i> \${needed} more view\${needed > 1 ? 's' : ''} required for \${tier} Quality 3D. Use <strong>+ Upload View</strong> or <strong>Capture View</strong> below.\`;
      }
    } else {
      if (ctaText) ctaText.textContent = isDev ? \`Generate 3D Model (QA Mode)\` : \`Generate 3D Model (\${tokenCost} Tokens)\`;
      if (warn) warn.style.display = 'none';
    }
  }
}`;

CLIENT_FILES.forEach(filePath => {
  let src = fs.readFileSync(filePath, 'utf8');

  // Replace useProductCameraPhoto
  const idxCam = src.indexOf('function useProductCameraPhoto()');
  if (idxCam > 0) {
    const endCam = src.indexOf('\n}\nfunction closeCameraModal()', idxCam);
    if (endCam > 0) {
      src = src.substring(0, idxCam) + NEW_USE_CAMERA + src.substring(endCam + 2);
      console.log(`[OK] useProductCameraPhoto replaced in ${path.basename(path.dirname(filePath))}`);
    }
  }

  // Replace updateP3dMultiViewReadiness
  const idxGate = src.indexOf('function updateP3dMultiViewReadiness()');
  if (idxGate > 0) {
    const endGate = src.indexOf('\nfunction selectP3dQuality(', idxGate);
    if (endGate > 0) {
      src = src.substring(0, idxGate) + NEW_VIEW_GATING + '\n\n' + src.substring(endGate + 1);
      console.log(`[OK] updateP3dMultiViewReadiness replaced in ${path.basename(path.dirname(filePath))}`);
    }
  }

  fs.writeFileSync(filePath, src, 'utf8');
});

console.log('Done.');
