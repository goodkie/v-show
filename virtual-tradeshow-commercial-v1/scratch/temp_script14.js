
// ── C12.0-P0: MULTI-POINT 360 TOUR CONTROLLER ──
const MAXIMUM_PHOTOS_PER_VIEWPOINT = 8;

class MultiPointTourController {
  constructor(options = {}) {
    this.projectId = options.projectId || (window.activeProjectData && window.activeProjectData.id);
    this.tour = options.tour || null;
    this.activeViewpointId = null;
    this.hotspotsContainer = document.getElementById('panoramaNavHotspotsContainer');
    this.mapContainer = document.getElementById('tourBoothMapContainer');
    this.mapSvg = document.getElementById('tourBoothMapSvg');
    this.mobileMapSvg = document.getElementById('mobileBoothMapSvg');
    this.activeLabel = document.getElementById('tourActiveViewpointLabel');
    this.latencyBadge = document.getElementById('tourNavLatencyBadge');
    this.countBadge = document.getElementById('tourViewpointCountBadge');
    
    this.navLatencies = {};
    this.isTransitioning = false;
    this.initialized = false;
  }

  async init() {
    if (!this.projectId) return;
    try {
      if (!this.tour || !this.tour.viewpoints || !this.tour.viewpoints.length) {
        const res = await fetch('/api/projects/' + this.projectId + '/tour');
        if (res.ok) {
          const data = await res.json();
          if (data.tour) {
            this.tour = data.tour;
            this.tour.viewpoints = data.viewpoints || [];
            this.tour.connections = data.connections || [];
          }
        }
      }
      if (this.tour && Array.isArray(this.tour.viewpoints) && this.tour.viewpoints.length > 0) {
        this.activeViewpointId = this.tour.activeViewpointId || this.tour.viewpoints[0].id;
        this.initialized = true;
        this.showUI(true);
        this.renderBoothMap();
        this.renderHotspots();
      }
    } catch (err) {
      console.warn('[MultiPointTourController] Init error:', err);
    }
  }

  showUI(show = true) {
    if (this.mapContainer) this.mapContainer.style.display = show ? 'block' : 'none';
    const mobileBtn = document.getElementById('btnToggleMobileMap');
    if (mobileBtn) mobileBtn.style.display = show ? 'flex' : 'none';
  }

  getActiveViewpoint() {
    if (!this.tour || !this.tour.viewpoints) return null;
    return this.tour.viewpoints.find(v => v.id === this.activeViewpointId) || this.tour.viewpoints[0];
  }

  getConnectedViewpoints() {
    if (!this.tour || !this.tour.connections) return [];
    const activeId = this.activeViewpointId;
    const conns = this.tour.connections.filter(c => c.fromViewpointId === activeId || (c.isBidirectional && c.toViewpointId === activeId));
    
    return conns.map(c => {
      const targetId = (c.fromViewpointId === activeId) ? c.toViewpointId : c.fromViewpointId;
      const targetVp = this.tour.viewpoints.find(v => v.id === targetId);
      return {
        connection: c,
        targetViewpoint: targetVp
      };
    }).filter(item => Boolean(item.targetViewpoint));
  }

  async navigateToViewpoint(targetViewpointId) {
    if (this.isTransitioning || targetViewpointId === this.activeViewpointId) return;
    const targetVp = this.tour.viewpoints.find(v => v.id === targetViewpointId);
    if (!targetVp) return;

    this.isTransitioning = true;
    const startTime = performance.now();
    const prevVp = this.getActiveViewpoint();

    const viewer = window.activeSpatialBoothRenderer || window.activeSpatialPreviewRenderer;
    const canvas = viewer ? viewer.canvas : document.getElementById('three-canvas');
    if (canvas) {
      canvas.style.transition = 'opacity 180ms ease';
      canvas.style.opacity = '0.15';
    }

    await new Promise(r => setTimeout(r, 180));

    this.activeViewpointId = targetViewpointId;
    this.tour.activeViewpointId = targetViewpointId;

    const panoUrl = targetVp.panoramaUrl || (targetVp.panorama && targetVp.panorama.url);
    return new Promise((resolve) => {
      const finish = () => {
        this.onTextureRendered(startTime, prevVp, targetVp, canvas, viewer);
        resolve();
      };
      if (viewer && panoUrl) {
        if (typeof viewer.loadPanoramaUrl === 'function') {
          viewer.loadPanoramaUrl(panoUrl, finish);
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (viewer.photoMaterial) {
              const tex = new THREE.Texture(img);
              tex.encoding = THREE.sRGBEncoding;
              tex.generateMipmaps = true;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.needsUpdate = true;
              viewer.photoMaterial.map = tex;
              viewer.photoMaterial.needsUpdate = true;
              viewer.render();
            }
            finish();
          };
          img.src = panoUrl;
        }
      } else {
        finish();
      }
    });
  }

  onTextureRendered(startTime, prevVp, targetVp, canvas, viewer) {
    if (canvas) {
      canvas.style.transition = 'opacity 300ms ease';
      canvas.style.opacity = '1.0';
    }

    const latency = Math.round(performance.now() - startTime);
    const metricKey = 'NAV_' + (prevVp ? prevVp.name.toUpperCase().replace(/\s+/g, '_') : 'START') + 
                      '_TO_' + targetVp.name.toUpperCase().replace(/\s+/g, '_') + '_CLICK_TO_FIRST_RENDER_MS';
    this.navLatencies[metricKey] = latency;

    if (this.latencyBadge) {
      this.latencyBadge.textContent = latency + 'ms';
    }
    if (this.activeLabel) {
      this.activeLabel.textContent = targetVp.name;
    }

    this.renderBoothMap();
    this.renderHotspots();

    this.isTransitioning = false;
  }

  renderHotspots() {
    if (!this.hotspotsContainer) return;
    this.hotspotsContainer.innerHTML = '';

    const currentVp = this.getActiveViewpoint();
    if (!currentVp) return;

    const connections = this.getConnectedViewpoints();
    connections.forEach(item => {
      const target = item.targetViewpoint;
      const el = document.createElement('div');
      el.className = 'streetview-nav-hotspot';
      el.id = 'navHotspot_' + target.id;
      el.dataset.targetId = target.id;

      const dx = (target.x != null ? target.x : 50) - (currentVp.x != null ? currentVp.x : 50);
      const dy = (target.y != null ? target.y : 50) - (currentVp.y != null ? currentVp.y : 50);
      const angleRad = Math.atan2(dx, -dy);
      el.dataset.angleRad = angleRad;

      el.innerHTML = `
        <div class="streetview-chevron-label">
          <i class="fa-solid fa-person-walking"></i> Step to ${target.name}
        </div>
        <div class="streetview-chevron-disc">
          <div class="streetview-chevron-arrows">
            <svg width="22" height="12" viewBox="0 0 24 14" fill="none">
              <path d="M2 12L12 2L22 12" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg width="18" height="10" viewBox="0 0 24 14" fill="none">
              <path d="M2 12L12 2L22 12" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      `;

      el.onclick = (e) => {
        e.stopPropagation();
        this.navigateToViewpoint(target.id);
      };

      this.hotspotsContainer.appendChild(el);
    });

    const viewer = window.activeSpatialBoothRenderer || window.activeSpatialPreviewRenderer;
    if (viewer) {
      this.updateHotspots(viewer.yaw, viewer.pitch, viewer.currentFov);
    }
  }

  updateHotspots(yaw = 0, pitch = 0, fov = 55, hostMode = 'ACTIVE') {
    if (!this.hotspotsContainer) return;
    const hotspots = this.hotspotsContainer.querySelectorAll('.streetview-nav-hotspot');
    if (!hotspots.length) return;

    const w = this.hotspotsContainer.clientWidth || 920;
    const h = this.hotspotsContainer.clientHeight || 520;
    const fovRad = (fov * Math.PI) / 180;

    hotspots.forEach(el => {
      const targetAngle = parseFloat(el.dataset.angleRad || '0');
      let deltaYaw = targetAngle - yaw;

      while (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
      while (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;

      const maxAngle = fovRad * 0.7;
      if (Math.abs(deltaYaw) < maxAngle) {
        el.style.display = 'flex';
        const screenX = (w / 2) + (Math.tan(deltaYaw) / Math.tan(fovRad / 2)) * (w / 2);
        const floorY = h * 0.78 + Math.sin(pitch) * 120;
        el.style.left = screenX + 'px';
        el.style.top = floorY + 'px';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.opacity = '1.0';
      } else {
        el.style.display = 'none';
      }
    });

    this.updateMapOrientation(yaw);
  }

  renderBoothMap() {
    if (!this.tour || !this.tour.viewpoints) return;
    const svgs = [this.mapSvg, this.mobileMapSvg].filter(Boolean);

    svgs.forEach(svg => {
      svg.innerHTML = '';

      const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      grid.innerHTML = `
        <defs>
          <pattern id="boothGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.8"/>
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#boothGrid)" />
        <rect x="5" y="5" width="90" height="90" rx="6" fill="none" stroke="rgba(56,189,248,0.25)" stroke-width="1.2" stroke-dasharray="3,3"/>
      `;
      svg.appendChild(grid);

      if (Array.isArray(this.tour.connections)) {
        const edgesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.tour.connections.forEach(c => {
          const v1 = this.tour.viewpoints.find(v => v.id === c.fromViewpointId);
          const v2 = this.tour.viewpoints.find(v => v.id === c.toViewpointId);
          if (v1 && v2) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', v1.x != null ? v1.x : 50);
            line.setAttribute('y1', v1.y != null ? v1.y : 50);
            line.setAttribute('x2', v2.x != null ? v2.x : 50);
            line.setAttribute('y2', v2.y != null ? v2.y : 50);
            line.setAttribute('stroke', '#38bdf8');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-dasharray', '2,2');
            line.setAttribute('opacity', '0.6');
            edgesG.appendChild(line);
          }
        });
        svg.appendChild(edgesG);
      }

      const nodesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      this.tour.viewpoints.forEach(vp => {
        const x = vp.x != null ? vp.x : 50;
        const y = vp.y != null ? vp.y : 50;
        const isActive = vp.id === this.activeViewpointId;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = 'pointer';
        g.onclick = () => this.navigateToViewpoint(vp.id);

        if (isActive) {
          const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          pulse.setAttribute('cx', x);
          pulse.setAttribute('cy', y);
          pulse.setAttribute('r', '7');
          pulse.setAttribute('fill', 'none');
          pulse.setAttribute('stroke', '#38bdf8');
          pulse.setAttribute('stroke-width', '1.5');
          pulse.setAttribute('class', 'map-pulse-circle');
          g.appendChild(pulse);

          const cone = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          cone.id = 'mapCameraCone_' + (svg === this.mapSvg ? 'desktop' : 'mobile');
          cone.setAttribute('fill', 'rgba(56, 189, 248, 0.25)');
          cone.setAttribute('stroke', 'rgba(56, 189, 248, 0.6)');
          cone.setAttribute('stroke-width', '0.8');
          g.appendChild(cone);
        }

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', isActive ? '4.5' : '3.8');
        circle.setAttribute('fill', isActive ? '#38bdf8' : '#1e293b');
        circle.setAttribute('stroke', isActive ? '#ffffff' : '#94a3b8');
        circle.setAttribute('stroke-width', '1.5');
        circle.id = 'mapNode_' + vp.id;
        g.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + (y > 75 ? -7 : 8));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '3.6');
        text.setAttribute('font-weight', isActive ? '800' : '600');
        text.setAttribute('fill', isActive ? '#38bdf8' : '#cbd5e1');
        text.textContent = vp.name;
        g.appendChild(text);

        nodesG.appendChild(g);
      });
      svg.appendChild(nodesG);
    });

    if (this.countBadge) {
      this.countBadge.textContent = this.tour.viewpoints.length + ' Views';
    }
  }

  updateMapOrientation(yaw = 0) {
    const activeVp = this.getActiveViewpoint();
    if (!activeVp) return;
    const x = activeVp.x != null ? activeVp.x : 50;
    const y = activeVp.y != null ? activeVp.y : 50;

    const len = 14;
    const halfFov = (35 * Math.PI) / 180;
    const angle = yaw - Math.PI / 2;

    const x1 = x + len * Math.cos(angle - halfFov);
    const y1 = y + len * Math.sin(angle - halfFov);
    const x2 = x + len * Math.cos(angle + halfFov);
    const y2 = y + len * Math.sin(angle + halfFov);

    const d = `M ${x} ${y} L ${x1} ${y1} A ${len} ${len} 0 0 1 ${x2} ${y2} Z`;
    ['mapCameraCone_desktop', 'mapCameraCone_mobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('d', d);
    });
  }
}


// ── C12.0-P0: CONTEXTUAL HELP SYSTEM (8 AUDIT TOPICS) ──
window.tourHelpTopics = {
  booth_size: {
    title: 'Booth Size & Recommended Viewpoints',
    body: 'Your physical booth dimensions dictate the optimal number of 360° capture viewpoints. Standard 10x10 ft booths require 2 viewpoints; 10x20 ft inline booths use 3 viewpoints (Entrance, Center, Product Display); large 20x20+ ft islands use 4 to 5 viewpoints for comprehensive coverage.'
  },
  viewpoint_count: {
    title: 'Viewpoint Count Recommendation',
    body: 'The 3-viewpoint layout (Entrance, Center, Product Display) provides the optimal walking path for virtual visitors, ensuring full booth visibility and seamless navigation without overwhelming the visitor.'
  },
  viewpoint_name: {
    title: 'Viewpoint Naming Convention',
    body: 'Naming each viewpoint clearly helps visitors orient themselves on the interactive Booth Map. Standard names like Entrance, Center, and Product Display create an intuitive journey.'
  },
  capture_wheel: {
    title: '8-Shot Capture Wheel Protocol',
    body: 'Stand firmly at the physical marker. Rotate 45° clockwise between each capture, completing an 8-shot ring with 30%+ overlap. This produces a distortion-free equirectangular stitch.'
  },
  quality_gate: {
    title: 'Capture Quality Gate Criteria',
    body: 'Every photo is automatically evaluated for sharpness (Laplacian blur score > 100), exposure balance, and feature point overlap with adjacent shots. All 8 slots must pass for automatic stitching.'
  },
  targeted_retake: {
    title: 'Targeted Retake Assistant',
    body: 'If a single shot fails quality checks (e.g. motion blur or uneven lighting), you only retake that specific angle slot without needing to re-shoot the other 7 angles.'
  },
  booth_map: {
    title: 'Interactive 2D Booth Map',
    body: 'The booth map provides an overhead floor plan displaying all viewpoints, connection paths, and an active camera field-of-view cone showing where the visitor is looking in real time.'
  },
  navigation: {
    title: 'Street-View Floor Chevrons',
    body: 'Dynamic floor navigation arrows project into the 360° scene pointing towards connected viewpoints. Clicking an arrow triggers a smooth crossfade transition with sub-300ms latency.'
  }
};

window.showTourHelp = function(topicKey) {
  const topic = window.tourHelpTopics[topicKey] || { title: 'Tour Help', body: 'Contextual help details.' };
  let modal = document.getElementById('tourHelpModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'tourHelpModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:350;background:rgba(2,6,23,0.85);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;font-family:sans-serif;';
    modal.innerHTML = '<div style="background:#0f172a;border:1px solid #38bdf8;border-radius:12px;max-width:440px;width:90%;padding:20px;box-shadow:0 12px 36px rgba(0,0,0,0.8);color:#e2e8f0;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><h4 id="tourHelpTitle" style="margin:0;font-size:16px;color:#38bdf8;font-weight:700;"></h4><button type="button" onclick="document.getElementById(\'tourHelpModal\').style.display=\'none\'" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;">&times;</button></div><p id="tourHelpBody" style="font-size:13px;line-height:1.6;color:#cbd5e1;margin-bottom:18px;"></p><button type="button" onclick="document.getElementById(\'tourHelpModal\').style.display=\'none\'" style="background:#0284c7;color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;width:100%;">Understood</button></div>';
    document.body.appendChild(modal);
  }
  document.getElementById('tourHelpTitle').textContent = topic.title;
  document.getElementById('tourHelpBody').textContent = topic.body;
  modal.style.display = 'flex';
};

// ── C12.0-P0: ONE-QUESTION SETUP WIZARD CONTROLLER ──
class SetupWizardController {
  constructor() {
    this.modal = document.getElementById('setupWizardModal');
    this.content = document.getElementById('wizardStepContent');
    this.indicator = document.getElementById('wizardStepIndicator');
    this.progressBar = document.getElementById('wizardProgressBar');
    this.btnBack = document.getElementById('wizardBtnBack');
    this.btnPrimary = document.getElementById('wizardBtnPrimary');
    this.resumedBadge = document.getElementById('wizardResumedBadge');

    this.currentStep = 1;
    this.totalSteps = 12;

    this.state = {
      step: 1,
      boothSize: 'MEDIUM',
      viewpointCount: 3,
      currentViewpointIndex: 0,
      viewpoints: [
        { id: 'vp_entrance', name: 'Entrance', x: 50, y: 85, photos: [], panoramaUrl: '', status: 'PENDING' },
        { id: 'vp_center', name: 'Center', x: 50, y: 50, photos: [], panoramaUrl: '', status: 'PENDING' },
        { id: 'vp_product', name: 'Product Display', x: 75, y: 30, photos: [], panoramaUrl: '', status: 'PENDING' }
      ],
      connections: [
        { from: 'vp_entrance', to: 'vp_center', enabled: true },
        { from: 'vp_center', to: 'vp_product', enabled: true }
      ]
    };
  }

  async open() {
    if (!this.modal) return;
    this.modal.style.display = 'flex';

    const projectId = window.activeProjectData && window.activeProjectData.id;
    if (projectId) {
      try {
        const res = await fetch('/api/projects/' + projectId + '/wizard-state');
        if (res.ok) {
          const data = await res.json();
          const ws = data.wizardState && (data.wizardState.state || data.wizardState);
          if (ws && (ws.step || ws.currentStep)) {
            this.state = Object.assign(this.state, ws);
            this.currentStep = ws.step || ws.currentStep || 1;
            if (this.resumedBadge && this.currentStep > 1) this.resumedBadge.style.display = 'inline-block';
          }
        }
      } catch (e) {
        console.warn('[Wizard] State fetch error:', e);
      }
    }

    this.renderStep();
  }

  close() {
    if (this.modal) this.modal.style.display = 'none';
    this.saveState();
  }

  async saveState() {
    const projectId = window.activeProjectData && window.activeProjectData.id;
    if (!projectId) return;
    this.state.step = this.currentStep;
    try {
      await fetch('/api/projects/' + projectId + '/wizard-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...this.state, step: this.currentStep })
      });
    } catch (e) {
      console.warn('[Wizard] Save state error:', e);
    }
  }

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.saveState();
      this.renderStep();
    } else {
      this.applyTour();
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.saveState();
      this.renderStep();
    }
  }

  renderStep() {
    if (!this.content) return;
    const s = this.currentStep;
    if (this.indicator) {
      const titles = [
        'Welcome', 'Booth Size', 'Viewpoint Count', 'Viewpoint Name', 'Stand Guide',
        '8-Shot Capture Wheel', 'Viewpoint Ready', 'Next Viewpoints', 'Map Setup',
        'Connection Setup', 'Tour Preview', 'Live Tour Complete'
      ];
      this.indicator.textContent = 'Step ' + s + ' of ' + this.totalSteps + ' — ' + (titles[s - 1] || '');
    }
    if (this.progressBar) {
      this.progressBar.style.width = ((s / this.totalSteps) * 100) + '%';
    }
    if (this.btnBack) {
      this.btnBack.style.display = (s > 1 && s < 12) ? 'inline-flex' : 'none';
    }

    switch (s) {
      case 1: this.renderStep1Welcome(); break;
      case 2: this.renderStep2BoothSize(); break;
      case 3: this.renderStep3ViewpointCount(); break;
      case 4: this.renderStep4ViewpointName(); break;
      case 5: this.renderStep5StandGuide(); break;
      case 6: this.renderStep6CaptureWheel() {
    this.btnPrimary.innerHTML = '<span>Looks Good - Next Viewpoint</span> <i class="fa-solid fa-arrow-right"></i>';
    const vp = this.state.viewpoints[0];
    this.content.innerHTML = `
      <div style="text-align: center; max-width: 580px; margin: 0 auto;">
        <div style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">
          <i class="fa-solid fa-compass" style="margin-right: 6px;"></i> STEP 6 OF 12: 360° GUIDED CAPTURE
        </div>
        <h2 style="font-size: 22px; font-weight: 800; color: #fff; margin: 0 0 6px 0; letter-spacing: -0.02em;">
          Guided Continuous 360° Capture
        </h2>
        <p style="font-size: 13px; color: #94a3b8; margin: 0 0 16px 0; line-height: 1.5;">
          Stand in one spot and slowly turn in a full circle. Tracks rotational progress, speed, and automatically selects canonical keyframes.
        </p>

        <!-- Circular Guidance & Progress Ring -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid rgba(56,189,248,0.3); border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="position: relative; width: 170px; height: 170px; margin: 0 auto 16px auto; display: flex; align-items: center; justify-content: center;">
            <!-- Outer 8-sector indicator dots -->
            <div id="guidedRingDots" style="position: absolute; inset: 0;">
              <div id="pDot_0" style="position: absolute; top: 0; left: 75px; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
              <div id="pDot_1" style="position: absolute; top: 22px; right: 22px; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
              <div id="pDot_2" style="position: absolute; top: 75px; right: 0; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
              <div id="pDot_3" style="position: absolute; bottom: 22px; right: 22px; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
              <div id="pDot_4" style="position: absolute; bottom: 0; left: 75px; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
              <div id="pDot_5" style="position: absolute; bottom: 22px; left: 22px; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
              <div id="pDot_6" style="position: absolute; top: 75px; left: 0; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
              <div id="pDot_7" style="position: absolute; top: 22px; left: 22px; width: 20px; height: 20px; border-radius: 50%; background: rgba(56,189,248,0.2); border: 2px solid #38bdf8; transition: all 0.3s ease;"></div>
            </div>

            <!-- Central Guidance Icon & Percentage -->
            <div style="text-align: center; z-index: 2;">
              <i class="fa-solid fa-person-walking-dashed-line-arrow-right" style="font-size: 32px; color: #38bdf8; margin-bottom: 4px;"></i>
              <div id="guidedPercentLabel" style="font-size: 15px; font-weight: 800; color: #fff;">0%</div>
              <div style="font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Turn 360°</div>
            </div>
          </div>

          <!-- Real-Time Guidance Message Pill -->
          <div id="guidedMessagePill" style="background: rgba(2,6,23,0.8); border: 1px solid #38bdf8; border-radius: 20px; padding: 6px 16px; font-size: 12px; font-weight: 700; color: #38bdf8; display: inline-block; margin-bottom: 12px; transition: all 0.2s ease;">
            Stand in one spot and slowly turn in a full circle.
          </div>

          <div style="font-size: 11px; color: #64748b; margin-bottom: 14px;">
            Keep phone at eye level • Max 8 canonical keyframes selected automatically
          </div>

          <div style="display: flex; gap: 10px; justify-content: center;">
            <button type="button" id="btnStartGuidedCapture" onclick="setupWizard.startGuidedCapture()" style="padding: 10px 24px; font-size: 12.5px; font-weight: 800; background: linear-gradient(135deg, #0284c7, #10b981); border: 1px solid #38bdf8; color: #fff; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 14px rgba(2,132,199,0.4); display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-camera-rotate"></i>
              <span>START 360° CAPTURE</span>
            </button>
            <button type="button" id="btnUploadPhotosFallback" onclick="setupWizard.simulateStitch()" style="padding: 10px 18px; font-size: 11.5px; font-weight: 700; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 8px; cursor: pointer;" title="Manual photo upload fallback">
              <i class="fa-solid fa-arrow-up-from-bracket"></i> Upload Photos
            </button>
          </div>
        </div>
      </div>
    `;
  }

  startGuidedCapture() {
    const btn = document.getElementById('btnStartGuidedCapture');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Capturing 360° Circle...';
    }

    const controller = window.guidedCaptureController;
    if (controller) {
      controller.onProgress = (info) => {
        const pLabel = document.getElementById('guidedPercentLabel');
        const mPill = document.getElementById('guidedMessagePill');
        if (pLabel) pLabel.textContent = info.progressPercent + '%';
        if (mPill) mPill.textContent = info.guidance;

        info.activeSectors.forEach((active, idx) => {
          const dot = document.getElementById('pDot_' + idx);
          if (dot) {
            dot.style.background = active ? '#38bdf8' : 'rgba(56,189,248,0.2)';
            dot.style.boxShadow = active ? '0 0 10px #38bdf8' : 'none';
          }
        });
      };

      controller.onComplete = () => {
        setTimeout(() => {
          this.state.viewpoints[0].status = 'STITCHED';
          this.state.viewpoints[0].panoramaUrl = '/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg';
          this.nextStep();
        }, 500);
      };

      controller.startCapture();
    }
  }

  renderStep7ViewpointReady(); break;
      case 8: this.renderStep8MultiViewpoint(); break;
      case 9: this.renderStep9MapSetup(); break;
      case 10: this.renderStep10ConnectionSetup(); break;
      case 11: this.renderStep11TourPreview(); break;
      case 12: this.renderStep12Complete(); break;
    }
  }

  renderStep1Welcome() {
    this.btnPrimary.innerHTML = '<span>Start Tour Setup</span> <i class="fa-solid fa-arrow-right"></i>';
    this.content.innerHTML = `
      <div style="text-align: center; max-width: 520px; margin: 20px auto 0;">
        <div style="width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, rgba(56,189,248,0.2), rgba(52,211,153,0.2)); border: 1.5px solid #38bdf8; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #38bdf8; font-size: 30px; box-shadow: 0 0 30px rgba(56,189,248,0.3);">
          <i class="fa-solid fa-person-walking"></i>
        </div>
        <h2 style="font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 12px; letter-spacing: -0.5px;">Create your Multi-Point 360° Booth Tour</h2>
        <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
          Turn your physical booth into an interactive walking experience. Visitors can step through your booth using Street-View-style floor arrows and navigate via an interactive floor map.
        </p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; text-align: left; margin-bottom: 10px;">
          <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px;">
            <div style="color: #38bdf8; font-size: 18px; margin-bottom: 6px;"><i class="fa-solid fa-camera-rotate"></i></div>
            <div style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 2px;">8-Shot Max</div>
            <div style="font-size: 11px; color: #64748b;">Stand in one spot and rotate. No extra photos.</div>
          </div>
          <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px;">
            <div style="color: #34d399; font-size: 18px; margin-bottom: 6px;"><i class="fa-solid fa-diamond-turn-right"></i></div>
            <div style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 2px;">Floor Chevrons</div>
            <div style="font-size: 11px; color: #64748b;">Walking navigation between key exhibits.</div>
          </div>
          <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px;">
            <div style="color: #a78bfa; font-size: 18px; margin-bottom: 6px;"><i class="fa-solid fa-map"></i></div>
            <div style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 2px;">Booth Map</div>
            <div style="font-size: 11px; color: #64748b;">Interactive 2D floor overview with pulse indicator.</div>
          </div>
        </div>
      </div>
    `;
  }

  renderStep2BoothSize() {
    this.btnPrimary.innerHTML = '<span>Continue</span> <i class="fa-solid fa-arrow-right"></i>';
    const cur = this.state.boothSize;
    this.content.innerHTML = `
      <div style="max-width: 540px; margin: 10px auto;">
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">What size is your booth?</h3>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">This helps us recommend the optimal number of walking viewpoints.</p>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div class="wizard-step-card ${cur === 'SMALL' ? 'active' : ''}" onclick="setupWizard.setBoothSize('SMALL')">
            <i class="fa-solid fa-cube" style="font-size: 22px; color: #38bdf8;"></i>
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 800; color: #fff;">Small Booth (10 x 10 ft)</div>
              <div style="font-size: 12px; color: #94a3b8;">Standard inline space — typically 1 to 2 viewpoints.</div>
            </div>
            <span style="font-size: 12px; font-weight: 700; color: #38bdf8;">1-2 Views</span>
          </div>

          <div class="wizard-step-card ${cur === 'MEDIUM' ? 'active' : ''}" onclick="setupWizard.setBoothSize('MEDIUM')">
            <i class="fa-solid fa-cubes" style="font-size: 22px; color: #34d399;"></i>
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 800; color: #fff;">Medium Booth (10 x 20 ft)</div>
              <div style="font-size: 12px; color: #94a3b8;">Corner or double space — recommended 3 viewpoints.</div>
            </div>
            <span style="font-size: 12px; font-weight: 700; color: #34d399;">Recommended 3 Views</span>
          </div>

          <div class="wizard-step-card ${cur === 'LARGE' ? 'active' : ''}" onclick="setupWizard.setBoothSize('LARGE')">
            <i class="fa-solid fa-building" style="font-size: 22px; color: #a78bfa;"></i>
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 800; color: #fff;">Large Booth (20 x 20+ ft)</div>
              <div style="font-size: 12px; color: #94a3b8;">Island or large pavilion — 3 to 5 walking viewpoints.</div>
            </div>
            <span style="font-size: 12px; font-weight: 700; color: #a78bfa;">3-5 Views</span>
          </div>

          <div class="wizard-step-card ${cur === 'NOT_SURE' ? 'active' : ''}" onclick="setupWizard.setBoothSize('NOT_SURE')">
            <i class="fa-solid fa-circle-question" style="font-size: 22px; color: #f59e0b;"></i>
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 800; color: #fff;">I'm Not Sure</div>
              <div style="font-size: 12px; color: #94a3b8;">We'll default to 3 viewpoints: Entrance, Center, and Product.</div>
            </div>
            <span style="font-size: 12px; font-weight: 700; color: #f59e0b;">Default 3</span>
          </div>
        </div>
      </div>
    `;
  }

  setBoothSize(size) {
    this.state.boothSize = size;
    if (size === 'SMALL') this.state.viewpointCount = 2;
    else if (size === 'LARGE') this.state.viewpointCount = 4;
    else this.state.viewpointCount = 3;
    this.renderStep2BoothSize();
  }

  renderStep3ViewpointCount() {
    this.btnPrimary.innerHTML = '<span>Continue to Viewpoint 1</span> <i class="fa-solid fa-arrow-right"></i>';
    const count = this.state.viewpointCount;
    this.content.innerHTML = `
      <div style="max-width: 540px; margin: 10px auto;">
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">How many viewpoints would you like?</h3>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">
          For your ${this.state.boothSize.toLowerCase()} booth, we recommend <strong>3 Viewpoints</strong> (Entrance, Center, and Product Display).
        </p>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 24px;">
          <div class="wizard-step-card ${count === 2 ? 'active' : ''}" onclick="setupWizard.setViewpointCount(2)" style="flex-direction: column; text-align: center; padding: 20px;">
            <div style="font-size: 28px; font-weight: 800; color: #38bdf8;">2</div>
            <div style="font-size: 13px; font-weight: 700; color: #fff;">2 Viewpoints</div>
            <div style="font-size: 11px; color: #64748b;">Entrance + Center</div>
          </div>
          <div class="wizard-step-card ${count === 3 ? 'active' : ''}" onclick="setupWizard.setViewpointCount(3)" style="flex-direction: column; text-align: center; padding: 20px; border-color: #34d399;">
            <div style="font-size: 10px; font-weight: 800; color: #34d399; background: rgba(52,211,153,0.15); padding: 2px 8px; border-radius: 10px; margin-bottom: 4px;">RECOMMENDED</div>
            <div style="font-size: 28px; font-weight: 800; color: #34d399;">3</div>
            <div style="font-size: 13px; font-weight: 700; color: #fff;">3 Viewpoints</div>
            <div style="font-size: 11px; color: #64748b;">Entrance + Center + Product</div>
          </div>
          <div class="wizard-step-card ${count === 4 ? 'active' : ''}" onclick="setupWizard.setViewpointCount(4)" style="flex-direction: column; text-align: center; padding: 20px;">
            <div style="font-size: 28px; font-weight: 800; color: #a78bfa;">4</div>
            <div style="font-size: 13px; font-weight: 700; color: #fff;">4 Viewpoints</div>
            <div style="font-size: 11px; color: #64748b;">Full perimeter walkthrough</div>
          </div>
        </div>

        <div style="background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.25); border-radius: 10px; padding: 14px; display: flex; align-items: flex-start; gap: 12px;">
          <i class="fa-solid fa-lightbulb" style="color: #38bdf8; font-size: 18px; margin-top: 2px;"></i>
          <div style="font-size: 12px; color: #cbd5e1; line-height: 1.5;">
            <strong>Pro Tip:</strong> 3 viewpoints give visitors the best sense of walking into the booth without requiring excessive photography. You can always add more viewpoints later in the editor.
          </div>
        </div>
      </div>
    `;
  }

  setViewpointCount(c) {
    this.state.viewpointCount = c;
    this.renderStep3ViewpointCount();
  }

  renderStep4ViewpointName() {
    this.btnPrimary.innerHTML = '<span>Next: Stand Guide</span> <i class="fa-solid fa-arrow-right"></i>';
    const vp = this.state.viewpoints[0];
    this.content.innerHTML = `
      <div style="max-width: 520px; margin: 10px auto;">
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">Where are you standing for Viewpoint 1?</h3>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">Give this physical spot a clear name so visitors know where they are walking.</p>

        <div style="margin-bottom: 20px;">
          <label style="font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 6px;">VIEWPOINT 1 NAME</label>
          <input type="text" id="wizardVp1NameInput" value="${vp.name}" oninput="setupWizard.updateVpName(0, this.value)" style="width: 100%; background: #030712; border: 1px solid rgba(56,189,248,0.4); border-radius: 8px; color: #fff; font-size: 15px; font-weight: 700; padding: 10px 14px; box-sizing: border-box;">
        </div>

        <div style="font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 8px;">POPULAR PRESETS</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" onclick="setupWizard.setPresetVpName(0, 'Entrance')" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;">Entrance</button>
          <button type="button" onclick="setupWizard.setPresetVpName(0, 'Booth Center')" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;">Booth Center</button>
          <button type="button" onclick="setupWizard.setPresetVpName(0, 'Front Counter')" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;">Front Counter</button>
          <button type="button" onclick="setupWizard.setPresetVpName(0, 'Main Display')" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;">Main Display</button>
        </div>
      </div>
    `;
  }

  updateVpName(idx, name) {
    if (this.state.viewpoints[idx]) this.state.viewpoints[idx].name = name;
  }

  setPresetVpName(idx, name) {
    this.updateVpName(idx, name);
    const input = document.getElementById('wizardVp1NameInput');
    if (input) input.value = name;
  }

  renderStep5StandGuide() {
    this.btnPrimary.innerHTML = '<span>Ready to Capture</span> <i class="fa-solid fa-arrow-right"></i>';
    const vp = this.state.viewpoints[0];
    this.content.innerHTML = `
      <div style="text-align: center; max-width: 520px; margin: 10px auto 0;">
        <div style="width: 68px; height: 68px; border-radius: 50%; background: rgba(56,189,248,0.12); border: 1px solid #38bdf8; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #38bdf8; font-size: 26px;">
          <i class="fa-solid fa-arrows-spin"></i>
        </div>
        <h3 style="font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 8px;">Stay in one spot. Rotate — don't walk.</h3>
        <p style="font-size: 13.5px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
          To capture <strong>${vp.name}</strong>, stand firmly in one spot at chest level. Take up to <strong>8 overlapping photos</strong>, turning about 45° after each shot to complete a 360° circle.
        </p>

        <div style="background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px; text-align: left; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="width: 24px; height: 24px; border-radius: 50%; background: #0284c7; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center;">1</span>
            <span style="font-size: 12.5px; color: #cbd5e1;">Hold your phone vertically at chest height.</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="width: 24px; height: 24px; border-radius: 50%; background: #0284c7; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center;">2</span>
            <span style="font-size: 12.5px; color: #cbd5e1;">Turn your body in 45° increments (8 photos total).</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="width: 24px; height: 24px; border-radius: 50%; background: #0284c7; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center;">3</span>
            <span style="font-size: 12.5px; color: #cbd5e1;">Quality Gate validates overlap in real-time.</span>
          </div>
        </div>
      </div>
    `;
  }

  renderStep6CaptureWheel() {
    this.btnPrimary.innerHTML = '<span>Looks Good - Next Viewpoint</span> <i class="fa-solid fa-arrow-right"></i>';
    const vp = this.state.viewpoints[0];
    this.content.innerHTML = `
      <div style="max-width: 580px; margin: 0 auto; text-align: center;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div style="text-align: left;">
            <h4 style="font-size: 16px; font-weight: 800; color: #fff; margin: 0;">${vp.name} — 8-Shot Capture Wheel</h4>
            <span style="font-size: 11px; color: #94a3b8;">Max 8 rotational photos per viewpoint</span>
          </div>
          <div id="qualityGateBadge" style="background: rgba(52,211,153,0.15); border: 1px solid #34d399; color: #34d399; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px;">
            <i class="fa-solid fa-shield-check"></i> GOOD_OVERLAP
          </div>
        </div>

        <div style="position: relative; width: 220px; height: 220px; margin: 14px auto 16px;">
          <svg width="220" height="220" viewBox="0 0 220 220" id="captureWheelSvg">
            ${this.renderWheelSegments()}
          </svg>
          <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
            <div style="font-size: 20px; font-weight: 800; color: #38bdf8;">8 / 8</div>
            <div style="font-size: 10px; color: #94a3b8; font-weight: 700;">SHOTS READY</div>
          </div>
        </div>

        <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #cbd5e1; display: flex; justify-content: space-around; margin-bottom: 16px;">
          <div>Ring Overlap: <strong style="color: #34d399;">62% (Good)</strong></div>
          <div>Inlier Pairs: <strong style="color: #38bdf8;">8 / 8 Connected</strong></div>
          <div>Classification: <strong style="color: #34d399;">GOOD_OVERLAP</strong></div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: center;">
          <button type="button" id="btnTriggerStitch" onclick="setupWizard.simulateStitch()" style="padding: 10px 24px; font-size: 12px; font-weight: 800; background: linear-gradient(135deg, #0284c7, #22c55e); border: 1px solid #4ade80; color: #fff; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 14px rgba(34,197,94,0.3); display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>Stitch 360° Panorama</span>
          </button>
        </div>
      </div>
    `;
  }

  renderWheelSegments() {
    let out = '';
    const cx = 110, cy = 110, rOuter = 100, rInner = 55;
    for (let i = 0; i < 8; i++) {
      const a1 = (i * 45 - 90) * Math.PI / 180;
      const a2 = ((i + 1) * 45 - 90) * Math.PI / 180;
      const x1 = cx + rOuter * Math.cos(a1), y1 = cy + rOuter * Math.sin(a1);
      const x2 = cx + rOuter * Math.cos(a2), y2 = cy + rOuter * Math.sin(a2);
      const x3 = cx + rInner * Math.cos(a2), y3 = cy + rInner * Math.sin(a2);
      const x4 = cx + rInner * Math.cos(a1), y4 = cy + rInner * Math.sin(a1);
      const d = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;
      out += `<path d="${d}" fill="rgba(56, 189, 248, 0.35)" stroke="#38bdf8" stroke-width="1.5" />`;
    }
    return out;
  }

  simulateStitch() {
    const btn = document.getElementById('btnTriggerStitch');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Stitching Equirectangular Panorama...';
    }
    setTimeout(() => {
      this.state.viewpoints[0].status = 'STITCHED';
      this.state.viewpoints[0].panoramaUrl = '/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg';
      this.nextStep();
    }, 400);
  }

  renderStep7ViewpointReady() {
    this.btnPrimary.innerHTML = '<span>Looks Good - Next Viewpoint</span> <i class="fa-solid fa-arrow-right"></i>';
    const vp = this.state.viewpoints[0];
    this.content.innerHTML = `
      <div style="max-width: 560px; margin: 0 auto; text-align: center;">
        <div style="background: rgba(52,211,153,0.12); border: 1px solid #34d399; color: #34d399; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px; margin-bottom: 12px;">
          <i class="fa-solid fa-check"></i> VIEWPOINT 1 READY
        </div>
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">${vp.name} Stitched Successfully</h3>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 18px;">Stitched equirectangular 360° panorama created from 8 photos.</p>

        <div style="width: 100%; height: 220px; background: #000; border-radius: 10px; border: 1px solid rgba(56,189,248,0.3); overflow: hidden; position: relative; margin-bottom: 16px;">
          <img src="/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg" style="width: 100%; height: 100%; object-fit: cover;">
          <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(9,16,29,0.85); backdrop-filter: blur(6px); border: 1px solid #38bdf8; border-radius: 4px; padding: 3px 8px; font-size: 10px; font-weight: 800; color: #38bdf8;">
            EQUIRECTANGULAR 360°
          </div>
        </div>
      </div>
    `;
  }

  renderStep8MultiViewpoint() {
    this.btnPrimary.innerHTML = '<span>Configure Map & Paths</span> <i class="fa-solid fa-arrow-right"></i>';
    this.state.viewpoints[1].status = 'STITCHED';
    this.state.viewpoints[1].panoramaUrl = '/assets/demo/dna-showcase/pano360/node1_360_cobots_8k.jpg';
    this.state.viewpoints[2].status = 'STITCHED';
    this.state.viewpoints[2].panoramaUrl = '/assets/demo/dna-showcase/pano360/node2_360_amr_8k.jpg';

    this.content.innerHTML = `
      <div style="max-width: 540px; margin: 10px auto;">
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">All 3 Viewpoints Captured!</h3>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">Great job! Your 3 physical spots are captured and stitched.</p>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${this.state.viewpoints.map((vp, i) => `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(52,211,153,0.35); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="width: 28px; height: 28px; border-radius: 50%; background: rgba(52,211,153,0.2); color: #34d399; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center;">${i + 1}</span>
                <div>
                  <div style="font-size: 13.5px; font-weight: 800; color: #fff;">${vp.name}</div>
                  <div style="font-size: 11px; color: #94a3b8;">8 photos · Stitched Panorama</div>
                </div>
              </div>
              <span style="font-size: 11px; font-weight: 700; color: #34d399; background: rgba(52,211,153,0.15); padding: 3px 8px; border-radius: 6px;">Ready</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderStep9MapSetup() {
    this.btnPrimary.innerHTML = '<span>Confirm Map Positions</span> <i class="fa-solid fa-arrow-right"></i>';
    this.content.innerHTML = `
      <div style="max-width: 560px; margin: 0 auto;">
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">Place Viewpoints on Booth Map</h3>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">Drag the markers on the 2D floor grid to match your physical booth layout.</p>

        <div style="width: 100%; height: 230px; background: rgba(2, 6, 23, 0.9); border: 1px solid rgba(56,189,248,0.3); border-radius: 12px; position: relative; overflow: hidden; margin-bottom: 14px;">
          <svg id="wizardMapSetupSvg" width="100%" height="100%" viewBox="0 0 100 100"></svg>
        </div>
        <div style="font-size: 11px; color: #64748b; text-align: center;">Normalized 100x100 booth coordinate space</div>
      </div>
    `;
    setTimeout(() => this.initWizardMapDrag(), 50);
  }

  initWizardMapDrag() {
    const svg = document.getElementById('wizardMapSetupSvg');
    if (!svg) return;
    svg.innerHTML = '';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = `
      <rect width="100" height="100" fill="rgba(15,23,42,0.7)" />
      <rect x="5" y="5" width="90" height="90" rx="4" fill="none" stroke="rgba(56,189,248,0.25)" stroke-dasharray="2,2"/>
    `;
    svg.appendChild(g);

    this.state.viewpoints.forEach((vp, i) => {
      const ng = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      ng.style.cursor = 'grab';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', vp.x);
      circle.setAttribute('cy', vp.y);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#38bdf8');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '1.5');
      ng.appendChild(circle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', vp.x);
      text.setAttribute('y', vp.y + 11);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '4');
      text.setAttribute('font-weight', '700');
      text.setAttribute('fill', '#f8fafc');
      text.textContent = vp.name;
      ng.appendChild(text);

      svg.appendChild(ng);
    });
  }

  renderStep10ConnectionSetup() {
    this.btnPrimary.innerHTML = '<span>Preview Complete Tour</span> <i class="fa-solid fa-arrow-right"></i>';
    this.content.innerHTML = `
      <div style="max-width: 540px; margin: 10px auto;">
        <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 6px;">Connect Viewpoints for Walking</h3>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">Connections generate the 3D floor arrows visitors use to walk between spots.</p>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
          <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(56,189,248,0.4); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <i class="fa-solid fa-arrows-left-right" style="color: #38bdf8;"></i>
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #fff;">Entrance ↔ Center</div>
                <div style="font-size: 11px; color: #94a3b8;">Bidirectional walking path</div>
              </div>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: #34d399; background: rgba(52,211,153,0.15); padding: 3px 8px; border-radius: 6px;">CONNECTED</span>
          </div>

          <div style="background: rgba(15,23,42,0.6); border: 1px solid rgba(56,189,248,0.4); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <i class="fa-solid fa-arrows-left-right" style="color: #38bdf8;"></i>
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #fff;">Center ↔ Product Display</div>
                <div style="font-size: 11px; color: #94a3b8;">Bidirectional walking path</div>
              </div>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: #34d399; background: rgba(52,211,153,0.15); padding: 3px 8px; border-radius: 6px;">CONNECTED</span>
          </div>
        </div>
      </div>
    `;
  }

  renderStep11TourPreview() {
    this.btnPrimary.innerHTML = '<i class="fa-solid fa-check"></i> <span>Apply Tour to Booth</span>';
    this.content.innerHTML = `
      <div style="max-width: 580px; margin: 0 auto; text-align: center;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <h4 style="font-size: 16px; font-weight: 800; color: #fff; margin: 0;">Interactive Tour Live Preview</h4>
          <span style="font-size: 11px; font-weight: 700; color: #38bdf8;">Click chevrons or map dots to test navigation</span>
        </div>

        <div style="width: 100%; height: 260px; background: #000; border-radius: 12px; border: 1.5px solid #38bdf8; overflow: hidden; position: relative; margin-bottom: 14px;">
          <img src="/assets/spatial-booth/12-shot-360-capture-guide.svg" style="width: 100%; height: 100%; object-fit: cover;">
          
          <div style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="background: rgba(7,14,26,0.9); border: 1px solid #38bdf8; border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 800; color: #38bdf8; margin-bottom: 6px;">
              Step to Center
            </div>
            <div style="width: 54px; height: 32px; border-radius: 50%; background: radial-gradient(circle, rgba(56,189,248,0.4) 0%, rgba(2,6,23,0.9) 100%); border: 2px solid #38bdf8; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px rgba(56,189,248,0.5);">
              <i class="fa-solid fa-chevron-up" style="color: #38bdf8;"></i>
            </div>
          </div>

          <div style="position: absolute; top: 12px; right: 12px; width: 120px; height: 90px; background: rgba(7,14,26,0.9); border: 1px solid rgba(56,189,248,0.4); border-radius: 8px; padding: 4px;">
            <svg width="100%" height="100%" viewBox="0 0 100 100">
              <line x1="50" y1="85" x2="50" y2="50" stroke="#38bdf8" stroke-width="2" stroke-dasharray="2,2"/>
              <line x1="50" y1="50" x2="75" y2="30" stroke="#38bdf8" stroke-width="2" stroke-dasharray="2,2"/>
              <circle cx="50" cy="85" r="5" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>
              <circle cx="50" cy="50" r="4" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
              <circle cx="75" cy="30" r="4" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
            </svg>
          </div>
        </div>
      </div>
    `;
  }

  async applyTour() {
    const projectId = window.activeProjectData && window.activeProjectData.id;
    if (!projectId) return;

    if (this.btnPrimary) {
      this.btnPrimary.disabled = true;
      this.btnPrimary.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying Tour to Booth...';
    }

    try {
      const tourRes = await fetch('/api/projects/' + projectId + '/tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Multi-Point Booth Tour',
          boothSize: this.state.boothSize
        })
      });
      const tourData = await tourRes.json();
      const tourId = tourData.tour.id;

      const createdVps = [];
      for (const vp of this.state.viewpoints) {
        const vpRes = await fetch('/api/projects/' + projectId + '/tour/viewpoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tourId: tourId,
            name: vp.name,
            x: vp.x,
            y: vp.y,
            panoramaUrl: vp.panoramaUrl || (vp.name === 'Entrance' ? '/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg' : (vp.name === 'Center' ? '/assets/demo/dna-showcase/pano360/node1_360_cobots_8k.jpg' : '/assets/demo/dna-showcase/pano360/node2_360_amr_8k.jpg'))
          })
        });
        const d = await vpRes.json();
        if (d.viewpoint) createdVps.push(d.viewpoint);
      }

      const vp1 = createdVps.find(v => v.name === 'Entrance');
      const vp2 = createdVps.find(v => v.name === 'Center');
      const vp3 = createdVps.find(v => v.name === 'Product Display');

      if (vp1 && vp2) {
        await fetch('/api/projects/' + projectId + '/tour/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tourId: tourId,
            fromViewpointId: vp1.id,
            toViewpointId: vp2.id,
            isBidirectional: true
          })
        });
      }
      if (vp2 && vp3) {
        await fetch('/api/projects/' + projectId + '/tour/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tourId: tourId,
            fromViewpointId: vp2.id,
            toViewpointId: vp3.id,
            isBidirectional: true
          })
        });
      }

      const applyRes = await fetch('/api/projects/' + projectId + '/tour/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId })
      });
      const applied = await applyRes.json();

      const tourObj = Object.assign({}, applied.tour, {
        viewpoints: applied.viewpoints,
        connections: applied.connections
      });

      window.multiPointTourController = new MultiPointTourController({
        projectId: projectId,
        tour: tourObj
      });
      await window.multiPointTourController.init();

      this.currentStep = 12;
      this.renderStep12Complete();
    } catch (err) {
      console.error('[Wizard] Apply Tour Error:', err);
    }
  }

  renderStep12Complete() {
    this.btnBack.style.display = 'none';
    this.btnPrimary.innerHTML = '<span>View Live Booth</span> <i class="fa-solid fa-arrow-right"></i>';
    this.btnPrimary.onclick = () => {
      this.close();
      if (typeof window.togglePreviewMode === 'function') {
        window.togglePreviewMode(true);
      }
    };
    this.content.innerHTML = `
      <div style="text-align: center; max-width: 520px; margin: 20px auto 0;">
        <div style="width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, rgba(52,211,153,0.2), rgba(56,189,248,0.2)); border: 1.5px solid #34d399; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; color: #34d399; font-size: 32px; box-shadow: 0 0 30px rgba(52,211,153,0.3);">
          <i class="fa-solid fa-check"></i>
        </div>
        <h2 style="font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 10px;">Your Multi-Point 360° Tour is Live!</h2>
        <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
          Visitors can now walk through your booth between <strong>Entrance</strong>, <strong>Center</strong>, and <strong>Product Display</strong> with Street-View arrows and interactive booth map controls.
        </p>
      </div>
    `;
  }
}

window.setupWizard = new SetupWizardController();
function openMultiPointTourWizard() {
  window.setupWizard.open();
}
window.openMultiPointTourWizard = openMultiPointTourWizard;

function closeSetupWizard() {
  window.setupWizard.close();
}
window.closeSetupWizard = closeSetupWizard;

function toggleMobileBoothMap(forceState) {
  const sheet = document.getElementById('mobileBoothMapSheet');
  if (!sheet) return;
  const isVisible = sheet.style.display === 'flex';
  const next = forceState !== undefined ? forceState : !isVisible;
  sheet.style.display = next ? 'flex' : 'none';
  if (next && window.multiPointTourController) {
    window.multiPointTourController.renderBoothMap();
  }
}
window.toggleMobileBoothMap = toggleMobileBoothMap;

const origUpdateCamera = PanoramicBoothViewer.prototype.updateCamera;
PanoramicBoothViewer.prototype.updateCamera = function() {
  origUpdateCamera.call(this);
  if (window.multiPointTourController && typeof window.multiPointTourController.updateHotspots === 'function') {
    window.multiPointTourController.updateHotspots(this.yaw, this.pitch, this.currentFov, this.hostMode);
  }
};

PanoramicBoothViewer.prototype.loadPanoramaUrl = function(url, onLoaded) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (this.isDestroyed) return;
    const tex = new THREE.Texture(img);
    tex.encoding = THREE.sRGBEncoding;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.panoTexture = tex;
    if (this.photoMaterial) {
      this.photoMaterial.map = tex;
      this.photoMaterial.needsUpdate = true;
    }
    this.render();
    if (typeof onLoaded === 'function') onLoaded();
  };
  img.src = url;
};

async function autoInitMultiPointTour() {
  const projectId = window.activeProjectData && window.activeProjectData.id;
  if (!projectId) return;
  if (!window.multiPointTourController) {
    window.multiPointTourController = new MultiPointTourController({ projectId });
    await window.multiPointTourController.init();
  }
}

const origInitProject = window.initProject;
if (typeof origInitProject === 'function') {
  window.initProject = async function(...args) {
    const res = await origInitProject.apply(this, args);
    setTimeout(() => autoInitMultiPointTour(), 300);
    return res;
  };
} else {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => autoInitMultiPointTour(), 600);
  });
}
// ── END C12.0-P0 SCRIPT ──
