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

async function runTests() {
  console.log('=== STARTING dn’a-C01 AUTOMATED VERIFICATION ===\n');

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

  // 1. Static Route Verification
  console.log('--- 1. Static Routes ---');
  await assert('Landing page GET / returns 200', async () => {
    const res = await get('/');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('dn’a')) throw new Error('dn’a brand missing');
  });

  await assert('3D Demo Showroom GET /demo.html returns 200', async () => {
    const res = await get('/demo.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('DESIGNED_3D')) throw new Error('Truthful classification missing');
  });

  await assert('Smart Exhibitor Card GET /card.html returns 200', async () => {
    const res = await get('/card.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('Alex Vance')) throw new Error('Alex Vance profile missing');
  });

  await assert('Product QR Waypoint GET /qr.html returns 200', async () => {
    const res = await get('/qr.html?product=DNA-ROBOT-X9');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('dn’a Apex-Arm X9 Cobot')) throw new Error('Product name missing');
  });

  await assert('DIY Builder Preview GET /builder.html returns 200', async () => {
    const res = await get('/builder.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('Early Access')) throw new Error('Early Access status missing');
  });

  await assert('Managed Production Order GET /start.html returns 200', async () => {
    const res = await get('/start.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('Request Your 3D Virtual Showroom')) throw new Error('Title missing');
  });

  await assert('Internal Production Inbox GET /production.html returns 200', async () => {
    const res = await get('/production.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('INTERNAL OPS INBOX')) throw new Error('Internal badge missing');
  });

  // 2. Journey A: RFQ submission
  console.log('\n--- 2. Journey A: RFQ Intake ---');
  await assert('POST /api/rfqs persists quotation request', async () => {
    const res = await post('/api/rfqs', {
      boothId: 'booth-demo-01',
      productId: 'DNA-ROBOT-X9',
      buyerName: 'Heinrich Mueller',
      company: 'Bosch Manufacturing GmbH',
      email: 'h.mueller@bosch.example',
      quantity: 10,
      notes: 'Need 10 units for Stuttgart plant assembly line.'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.body.success || !res.body.rfq?.id) throw new Error('RFQ record creation failed');
  });

  // 3. Journey B: Smart Exhibitor Card Lead Capture
  console.log('\n--- 3. Journey B: Smart Card Lead Exchange ---');
  await assert('POST /api/leads exchanges digital business card', async () => {
    const res = await post('/api/leads', {
      boothId: 'booth-demo-01',
      buyerName: 'Elena Rostova',
      company: 'Siemens Energy',
      email: 'e.rostova@siemens.example',
      phone: '+49 170 1234567',
      notes: 'Exchanged card at GIAE Booth B128'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.body.success || !res.body.lead?.id) throw new Error('Lead creation failed');
  });

  // 4. Sample Request & Appointment Booking
  console.log('\n--- 4. Sample Requests & Appointments ---');
  await assert('POST /api/samples accepts evaluation unit request', async () => {
    const res = await post('/api/samples', {
      boothId: 'booth-demo-01',
      productId: 'DNA-GRIPPER-H40',
      buyerName: 'Marcus Aurelius',
      company: 'RoboTech Labs',
      email: 'marcus@robotech.example',
      quantity: 1,
      notes: 'Evaluate gripper cycle time on UR10 robot'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.body.success || !res.body.sample?.id) throw new Error('Sample creation failed');
  });

  await assert('POST /api/appointments schedules 1:1 engineering meeting', async () => {
    const res = await post('/api/appointments', {
      boothId: 'booth-demo-01',
      buyerName: 'Dr. Sarah Connor',
      company: 'Cyberdyne Systems',
      email: 'sarah@cyberdyne.example',
      requestedAt: '2026-09-16T14:00:00Z',
      notes: 'Review SLAM AGV fleet safety architecture'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.body.success || !res.body.appointment?.id) throw new Error('Appointment creation failed');
  });

  // 5. Journey D: Managed Production Order Request & Persistence
  console.log('\n--- 5. Journey D: Managed Production Order Intake ---');
  let createdReqId = null;
  await assert('POST /api/production-requests creates persistent Managed Request with First-Class Show Date', async () => {
    const res = await post('/api/production-requests', {
      companyName: 'Wilo Pump Technologies Corp.',
      contactName: 'Klaus Wilo',
      email: 'klaus.wilo@wilo.example',
      phone: '+49 231 4102-0',
      website: 'https://wilo.com',
      tradeShow: 'ISH Frankfurt 2026',
      showDate: '2026-09-14',
      city: 'Frankfurt, Germany',
      boothNumber: 'Hall 9.0 — Stand C21',
      industry: 'HVAC, Pumps & Fluidics',
      productCount: 12,
      services: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'SMART_CARD', 'PRODUCT_QR', 'DIGITAL_CATALOG', 'RFQ_LEAD_CAPTURE'],
      notes: 'Require 360 interactive showroom with high-efficiency pump datasheets.'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    if (!res.body.success || !res.body.request?.id) throw new Error('Production request creation failed');
    if (res.body.request.status !== 'NEW_REQUEST') throw new Error(`Unexpected status: ${res.body.request.status}`);
    if (res.body.request.daysUntilShow === null) throw new Error('daysUntilShow not calculated');
    createdReqId = res.body.request.id;
  });

  await assert('GET /api/production-requests returns created production order', async () => {
    const res = await get('/api/production-requests');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const list = JSON.parse(res.body);
    const found = list.find(r => r.id === createdReqId);
    if (!found) throw new Error(`Created request ${createdReqId} not found in queue`);
  });

  // 6. Wilo Isolation Verification
  console.log('\n--- 6. Wilo Hard Boundary Verification ---');
  await assert('Wilo public showroom remains Photo Tour Primary with 3D Pending', async () => {
    const res = await get('/wilo-demo.html');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('Photo Tour (Primary)')) throw new Error('Photo Tour Primary missing');
    if (!res.body.includes('3D Reconstruction (Pending)')) throw new Error('3D Pending button missing');
    if (res.body.includes('PARTIAL AUTHENTIC 3D — EXPERIMENTAL')) throw new Error('Failed model banner leaked to public');
  });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
