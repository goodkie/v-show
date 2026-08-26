const fs = require('fs');
const indexPath = 'app_build/client/index.html';
let html = fs.readFileSync(indexPath, 'utf8');

// 1. AI VIRTUAL MAKEUP ARTIST SECTION HTML
const vmaSectionHtml = `
    <!-- ================================================================ -->
    <!-- AI VIRTUAL MAKEUP ARTIST PREMIUM SHOWCASE SECTION                 -->
    <!-- ================================================================ -->
    <section id="virtual-makeup-artist" style="padding: 90px 24px; max-width: 1240px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 48px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 999px; padding: 6px 16px; font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #f43f5e; text-transform: uppercase; margin-bottom: 16px;">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Virtual Beauty Experience
        </div>
        <h2 style="font-size: clamp(28px, 4vw, 42px); font-weight: 900; color: #fff; letter-spacing: -1px; margin-bottom: 14px;">
          AI Virtual Makeup Artist
        </h2>
        <p style="font-size: 16px; color: #94a3b8; max-width: 680px; margin: 0 auto; line-height: 1.6;">
          Transform beauty and cosmetic collections into an interactive digital experience designed to help customers explore looks, shades, and product finishes online.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 32px; background: #070e1b; border: 1px solid rgba(244, 63, 94, 0.2); border-radius: 24px; padding: 28px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6); position: relative; overflow: hidden;">
        
        <!-- Left: Makeup Video UI Shell (55%) -->
        <div style="flex: 1.2; display: flex; flex-direction: column; background: #030712; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; overflow: hidden; position: relative;">
          <!-- Top Shell Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 900; font-size: 13px; color: #fff; letter-spacing: 0.5px;">³DNa BEAUTY STUDIO</span>
            </div>
            <span style="font-size: 10px; font-weight: 800; background: rgba(244, 63, 94, 0.15); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.3); padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">CONCEPT DEMO</span>
          </div>

          <!-- Video Container with Custom Play Overlay -->
          <div class="video-player-container" style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;" onclick="togglePlayVideo('vma-video-player', 'vma-play-btn')">
            <video id="vma-video-player" playsinline muted loop controls preload="metadata" poster="/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover;">
              <source src="/assets/demo/virtual-makeup-artist/makeup.mp4" type="video/mp4">
              Your browser does not support HTML5 video.
            </video>
            <div id="vma-play-btn" style="position: absolute; width: 64px; height: 64px; background: rgba(244, 63, 94, 0.85); backdrop-filter: blur(8px); border: 2px solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); pointer-events: none; transition: transform 0.2s;">
              <i class="fa-solid fa-play" style="margin-left: 3px;"></i>
            </div>
          </div>

          <!-- Bottom Dummy Controls / Looks Bar -->
          <div style="padding: 12px 16px; background: rgba(255, 255, 255, 0.02); display: flex; gap: 8px; overflow-x: auto; border-top: 1px solid rgba(255, 255, 255, 0.06);">
            <button type="button" class="vma-look-btn active" style="background: rgba(244, 63, 94, 0.15); border: 1px solid #f43f5e; color: #fff; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 01 • NATURAL GLOW</button>
            <button type="button" class="vma-look-btn" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 02 • EDITORIAL NOIR</button>
            <button type="button" class="vma-look-btn" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 03 • EVENING GLAMOUR</button>
            <button type="button" class="vma-look-btn" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 04 • SIGNATURE ROSE</button>
          </div>
        </div>

        <!-- Right: Commercial Service Copy & Consultation CTA (45%) -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 10px 0;">
          <h3 style="font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 14px; line-height: 1.3;">
            Interactive Shade Discovery & Beauty Brand Engagement
          </h3>
          <p style="font-size: 14.5px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px;">
            ³DNa builds bespoke virtual beauty experiences for cosmetics houses, beauty retailers, and luxury beauty popups, letting buyers test color harmonies and formulation finishes.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px;">
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <i class="fa-solid fa-circle-check" style="color: #f43f5e; margin-top: 3px; font-size: 14px;"></i>
              <div>
                <strong style="color: #fff; font-size: 13.5px; display: block;">Bespoke Shade & Tone Presentation Engine</strong>
                <span style="color: #64748b; font-size: 12.5px;">Accurately displays color depth, satin textures, and luminous finishes.</span>
              </div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <i class="fa-solid fa-circle-check" style="color: #f43f5e; margin-top: 3px; font-size: 14px;"></i>
              <div>
                <strong style="color: #fff; font-size: 13.5px; display: block;">Instant Wholesale Shade-Card & Order Binding</strong>
                <span style="color: #64748b; font-size: 12.5px;">Enables trade buyers to place direct sample requests and bulk RFQs.</span>
              </div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <i class="fa-solid fa-circle-check" style="color: #f43f5e; margin-top: 3px; font-size: 14px;"></i>
              <div>
                <strong style="color: #fff; font-size: 13.5px; display: block;">Zero-Friction Multi-Device Web Delivery</strong>
                <span style="color: #64748b; font-size: 12.5px;">Runs seamlessly across mobile and desktop without external app installs.</span>
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <button type="button" onclick="openConsultationModal('AI Virtual Makeup Artist')" style="background: linear-gradient(135deg, #e11d48, #be123c); color: #fff; font-size: 15px; font-weight: 800; padding: 14px 28px; border-radius: 12px; border: 1px solid #f43f5e; cursor: pointer; box-shadow: 0 10px 25px rgba(225, 29, 72, 0.4); display: inline-flex; align-items: center; gap: 8px; transition: transform 0.15s;">
              <i class="fa-solid fa-calendar-check"></i> REQUEST A CONSULTATION
            </button>
            <a href="#virtual-makeup-artist" onclick="document.getElementById('vma-video-player').play()" style="color: #94a3b8; font-size: 13.5px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-play" style="font-size: 10px;"></i> Watch Experience
            </a>
          </div>
        </div>

      </div>
    </section>
`;

// 2. Update Fashion Video Container with Poster & Play Button
html = html.replace(
  /<video id="vfr-video-player"[\s\S]*?<\/video>/m,
  `<video id="vfr-video-player" playsinline muted loop controls preload="metadata" poster="/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg" style="width: 100%; height: 100%; object-fit: cover;">
      <source src="/assets/demo/virtual-fitting-room/fashion.mp4" type="video/mp4">
      Your browser does not support HTML5 video.
    </video>
    <div id="vfr-play-btn" style="position: absolute; width: 64px; height: 64px; background: rgba(56, 189, 248, 0.85); backdrop-filter: blur(8px); border: 2px solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); pointer-events: none; transition: transform 0.2s;">
      <i class="fa-solid fa-play" style="margin-left: 3px;"></i>
    </div>`
);

// 3. Insert VMA section right after VFR section
if (!html.includes('id="virtual-makeup-artist"')) {
  html = html.replace('</section>', `</section>\n${vmaSectionHtml}`);
}

// 4. Update Client JS with Shared Showcase Video Player logic
const sharedPlayerJs = `
function togglePlayVideo(videoId, playBtnId) {
  const vid = document.getElementById(videoId);
  const btn = document.getElementById(playBtnId);
  if (!vid) return;

  if (vid.paused) {
    vid.play().then(() => {
      if (btn) btn.style.display = 'none';
    }).catch(err => {
      console.warn('Playback gesture required:', err);
    });
  } else {
    vid.pause();
    if (btn) btn.style.display = 'flex';
  }
}

// Bind Video Events
['vfr-video-player', 'vma-video-player'].forEach(id => {
  const v = document.getElementById(id);
  const btnId = id === 'vfr-video-player' ? 'vfr-play-btn' : 'vma-play-btn';
  if (v) {
    v.addEventListener('play', () => {
      const btn = document.getElementById(btnId);
      if (btn) btn.style.display = 'none';
    });
    v.addEventListener('pause', () => {
      const btn = document.getElementById(btnId);
      if (btn) btn.style.display = 'flex';
    });
    v.addEventListener('ended', () => {
      const btn = document.getElementById(btnId);
      if (btn) btn.style.display = 'flex';
    });
  }
});

// Update openConsultationModal to accept service name
function openConsultationModal(serviceName) {
  const m = document.getElementById('consultation-modal');
  if (m) {
    m.style.display = 'flex';
    document.getElementById('consultation-form-view').style.display = 'block';
    document.getElementById('consultation-success-view').style.display = 'none';
    if (serviceName) {
      const sel = document.getElementById('consult-service');
      if (sel) sel.value = serviceName;
    }
  }
}

// Makeup Looks selector
document.addEventListener('DOMContentLoaded', () => {
  const makeupBtns = document.querySelectorAll('.vma-look-btn');
  makeupBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      makeupBtns.forEach(b => {
        b.style.background = 'rgba(255, 255, 255, 0.04)';
        b.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        b.style.color = '#94a3b8';
      });
      btn.style.background = 'rgba(244, 63, 94, 0.15)';
      btn.style.borderColor = '#f43f5e';
      btn.style.color = '#fff';
    });
  });
});
`;

if (!html.includes('togglePlayVideo')) {
  html = html.replace('</script>', `${sharedPlayerJs}\n</script>`);
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ index.html updated with AI Virtual Makeup Artist & Shared Showcase Player');
