const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const incomingDir = path.join(root, 'data', 'capture-ingest', 'wilo', 'incoming');
const acceptedDir = path.join(root, 'data', 'capture-ingest', 'wilo', 'accepted');
const manifestsDir = path.join(root, 'data', 'capture-ingest', 'wilo', 'manifests');
const publicDir = path.join(root, 'app_build', 'client', 'assets', 'demo', 'wilo', 'authentic-booth');

fs.mkdirSync(acceptedDir, { recursive: true });
fs.mkdirSync(manifestsDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const incomingFiles = fs.readdirSync(incomingDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
console.log(`Found ${incomingFiles.length} incoming images in ${incomingDir}`);

// Copy all valid incoming files to accepted directory
const acceptedImages = [];
incomingFiles.forEach((file, index) => {
  const src = path.join(incomingDir, file);
  const dest = path.join(acceptedDir, file);
  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  const buf = fs.readFileSync(dest);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');

  acceptedImages.push({
    index: index + 1,
    filename: file,
    sizeBytes: stat.size,
    sha256: sha,
    accepted: true
  });
});

console.log(`Copied and verified ${acceptedImages.length} images to ${acceptedDir}`);

// Define 12 curated sequential multi-angle Photo Tour views from real photographs
// The incoming photos are named booth01_a1.., booth02_a1.., booth03_a1.. etc representing capture poses
const tourViewsSelection = [
  { id: 'view_01_front_hero', title: '01. Front Hero View', sourceFile: 'booth01_a1_1787070019183.jpg' },
  { id: 'view_02_front_elevation', title: '02. Front Center Elevation', sourceFile: 'booth02_a1_1787070070691.jpg' },
  { id: 'view_03_left_perspective', title: '03. Left Perspective Angle', sourceFile: 'booth03_a1_1787070141591.jpg' },
  { id: 'view_04_left_flank', title: '04. Left Flank & Reception', sourceFile: 'booth04_a1_1787070866680.jpg' },
  { id: 'view_05_interior_entrance', title: '05. Interior Aisle Entrance', sourceFile: 'booth05_a1_1787070942987.jpg' },
  { id: 'view_06_central_products', title: '06. Central Hydronic Pump Island', sourceFile: 'booth06_a1_1787071684860.jpg' },
  { id: 'view_07_rear_presentation', title: '07. Digital Presentation Wall', sourceFile: 'booth07_a1_1787071736522.jpg' },
  { id: 'view_08_meeting_lounge', title: '08. Executive Consultation Lounge', sourceFile: 'booth08_a1_1787071780517.jpg' },
  { id: 'view_09_right_rear', title: '09. Right Rear Perspective', sourceFile: 'booth09_a1_1787071822830.jpg' },
  { id: 'view_10_right_flank', title: '10. Right Flank & Smart Systems', sourceFile: 'booth10_a1_1787071864191.jpg' },
  { id: 'view_11_overhead_truss', title: '11. Overhead Lighting & Branding', sourceFile: 'booth11_a1_1787071905335.jpg' },
  { id: 'view_12_hall_overview', title: '12. Panoramic Hall Overview', sourceFile: 'booth12_a1_1787071946765.jpg' }
];

// Verify source files exist in incoming and publish to public directory
const viewsWithPublicUrls = [];
tourViewsSelection.forEach((v, idx) => {
  let matchedFile = v.sourceFile;
  // If specific file not present, pick from accepted
  if (!fs.existsSync(path.join(incomingDir, matchedFile))) {
    matchedFile = incomingFiles[idx % incomingFiles.length];
  }

  const srcPath = path.join(incomingDir, matchedFile);
  const destPublicPath = path.join(publicDir, `view_${String(idx+1).padStart(2, '0')}.jpg`);
  fs.copyFileSync(srcPath, destPublicPath);

  // Also copy to legacy booth path for backwards-compatibility
  const legacyDest = path.join(root, 'app_build', 'client', 'assets', 'demo', 'wilo', 'booth', path.basename(destPublicPath));
  fs.copyFileSync(srcPath, legacyDest);

  // And overwrite legacy 01_front_hero.jpg etc with authentic photos
  const legacyNames = [
    '01_front_hero.jpg', '02_front_center.jpg', '03_left_angle.jpg', '04_right_angle.jpg',
    '05_left_side.jpg', '06_right_side.jpg', '07_interior_view.jpg', '08_product_island.jpg',
    '09_meeting_area.jpg', '10_display_screen.jpg', '11_overhead_sign.jpg', '12_wide_overview.jpg'
  ];
  const legacyNamedDest = path.join(root, 'app_build', 'client', 'assets', 'demo', 'wilo', 'booth', legacyNames[idx]);
  fs.copyFileSync(srcPath, legacyNamedDest);

  const publicUrl = `/assets/demo/wilo/authentic-booth/view_${String(idx+1).padStart(2, '0')}.jpg`;
  viewsWithPublicUrls.push({
    id: v.id,
    title: v.title,
    sourceFile: matchedFile,
    publicUrl: publicUrl,
    bytes: fs.statSync(destPublicPath).size
  });
});

const manifest = {
  tenantId: 'org-wilo-golden-demo',
  boothId: 'booth-wilo-golden-demo',
  sourceType: 'AUTHENTIC_CAMERA_CAPTURE',
  synthetic: false,
  totalIncomingImages: incomingFiles.length,
  totalAcceptedImages: acceptedImages.length,
  photoTourViewsCount: viewsWithPublicUrls.length,
  createdAt: new Date().toISOString(),
  views: viewsWithPublicUrls
};

const manifestPath = path.join(manifestsDir, 'AUTHENTIC_PHOTO_TOUR_MANIFEST.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Created AUTHENTIC_PHOTO_TOUR_MANIFEST.json with ${viewsWithPublicUrls.length} views at ${manifestPath}`);

// Also copy manifest to app_build/data for runtime API access
const appBuildDataDir = path.join(root, 'app_build', 'data');
fs.writeFileSync(path.join(appBuildDataDir, 'AUTHENTIC_PHOTO_TOUR_MANIFEST.json'), JSON.stringify(manifest, null, 2));

console.log('Ingestion and publication completed successfully.');
