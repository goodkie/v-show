const http = require('http');
const fs = require('fs');
const path = require('path');

// Set dedicated test port and load server in-process
const PORT = 3008;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';

const { server, app } = require('./server/index.js');
const BASE_URL = `http://127.0.0.1:${PORT}`;

function makeRequest(reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      if (typeof options.body === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(options.body));
      } else {
        req.write(options.body);
      }
    }
    req.end();
  });
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING IN-PROCESS PRODUCT & CATALOG SUITE');
  console.log('====================================================\n');

  // Wait a moment for server listening
  await delay(1000);

  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate with dev account goodkie.com@gmail.com
    console.log('🔹 1. Testing Internal Dev QA Authentication...');
    const otpReq = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'goodkie.com@gmail.com' }
    });
    assert(otpReq.status === 200 && otpReq.body.success, 'Send OTP for goodkie.com@gmail.com succeeds');

    const verifyReq = await makeRequest('/api/customer/auth/verify-otp', {
      method: 'POST',
      body: { email: 'goodkie.com@gmail.com', code: '123456' }
    });
    assert(verifyReq.status === 200 && verifyReq.body.token, 'Verify OTP succeeds and returns JWT token');
    const token = verifyReq.body.token;

    const meReq = await makeRequest('/api/customer/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    assert(meReq.status === 200 && meReq.body.account?.entitlement === 'INTERNAL_FULL_ACCESS', 'Account has INTERNAL_FULL_ACCESS entitlement');

    // 2. Fetch projects or create one
    console.log('\n🔹 2. Project & Product Verification...');
    const myBooths = await makeRequest('/api/customer/booths', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    assert(myBooths.status === 200 && Array.isArray(myBooths.body.booths), 'Customer booths list fetched');

    let projectId = myBooths.body.booths?.[0]?.id;
    if (!projectId) {
      const dbPath = path.join(__dirname, 'data', 'projects.json');
      if (fs.existsSync(dbPath)) {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        projectId = db.projects?.[0]?.id || db.projects?.[0]?.projectId;
      }
    }
    assert(!!projectId, `Active Project ID identified: ${projectId}`);

    // 3. Test Product Saving & Retrieval
    const prodRes = await makeRequest(`/api/projects/${projectId}/products`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: {
        slotIndex: 1,
        name: 'Automated QA Velvet Matte Lip Tint',
        category: 'COSMETICS',
        sku: 'LIP-QA-01',
        price: '$24.00',
        availability: 'ACTIVE',
        shortDescription: 'Long-lasting hydration lip tint',
        description: 'Detailed specs for wholesale export.'
      }
    });
    assert(prodRes.status === 200 && prodRes.body.success, 'Product created/updated in Slot 1');

    // 4. Test Catalog CRUD
    console.log('\n🔹 3. Catalog System CRUD Verification...');
    const catCreateRes = await makeRequest(`/api/projects/${projectId}/catalogs`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: {
        name: 'Spring Collection 2026',
        description: 'Curated spring beauty essentials and lip wear',
        productIds: ['prod-slot-1']
      }
    });
    assert(catCreateRes.status === 201 && catCreateRes.body.success, 'Catalog created successfully');
    const createdCat = catCreateRes.body.catalog;
    assert(createdCat && (createdCat.catalogId || createdCat.id), `Created Catalog ID: ${createdCat?.catalogId || createdCat?.id}`);
    const catId = createdCat.catalogId || createdCat.id;

    const catListRes = await makeRequest(`/api/projects/${projectId}/catalogs`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    assert(catListRes.status === 200 && Array.isArray(catListRes.body.catalogs), 'Fetched catalogs list');
    assert(catListRes.body.catalogs?.some(c => (c.catalogId || c.id) === catId), 'Created catalog present in project catalogs');

    // Update catalog membership
    const memRes = await makeRequest(`/api/projects/${projectId}/catalogs/${catId}/membership`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token },
      body: {
        productIds: ['prod-slot-1', 'prod-slot-2']
      }
    });
    assert(memRes.status === 200 && memRes.body.success, 'Catalog membership updated');
    assert(memRes.body.catalog?.productIds?.length === 2, 'Catalog now contains 2 products');

    // 5. Test 3D Pinpoints (Product Pin + Catalog Pin)
    console.log('\n🔹 4. 3D Pinpoints Architecture Verification...');
    const pinRes = await makeRequest(`/api/projects/${projectId}/pinpoints`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: {
        pinType: 'CATALOG_PIN',
        targetId: catId,
        catalogId: catId,
        label: 'Spring Collection 2026',
        u: 0.6500,
        v: 0.5200
      }
    });
    assert(pinRes.status === 201 && pinRes.body.success, 'Catalog Pin created in 3D scene');
    const pinId = pinRes.body.pinpoint?.id || pinRes.body.pinpoint?.pinId;

    // Get all pinpoints
    const pinsGet = await makeRequest(`/api/projects/${projectId}/pinpoints`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const pinList = pinsGet.body.pinpoints || pinsGet.body.pins || (Array.isArray(pinsGet.body) ? pinsGet.body : []);
    assert(pinsGet.status === 200 && Array.isArray(pinList), 'Fetched all project pinpoints');
    assert(pinList.some(p => p.pinType === 'CATALOG_PIN' || p.catalogId === catId || p.targetId === catId), 'Catalog pin verified in pinpoints list');

    // Delete pin
    if (pinId) {
      const pinDelRes = await makeRequest(`/api/projects/${projectId}/pins/${pinId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      assert(pinDelRes.status === 200 && pinDelRes.body.success, 'Pinpoint deleted cleanly');
    }

    // 6. Delete catalog and verify products remain intact
    console.log('\n🔹 5. Catalog Deletion Non-Destructive Check...');
    const catDelRes = await makeRequest(`/api/projects/${projectId}/catalogs/${catId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    assert(catDelRes.status === 200 && catDelRes.body.success, 'Catalog deleted cleanly');

    const projCheck = await makeRequest(`/api/projects/${projectId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const projData = projCheck.body.project || projCheck.body;
    assert(projCheck.status === 200, 'Project fetched after catalog delete');
    assert(Array.isArray(projData.products) && projData.products.length > 0, 'Underlying products remained intact');

    // 7. Verify Client HTML & CSS Markup
    console.log('\n🔹 6. Client Markup & Viewport-Safety Static Analysis...');
    const clientHtml = fs.readFileSync(path.join(__dirname, 'client', 'index.html'), 'utf8');
    assert(clientHtml.includes('id="ownerProductEditorModal"'), 'index.html has ownerProductEditorModal');
    assert(clientHtml.includes('id="catalogEditorModal"'), 'index.html has catalogEditorModal');
    assert(clientHtml.includes('id="catalogManagerModal"'), 'index.html has catalogManagerModal');
    assert(clientHtml.includes('id="catalogProductListModal"'), 'index.html has catalogProductListModal');
    assert(clientHtml.includes('id="publicProductDetailModal"'), 'index.html has publicProductDetailModal');
    assert(clientHtml.includes('id="btnOwnerToolbarCatalogs"'), 'index.html has [ 📚 Catalogs ] toolbar button');
    assert(clientHtml.includes('id="ownerInternalQABadge"'), 'index.html has INTERNAL QA badge');
    assert(clientHtml.includes('max-height: 90vh'), 'Modals contain viewport-safety max-height rules');
    assert(clientHtml.includes('modal-scroll-lock'), 'CSS has modal-scroll-lock body scroll lock');
    assert(clientHtml.includes('goodkie.com@gmail.com'), 'Client script includes internal QA dev bypass');

    console.log('\n====================================================');
    console.log(`📊 RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('💥 Test suite crashed:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
