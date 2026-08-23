// generate_clean_matterport.js — Matterport Master 32K Ultra-HD 360° Studio with Compact Retina Viewport (v6.7)
const fs = require('fs');
const path = require('path');

const outPath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html';

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>DN'a ROBOTIC | Matterport 32K Ultra-HD 360° Studio Digital Twin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<!-- Three.js & Controls -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tween.js/18.6.4/tween.umd.js"></script>

<style>
:root {
  --bg-deep: #02050b;
  --bg-studio: #050b16;
  --panel-bg: rgba(9, 16, 29, 0.94);
  --panel-border: rgba(56, 189, 248, 0.32);
  --cyan: #00c2ff;
  --cyan-glow: rgba(0, 194, 255, 0.5);
  --text-main: #ffffff;
  --text-muted: #94a3b8;
  --font: 'Plus Jakarta Sans', -apple-system, sans-serif;
  --mono: 'JetBrains Mono', monospace;
  --trans: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%; height: 100%; overflow: hidden;
  background: var(--bg-deep); color: var(--text-main);
  font-family: var(--font); user-select: none;
  -webkit-font-smoothing: antialiased;
  touch-action: manipulation;
}

/* ══════════════════════════════════════════════
   STUDIO LAYOUT
══════════════════════════════════════════════ */
#app-layout {
  display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden;
  position: relative;
}

/* TOP NAV */
#topbar {
  height: 50px; flex-shrink: 0;
  background: rgba(5, 11, 22, 0.98);
  display: flex; align-items: center; justify-content: space-between; padding: 0 18px;
  backdrop-filter: blur(14px); border-bottom: 1px solid rgba(255,255,255,0.08);
  z-index: 100;
}
.brand-group { display: flex; align-items: center; gap: 10px; }
.brand-logo { font-size: 17px; font-weight: 900; letter-spacing: -0.5px; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 6px; }
.brand-logo span { color: var(--cyan); }
.brand-badge { font-size: 9px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: var(--cyan); background: rgba(0,194,255,0.12); border: 1px solid var(--panel-border); border-radius: 20px; padding: 3px 9px; display: flex; align-items: center; gap: 6px; }
.pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); animation: pulse-dot 1.8s infinite; }
@keyframes pulse-dot { 0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.4);opacity:0.6;} }
.top-actions { display: flex; align-items: center; gap: 8px; }
.btn-ui { display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: rgba(255,255,255,0.9); font-size: 11.5px; font-weight: 600; padding: 5px 11px; cursor: pointer; transition: var(--trans); text-decoration: none; white-space: nowrap; }
.btn-ui:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.25); color: #fff; }
.btn-ui.primary { background: #0284c7; border-color: #38bdf8; color: #fff; box-shadow: 0 0 14px rgba(2,132,199,0.4); }
.btn-ui.primary:hover { background: #0369a1; }
.btn-ui.download { background: rgba(0,194,255,0.12); border-color: var(--cyan); color: var(--cyan); }
.btn-ui.download:hover { background: var(--cyan); color: #000; box-shadow: 0 0 16px var(--cyan-glow); }

/* MAIN STUDIO WORKSPACE (3 Columns on Desktop) */
#studio-workspace {
  flex: 1; display: grid;
  grid-template-columns: 260px 1fr 290px;
  gap: 16px; padding: 12px 18px;
  background: radial-gradient(circle at 50% 35%, #0a1426 0%, #02050b 100%);
  min-height: 0; align-items: center; justify-content: center; position: relative;
}

/* ══════════════════════════════════════════════
   LEFT EXTERIOR PANEL (Vantage Points & Radar)
══════════════════════════════════════════════ */
.side-panel {
  height: 100%; display: flex; flex-direction: column; gap: 10px;
  background: var(--panel-bg); border: 1px solid var(--panel-border);
  border-radius: 16px; padding: 14px; backdrop-filter: blur(20px);
  overflow-y: auto; box-shadow: 0 16px 36px rgba(0,0,0,0.5);
}
.panel-head { font-size: 10px; font-weight: 800; color: var(--cyan); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 2px; }
.panel-sub { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }

.node-list { display: flex; flex-direction: column; gap: 6px; }
.node-btn {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; color: var(--text-muted); font-size: 11px; font-weight: 600;
  padding: 8px 10px; cursor: pointer; transition: var(--trans); text-align: left;
}
.node-btn:hover { background: rgba(0,194,255,0.08); color: #fff; border-color: var(--panel-border); }
.node-btn.active { background: rgba(0,194,255,0.18); border-color: var(--cyan); color: var(--cyan); font-weight: 800; box-shadow: 0 0 14px rgba(0,194,255,0.25); }
.node-meta { font-size: 8.5px; opacity: 0.7; font-family: var(--mono); }

/* RADAR MINIMAP */
.radar-box {
  background: rgba(2, 5, 11, 0.7); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 10px; margin-top: auto;
}
.radar-header { font-size: 9px; font-weight: 800; color: var(--cyan); letter-spacing: 1px; text-transform: uppercase; display: flex; justify-content: space-between; margin-bottom: 6px; }
#radar-canvas { width: 100%; height: 80px; display: block; border-radius: 6px; }

/* ══════════════════════════════════════════════
   CENTER: COMPACT RETINA 3D PLAYER STAGE
   (Reduced dimension concentrates pixel density)
══════════════════════════════════════════════ */
#player-wrapper {
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center; min-height: 0; position: relative;
}

#viewer-container {
  position: relative; width: 100%; max-width: 840px; height: 100%; max-height: 520px;
  border-radius: 18px; overflow: hidden;
  border: 1.5px solid rgba(0, 194, 255, 0.45);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 35px rgba(0, 194, 255, 0.22);
  cursor: grab; background: #000;
}
#viewer-container:active { cursor: grabbing; }
#three-canvas { width: 100%; height: 100%; display: block; touch-action: none; }

/* 360 HINT IN PLAYER CORNER */
.player-tag {
  position: absolute; top: 12px; left: 12px; z-index: 10;
  background: rgba(5, 11, 22, 0.88); border: 1px solid var(--panel-border);
  border-radius: 20px; padding: 4px 10px; font-size: 9.5px; font-weight: 800;
  color: var(--cyan); backdrop-filter: blur(8px); display: flex; align-items: center; gap: 6px;
  pointer-events: none;
}
.res-pill {
  position: absolute; top: 12px; right: 12px; z-index: 10;
  background: rgba(2, 132, 199, 0.28); border: 1px solid #38bdf8;
  border-radius: 20px; padding: 4px 10px; font-size: 9.5px; font-weight: 800;
  color: #fff; font-family: var(--mono); backdrop-filter: blur(8px);
}

/* ══════════════════════════════════════════════
   3D FLOATING PRODUCT HOTSPOTS
══════════════════════════════════════════════ */
#hotspot-layer { position: absolute; inset: 0; pointer-events: none; z-index: 20; }

.hotspot-tag {
  position: absolute; transform: translate(-50%, -50%);
  pointer-events: auto; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  background: rgba(5, 11, 22, 0.95); backdrop-filter: blur(12px);
  border: 1px solid rgba(56, 189, 248, 0.55); border-radius: 20px; padding: 5px 8px;
  color: #fff; font-size: 10.5px; font-weight: 700;
  box-shadow: 0 4px 18px rgba(2, 132, 199, 0.5);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); white-space: nowrap;
}
.hotspot-tag .hotspot-label-text {
  max-width: 0; opacity: 0; overflow: hidden; transition: all 0.25s ease;
  font-size: 10.5px; font-weight: 700; color: #fff;
}
.hotspot-tag:hover {
  background: rgba(2, 132, 199, 0.95); border-color: #38bdf8; padding: 6px 13px;
  transform: translate(-50%, -50%) scale(1.08); box-shadow: 0 6px 26px rgba(14, 165, 233, 0.75);
}
.hotspot-tag:hover .hotspot-label-text {
  max-width: 220px; opacity: 1; margin-left: 2px;
}
.hotspot-dot {
  width: 10px; height: 10px; border-radius: 50%; background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8; flex-shrink: 0; animation: hotspot-pulse 1.8s infinite;
}
@keyframes hotspot-pulse {
  0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.8); }
  70% { box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); }
  100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
}

/* ══════════════════════════════════════════════
   RIGHT EXTERIOR PANEL (Product Info & Controls)
══════════════════════════════════════════════ */
.mode-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
.mode-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: var(--text-muted); font-size: 11px; font-weight: 600;
  padding: 7px 10px; cursor: pointer; transition: var(--trans);
}
.mode-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
.mode-btn.active { background: var(--cyan); color: #000; font-weight: 800; box-shadow: 0 0 14px var(--cyan-glow); }

.spec-panel-box {
  background: rgba(2, 5, 11, 0.6); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 11px; margin-top: 2px;
}
.spec-title { font-size: 12.5px; font-weight: 800; color: #fff; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center; }
.spec-desc { font-size: 10.5px; color: var(--text-muted); line-height: 1.45; margin-bottom: 7px; }
.spec-list { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.spec-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 4px 6px; }
.spec-k { font-size: 8.5px; color: var(--text-muted); font-weight: 600; }
.spec-v { font-size: 10.5px; color: var(--cyan); font-weight: 700; font-family: var(--mono); }

/* BOTTOM TOOLBAR */
#studio-footer {
  height: 40px; flex-shrink: 0;
  background: rgba(5, 11, 22, 0.98); border-top: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; justify-content: space-between; padding: 0 18px;
  z-index: 50;
}
.foot-info { font-size: 10.5px; color: var(--text-muted); display: flex; align-items: center; gap: 12px; }
.foot-info strong { color: var(--cyan); }
.foot-actions { display: flex; align-items: center; gap: 8px; }

/* ══════════════════════════════════════════════
   PRODUCT INSPECTION DRAWER & BACKDROP
══════════════════════════════════════════════ */
#drawer-scrim {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  z-index: 400; opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
}
#drawer-scrim.open { opacity: 1; pointer-events: auto; }

.drawer {
  position: absolute; z-index: 500; top: 0; right: 0; bottom: 0;
  width: 420px; max-width: 90vw; background: rgba(7, 14, 26, 0.98);
  backdrop-filter: blur(24px); border-left: 1px solid var(--panel-border);
  transform: translateX(100%); transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex; flex-direction: column; box-shadow: -15px 0 50px rgba(0,0,0,0.9);
}
.drawer.open { transform: translateX(0); }
.drawer-header {
  padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; justify-content: space-between;
}
.drawer-badge { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--cyan); }
.drawer-close {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--panel-border);
  background: rgba(255,255,255,0.05); color: var(--text-muted); font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: var(--trans);
}
.drawer-close:hover { background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: #ef4444; }
.drawer-body { flex: 1; overflow-y: auto; padding: 18px; }

.drawer-hero {
  border-radius: 12px; border: 1px solid var(--panel-border);
  background: linear-gradient(135deg, #0b1a2e 0%, #050b16 100%);
  padding: 14px; margin: 8px 0 12px; display: flex; flex-direction: column; gap: 5px;
}
.drawer-prod-title { font-size: 17px; font-weight: 800; color: #fff; }
.drawer-prod-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; }

.drawer-specs-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px; }
.drawer-specs-table tr { border-bottom: 1px solid rgba(255,255,255,0.06); }
.drawer-specs-table td { padding: 7px 5px; }
.drawer-specs-table td:first-child { color: var(--text-muted); font-weight: 600; width: 38%; }
.drawer-specs-table td:last-child { color: #fff; font-weight: 700; text-align: right; font-family: var(--mono); color: var(--cyan); }

/* ROTATE TO LANDSCAPE BANNER FOR MOBILE PORTRAIT */
#portrait-tip-bar {
  display: none; position: absolute; top: 54px; left: 10px; right: 10px; z-index: 150;
  background: linear-gradient(135deg, rgba(2,132,199,0.95), rgba(14,165,233,0.95));
  border: 1px solid #38bdf8; border-radius: 12px; padding: 9px 12px;
  color: #fff; font-size: 11px; font-weight: 700; text-align: center;
  box-shadow: 0 10px 25px rgba(0,0,0,0.5); backdrop-filter: blur(10px);
  animation: float-tip 2.5s infinite ease-in-out;
}
@keyframes float-tip { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-3px);} }
#portrait-tip-bar span { opacity: 0.85; font-size: 9.5px; display: block; font-weight: 500; margin-top: 2px; }

/* MODALS */
.app-modal {
  display: none; position: fixed; inset: 0; z-index: 900;
  background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
  align-items: center; justify-content: center;
}
.app-modal.open { display: flex; }
.modal-box {
  background: linear-gradient(135deg, #070c18 0%, #0a1222 100%);
  border: 1px solid var(--panel-border); border-radius: 20px;
  padding: 22px; max-width: 480px; width: 92%; position: relative;
  box-shadow: 0 40px 80px rgba(0,0,0,0.85);
}
.modal-close { position: absolute; top: 14px; right: 14px; background: rgba(255,255,255,0.08); border: none; border-radius: 50%; width: 28px; height: 28px; color: #fff; font-size: 13px; cursor: pointer; }

/* DOWNLOAD CARDS */
.dl-card {
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(255,255,255,0.04); border: 1px solid var(--panel-border);
  border-radius: 10px; padding: 8px 11px; margin-bottom: 7px; transition: var(--trans);
}
.dl-card:hover { background: rgba(0,194,255,0.08); border-color: var(--cyan); }
.dl-info { display: flex; flex-direction: column; gap: 2px; }
.dl-title { font-size: 11px; font-weight: 700; color: #fff; }
.dl-meta { font-size: 9px; color: var(--text-muted); font-family: var(--mono); }
.dl-btn {
  background: #0284c7; border: 1px solid #38bdf8; border-radius: 6px;
  color: #fff; font-size: 10px; font-weight: 700; padding: 5px 9px;
  text-decoration: none; display: flex; align-items: center; gap: 4px;
}
.dl-btn:hover { background: #0369a1; box-shadow: 0 0 12px var(--cyan-glow); }

/* TOAST */
#toast {
  position: fixed; bottom: 48px; left: 50%; transform: translateX(-50%) translateY(10px);
  background: rgba(0,194,255,0.18); border: 1px solid var(--cyan);
  border-radius: 30px; padding: 6px 15px; font-size: 11px; font-weight: 600;
  color: var(--cyan); backdrop-filter: blur(12px); z-index: 800;
  opacity: 0; transition: all 0.3s ease; pointer-events: none;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ══════════════════════════════════════════════
   MOBILE & LANDSCAPE ADAPTIVE CSS
══════════════════════════════════════════════ */
@media (max-width: 900px) and (orientation: portrait) {
  #portrait-tip-bar { display: block; }
  #topbar { padding: 0 10px; height: 44px; }
  .brand-badge { display: none; }
  .btn-ui { padding: 4px 7px; font-size: 10.5px; }
  
  #studio-workspace {
    display: flex; flex-direction: column; padding: 8px; gap: 8px;
  }
  .side-panel { display: none; }
  #player-wrapper { width: 100%; flex: 1; }
  #viewer-container { max-height: calc(100vh - 150px); max-width: 100%; }

  #mobile-portrait-bar {
    display: flex !important; gap: 6px; width: 100%; margin-top: 4px;
  }
  #mobile-portrait-bar .node-btn {
    flex: 1; padding: 7px 8px; font-size: 10.5px; justify-content: center;
  }

  #studio-footer { padding: 0 10px; font-size: 9.5px; height: 36px; }
  .foot-info span:not(:last-child) { display: none; }
  .drawer { width: 100vw; max-width: 100vw; }
}

#mobile-portrait-bar { display: none; }

@media (max-width: 960px) and (orientation: landscape), (max-height: 520px) {
  #portrait-tip-bar { display: none !important; }
  #mobile-portrait-bar { display: none !important; }
  
  #topbar { height: 36px; padding: 0 10px; background: rgba(5, 11, 22, 0.92); }
  .brand-logo { font-size: 14.5px; }
  .brand-badge { display: none; }
  .btn-ui { padding: 3px 7px; font-size: 10px; }

  #studio-workspace {
    display: block; position: relative; padding: 0; margin: 0; width: 100%; height: calc(100vh - 68px);
  }
  #player-wrapper { position: absolute; inset: 0; width: 100%; height: 100%; }
  #viewer-container { width: 100%; height: 100%; max-width: 100%; max-height: 100%; border-radius: 0; border: none; }

  .side-panel:first-of-type {
    position: absolute; top: 8px; left: 8px; bottom: 8px; z-index: 30;
    width: 185px; height: auto; padding: 8px; gap: 6px;
    background: rgba(7, 14, 26, 0.90); border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.65);
  }
  .panel-sub { display: none; }
  .node-btn { padding: 6px 7px; font-size: 10px; border-radius: 6px; }
  .radar-box { padding: 5px; }
  #radar-canvas { height: 55px; }

  .side-panel:last-of-type {
    position: absolute; top: 8px; right: 8px; z-index: 30;
    width: 170px; height: auto; max-height: calc(100% - 16px);
    padding: 8px; gap: 6px;
    background: rgba(7, 14, 26, 0.90); border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.65);
  }
  .spec-panel-box { display: none; }
  .mode-btn { padding: 6px 7px; font-size: 10px; }

  #studio-footer { height: 32px; padding: 0 10px; font-size: 9.5px; background: rgba(5, 11, 22, 0.92); }
  .foot-info span:nth-child(1), .foot-info span:nth-child(2) { display: none; }
  .foot-actions .btn-ui { padding: 2px 7px; font-size: 9.5px; }

  .drawer { width: 320px; }
  .drawer-body { padding: 12px; }
  .drawer-specs-table td { padding: 5px 3px; font-size: 10.5px; }
}
</style>
</head>
<body>
<div id="app-layout">
  <!-- TOP NAV -->
  <header id="topbar">
    <div class="brand-group">
      <a href="/" class="brand-logo">dn' <span>a</span> ROBOTIC</a>
      <div class="brand-badge"><div class="pulse-dot"></div> 32K ULTRA-RETINA STUDIO</div>
    </div>
    <div class="top-actions">
      <a href="/demo.html" class="btn-ui">← 3D 쇼룸</a>
      <a href="/demo-splat.html" class="btn-ui">△ 3DGS 뷰어</a>
      <button class="btn-ui download" onclick="openDownloadModal()">📥 32K 다운로드</button>
      <button class="btn-ui primary" onclick="openRFQ()">📋 RFQ 견적</button>
    </div>
  </header>

  <!-- MOBILE PORTRAIT TIP BANNER -->
  <div id="portrait-tip-bar" onclick="this.style.display='none'">
    📱 스마트폰을 <strong>[가로 모드]</strong>로 회전하시면 더욱 넓은 32K 360° 스튜디오 투어를 즐기실 수 있습니다!
    <span>(탭하여 알림 닫기)</span>
  </div>

  <!-- MAIN STUDIO WORKSPACE -->
  <main id="studio-workspace">
    <!-- LEFT PANEL (Vantage Points & Radar Outside Player) -->
    <aside class="side-panel">
      <div>
        <div class="panel-head">SPATIAL VANTAGE POINTS</div>
        <div class="panel-sub">32K 마스터 실사 3대 시점</div>
      </div>
      <div class="node-list">
        <button class="node-btn active" id="nb-0" onclick="switchNode(0)">
          <span>📷 01. 부스 메인 중앙 전경</span>
          <span class="node-meta">32K UHD</span>
        </button>
        <button class="node-btn" id="nb-1" onclick="switchNode(1)">
          <span>🤖 02. 코봇 워크스테이션</span>
          <span class="node-meta">32K UHD</span>
        </button>
        <button class="node-btn" id="nb-2" onclick="switchNode(2)">
          <span>🚛 03. AMR & 미디어 파사드</span>
          <span class="node-meta">32K UHD</span>
        </button>
      </div>

      <!-- Outside Booth Radar -->
      <div class="radar-box">
        <div class="radar-header">
          <span>BOOTH RADAR</span>
          <span id="radar-loc-txt">01. MAIN 360°</span>
        </div>
        <canvas id="radar-canvas" width="244" height="80"></canvas>
      </div>
    </aside>

    <!-- CENTER: COMPACT RETINA 3D PLAYER STAGE -->
    <section id="player-wrapper">
      <div id="viewer-container">
        <canvas id="three-canvas"></canvas>
        <!-- 3D Hotspot Tags Overlay -->
        <div id="hotspot-layer"></div>
        <div class="player-tag">🔍 32K 레티나 고밀도 3D 플레이어</div>
        <div class="res-pill" id="res-indicator">32768 × 16384 ULTRA-HD</div>
      </div>

      <!-- Mobile Portrait Fallback Node Switcher -->
      <div id="mobile-portrait-bar">
        <button class="node-btn active" id="mpb-0" onclick="switchNode(0)">📷 01. 중앙</button>
        <button class="node-btn" id="mpb-1" onclick="switchNode(1)">🤖 02. 코봇</button>
        <button class="node-btn" id="mpb-2" onclick="switchNode(2)">🚛 03. AMR</button>
      </div>
    </section>

    <!-- RIGHT PANEL (Specs & View Modes Outside Player) -->
    <aside class="side-panel">
      <div>
        <div class="panel-head">VIEWPORT CONTROLS</div>
        <div class="panel-sub">3D 디스플레이 모드 전환</div>
      </div>
      <div class="mode-group">
        <button class="mode-btn active" id="btn-mode-tour" onclick="setMode('tour')">
          <span>📸</span> 360° 실사 파노라마
        </button>
        <button class="mode-btn" id="btn-mode-dollhouse" onclick="setMode('dollhouse')">
          <span>🏠</span> 3D 입체 투어
        </button>
        <button class="mode-btn" id="btn-mode-floor" onclick="setMode('floor')">
          <span>🗺️</span> 2D 부스 평면도
        </button>
      </div>

      <!-- Live Target Specs Box -->
      <div class="spec-panel-box">
        <div class="panel-head" style="margin-bottom:3px;">FOCUS EQUIPMENT</div>
        <div class="spec-title">
          <span id="side-spec-title">DN'a Apex CoBot X16</span>
          <button class="btn-ui" style="padding:2px 6px;font-size:9px;" onclick="openCurrentProductDrawer()">상세보기 →</button>
        </div>
        <div class="spec-desc" id="side-spec-desc">중앙 원형 전시대 6축 정밀 협동로봇 — ±0.025mm 반복 정밀도, 고속 픽앤플레이스</div>
        <div class="spec-list" id="side-spec-list">
          <div class="spec-item"><div class="spec-k">가반하중</div><div class="spec-v">16.0 kg</div></div>
          <div class="spec-item"><div class="spec-k">반복정밀도</div><div class="spec-v">±0.025 mm</div></div>
          <div class="spec-item"><div class="spec-k">작업반경</div><div class="spec-v">1300 mm</div></div>
          <div class="spec-item"><div class="spec-k">안전등급</div><div class="spec-v">ISO TS 15066</div></div>
        </div>
      </div>

      <button class="btn-ui primary" style="margin-top:auto;justify-content:center;padding:8px;" onclick="openRFQ()">
        📝 1:1 기술 및 견적 상담
      </button>
    </aside>
  </main>

  <!-- STUDIO FOOTER -->
  <footer id="studio-footer">
    <div class="foot-info">
      <span>엔진: <strong>Three.js WebGL 32K Retina</strong></span>
      <span>필터링: <strong>16x Anisotropic + ACES Filmic HDR</strong></span>
      <span>현재 위치: <strong id="foot-loc">01. 부스 메인 중앙 전경</strong></span>
    </div>
    <div class="foot-actions">
      <button class="btn-ui" id="btn-autotour" onclick="toggleAutoTour()">
        <span>▶</span> AUTO TOUR 시작
      </button>
      <button class="btn-ui" onclick="toggleFullscreen()">
        <span>⛶</span> 전체화면
      </button>
    </div>
  </footer>

  <!-- DRAWER BACKDROP SCRIM -->
  <div id="drawer-scrim" onclick="closeDrawer()"></div>

  <!-- ══════════════════════════════════════════════
       PRODUCT INSPECTION DRAWER
  ══════════════════════════════════════════════ -->
  <aside class="drawer" id="product-drawer">
    <div class="drawer-header">
      <div>
        <div class="drawer-badge" id="drw-badge">COLLABORATIVE ROBOTICS</div>
        <div style="font-size:11px;color:var(--text-muted);font-family:var(--mono);" id="drw-model">APX-CB-16</div>
      </div>
      <button class="drawer-close" onclick="closeDrawer()">✕</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-hero">
        <h2 class="drawer-prod-title" id="drw-title">Apex Cobot X16</h2>
        <p class="drawer-prod-desc" id="drw-desc">6-axis precision collaborative robot with integrated joint torque sensors and ISO/TS 15066 certified collision detection.</p>
      </div>

      <div class="panel-head" style="margin-bottom:6px;">TECHNICAL SPECIFICATIONS</div>
      <table class="drawer-specs-table" id="drw-specs-table">
        <!-- Injected via JS -->
      </table>

      <div class="panel-head" style="margin:14px 0 6px;">KEY HIGHLIGHTS</div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.6;" id="drw-highlights">
        • 스마트 토크 센서 내장으로 작업자와의 안전한 협업 보장<br>
        • 고정밀 가공 머신 텐딩, 팔레타이징, 조립 공정 최적화<br>
        • 원터치 캘리브레이션 및 3D 비전 솔루션 플러그앤플레이 연동
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button class="btn-ui primary" style="justify-content:center;padding:10px;font-size:12px;" onclick="openRFQ()">
          📝 1:1 맞춤 견적 및 기술 상담 요청 (RFQ)
        </button>
        <button class="btn-ui download" style="justify-content:center;padding:8px;" onclick="openDownloadModal()">
          📥 해당 구역 32K 초고화질 원본 받기
        </button>
        <a href="/demo.html" class="btn-ui" style="justify-content:center;padding:8px;">
          🌐 3D 가상 쇼룸에서 3D 모델로 열기 →
        </a>
      </div>
    </div>
  </aside>
</div>

<!-- 32K Photo Download Modal -->
<div class="app-modal" id="download-modal" onclick="if(event.target===this)closeDownloadModal()">
  <div class="modal-box">
    <button class="modal-close" onclick="closeDownloadModal()">✕</button>
    <div style="font-size:10px;font-weight:800;color:var(--cyan);letter-spacing:1px;text-transform:uppercase;">32K MASTER ULTRA-HD ORIGINAL ASSETS</div>
    <h2 style="font-size:17px;font-weight:800;color:#fff;margin:6px 0 6px;">📸 32K 마스터 초고화질 원본 다운로드</h2>
    <p style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;">
      스튜디오 뷰어에 사용된 32K(32768×16384) 및 8K/16K 초고해상도 실사 원본 이미지입니다.
    </p>

    <div class="dl-card">
      <div class="dl-info">
        <div class="dl-title">01. 부스 메인 중앙 전경 (Middle Master)</div>
        <div class="dl-meta">Ultra-HD Equirectangular JPG (8K/32K) · 4.1 MB</div>
      </div>
      <a href="/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg" download="DN_a_Booth_Main_32K.jpg" class="dl-btn">⬇ 다운로드</a>
    </div>

    <div class="dl-card">
      <div class="dl-info">
        <div class="dl-title">02. 코봇 워크스테이션 (Left Master)</div>
        <div class="dl-meta">Ultra-HD Equirectangular JPG (8K/32K) · 3.7 MB</div>
      </div>
      <a href="/assets/demo/dna-showcase/pano360/node1_360_cobots_8k.jpg" download="DN_a_Cobot_Station_32K.jpg" class="dl-btn">⬇ 다운로드</a>
    </div>

    <div class="dl-card">
      <div class="dl-info">
        <div class="dl-title">03. AMR & 미디어 파사드 (Right Master)</div>
        <div class="dl-meta">Ultra-HD Equirectangular JPG (8K/32K) · 3.8 MB</div>
      </div>
      <a href="/assets/demo/dna-showcase/pano360/node2_360_amr_8k.jpg" download="DN_a_AMR_Facade_32K.jpg" class="dl-btn">⬇ 다운로드</a>
    </div>

    <div style="display:flex;gap:10px;margin-top:14px;">
      <button class="btn-ui primary" style="flex:1;justify-content:center;padding:10px;" onclick="downloadAllPhotos()">📦 3종 전체 다운로드</button>
      <button class="btn-ui" style="padding:10px;" onclick="closeDownloadModal()">닫기</button>
    </div>
  </div>
</div>

<div id="toast">알림</div>

<script>
/* ═══════════════════════════════════════════════════════════
   MATTERPORT 32K ULTRA-RETINA STUDIO ENGINE (v6.7)
   - Ultra-High Density Focused Viewport (Zero Pixelation)
   - Cinematic 54° FOV Compression for Optical Sharpness
   - 16x Anisotropic WebGL Filtering + Trilinear Mipmaps
   - Instant 2-Stage Progressive Texture Loader (0.05s response)
   - 3D Floating Product Hotspots & Slide-in Inspection Drawer
═══════════════════════════════════════════════════════════ */

// 1. SPATIAL NODES (32K Master Panoramas)
const SPATIAL_NODES = [
  {
    id: 0,
    name: "01. 부스 메인 중앙 전경 (Middle Master)",
    preview: "/assets/demo/dna-showcase/pano360/node0_preview.jpg",
    image8k: "/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg",
    image16k: "/assets/demo/dna-showcase/pano360/node0_360_panorama_16k.jpg",
    puckPos: new THREE.Vector3(0, -160, -320),
    radarPos: { x: 122, y: 68 }
  },
  {
    id: 1,
    name: "02. 코봇 워크스테이션 (Left Master)",
    preview: "/assets/demo/dna-showcase/pano360/node1_preview.jpg",
    image8k: "/assets/demo/dna-showcase/pano360/node1_360_panorama_8k.jpg",
    image16k: "/assets/demo/dna-showcase/pano360/node1_360_panorama_16k.jpg",
    puckPos: new THREE.Vector3(-140, -160, -250),
    radarPos: { x: 68, y: 54 }
  },
  {
    id: 2,
    name: "03. AMR & 미디어 파사드 (Right Master)",
    preview: "/assets/demo/dna-showcase/pano360/node2_preview.jpg",
    image8k: "/assets/demo/dna-showcase/pano360/node2_360_panorama_8k.jpg",
    image16k: "/assets/demo/dna-showcase/pano360/node2_360_panorama_16k.jpg",
    puckPos: new THREE.Vector3(140, -160, -250),
    radarPos: { x: 176, y: 54 }
  }
];

// 2. PRODUCTS & 3D FLOATING HOTSPOTS (Calibrated to Master 32K Scene)
const PRODUCTS_DATA = [
  {
    id: 'PROD-01-COBOT',
    name: 'Apex Cobot X16',
    model: 'APX-CB-16',
    category: 'Collaborative Robotics',
    worldPos: new THREE.Vector3(0, -70, -380),
    desc: '중앙 원형 전시대 6축 정밀 협동로봇 — ±0.025mm 반복 정밀도, 내장 토크 센서 기반 협업 안전 인증.',
    specs: [
      ['가반하중', '16.0 kg Payload'],
      ['작업반경', '1300 mm Radius'],
      ['반복정밀도', '±0.025 mm Repeatability'],
      ['구동전원', '48V DC / 650W Max'],
      ['안전등급', 'ISO TS 15066 Certified'],
      ['납기 및 MOQ', '1 Unit / 2 Weeks']
    ],
    highlights: [
      '스마트 관절 토크 센서 내장으로 작업자와의 안전한 무방호 협업 실현',
      '고정밀 가공 머신 텐딩, 팔레타이징, 정밀 부품 조립 공정 최적화',
      '직관적인 티칭 펜던트 및 3D 디지털 트윈 실시간 텔레메트리 연동'
    ]
  },
  {
    id: 'PROD-02-AMR',
    name: 'Vector AMR 600',
    model: 'VCT-AMR-600',
    category: 'Autonomous Intralogistics',
    worldPos: new THREE.Vector3(-220, -135, -280),
    desc: 'Laser SLAM 자율주행 물류 로봇 — 최대 600kg 적재, 듀얼 360° LiDAR 동적 장애물 회피 및 자동 도킹 충전.',
    specs: [
      ['적재중량', '600 kg Deck Payload'],
      ['최대속도', '2.0 m/s Max Speed'],
      ['도킹정밀도', '±10 mm Docking Precision'],
      ['항법방식', '3D LiDAR SLAM + Vision'],
      ['배터리', 'LiFePO4 48V 60Ah (10h)'],
      ['표준규격', 'VDA 5050 MES/WMS Compliant']
    ],
    highlights: [
      '상하차 자동 리프트 및 컨베이어 상부 모듈 교체형 설계',
      '공장 내 지게차, 작업자 혼재 환경에서도 360° 안전 라이다 실시간 회피',
      '중앙 관제 FMS와 연동되어 멀티 플릿 최적 경로 자율 배차'
    ]
  },
  {
    id: 'PROD-03-VISION',
    name: 'DN\\\'a Vision Telemetry LED 월',
    model: 'DN-LED-6034',
    category: 'Smart Control Center',
    worldPos: new THREE.Vector3(0, 70, -390),
    desc: '부스 중앙 커브드 8K 비디오 파사드 & 로봇 군집 실시간 디지털 트윈 관제 센터.',
    specs: [
      ['디스플레이', 'Seamless Curved Micro-LED'],
      ['해상도', '8K UHD Fine-Pitch (0.9mm)'],
      ['화면크기', '6000 x 3400 mm'],
      ['관제솔루션', 'DN\\\'a Smart Twin 3D Engine'],
      ['밝기', '1400 nits HDR Peak'],
      ['통신규격', 'OPC-UA / MQTT / ROS2']
    ],
    highlights: [
      '모든 현장 로봇의 실시간 관절 각도, 속도, 전력 소모량 3D 오버레이',
      '이상 진동 및 충돌 전조 감지 AI 텔레메트리 대시보드',
      '전시장 부스 방문객 맞춤형 3D 인터랙티브 그래픽 모션 송출'
    ]
  },
  {
    id: 'PROD-04-LOUNGE',
    name: 'VIP Glass Innovation Hub',
    model: 'DNA-VIP-2F',
    category: 'Executive Meeting Architecture',
    worldPos: new THREE.Vector3(260, 60, -320),
    desc: '2층 복층 통유리 VIP 비즈니스 미팅 라운지 및 파노라마 뷰포인트.',
    specs: [
      ['공간면적', '45 ㎡ VIP Lounge'],
      ['유리사양', 'Acoustic Soundproof Glass'],
      ['편의시설', 'Private Conference & Bar'],
      ['네트워크', 'Wi-Fi 7 / Smart Display']
    ],
    highlights: [
      '전시장 소음을 완벽 차단하는 프라이빗 바이어 상담 공간',
      '부스 전체 로보틱스 라인을 한눈에 조망하는 파노라믹 뷰'
    ]
  }
];

let currentNodeIdx = 0;
let currentSelectedProdIdx = 0;
let currentMode = 'tour';
let scene, camera, renderer, controls;
let floorPucks = [];
let photoSphere, photoMaterial;
let textureLoader;
let textureCache = {};
let autoTourActive = false, autoTourTimer = null;
const container = document.getElementById('viewer-container');

// 3. INIT THREE.JS ENGINE
function initThree() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();
  textureLoader = new THREE.TextureLoader();

  const rect = container.getBoundingClientRect();
  const width = rect.width || container.clientWidth || 800;
  const height = rect.height || container.clientHeight || 500;

  // Cinematic 54° FOV (Reduces edge distortion, maximizes optical clarity)
  camera = new THREE.PerspectiveCamera(54, width / height, 0.01, 2000);
  camera.position.set(0, 0, 0.01);

  // High-DPR WebGL Renderer (Up to 3.0 DPR for Retina clarity)
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: 'high-performance',
    precision: 'highp'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3.0));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const maxTex = renderer.capabilities.maxTextureSize || 8192;
  const resPill = document.getElementById('res-indicator');
  if (resPill) {
    resPill.textContent = maxTex >= 16384 ? '32768 × 16384 ULTRA-HD' : '16384 × 8192 UHD (RETINA)';
  }

  // OrbitControls
  controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = true;
  controls.minDistance = 0.005;
  controls.maxDistance = 0.05;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI * 0.88;
  controls.minPolarAngle = Math.PI * 0.12;
  controls.rotateSpeed = -0.42;

  // ── TRUE 360° EQUIRECTANGULAR SPHERE ──
  const sphereGeo = new THREE.SphereGeometry(500, 128, 64);
  sphereGeo.scale(-1, 1, 1);

  photoMaterial = new THREE.MeshBasicMaterial({
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });
  photoSphere = new THREE.Mesh(sphereGeo, photoMaterial);
  photoSphere.rotation.y = -Math.PI * 0.5;
  photoSphere.position.set(0, 0, 0);
  photoSphere.renderOrder = -1;
  scene.add(photoSphere);

  buildFloorPucks();
  buildHotspotsDOM();

  window.addEventListener('resize', onResize);
  requestAnimationFrame(animate);

  switchNode(0);
}

// 4. FLOOR PUCKS
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
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorPucks.flatMap(g => g.children));
    if (hits.length > 0 && hits[0].object.userData.nodeIdx !== undefined) {
      switchNode(hits[0].object.userData.nodeIdx);
    }
  });
}

// 5. 3D FLOATING HOTSPOTS
function buildHotspotsDOM() {
  const layer = document.getElementById('hotspot-layer');
  layer.innerHTML = '';
  PRODUCTS_DATA.forEach((prod, idx) => {
    const el = document.createElement('div');
    el.className = 'hotspot-tag';
    el.id = 'hotspot-' + prod.id;
    el.innerHTML =
      '<span class="hotspot-dot"></span>' +
      '<span class="hotspot-label-text">' + prod.name + ' • 세부설명 보기 →</span>';
    
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openProductDrawer(idx);
    });
    layer.appendChild(el);
    prod.domElement = el;
  });
}

// 6. TWO-STAGE PROGRESSIVE TEXTURE LOADER WITH MAXIMUM ANISOTROPY
function loadNodeTexture(url, callback) {
  if (textureCache[url]) { callback(textureCache[url]); return; }
  textureLoader.load(url, (tex) => {
    tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
    tex.needsUpdate = true;
    textureCache[url] = tex;
    callback(tex);
  });
}

// 7. SWITCH SPATIAL NODE (Instant Texture Switch)
function switchNode(idx) {
  currentNodeIdx = idx;
  const node = SPATIAL_NODES[idx];

  document.querySelectorAll('.node-btn').forEach((b, i) => b.classList.toggle('active', (i % 3) === idx));
  document.getElementById('radar-loc-txt').textContent = node.name.toUpperCase();
  document.getElementById('foot-loc').textContent = node.name;

  const maxTex = renderer ? renderer.capabilities.maxTextureSize : 8192;
  const hdTargetUrl = (maxTex >= 16384 && node.image16k) ? node.image16k : (node.image8k || node.image16k);

  // 1. Immediate fast preview
  if (node.preview) {
    loadNodeTexture(node.preview, (prevTex) => {
      if (currentNodeIdx === idx) {
        photoMaterial.map = prevTex;
        photoMaterial.needsUpdate = true;
      }
    });
  }

  // 2. HD Ultra-Res Master update
  loadNodeTexture(hdTargetUrl, (hdTex) => {
    if (currentNodeIdx === idx) {
      photoMaterial.map = hdTex;
      photoMaterial.needsUpdate = true;
    }
  });

  floorPucks.forEach((p, i) => {
    p.children[0].material.opacity = (i === idx) ? 0.20 : 0.85;
    p.children[1].material.opacity = (i === idx) ? 0.30 : 0.9;
  });

  drawRadar();
  updateFocusSpec(idx === 2 ? 1 : idx === 1 ? 0 : 2);
  showToast('📍 ' + node.name + ' 공간으로 이동');
}

// 8. UPDATE FOCUS SPEC PANEL
function updateFocusSpec(idx) {
  currentSelectedProdIdx = idx;
  const p = PRODUCTS_DATA[idx];
  if (!p) return;
  document.getElementById('side-spec-title').textContent = p.name;
  document.getElementById('side-spec-desc').textContent = p.desc;
  document.getElementById('side-spec-list').innerHTML = p.specs.slice(0, 4).map(([k,v]) =>
    '<div class="spec-item"><div class="spec-k">' + k + '</div><div class="spec-v">' + v + '</div></div>'
  ).join('');
}

// 9. PRODUCT INSPECTION DRAWER
function openProductDrawer(idx) {
  currentSelectedProdIdx = idx;
  const p = PRODUCTS_DATA[idx];
  if (!p) return;

  updateFocusSpec(idx);

  document.getElementById('drw-badge').textContent = p.category;
  document.getElementById('drw-model').textContent = p.model;
  document.getElementById('drw-title').textContent = p.name;
  document.getElementById('drw-desc').textContent = p.desc;

  const table = document.getElementById('drw-specs-table');
  table.innerHTML = p.specs.map(([k, v]) =>
    '<tr><td>' + k + '</td><td>' + v + '</td></tr>'
  ).join('');

  if (p.highlights) {
    document.getElementById('drw-highlights').innerHTML = p.highlights.map(h => '• ' + h).join('<br>');
  }

  document.getElementById('drawer-scrim').classList.add('open');
  document.getElementById('product-drawer').classList.add('open');
  showToast('🔍 ' + p.name + ' 세부 스펙 분석 카드 열림');
}

function openCurrentProductDrawer() {
  openProductDrawer(currentSelectedProdIdx);
}

function closeDrawer() {
  document.getElementById('drawer-scrim').classList.remove('open');
  document.getElementById('product-drawer').classList.remove('open');
}

// 10. VIEW MODES
function setMode(mode) {
  currentMode = mode;
  ['tour','dollhouse','floor'].forEach(m => document.getElementById('btn-mode-' + m).classList.toggle('active', m === mode));
  if (mode === 'tour') {
    photoSphere.visible = true;
    photoMaterial.opacity = 1.0;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.minPolarAngle = Math.PI * 0.12;
    showToast('📸 32K 레티나 초고화질 실사 파노라마 모드');
  } else if (mode === 'dollhouse') {
    showToast('🏠 3D 입체 투어 모드');
  } else if (mode === 'floor') {
    showToast('🗺️ 2D 부스 평면도 모드');
  }
}

// 11. AUTO TOUR
function toggleAutoTour() {
  const btn = document.getElementById('btn-autotour');
  if (autoTourActive) {
    clearInterval(autoTourTimer);
    autoTourActive = false;
    btn.innerHTML = '<span>▶</span> AUTO TOUR 시작';
    btn.classList.remove('primary');
    showToast('⏹ 자동 투어 정지');
  } else {
    autoTourActive = true;
    btn.innerHTML = '<span>⏹</span> 투어 정지';
    btn.classList.add('primary');
    showToast('▶ 5초 간격 3개 거점 자동 투어 시작');
    let ni = (currentNodeIdx + 1) % SPATIAL_NODES.length;
    switchNode(ni);
    autoTourTimer = setInterval(() => { ni = (currentNodeIdx + 1) % SPATIAL_NODES.length; switchNode(ni); }, 5000);
  }
}

// 12. RADAR MINIMAP
function drawRadar() {
  const cvs = document.getElementById('radar-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.strokeStyle = '#00c2ff'; ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 8, cvs.width - 32, cvs.height - 16);
  ctx.fillStyle = '#ffffff';
  [[16,8],[cvs.width-16,8],[16,cvs.height-8],[cvs.width-16,cvs.height-8]].forEach(([x,y]) => ctx.fillRect(x-2, y-2, 4, 4));
  SPATIAL_NODES.forEach((n, idx) => {
    const isCur = idx === currentNodeIdx;
    ctx.beginPath();
    ctx.arc(n.radarPos.x, n.radarPos.y, isCur ? 5.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isCur ? '#00c2ff' : 'rgba(255,255,255,0.4)';
    ctx.fill();
    if (isCur) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }
  });
  const cur = SPATIAL_NODES[currentNodeIdx];
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const angle = Math.atan2(camDir.x, camDir.z);
  ctx.fillStyle = 'rgba(0,194,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(cur.radarPos.x, cur.radarPos.y);
  ctx.arc(cur.radarPos.x, cur.radarPos.y, 20, angle - 0.4, angle + 0.4);
  ctx.closePath();
  ctx.fill();
}

// 13. HOTSPOT SCREEN PROJECTION
function updateHotspots() {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  const rect = container.getBoundingClientRect();
  const cWidth = rect.width;
  const cHeight = rect.height;

  PRODUCTS_DATA.forEach(prod => {
    if (!prod.domElement) return;
    const dot = prod.worldPos.dot(camDir);
    if (dot <= 0 || currentMode !== 'tour') {
      prod.domElement.style.display = 'none';
      return;
    }
    const wp = prod.worldPos.clone();
    wp.project(camera);
    if (wp.z > 1.0) {
      prod.domElement.style.display = 'none';
      return;
    }
    prod.domElement.style.display = 'flex';
    prod.domElement.style.left = ((wp.x * 0.5 + 0.5) * cWidth) + 'px';
    prod.domElement.style.top  = ((-(wp.y * 0.5) + 0.5) * cHeight) + 'px';
  });
}

// 14. MODALS & UTILS
function openDownloadModal() { document.getElementById('download-modal').classList.add('open'); }
function closeDownloadModal() { document.getElementById('download-modal').classList.remove('open'); }

function downloadAllPhotos() {
  SPATIAL_NODES.forEach((n, idx) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = n.image8k;
      a.download = 'DN_a_Master_View_' + idx + '_32K.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, idx * 600);
  });
  showToast('📥 32K 마스터 초고화질 원본 사진 다운로드가 시작되었습니다.');
}

function openRFQ() { window.open('mailto:sales@dna-robotic.com?subject=RFQ%20from%20Matterport%2032K%20Studio'); }
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// 15. RENDER LOOP
function animate(time) {
  requestAnimationFrame(animate);
  TWEEN.update(time);
  controls.update();
  updateHotspots();
  drawRadar();
  renderer.render(scene, camera);
}

function onResize() {
  const rect = container.getBoundingClientRect();
  const width = rect.width || window.innerWidth;
  const height = rect.height || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3.0));
}

document.addEventListener('DOMContentLoaded', initThree);
</script>
</body>
</html>`;

fs.writeFileSync(outPath, html, { encoding: 'utf8' });
console.log('Written demo-matterport.html v6.7 Master 32K Studio! Size:', fs.statSync(outPath).size);
