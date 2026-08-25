const fs = require('fs');
const path = require('path');

const baseHtml = fs.readFileSync(path.join(__dirname, 'app_build', 'client', 'demo-matterport.html'), 'utf8');

// Replace Brand & Title
let fashionHtml = baseHtml
  .replace(/<title>.*?<\/title>/, '<title>VANTÉLLE PARIS | Haute Couture &amp; Ready-to-Wear Showroom — Master Demo</title>')
  .replace(/<div class="brand-logo">.*?<\/div>/s, `
    <div class="brand-group">
      <a href="/" class="brand-logo">
        <span style="font-family:'Playfair Display', Georgia, serif; font-size: 20px; letter-spacing: 2px; font-weight: 800; color: #fff;">VANTÉLLE</span>
        <span style="font-size: 11px; letter-spacing: 3px; color: #e11d48; font-weight: 700; margin-left: 4px;">PARIS</span>
      </a>
      <span class="brand-badge" style="background: rgba(225, 29, 72, 0.15); border-color: rgba(225, 29, 72, 0.4); color: #fb7185;">
        <span class="pulse-dot" style="background: #fb7185; box-shadow: 0 0 8px #fb7185;"></span>
        SPRING / SUMMER 2025 SHOWROOM
      </span>
    </div>
  `)
  .replace(/DOWNLOAD BROCHURE/g, 'DOWNLOAD LOOKBOOK')
  .replace(/REQUEST RFQ/g, 'REQUEST WHOLESALE')
  .replace(/DOWNLOAD LOOKBOOK/g, 'DOWNLOAD LOOKBOOK')
  .replace(/REQUEST WHOLESALE/g, 'REQUEST WHOLESALE');

// Update CSS Variables for luxury Paris Fashion Theme
fashionHtml = fashionHtml
  .replace(/--cyan: #00c2ff;/g, '--cyan: #e11d48;')
  .replace(/--cyan-glow: rgba\(0, 194, 255, 0.55\);/g, '--cyan-glow: rgba(225, 29, 72, 0.55);')
  .replace(/--panel-border: rgba\(56, 189, 248, 0.35\);/g, '--panel-border: rgba(225, 29, 72, 0.35);');

// Update SPATIAL_NODES
const spatialNodes = `
const SPATIAL_NODES = [
  {
    id: 0,
    name: "01. Vantelle Paris Central Pavilion",
    preview: "/assets/demo/vantelle-showcase/pano360/node0_preview.jpg",
    image8k: "/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg",
    image16k: "/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg",
    puckPos: new THREE.Vector3(0, -160, -320),
    radarPos: { x: 153, y: 72 }
  }
];
`;

fashionHtml = fashionHtml.replace(/const SPATIAL_NODES = \[.*?\];/s, spatialNodes.trim());

// Update PRODUCTS_DATA with 4 luxury fashion items & exact calibrated coordinates
const productsData = `
const PRODUCTS_DATA = [
  {
    id: 'PROD-01-SCARLET-WRAP',
    name: 'Scarlet Cashmere Wrap & Culottes',
    model: 'VP-SS25-SW01',
    category: 'Runway Capsule',
    image: '/assets/demo/vantelle-showcase/products/scarlet_wrap_set.jpg',
    worldPos: new THREE.Vector3(-240, -40, -320),
    nodeIdx: 0,
    desc: 'Vibrant scarlet red hooded cashmere cardigan paired with high-waisted pleated ivory culottes. Tailored with architectural drape for the SS25 Paris runway.',
    specs: [
      ['Knit Composition', '70% Mongolian Cashmere · 30% Mulberry Silk'],
      ['Trousers Fabric', '100% Crisp Italian Wool Gabardine'],
      ['Closure & Details', 'Concealed Magnetic Horn Fastener'],
      ['Silhouette', 'Relaxed Hooded Top + Wide-Leg Tailored Culotte'],
      ['Care Instructions', 'Specialist Luxury Dry Clean Only'],
      ['Wholesale MOQ', '8 Sets / Sizing Matrix (XS–XL)']
    ],
    highlights: [
      'Hand-loomed 12-gauge Mongolian cashmere offers featherlight warmth with liquid drape',
      'High-waisted culottes feature signature internal silk waistband support',
      'Full SS25 Lookbook editorial and runway video assets provided with wholesale orders'
    ],
    robotType: 'cobot'
  },
  {
    id: 'PROD-02-IVORY-SILK',
    name: 'Ivory Structured Silk Blouse Set',
    model: 'VP-SS25-IV02',
    category: 'Tailored Suiting',
    image: '/assets/demo/vantelle-showcase/products/ivory_silk_suit.jpg',
    worldPos: new THREE.Vector3(-130, -30, -340),
    nodeIdx: 0,
    desc: 'Pure ivory silk twill structured blouse featuring contrast dark buttons and tailored wide-leg midnight trousers. The epitome of modern executive elegance.',
    specs: [
      ['Blouse Material', '100% Heavy Silk Twill (26mm)'],
      ['Pants Fabric', 'Super 160s Virgin Wool Crepe'],
      ['Buttons & Hardware', 'Custom Carved Buffalo Horn with Gold Inlay'],
      ['Fit & Silhouette', 'Structured Shoulder · High-Waist Wide Leg'],
      ['Certification', 'GOTS & OEKO-TEX Standard 100 Certified'],
      ['Wholesale MOQ', '10 Units / Style / Colorway']
    ],
    highlights: [
      'Double-faced silk front placket prevents transparency while maintaining breathability',
      'Tailored with 4cm interior hem allowances for seamless boutique bespoke alterations',
      'Available in Ivory/Noir, Champagne/Espresso, and Monochromatic Chalk'
    ],
    robotType: 'amr'
  },
  {
    id: 'PROD-03-MIDNIGHT-LEATHER',
    name: 'Midnight Noir Leather Ensemble',
    model: 'VP-SS25-MN03',
    category: 'Haute Leather',
    image: '/assets/demo/vantelle-showcase/products/midnight_noir_leather.jpg',
    worldPos: new THREE.Vector3(-20, -90, -340),
    nodeIdx: 0,
    desc: 'Supple Italian lambskin leather single-breasted blazer and matching cigarette trousers in midnight noir. Hand-burnished by Florentine artisans.',
    specs: [
      ['Leather Grade', 'Full-Grain Italian Lambskin Nappa (0.7mm)'],
      ['Lining Material', '100% Cupro Bemberg Jacquard Signature Monogram'],
      ['Lapel & Style', 'Slim Notch Lapel · Single Button Stance'],
      ['Hardware', 'Hand-Polished Gunmetal Finish'],
      ['Treatment', 'Nanotech Water & Stain Resistant Shield'],
      ['Wholesale MOQ', '6 Sets / Handcrafted Batch']
    ],
    highlights: [
      'Unsurpassed softness with structured interior chest canvas for perpetual silhouette retention',
      'Artisan glove-tanned leather patinas gracefully with age and wear',
      'Packaged in breathable cotton garment bag with custom wooden cedar hanger'
    ],
    robotType: 'delta'
  },
  {
    id: 'PROD-04-VANTELLE-SATCHEL',
    name: 'Vantelle Signature Paris Satchel',
    model: 'VP-ACC-BG04',
    category: 'Leather Goods & Bags',
    image: '/assets/demo/vantelle-showcase/products/vantelle_satchel.jpg',
    worldPos: new THREE.Vector3(110, -40, -340),
    nodeIdx: 0,
    desc: 'Iconic top-handle structured satchel in box calf leather with signature gold-finish lock clasp and detachable crossbody strap. Includes retail presentation box.',
    specs: [
      ['Leather Exterior', 'Full-Grain French Box Calfskin'],
      ['Interior Lining', 'Burgundy French Chevre Goat Leather'],
      ['Hardware & Lock', '24k Gold-Electroplated Solid Brass Clasp'],
      ['Dimensions', '26.5cm (W) x 19.0cm (H) x 10.5cm (D)'],
      ['Origin & Atelier', 'Handcrafted in 8e Arrondissement, Paris'],
      ['Wholesale MOQ', '5 Pieces / Minimum Order']
    ],
    highlights: [
      'Traditional saddlery hand-stitched handle and beeswax-burnished edges',
      'Dual accordion compartments with center zipper partition and discrete mirror pocket',
      'Supplied with magnetic-closure luxury gift box, velvet pouch, and certificate of authenticity'
    ],
    robotType: 'scara'
  }
];
`;

fashionHtml = fashionHtml.replace(/const PRODUCTS_DATA = \[.*?\];/s, productsData.trim());

// Update Bottom Product Cards Tray HTML in DOM
const newTrayDOM = `
      <div id="product-cards-tray">
        <div class="prod-quick-card active" id="pcard-0" onclick="focusProduct(0)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/vantelle-showcase/products/scarlet_wrap_set.jpg" alt="Scarlet Cashmere Wrap Set">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#fb7185;">RUNWAY CAPSULE</div>
            <div class="prod-card-title">Scarlet Wrap Set</div>
            <div class="prod-card-spec">Cashmere &amp; Silk · SS25</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-1" onclick="focusProduct(1)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/vantelle-showcase/products/ivory_silk_suit.jpg" alt="Ivory Structured Silk Blouse Set">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#fb7185;">TAILORED SUITING</div>
            <div class="prod-card-title">Ivory Silk Suit</div>
            <div class="prod-card-spec">26mm Silk Twill &amp; Wool</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-2" onclick="focusProduct(2)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/vantelle-showcase/products/midnight_noir_leather.jpg" alt="Midnight Noir Leather Ensemble">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#fb7185;">HAUTE LEATHER</div>
            <div class="prod-card-title">Midnight Noir Suit</div>
            <div class="prod-card-spec">Italian Lambskin Nappa</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-3" onclick="focusProduct(3)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/vantelle-showcase/products/vantelle_satchel.jpg" alt="Vantelle Signature Paris Satchel">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#fb7185;">LEATHER GOODS</div>
            <div class="prod-card-title">Paris Satchel Bag</div>
            <div class="prod-card-spec">Box Calfskin · 24k Gold</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>
      </div>
`;

fashionHtml = fashionHtml.replace(/<div id="product-cards-tray">.*?<\/div>\s*<\/section>/s, `${newTrayDOM.trim()}\n    </section>`);

// Update sidebar initial static view
fashionHtml = fashionHtml
  .replace(/<div class="panel-head" style="margin-bottom:0;">.*?<\/div>/s, '<div class="panel-head" style="margin-bottom:0;">SS25 RUNWAY FEATURED ITEM</div>')
  .replace(/<span id="side-spec-title">.*?<\/span>/s, '<span id="side-spec-title">Scarlet Cashmere Wrap Set</span>')
  .replace(/<div class="spec-desc" id="side-spec-desc">.*?<\/div>/s, '<div class="spec-desc" id="side-spec-desc">Vibrant scarlet red hooded cashmere cardigan paired with high-waisted pleated ivory culottes.</div>')
  .replace(/<div class="spec-list" id="side-spec-list">.*?<\/div>/s, `
    <div class="spec-list" id="side-spec-list">
      <div class="spec-item"><div class="spec-k">MATERIAL</div><div class="spec-v">Cashmere &amp; Silk</div></div>
      <div class="spec-item"><div class="spec-k">SEASON</div><div class="spec-v">SS25 Paris Runway</div></div>
      <div class="spec-item"><div class="spec-k">ORIGIN</div><div class="spec-v">Atelier Paris</div></div>
      <div class="spec-item"><div class="spec-k">WHOLESALE</div><div class="spec-v">8 Sets MOQ</div></div>
    </div>
  `)
  .replace(/📝 Request 1:1 Technical & RFQ Quote/g, '📝 Request Wholesale Quote')
  .replace(/📝 Request Wholesale Pricing/g, '📝 Request Wholesale Quote')
  .replace(/photoSphere\.rotation\.y = -0\.45;/g, 'photoSphere.rotation.y = -0.92;')
  .replace(/Engine: <strong>Three.js WebGL 64K Master<\/strong>/g, 'Engine: <strong>Three.js WebGL Photo Immersive</strong>')
  .replace(/01\. Main Booth Center/g, '01. Vantelle Paris Central Pavilion');

// Save demo-fashion.html
fs.writeFileSync(path.join(__dirname, 'app_build', 'client', 'demo-fashion.html'), fashionHtml, 'utf8');
console.log('Successfully generated calibrated demo-fashion.html!');
