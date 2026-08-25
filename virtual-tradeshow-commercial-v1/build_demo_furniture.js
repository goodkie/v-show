const fs = require('fs');
const path = require('path');

const baseHtml = fs.readFileSync(path.join(__dirname, 'app_build', 'client', 'demo-fashion.html'), 'utf8');

let furnitureHtml = baseHtml
  .replace(/<title>.*?<\/title>/, '<title>NOVA LIVING | Scandinavian Designer Furniture Showroom — Master Demo</title>')
  .replace(/VANTÉLLE<\/span>\s*<span[^>]*>PARIS/g, 'NOVA</span>\n        <span style="font-size: 11px; letter-spacing: 2.5px; color: #d97706; font-weight: 700; margin-left: 4px;">LIVING')
  .replace(/SPRING \/ SUMMER 2025 SHOWROOM/g, 'TIMELESS DESIGN · INSPIRED LIVING')
  .replace(/--cyan: #e11d48;/g, '--cyan: #f59e0b;')
  .replace(/--cyan-glow: rgba\(225, 29, 72, 0.55\);/g, '--cyan-glow: rgba(245, 158, 11, 0.55);')
  .replace(/--panel-border: rgba\(225, 29, 72, 0.35\);/g, '--panel-border: rgba(245, 158, 11, 0.35);')
  .replace(/DOWNLOAD LOOKBOOK/g, 'DOWNLOAD CATALOG')
  .replace(/REQUEST WHOLESALE/g, 'REQUEST TRADE / WHOLESALE')
  .replace(/01\. Vantelle Paris Central Pavilion/g, '01. Nova Living Designer Pavilion');

// Update SPATIAL_NODES
const spatialNodes = `
const SPATIAL_NODES = [
  {
    id: 0,
    name: "01. Nova Living Designer Pavilion",
    preview: "/assets/demo/furniture-showcase/pano360/node0_preview.jpg",
    image8k: "/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg",
    image16k: "/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg",
    puckPos: new THREE.Vector3(0, -160, -320),
    radarPos: { x: 153, y: 72 }
  }
];
`;

furnitureHtml = furnitureHtml.replace(/const SPATIAL_NODES = \[.*?\];/s, spatialNodes.trim());

// Update PRODUCTS_DATA with 4 luxury furniture items & calibrated 3D coordinates
const productsData = `
const PRODUCTS_DATA = [
  {
    id: 'PROD-01-LINEN-SOFA',
    name: 'Nordic Organic Linen 3-Seater Sofa',
    model: 'NL-LIV-SF03',
    category: 'Living Room Suite',
    image: '/assets/demo/furniture-showcase/products/linen_sofa.jpg',
    worldPos: new THREE.Vector3(-220, -50, -320),
    nodeIdx: 0,
    desc: 'Contemporary minimalist 3-seater sofa upholstered in Belgian organic linen with solid oak tapered legs and high-resilience feather-down blend cushions.',
    specs: [
      ['Frame & Legs', 'FSC-Certified Solid Kiln-Dried European Oak'],
      ['Upholstery Material', '100% Belgian Organic Linen (450g/m²)'],
      ['Cushion Core', 'High-Density Bio-Foam + Goose Feather Layer'],
      ['Dimensions', '220cm (W) x 92cm (D) x 82cm (H)'],
      ['Abrasion Resistance', 'Martindale 45,000 Rubs · Stain-Shield'],
      ['Wholesale / Trade MOQ', '4 Units / Hospitality Grade Finish']
    ],
    highlights: [
      'Removable and washable slipcovers with concealed YKK invisible zippers',
      'Ergonomically angled backrest engineered for long-duration residential and lounge comfort',
      'Available in Sand Beige, Charcoal, Forest Green, and Warm Oat'
    ],
    robotType: 'cobot'
  },
  {
    id: 'PROD-02-WALNUT-CHAIR',
    name: 'Artisan Walnut Lounge Armchair',
    model: 'NL-LIV-AC01',
    category: 'Accent Seating',
    image: '/assets/demo/furniture-showcase/products/lounge_chair.jpg',
    worldPos: new THREE.Vector3(-105, -60, -340),
    nodeIdx: 0,
    desc: 'Mid-century modern accent lounge chair handcrafted from American black walnut with top-grain saddle leather tufted backrest and brass nailhead trim.',
    specs: [
      ['Wood Structure', 'Solid American Black Walnut · Oil Wax Finish'],
      ['Leather Grade', 'Full-Grain Pull-Up Aniline Cowhide (1.4mm)'],
      ['Joinery Technique', 'Traditional Mortise & Tenon Wood Joinery'],
      ['Dimensions', '78cm (W) x 85cm (D) x 76cm (H)'],
      ['Weight Capacity', 'Tested to 200kg BIFMA Standards'],
      ['Wholesale MOQ', '6 Pieces / Assorted Finishes']
    ],
    highlights: [
      'Sculpted organic armrests hand-sanded to a silky matte tactile finish',
      'Leather ages into a rich vintage patina with enhanced character over decades',
      'Flat-pack modular assembly option available for efficient international export container shipping'
    ],
    robotType: 'amr'
  },
  {
    id: 'PROD-03-DINING-TABLE',
    name: 'Stockholm Solid Oak Dining Table Set',
    model: 'NL-DIN-TB08',
    category: 'Dining Pavilion',
    image: '/assets/demo/furniture-showcase/products/dining_table.jpg',
    worldPos: new THREE.Vector3(-15, -45, -350),
    nodeIdx: 0,
    desc: 'Expansive 8-seater dining table with curved organic corners, matching ergonomic upholstered dining chairs, and matte black steel cantilever trestle base.',
    specs: [
      ['Tabletop Timber', 'Solid White Oak Edge-Glued Planks (38mm)'],
      ['Base Structure', 'Powder-Coated Matte Carbon Steel Trestle'],
      ['Seating Capacity', '6 to 8 Persons Comfortably'],
      ['Table Dimensions', '240cm (L) x 100cm (W) x 75cm (H)'],
      ['Surface Treatment', 'UV-Cured Ceramic Clear Hardcoat (Scratch/Heat Proof)'],
      ['Wholesale MOQ', '2 Sets (Table + 6/8 Chairs Package)']
    ],
    highlights: [
      'Commercial grade surface coat withstands up to 120°C hot tableware and liquid spills',
      'Matching chairs feature curved oak backrests with high-density stain-resistant boucle upholstery',
      'Includes leveling floor glides for perfect stability on hardwood and marble flooring'
    ],
    robotType: 'delta'
  },
  {
    id: 'PROD-04-LEATHER-SOFA',
    name: 'Espresso Top-Grain Leather Sectional',
    model: 'NL-LIV-LS04',
    category: 'Executive Lounge',
    image: '/assets/demo/furniture-showcase/products/leather_sofa.jpg',
    worldPos: new THREE.Vector3(260, -45, -310),
    nodeIdx: 0,
    desc: 'Deep-seat luxury modular sofa in rich espresso Italian top-grain leather with matching walnut coffee table and storage ottoman bench.',
    specs: [
      ['Leather Spec', 'Italian Semi-Aniline Top-Grain Leather'],
      ['Internal Framing', 'Corner-Blocked Heavy Duty Hardwood Frame'],
      ['Suspension System', '8-Way Hand-Tied Coil Spring Suspension'],
      ['Suite Dimensions', '280cm (W) x 105cm (D) x 80cm (H)'],
      ['Ottoman Size', '90cm x 60cm with Hidden Storage Space'],
      ['Wholesale MOQ', '3 Suites / Project Custom Spec']
    ],
    highlights: [
      'Supple hand-finished leather with water-repellent protective microporous coating',
      'Includes dual matching kidney bolster pillows and solid walnut coffee table companion',
      'Exceeds CAL 117 flammability safety and ISO 9001 environmental production standards'
    ],
    robotType: 'scara'
  }
];
`;

furnitureHtml = furnitureHtml.replace(/const PRODUCTS_DATA = \[.*?\];/s, productsData.trim());

// Update Bottom Product Cards Tray HTML in DOM
const newTrayDOM = `
      <div id="product-cards-tray">
        <div class="prod-quick-card active" id="pcard-0" onclick="focusProduct(0)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/furniture-showcase/products/linen_sofa.jpg" alt="Nordic Organic Linen Sofa">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">LIVING ROOM SUITE</div>
            <div class="prod-card-title">Nordic Linen 3-Seater</div>
            <div class="prod-card-spec">Belgian Linen &amp; Solid Oak</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-1" onclick="focusProduct(1)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/furniture-showcase/products/lounge_chair.jpg" alt="Artisan Walnut Lounge Chair">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">ACCENT SEATING</div>
            <div class="prod-card-title">Walnut Lounge Chair</div>
            <div class="prod-card-spec">American Walnut &amp; Leather</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-2" onclick="focusProduct(2)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/furniture-showcase/products/dining_table.jpg" alt="Stockholm Solid Oak Dining Table">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">DINING PAVILION</div>
            <div class="prod-card-title">Stockholm Dining Set</div>
            <div class="prod-card-spec">Solid Oak &amp; Carbon Steel</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>

        <div class="prod-quick-card" id="pcard-3" onclick="focusProduct(3)">
          <div class="prod-card-thumb">
            <img src="/assets/demo/furniture-showcase/products/leather_sofa.jpg" alt="Espresso Leather Sectional">
          </div>
          <div class="prod-card-body">
            <div class="prod-card-cat" style="color:#ffffff;">EXECUTIVE LOUNGE</div>
            <div class="prod-card-title">Espresso Leather Sofa</div>
            <div class="prod-card-spec">Italian Semi-Aniline Leather</div>
            <div class="prod-card-btn">Inspect Specs <span>→</span></div>
          </div>
        </div>
      </div>
`;

furnitureHtml = furnitureHtml.replace(/<div id="product-cards-tray">.*?<\/div>\s*<\/section>/s, `${newTrayDOM.trim()}\n    </section>`);

// Update sidebar initial static view
furnitureHtml = furnitureHtml
  .replace(/<div class="panel-head" style="margin-bottom:0;">.*?<\/div>/s, '<div class="panel-head" style="margin-bottom:0;">FEATURED DESIGNER PIECE</div>')
  .replace(/<span id="side-spec-title">.*?<\/span>/s, '<span id="side-spec-title">Nordic Organic Linen 3-Seater</span>')
  .replace(/<div class="spec-desc" id="side-spec-desc">.*?<\/div>/s, '<div class="spec-desc" id="side-spec-desc">Contemporary minimalist 3-seater sofa upholstered in Belgian organic linen with solid oak tapered legs.</div>')
  .replace(/<div class="spec-list" id="side-spec-list">.*?<\/div>/s, `
    <div class="spec-list" id="side-spec-list">
      <div class="spec-item"><div class="spec-k">TIMBER</div><div class="spec-v">FSC Solid Oak</div></div>
      <div class="spec-item"><div class="spec-k">FABRIC</div><div class="spec-v">Belgian Linen 450g</div></div>
      <div class="spec-item"><div class="spec-k">STANDARD</div><div class="spec-v">BIFMA Commercial</div></div>
      <div class="spec-item"><div class="spec-k">TRADE MOQ</div><div class="spec-v">4 Units / Custom</div></div>
    </div>
  `)
  .replace(/📝 Request Wholesale Quote/g, '📝 Request Trade / Wholesale Quote')
  .replace(/photoSphere\.rotation\.y = -0\.92;/g, 'photoSphere.rotation.y = -1.57;');

// Save demo-furniture.html
fs.writeFileSync(path.join(__dirname, 'app_build', 'client', 'demo-furniture.html'), furnitureHtml, 'utf8');
console.log('Successfully generated demo-furniture.html!');
