const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function renderCard(browser, html, outputPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: outputPath, type: 'jpeg', quality: 95 });
  await page.close();
  console.log('Successfully generated:', path.basename(outputPath));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // ════════════════════════════════════════════════════════════════════════
    // 1. VANTÉLLE PARIS LUXURY FASHION (4 High-Definition Products)
    // ════════════════════════════════════════════════════════════════════════
    
    // Fashion 1: Scarlet Cashmere Wrap Set
    const f1 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #2a0b14 0%, #15050a 55%, #080204 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(22, 8, 14, 0.7); border: 1.5px solid rgba(225, 29, 72, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(225,29,72,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(225,29,72,0.25); border: 1px solid #e11d48; color: #fecdd3; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #fb7185; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">SS25 RUNWAY CAPSULE</div>
        <div class="brand">VANTÉLLE PARIS · HAUTE COUTURE</div>
        <div class="title">Scarlet Cashmere Wrap Set</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <defs>
              <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff3366"/><stop offset="50%" stop-color="#e11d48"/><stop offset="100%" stop-color="#880b26"/>
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="15" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
            </defs>
            <circle cx="200" cy="50" r="28" fill="#334155" opacity="0.6"/>
            <!-- Elegant mannequin torso & tailored blazer coat -->
            <path d="M160 80 L120 130 L110 320 L200 340 L290 320 L280 130 L240 80 Z" fill="#ffffff" opacity="0.95"/>
            <path d="M120 130 L60 250 L95 265 L135 175 L130 330 L200 340 L160 140 Z" fill="url(#redGrad)" filter="url(#glow)"/>
            <path d="M280 130 L340 250 L305 265 L265 175 L270 330 L200 340 L240 140 Z" fill="url(#redGrad)" filter="url(#glow)"/>
            <!-- Draped asymmetric wrap collar -->
            <path d="M135 140 L265 240 L200 330 L135 300 Z" fill="url(#redGrad)"/>
            <rect x="185" y="240" width="30" height="20" rx="4" fill="#f59e0b" stroke="#fde68a" stroke-width="2"/>
            <!-- Trousers -->
            <path d="M140 335 L125 400 L185 400 L195 340 Z" fill="#f1f5f9"/>
            <path d="M260 335 L275 400 L215 400 L205 340 Z" fill="#f1f5f9"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">MATERIAL</div><div class="spec-v">70% Cashmere · 30% Silk</div></div>
          <div><div class="spec-k">ATELIER</div><div class="spec-v">Rue Saint-Honoré, Paris</div></div>
          <div><div class="spec-k">BOUTIQUE MOQ</div><div class="spec-v">12 Units / Custom Sizing</div></div>
        </div>
      </div>
    </body></html>`;

    // Fashion 2: Ivory Silk Suit
    const f2 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #1e1b2e 0%, #0d0b17 55%, #05040a 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(18, 15, 28, 0.7); border: 1.5px solid rgba(168, 85, 247, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(168,85,247,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(168,85,247,0.25); border: 1px solid #a855f7; color: #e9d5ff; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #c084fc; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">TAILORED SUITING</div>
        <div class="brand">VANTÉLLE PARIS · ATELIER MASCULIN / FÉMININ</div>
        <div class="title">Ivory Silk Structured Blazer Suit</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <defs>
              <linearGradient id="ivoryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/><stop offset="60%" stop-color="#f5f3ff"/><stop offset="100%" stop-color="#e2e8f0"/>
              </linearGradient>
            </defs>
            <circle cx="200" cy="50" r="28" fill="#334155" opacity="0.6"/>
            <!-- Crisp Structured Double-Breasted Blazer in Pure Ivory Silk -->
            <path d="M150 85 L100 135 L80 260 L120 270 L140 170 L135 340 L265 340 L260 170 L280 270 L320 260 L300 135 L250 85 Z" fill="url(#ivoryGrad)"/>
            <!-- Black Satin Peaked Lapels -->
            <path d="M150 85 L180 180 L200 230 L160 190 L120 135 Z" fill="#0f172a"/>
            <path d="M250 85 L220 180 L200 230 L240 190 L280 135 Z" fill="#0f172a"/>
            <!-- Gold Horn Buttons -->
            <circle cx="185" cy="220" r="5" fill="#f59e0b"/>
            <circle cx="215" cy="220" r="5" fill="#f59e0b"/>
            <circle cx="185" cy="255" r="5" fill="#f59e0b"/>
            <circle cx="215" cy="255" r="5" fill="#f59e0b"/>
            <!-- Creased Trousers -->
            <path d="M140 345 L130 405 L190 405 L195 345 Z" fill="url(#ivoryGrad)"/>
            <path d="M260 345 L270 405 L210 405 L205 345 Z" fill="url(#ivoryGrad)"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">WEAVE</div><div class="spec-v">100% Organza Silk Satin</div></div>
          <div><div class="spec-k">CONSTRUCTION</div><div class="spec-v">Full Canvas Hand-Stitched</div></div>
          <div><div class="spec-k">COMMERCIAL MOQ</div><div class="spec-v">8 Suits / Assorted Sizes</div></div>
        </div>
      </div>
    </body></html>`;

    // Fashion 3: Midnight Noir Leather Ensemble
    const f3 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #181c26 0%, #0c0e14 55%, #040508 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(12, 15, 22, 0.75); border: 1.5px solid rgba(56, 189, 248, 0.35); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(56,189,248,0.1); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(56,189,248,0.2); border: 1px solid #38bdf8; color: #bae6fd; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #38bdf8; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">HAUTE LEATHER</div>
        <div class="brand">VANTÉLLE PARIS · LEATHER COLLECTION</div>
        <div class="title">Midnight Noir Lambskin Trench Ensemble</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <defs>
              <linearGradient id="leatherGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#334155"/><stop offset="50%" stop-color="#0f172a"/><stop offset="100%" stop-color="#020617"/>
              </linearGradient>
            </defs>
            <circle cx="200" cy="50" r="28" fill="#334155" opacity="0.6"/>
            <!-- Leather Trench Coat -->
            <path d="M150 85 L95 140 L70 270 L115 280 L135 180 L125 380 L275 380 L265 180 L285 280 L330 270 L305 140 L250 85 Z" fill="url(#leatherGrad)" stroke="rgba(255,255,255,0.15)"/>
            <!-- Gunmetal Buckle & Belt -->
            <rect x="130" y="240" width="140" height="24" rx="4" fill="#1e293b"/>
            <rect x="185" y="235" width="30" height="34" rx="4" fill="#475569" stroke="#94a3b8" stroke-width="2"/>
            <!-- Silver Hardware Rivets -->
            <circle cx="160" cy="150" r="3" fill="#cbd5e1"/>
            <circle cx="240" cy="150" r="3" fill="#cbd5e1"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">LEATHER SPEC</div><div class="spec-v">Italian Nappa Lambskin 0.8mm</div></div>
          <div><div class="spec-k">FINISH</div><div class="spec-v">Water-Resistant Matte Glaze</div></div>
          <div><div class="spec-k">COMMERCIAL MOQ</div><div class="spec-v">6 Pieces / Premium Colorways</div></div>
        </div>
      </div>
    </body></html>`;

    // Fashion 4: Paris Satchel Bag
    const f4 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #291d12 0%, #140d08 55%, #080503 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(20, 14, 10, 0.75); border: 1.5px solid rgba(245, 158, 11, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(245,158,11,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(245,158,11,0.25); border: 1px solid #f59e0b; color: #fde68a; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #fbbf24; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">LEATHER GOODS</div>
        <div class="brand">VANTÉLLE PARIS · MAROQUINERIE</div>
        <div class="title">Vantelle Signature Paris Satchel Bag</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <defs>
              <linearGradient id="goldLock" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/>
              </linearGradient>
            </defs>
            <!-- Structured Arch Handle -->
            <path d="M140 180 C140 100 260 100 260 180" stroke="#0f172a" stroke-width="18" fill="none" stroke-linecap="round"/>
            <path d="M140 180 C140 100 260 100 260 180" stroke="url(#goldLock)" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="10 60"/>
            <!-- Trapezoid Calfskin Bag Body -->
            <path d="M100 180 L70 340 C65 360 80 375 100 375 L300 375 C320 375 335 360 330 340 L300 180 Z" fill="#0f172a" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
            <!-- Flap Cover -->
            <path d="M100 180 L120 270 L280 270 L300 180 Z" fill="#1e293b"/>
            <!-- 24K Gold Monogram Lock Clasp -->
            <rect x="180" y="250" width="40" height="40" rx="8" fill="url(#goldLock)"/>
            <circle cx="200" cy="270" r="6" fill="#0f172a"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">LEATHER</div><div class="spec-v">Full-Grain Box Calf Leather</div></div>
          <div><div class="spec-k">HARDWARE</div><div class="spec-v">24K Gold-Plated Brass</div></div>
          <div><div class="spec-k">DIMENSIONS</div><div class="spec-v">28cm (L) x 20cm (H) x 12cm (D)</div></div>
        </div>
      </div>
    </body></html>`;

    // ════════════════════════════════════════════════════════════════════════
    // 2. LUMIÈRE CLINICAL COSMETICS (4 High-Definition Products)
    // ════════════════════════════════════════════════════════════════════════
    
    // Cosmetic 1: Radiance Serum
    const c1 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #06242b 0%, #031418 55%, #02090b 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(5, 26, 32, 0.75); border: 1.5px solid rgba(13, 148, 136, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(13,148,136,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(13,148,136,0.25); border: 1px solid #0d9488; color: #99f6e4; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #2dd4bf; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">ACTIVE TREATMENT</div>
        <div class="brand">LUMIÈRE SKINCARE · CLINICAL BIO-LAB</div>
        <div class="title">Radiance Bio-Cellular Serum</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <defs>
              <linearGradient id="amberSerum" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fed7aa"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/>
              </linearGradient>
            </defs>
            <!-- Dropper Top -->
            <rect x="188" y="40" width="24" height="40" rx="10" fill="#f8fafc"/>
            <rect x="175" y="80" width="50" height="20" rx="4" fill="#334155" stroke="#cbd5e1" stroke-width="2"/>
            <!-- Glass Dropper Bottle -->
            <rect x="140" y="100" width="120" height="260" rx="20" fill="rgba(255,255,255,0.15)" stroke="#2dd4bf" stroke-width="2"/>
            <!-- Glowing Amber Active Fluid Core -->
            <rect x="150" y="150" width="100" height="200" rx="14" fill="url(#amberSerum)" opacity="0.9"/>
            <!-- Minimalist White Label -->
            <rect x="155" y="200" width="90" height="110" rx="4" fill="#ffffff"/>
            <text x="200" y="235" font-family="'Plus Jakarta Sans', sans-serif" font-size="12" font-weight="800" fill="#0f172a" text-anchor="middle">LUMIÈRE</text>
            <text x="200" y="255" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="600" fill="#64748b" text-anchor="middle">RADIANCE SERUM</text>
            <text x="200" y="280" font-family="'Plus Jakarta Sans', sans-serif" font-size="8" font-weight="700" fill="#0d9488" text-anchor="middle">50ml · 1.7 FL OZ</text>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">KEY ACTIVE</div><div class="spec-v">15% Triple-C Complex · Niacinamide</div></div>
          <div><div class="spec-k">CLINICAL GRADE</div><div class="spec-v">Dermatologist Tested · Hypoallergenic</div></div>
          <div><div class="spec-k">OEM / BULK MOQ</div><div class="spec-v">500 Units / Custom Label</div></div>
        </div>
      </div>
    </body></html>`;

    // Cosmetic 2: Botanical Cleanser
    const c2 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #09261a 0%, #04140d 55%, #020805 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(6, 28, 18, 0.75); border: 1.5px solid rgba(16, 185, 129, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(16,185,129,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(16,185,129,0.25); border: 1px solid #10b981; color: #a7f3d0; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #34d399; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">CLEANSE & PREP</div>
        <div class="brand">LUMIÈRE SKINCARE · BOTANICAL BIO</div>
        <div class="title">Botanical Cleansing Infusion Foam</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <!-- Dispenser Pump -->
            <path d="M190 40 L190 70 L230 70 L230 80 L170 80 L170 40 Z" fill="#ffffff"/>
            <rect x="165" y="80" width="70" height="24" rx="4" fill="#334155"/>
            <!-- Frosted Glass Pump Bottle -->
            <rect x="135" y="104" width="130" height="260" rx="24" fill="#f8fafc" opacity="0.9"/>
            <!-- Botanical Label -->
            <rect x="145" y="180" width="110" height="120" rx="6" fill="#064e3b"/>
            <text x="200" y="220" font-family="'Plus Jakarta Sans', sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle">LUMIÈRE</text>
            <text x="200" y="245" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="600" fill="#a7f3d0" text-anchor="middle">BOTANICAL CLEANSER</text>
            <text x="200" y="275" font-family="'Plus Jakarta Sans', sans-serif" font-size="8" font-weight="700" fill="#34d399" text-anchor="middle">pH 5.5 · 200ml</text>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">FORMULATION</div><div class="spec-v">Green Tea · Centella Asiatica</div></div>
          <div><div class="spec-k">pH BALANCE</div><div class="spec-v">pH 5.5 Gentle Acidic Barrier</div></div>
          <div><div class="spec-k">OEM / BULK MOQ</div><div class="spec-v">1,000 Units / Turnkey Formula</div></div>
        </div>
      </div>
    </body></html>`;

    // Cosmetic 3: Peptide Cream
    const c3 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #2d1825 0%, #160a12 55%, #0a0408 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(26, 11, 20, 0.75); border: 1.5px solid rgba(236, 72, 153, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(236,72,153,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(236,72,153,0.25); border: 1px solid #ec4899; color: #fbcfe8; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #f472b6; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">HYDRATION & REPAIR</div>
        <div class="brand">LUMIÈRE SKINCARE · INTENSE NOURISH</div>
        <div class="title">Advanced Multi-Peptide Moisture Cream</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <defs>
              <linearGradient id="roseLid" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fbcfe8"/><stop offset="50%" stop-color="#db2777"/><stop offset="100%" stop-color="#831843"/>
              </linearGradient>
            </defs>
            <!-- Heavy Acrylic Jar Lid with Rose Gold Finish -->
            <rect x="100" y="130" width="200" height="45" rx="8" fill="url(#roseLid)" stroke="#fdf2f8" stroke-width="2"/>
            <!-- Double-Walled Crystal Cream Jar -->
            <rect x="110" y="175" width="180" height="150" rx="16" fill="rgba(255,255,255,0.2)" stroke="#f472b6" stroke-width="2"/>
            <rect x="125" y="190" width="150" height="120" rx="10" fill="#ffffff"/>
            <!-- Brand Text on Jar -->
            <text x="200" y="240" font-family="'Plus Jakarta Sans', sans-serif" font-size="14" font-weight="800" fill="#0f172a" text-anchor="middle">LUMIÈRE</text>
            <text x="200" y="265" font-family="'Plus Jakarta Sans', sans-serif" font-size="9" font-weight="600" fill="#db2777" text-anchor="middle">PEPTIDE BARRIER CREAM</text>
            <text x="200" y="290" font-family="'Plus Jakarta Sans', sans-serif" font-size="8" font-weight="700" fill="#64748b" text-anchor="middle">50g NET WT. 1.7 OZ</text>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">PEPTIDE COMPLEX</div><div class="spec-v">Hexapeptide-8 + Copper Peptides</div></div>
          <div><div class="spec-k">CERAMIDE NP</div><div class="spec-v">5-Layer Lipid Barrier Lock</div></div>
          <div><div class="spec-k">OEM / BULK MOQ</div><div class="spec-v">500 Jars / Custom Fragrance</div></div>
        </div>
      </div>
    </body></html>`;

    // Cosmetic 4: Essence Tower
    const c4 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #182236 0%, #0d121c 55%, #05070a 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(14, 20, 32, 0.75); border: 1.5px solid rgba(59, 130, 246, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(59,130,246,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(59,130,246,0.25); border: 1px solid #3b82f6; color: #bfdbfe; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #60a5fa; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">PROFESSIONAL SUITE</div>
        <div class="brand">LUMIÈRE SKINCARE · ESTHETIC TOWER</div>
        <div class="title">Clinical Essence &amp; Ampoule Display Tower</div>
        <div class="visual">
          <svg width="440" height="460" viewBox="0 0 400 420" fill="none">
            <defs>
              <linearGradient id="backglow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/>
              </linearGradient>
            </defs>
            <!-- 3-Tier Backlit Retail / Spa Display Showcase -->
            <rect x="80" y="60" width="240" height="300" rx="14" fill="#0f172a" stroke="#60a5fa" stroke-width="2"/>
            <!-- Shelves -->
            <rect x="90" y="140" width="220" height="8" rx="4" fill="#334155"/>
            <rect x="90" y="230" width="220" height="8" rx="4" fill="#334155"/>
            <rect x="90" y="320" width="220" height="8" rx="4" fill="#334155"/>
            <!-- Tier 1 Ampoules -->
            <rect x="110" y="80" width="24" height="55" rx="6" fill="#60a5fa"/>
            <rect x="150" y="80" width="24" height="55" rx="6" fill="#f43f5e"/>
            <rect x="190" y="80" width="24" height="55" rx="6" fill="#10b981"/>
            <rect x="230" y="80" width="24" height="55" rx="6" fill="#f59e0b"/>
            <rect x="270" y="80" width="24" height="55" rx="6" fill="#8b5cf6"/>
            <!-- Tier 2 Bottles -->
            <rect x="120" y="160" width="36" height="65" rx="8" fill="#ffffff"/>
            <rect x="180" y="160" width="36" height="65" rx="8" fill="#ffffff"/>
            <rect x="240" y="160" width="36" height="65" rx="8" fill="#ffffff"/>
            <!-- Tier 3 Jars -->
            <rect x="125" y="260" width="50" height="55" rx="8" fill="#cbd5e1"/>
            <rect x="225" y="260" width="50" height="55" rx="8" fill="#cbd5e1"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">DISPLAY SYSTEM</div><div class="spec-v">LED Edge-Lit Acrylic Tower</div></div>
          <div><div class="spec-k">PRODUCT COUNT</div><div class="spec-v">24 Full-Size Stock Units</div></div>
          <div><div class="spec-k">COMMERCIAL MOQ</div><div class="spec-v">4 Merchandising Sets</div></div>
        </div>
      </div>
    </body></html>`;

    // ════════════════════════════════════════════════════════════════════════
    // 3. NOVA LIVING DESIGNER FURNITURE (4 High-Definition Products)
    // ════════════════════════════════════════════════════════════════════════
    
    // Furniture 1: Linen Sofa
    const u1 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #2b2216 0%, #15100a 55%, #080604 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(22, 17, 12, 0.75); border: 1.5px solid rgba(245, 158, 11, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(245,158,11,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(245,158,11,0.25); border: 1px solid #f59e0b; color: #fde68a; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #fbbf24; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">LIVING ROOM SUITE</div>
        <div class="brand">NOVA LIVING · SCANDINAVIAN COLLECTION</div>
        <div class="title">Nordic Organic Linen 3-Seater Sofa</div>
        <div class="visual">
          <svg width="460" height="420" viewBox="0 0 460 380" fill="none">
            <defs>
              <linearGradient id="oakLegs" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#92400e"/>
              </linearGradient>
            </defs>
            <!-- Solid Oak Tapered Legs -->
            <polygon points="60,260 50,330 65,330 75,260" fill="url(#oakLegs)"/>
            <polygon points="160,260 155,330 170,330 175,260" fill="url(#oakLegs)"/>
            <polygon points="300,260 295,330 310,330 315,260" fill="url(#oakLegs)"/>
            <polygon points="400,260 390,330 405,330 415,260" fill="url(#oakLegs)"/>
            <!-- Plinth Underframe -->
            <rect x="45" y="245" width="370" height="20" rx="4" fill="#b45309"/>
            <!-- Backrest Cushion Cushions -->
            <rect x="40" y="110" width="380" height="110" rx="16" fill="#f8fafc"/>
            <!-- Seat Cushions -->
            <rect x="35" y="180" width="125" height="75" rx="14" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
            <rect x="165" y="180" width="130" height="75" rx="14" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
            <rect x="300" y="180" width="125" height="75" rx="14" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
            <!-- Rolled Armrests -->
            <rect x="25" y="145" width="40" height="110" rx="18" fill="#e2e8f0"/>
            <rect x="395" y="145" width="40" height="110" rx="18" fill="#e2e8f0"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">UPHOLSTERY</div><div class="spec-v">100% Belgian Organic Linen 450g</div></div>
          <div><div class="spec-k">TIMBER FRAME</div><div class="spec-v">Kiln-Dried European Solid Oak</div></div>
          <div><div class="spec-k">DIMENSIONS</div><div class="spec-v">220cm (W) x 92cm (D) x 82cm (H)</div></div>
        </div>
      </div>
    </body></html>`;

    // Furniture 2: Walnut Lounge Chair
    const u2 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #261f17 0%, #130f0b 55%, #080604 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(19, 15, 11, 0.75); border: 1.5px solid rgba(217, 119, 6, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(217,119,6,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(217,119,6,0.25); border: 1px solid #d97706; color: #fde68a; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #f59e0b; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">ACCENT SEATING</div>
        <div class="brand">NOVA LIVING · ARTISAN WOODCRAFT</div>
        <div class="title">Artisan Walnut Lounge Armchair</div>
        <div class="visual">
          <svg width="440" height="420" viewBox="0 0 400 400" fill="none">
            <!-- Sculpted Solid Walnut Timber Frame -->
            <path d="M90 320 L150 140 L280 180 L320 330" stroke="#78350f" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M120 220 L300 220" stroke="#78350f" stroke-width="18" stroke-linecap="round"/>
            <!-- Vintage Black Semi-Aniline Leather Cushions -->
            <rect x="150" y="120" width="130" height="110" rx="14" fill="#1e293b" transform="rotate(10 150 120)" stroke="#334155" stroke-width="2"/>
            <rect x="135" y="210" width="150" height="65" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">FRAME</div><div class="spec-v">Solid American Walnut</div></div>
          <div><div class="spec-k">LEATHER</div><div class="spec-v">Italian Semi-Aniline Full Grain</div></div>
          <div><div class="spec-k">COMMERCIAL MOQ</div><div class="spec-v">6 Chairs / Custom Stain</div></div>
        </div>
      </div>
    </body></html>`;

    // Furniture 3: Stockholm Dining Table Set
    const u3 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #2e2417 0%, #151009 55%, #080603 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(22, 17, 11, 0.75); border: 1.5px solid rgba(245, 158, 11, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(245,158,11,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(245,158,11,0.25); border: 1px solid #f59e0b; color: #fde68a; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #fbbf24; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">DINING PAVILION</div>
        <div class="brand">NOVA LIVING · STOCKHOLM SERIES</div>
        <div class="title">Stockholm Solid Oak Dining Table Set</div>
        <div class="visual">
          <svg width="460" height="420" viewBox="0 0 460 380" fill="none">
            <!-- Dining Chairs in Background -->
            <rect x="70" y="130" width="55" height="85" rx="8" fill="#64748b"/>
            <rect x="150" y="130" width="55" height="85" rx="8" fill="#64748b"/>
            <rect x="255" y="130" width="55" height="85" rx="8" fill="#64748b"/>
            <rect x="335" y="130" width="55" height="85" rx="8" fill="#64748b"/>
            <!-- Matte Black Carbon Steel Trestle Base -->
            <polygon points="120,210 90,320 110,320 135,210" fill="#0f172a"/>
            <polygon points="340,210 370,320 350,320 325,210" fill="#0f172a"/>
            <rect x="100" y="300" width="260" height="12" rx="4" fill="#0f172a"/>
            <!-- 38mm Solid White Oak Edge-Glued Tabletop with Organic Rounded Corners -->
            <rect x="40" y="195" width="380" height="30" rx="8" fill="#d97706" stroke="#fde68a" stroke-width="2"/>
            <!-- Foreground Chairs -->
            <rect x="110" y="240" width="65" height="90" rx="10" fill="#1e293b"/>
            <rect x="285" y="240" width="65" height="90" rx="10" fill="#1e293b"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">TIMBER SPEC</div><div class="spec-v">Solid White Oak 38mm Edge-Glued</div></div>
          <div><div class="spec-k">BASE STRUCTURE</div><div class="spec-v">Powder-Coated Carbon Steel Trestle</div></div>
          <div><div class="spec-k">TABLE DIMENSIONS</div><div class="spec-v">240cm (L) x 100cm (W) x 75cm (H)</div></div>
        </div>
      </div>
    </body></html>`;

    // Furniture 4: Espresso Leather Sofa
    const u4 = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { width: 1024px; height: 1024px; background: radial-gradient(circle at 50% 35%, #251a13 0%, #120c08 55%, #060403 100%); display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; overflow: hidden; }
      .frame { width: 920px; height: 920px; border-radius: 32px; background: rgba(18, 12, 8, 0.75); border: 1.5px solid rgba(245, 158, 11, 0.4); box-shadow: 0 40px 100px rgba(0,0,0,0.85), inset 0 0 60px rgba(245,158,11,0.15); display: flex; flex-direction: column; padding: 48px; position: relative; }
      .badge { position: absolute; top: 48px; right: 48px; background: rgba(245,158,11,0.25); border: 1px solid #f59e0b; color: #fde68a; padding: 8px 18px; border-radius: 30px; font-size: 13px; font-weight: 800; letter-spacing: 1px; }
      .brand { font-size: 13px; letter-spacing: 4px; color: #fbbf24; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; }
      .title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 700; color: #fff; margin-bottom: 24px; line-height: 1.15; }
      .visual { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
      .specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: rgba(0,0,0,0.5); padding: 22px 28px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); margin-top: auto; }
      .spec-k { font-size: 11px; letter-spacing: 1.5px; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; font-weight: 700; }
      .spec-v { font-size: 14px; font-weight: 700; color: #f8fafc; }
    </style></head><body>
      <div class="frame">
        <div class="badge">EXECUTIVE LOUNGE</div>
        <div class="brand">NOVA LIVING · EXECUTIVE LEATHER</div>
        <div class="title">Espresso Top-Grain Leather Sectional</div>
        <div class="visual">
          <svg width="460" height="420" viewBox="0 0 460 380" fill="none">
            <!-- Brass Metal Feet -->
            <rect x="50" y="270" width="18" height="35" rx="3" fill="#f59e0b"/>
            <rect x="180" y="270" width="18" height="35" rx="3" fill="#f59e0b"/>
            <rect x="310" y="270" width="18" height="35" rx="3" fill="#f59e0b"/>
            <rect x="400" y="270" width="18" height="35" rx="3" fill="#f59e0b"/>
            <!-- Espresso Leather Backrest with Tailored Tufting -->
            <rect x="40" y="110" width="385" height="120" rx="14" fill="#2d1b11" stroke="#451a03" stroke-width="2"/>
            <!-- Plush Deep Seat Modules -->
            <rect x="35" y="185" width="125" height="90" rx="12" fill="#382314" stroke="#78350f" stroke-width="2"/>
            <rect x="165" y="185" width="130" height="90" rx="12" fill="#382314" stroke="#78350f" stroke-width="2"/>
            <rect x="300" y="185" width="130" height="90" rx="12" fill="#382314" stroke="#78350f" stroke-width="2"/>
            <!-- Box Armrests -->
            <rect x="25" y="145" width="40" height="125" rx="10" fill="#24150c"/>
            <rect x="400" y="145" width="40" height="125" rx="10" fill="#24150c"/>
          </svg>
        </div>
        <div class="specs">
          <div><div class="spec-k">LEATHER GRADE</div><div class="spec-v">Italian Semi-Aniline Top-Grain</div></div>
          <div><div class="spec-k">SUSPENSION</div><div class="spec-v">8-Way Hand-Tied Coil Spring</div></div>
          <div><div class="spec-k">DIMENSIONS</div><div class="spec-v">280cm (W) x 105cm (D) x 80cm (H)</div></div>
        </div>
      </div>
    </body></html>`;

    // Render all 12 images to app_build
    const baseDir = path.join(__dirname, 'app_build', 'client', 'assets', 'demo');
    
    await renderCard(browser, f1, path.join(baseDir, 'vantelle-showcase', 'products', 'scarlet_wrap_set.jpg'));
    await renderCard(browser, f2, path.join(baseDir, 'vantelle-showcase', 'products', 'ivory_suit.jpg'));
    await renderCard(browser, f3, path.join(baseDir, 'vantelle-showcase', 'products', 'midnight_leather.jpg'));
    await renderCard(browser, f4, path.join(baseDir, 'vantelle-showcase', 'products', 'paris_bag.jpg'));

    await renderCard(browser, c1, path.join(baseDir, 'lumiere-showcase', 'products', 'radiance_serum.jpg'));
    await renderCard(browser, c2, path.join(baseDir, 'lumiere-showcase', 'products', 'botanical_cleanser.jpg'));
    await renderCard(browser, c3, path.join(baseDir, 'lumiere-showcase', 'products', 'peptide_cream.jpg'));
    await renderCard(browser, c4, path.join(baseDir, 'lumiere-showcase', 'products', 'essence_tower.jpg'));

    await renderCard(browser, u1, path.join(baseDir, 'furniture-showcase', 'products', 'linen_sofa.jpg'));
    await renderCard(browser, u2, path.join(baseDir, 'furniture-showcase', 'products', 'lounge_chair.jpg'));
    await renderCard(browser, u3, path.join(baseDir, 'furniture-showcase', 'products', 'dining_table.jpg'));
    await renderCard(browser, u4, path.join(baseDir, 'furniture-showcase', 'products', 'leather_sofa.jpg'));

    console.log('ALL 12 HIGH-DEFINITION PRODUCT IMAGES GENERATED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
})();
