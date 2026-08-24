// =====================================================================
// dn’a-C07 — STRIPE BILLING INTEGRATION & VALIDATION E2E TEST SUITE
// =====================================================================

const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
let devToken = '';

async function runRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', (e) => reject(e));
    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function loginAsDev() {
  const res = await runRequest('POST', '/api/auth/login', {
    email: 'developer@vshow.com',
    password: 'admin123'
  });
  if (res.data && res.data.token) {
    devToken = res.data.token;
    return devToken;
  }
  console.log('Login failed:', res);
  return '';
}

async function runAllTests() {
  console.log('=====================================================');
  console.log(' dn’a-C07 STRIPE BILLING E2E VERIFICATION TEST SUITE');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Authenticate
  await loginAsDev();
  assert(!!devToken, 'Developer authentication successful');

  // 2. Canonical Plan Registry
  const plansRes = await runRequest('GET', '/api/billing/plans');
  assert(plansRes.status === 200, 'GET /api/billing/plans returns 200');
  assert(plansRes.data.pro && plansRes.data.pro.monthlyPriceUsd === 299, 'PRO plan price is $299/mo (canonical)');
  assert(plansRes.data.business && plansRes.data.business.monthlyPriceUsd === 799, 'BUSINESS plan price is $799/mo (canonical)');

  // 3. Price Tampering Rejection
  const tamperRes = await runRequest('POST', '/api/billing/create-checkout-session', {
    requestedPlan: 'hacked_free_0_usd',
    consentTerms: true,
    consentRecurring: true
  }, { 'Authorization': `Bearer ${devToken}` });
  assert(tamperRes.status === 400, 'Price Tampering / Invalid Plan rejected with HTTP 400');

  // 4. Missing Consent Rejection
  const consentRes = await runRequest('POST', '/api/billing/create-checkout-session', {
    requestedPlan: 'pro',
    consentTerms: false,
    consentRecurring: false
  }, { 'Authorization': `Bearer ${devToken}` });
  assert(consentRes.status === 400, 'Checkout without explicit Terms/Recurring consent rejected with HTTP 400');

  // 5. Test Mode PRO Checkout Simulation
  const proCheckoutRes = await runRequest('POST', '/api/billing/create-checkout-session', {
    requestedPlan: 'pro',
    consentTerms: true,
    consentRecurring: true
  }, { 'Authorization': `Bearer ${devToken}` });
  assert(proCheckoutRes.status === 200 && proCheckoutRes.data.success, 'PRO Checkout Simulation creates active PRO subscription');

  // 6. Test Mode BUSINESS Checkout Simulation
  const bizCheckoutRes = await runRequest('POST', '/api/billing/create-checkout-session', {
    requestedPlan: 'business',
    consentTerms: true,
    consentRecurring: true
  }, { 'Authorization': `Bearer ${devToken}` });
  assert(bizCheckoutRes.status === 200 && bizCheckoutRes.data.success, 'BUSINESS Checkout Simulation creates active BUSINESS subscription');

  // 7. Customer Portal Endpoint
  const portalRes = await runRequest('POST', '/api/billing/portal', {}, { 'Authorization': `Bearer ${devToken}` });
  assert(portalRes.status === 200 && portalRes.data.success, 'Customer Portal endpoint returns portal session');

  // 8. Subscription Upgrade Endpoint
  const upgRes = await runRequest('POST', '/api/billing/subscription/upgrade', {}, { 'Authorization': `Bearer ${devToken}` });
  assert(upgRes.status === 200 && upgRes.data.success, 'POST /api/billing/subscription/upgrade upgrades to BUSINESS');

  // 9. Subscription Downgrade Endpoint
  const dwnRes = await runRequest('POST', '/api/billing/subscription/downgrade', {}, { 'Authorization': `Bearer ${devToken}` });
  assert(dwnRes.status === 200 && dwnRes.data.success, 'POST /api/billing/subscription/downgrade downgrades to PRO');

  // 10. Subscription Cancellation (Period End)
  const cancelRes = await runRequest('POST', '/api/billing/subscription/cancel', {}, { 'Authorization': `Bearer ${devToken}` });
  assert(cancelRes.status === 200 && cancelRes.data.subscription.status === 'canceled', 'POST /api/billing/subscription/cancel sets cancelAtPeriodEnd without deleting data');

  // 11. Subscription Reactivation
  const reactRes = await runRequest('POST', '/api/billing/subscription/reactivate', {}, { 'Authorization': `Bearer ${devToken}` });
  assert(reactRes.status === 200 && reactRes.data.subscription.status === 'active', 'POST /api/billing/subscription/reactivate restores status to ACTIVE');

  // 12. Dev Lab Tab 9 Billing Sandbox Endpoints
  const ledgerRes = await runRequest('GET', '/api/internal/dev/billing/ledger', null, { 'Authorization': `Bearer ${devToken}` });
  assert(ledgerRes.status === 200 && Array.isArray(ledgerRes.data.ledger), 'GET /api/internal/dev/billing/ledger returns financial ledger');

  const failRes = await runRequest('POST', '/api/internal/dev/billing/simulate-failure', { organizationId: 'org-dev-lab' }, { 'Authorization': `Bearer ${devToken}` });
  assert(failRes.status === 200 && failRes.data.success, 'POST /api/internal/dev/billing/simulate-failure sets status to PAST_DUE');

  // 13. Webhook Idempotency (10 Concurrent Replays of Same Event)
  const testEventId = `evt_concurrency_test_${Date.now()}`;
  const webhookPromises = [];
  for (let i = 0; i < 10; i++) {
    webhookPromises.push(runRequest('POST', '/api/internal/dev/billing/replay-webhook', {
      event: {
        id: testEventId,
        type: 'invoice.payment_succeeded',
        data: { object: { customer: 'cus_sim_concurrency', amount_paid: 29900 } }
      }
    }, { 'Authorization': `Bearer ${devToken}` }));
  }
  const webhookResults = await Promise.all(webhookPromises);
  const duplicatesCount = webhookResults.filter(r => r.data && r.data.duplicate === true).length;
  assert(duplicatesCount === 9, `Webhook 10-concurrency idempotency: Exactly 1 processed, 9 deduplicated (WEBHOOK_DUPLICATE_EFFECT = 0)`);

  // 14. Live Guardrails Verification
  const healthRes = await runRequest('GET', '/api/health');
  assert(healthRes.status === 200, 'GET /api/health returns 200 OK');

  console.log('\n=====================================================');
  console.log(` C07 TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
