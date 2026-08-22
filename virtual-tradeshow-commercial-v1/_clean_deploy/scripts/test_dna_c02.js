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

async function runTests() {
  console.log('=== STARTING dn’a-C02 MANAGED PRODUCTION OPERATIONS VERIFICATION ===\n');

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

  // 1. Static Operations Surfaces
  console.log('--- 1. Operations Surfaces ---');
  await assert('Production Command Center GET /production.html returns 200', async () => {
    const res = await get('/production.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('OPERATIONS COMMAND CENTER')) throw new Error('Command Center branding missing');
  });

  await assert('Project Workspace GET /project-detail.html returns 200', async () => {
    const res = await get('/project-detail.html?id=proj-hpmkt-haven-01');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('Project Workspace')) throw new Error('Workspace title missing');
  });

  await assert('Client Portal GET /client-portal.html returns 200', async () => {
    const res = await get('/client-portal.html?id=proj-hpmkt-haven-01');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('Exhibitor Production Portal')) throw new Error('Portal title missing');
  });

  // 2. Controlled Test Projects (Step 38)
  console.log('\n--- 2. Controlled Test Projects (A, B, C) ---');
  await assert('Project A (Haven & Oak @ High Point) is PUBLISHED with complete QA & Assets', async () => {
    const res = await get('/api/production-projects/proj-hpmkt-haven-01');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const p = JSON.parse(res.body);
    if (p.company !== 'Haven & Oak Furniture Co.') throw new Error('Company mismatch');
    if (p.status !== 'PUBLISHED') throw new Error(`Expected PUBLISHED, got ${p.status}`);
    if (p.qaChecklist.status !== 'QA_PASS') throw new Error('QA_PASS missing');
    if (!p.publishRecord || !p.publishRecord.publicUrl) throw new Error('Publish record missing');
  });

  await assert('Project B (Maison Nova @ COTERIE) is in CLIENT_REVIEW with v2 revision tracking', async () => {
    const res = await get('/api/production-projects/proj-coterie-nova-02');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const p = JSON.parse(res.body);
    if (p.company !== 'Maison Nova Haute Apparel') throw new Error('Company mismatch');
    if (p.status !== 'CLIENT_REVIEW') throw new Error(`Expected CLIENT_REVIEW, got ${p.status}`);
    if (!p.revisions || p.revisions.length < 2) throw new Error('Revisions v1/v2 missing');
  });

  await assert('Project C (Lumina Craft @ ASD) is SHOW_LIVE with live telemetry and post-show report', async () => {
    const res = await get('/api/production-projects/proj-asd-lumina-03');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const p = JSON.parse(res.body);
    if (p.company !== 'Lumina Craft & Giftworks') throw new Error('Company mismatch');
    if (p.status !== 'SHOW_LIVE') throw new Error(`Expected SHOW_LIVE, got ${p.status}`);
    if (p.priority !== 'SHOW_STARTED') throw new Error('SHOW_STARTED priority missing');
    if (!p.postShowReport || p.postShowReport.leadsCaptured < 1) throw new Error('Post-show report missing');
  });

  // 3. Sales -> Production Handoff & Qualification
  console.log('\n--- 3. Sales to Production Handoff ---');
  let qualifiedProjId = null;
  await assert('POST /api/production-requests -> Qualify Request converts to Production Project', async () => {
    // 1. Submit Request
    const reqRes = await post('/api/production-requests', {
      companyName: 'Apex Intralogistics Solutions',
      contactName: 'Robert Langdon',
      email: 'robert@apex-intra.example',
      tradeShow: 'MODEX Atlanta 2026',
      showDate: '2026-11-10',
      city: 'Atlanta, GA',
      boothNumber: 'Booth B-9400',
      industry: 'Logistics & Material Handling',
      productCount: 8,
      services: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE']
    });
    if (reqRes.status !== 201) throw new Error(`Request submission failed ${reqRes.status}`);
    const reqId = reqRes.body.request.id;

    // 2. Qualify and Convert to Project
    const qualRes = await post('/api/production-projects/qualify-request', {
      requestId: reqId,
      actor: 'Marcus Vance (QA Director)'
    });
    if (qualRes.status !== 201) throw new Error(`Qualification failed ${qualRes.status}`);
    if (qualRes.body.project.status !== 'ASSET_INTAKE') throw new Error(`Expected ASSET_INTAKE status, got ${qualRes.body.project.status}`);
    if (qualRes.body.project.tasks.length < 4) throw new Error('Service-aware tasks not generated');
    qualifiedProjId = qualRes.body.project.id;
  });

  // 4. Asset Intake, Task Engine & QA Transitions
  console.log('\n--- 4. Asset Intake, Task & QA Lifecycle ---');
  await assert('PATCH /api/production-projects/:id/assets updates asset status', async () => {
    const res = await patch(`/api/production-projects/${qualifiedProjId}/assets`, {
      assetKey: 'LOGO',
      status: 'APPROVED',
      actor: 'Elena Rostova'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const logo = res.body.project.assets.find(a => a.key === 'LOGO');
    if (!logo || logo.status !== 'APPROVED') throw new Error('Asset status not updated');
  });

  await assert('PATCH /api/production-projects/:id/tasks advances task to DONE', async () => {
    const projRes = await get(`/api/production-projects/${qualifiedProjId}`);
    const p = JSON.parse(projRes.body);
    const taskId = p.tasks[0].id;

    const res = await patch(`/api/production-projects/${qualifiedProjId}/tasks`, {
      taskId: taskId,
      status: 'DONE',
      actor: 'Elena Rostova'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const t = res.body.project.tasks.find(x => x.id === taskId);
    if (!t || t.status !== 'DONE') throw new Error('Task not marked DONE');
  });

  await assert('POST /api/production-projects/:id/qa evaluates QA checklist', async () => {
    const res = await post(`/api/production-projects/${qualifiedProjId}/qa`, {
      status: 'QA_PASS',
      checks: { correctCompany: true, correctLogo: true, noBrokenImages: true, truthful3DState: true },
      actor: 'Marcus Vance'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.status !== 'CLIENT_REVIEW') throw new Error(`Expected CLIENT_REVIEW, got ${res.body.project.status}`);
  });

  // 5. Client Review, Approval & Publishing Gate
  console.log('\n--- 5. Client Approval & Live Publishing ---');
  await assert('POST /api/production-projects/:id/feedback records client approval', async () => {
    const res = await post(`/api/production-projects/${qualifiedProjId}/feedback`, {
      type: 'APPROVAL',
      deliverable: '3D Virtual Booth',
      comment: 'Approved for live exhibition!',
      clientName: 'Robert Langdon'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.status !== 'APPROVED') throw new Error(`Expected APPROVED status, got ${res.body.project.status}`);
  });

  await assert('POST /api/production-projects/:id/publish activates live deliverable', async () => {
    const res = await post(`/api/production-projects/${qualifiedProjId}/publish`, {
      publicUrl: `/demo.html?project=${qualifiedProjId}`,
      actor: 'Elena Rostova'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (res.body.project.status !== 'PUBLISHED') throw new Error(`Expected PUBLISHED status, got ${res.body.project.status}`);
    if (!res.body.project.publishRecord || !res.body.project.publishRecord.publicUrl) throw new Error('Publish record missing');
  });

  // 6. Strict Note Isolation (Step 26)
  console.log('\n--- 6. Strict Note Isolation (INTERNAL_NOTE_LEAK = 0) ---');
  await assert('Operator internal notes are NEVER leaked to the Client Portal', async () => {
    // Add internal note
    await post(`/api/production-projects/${qualifiedProjId}/notes`, {
      noteText: 'INTERNAL SECRET: Client requested expedited delivery for show opening.',
      isClientVisible: false,
      author: 'Marcus Vance'
    });
    // Add client-visible note
    await post(`/api/production-projects/${qualifiedProjId}/notes`, {
      noteText: 'Your showroom has been published live for MODEX 2026!',
      isClientVisible: true,
      author: 'dn’a Production Team'
    });

    // Check operator view
    const opRes = await get(`/api/production-projects/${qualifiedProjId}`);
    const opProj = JSON.parse(opRes.body);
    if (!opProj.internalNotes || opProj.internalNotes.length === 0) throw new Error('Internal note missing in operator view');

    // Check client portal safe view
    const clientRes = await get(`/api/client-portal/${qualifiedProjId}`);
    const clientProj = JSON.parse(clientRes.body);
    if (clientProj.internalNotes !== undefined) throw new Error('LEAK DETECTED: internalNotes exposed in client view!');
    if (!clientProj.clientVisibleNotes || clientProj.clientVisibleNotes.length === 0) throw new Error('Client visible notes missing in portal');
  });

  // 7. Multi-Show / Next Edition Duplication (Step 23, 24, 25)
  console.log('\n--- 7. Next Show Duplication & Customer Memory ---');
  await assert('POST /api/production-projects/:id/duplicate-next-show reuses exhibitor memory for new show', async () => {
    const res = await post(`/api/production-projects/${qualifiedProjId}/duplicate-next-show`, {
      newShowData: {
        tradeShow: 'ProMat Chicago 2027',
        showStartDate: '2027-03-20',
        city: 'Chicago, IL',
        venue: 'McCormick Place',
        boothNumber: 'North Hall — Stand N-1200'
      },
      actor: 'Operations'
    });
    if (res.status !== 201) throw new Error(`Duplication failed ${res.status}`);
    const dup = res.body.project;
    if (dup.company !== 'Apex Intralogistics Solutions') throw new Error('Company memory lost');
    if (dup.tradeShow !== 'ProMat Chicago 2027') throw new Error('New trade show not set');
    if (dup.id === qualifiedProjId) throw new Error('Duplicated project must have distinct ID');
    if (dup.status !== 'READY_FOR_PRODUCTION') throw new Error('Duplicated project should be READY_FOR_PRODUCTION');
  });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
