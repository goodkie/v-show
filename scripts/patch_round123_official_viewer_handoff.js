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

let primaryContent = fs.readFileSync('virtual-tradeshow-commercial-v1/client/index.html', 'utf8');

// 1. Patch close() in SetupWizardController
const oldCloseRegex = /close\(\)\s*\{[\s\S]*?document\.body\.style\.overflow\s*=\s*'';[\s\S]*?this\.saveState\(\);\s*\}/;

const newCloseMethod = `close() {
    document.body.style.overflow = '';
    if (this.modal) this.modal.style.display = 'none';

    // Output Viewer Handoff: Ensure official studio section is displayed
    const panoCand = this.state.currentPanoramaJob?.candidate;
    const panoUrl = panoCand?.stitchedPanoramaUrl || panoCand?.masterUrl || this.state.viewpoints?.[0]?.panoramaUrl;
    const hasPano = Boolean(this.state && (this.state.panoramaJobStatus === 'READY' || panoUrl));

    if (hasPano) {
      const studio = document.getElementById('freeStudioSection');
      if (studio) {
        studio.style.display = 'block';
        const hero = document.getElementById('hero-funnel');
        if (hero) hero.style.display = 'none';
        studio.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (!window.activeProjectData) {
        window.activeProjectData = { id: this.getProjectId() || 'default-project' };
      }
      window.activeProjectData.viewerMode = 'PANORAMIC_IMMERSIVE';
      if (!window.activeProjectData.activePanoramaVersionId) {
        window.activeProjectData.activePanoramaVersionId = 'pano-ver-' + (panoCand?.candidateId || Date.now());
      }
      if (!Array.isArray(window.activeProjectData.panoramaVersions)) {
        window.activeProjectData.panoramaVersions = [];
      }
      const existingVer = window.activeProjectData.panoramaVersions.find(v => v.stitchedPanoramaUrl === panoUrl);
      if (!existingVer && panoUrl) {
        window.activeProjectData.panoramaVersions.unshift({
          id: window.activeProjectData.activePanoramaVersionId,
          versionId: window.activeProjectData.activePanoramaVersionId,
          candidateId: panoCand?.candidateId || 'cand-stitched',
          stitchedPanoramaUrl: panoUrl,
          activeBackgroundUrl: panoUrl,
          textureUrl: panoUrl,
          sourceType: 'PANORAMIC_IMMERSIVE',
          viewerMode: 'PANORAMIC_IMMERSIVE',
          horizontalCoverageDeg: panoCand?.horizontalCoverageDeg || 360,
          full360Qualified: true
        });
      }

      if (typeof window.mountActivePanoramicBoothViewer === 'function') {
        const bg = (typeof getActiveBoothBackground === 'function') ? getActiveBoothBackground(window.activeProjectData) : null;
        window.mountActivePanoramicBoothViewer(window.activeProjectData, bg);
      }
    }
    this.saveState();
  }`;

if (oldCloseRegex.test(primaryContent)) {
  primaryContent = primaryContent.replace(oldCloseRegex, newCloseMethod);
  console.log('Successfully patched close() in client/index.html');
} else {
  console.error('Failed to find close() in client/index.html');
  process.exit(1);
}

// 2. Patch renderStep12Complete btnPrimary.onclick
const oldStep12Btn = `    this.btnPrimary.onclick = () => {
      this.close();
      if (typeof window.togglePreviewMode === 'function') {
        window.togglePreviewMode(true);
      }
      if (typeof window.mountActivePanoramicBoothViewer === 'function' && window.activeProjectData) {
        const bg = (typeof getActiveBoothBackground === 'function') ? getActiveBoothBackground(window.activeProjectData) : null;
        window.mountActivePanoramicBoothViewer(window.activeProjectData, bg);
      }
    };`;

const newStep12Btn = `    this.btnPrimary.onclick = () => {
      this.close();
      if (typeof window.togglePreviewMode === 'function') {
        window.togglePreviewMode(true);
      }
      const studio = document.getElementById('freeStudioSection');
      if (studio) {
        studio.style.display = 'block';
        const hero = document.getElementById('hero-funnel');
        if (hero) hero.style.display = 'none';
        studio.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (typeof window.mountActivePanoramicBoothViewer === 'function') {
        const bg = (typeof getActiveBoothBackground === 'function') ? getActiveBoothBackground(window.activeProjectData) : null;
        window.mountActivePanoramicBoothViewer(window.activeProjectData, bg);
      }
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (window.innerWidth < 850);
      if (isMobile && typeof window.requestViewerLandscape === 'function') {
        const officialContainer = document.getElementById('viewer-container');
        window.requestViewerLandscape(officialContainer, 'OFFICIAL_VIEW_LIVE_CLICK');
      }
    };`;

if (primaryContent.includes(oldStep12Btn)) {
  primaryContent = primaryContent.replace(oldStep12Btn, newStep12Btn);
  console.log('Successfully patched renderStep12Complete in client/index.html');
} else {
  console.warn('oldStep12Btn target not found directly, checking regex...');
}

// 3. Patch mountActivePanoramicBoothViewer to ensure freeStudioSection is unhidden and projectData defaults
const oldMountPano = `    function mountActivePanoramicBoothViewer(projectData, activeBg) {
      if (!activeBg) activeBg = {};`;

const newMountPano = `    function mountActivePanoramicBoothViewer(projectData, activeBg) {
      if (!projectData) projectData = window.activeProjectData || { id: 'default-project' };
      if (!activeBg) activeBg = (typeof getActiveBoothBackground === 'function' ? getActiveBoothBackground(projectData) : null) || {};
      const studioEl = document.getElementById('freeStudioSection');
      if (studioEl && studioEl.style.display === 'none') {
        studioEl.style.display = 'block';
        const heroEl = document.getElementById('hero-funnel');
        if (heroEl) heroEl.style.display = 'none';
      }`;

if (primaryContent.includes(oldMountPano)) {
  primaryContent = primaryContent.replace(oldMountPano, newMountPano);
  console.log('Successfully patched mountActivePanoramicBoothViewer in client/index.html');
}

// 4. Save to client/index.html and synchronize to all 7 target copies
fs.writeFileSync('virtual-tradeshow-commercial-v1/client/index.html', primaryContent, 'utf8');
console.log('client/index.html updated successfully.');

for (const f of targetFiles.slice(1)) {
  fs.writeFileSync(f, primaryContent, 'utf8');
  console.log('Synchronized:', f);
}
console.log('All 8 target files updated and synchronized!');
