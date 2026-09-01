const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

async function run() {
  console.log('=== PHASE 10.7S REAL PRODUCT & VIEWPOINT VERIFICATION ===\n');

  // 1. Studio Berry Account in DB
  const berryAccount = db.mutate(d => (d.accounts || []).find(a => a.emailNormalized === 'studioberryinfo@gmail.com'));
  assert(berryAccount, 'Studio Berry account must exist');
  assert.strictEqual(berryAccount.isPilot, true, 'isPilot must be true');
  assert.strictEqual(berryAccount.entitlement, 'BUSINESS', 'entitlement must be BUSINESS');
  assert.strictEqual(berryAccount.billingState, 'PILOT_NOT_BILLED', 'billingState must be PILOT_NOT_BILLED');
  console.log('✅ [1/5] Studio Berry account verified:', berryAccount.email, berryAccount.entitlement, berryAccount.billingState);

  // 2. Studio Berry Project in DB
  const berryProj = db.mutate(d => (d.projects || []).find(p => p.id === 'prj-free-e99137ed'));
  assert(berryProj, 'Project prj-free-e99137ed must exist');
  assert.strictEqual(berryProj.businessName, 'studio berry');
  const realProducts = (berryProj.products || []).filter(p => p.name && p.name.trim() && !p.name.startsWith('Product Slot'));
  assert.strictEqual(realProducts.length, 0, 'Real product count must be 0 initially');
  assert.strictEqual((berryProj.viewpoints || []).length, 0, 'Viewpoints count must be 0 initially');
  console.log('✅ [2/5] Studio Berry project verified with 0 real products & 0 viewpoints.');

  // 3. Viewpoints DB mutation test
  const vp = {
    viewpointId: 'vp-test-' + Date.now(),
    name: 'Cosmetics Counter Left',
    centerU: 0.28,
    centerV: 0.55,
    zoom: 1.2,
    yaw: -1.25,
    pitch: 0.1,
    isDefault: true
  };
  db.mutate(d => {
    const p = d.projects.find(proj => proj.id === 'prj-free-e99137ed');
    p.viewpoints = p.viewpoints || [];
    p.viewpoints.push(vp);
  });
  const projWithVp = db.mutate(d => d.projects.find(proj => proj.id === 'prj-free-e99137ed'));
  assert.strictEqual(projWithVp.viewpoints.length, 1);
  db.mutate(d => {
    const p = d.projects.find(proj => proj.id === 'prj-free-e99137ed');
    p.viewpoints = [];
  });
  const projClearedVp = db.mutate(d => d.projects.find(proj => proj.id === 'prj-free-e99137ed'));
  assert.strictEqual(projClearedVp.viewpoints.length, 0);
  console.log('✅ [3/5] Viewpoints DB structure & mutations operational.');

  // 4. Products DB mutation & slot clearing test
  const prod = {
    slotIndex: 1,
    name: 'Berry Tint Serum Pro',
    category: 'Cosmetics',
    sku: 'BTS-001',
    price: '$24.00',
    shortDescription: 'Hydrating formula',
    description: 'Long-lasting tint'
  };
  db.mutate(d => {
    const p = d.projects.find(proj => proj.id === 'prj-free-e99137ed');
    p.products = p.products || [];
    p.products.push(prod);
  });
  const projWithProd = db.mutate(d => d.projects.find(proj => proj.id === 'prj-free-e99137ed'));
  assert.strictEqual(projWithProd.products.length, 1);
  db.mutate(d => {
    const p = d.projects.find(proj => proj.id === 'prj-free-e99137ed');
    p.products = [];
  });
  const projClearedProd = db.mutate(d => d.projects.find(proj => proj.id === 'prj-free-e99137ed'));
  assert.strictEqual(projClearedProd.products.length, 0);
  console.log('✅ [4/5] Products DB structure & slot clearing operational.');

  // 5. client/index.html UI Modals & Handlers
  const html = fs.readFileSync(path.join(__dirname, '../client/index.html'), 'utf8');
  assert(html.includes('id="ownerStudioToolbar"'), '#ownerStudioToolbar missing');
  assert(html.includes('id="ownerProductCountBadge"'), '#ownerProductCountBadge missing');
  assert(html.includes('id="ownerProductEditorModal"'), '#ownerProductEditorModal missing');
  assert(html.includes('id="publicProductDetailModal"'), '#publicProductDetailModal missing');
  assert(html.includes('id="radarOwnerControls"'), '#radarOwnerControls missing');
  assert(html.includes('id="viewpointManagerModal"'), '#viewpointManagerModal missing');
  assert(html.includes('function openOwnerProductEditor'), 'openOwnerProductEditor missing');
  assert(html.includes('function saveOwnerProduct'), 'saveOwnerProduct missing');
  assert(html.includes('function deleteOwnerProduct'), 'deleteOwnerProduct missing');
  assert(html.includes('function openPublicProductDetail'), 'openPublicProductDetail missing');
  assert(html.includes('function togglePreviewMode'), 'togglePreviewMode missing');
  assert(html.includes('function handleCaptureCurrentViewpoint'), 'handleCaptureCurrentViewpoint missing');
  assert(html.includes('function openViewpointManager'), 'openViewpointManager missing');
  console.log('✅ [5/5] UI Modals, toolbars, and event handlers verified in index.html.');

  console.log('\n=============================================');
  console.log('🎉 ALL PHASE 10.7S VERIFICATION CHECKS PASSED!');
  console.log('=============================================');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
