const fs = require('fs');
const path = require('path');

const targetFiles = [
  'virtual-tradeshow-commercial-v1/client/index.html',
  'virtual-tradeshow-commercial-v1/index.html',
  'virtual-tradeshow-commercial-v1/app_build/client/index.html',
  'virtual-tradeshow-commercial-v1/app_build/index.html',
  'virtual-tradeshow-commercial-v1/_railway_deploy/client/index.html',
  'virtual-tradeshow-commercial-v1/_railway_deploy/index.html',
  'virtual-tradeshow-commercial-v1/_clean_deploy/client/index.html',
  'virtual-tradeshow-commercial-v1/_clean_deploy/index.html'
];

let content = fs.readFileSync('virtual-tradeshow-commercial-v1/client/index.html', 'utf8');

// 1. Replace inline min-height: 520px on #viewer-container
const oldViewerContainerHtml = '<div id="viewer-container" style="position: relative; width: 100%; height: 100%; min-height: 520px; overflow: hidden; background: #000; border-radius: 12px;">';
const newViewerContainerHtml = '<div id="viewer-container" style="position: relative; width: 100%; height: auto; aspect-ratio: 16 / 9; max-width: 100%; max-height: 80vh; overflow: hidden; background: #000; border-radius: 12px; box-sizing: border-box;">';

if (content.includes(oldViewerContainerHtml)) {
  content = content.replace(oldViewerContainerHtml, newViewerContainerHtml);
  console.log('1. Replaced oldViewerContainerHtml successfully.');
} else {
  console.warn('1. oldViewerContainerHtml string not found directly, checking regex...');
  const rgx = /<div id="viewer-container"[^>]*min-height:\s*520px[^>]*>/;
  if (rgx.test(content)) {
    content = content.replace(rgx, newViewerContainerHtml);
    console.log('1. Replaced #viewer-container via regex.');
  }
}

// 2. Add responsive CSS rule for #viewer-container in style block
const styleMarker = '<style id="spatial-booth-c11-17-p1-styles">';
const responsiveCss = `<style id="spatial-booth-c11-17-p1-styles">
  /* Round 123 P0 Responsive Viewer Container Bounds */
  #viewer-container {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    box-sizing: border-box;
    overflow: hidden;
    background: #000;
    border-radius: 12px;
  }
  @media (max-width: 900px), (orientation: landscape) and (max-height: 600px) {
    #viewer-container {
      min-height: unset !important;
      max-height: min(85vh, calc(100vh - 40px)) !important;
      max-width: 100% !important;
      width: min(100%, calc((100vh - 40px) * 16 / 9)) !important;
      margin: 0 auto !important;
    }
  }`;

if (content.includes(styleMarker) && !content.includes('Round 123 P0 Responsive Viewer Container Bounds')) {
  content = content.replace(styleMarker, responsiveCss);
  console.log('2. Added responsive CSS rule for #viewer-container.');
}

// 3. Patch window.setupViewerLandscapeSupport
const oldSetupFunc = `    window.setupViewerLandscapeSupport = function(container, canvas, viewerInstance, surfaceName = 'VIEWER') {
      if (!container) return;
      const isMobile = (typeof window !== 'undefined') && (
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (window.innerWidth < 850)
      );

      // Enforce wide 16:9 landscape aspect ratio
      container.style.aspectRatio = '16 / 9';
      container.style.width = '100%';
      container.style.height = 'auto';
      container.style.maxHeight = '80vh';`;

const newSetupFunc = `    window.setupViewerLandscapeSupport = function(container, canvas, viewerInstance, surfaceName = 'VIEWER') {
      if (!container) return;
      const isMobile = (typeof window !== 'undefined') && (
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (window.innerWidth < 850)
      );

      // Enforce wide 16:9 landscape aspect ratio and strict responsive containment
      container.style.aspectRatio = '16 / 9';
      container.style.minHeight = 'unset';
      container.style.maxWidth = '100%';
      container.style.boxSizing = 'border-box';`;

if (content.includes(oldSetupFunc)) {
  content = content.replace(oldSetupFunc, newSetupFunc);
  console.log('3. Patched setupViewerLandscapeSupport declaration.');
}

// 4. Patch checkOrientation in setupViewerLandscapeSupport to dynamically adapt dimensions
const oldCheckOrient = `      const checkOrientation = () => {
        const isLandscape = window.innerWidth > window.innerHeight;
        if (promptEl) promptEl.style.display = isLandscape ? 'none' : 'flex';
        if (viewerInstance && typeof viewerInstance.handleResize === 'function') {
          viewerInstance.handleResize();
        }
      };`;

const newCheckOrient = `      const checkOrientation = () => {
        const isLandscape = window.innerWidth > window.innerHeight;
        if (promptEl) promptEl.style.display = isLandscape ? 'none' : 'flex';
        if (isLandscape && (isMobile || window.innerHeight < 600)) {
          container.style.minHeight = 'unset';
          container.style.maxHeight = 'min(85vh, calc(100vh - 40px))';
          container.style.height = 'auto';
          container.style.width = 'min(100%, calc((100vh - 40px) * 16 / 9))';
          container.style.margin = '0 auto';
        } else {
          container.style.minHeight = 'unset';
          container.style.maxHeight = '80vh';
          container.style.height = 'auto';
          container.style.width = '100%';
          container.style.margin = '0 auto';
        }
        if (viewerInstance && typeof viewerInstance.handleResize === 'function') {
          viewerInstance.handleResize();
        }
      };
      checkOrientation();`;

if (content.includes(oldCheckOrient)) {
  content = content.replace(oldCheckOrient, newCheckOrient);
  console.log('4. Patched checkOrientation in setupViewerLandscapeSupport.');
}

// 5. Write back to primary file and synchronize across all 7 targets
fs.writeFileSync('virtual-tradeshow-commercial-v1/client/index.html', content, 'utf8');
console.log('Saved virtual-tradeshow-commercial-v1/client/index.html');

for (const f of targetFiles.slice(1)) {
  fs.writeFileSync(f, content, 'utf8');
  console.log('Synchronized:', f);
}
console.log('All 8 target files updated and synchronized successfully!');
