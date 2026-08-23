// generate_clean_matterport.js — TRUE 360° Ultra-HD 8K Matterport Virtual Tour v5.5 (with 8K Photo Download)
const fs = require('fs');
const path = require('path');

const outPath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html';

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>DN'a ROBOTIC | Matterport 3D Ultra-HD 360° Digital Twin Virtual Tour</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<!-- Three.js & Controls -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tween.js/18.6.4/tween.umd.js"></script>

<style>
:root {
  --bg-deep: #030712;
  --panel-bg: rgba(10, 16, 30, 0.88);
  --panel-border: rgba(56, 189, 248, 0.28);
  --cyan: #00c2ff;
  --cyan-glow: rgba(0, 194, 255, 0.55);
  --text-main: #ffffff;
  --text-muted: #94a3b8;
  --font: 'Plus Jakarta Sans', -apple-system, sans-serif;
  --mono: 'JetBrains Mono', monospace;
  --trans: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%; height: 100%; overflow: hidden;
  background: var(--bg-deep); color: var(--text-main);
  font-family: var(--font); user-select: none;
  -webkit-font-smoothing: antialiased;
}
#viewer-container { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; cursor: grab; }
#viewer-container:active { cursor: grabbing; }
#three-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 1; }

/* TOP NAV */
#topbar {
  position: fixed; top: 0; left: 0; right: 0; height: 60px; z-index: 500;
  background: linear-gradient(180deg, rgba(3,7,18,0.95) 0%, rgba(3,7,18,0.7) 70%, transparent 100%);
  display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
  backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.08);
}
.brand-group { display: flex; align-items: center; gap: 12px; }
.brand-logo { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 6px; }
.brand-logo span { color: var(--cyan); }
.brand-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--cyan); background: rgba(0,194,255,0.12); border: 1px solid var(--panel-border); border-radius: 20px; padding: 4px 10px; display: flex; align-items: center; gap: 6px; }
.pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); animation: pulse-dot 1.8s infinite; }
@keyframes pulse-dot { 0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.4);opacity:0.6;} }
.top-actions { display: flex; align-items: center; gap: 10px; }
.btn-ui { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 600; padding: 7px 14px; cursor: pointer; transition: var(--trans); text-decoration: none; }
.btn-ui:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.25); color: #fff; }
.btn-ui.primary { background: #0284c7; border-color: #38bdf8; color: #fff; box-shadow: 0 0 16px rgba(2,132,199,0.4); }
.btn-ui.primary:hover { background: #0369a1; }
.btn-ui.download { background: rgba(0,194,255,0.15); border-color: var(--cyan); color: var(--cyan); }
.btn-ui.download:hover { background: var(--cyan); color: #000; box-shadow: 0 0 16px var(--cyan-glow); }

/* SPATIAL NODES PANEL */
#node-panel {
  position: fixed; top: 70px; left: 16px; z-index: 400;
  background: var(--panel-bg); border: 1px solid var(--panel-border);
  border-radius: 14px; padding: 14px; width: 270px;
  backdrop-filter: blur(20px);
}
.panel-label { font-size: 10px; font-weight: 800; color: var(--cyan); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 10px; }
.node-btn {
  width: 100%; display: flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.04); border: 1px solid transparent;
  border-radius: 8px; color: var(--text-muted); font-size: 12px; font-weight: 500;
  padding: 9px 12px; cursor: pointer; transition: var(--trans); text-align: left; margin-bottom: 4px;
}
.node-btn:hover { background: rgba(0,194,255,0.08); color: #fff; border-color: var(--panel-border); }
.node-btn.active { background: rgba(0,194,255,0.15); border-color: var(--cyan); color: var(--cyan); font-weight: 700; }
.node-icon { font-size: 14px; }

/* 360 HINT OVERLAY */
#hint-360 {
  position: fixed; top: 70px; right: 16px; z-index: 400;
  background: rgba(10, 16, 30, 0.85); border: 1px solid var(--panel-border);
  border-radius: 30px; padding: 8px 16px; font-size: 11px; font-weight: 600;
  color: var(--cyan); backdrop-filter: blur(12px); display: flex; align-items: center; gap: 8px;
  pointer-events: none; animation: fade-out-hint 6s forwards;
}
@keyframes fade-out-hint { 0%,70%{opacity:1;} 100%{opacity:0.35;} }

/* MATTERTAGS */
#mattertags-host { position: fixed; inset: 0; pointer-events: none; z-index: 300; }
.mattertag-element { position: absolute; transform: translate(-50%, -50%); pointer-events: auto; cursor: pointer; }
.mattertag-beacon {
  width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 194, 255, 0.95); box-shadow: 0 0 0 5px rgba(0,194,255,0.35), 0 0 26px var(--cyan);
  animation: beacon-pulse 2s infinite; color: #000; font-size: 14px; font-weight: 900;
}
.mattertag-beacon::after { content: '+'; font-family: var(--font); }
@keyframes beacon-pulse {
  0%,100%{ box-shadow: 0 0 0 5px rgba(0,194,255,0.35), 0 0 26px var(--cyan); transform: scale(1); }
  50%{ box-shadow: 0 0 0 12px rgba(0,194,255,0.12), 0 0 38px var(--cyan); transform: scale(1.1); }
}
.mattertag-card {
  position: absolute; bottom: 36px; left: 50%; transform: translateX(-50%);
  background: var(--panel-bg); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 14px 18px; min-width: 230px; max-width: 270px;
  backdrop-filter: blur(18px); display: none; box-shadow: 0 16px 36px rgba(0,0,0,0.7);
}
.mattertag-element:hover .mattertag-card { display: block; }
.tag-badge { font-size: 9px; font-weight: 800; color: var(--cyan); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px; }
.tag-title { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.tag-desc { font-size: 11px; color: var(--text-muted); line-height: 1.5; margin-bottom: 6px; }
.tag-cta { font-size: 10px; font-weight: 600; color: var(--cyan); }

/* BOOTH RADAR */
#booth-radar {
  position: fixed; bottom: 100px; left: 16px; z-index: 400;
  background: var(--panel-bg); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 10px; backdrop-filter: blur(16px);
}
.radar-label { font-size: 9px; font-weight: 800; color: var(--cyan); letter-spacing: 1px; text-transform: uppercase; display: flex; justify-content: space-between; margin-bottom: 6px; }
#radar-canvas { display: block; }

/* BOTTOM TOOLBAR */
#mode-toolbar {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 400;
  background: var(--panel-bg); border: 1px solid var(--panel-border);
  border-radius: 60px; padding: 6px; backdrop-filter: blur(20px);
  display: flex; align-items: center; gap: 4px;
}
.mode-btn {
  display: flex; align-items: center; gap: 6px; background: transparent; border: none;
  border-radius: 50px; color: var(--text-muted); font-size: 12px; font-weight: 600;
  padding: 10px 18px; cursor: pointer; transition: var(--trans);
}
.mode-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.mode-btn.active { background: var(--cyan); color: #000; box-shadow: 0 0 16px var(--cyan-glow); }
.toolbar-sep { width: 1px; height: 24px; background: rgba(255,255,255,0.12); }

/* MODALS */
.app-modal {
  display: none; position: fixed; inset: 0; z-index: 900;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
  align-items: center; justify-content: center;
}
.app-modal.open { display: flex; }
.modal-box {
  background: linear-gradient(135deg, #0a0f1e 0%, #0c1424 100%);
  border: 1px solid var(--panel-border); border-radius: 20px;
  padding: 30px; max-width: 520px; width: 92%; position: relative;
  box-shadow: 0 40px 80px rgba(0,0,0,0.7);
}
.modal-close { position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.08); border: none; border-radius: 50%; width: 32px; height: 32px; color: #fff; font-size: 14px; cursor: pointer; }
.spec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.spec-item { background: rgba(255,255,255,0.04); border: 1px solid var(--panel-border); border-radius: 8px; padding: 10px 12px; }
.spec-k { font-size: 10px; color: var(--text-muted); font-weight: 600; margin-bottom: 2px; }
.spec-v { font-size: 13px; color: var(--cyan); font-weight: 700; font-family: var(--mono); }

/* DOWNLOAD CARDS */
.dl-card {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(255,255,255,0.04); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 12px 16px; margin-bottom: 10px; transition: var(--trans);
}
.dl-card:hover { background: rgba(0,194,255,0.08); border-color: var(--cyan); }
.dl-info { display: flex; flex-direction: column; gap: 2px; }
.dl-title { font-size: 13px; font-weight: 700; color: #fff; }
.dl-meta { font-size: 11px; color: var(--text-muted); }
.dl-btn {
  background: #0284c7; border: 1px solid #38bdf8; border-radius: 6px;
  color: #fff; font-size: 11px; font-weight: 700; padding: 6px 14px;
  text-decoration: none; display: flex; align-items: center; gap: 4px;
  transition: var(--trans);
}
.dl-btn:hover { background: #0369a1; box-shadow: 0 0 12px var(--cyan-glow); }

/* TOAST */
#toast {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%) translateY(10px);
  background: rgba(0,194,255,0.15); border: 1px solid var(--cyan);
  border-radius: 30px; padding: 10px 20px; font-size: 13px; font-weight: 600;
  color: var(--cyan); backdrop-filter: blur(12px); z-index: 800;
  opacity: 0; transition: all 0.3s ease; pointer-events: none;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
</head>
<body>
<div id="viewer-container">
  <canvas id="three-canvas"></canvas>
</div>
<div id="mattertags-host"></div>

<!-- TOP BAR -->
<div id="topbar">
  <div class="brand-group">
    <a href="/" class="brand-logo">dn' <span>a</span> ROBOTIC</a>
    <div class="brand-badge"><div class="pulse-dot"></div> MATTERPORT 360° ULTRA-HD</div>
  </div>
  <div class="top-actions">
    <a href="/demo.html" class="btn-ui">← 3D 쇼룸</a>
    <a href="/demo-splat.html" class="btn-ui">△ 3DGS 뷰어</a>
    <button class="btn-ui download" onclick="openDownloadModal()">📥 8K 원본 사진 다운로드</button>
    <button class="btn-ui" onclick="toggleFullscreen()">⛶ 전체화면</button>
    <button class="btn-ui primary" onclick="openRFQ()">📋 RFQ 견적 요청</button>
  </div>
</div>

<!-- 360 INTERACTION HINT -->
<div id="hint-360">
  <span>🔄</span> 360° 마우스 드래그로 전 방향 자유 회전
</div>

<!-- SPATIAL NODES PANEL -->
<div id="node-panel">
  <div class="panel-label">SPATIAL VANTAGE POINTS</div>
  <button class="node-btn active" id="nb-0" onclick="switchNode(0)"><span class="node-icon">📷</span> 01. 부스 메인 360° (Main 360°)</button>
  <button class="node-btn" id="nb-1" onclick="switchNode(1)"><span class="node-icon">🤖</span> 02. 전면 코봇 워크스테이션 (CoBots)</button>
  <button class="node-btn" id="nb-2" onclick="switchNode(2)"><span class="node-icon">🚛</span> 03. AMR 자율주행 물류 존 (AMR AGV)</button>
</div>

<!-- BOOTH RADAR -->
<div id="booth-radar">
  <div class="radar-label">
    <span>BOOTH RADAR</span>
    <span id="radar-loc-txt">01. MAIN 360°</span>
  </div>
  <canvas id="radar-canvas" width="146" height="116"></canvas>
</div>

<!-- BOTTOM TOOLBAR -->
<div id="mode-toolbar">
  <button class="mode-btn active" id="btn-mode-tour" onclick="setMode('tour')">
    <span>📸</span> 360° 실사 투어
  </button>
  <button class="mode-btn" id="btn-mode-dollhouse" onclick="setMode('dollhouse')">
    <span>🏠</span> 3D Dollhouse
  </button>
  <button class="mode-btn" id="btn-mode-floor" onclick="setMode('floor')">
    <span>🗺️</span> 2D 평면도
  </button>
  <div class="toolbar-sep"></div>
  <button class="mode-btn" id="btn-autotour" onclick="toggleAutoTour()">
    <span>▶</span> AUTO TOUR
  </button>
</div>

<!-- Product Detail Modal -->
<div class="app-modal" id="product-modal" onclick="if(event.target===this)closeModal()">
  <div class="modal-box">
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div style="font-size:10px;font-weight:800;color:var(--cyan);letter-spacing:1px;text-transform:uppercase;" id="m-badge">INDUSTRIAL COLLABORATIVE ROBOT</div>
    <h2 style="font-size:24px;font-weight:800;color:#fff;margin:6px 0 2px;" id="m-name">DN'a Apex CoBot X16</h2>
    <p style="font-size:12px;color:var(--text-muted);line-height:1.6;" id="m-desc">고정밀 6축 협동로봇</p>
    <div class="spec-grid" id="m-specs"></div>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button class="btn-ui primary" style="flex:1;justify-content:center;padding:12px;" onclick="openRFQ()">📝 RFQ 즉시 견적 요청</button>
      <button class="btn-ui" style="padding:12px;" onclick="closeModal()">닫기</button>
    </div>
  </div>
</div>

<!-- 8K Photo Download Modal -->
<div class="app-modal" id="download-modal" onclick="if(event.target===this)closeDownloadModal()">
  <div class="modal-box">
    <button class="modal-close" onclick="closeDownloadModal()">✕</button>
    <div style="font-size:10px;font-weight:800;color:var(--cyan);letter-spacing:1px;text-transform:uppercase;">8K ULTRA-HD ORIGINAL ASSETS</div>
    <h2 style="font-size:20px;font-weight:800;color:#fff;margin:6px 0 6px;">📸 360° 고화질 원본 사진 다운로드</h2>
    <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">
      Matterport 3D 투어에 사용된 8K 해상도(8192x4096) Equirectangular 무손실 실사 원본 이미지 3종입니다.
    </p>

    <div class="dl-card">
      <div class="dl-info">
        <div class="dl-title">01. 부스 메인 360° 전경 (Main 360°)</div>
        <div class="dl-meta">8K Equirectangular JPG · 초고해상도 메인 뷰</div>
      </div>
      <a href="/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg" download="DN_a_Booth_Main_360_8K.jpg" class="dl-btn">⬇ 다운로드</a>
    </div>

    <div class="dl-card">
      <div class="dl-info">
        <div class="dl-title">02. 전면 코봇 워크스테이션 (CoBots)</div>
        <div class="dl-meta">8K Equirectangular JPG · 6축 협동로봇 전시대</div>
      </div>
      <a href="/assets/demo/dna-showcase/pano360/node1_360_cobots_8k.jpg" download="DN_a_CoBots_Workstation_360_8K.jpg" class="dl-btn">⬇ 다운로드</a>
    </div>

    <div class="dl-card">
      <div class="dl-info">
        <div class="dl-title">03. AMR 자율주행 물류 존 (AMR AGV)</div>
        <div class="dl-meta">8K Equirectangular JPG · 물류 로봇 & AI 미디어 월</div>
      </div>
      <a href="/assets/demo/dna-showcase/pano360/node2_360_amr_8k.jpg" download="DN_a_AMR_Zone_360_8K.jpg" class="dl-btn">⬇ 다운로드</a>
    </div>

    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn-ui primary" style="flex:1;justify-content:center;padding:12px;" onclick="downloadAllPhotos()">📦 3종 전체 다운로드</button>
      <button class="btn-ui" style="padding:12px;" onclick="closeDownloadModal()">닫기</button>
    </div>
  </div>
</div>

<div id="toast">알림</div>

<script>
/* ═══════════════════════════════════════════════════════════
   MATTERPORT 3D SPATIAL DIGITAL TWIN ENGINE  v5.5
   - True 360° Equirectangular Sphere Panoramic Environment
   - 8K Ultra-HD Photorealistic Texture Mapping
   - Exact 3D Subpixel Coordinate Mattertag Pins
   - Smooth 360° Free Look-Around OrbitControls
   - 3D Floor Navigation Rings with Smooth Transitions
   - 8K High-Resolution Photo Download Suite
═══════════════════════════════════════════════════════════ */

// 1. SPATIAL NODES (True 360° Equirectangular 8K Photoreal Assets)
const SPATIAL_NODES = [
  {
    id: 0,
    name: "01. 부스 메인 360° (Main 360°)",
    image: "/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg",
    puckPos: new THREE.Vector3(0, -160, -320),
    radarPos: { x: 73, y: 100 }
  },
  {
    id: 1,
    name: "02. 전면 코봇 워크스테이션 (CoBots)",
    image: "/assets/demo/dna-showcase/pano360/node1_360_cobots_8k.jpg",
    puckPos: new THREE.Vector3(60, -160, -260),
    radarPos: { x: 73, y: 65 }
  },
  {
    id: 2,
    name: "03. AMR 자율주행 물류 존 (AMR AGV)",
    image: "/assets/demo/dna-showcase/pano360/node2_360_amr_8k.jpg",
    puckPos: new THREE.Vector3(-160, -160, -220),
    radarPos: { x: 45, y: 80 }
  }
];

// 2. 3D MATTERTAGS (Exact Real Object 3D Coordinates on the Sphere)
const MATTERTAGS = [
  {
    id: 'center-screen',
    badge: 'Smart Factory Center',
    title: 'DN\\\'a 중앙 인터랙티브 비전 월',
    desc: '부스 중앙 3D 로봇 모션 그래픽 비디오 파사드 & 관제 센터',
    worldPos: new THREE.Vector3(0, 50, -400),
    specs: [
      ['디스플레이', 'Seamless Curved LED'], ['주요기술', 'AI Vision Telemetry'],
      ['관제솔루션', 'DN\\\'a Smart Twin Engine']
    ]
  },
  {
    id: 'cobot-array',
    badge: 'Collaborative Robot Array',
    title: 'DN\\\'a CoBot X16 — 협동로봇 전시대',
    desc: '중앙 원형 전시대 6축 정밀 협동로봇 라인업 — ±0.025mm 반복 정밀도, 고속 픽앤플레이스',
    worldPos: new THREE.Vector3(0, -90, -380),
    specs: [
      ['가반하중', '16.0 kg'], ['작업반경', '1300 mm'],
      ['반복정밀도', '±0.025 mm'], ['안전등급', 'ISO TS 15066'],
      ['통신규격', 'EtherCAT / PROFINET'], ['가격대', '$38,500 – $42,000']
    ]
  },
  {
    id: 'amr-vector-1',
    badge: 'Autonomous Logistics',
    title: 'DN\\\'a Vector AMR 600 (Floor AGV)',
    desc: 'Laser SLAM 자율주행 물류 로봇 — 최대 600kg 적재, 360° LiDAR 장애물 회피',
    worldPos: new THREE.Vector3(-220, -140, -280),
    specs: [
      ['적재중량', '600 kg'], ['최대속도', '2.0 m/s'],
      ['항법방식', '3D LiDAR SLAM'], ['연속작동', '10 시간 (급속충전)'],
      ['안전인증', 'ISO 3691-4'], ['가격대', '$34,000 – $39,500']
    ]
  },
  {
    id: 'media-wall',
    badge: 'Digital Media Wall',
    title: 'AI · Vision · Automation LED 월',
    desc: '16:9 대형 미디어 파사드 — 실시간 스마트 팩토리 대시보드 및 로봇 제어 현황',
    worldPos: new THREE.Vector3(-310, 40, -240),
    specs: [
      ['해상도', '4K UHD Fine-Pitch'], ['휘도', '1200 nits'],
      ['화면크기', '6000 x 3400 mm'], ['인터페이스', 'Real-time Telemetry']
    ]
  },
  {
    id: 'canopy-arch',
    badge: 'Smart Factory Booth',
    title: 'DN\\\'a ROBOTIC 메인 캐노피 아치',
    desc: 'NEXT-GEN ROBOTIC SOLUTIONS — 미래형 스마트 팩토리 토탈 솔루션 부스',
    worldPos: new THREE.Vector3(0, 220, -320),
    specs: [
      ['부스규모', '18 x 12 m (216㎡)'], ['주요기술', 'AI CoBot, AMR SLAM'],
      ['전시인증', 'CE / ISO 9001'], ['현장상담', 'VIP 부스 1:1 매칭']
    ]
  }
];

let currentNodeIdx = 0;
let currentMode = 'tour';
let scene, camera, renderer, controls;
let floorPucks = [];
let photoSphere, photoMaterial;
let textureLoader;
let textureCache = {};
let autoTourActive = false, autoTourTimer = null;

// 3. INIT THREE.JS 360 SPATIAL SCENE
function initThree() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();
  textureLoader = new THREE.TextureLoader();

  // 70° FOV Camera
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 0, 0.01);

  // Full DPR rendering for 8K sharpness
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'highp'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // 360° Free Look-Around OrbitControls
  controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = true;
  controls.minDistance = 0.005;
  controls.maxDistance = 0.05;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI * 0.88; // 158° (look down at floor)
  controls.minPolarAngle = Math.PI * 0.12; // 22° (look up at ceiling)
  controls.rotateSpeed = -0.42; // Natural drag direction

  // ── TRUE 360° EQUIRECTANGULAR SPHERE (Radius 500) ──
  const sphereGeo = new THREE.SphereGeometry(500, 128, 64);
  sphereGeo.scale(-1, 1, 1); // Render inside of the sphere

  photoMaterial = new THREE.MeshBasicMaterial({
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });
  photoSphere = new THREE.Mesh(sphereGeo, photoMaterial);
  photoSphere.rotation.y = -Math.PI * 0.5; // Align center of booth straight ahead at -Z
  photoSphere.position.set(0, 0, 0);
  photoSphere.renderOrder = -1;
  scene.add(photoSphere);

  buildFloorPucks();
  buildMattertagsDOM();

  window.addEventListener('resize', onResize);
  requestAnimationFrame(animate);

  switchNode(0);
}

// 4. FLOOR PUCKS (Glowing 360 Navigation Rings on Floor)
function buildFloorPucks() {
  SPATIAL_NODES.forEach((node, idx) => {
    const g = new THREE.Group();
    g.position.copy(node.puckPos);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(18, 28, 36),
      new THREE.MeshBasicMaterial({ color: 0x00c2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);

    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(14, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.2;
    g.add(disk);

    g.userData.nodeIdx = idx;
    g.traverse(c => { if (c.isMesh) c.userData.nodeIdx = idx; });
    scene.add(g);
    floorPucks.push(g);
  });

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  document.getElementById('three-canvas').addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorPucks.flatMap(g => g.children));
    if (hits.length > 0 && hits[0].object.userData.nodeIdx !== undefined) {
      switchNode(hits[0].object.userData.nodeIdx);
    }
  });
}

// 5. 3D MATTERTAGS DOM
function buildMattertagsDOM() {
  const host = document.getElementById('mattertags-host');
  MATTERTAGS.forEach((tag, idx) => {
    const el = document.createElement('div');
    el.className = 'mattertag-element';
    el.id = 'mtag-' + idx;
    el.innerHTML =
      '<div class="mattertag-beacon"></div>' +
      '<div class="mattertag-card">' +
        '<div class="tag-badge">' + tag.badge + '</div>' +
        '<div class="tag-title">' + tag.title + '</div>' +
        '<div class="tag-desc">' + tag.desc + '</div>' +
        '<div class="tag-cta">클릭하여 정밀 스펙 확인 &rarr;</div>' +
      '</div>';
    el.addEventListener('click', () => openProductModal(idx));
    host.appendChild(el);
    tag.domElement = el;
  });
}

// 6. HIGH-RESOLUTION TEXTURE LOADER
function loadNodeTexture(url, callback) {
  if (textureCache[url]) { callback(textureCache[url]); return; }
  textureLoader.load(url, (tex) => {
    tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    textureCache[url] = tex;
    callback(tex);
  });
}

// 7. SWITCH SPATIAL NODE (with smooth Matterport fade)
function switchNode(idx) {
  currentNodeIdx = idx;
  const node = SPATIAL_NODES[idx];

  document.querySelectorAll('.node-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  document.getElementById('radar-loc-txt').textContent = node.name.toUpperCase();

  // Smooth cross-fade transition
  new TWEEN.Tween(photoMaterial)
    .to({ opacity: 0.3 }, 250)
    .onComplete(() => {
      loadNodeTexture(node.image, (tex) => {
        photoMaterial.map = tex;
        photoMaterial.needsUpdate = true;
        new TWEEN.Tween(photoMaterial).to({ opacity: 1.0 }, 400).start();
      });
    })
    .start();

  floorPucks.forEach((p, i) => {
    p.children[0].material.opacity = (i === idx) ? 0.20 : 0.85;
    p.children[1].material.opacity = (i === idx) ? 0.30 : 0.9;
  });

  drawRadar();
  showToast('📍 ' + node.name + ' 공간으로 이동했습니다.');
}

// 8. VIEW MODES
function setMode(mode) {
  currentMode = mode;
  ['tour','dollhouse','floor'].forEach(m => document.getElementById('btn-mode-' + m).classList.toggle('active', m === mode));
  if (mode === 'tour') {
    photoSphere.visible = true;
    photoMaterial.opacity = 1.0;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.minPolarAngle = Math.PI * 0.12;
    showToast('📸 360° 초고화질 실사 파노라마 투어');
  } else if (mode === 'dollhouse') {
    showToast('🏠 3D Dollhouse 입체 모드');
  } else if (mode === 'floor') {
    showToast('🗺️ 2D 부스 평면도 모드');
  }
}

// 9. AUTO TOUR
function toggleAutoTour() {
  const btn = document.getElementById('btn-autotour');
  if (autoTourActive) {
    clearInterval(autoTourTimer);
    autoTourActive = false;
    btn.classList.remove('active');
    btn.innerHTML = '<span>▶</span> AUTO TOUR';
    showToast('⏹ 자동 투어 정지');
  } else {
    autoTourActive = true;
    btn.classList.add('active');
    btn.innerHTML = '<span>⏹</span> 투어 정지';
    showToast('▶ 5초 간격 Matterport 자동 가이드 투어 시작');
    let ni = (currentNodeIdx + 1) % SPATIAL_NODES.length;
    switchNode(ni);
    autoTourTimer = setInterval(() => { ni = (currentNodeIdx + 1) % SPATIAL_NODES.length; switchNode(ni); }, 5000);
  }
}

// 10. RADAR MINIMAP
function drawRadar() {
  const cvs = document.getElementById('radar-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.strokeStyle = '#00c2ff'; ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 12, 114, 92);
  ctx.fillStyle = '#ffffff';
  [[16,12],[130,12],[16,104],[130,104]].forEach(([x,y]) => ctx.fillRect(x-2, y-2, 5, 5));
  SPATIAL_NODES.forEach((n, idx) => {
    const isCur = idx === currentNodeIdx;
    ctx.beginPath();
    ctx.arc(n.radarPos.x, n.radarPos.y, isCur ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isCur ? '#00c2ff' : 'rgba(255,255,255,0.4)';
    ctx.fill();
    if (isCur) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }
  });
  const cur = SPATIAL_NODES[currentNodeIdx];
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const angle = Math.atan2(camDir.x, camDir.z);
  ctx.fillStyle = 'rgba(0,194,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(cur.radarPos.x, cur.radarPos.y);
  ctx.arc(cur.radarPos.x, cur.radarPos.y, 24, angle - 0.4, angle + 0.4);
  ctx.closePath();
  ctx.fill();
}

// 11. MATTERTAG SCREEN PROJECTION
function updateMattertags() {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  MATTERTAGS.forEach(tag => {
    if (!tag.domElement) return;
    const dot = tag.worldPos.dot(camDir);
    if (dot <= 0 || currentMode !== 'tour') {
      tag.domElement.style.display = 'none';
      return;
    }
    const wp = tag.worldPos.clone();
    wp.project(camera);
    if (wp.z > 1.0) {
      tag.domElement.style.display = 'none';
      return;
    }
    tag.domElement.style.display = 'block';
    tag.domElement.style.left = ((wp.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    tag.domElement.style.top  = ((-(wp.y * 0.5) + 0.5) * window.innerHeight) + 'px';
  });
}

// 12. MODALS & UTILS
function openProductModal(idx) {
  const p = MATTERTAGS[idx];
  if (!p) return;
  document.getElementById('m-badge').textContent = p.badge;
  document.getElementById('m-name').textContent = p.title;
  document.getElementById('m-desc').textContent = p.desc;
  document.getElementById('m-specs').innerHTML = p.specs.map(([k,v]) =>
    '<div class="spec-item"><div class="spec-k">' + k + '</div><div class="spec-v">' + v + '</div></div>'
  ).join('');
  document.getElementById('product-modal').classList.add('open');
}
function closeModal() { document.getElementById('product-modal').classList.remove('open'); }

function openDownloadModal() { document.getElementById('download-modal').classList.add('open'); }
function closeDownloadModal() { document.getElementById('download-modal').classList.remove('open'); }

function downloadAllPhotos() {
  SPATIAL_NODES.forEach((n, idx) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = n.image;
      a.download = 'DN_a_360_Node_' + idx + '_8K.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, idx * 600);
  });
  showToast('📥 8K 원본 사진 3종 다운로드가 시작되었습니다.');
}

function openRFQ() { window.open('mailto:sales@dna-robotic.com?subject=RFQ%20from%20Matterport%20Digital%20Twin'); }
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// 13. RENDER LOOP
function animate(time) {
  requestAnimationFrame(animate);
  TWEEN.update(time);
  controls.update();
  updateMattertags();
  drawRadar();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
}

document.addEventListener('DOMContentLoaded', initThree);
</script>
</body>
</html>`;

fs.writeFileSync(outPath, html, { encoding: 'utf8' });
console.log('Written demo-matterport.html v5.5! Size:', fs.statSync(outPath).size);
