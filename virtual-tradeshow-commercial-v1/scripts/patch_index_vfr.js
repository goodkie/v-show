const fs = require('fs');
const indexPath = 'app_build/client/index.html';
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Virtual Fitting Room Section HTML
const vfrSectionHtml = `
    <!-- ================================================================ -->
    <!-- AI VIRTUAL FITTING ROOM PREMIUM SHOWCASE SECTION                  -->
    <!-- ================================================================ -->
    <section id="virtual-fitting-room" style="padding: 90px 24px; max-width: 1240px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 48px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 999px; padding: 6px 16px; font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #38bdf8; text-transform: uppercase; margin-bottom: 16px;">
          <i class="fa-solid fa-sparkles"></i> Virtual Apparel Experience
        </div>
        <h2 style="font-size: clamp(28px, 4vw, 42px); font-weight: 900; color: #fff; letter-spacing: -1px; margin-bottom: 14px;">
          AI Virtual Fitting Room
        </h2>
        <p style="font-size: 16px; color: #94a3b8; max-width: 680px; margin: 0 auto; line-height: 1.6;">
          Turn apparel collections into an interactive digital shopping experience for fashion brands, showrooms, and global trade show buyers.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 32px; background: #070e1b; border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 24px; padding: 28px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6); position: relative; overflow: hidden;">
        
        <!-- Left: Fitting Room Video UI Shell (55%) -->
        <div style="flex: 1.2; display: flex; flex-direction: column; background: #030712; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; overflow: hidden; position: relative;">
          <!-- Top Shell Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 900; font-size: 13px; color: #fff; letter-spacing: 0.5px;">³DNa FITTING STUDIO</span>
            </div>
            <span style="font-size: 10px; font-weight: 800; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">CONCEPT DEMO</span>
          </div>

          <!-- Video Container -->
          <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <video id="vfr-video-player" playsinline muted loop controls preload="metadata" poster="/assets/brand/dna_logo_white.png" style="width: 100%; height: 100%; object-fit: cover;">
              <source src="/assets/demo/virtual-fitting-room/fashion.mp4" type="video/mp4">
              Your browser does not support HTML5 video.
            </video>
          </div>

          <!-- Bottom Dummy Controls / Looks Bar -->
          <div style="padding: 12px 16px; background: rgba(255, 255, 255, 0.02); display: flex; gap: 8px; overflow-x: auto; border-top: 1px solid rgba(255, 255, 255, 0.06);">
            <button type="button" class="vfr-look-btn active" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #fff; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 01 • RUNWAY</button>
            <button type="button" class="vfr-look-btn" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 02 • CASUAL</button>
            <button type="button" class="vfr-look-btn" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 03 • EVENING</button>
            <button type="button" class="vfr-look-btn" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; white-space: nowrap;">LOOK 04 • OUTERWEAR</button>
          </div>
        </div>

        <!-- Right: Commercial Service Copy & Consultation CTA (45%) -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 10px 0;">
          <h3 style="font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 14px; line-height: 1.3;">
            Elevate Fashion Merchandising with Immersive Digital Try-On
          </h3>
          <p style="font-size: 14.5px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px;">
            Let buyers and wholesale partners explore garment drape, texture, and style versatility through an engaging fitting experience tailored for high-end fashion brands.
          </p>

          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px;">
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <i class="fa-solid fa-circle-check" style="color: #38bdf8; margin-top: 3px; font-size: 14px;"></i>
              <div>
                <strong style="color: #fff; font-size: 13.5px; display: block;">Custom Branded Showroom Fitting Shell</strong>
                <span style="color: #64748b; font-size: 12.5px;">Seamlessly matches your luxury house or boutique identity.</span>
              </div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <i class="fa-solid fa-circle-check" style="color: #38bdf8; margin-top: 3px; font-size: 14px;"></i>
              <div>
                <strong style="color: #fff; font-size: 13.5px; display: block;">High-Speed B2B Catalog & Lookbook Integration</strong>
                <span style="color: #64748b; font-size: 12.5px;">Connect wholesale pricing, MOQ, and instant quote generation.</span>
              </div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <i class="fa-solid fa-circle-check" style="color: #38bdf8; margin-top: 3px; font-size: 14px;"></i>
              <div>
                <strong style="color: #fff; font-size: 13.5px; display: block;">Full Multi-Device Web Compatibility</strong>
                <span style="color: #64748b; font-size: 12.5px;">Optimized for mobile safari, chrome, and desktop without app downloads.</span>
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <button type="button" onclick="openConsultationModal()" style="background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; font-size: 15px; font-weight: 800; padding: 14px 28px; border-radius: 12px; border: 1px solid #38bdf8; cursor: pointer; box-shadow: 0 10px 25px rgba(2, 132, 199, 0.4); display: inline-flex; align-items: center; gap: 8px; transition: transform 0.15s;">
              <i class="fa-solid fa-calendar-check"></i> REQUEST A CONSULTATION
            </button>
            <a href="#virtual-fitting-room" onclick="document.getElementById('vfr-video-player').play()" style="color: #94a3b8; font-size: 13.5px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-play" style="font-size: 10px;"></i> Watch Experience
            </a>
          </div>
        </div>

      </div>
    </section>
`;

// 2. Consultation Modal HTML
const consultationModalHtml = `
  <!-- Virtual Fitting Room Consultation Modal -->
  <div id="consultation-modal" class="modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px); z-index: 9999; align-items: center; justify-content: center; padding: 20px;">
    <div class="modal-card" style="max-width: 500px; width: 100%; background: #070e1b; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 20px; padding: 28px; color: #fff; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9); max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 20px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-handshake"></i> Fashion Consultation
        </h3>
        <button style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;" onclick="closeConsultationModal()">&times;</button>
      </div>

      <div id="consultation-form-view">
        <p style="font-size: 13.5px; color: #94a3b8; margin-bottom: 20px; line-height: 1.5;">
          Discuss custom AI Virtual Fitting Room integration for your brand, showroom, or upcoming fashion exhibition.
        </p>

        <form onsubmit="handleConsultationSubmit(event)">
          <div style="margin-bottom: 14px;">
            <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Brand / Business Name *</label>
            <input type="text" id="consult-biz" required placeholder="e.g. Maison de Vantélle" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Contact Name *</label>
              <input type="text" id="consult-name" required placeholder="e.g. Claire Bennett" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Work Email *</label>
              <input type="email" id="consult-email" required placeholder="e.g. claire@brand.com" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
            </div>
          </div>

          <div style="margin-bottom: 14px;">
            <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Requested Service *</label>
            <select id="consult-service" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:13.5px; box-sizing: border-box;">
              <option value="AI Virtual Fitting Room">AI Virtual Fitting Room</option>
              <option value="Digital Fashion Showroom">Digital Fashion Showroom</option>
              <option value="Virtual Try-On Campaign">Virtual Try-On Campaign</option>
              <option value="Trade Show Fashion Experience">Trade Show Fashion Experience</option>
              <option value="E-commerce Integration">E-commerce Integration</option>
              <option value="Custom Fashion Experience">Custom Fashion Experience</option>
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Product Count</label>
              <select id="consult-count" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:13.5px; box-sizing: border-box;">
                <option value="1 - 10 items">1 - 10 items</option>
                <option value="11 - 50 items">11 - 50 items</option>
                <option value="50+ items">50+ items</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Timeline</label>
              <select id="consult-timeline" style="width:100%; height:42px; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:13.5px; box-sizing: border-box;">
                <option value="Immediate (1-2 weeks)">Immediate (1-2 weeks)</option>
                <option value="Within 1 month">Within 1 month</option>
                <option value="Planning for next season">Planning for next season</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 18px;">
            <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:5px;">Message / Custom Requirements</label>
            <textarea id="consult-msg" rows="3" placeholder="Tell us about your upcoming launch, brand aesthetic, or specific technical requirements..." style="width:100%; background:#030712; border:1px solid #1e293b; border-radius:8px; padding:8px 12px; color:#fff; font-size:13px; box-sizing: border-box;"></textarea>
          </div>

          <div id="consult-error-msg" style="display:none; font-size:12px; color:#f87171; margin-bottom:14px; font-weight:700;"></div>

          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button type="button" class="btn-ui" onclick="closeConsultationModal()" style="background:rgba(255,255,255,0.05); border:1px solid #334155; color:#94a3b8; padding:10px 18px; border-radius:8px; cursor:pointer;">Cancel</button>
            <button type="submit" id="btn-submit-consult" style="background: linear-gradient(135deg, #0284c7, #0369a1); color:#fff; font-weight:800; padding:10px 22px; border-radius:8px; border:1px solid #38bdf8; cursor:pointer;">
              <i class="fa-solid fa-paper-plane"></i> Request Consultation
            </button>
          </div>
        </form>
      </div>

      <!-- Success View -->
      <div id="consultation-success-view" style="display:none; text-align:center; padding: 20px 0;">
        <div style="width: 56px; height: 56px; background: rgba(74, 222, 128, 0.1); border: 1px solid #4ade80; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 24px; color: #4ade80;">
          <i class="fa-solid fa-check"></i>
        </div>
        <h4 style="font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 8px;">THANK YOU</h4>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 16px;">Your consultation request has been received.</p>
        <div style="background: #030712; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; margin-bottom: 24px;">
          <span style="font-size: 12px; color: #64748b; display: block; margin-bottom: 4px;">Reference ID</span>
          <span id="consult-ref-id" style="font-size: 16px; font-weight: 900; color: #38bdf8; letter-spacing: 1px;">3DNA-VFR-000000</span>
        </div>
        <p style="font-size: 12.5px; color: #64748b; margin-bottom: 24px;">We will contact you using the email address provided.</p>
        <div style="display: flex; justify-content: center; gap: 12px;">
          <button type="button" onclick="closeConsultationModal()" style="background: #0284c7; border: 1px solid #38bdf8; color: #fff; font-weight: 800; padding: 10px 24px; border-radius: 8px; cursor: pointer;">Close</button>
          <a href="#demo-section" onclick="closeConsultationModal()" style="background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #cbd5e1; font-weight: 700; padding: 10px 18px; border-radius: 8px; text-decoration: none;">Explore ³DNa Experiences</a>
        </div>
      </div>

    </div>
  </div>
`;

// 3. Consultation JS Scripts
const consultationJs = `
function openConsultationModal() {
  const m = document.getElementById('consultation-modal');
  if (m) {
    m.style.display = 'flex';
    document.getElementById('consultation-form-view').style.display = 'block';
    document.getElementById('consultation-success-view').style.display = 'none';
  }
}

function closeConsultationModal() {
  const m = document.getElementById('consultation-modal');
  if (m) m.style.display = 'none';
}

async function handleConsultationSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-consult');
  const err = document.getElementById('consult-error-msg');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

  const body = {
    businessName: document.getElementById('consult-biz').value,
    contactName: document.getElementById('consult-name').value,
    email: document.getElementById('consult-email').value,
    serviceType: document.getElementById('consult-service').value,
    productCount: document.getElementById('consult-count').value,
    timeline: document.getElementById('consult-timeline').value,
    message: document.getElementById('consult-msg').value
  };

  try {
    const res = await fetch('/api/consultation-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('consultation-form-view').style.display = 'none';
      document.getElementById('consultation-success-view').style.display = 'block';
      document.getElementById('consult-ref-id').textContent = data.consultationId;
    } else {
      err.style.display = 'block';
      err.textContent = data.error || 'Failed to submit consultation request.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Request Consultation';
    }
  } catch (ex) {
    err.style.display = 'block';
    err.textContent = ex.message;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Request Consultation';
  }
}

// Look Button Selector for Virtual Fitting Room Demo Shell
document.addEventListener('DOMContentLoaded', () => {
  const lookBtns = document.querySelectorAll('.vfr-look-btn');
  lookBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      lookBtns.forEach(b => {
        b.style.background = 'rgba(255, 255, 255, 0.04)';
        b.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        b.style.color = '#94a3b8';
      });
      btn.style.background = 'rgba(56, 189, 248, 0.15)';
      btn.style.borderColor = '#38bdf8';
      btn.style.color = '#fff';
    });
  });

  // IntersectionObserver for Video Autoplay when in view
  const vPlayer = document.getElementById('vfr-video-player');
  if (vPlayer && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          vPlayer.play().catch(() => {});
        } else {
          vPlayer.pause();
        }
      });
    }, { threshold: 0.3 });
    observer.observe(vPlayer);
  }
});
`;

// Insert section before footer / other services
if (!html.includes('id="virtual-fitting-room"')) {
  // Insert right after showcase iframe container
  const targetAnchor = '<!-- DEMO SHOWCASES / SAMPLES -->';
  if (html.includes('</section>') && html.includes('id="demo-section"')) {
    html = html.replace('</section>', `</section>\n${vfrSectionHtml}`);
  } else {
    html = html.replace('<footer', `${vfrSectionHtml}\n<footer`);
  }
}

if (!html.includes('id="consultation-modal"')) {
  html = html.replace('</body>', `${consultationModalHtml}\n</body>`);
}

if (!html.includes('handleConsultationSubmit')) {
  html = html.replace('</script>', `${consultationJs}\n</script>`);
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ index.html updated with AI Virtual Fitting Room Showcase & Consultation Modal');
