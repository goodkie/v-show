const fs = require('fs');
const path = require('path');

const baseHtml = fs.readFileSync(path.join(__dirname, 'app_build', 'client', 'demo-fashion.html'), 'utf8');

let cosmeticHtml = baseHtml
  .replace(/<title>.*?<\/title>/, '<title>LUMIÈRE SKINCARE | Botanical Bio-Cellular Beauty Showroom — Master Demo</title>')
  .replace(/VANTÉLLE<\/span>\s*<span[^>]*>PARIS/g, 'LUMIÈRE</span>\n        <span style="font-size: 11px; letter-spacing: 2.5px; color: #e2c974; font-weight: 700; margin-left: 4px;">SKINCARE')
  .replace(/SPRING \/ SUMMER 2025 SHOWROOM/g, 'BOTANICAL BIO-CELLULAR BEAUTY PAVILION')
  .replace(/--cyan: #e11d48;/g, '--cyan: #e2c974;')
  .replace(/--cyan-glow: rgba\(225, 29, 72, 0.55\);/g, '--cyan-glow: rgba(226, 201, 116, 0.55);')
  .replace(/--panel-border: rgba\(225, 29, 72, 0.35\);/g, '--panel-border: rgba(226, 201, 116, 0.35);')
  .replace(/DOWNLOAD LOOKBOOK/g, 'DOWNLOAD CATALOG')
  .replace(/REQUEST WHOLESALE/g, 'REQUEST WHOLESALE / OEM')
  .replace(/01\. Vantelle Paris Central Pavilion/g, '01. Lumière Main Exhibition Pavilion');

// Update SPATIAL_NODES
const spatialNodes = `
const SPATIAL_NODES = [
  {
    id: 0,
    name: "01. Lumière Main Exhibition Pavilion",
    preview: "/assets/demo/lumiere-showcase/pano360/node0_preview.jpg",
    image8k: "/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg",
    image16k: "/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg",
    puckPos: new THREE.Vector3(0, -160, -320),
    radarPos: { x: 153, y: 72 }
  }
];
`;

cosmeticHtml = cosmeticHtml.replace(/const SPATIAL_NODES = \[.*?\];/s, spatialNodes.trim());

// Update PRODUCTS_DATA with 4 luxury cosmetic items & exact calibrated coordinates
const productsData = `
const PRODUCTS_DATA = [
  {
    id: 'PROD-01-SERUM',
    name: 'Cellular Radiance Bio-Serum',
    model: 'LM-RAD-SR30',
    category: 'Active Treatment',
    image: '/assets/demo/lumiere-showcase/products/radiance_serum.jpg',
    worldPos: new THREE.Vector3(-50, -65, -340),
    nodeIdx: 0,
    desc: 'High-potency brightening serum powered by 15% stabilized triple-vitamin C and botanical camellia seed extract. Delivers luminous dermal radiance and collagen synthesis.',
    specs: [
      ['Active Complex', '15% Stabilized Triple-Vitamin C + Ferulic Acid'],
      ['Base Carrier', 'Cold-Pressed Camellia Japonica Seed Extract'],
      ['Key Benefit', 'Deep Dermal Brightening & Free-Radical Defense'],
      ['Volume & Packaging', '30ml UV-Shield Amber Glass Dropper'],
      ['Clinical Testing', 'Dermatologist Tested · 98% Natural Origin'],
      ['Wholesale / OEM MOQ', '50 Units / White-Label Batch Available']
    ],
    highlights: [
      'Encapsulated bio-active delivery ensures 100% vitamin stability throughout shelf life',
      'Clinical trial demonstrates +42% increase in skin barrier hydration within 14 days',
      'Compliant with Japan MHLW, EU Cosmetics Regulation, and US FDA standards'
    ],
    robotType: 'cobot'
  },
  {
    id: 'PROD-02-CLEANSER',
    name: 'Pure Botanical Cleansing Infusion',
    model: 'LM-CLN-BT150',
    category: 'Cleanse & Prep',
    image: '/assets/demo/lumiere-showcase/products/botanical_cleanser.jpg',
    worldPos: new THREE.Vector3(-260, -75, -300),
    nodeIdx: 0,
    desc: 'Ultra-gentle micro-foam botanical cleanser with Centella Asiatica and fermented green tea. Purifies pores without stripping essential lipid moisture.',
    specs: [
      ['Key Botanical', 'Centella Asiatica + Fermented Green Tea'],
      ['Formulation', 'Micro-Foam Oil-to-Milk Non-Stripping Cleanser'],
      ['Skin Compatibility', 'All Skin Types · pH 5.5 Balanced Barrier'],
      ['Volume & Packaging', '150ml Eco-Dispenser Pump Bottle'],
      ['Certifications', 'Cruelty-Free · EWG Verified Green Grade'],
      ['Wholesale MOQ', '100 Units / Standard Export Carton']
    ],
    highlights: [
      'Rich antioxidant polyphenols protect against particulate matter (PM2.5) pollution',
      'Non-comedogenic formula thoroughly removes stubborn waterproof cosmetics',
      'Supplied with custom branded retail display caddies and organic cotton tester pads'
    ],
    robotType: 'amr'
  },
  {
    id: 'PROD-03-CREAM',
    name: 'Advanced Multi-Peptide Moisture Cream',
    model: 'LM-PEP-CR50',
    category: 'Hydration & Repair',
    image: '/assets/demo/lumiere-showcase/products/peptide_cream.jpg',
    worldPos: new THREE.Vector3(65, -65, -340),
    nodeIdx: 0,
    desc: 'Luxurious peptide-dense barrier cream with 5% Ceramide NP complex. Restores structural firmness, diminishes fine lines, and seals moisture for 72 hours.',
    specs: [
      ['Bio-Active Matrix', 'Hexapeptide-8 + Ceramide NP Complex (5%)'],
      ['Texture', 'Velvet Cashmere Rich Emulsion'],
      ['Target Action', 'Collagen Regeneration & 72h Moisture Lock'],
      ['Volume & Jar', '50g Double-Walled Frosted Glass Jar'],
      ['Fragrance Profile', 'Allergen-Free Natural Hinoki Wood & Jasmine'],
      ['Wholesale MOQ', '40 Units / Display Master Tray']
    ],
    highlights: [
      'Biomimetic lamellar lipid structure absorbs instantaneously with zero greasy residue',
      'Spatula and airtight inner seal included for sterile daily application',
      'Free from parabens, sulfates, synthetic silicones, and artificial colorants'
    ],
    robotType: 'delta'
  },
  {
    id: 'PROD-04-ESSENCE',
    name: 'Total Age-Defying Essence Suite',
    model: 'LM-SET-AG04',
    category: 'Professional Suite',
    image: '/assets/demo/lumiere-showcase/products/essence_tower.jpg',
    worldPos: new THREE.Vector3(280, -30, -300),
    nodeIdx: 0,
    desc: 'Complete 4-step professional clinical treatment regimen featuring 92% Galactomyces ferment filtrate for intensive cell renewal and elasticity optimization.',
    specs: [
      ['Suite Composition', '4-Step Essence, Ampoule, Emulsion & Mist'],
      ['Clinical Active', 'Galactomyces Ferment Filtrate (92%)'],
      ['Efficacy Trial', '4-Week Reduction in Fine Lines (-34%)'],
      ['Shelf Life', '36 Months Sealed / 12 Months Opened'],
      ['Standards', 'ISO 22716 GMP & Ecocert Certified'],
      ['Wholesale MOQ', '20 Master Suites / Salon Minimum']
    ],
    highlights: [
      'Exclusive back-bar salon packaging and retail boxed presentation formats available',
      'Includes complimentary professional aesthetician treatment protocol manual',
      'High re-order velocity with 84% wholesale buyer repeat purchase rate'
    ],
    robotType: 'scara'
  }
];
`;

cosmeticHtml = cosmeticHtml.replace(/const PRODUCTS_DATA = \[.*?\];/s, productsData.trim());

// Update Bottom Product Cards Tray HTML in DOM
const newTrayDOM = `
      <div id="product-cards-tray">
        <div class="prod-quick-card active" id="pcard-0" onclick="focusProduct(0)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/lumiere-showcase/products/radiance_serum.jpg" alt="Cellular Radiance Bio-Serum">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">ACTIVE TREATMENT</div>
            <div class="prod-card-title">Radiance Bio-Serum</div>
            <div class="prod-card-spec">15% Vitamin C &amp; Camellia</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-1" onclick="focusProduct(1)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/lumiere-showcase/products/botanical_cleanser.jpg" alt="Pure Botanical Cleansing Infusion">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">CLEANSE &amp; PREP</div>
            <div class="prod-card-title">Botanical Cleanser</div>
            <div class="prod-card-spec">Centella &amp; Green Tea</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-2" onclick="focusProduct(2)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/lumiere-showcase/products/peptide_cream.jpg" alt="Advanced Multi-Peptide Moisture Cream">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">HYDRATION &amp; REPAIR</div>
            <div class="prod-card-title">Peptide Barrier Cream</div>
            <div class="prod-card-spec">Ceramide NP · 72h Moisture</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-3" onclick="focusProduct(3)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/lumiere-showcase/products/essence_tower.jpg" alt="Total Age-Defying Essence Suite">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">PROFESSIONAL SUITE</div>
            <div class="prod-card-title">Essence Treatment Suite</div>
            <div class="prod-card-spec">92% Galactomyces Ferment</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>
      </div>
`;

cosmeticHtml = cosmeticHtml.replace(/<div id="product-cards-tray">.*?<\/div>\s*<\/section>/s, `${newTrayDOM.trim()}\n    </section>`);

// Update sidebar initial static view
cosmeticHtml = cosmeticHtml
  .replace(/<div class="panel-head" style="margin-bottom:0;">.*?<\/div>/s, '<div class="panel-head" style="margin-bottom:0;">FEATURED CLINICAL SKINCARE</div>')
  .replace(/<span id="side-spec-title">.*?<\/span>/s, '<span id="side-spec-title">Cellular Radiance Bio-Serum</span>')
  .replace(/<div class="spec-desc" id="side-spec-desc">.*?<\/div>/s, '<div class="spec-desc" id="side-spec-desc">High-potency brightening serum powered by 15% stabilized triple-vitamin C and botanical camellia seed extract.</div>')
  .replace(/<div class="spec-list" id="side-spec-list">.*?<\/div>/s, `
    <div class="spec-list" id="side-spec-list">
      <div class="spec-item"><div class="spec-k">ACTIVE</div><div class="spec-v">15% Vitamin C + Ferulic</div></div>
      <div class="spec-item"><div class="spec-k">FORMULATION</div><div class="spec-v">Bio-Cellular Matrix</div></div>
      <div class="spec-item"><div class="spec-k">STANDARDS</div><div class="spec-v">EWG Green · ISO 22716</div></div>
      <div class="spec-item"><div class="spec-k">WHOLESALE</div><div class="spec-v">50 Units MOQ</div></div>
    </div>
  `)
  .replace(/📝 Request Wholesale Quote/g, '📝 Request Wholesale / OEM Quote')
  .replace(/photoSphere\.rotation\.y = -0\.92;/g, 'photoSphere.rotation.y = -1.57;');

// Save demo-cosmetic.html
fs.writeFileSync(path.join(__dirname, 'app_build', 'client', 'demo-cosmetic.html'), cosmeticHtml, 'utf8');
console.log('Successfully generated calibrated demo-cosmetic.html!');
