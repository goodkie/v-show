/* ============================================================
   Virtual Trade Show Commercial V1 — 3D Viewer Engine
   Spark Precision Splatting, Mobile Landscape 3D Player & Realtime Engagement (Phase 10.6A)
============================================================ */

let viewerEngine = null;
let raycastSurfaces = [];
let currentBooth = null;
let products = [];
let hotspots = [];
let hotspotObjects = [];
let ws = null;
let currentSessionId = `sess-${Math.random().toString(36).substring(2, 9)}`;

// WebRTC Consultation State
let peerConnection = null;
let localStream = null;
let currentConsultationRoom = null;
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

// DOM Elements
const viewport = document.getElementById('viewport-3d');
const overlay = document.getElementById('hotspots-overlay');
const navBoothName = document.getElementById('nav-booth-name');
const badgeRecon = document.getElementById('badge-recon-status');
const hudTitle = document.getElementById('hud-booth-title');
const hudDesc = document.getElementById('hud-booth-desc');
const loadingOverlay = document.getElementById('viewer-loading-overlay');
const loadingSubtitle = document.getElementById('loading-subtitle');

// Orientation & Mobile Landscape Manager
const orientationBanner = document.getElementById('orientation-suggestion-banner');

function initOrientationManager() {
  const checkOrientation = () => {
    const isLandscape = window.matchMedia('(orientation: landscape)').matches || (window.innerWidth > window.innerHeight);
    const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;

    if (!isLandscape && isMobileDevice) {
      if (orientationBanner && !sessionStorage.getItem('vts_dismiss_orientation')) {
        orientationBanner.style.display = 'flex';
      }
    } else {
      if (orientationBanner) {
        orientationBanner.style.display = 'none';
      }
    }

    // Resize 3D Viewport on orientation change
    if (viewerEngine && viewerEngine.renderer && viewerEngine.camera) {
      const w = viewport.clientWidth || window.innerWidth;
      const h = viewport.clientHeight || window.innerHeight;
      viewerEngine.camera.aspect = w / h;
      viewerEngine.camera.updateProjectionMatrix();
      viewerEngine.renderer.setSize(w, h);
    }
  };

  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  if (screen.orientation) {
    screen.orientation.addEventListener('change', checkOrientation);
  }
  checkOrientation();

  const btnDismiss = document.getElementById('btn-dismiss-orientation');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      sessionStorage.setItem('vts_dismiss_orientation', 'true');
      if (orientationBanner) orientationBanner.style.display = 'none';
    });
  }
}

// Memory & Visibility Throttling
let isDocumentVisible = true;
document.addEventListener('visibilitychange', () => {
  isDocumentVisible = !document.hidden;
});

// Initialize Viewer
async function initViewer() {
  const urlParams = new URLSearchParams(window.location.search);
  const boothId = urlParams.get('booth') || urlParams.get('boothId') || 'booth-demo-01';

  initOrientationManager();
  setupEventListeners();
  const success = await loadBoothData(boothId);
  if (success) {
    setupWebSocket(boothId);
    trackEvent('booth_view', { source: 'web_client' });
  }
}

// 1. Event Tracking Helper
async function trackEvent(type, metadata = {}, productId = null) {
  if (!currentBooth) return;
  try {
    const viewerMode = (currentBooth.reconstructionStatus === 'verified' && currentBooth.spatialModel?.assetUrl) 
      ? 'precision_splat' 
      : 'photo_preview';

    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boothId: currentBooth.id,
        productId,
        sessionId: currentSessionId,
        type,
        metadata: {
          ...metadata,
          viewerMode
        }
      })
    });
  } catch (err) {
    console.warn('Event tracking failed:', err);
  }
}

// 2. Load Booth & Build 3D Environment using Hybrid BoothEngine
async function loadBoothData(boothId) {
  try {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    const boothRes = await fetch(`/api/booths/${boothId}`);
    if (!boothRes.ok) {
      if (boothRes.status === 404) {
        if (hudTitle) hudTitle.textContent = 'Booth Unavailable or Inactive';
        if (hudDesc) hudDesc.textContent = 'This virtual booth is currently in draft state or not yet published.';
      } else {
        if (hudTitle) hudTitle.textContent = 'Failed to Load Booth';
        if (hudDesc) hudDesc.textContent = 'An error occurred while loading virtual booth data.';
      }
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      return false;
    }
    currentBooth = await boothRes.json();

    const prodRes = await fetch(`/api/booths/${boothId}/products`);
    products = await prodRes.json();

    const hsRes = await fetch(`/api/booths/${boothId}/hotspots`);
    hotspots = await hsRes.json();

    if (navBoothName) navBoothName.textContent = currentBooth.name;
    if (hudTitle) hudTitle.textContent = currentBooth.name;
    if (hudDesc) hudDesc.textContent = currentBooth.description || 'Welcome to our virtual trade show booth.';
    updateStatusBadge(currentBooth.reconstructionStatus);

    if (!viewerEngine) {
      viewerEngine = BoothEngine.initScene(viewport);
      setupContextLossRecovery(viewerEngine.renderer);
      animate();
    }

    // Build Hybrid 3D Scene (Spark Precision Splat or Photo Preview Fallback)
    raycastSurfaces = await BoothEngine.buildBooth(viewerEngine.scene, currentBooth, {
      renderer: viewerEngine.renderer,
      qualityPreset: 'AUTO',
      onProgress: (percent, msg) => {
        if (loadingSubtitle) loadingSubtitle.textContent = `[${percent}%] ${msg}`;
      },
      onFallback: (reason) => {
        showToast(`Notice: Switched to Photo Preview mode (${reason}).`);
        updateStatusBadge('photo_preview');
      }
    });

    renderHotspots(hotspots);
    if (loadingOverlay) {
      setTimeout(() => {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.style.display = 'none', 300);
      }, 200);
    }
    return true;

  } catch (error) {
    console.error('Error loading booth data:', error);
    if (hudTitle) hudTitle.textContent = 'Network Error';
    if (hudDesc) hudDesc.textContent = 'Unable to establish connection to server.';
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    return false;
  }
}

function setupContextLossRecovery(renderer) {
  if (!renderer || !renderer.domElement) return;
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost. Pausing rendering loop.');
  }, false);

  renderer.domElement.addEventListener('webglcontextrestored', () => {
    console.info('WebGL context restored. Rebuilding 3D booth.');
    if (currentBooth) {
      loadBoothData(currentBooth.id);
    }
  }, false);
}

function updateStatusBadge(status) {
  if (!badgeRecon) return;
  badgeRecon.className = 'badge';
  if (status === 'verified') {
    badgeRecon.classList.add('badge-verified');
    badgeRecon.textContent = '✨ Precision 3D (Gaussian Splat)';
  } else if (status === 'reconstructed') {
    badgeRecon.classList.add('badge-reconstructed');
    badgeRecon.textContent = '3D Reconstructed (Pending Approval)';
  } else if (status === 'processing') {
    badgeRecon.classList.add('badge-preview');
    badgeRecon.textContent = 'Photo Preview (3D Processing)';
  } else {
    badgeRecon.classList.add('badge-preview');
    badgeRecon.textContent = 'Photo Preview Mode';
  }
}

// 3. Hotspots 3D-to-2D Screen Projection
function renderHotspots(list) {
  if (!viewerEngine) return;

  hotspotObjects.forEach(item => {
    viewerEngine.scene.remove(item.anchor);
  });
  overlay.innerHTML = '';

  hotspotObjects = list.map(hs => {
    const anchor = new THREE.Object3D();
    anchor.position.set(hs.position.x, hs.position.y, hs.position.z);
    viewerEngine.scene.add(anchor);

    const pin = document.createElement('div');
    pin.className = 'hotspot-marker';
    pin.setAttribute('data-hotspot-id', hs.id);
    pin.innerHTML = `<span>+</span><div class="hotspot-pulse"></div>`;
    pin.title = hs.label || 'View Product Details';

    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      trackEvent('hotspot_click', { hotspotId: hs.id }, hs.productId);
      openProductModal(hs.productId);
    });

    overlay.appendChild(pin);

    return {
      data: hs,
      anchor,
      element: pin
    };
  });
}

function updateHotspotsScreenPosition() {
  if (!viewerEngine || !viewerEngine.camera) return;

  const tempV = new THREE.Vector3();
  const widthHalf = viewport.clientWidth / 2;
  const heightHalf = viewport.clientHeight / 2;

  hotspotObjects.forEach(item => {
    item.anchor.getWorldPosition(tempV);
    const behindCamera = tempV.clone().project(viewerEngine.camera).z > 1;
    if (behindCamera) {
      item.element.style.display = 'none';
      return;
    }

    tempV.project(viewerEngine.camera);
    const x = (tempV.x * widthHalf) + widthHalf;
    const y = -(tempV.y * heightHalf) + heightHalf;

    item.element.style.display = 'flex';
    item.element.style.left = `${x}px`;
    item.element.style.top = `${y}px`;
  });
}

// 4. Modals & Engagement Handlers
function setupEventListeners() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    });
  });

  const resetBtn = document.getElementById('btn-reset-view');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (viewerEngine && viewerEngine.camera && viewerEngine.controls) {
        viewerEngine.camera.position.set(0, 2.2, 7.5);
        viewerEngine.controls.target.set(0, 1.2, -1);
        viewerEngine.controls.update();
      }
    });
  }

  const catBtn = document.getElementById('btn-open-catalog');
  if (catBtn) catBtn.addEventListener('click', openCatalogModal);

  const cardBtn = document.getElementById('btn-exchange-card');
  if (cardBtn) cardBtn.addEventListener('click', () => {
    document.getElementById('modal-lead').classList.add('active');
  });

  const aptBtn = document.getElementById('btn-book-appointment');
  if (aptBtn) aptBtn.addEventListener('click', () => {
    document.getElementById('modal-appointment').classList.add('active');
  });

  const liveBtn = document.getElementById('btn-live-showhost');
  if (liveBtn) liveBtn.addEventListener('click', () => {
    openConsultationModal();
  });

  const startCallBtn = document.getElementById('btn-start-call');
  if (startCallBtn) startCallBtn.addEventListener('click', startWebRTCCall);

  const endCallBtn = document.getElementById('btn-end-call');
  if (endCallBtn) endCallBtn.addEventListener('click', endWebRTCCall);

  const rfqBtn = document.getElementById('btn-action-rfq');
  if (rfqBtn) rfqBtn.addEventListener('click', () => {
    const prodId = document.getElementById('modal-product').dataset.currentProdId;
    openRFQModal(prodId);
  });

  const sampleBtn = document.getElementById('btn-action-sample');
  if (sampleBtn) sampleBtn.addEventListener('click', () => {
    const prodId = document.getElementById('modal-product').dataset.currentProdId;
    openSampleModal(prodId);
  });

  setupForms();
}

function openProductModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) {
    showToast('Product information not found.');
    return;
  }

  trackEvent('product_view', { sku: prod.sku }, prod.id);

  const modal = document.getElementById('modal-product');
  modal.dataset.currentProdId = prod.id;
  document.getElementById('modal-prod-title').textContent = prod.name;
  document.getElementById('modal-prod-sku').textContent = `SKU: ${prod.sku} | ${prod.category || 'General'}`;
  document.getElementById('modal-prod-desc').textContent = prod.description || 'No detailed description registered.';
  document.getElementById('modal-prod-moq').textContent = `${prod.moq} Units`;
  document.getElementById('modal-prod-price').textContent = prod.contactForPrice ? 'Contact for Price' : `$${Number(prod.price).toLocaleString()} USD`;
  document.getElementById('modal-prod-sample').textContent = prod.sampleAvailable ? 'Available' : 'Unavailable';
  
  const imgEl = document.getElementById('modal-prod-image');
  if (prod.images && prod.images.length > 0) {
    imgEl.src = prod.images[0];
    imgEl.style.display = 'block';
  } else {
    imgEl.src = 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80';
    imgEl.style.display = 'block';
  }

  const specsTbody = document.getElementById('modal-prod-specs').querySelector('tbody');
  specsTbody.innerHTML = '';
  if (prod.specifications && Object.keys(prod.specifications).length > 0) {
    Object.entries(prod.specifications).forEach(([k, v]) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td>`;
      specsTbody.appendChild(row);
    });
  } else {
    specsTbody.innerHTML = '<tr><td colspan="2">Standard specifications available upon request.</td></tr>';
  }

  modal.classList.add('active');
}

function openCatalogModal() {
  const container = document.getElementById('catalog-list-container');
  container.innerHTML = '';

  products.forEach(p => {
    const card = document.createElement('div');
    card.style.background = 'var(--bg-surface-elevated)';
    card.style.borderRadius = 'var(--radius-sm)';
    card.style.overflow = 'hidden';
    card.style.border = '1px solid var(--border-subtle)';
    card.style.cursor = 'pointer';

    const img = (p.images && p.images[0]) ? p.images[0] : 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=400&q=80';
    card.innerHTML = `
      <img src="${img}" style="width:100%; height:120px; object-fit:cover;">
      <div style="padding: 12px;">
        <h4 style="font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name)}</h4>
        <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 8px;">${escapeHtml(p.sku)}</div>
        <div style="font-size: 13px; font-weight:600; color: var(--brand-accent);">${p.contactForPrice ? 'Contact for Price' : `$${Number(p.price).toLocaleString()} USD`}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      document.getElementById('modal-catalog').classList.remove('active');
      openProductModal(p.id);
    });

    container.appendChild(card);
  });

  document.getElementById('modal-catalog').classList.add('active');
}

function openRFQModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;
  document.getElementById('rfq-product-id').value = prod.id;
  document.getElementById('rfq-product-name').value = `${prod.name} (${prod.sku})`;
  document.getElementById('modal-product').classList.remove('active');
  document.getElementById('modal-rfq').classList.add('active');
}

function openSampleModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;
  document.getElementById('sample-product-id').value = prod.id;
  document.getElementById('sample-product-name').value = `${prod.name} (${prod.sku})`;
  document.getElementById('modal-product').classList.remove('active');
  document.getElementById('modal-sample').classList.add('active');
}

function setupForms() {
  // Lead Form
  const formLead = document.getElementById('form-lead');
  if (formLead) {
    formLead.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        boothId: currentBooth.id,
        company: document.getElementById('lead-company').value,
        name: document.getElementById('lead-name').value,
        email: document.getElementById('lead-email').value,
        phone: document.getElementById('lead-phone').value,
        jobTitle: document.getElementById('lead-job').value,
        notes: document.getElementById('lead-notes').value
      };

      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Digital business card submitted successfully!');
          document.getElementById('modal-lead').classList.remove('active');
          formLead.reset();
        } else {
          showToast(data.error || 'Submission failed.');
        }
      } catch (err) {
        showToast('Submission failed. Check network connection.');
      }
    });
  }

  // RFQ Form
  const formRfq = document.getElementById('form-rfq');
  if (formRfq) {
    formRfq.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        boothId: currentBooth.id,
        productId: document.getElementById('rfq-product-id').value,
        buyerName: document.getElementById('rfq-name').value,
        company: document.getElementById('rfq-company').value,
        email: document.getElementById('rfq-email').value,
        quantity: Number(document.getElementById('rfq-quantity').value),
        targetPrice: Number(document.getElementById('rfq-target-price').value) || undefined,
        notes: document.getElementById('rfq-notes').value
      };

      try {
        const res = await fetch('/api/rfqs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Request for Quotation (RFQ) submitted.');
          document.getElementById('modal-rfq').classList.remove('active');
          formRfq.reset();
        } else {
          showToast(data.error || 'RFQ submission failed.');
        }
      } catch (err) {
        showToast('RFQ submission failed.');
      }
    });
  }

  // Sample Form
  const formSample = document.getElementById('form-sample');
  if (formSample) {
    formSample.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        boothId: currentBooth.id,
        productId: document.getElementById('sample-product-id').value,
        buyerName: document.getElementById('sample-name').value,
        company: document.getElementById('sample-company').value,
        email: document.getElementById('sample-email').value,
        quantity: Number(document.getElementById('sample-qty').value),
        shippingAddress: document.getElementById('sample-address').value
      };

      try {
        const res = await fetch('/api/samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Sample request submitted.');
          document.getElementById('modal-sample').classList.remove('active');
          formSample.reset();
        } else {
          showToast(data.error || 'Sample request failed.');
        }
      } catch (err) {
        showToast('Sample request failed.');
      }
    });
  }

  // Appointment Form
  const formApt = document.getElementById('form-appointment');
  if (formApt) {
    formApt.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        boothId: currentBooth.id,
        buyerName: document.getElementById('apt-name').value,
        company: document.getElementById('apt-company').value,
        email: document.getElementById('apt-email').value,
        requestedTime: document.getElementById('apt-time').value,
        notes: document.getElementById('apt-notes').value
      };

      try {
        const res = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Consultation appointment scheduled.');
          document.getElementById('modal-appointment').classList.remove('active');
          formApt.reset();
        } else {
          showToast(data.error || 'Appointment booking failed.');
        }
      } catch (err) {
        showToast('Appointment booking failed.');
      }
    });
  }
}

// 5. WebSocket & WebRTC P2P Consultation Implementation
function setupWebSocket(boothId) {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room') || `booth-room-${boothId}`;
  currentConsultationRoom = roomId;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join_room', roomId: currentConsultationRoom }));
  };

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSignalingMessage(data);
    } catch (e) {
      console.error('WS parse error:', e);
    }
  };

  ws.onclose = () => {
    const statusText = document.getElementById('webrtc-status-text');
    if (statusText) statusText.textContent = 'Status: WebSocket Disconnected (Reconnecting)';
  };
}

function openConsultationModal() {
  trackEvent('consultation_start', { mode: 'webrtc_p2p' });
  const modal = document.getElementById('modal-showhost');
  const roomTag = document.getElementById('webrtc-room-tag');
  if (roomTag) roomTag.textContent = `Room: ${currentConsultationRoom}`;
  modal.classList.add('active');
}

async function startWebRTCCall() {
  const statusText = document.getElementById('webrtc-status-text');
  const btnStart = document.getElementById('btn-start-call');
  const btnEnd = document.getElementById('btn-end-call');

  try {
    statusText.textContent = 'Status: Requesting camera & mic permissions...';
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    createPeerConnection();

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    btnStart.style.display = 'none';
    btnEnd.style.display = 'inline-flex';
    statusText.textContent = 'Status: Waiting for peer connection (STUN P2P)...';

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    sendSignaling({
      type: 'offer',
      sdp: offer
    });

  } catch (err) {
    console.error('WebRTC getUserMedia error:', err);
    if (err.name === 'NotAllowedError') {
      statusText.textContent = 'Error: Camera/mic access denied.';
    } else {
      statusText.textContent = `Error: Media connection failed (${err.message})`;
    }
  }
}

function createPeerConnection() {
  if (peerConnection) return;

  peerConnection = new RTCPeerConnection(RTC_CONFIG);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignaling({
        type: 'candidate',
        candidate: event.candidate
      });
    }
  };

  peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remote-video');
    const placeholder = document.getElementById('remote-video-placeholder');
    if (remoteVideo && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      if (placeholder) placeholder.style.display = 'none';
      const statusText = document.getElementById('webrtc-status-text');
      if (statusText) statusText.textContent = 'Status: Live 1:1 consultation connected.';
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const statusText = document.getElementById('webrtc-status-text');
    if (!statusText) return;
    switch (peerConnection.connectionState) {
      case 'connecting':
        statusText.textContent = 'Status: Establishing P2P peer connection...';
        break;
      case 'connected':
        statusText.textContent = 'Status: 1:1 Live Video Consultation Active';
        break;
      case 'disconnected':
      case 'failed':
        statusText.textContent = 'Status: Peer connection disconnected.';
        break;
      case 'closed':
        statusText.textContent = 'Status: Call ended.';
        break;
    }
  };
}

function sendSignaling(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'signal',
      roomId: currentConsultationRoom,
      from: currentSessionId,
      payload
    }));
  }
}

async function handleSignalingMessage(data) {
  if (data.type === 'peer_joined') {
    const statusText = document.getElementById('webrtc-status-text');
    if (statusText) statusText.textContent = 'Status: Remote peer entered consultation room.';
    return;
  }

  if (data.type !== 'signal' || !data.payload) return;

  const payload = data.payload;
  if (!peerConnection) {
    createPeerConnection();
  }

  if (payload.type === 'offer') {
    if (!localStream) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = localStream;
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      } catch (e) {
        console.warn('Could not auto-start local stream on incoming offer:', e);
      }
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    sendSignaling({
      type: 'answer',
      sdp: answer
    });

  } else if (payload.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  } else if (payload.type === 'candidate' && payload.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  }
}

function endWebRTCCall() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  const localVideo = document.getElementById('local-video');
  const remoteVideo = document.getElementById('remote-video');
  const placeholder = document.getElementById('remote-video-placeholder');
  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;
  if (placeholder) placeholder.style.display = 'block';

  const btnStart = document.getElementById('btn-start-call');
  const btnEnd = document.getElementById('btn-end-call');
  if (btnStart) btnStart.style.display = 'inline-flex';
  if (btnEnd) btnEnd.style.display = 'none';
  const statusText = document.getElementById('webrtc-status-text');
  if (statusText) statusText.textContent = 'Status: Consultation call ended.';
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 6. Animation Loop (throttled when backgrounded)
function animate() {
  requestAnimationFrame(animate);
  if (!isDocumentVisible) return;

  if (viewerEngine && viewerEngine.controls) {
    viewerEngine.controls.update();
    viewerEngine.renderer.render(viewerEngine.scene, viewerEngine.camera);
    updateHotspotsScreenPosition();
  }
}

window.addEventListener('DOMContentLoaded', initViewer);
