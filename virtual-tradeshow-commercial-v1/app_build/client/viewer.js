/* ============================================================
   Virtual Trade Show Commercial V1 — 3D Viewer Engine
   Three.js Space Rendering, Real Events & WebRTC (Phase 3)
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

// Initialize Viewer
async function initViewer() {
  const urlParams = new URLSearchParams(window.location.search);
  const boothId = urlParams.get('booth') || urlParams.get('boothId') || 'booth-demo-01';

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
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boothId: currentBooth.id,
        productId,
        sessionId: currentSessionId,
        type,
        metadata
      })
    });
  } catch (err) {
    console.warn('Event tracking failed:', err);
  }
}

// 2. Load Booth & Build 3D Environment using Shared BoothEngine
async function loadBoothData(boothId) {
  try {
    const boothRes = await fetch(`/api/booths/${boothId}`);
    if (!boothRes.ok) {
      if (boothRes.status === 404) {
        hudTitle.textContent = '비공개 또는 존재하지 않는 부스';
        hudDesc.textContent = '현재 해당 부스는 준비 중(Draft)이거나 발행되지 않았습니다. 관리자에게 문의하세요.';
      } else {
        hudTitle.textContent = '부스 로딩 실패';
        hudDesc.textContent = '부스 데이터를 불러오는 중 오류가 발생했습니다.';
      }
      return false;
    }
    currentBooth = await boothRes.json();

    const prodRes = await fetch(`/api/booths/${boothId}/products`);
    products = await prodRes.json();

    const hsRes = await fetch(`/api/booths/${boothId}/hotspots`);
    hotspots = await hsRes.json();

    navBoothName.textContent = currentBooth.name;
    hudTitle.textContent = currentBooth.name;
    hudDesc.textContent = currentBooth.description || '가상 무역 전시관에 오신 것을 환영합니다.';
    updateStatusBadge(currentBooth.reconstructionStatus);

    if (!viewerEngine) {
      viewerEngine = BoothEngine.initScene(viewport);
      animate();
    }
    raycastSurfaces = BoothEngine.buildBooth(viewerEngine.scene, currentBooth);

    renderHotspots(hotspots);
    return true;

  } catch (error) {
    console.error('Error loading booth data:', error);
    hudTitle.textContent = '네트워크 오류';
    hudDesc.textContent = '서버와의 통신이 원활하지 않습니다.';
    return false;
  }
}

function updateStatusBadge(status) {
  badgeRecon.className = 'badge';
  if (status === 'reconstructed' || status === 'verified') {
    badgeRecon.classList.add('badge-reconstructed');
    badgeRecon.textContent = '3D Precision Reconstructed';
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
    pin.title = hs.label || '제품 상세 보기';

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

  document.getElementById('btn-reset-view').addEventListener('click', () => {
    if (viewerEngine && viewerEngine.camera && viewerEngine.controls) {
      viewerEngine.camera.position.set(0, 2.2, 7.5);
      viewerEngine.controls.target.set(0, 1.2, -1);
      viewerEngine.controls.update();
    }
  });

  document.getElementById('btn-open-catalog').addEventListener('click', openCatalogModal);

  document.getElementById('btn-exchange-card').addEventListener('click', () => {
    document.getElementById('modal-lead').classList.add('active');
  });

  document.getElementById('btn-book-appointment').addEventListener('click', () => {
    document.getElementById('modal-appointment').classList.add('active');
  });

  // Live Showhost Trigger
  document.getElementById('btn-live-showhost').addEventListener('click', () => {
    openConsultationModal();
  });

  document.getElementById('btn-start-call').addEventListener('click', startWebRTCCall);
  document.getElementById('btn-end-call').addEventListener('click', endWebRTCCall);

  document.getElementById('btn-action-rfq').addEventListener('click', () => {
    const prodId = document.getElementById('modal-product').dataset.currentProdId;
    openRFQModal(prodId);
  });

  document.getElementById('btn-action-sample').addEventListener('click', () => {
    const prodId = document.getElementById('modal-product').dataset.currentProdId;
    openSampleModal(prodId);
  });

  setupForms();
}

function openProductModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) {
    showToast('제품 정보를 찾을 수 없습니다.');
    return;
  }

  trackEvent('product_view', { sku: prod.sku }, prod.id);

  const modal = document.getElementById('modal-product');
  modal.dataset.currentProdId = prod.id;
  document.getElementById('modal-prod-title').textContent = prod.name;
  document.getElementById('modal-prod-sku').textContent = `SKU: ${prod.sku} | ${prod.category || 'General'}`;
  document.getElementById('modal-prod-desc').textContent = prod.description || '상세 설명이 등록되지 않았습니다.';
  document.getElementById('modal-prod-moq').textContent = `${prod.moq} 개`;
  document.getElementById('modal-prod-price').textContent = prod.contactForPrice ? '단가 문의 (Contact for Price)' : `$${Number(prod.price).toLocaleString()} USD`;
  document.getElementById('modal-prod-sample').textContent = prod.sampleAvailable ? '신청 가능' : '제공 불가';
  
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
      row.innerHTML = `<td>${k}</td><td><strong>${v}</strong></td>`;
      specsTbody.appendChild(row);
    });
  } else {
    specsTbody.innerHTML = '<tr><td colspan="2">기본 기술 사양서 준비 중</td></tr>';
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
        <h4 style="font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</h4>
        <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 8px;">${p.sku}</div>
        <div style="font-size: 13px; font-weight:600; color: var(--brand-accent);">${p.contactForPrice ? '단가 문의' : `$${Number(p.price).toLocaleString()} USD`}</div>
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
  document.getElementById('form-lead').addEventListener('submit', async (e) => {
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
        showToast('디지털 명함이 성공적으로 전달되었습니다!');
        document.getElementById('modal-lead').classList.remove('active');
        document.getElementById('form-lead').reset();
      } else {
        showToast(data.error || '전송 실패');
      }
    } catch (err) {
      showToast('전송 실패: 네트워크 상태를 확인하세요.');
    }
  });

  // RFQ Form
  document.getElementById('form-rfq').addEventListener('submit', async (e) => {
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
        showToast('견적 요청(RFQ)이 정상 접수되었습니다.');
        document.getElementById('modal-rfq').classList.remove('active');
        document.getElementById('form-rfq').reset();
      } else {
        showToast(data.error || 'RFQ 전송 실패');
      }
    } catch (err) {
      showToast('RFQ 전송 실패');
    }
  });

  // Sample Form
  document.getElementById('form-sample').addEventListener('submit', async (e) => {
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
        showToast('샘플 신청서가 등록되었습니다.');
        document.getElementById('modal-sample').classList.remove('active');
        document.getElementById('form-sample').reset();
      } else {
        showToast(data.error || '샘플 신청 실패');
      }
    } catch (err) {
      showToast('샘플 신청 실패');
    }
  });

  // Appointment Form
  document.getElementById('form-appointment').addEventListener('submit', async (e) => {
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
        showToast('상담 일정이 성공적으로 예약되었습니다.');
        document.getElementById('modal-appointment').classList.remove('active');
        document.getElementById('form-appointment').reset();
      } else {
        showToast(data.error || '상담 예약 실패');
      }
    } catch (err) {
      showToast('상담 예약 실패');
    }
  });
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
    if (statusText) statusText.textContent = '상태: WebSocket 연결 해제됨 (재접속 대기)';
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
    statusText.textContent = '상태: 카메라/마이크 권한 요청 중...';
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    
    const localVideo = document.getElementById('local-video');
    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    createPeerConnection();

    // Add local tracks to RTCPeerConnection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    btnStart.style.display = 'none';
    btnEnd.style.display = 'inline-flex';
    statusText.textContent = '상태: 상대방 연결 대기 중 (STUN P2P)';

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    sendSignaling({
      type: 'offer',
      sdp: offer
    });

  } catch (err) {
    console.error('WebRTC getUserMedia error:', err);
    if (err.name === 'NotAllowedError') {
      statusText.textContent = '오류: 카메라/마이크 접근 권한이 거부되었습니다.';
    } else {
      statusText.textContent = `오류: 미디어 장치 연결 실패 (${err.message})`;
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
      if (statusText) statusText.textContent = '상태: 1:1 라이브 화상 연결 완료 (통화 중)';
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const statusText = document.getElementById('webrtc-status-text');
    if (!statusText) return;
    switch (peerConnection.connectionState) {
      case 'connecting':
        statusText.textContent = '상태: P2P 피어 연결 중...';
        break;
      case 'connected':
        statusText.textContent = '상태: 1:1 실시간 화상 상담 연결 완료';
        break;
      case 'disconnected':
      case 'failed':
        statusText.textContent = '상태: 피어 연결 끊김 또는 실패 (STUN NAT)';
        break;
      case 'closed':
        statusText.textContent = '상태: 통화 종료됨';
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
    if (statusText) statusText.textContent = '상태: 상대방이 방에 입장했습니다.';
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

  document.getElementById('btn-start-call').style.display = 'inline-flex';
  document.getElementById('btn-end-call').style.display = 'none';
  document.getElementById('webrtc-status-text').textContent = '상태: 상담 통화가 종료되었습니다.';
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

// 6. Animation Loop
function animate() {
  requestAnimationFrame(animate);
  if (viewerEngine && viewerEngine.controls) {
    viewerEngine.controls.update();
    viewerEngine.renderer.render(viewerEngine.scene, viewerEngine.camera);
    updateHotspotsScreenPosition();
  }
}

window.addEventListener('DOMContentLoaded', initViewer);
