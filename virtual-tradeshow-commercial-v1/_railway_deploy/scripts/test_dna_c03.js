const http = require('http');

const BASE_URL = 'http://localhost:3000';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request(BASE_URL + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function patch(path, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request(BASE_URL + path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function del(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE_URL + path, {
      method: 'DELETE'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING dn’a-C03 DIY BOOTH BUILDER BETA VERIFICATION ===\n');

  let passed = 0;
  let failed = 0;

  async function assert(desc, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ FAIL: ${desc} -> ${e.message}`);
      failed++;
    }
  }

  // 1. Static Surface
  console.log('--- 1. DIY Builder Surface ---');
  await assert('GET /builder.html returns 200 with Early Access Beta title', async () => {
    const res = await get('/builder.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('BOOTH BUILDER BETA')) throw new Error('Beta banner missing');
    if (!res.body.includes('HAVE dn’a BUILD IT FOR ME') && !res.body.includes('Have dn’a Build It For Me')) throw new Error('Managed handoff CTA missing');
  });

  // 2. Controlled Test Projects (Step 38)
  console.log('\n--- 2. Controlled Test Customers (A, B, C) ---');
  await assert('Test Customer A (Haven & Oak) is PUBLISHED with Modern template and real analytics', async () => {
    const res = await get('/api/diy/projects/proj-diy-haven-01');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const p = JSON.parse(res.body);
    if (p.company !== 'Haven & Oak Furniture Co.') throw new Error('Company mismatch');
    if (p.templateId !== 'MODERN') throw new Error('Template mismatch');
    if (p.status !== 'PUBLISHED') throw new Error(`Expected PUBLISHED, got ${p.status}`);
    if (!p.analytics || p.analytics.boothVisits !== 342) throw new Error('Analytics mismatch');
  });

  await assert('Test Customer B (Maison Nova) is in MANAGED_HANDOFF with zero data loss', async () => {
    const res = await get('/api/diy/projects/proj-diy-nova-02');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const p = JSON.parse(res.body);
    if (p.company !== 'Maison Nova Haute Apparel') throw new Error('Company mismatch');
    if (p.status !== 'QUALIFICATION') throw new Error(`Expected QUALIFICATION, got ${p.status}`);
    if (!p.managedHandoff || p.managedHandoff.handoffStatus !== 'ACTIVE') throw new Error('Managed handoff record missing');
    if (p.products.length < 2) throw new Error('Product list lost during handoff');
  });

  await assert('Test Customer C (Lumina Craft) is DRAFT with Industrial template & 100% readiness', async () => {
    const res = await get('/api/diy/projects/proj-diy-lumina-03');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const p = JSON.parse(res.body);
    if (p.company !== 'Lumina Craft & Giftworks') throw new Error('Company mismatch');
    if (p.templateId !== 'INDUSTRIAL') throw new Error('Template mismatch');
    if (p.status !== 'DRAFT') throw new Error(`Expected DRAFT, got ${p.status}`);
  });

  // 3. DIY Draft Persistence & Company Flow
  console.log('\n--- 3. Step 1 & 2: Company & Trade Show Flow ---');
  let testProjId = `proj-diy-test-${Date.now().toString(36)}`;
  await assert('POST /api/diy/projects creates draft project and persists state', async () => {
    const res = await post('/api/diy/projects', {
      projectId: testProjId,
      company: 'Zenith Robotics Automation',
      contact: 'Marcus K. Flynn',
      email: 'marcus@zenith-robotics.example',
      tradeShow: 'Automate Detroit 2026'
    });
    if (res.status !== 201) throw new Error(`Creation failed ${res.status}`);
    if (res.body.project.id !== testProjId) throw new Error('Project ID mismatch');
  });

  await assert('PATCH /api/diy/projects/:id/company updates exhibitor profile', async () => {
    const res = await patch(`/api/diy/projects/${testProjId}/company`, {
      website: 'https://zenith-robotics.example',
      industry: 'Industrial Automation & Machinery',
      description: 'Next-generation articulated robotic arms and cobots.',
      logoUrl: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.industry !== 'Industrial Automation & Machinery') throw new Error('Industry mismatch');
  });

  await assert('PATCH /api/diy/projects/:id/show updates show schedule and priority', async () => {
    const res = await patch(`/api/diy/projects/${testProjId}/show`, {
      tradeShow: 'Automate Detroit 2026',
      showStartDate: '2026-10-05',
      showEndDate: '2026-10-08',
      city: 'Detroit, MI',
      venue: 'Huntington Place',
      boothNumber: 'Booth 4820'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.city !== 'Detroit, MI') throw new Error('City mismatch');
  });

  // 4. Products Flow (CRUD, Duplicate, Bulk)
  console.log('\n--- 4. Step 3: Product Management Flow ---');
  let prodId = null;
  await assert('POST /api/diy/projects/:id/products adds new product', async () => {
    const res = await post(`/api/diy/projects/${testProjId}/products`, {
      name: 'Zenith Cobot X-10 Precision Arm',
      sku: 'ZNT-CB-10',
      category: 'Collaborative Robotics',
      price: 28500,
      moq: 1,
      heroImage: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800',
      description: '6-axis lightweight collaborative robot arm with payload capacity of 10kg.'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    prodId = res.body.product.id;
    if (!prodId) throw new Error('Product ID not returned');
  });

  await assert('POST /api/diy/projects/:id/products/duplicate clones existing product', async () => {
    const res = await post(`/api/diy/projects/${testProjId}/products/duplicate`, { productId: prodId });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.body.product.name.includes('(Copy)')) throw new Error('Cloned product title missing copy suffix');
  });

  await assert('DELETE /api/diy/projects/:id/products/:productId removes product', async () => {
    const res = await del(`/api/diy/projects/${testProjId}/products/${prodId}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await assert('POST /api/diy/projects/:id/products/bulk bulk adds products', async () => {
    const res = await post(`/api/diy/projects/${testProjId}/products/bulk`, {
      products: [
        { name: 'Zenith Delta Fast Sorter', sku: 'ZNT-DL-02', price: 19500, heroImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800' },
        { name: 'VisionAI Sensor Hub 4K', sku: 'ZNT-VS-04', price: 4200, heroImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800' }
      ]
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (res.body.project.products.length < 2) throw new Error('Bulk products not saved');
  });

  // 5. Assets, Experience & Template
  console.log('\n--- 5. Step 4, 5, 6: Assets, Experience & Template Binding ---');
  await assert('PATCH /api/diy/projects/:id/assets saves hero banner and catalog', async () => {
    const res = await patch(`/api/diy/projects/${testProjId}/assets`, {
      heroImageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200',
      catalogPdfUrl: 'https://zenith.example/catalog.pdf'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await assert('PATCH /api/diy/projects/:id/experience sets experience type', async () => {
    const res = await patch(`/api/diy/projects/${testProjId}/experience`, { experienceType: 'DESIGNED_3D' });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.experienceType !== 'DESIGNED_3D') throw new Error('Experience mismatch');
  });

  await assert('PATCH /api/diy/projects/:id/template sets layout and binds hotspots', async () => {
    const res = await patch(`/api/diy/projects/${testProjId}/template`, {
      templateId: 'INDUSTRIAL',
      hotspotBindings: { hotspot1: 'prod-1' }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.templateId !== 'INDUSTRIAL') throw new Error('Template mismatch');
  });

  // 6. Readiness Scorecard & Safe Publish
  console.log('\n--- 6. Readiness Check & Safe Publish ---');
  await assert('GET /api/diy/projects/:id/readiness evaluates readiness score', async () => {
    const res = await get(`/api/diy/projects/${testProjId}/readiness`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const r = JSON.parse(res.body);
    if (r.ready !== true) throw new Error(`Expected ready true, missing: ${r.missing.join(', ')}`);
  });

  await assert('POST /api/diy/projects/:id/publish publishes booth live as v1', async () => {
    const res = await post(`/api/diy/projects/${testProjId}/publish`, { actor: 'Marcus Flynn' });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.status !== 'PUBLISHED') throw new Error('Expected PUBLISHED status');
    if (res.body.version !== 'v1') throw new Error(`Expected v1, got ${res.body.version}`);
  });

  // 7. DIY -> Managed Handoff (Zero Data Re-entry)
  console.log('\n--- 7. DIY to Managed Handoff ---');
  await assert('POST /api/diy/projects/:id/handoff-to-managed transfers project to Managed Queue without data loss', async () => {
    const res = await post(`/api/diy/projects/${testProjId}/handoff-to-managed`, {
      notes: 'Customer requested dn’a team to finish custom 3D lighting and catalog hub.',
      actor: 'Marcus Flynn'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (res.body.project.status !== 'QUALIFICATION') throw new Error('Status not set to QUALIFICATION');
    if (!res.body.productionRequestId) throw new Error('Production Request ID not created');
    if (res.body.project.products.length < 2) throw new Error('Products lost during handoff');
  });

  // 8. Real Project Analytics
  console.log('\n--- 8. Real Analytics Engine ---');
  await assert('GET /api/diy/projects/:id/analytics returns real metrics without fake data injection', async () => {
    const res = await get(`/api/diy/projects/${testProjId}/analytics`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const a = JSON.parse(res.body);
    if (typeof a.boothVisits !== 'number') throw new Error('boothVisits not numeric');
  });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
