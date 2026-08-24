// generate_clean_splat.js — 3D Gaussian Splatting (3DGS) Radiance Field Viewer (v8.0 Master Release)
// Powered by 3dgs.mp4:
// 1. High-Performance Three.js Interactive 360° Radiance Video Engine
// 2. Real-Time Gaussian Particle Field Simulation Layer
// 3. Enlarged 3D Floating Product Capsules (48px Thumbnail + Dual-Line Category/Title)
// 4. 2/3 Player Viewport + Bottom 4-Robot Shortcut Cards Tray
// 5. Unified Right Sidebar (Booth Radar + Focused Equipment Specs + 1:1 RFQ)
// 6. Product Inspection Drawer with 4K Photo & 360° 3D Mini Turntable Player
// 7. Video HUD Controls (Play/Pause, Scrubbing Timeline, Speed, Particle Density)
// 8. 100% Full English Enterprise Localization

const fs = require('fs');
const path = require('path');

const outPath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/demo-splat.html';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>DN'a ROBOTIC | 3DGS Gaussian Splatting Radiance Field Tour</title>
<meta name="description" content="Enterprise interactive 3D Gaussian Splatting (3DGS) radiance field digital twin featuring 360 video telemetry, real-time B2B product inspection, and RFQ intake.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<!-- Three.js & Controls -->
<script src="/vendor/three.min.js"></script>
<script src="/vendor/OrbitControls.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tween.js/18.6.4/tween.umd.js"></script>

<style>
:root {
  --bg-deep: #02050b;
  --bg-studio: #050b16;
  --panel-bg: rgba(9, 16, 29, 0.94);
  --panel-border: rgba(56, 189, 248, 0.35);
  --cyan: #00c2ff;
  --cyan-glow: rgba(0, 194, 255, 0.55);
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
   APP LAYOUT
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
.btn-ui.splat-active { background: rgba(0,194,255,0.18); border-color: var(--cyan); color: var(--cyan); font-weight: 700; }

/* MAIN STUDIO WORKSPACE */
#studio-workspace {
  flex: 1; display: grid;
  grid-template-columns: 1fr 340px;
  gap: 14px; padding: 12px 18px;
  background: #02050b;
  min-height: 0; align-items: stretch; position: relative;
}

/* 2/3 VIEWPORT + BOTTOM CARDS */
#player-workspace {
  height: 100%; width: 100%; display: flex; flex-direction: column;
  gap: 12px; min-height: 0; position: relative;
}

#viewer-container {
  position: relative; width: 100%; flex: 1; min-height: 0;
  border-radius: 16px; overflow: hidden;
  border: 1px solid rgba(0, 194, 255, 0.4);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 194, 255, 0.2);
  cursor: grab; background: #000;
}
#viewer-container:active { cursor: grabbing; }
#three-canvas { width: 100%; height: 100%; display: block; touch-action: none; }

/* 3DGS OVERLAY BADGES */
.player-tag {
  position: absolute; top: 12px; left: 12px; z-index: 10;
  background: rgba(5, 11, 22, 0.9); border: 1px solid var(--panel-border);
  border-radius: 20px; padding: 4px 11px; font-size: 9.5px; font-weight: 800;
  color: var(--cyan); backdrop-filter: blur(10px); display: flex; align-items: center; gap: 6px;
  pointer-events: none;
}
.res-pill {
  position: absolute; top: 12px; right: 12px; z-index: 10;
  background: rgba(2, 132, 199, 0.35); border: 1px solid #38bdf8;
  border-radius: 20px; padding: 4px 11px; font-size: 9.5px; font-weight: 800;
  color: #fff; font-family: var(--mono); backdrop-filter: blur(10px);
}

/* 3DGS VIDEO HUD BAR */
#video-hud {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  z-index: 30; display: flex; align-items: center; gap: 10px;
  background: rgba(5, 11, 22, 0.92); border: 1px solid var(--panel-border);
  border-radius: 30px; padding: 6px 14px; backdrop-filter: blur(14px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
}
.hud-btn-circle {
  width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15); color: #fff; display: flex; align-items: center;
  justify-content: center; cursor: pointer; font-size: 11px; transition: var(--trans);
}
.hud-btn-circle:hover { background: var(--cyan); color: #000; border-color: var(--cyan); }
.hud-timeline {
  width: 140px; height: 4px; background: rgba(255,255,255,0.15); border-radius: 2px;
  position: relative; cursor: pointer; overflow: hidden;
}
.hud-timeline-fill {
  height: 100%; width: 0%; background: var(--cyan); border-radius: 2px;
  box-shadow: 0 0 8px var(--cyan);
}
.hud-time-txt { font-size: 9.5px; font-family: var(--mono); color: var(--text-muted); white-space: nowrap; }

/* ══════════════════════════════════════════════
   BOTTOM PRODUCT SHORTCUT CARDS TRAY (4 ROBOTS)
══════════════════════════════════════════════ */
#product-cards-tray {
  height: 125px; flex-shrink: 0;
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; align-items: stretch;
}

.prod-quick-card {
  background: var(--panel-bg); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 8px 10px; cursor: pointer;
  display: flex; gap: 10px; align-items: center;
  transition: var(--trans); position: relative; overflow: hidden;
  box-shadow: 0 8px 20px rgba(0,0,0,0.5); backdrop-filter: blur(16px);
}
.prod-quick-card:hover {
  background: rgba(14, 28, 50, 0.98); border-color: var(--cyan);
  transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0, 194, 255, 0.25);
}
.prod-quick-card.active {
  border-color: var(--cyan); background: rgba(0, 194, 255, 0.14);
  box-shadow: 0 0 18px rgba(0, 194, 255, 0.35);
}
.prod-card-thumb {
  width: 76px; height: 100%; border-radius: 8px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; background: #000;
}
.prod-card-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 0.3s ease;
}
.prod-quick-card:hover .prod-card-thumb img { transform: scale(1.08); }
.prod-card-body {
  flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px;
}
.prod-card-cat { font-size: 8.5px; font-weight: 800; color: var(--cyan); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prod-card-title { font-size: 12px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prod-card-spec { font-size: 9.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prod-card-btn {
  margin-top: 2px; font-size: 9px; font-weight: 700; color: #38bdf8;
  display: flex; align-items: center; gap: 3px;
}

/* ══════════════════════════════════════════════
   ENLARGED 3D FLOATING PRODUCT CAPSULES (HOTSPOTS)
   - 48px Large Crystal Clear Thumbnail
   - Dual-Line Category & Title
══════════════════════════════════════════════ */
#hotspot-layer { position: absolute; inset: 0; pointer-events: none; z-index: 20; }

.hotspot-tag {
  position: absolute; transform: translate(-50%, -50%);
  pointer-events: auto; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  background: rgba(5, 11, 22, 0.95); backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 2px solid rgba(0, 194, 255, 0.75); border-radius: 32px;
  padding: 6px 16px 6px 6px;
  color: #fff;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 194, 255, 0.45);
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1); white-space: nowrap;
}
.hotspot-tag:hover {
  background: rgba(2, 132, 199, 0.98); border-color: #38bdf8;
  transform: translate(-50%, -50%) scale(1.1);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.9), 0 0 35px rgba(0, 194, 255, 0.85);
}
.hotspot-thumb-img {
  width: 48px; height: 48px; border-radius: 50%; object-fit: cover;
  border: 2px solid var(--cyan); flex-shrink: 0; display: block;
  box-shadow: 0 0 12px rgba(0, 194, 255, 0.6);
  background: #000;
  transition: transform 0.28s ease;
}
.hotspot-tag:hover .hotspot-thumb-img { transform: scale(1.08); }
.hotspot-info { display: flex; flex-direction: column; gap: 2px; }
.hotspot-cat { font-size: 8.5px; font-weight: 800; color: var(--cyan); text-transform: uppercase; letter-spacing: 0.8px; line-height: 1; }
.hotspot-tag:hover .hotspot-cat { color: #e0f2fe; }
.hotspot-label-text { font-size: 13px; font-weight: 800; color: #fff; line-height: 1.2; }
.hotspot-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #38bdf8;
  box-shadow: 0 0 10px #38bdf8; flex-shrink: 0; animation: hotspot-pulse 1.8s infinite;
}
@keyframes hotspot-pulse {
  0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.8); }
  70% { box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); }
  100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
}

/* ══════════════════════════════════════════════
   RIGHT UNIFIED SIDEBAR (Radar + Focused Robot Specs)
══════════════════════════════════════════════ */
.unified-sidebar {
  height: 100%; display: flex; flex-direction: column; gap: 14px;
  background: var(--panel-bg); border: 1px solid var(--panel-border);
  border-radius: 16px; padding: 16px; backdrop-filter: blur(20px);
  overflow-y: auto; box-shadow: 0 16px 36px rgba(0,0,0,0.6);
  z-index: 10;
}
.panel-head { font-size: 10px; font-weight: 800; color: var(--cyan); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 2px; }
.panel-sub { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }

/* 1. Radar Minimap */
.radar-box {
  background: rgba(2, 5, 11, 0.7); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 12px;
}
.radar-header { font-size: 9.5px; font-weight: 800; color: var(--cyan); letter-spacing: 1px; text-transform: uppercase; display: flex; justify-content: space-between; margin-bottom: 8px; }
#radar-canvas { width: 100%; height: 95px; display: block; border-radius: 6px; }

/* 2. Focus Equipment Specs Box */
.spec-panel-box {
  background: rgba(2, 5, 11, 0.65); border: 1px solid var(--panel-border);
  border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;
}
.spec-title { font-size: 13.5px; font-weight: 800; color: #fff; display: flex; justify-content: space-between; align-items: center; }
.spec-desc { font-size: 11px; color: var(--text-muted); line-height: 1.5; }
.spec-list { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 4px; }
.spec-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 8px; }
.spec-k { font-size: 8.5px; color: var(--text-muted); font-weight: 600; }
.spec-v { font-size: 11px; color: var(--cyan); font-weight: 700; font-family: var(--mono); }

/* BOTTOM TOOLBAR */
#studio-footer {
  height: 42px; flex-shrink: 0;
  background: rgba(5, 11, 22, 0.98); border-top: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; justify-content: space-between; padding: 0 18px;
  z-index: 50;
}
.foot-info { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 14px; }
.foot-info strong { color: var(--cyan); }
.foot-actions { display: flex; align-items: center; gap: 8px; }

/* ══════════════════════════════════════════════
   PRODUCT INSPECTION DRAWER & 360° 3D MINI PLAYER
══════════════════════════════════════════════ */
#drawer-scrim {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px);
  z-index: 400; opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
}
#drawer-scrim.open { opacity: 1; pointer-events: auto; }

.drawer {
  position: absolute; z-index: 500; top: 0; right: 0; bottom: 0;
  width: 460px; max-width: 94vw; background: rgba(7, 14, 26, 0.98);
  backdrop-filter: blur(26px); border-left: 1px solid var(--panel-border);
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

.drawer-media-tabs { display: flex; gap: 6px; margin: 4px 0 8px; }
.media-tab-btn {
  flex: 1; padding: 6px 8px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: var(--text-muted); cursor: pointer; transition: var(--trans);
  display: flex; align-items: center; justify-content: center; gap: 5px;
}
.media-tab-btn:hover { background: rgba(0,194,255,0.08); color: #fff; border-color: var(--panel-border); }
.media-tab-btn.active {
  background: rgba(0,194,255,0.2); border-color: var(--cyan); color: var(--cyan);
  box-shadow: 0 0 12px rgba(0,194,255,0.3);
}

.drawer-img-box {
  width: 100%; border-radius: 12px; overflow: hidden;
  border: 1px solid var(--panel-border); margin: 0 0 14px;
  position: relative; background: #000; box-shadow: 0 10px 28px rgba(0,0,0,0.7);
  height: 220px;
}
.drawer-img-box img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-img-box:hover img { transform: scale(1.04); }

#drawer-3d-view {
  width: 100%; height: 100%; position: absolute; inset: 0; display: none; background: radial-gradient(circle at center, #0a192f 0%, #02050b 100%);
}
#drawer-3d-canvas { width: 100%; height: 100%; display: block; cursor: grab; }
#drawer-3d-canvas:active { cursor: grabbing; }
.mini-3d-controls {
  position: absolute; bottom: 8px; left: 8px; right: 8px; display: flex; justify-content: space-between; align-items: center; pointer-events: none;
}
.mini-3d-pill {
  pointer-events: auto; background: rgba(5, 11, 22, 0.88); border: 1px solid var(--panel-border);
  border-radius: 20px; padding: 3px 8px; font-size: 8.5px; font-weight: 800;
  color: var(--cyan); backdrop-filter: blur(8px); font-family: var(--mono); cursor: pointer;
}
.mini-3d-pill:hover { background: var(--cyan); color: #000; }

.drawer-hero {
  border-radius: 12px; border: 1px solid var(--panel-border);
  background: linear-gradient(135deg, #0b1a2e 0%, #050b16 100%);
  padding: 14px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 5px;
}
.drawer-prod-title { font-size: 18px; font-weight: 800; color: #fff; }
.drawer-prod-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; }

.drawer-specs-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5px; }
.drawer-specs-table tr { border-bottom: 1px solid rgba(255,255,255,0.06); }
.drawer-specs-table td { padding: 7px 5px; }
.drawer-specs-table td:first-child { color: var(--text-muted); font-weight: 600; width: 42%; }
.drawer-specs-table td:last-child { color: #fff; font-weight: 700; text-align: right; font-family: var(--mono); color: var(--cyan); }

/* TOAST */
#toast {
  position: fixed; bottom: 52px; left: 50%; transform: translateX(-50%) translateY(10px);
  background: rgba(0,194,255,0.2); border: 1px solid var(--cyan);
  border-radius: 30px; padding: 7px 16px; font-size: 11.5px; font-weight: 600;
  color: var(--cyan); backdrop-filter: blur(12px); z-index: 800;
  opacity: 0; transition: all 0.3s ease; pointer-events: none;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* RESPONSIVE */
@media (max-width: 960px) {
  #studio-workspace { display: flex; flex-direction: column; padding: 8px; gap: 8px; }
  .unified-sidebar { display: none; }
  #product-cards-tray { height: 100px; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .prod-card-thumb { width: 50px; }
  .drawer { width: 100vw; max-width: 100vw; }
}
</style>
</head>
<body>
<div id="app-layout">
  <!-- TOP NAV -->
  <header id="topbar">
    <div class="brand-group">
      <a href="/" class="brand-logo">dn' <span>a</span> ROBOTIC</a>
      <div class="brand-badge"><div class="pulse-dot"></div> 3DGS GAUSSIAN SPLATTING TOUR</div>
    </div>
    <div class="top-actions">
      <a href="/demo-matterport.html" class="btn-ui">🏢 64K Matterport Studio</a>
      <a href="/demo.html" class="btn-ui">🤖 3D Showroom</a>
      <a href="/demo-splat.html" class="btn-ui splat-active">△ 3DGS Viewer</a>
      <button class="btn-ui primary" onclick="openRFQ()">📋 Request RFQ</button>
    </div>
  </header>

  <!-- MAIN SHOWROOM WORKSPACE -->
  <main id="studio-workspace">
    <!-- CENTER: 2/3 VIEWPORT + BOTTOM 4-ROBOT SHORTCUT TRAY -->
    <section id="player-workspace">
      <div id="viewer-container">
        <video id="splat-video" src="/assets/splat/3dgs.mp4" playsinline loop muted autoplay crossorigin="anonymous" style="display:none;"></video>
        <canvas id="three-canvas"></canvas>
        <div id="hotspot-layer"></div>
        
        <div class="player-tag">△ 3DGS Radiance Field Point Cloud Video</div>
        <div class="res-pill">3DGS REAL-TIME ENGINE</div>

        <!-- 3DGS VIDEO HUD BAR -->
        <div id="video-hud">
          <button class="hud-btn-circle" id="btn-play-pause" onclick="togglePlayPause()" title="Play / Pause">⏸</button>
          <div class="hud-timeline" id="hud-timeline" onclick="seekVideo(event)">
            <div class="hud-timeline-fill" id="hud-timeline-fill"></div>
          </div>
          <span class="hud-time-txt" id="hud-time-txt">00:00 / 00:00</span>
          <button class="hud-btn-circle" onclick="togglePlaybackSpeed()" id="btn-speed" title="Speed" style="width:auto;border-radius:12px;padding:0 6px;font-family:var(--mono);">1.0x</button>
          <button class="hud-btn-circle" onclick="resetView()" title="Reset Camera">🎯</button>
        </div>
      </div>

      <!-- BOTTOM PRODUCT SHORTCUT CARDS TRAY (4 ROBOTS) -->
      <div id="product-cards-tray">
        <div class="prod-quick-card active" id="pcard-0" onclick="focusProduct(0)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/dna-showcase/products/apex_cobot_x16.jpg" alt="Apex Cobot X16">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat">COBOT</div>
            <div class="prod-card-title">Apex Cobot X16</div>
            <div class="prod-card-spec">16.0kg Payload · 6-Axis Precision</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-1" onclick="focusProduct(1)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/dna-showcase/products/vector_amr_600.jpg" alt="Vector AMR 600">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat">AMR LOGISTICS</div>
            <div class="prod-card-title">Vector AMR 600</div>
            <div class="prod-card-spec">600kg Payload · 3D LiDAR SLAM</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-2" onclick="focusProduct(2)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/dna-showcase/products/delta_d12.jpg" alt="Titan Delta D12">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat">HIGH-SPEED PACKAGING</div>
            <div class="prod-card-title">Titan Delta D12</div>
            <div class="prod-card-spec">240 Picks/min · Parallel Arm</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-3" onclick="focusProduct(3)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/dna-showcase/products/scara_s8.jpg" alt="Hyperion SCARA S8">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat">PRECISION ASSEMBLY</div>
            <div class="prod-card-title">Hyperion SCARA S8</div>
            <div class="prod-card-spec">0.32s Cycle · ±0.010mm Acc.</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>
      </div>
    </section>

    <!-- RIGHT UNIFIED SIDEBAR (Radar + Focused Robot Specs) -->
    <aside class="unified-sidebar">
      <!-- 1. Booth Radar Minimap -->
      <div class="radar-box">
        <div class="radar-header">
          <span>BOOTH RADAR MINIMAP</span>
          <span id="radar-loc-txt">01. 3DGS BOOTH CENTER</span>
        </div>
        <canvas id="radar-canvas" width="306" height="95"></canvas>
      </div>

      <!-- 2. Live Target Specs Box -->
      <div class="spec-panel-box">
        <div class="panel-head" style="margin-bottom:0;">FOCUSED ROBOTIC SYSTEM</div>
        <div class="spec-title">
          <span id="side-spec-title">Apex Cobot X16</span>
          <button class="btn-ui" style="padding:2px 6px;font-size:9px;" onclick="openCurrentProductDrawer()">Details →</button>
        </div>
        <div class="spec-desc" id="side-spec-desc">6-axis precision collaborative robot with integrated joint torque sensors and ISO/TS 15066 safety compliance.</div>
        <div class="spec-list" id="side-spec-list">
          <div class="spec-item"><div class="spec-k">PAYLOAD</div><div class="spec-v">16.0 kg</div></div>
          <div class="spec-item"><div class="spec-k">REPEATABILITY</div><div class="spec-v">±0.025 mm</div></div>
          <div class="spec-item"><div class="spec-k">REACH</div><div class="spec-v">1300 mm</div></div>
          <div class="spec-item"><div class="spec-k">SAFETY</div><div class="spec-v">ISO TS 15066</div></div>
        </div>
      </div>

      <button class="btn-ui primary" style="margin-top:auto;justify-content:center;padding:11px;font-size:12px;" onclick="openRFQ()">
        📝 Request 1:1 Technical & RFQ Quote
      </button>
    </aside>
  </main>

  <!-- STUDIO FOOTER -->
  <footer id="studio-footer">
    <div class="foot-info">
      <span>Engine: <strong>Three.js 3DGS Video Radiance Engine</strong></span>
      <span>Source: <strong>3dgs.mp4 (Continuous Radiance Field)</strong></span>
      <span>Active Target: <strong id="foot-loc">Apex Cobot X16</strong></span>
    </div>
    <div class="foot-actions">
      <button class="btn-ui" id="btn-autotour" onclick="toggleAutoTour()">
        <span>▶</span> START AUTO TOUR
      </button>
      <button class="btn-ui" onclick="toggleFullscreen()">
        <span>⛶</span> FULLSCREEN
      </button>
    </div>
  </footer>

  <!-- DRAWER BACKDROP SCRIM -->
  <div id="drawer-scrim" onclick="closeDrawer()"></div>

  <!-- PRODUCT INSPECTION DRAWER -->
  <aside class="drawer" id="product-drawer">
    <div class="drawer-header">
      <div>
        <div class="drawer-badge" id="drw-badge">COLLABORATIVE ROBOTICS</div>
        <div style="font-size:11px;color:var(--text-muted);font-family:var(--mono);" id="drw-model">APX-CB-16</div>
      </div>
      <button class="drawer-close" onclick="closeDrawer()">✕</button>
    </div>
    <div class="drawer-body">
      <!-- Media Mode Switcher Tabs -->
      <div class="drawer-media-tabs">
        <button class="media-tab-btn active" id="tab-photo" onclick="setDrawerMediaMode('photo')">
          🖼 4K STUDIO PHOTO
        </button>
        <button class="media-tab-btn" id="tab-3d" onclick="setDrawerMediaMode('3d')">
          🔄 360° 3D VIEWER
        </button>
      </div>

      <!-- High-Res Product Hero Photo & 360 3D Mini View -->
      <div class="drawer-img-box" id="drw-img-box">
        <img id="drw-img" src="/assets/demo/dna-showcase/products/apex_cobot_x16.jpg" alt="Product Visual">
        
        <!-- Embedded Mini 3D Turntable View -->
        <div id="drawer-3d-view">
          <canvas id="drawer-3d-canvas"></canvas>
          <div class="mini-3d-controls">
            <button class="mini-3d-pill" onclick="toggleDrawer3dAutoRotate()" id="btn-3d-autorot">🔄 Auto-Rotate: ON</button>
            <button class="mini-3d-pill" onclick="toggleDrawer3dWireframe()" id="btn-3d-wire">⚡ Wireframe: OFF</button>
            <button class="mini-3d-pill" onclick="resetDrawer3dCamera()">🎯 Reset View</button>
          </div>
        </div>
      </div>

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
        <!-- Injected via JS -->
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        <button class="btn-ui primary" style="justify-content:center;padding:10px;font-size:12px;" onclick="openRFQ()">
          📝 Request 1:1 Custom RFQ
        </button>
        <a href="/demo-matterport.html" class="btn-ui" style="justify-content:center;padding:8px;background:rgba(0,194,255,0.15);border-color:var(--cyan);color:var(--cyan);">
          🏢 View in 64K Matterport Studio →
        </a>
      </div>
    </div>
  </aside>
</div>

<div id="toast">Notification</div>

<script>
/* ═══════════════════════════════════════════════════════════
   3DGS GAUSSIAN RADIANCE VIEWER ENGINE (v8.0 Master)
═══════════════════════════════════════════════════════════ */

// 1. PRODUCTS DATA (4 ROBOTS)
const PRODUCTS_DATA = [
  {
    id: 'PROD-01-COBOT',
    name: 'Apex Cobot X16',
    model: 'APX-CB-16',
    category: 'Collaborative Robotics',
    image: '/assets/demo/dna-showcase/products/apex_cobot_x16.jpg',
    worldPos: new THREE.Vector3(0, 10, -360),
    cameraLook: new THREE.Vector3(0, 0, -1),
    radarPos: { x: 153, y: 68 },
    desc: '6-axis precision collaborative robotic arm with ±0.025mm repeatability, smart joint torque sensing, and ISO/TS 15066 safety compliance.',
    specs: [
      ['Payload Capacity', '16.0 kg Payload'],
      ['Working Radius', '1,300 mm Reach'],
      ['Repeatability', '±0.025 mm Repeatability'],
      ['Drive Power', '48V DC / 650W Max'],
      ['Safety Class', 'ISO/TS 15066 Certified'],
      ['Lead Time & MOQ', '1 Unit / 2 Weeks']
    ],
    highlights: [
      'Built-in joint torque sensors enable safe, barrier-free human-robot collaboration',
      'Optimized for CNC machine tending, high-payload palletizing, and sub-assembly',
      'Real-time 3D digital twin telemetry streaming via ROS2 / OPC-UA'
    ],
    robotType: 'cobot'
  },
  {
    id: 'PROD-02-AMR',
    name: 'Vector AMR 600',
    model: 'VCT-AMR-600',
    category: 'Autonomous Intralogistics',
    image: '/assets/demo/dna-showcase/products/vector_amr_600.jpg',
    worldPos: new THREE.Vector3(-280, -90, -220),
    cameraLook: new THREE.Vector3(-0.8, -0.2, -0.6),
    radarPos: { x: 72, y: 48 },
    desc: 'Heavy-duty Laser SLAM autonomous mobile robot with 600kg deck load, dual 360° safety LiDAR, and autonomous inductive docking.',
    specs: [
      ['Payload Capacity', '600 kg Deck Load'],
      ['Maximum Speed', '2.0 m/s Max Speed'],
      ['Docking Accuracy', '±10 mm Docking Precision'],
      ['Navigation Mode', '3D LiDAR SLAM + Dual Vision'],
      ['Battery Life', 'LiFePO4 48V 60Ah (10h)'],
      ['Standards', 'VDA 5050 Fleet Compliant']
    ],
    highlights: [
      'Interchangeable top modules for powered roller conveyor and electric scissor lift',
      'Dynamic 360° obstacle avoidance in mixed human and forklift traffic environments',
      'Direct FMS dispatch integration with multi-fleet autonomous route scheduling'
    ],
    robotType: 'amr'
  },
  {
    id: 'PROD-03-DELTA',
    name: 'Titan Delta D12',
    model: 'TTN-DL-12',
    category: 'High-Speed Packaging',
    image: '/assets/demo/dna-showcase/products/delta_d12.jpg',
    worldPos: new THREE.Vector3(280, 10, -240),
    cameraLook: new THREE.Vector3(0.8, 0, -0.6),
    radarPos: { x: 234, y: 48 },
    desc: 'Ultra-fast parallel Delta robot with 240 picks/min throughput, carbon-fiber kinematic arms, and dynamic AI conveyor tracking.',
    specs: [
      ['Pick Rate', 'Up to 240 Picks / min'],
      ['Payload Capacity', '12.0 kg High-Speed Load'],
      ['Work Envelope', '1,600 mm Diameter'],
      ['Repeatability', '±0.05 mm Repeatability'],
      ['End-Effector', 'Multi-Venturi Vacuum Suction'],
      ['Ingress Protection', 'IP65 Washdown Certified']
    ],
    highlights: [
      'Ultra-lightweight carbon fiber parallel struts engineered for extreme acceleration',
      'High-speed vision-guided conveyor belt tracking with dynamic sync sorting',
      'FDA-compliant construction suitable for pharmaceutical and food packaging'
    ],
    robotType: 'delta'
  },
  {
    id: 'PROD-04-SCARA',
    name: 'Hyperion SCARA S8',
    model: 'HYP-SC-08',
    category: 'Precision Assembly',
    image: '/assets/demo/dna-showcase/products/scara_s8.jpg',
    worldPos: new THREE.Vector3(-140, 50, -350),
    cameraLook: new THREE.Vector3(-0.4, 0.1, -0.9),
    radarPos: { x: 92, y: 82 },
    desc: 'Sub-micron 4-axis SCARA robot for high-precision semiconductor, PCB wafer handling, and micro-component cleanroom assembly.',
    specs: [
      ['Standard Cycle Time', '0.32 s Standard Cycle'],
      ['Payload Capacity', '8.0 kg Max Payload'],
      ['Arm Reach', '800 mm Total Span'],
      ['Positioning Repeat.', '±0.010 mm (XY) / ±0.005 mm (Z)'],
      ['Z-Stroke', '200 mm Precision Ball Screw'],
      ['Cleanroom Class', 'ISO Class 4 Compliant']
    ],
    highlights: [
      'Sub-micron absolute optical encoder feedback for ultra-tight tolerance placement',
      'Internal cable routing prevents particulate generation and line interference',
      'Integrated micro-force sensing for delicate snap-fit electronics manufacturing'
    ],
    robotType: 'scara'
  }
];

let currentSelectedProdIdx = 0;
let scene, camera, renderer, controls;
let videoEl, videoTex, videoSphere, splatParticles;
let autoTourActive = false, autoTourTimer = null;
const container = document.getElementById('viewer-container');
const speeds = [0.5, 1.0, 1.5, 2.0];
let currentSpeedIdx = 1;

// 2. INIT THREE.JS 3DGS ENGINE
function init3DGS() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();

  const rect = container.getBoundingClientRect();
  const width = rect.width || container.clientWidth || 1000;
  const height = rect.height || container.clientHeight || 550;

  camera = new THREE.PerspectiveCamera(65, width / height, 0.01, 2000);
  camera.position.set(0, 0, 0.01);

  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;

  controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enableZoom = true;
  controls.minDistance = 0.01;
  controls.maxDistance = 500;
  controls.rotateSpeed = -0.38; // Pan-style smooth dragging

  // Video Texture Sphere
  videoEl = document.getElementById('splat-video');
  videoTex = new THREE.VideoTexture(videoEl);
  videoTex.minFilter = THREE.LinearFilter;
  videoTex.magFilter = THREE.LinearFilter;
  videoTex.format = THREE.RGBAFormat;
  videoTex.encoding = THREE.sRGBEncoding;

  const sphereGeo = new THREE.SphereGeometry(600, 60, 40);
  sphereGeo.scale(-1, 1, 1);
  const sphereMat = new THREE.MeshBasicMaterial({ map: videoTex });
  videoSphere = new THREE.Mesh(sphereGeo, sphereMat);
  videoSphere.rotation.y = -Math.PI * 0.5;
  scene.add(videoSphere);

  // Real-Time Gaussian Splat Particles Overlay
  buildSplatParticles();
  buildHotspotsDOM();
  initDrawer3D();
  initVideoControls();

  // Try auto-play
  videoEl.play().catch(() => {
    console.log('Autoplay deferred for user interaction');
  });

  window.addEventListener('resize', onResize);
  requestAnimationFrame(animate);
  updateFocusSpec(0);
}

// 3. GAUSSIAN PARTICLES FIELD
function buildSplatParticles() {
  const count = 1200;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = 250 + Math.random() * 280;

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = (r * Math.sin(phi) * Math.sin(theta)) * 0.5;
    positions[i * 3 + 2] = r * Math.cos(phi);

    colors[i * 3]     = 0.0;
    colors[i * 3 + 1] = 0.76 + Math.random() * 0.24;
    colors[i * 3 + 2] = 1.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 2.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending
  });

  splatParticles = new THREE.Points(geo, mat);
  scene.add(splatParticles);
}

// 4. ENLARGED 3D FLOATING HOTSPOTS (48px Thumbnail + Dual-Line Text)
function buildHotspotsDOM() {
  const layer = document.getElementById('hotspot-layer');
  layer.innerHTML = '';
  PRODUCTS_DATA.forEach((prod, idx) => {
    const el = document.createElement('div');
    el.className = 'hotspot-tag';
    el.id = 'hotspot-' + prod.id;
    el.innerHTML =
      '<img src="' + prod.image + '" class="hotspot-thumb-img" alt="' + prod.name + '">' +
      '<span class="hotspot-dot"></span>' +
      '<div class="hotspot-info">' +
        '<span class="hotspot-cat">' + (prod.category || 'ROBOTIC SYSTEM') + '</span>' +
        '<span class="hotspot-label-text">' + prod.name + '</span>' +
      '</div>';
    
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      focusProduct(idx);
    });
    layer.appendChild(el);
    prod.domElement = el;
  });
}

// 5. FOCUS PRODUCT
function focusProduct(idx) {
  currentSelectedProdIdx = idx;
  const p = PRODUCTS_DATA[idx];
  if (!p) return;

  // Highlight bottom card
  document.querySelectorAll('.prod-quick-card').forEach((c, i) => c.classList.toggle('active', i === idx));

  // Rotate camera to look directly at the product hotspot
  const lookDir = p.worldPos.clone().normalize();
  const targetCam = lookDir.clone().multiplyScalar(0.01);
  const targetLook = lookDir.clone().multiplyScalar(100);

  new TWEEN.Tween(controls.target)
    .to(targetLook, 1200)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();

  openProductDrawer(idx);
}

function updateFocusSpec(idx) {
  currentSelectedProdIdx = idx;
  const p = PRODUCTS_DATA[idx];
  if (!p) return;
  document.getElementById('side-spec-title').textContent = p.name;
  document.getElementById('side-spec-desc').textContent = p.desc;
  document.getElementById('side-spec-list').innerHTML = p.specs.slice(0, 4).map(([k,v]) =>
    '<div class="spec-item"><div class="spec-k">' + k + '</div><div class="spec-v">' + v + '</div></div>'
  ).join('');
  document.getElementById('foot-loc').textContent = p.name;
  document.querySelectorAll('.prod-quick-card').forEach((c, i) => c.classList.toggle('active', i === idx));
}

// 6. VIDEO CONTROLS & TIMELINE
function initVideoControls() {
  const fill = document.getElementById('hud-timeline-fill');
  const txt = document.getElementById('hud-time-txt');
  const btnPlay = document.getElementById('btn-play-pause');

  videoEl.addEventListener('timeupdate', () => {
    if (videoEl.duration) {
      const pct = (videoEl.currentTime / videoEl.duration) * 100;
      fill.style.width = pct + '%';
      const cM = Math.floor(videoEl.currentTime / 60).toString().padStart(2, '0');
      const cS = Math.floor(videoEl.currentTime % 60).toString().padStart(2, '0');
      const dM = Math.floor(videoEl.duration / 60).toString().padStart(2, '0');
      const dS = Math.floor(videoEl.duration % 60).toString().padStart(2, '0');
      txt.textContent = cM + ':' + cS + ' / ' + dM + ':' + dS;
    }
  });

  videoEl.addEventListener('play', () => { btnPlay.textContent = '⏸'; });
  videoEl.addEventListener('pause', () => { btnPlay.textContent = '▶'; });
}

function togglePlayPause() {
  if (videoEl.paused) {
    videoEl.play();
    showToast('▶ 3DGS Video Playing');
  } else {
    videoEl.pause();
    showToast('⏸ 3DGS Video Paused');
  }
}

function seekVideo(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  if (videoEl.duration) {
    videoEl.currentTime = pos * videoEl.duration;
  }
}

function togglePlaybackSpeed() {
  currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
  const spd = speeds[currentSpeedIdx];
  videoEl.playbackRate = spd;
  document.getElementById('btn-speed').textContent = spd.toFixed(1) + 'x';
  showToast('⚡ Playback Speed: ' + spd.toFixed(1) + 'x');
}

function resetView() {
  new TWEEN.Tween(controls.target)
    .to({ x: 0, y: 0, z: -100 }, 800)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();
  showToast('🎯 View Center Reset');
}

// 7. PRODUCT INSPECTION DRAWER & 360° 3D MINI PLAYER
let drawer3dScene, drawer3dCamera, drawer3dRenderer, drawer3dControls;
let drawer3dModelGroup = null;
let drawer3dAutoRotate = true;
let drawer3dWireframe = false;
let currentMediaMode = 'photo';

function initDrawer3D() {
  const canvas = document.getElementById('drawer-3d-canvas');
  if (!canvas) return;

  drawer3dScene = new THREE.Scene();
  drawer3dCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  drawer3dCamera.position.set(0, 2.2, 4.5);

  drawer3dRenderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  drawer3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  drawer3dRenderer.outputEncoding = THREE.sRGBEncoding;

  drawer3dControls = new THREE.OrbitControls(drawer3dCamera, canvas);
  drawer3dControls.enableDamping = true;
  drawer3dControls.dampingFactor = 0.08;
  drawer3dControls.autoRotate = true;
  drawer3dControls.autoRotateSpeed = 2.0;
  drawer3dControls.minDistance = 2.0;
  drawer3dControls.maxDistance = 8.0;
  drawer3dControls.target.set(0, 0.6, 0);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x051122, 1.2);
  drawer3dScene.add(hemiLight);

  const dirLight1 = new THREE.DirectionalLight(0x00c2ff, 1.5);
  dirLight1.position.set(5, 8, 5);
  drawer3dScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 1.0);
  dirLight2.position.set(-5, 4, -4);
  drawer3dScene.add(dirLight2);

  const baseRing = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.8, 48),
    new THREE.MeshBasicMaterial({ color: 0x00c2ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
  );
  baseRing.rotation.x = -Math.PI / 2;
  baseRing.position.y = -0.01;
  drawer3dScene.add(baseRing);

  const grid = new THREE.GridHelper(3.6, 16, 0x00c2ff, 0x1e293b);
  grid.position.y = 0;
  drawer3dScene.add(grid);

  renderDrawer3DLoop();
}

function renderDrawer3DLoop() {
  requestAnimationFrame(renderDrawer3DLoop);
  if (currentMediaMode === '3d' && drawer3dRenderer && drawer3dScene && drawer3dCamera) {
    drawer3dControls.update();
    drawer3dRenderer.render(drawer3dScene, drawer3dCamera);
  }
}

function buildProceduralRobotModel(type) {
  if (drawer3dModelGroup) {
    drawer3dScene.remove(drawer3dModelGroup);
    drawer3dModelGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    });
  }

  drawer3dModelGroup = new THREE.Group();
  const matWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.15, wireframe: drawer3dWireframe });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.85, wireframe: drawer3dWireframe });
  const matCyan = new THREE.MeshStandardMaterial({ color: 0x00c2ff, emissive: 0x00c2ff, emissiveIntensity: 0.6, roughness: 0.1, wireframe: drawer3dWireframe });

  if (type === 'cobot') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 32), matMetal);
    base.position.y = 0.15;
    drawer3dModelGroup.add(base);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), matCyan);
    shoulder.position.y = 0.45;
    drawer3dModelGroup.add(shoulder);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 24), matWhite);
    upperArm.position.set(0.2, 0.95, 0);
    upperArm.rotation.z = -0.35;
    drawer3dModelGroup.add(upperArm);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 24), matMetal);
    elbow.position.set(0.4, 1.45, 0);
    drawer3dModelGroup.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 24), matWhite);
    forearm.position.set(0.15, 1.8, 0);
    forearm.rotation.z = 0.45;
    drawer3dModelGroup.add(forearm);

    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.25, 20), matCyan);
    wrist.position.set(-0.1, 2.15, 0);
    drawer3dModelGroup.add(wrist);

    const gripBase = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.15), matMetal);
    gripBase.position.set(-0.1, 2.3, 0);
    drawer3dModelGroup.add(gripBase);

    const finger1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.08), matWhite);
    finger1.position.set(-0.18, 2.42, 0);
    const finger2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.08), matWhite);
    finger2.position.set(-0.02, 2.42, 0);
    drawer3dModelGroup.add(finger1, finger2);
  } else if (type === 'amr') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.1), matWhite);
    chassis.position.y = 0.35;
    drawer3dModelGroup.add(chassis);

    const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 1.15), matMetal);
    lowerTrim.position.y = 0.15;
    drawer3dModelGroup.add(lowerTrim);

    const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.04, 1.16), matCyan);
    lightStrip.position.y = 0.32;
    drawer3dModelGroup.add(lightStrip);

    const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 24), matCyan);
    lidar.position.set(0.65, 0.65, 0.4);
    drawer3dModelGroup.add(lidar);

    for (let i = -0.55; i <= 0.55; i += 0.25) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 16), matMetal);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(0, 0.62, i);
      drawer3dModelGroup.add(roller);
    }
  } else if (type === 'delta') {
    const topPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 6), matMetal);
    topPlate.position.y = 2.1;
    drawer3dModelGroup.add(topPlate);

    const movingPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 6), matCyan);
    movingPlate.position.y = 0.65;
    drawer3dModelGroup.add(movingPlate);

    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3;
      const bX = Math.cos(ang) * 0.6;
      const bZ = Math.sin(ang) * 0.6;
      const mX = Math.cos(ang) * 0.22;
      const mZ = Math.sin(ang) * 0.22;

      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 16), matWhite);
      motor.position.set(bX, 2.0, bZ);
      drawer3dModelGroup.add(motor);

      const upperStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 12), matMetal);
      upperStrut.position.set(bX * 1.15, 1.6, bZ * 1.15);
      drawer3dModelGroup.add(upperStrut);

      const strut1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 12), matWhite);
      strut1.position.set((bX + mX) * 0.65 - 0.06, 1.1, (bZ + mZ) * 0.65);
      const strut2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 12), matWhite);
      strut2.position.set((bX + mX) * 0.65 + 0.06, 1.1, (bZ + mZ) * 0.65);
      drawer3dModelGroup.add(strut1, strut2);
    }

    const suctionCup = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 20), matCyan);
    suctionCup.rotation.x = Math.PI;
    suctionCup.position.y = 0.5;
    drawer3dModelGroup.add(suctionCup);
  } else if (type === 'scara') {
    const baseCol = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.1, 32), matWhite);
    baseCol.position.y = 0.55;
    drawer3dModelGroup.add(baseCol);

    const joint1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 24), matMetal);
    joint1.position.y = 1.15;
    drawer3dModelGroup.add(joint1);

    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.35), matWhite);
    arm1.position.set(0.4, 1.25, 0);
    drawer3dModelGroup.add(arm1);

    const joint2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.35, 24), matCyan);
    joint2.position.set(0.8, 1.28, 0);
    drawer3dModelGroup.add(joint2);

    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.28), matWhite);
    arm2.position.set(1.15, 1.3, 0);
    drawer3dModelGroup.add(arm2);

    const zShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 20), matMetal);
    zShaft.position.set(1.45, 1.1, 0);
    drawer3dModelGroup.add(zShaft);

    const microTool = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.2, 16), matCyan);
    microTool.position.set(1.45, 0.55, 0);
    drawer3dModelGroup.add(microTool);
  }

  drawer3dScene.add(drawer3dModelGroup);
}

function setDrawerMediaMode(mode) {
  currentMediaMode = mode;
  const tabPhoto = document.getElementById('tab-photo');
  const tab3d = document.getElementById('tab-3d');
  const imgEl = document.getElementById('drw-img');
  const view3d = document.getElementById('drawer-3d-view');

  if (mode === '3d') {
    tabPhoto.classList.remove('active');
    tab3d.classList.add('active');
    imgEl.style.display = 'none';
    view3d.style.display = 'block';

    const p = PRODUCTS_DATA[currentSelectedProdIdx];
    buildProceduralRobotModel(p.robotType || 'cobot');

    const rect = document.getElementById('drw-img-box').getBoundingClientRect();
    if (drawer3dRenderer && drawer3dCamera) {
      drawer3dCamera.aspect = rect.width / rect.height;
      drawer3dCamera.updateProjectionMatrix();
      drawer3dRenderer.setSize(rect.width, rect.height);
    }
    showToast('🔄 360° Interactive 3D Turntable Activated');
  } else {
    tabPhoto.classList.add('active');
    tab3d.classList.remove('active');
    imgEl.style.display = 'block';
    view3d.style.display = 'none';
  }
}

function toggleDrawer3dAutoRotate() {
  drawer3dAutoRotate = !drawer3dAutoRotate;
  if (drawer3dControls) drawer3dControls.autoRotate = drawer3dAutoRotate;
  document.getElementById('btn-3d-autorot').textContent = '🔄 Auto-Rotate: ' + (drawer3dAutoRotate ? 'ON' : 'OFF');
}

function toggleDrawer3dWireframe() {
  drawer3dWireframe = !drawer3dWireframe;
  const p = PRODUCTS_DATA[currentSelectedProdIdx];
  buildProceduralRobotModel(p.robotType || 'cobot');
  document.getElementById('btn-3d-wire').textContent = '⚡ Wireframe: ' + (drawer3dWireframe ? 'ON' : 'OFF');
}

function resetDrawer3dCamera() {
  if (drawer3dCamera && drawer3dControls) {
    drawer3dCamera.position.set(0, 2.2, 4.5);
    drawer3dControls.target.set(0, 0.6, 0);
  }
}

function openProductDrawer(idx) {
  currentSelectedProdIdx = idx;
  const p = PRODUCTS_DATA[idx];
  if (!p) return;

  updateFocusSpec(idx);

  document.getElementById('drw-badge').textContent = p.category;
  document.getElementById('drw-model').textContent = p.model;
  document.getElementById('drw-title').textContent = p.name;
  document.getElementById('drw-desc').textContent = p.desc;

  const imgEl = document.getElementById('drw-img');
  if (p.image) imgEl.src = p.image;

  if (currentMediaMode === '3d') {
    buildProceduralRobotModel(p.robotType || 'cobot');
  }

  const table = document.getElementById('drw-specs-table');
  table.innerHTML = p.specs.map(([k, v]) =>
    '<tr><td>' + k + '</td><td>' + v + '</td></tr>'
  ).join('');

  if (p.highlights) {
    document.getElementById('drw-highlights').innerHTML = p.highlights.map(h => '• ' + h).join('<br>');
  }

  document.getElementById('drawer-scrim').classList.add('open');
  document.getElementById('product-drawer').classList.add('open');
  showToast('🔍 Inspecting ' + p.name);
}

function openCurrentProductDrawer() {
  openProductDrawer(currentSelectedProdIdx);
}

function closeDrawer() {
  document.getElementById('drawer-scrim').classList.remove('open');
  document.getElementById('product-drawer').classList.remove('open');
}

// 8. AUTO TOUR
function toggleAutoTour() {
  const btn = document.getElementById('btn-autotour');
  if (autoTourActive) {
    clearInterval(autoTourTimer);
    autoTourActive = false;
    btn.innerHTML = '<span>▶</span> START AUTO TOUR';
    btn.classList.remove('primary');
    showToast('⏹ Auto tour stopped');
  } else {
    autoTourActive = true;
    btn.innerHTML = '<span>⏹</span> STOP AUTO TOUR';
    btn.classList.add('primary');
    showToast('▶ 5s Interval Automated 3DGS Tour Started');
    let ni = (currentSelectedProdIdx + 1) % PRODUCTS_DATA.length;
    focusProduct(ni);
    autoTourTimer = setInterval(() => {
      ni = (currentSelectedProdIdx + 1) % PRODUCTS_DATA.length;
      focusProduct(ni);
    }, 5000);
  }
}

// 9. RADAR MINIMAP
function drawRadar() {
  const cvs = document.getElementById('radar-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.strokeStyle = '#00c2ff'; ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 8, cvs.width - 32, cvs.height - 16);
  ctx.fillStyle = '#ffffff';
  [[16,8],[cvs.width-16,8],[16,cvs.height-8],[cvs.width-16,cvs.height-8]].forEach(([x,y]) => ctx.fillRect(x-2, y-2, 4, 4));
  
  PRODUCTS_DATA.forEach((n, idx) => {
    const isCur = idx === currentSelectedProdIdx;
    ctx.beginPath();
    ctx.arc(n.radarPos.x, n.radarPos.y, isCur ? 5.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isCur ? '#00c2ff' : 'rgba(255,255,255,0.4)';
    ctx.fill();
    if (isCur) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); }
  });

  const cur = PRODUCTS_DATA[currentSelectedProdIdx];
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const angle = Math.atan2(camDir.x, camDir.z);
  ctx.fillStyle = 'rgba(0,194,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(cur.radarPos.x, cur.radarPos.y);
  ctx.arc(cur.radarPos.x, cur.radarPos.y, 24, angle - 0.4, angle + 0.4);
  ctx.closePath();
  ctx.fill();
}

// 10. HOTSPOT SCREEN PROJECTION
function updateHotspots() {
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  const rect = container.getBoundingClientRect();
  const cWidth = rect.width;
  const cHeight = rect.height;

  PRODUCTS_DATA.forEach(prod => {
    if (!prod.domElement) return;
    const toTarget = prod.worldPos.clone().normalize();
    const dot = toTarget.dot(camDir);
    if (dot <= 0.2) {
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

function openRFQ() { window.open('mailto:sales@dna-robotic.com?subject=RFQ%20from%203DGS%20Viewer'); }
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// 11. RENDER LOOP
function animate(time) {
  requestAnimationFrame(animate);
  TWEEN.update(time);
  controls.update();
  if (splatParticles) splatParticles.rotation.y += 0.0006;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

document.addEventListener('DOMContentLoaded', init3DGS);
</script>
</body>
</html>`;

fs.writeFileSync(outPath, html, { encoding: 'utf8' });
console.log('Written demo-splat.html v8.0 3DGS Video Radiance Engine! Size:', fs.statSync(outPath).size);
