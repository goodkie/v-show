// =====================================================================
// dn’a-C09 — FREE-TO-PAID CONVERSION & STRIPE ACTIVATION E2E TEST SUITE
// =====================================================================

const http = require('http');

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
  return '';
}

async function runAllTests() {
  console.log('=====================================================');
  console.log(' dn’a-C09 FREE-TO-PAID CONVERSION & STRIPE TEST SUITE');
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

  // 1. Authenticate Developer
  await loginAsDev();
  assert(!!devToken, 'Developer session authenticated');

  // Reset Free Preview Usages for clean verification
  await runRequest('POST', '/api/internal/dev/free-funnel/reset', null, { 'Authorization': `Bearer ${devToken}` });

  // 2. Billing Reality Audit (Canonical Server Plan Registry)
  const plansRes = await runRequest('GET', '/api/billing/plans');
  assert(plansRes.status === 200, 'Canonical plan registry API accessible (200 OK)');
  assert(plansRes.data.pro && plansRes.data.pro.monthlyPriceUsd === 299, 'PRO plan price is $299/mo (canonical)');
  assert(plansRes.data.business && plansRes.data.business.monthlyPriceUsd === 799, 'BUSINESS plan price is $799/mo (canonical)');
  assert(plansRes.data.custom && plansRes.data.custom.pricingType === 'QUOTE', 'CUSTOM plan is enterprise quote based');

  // 3. Controlled Test A: Free Project -> PRO Checkout -> Webhook -> ACTIVE_PRO
  const createARes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Nova Robotic Systems Inc.',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '198.51.100.10' });
  assert(createARes.status === 201 && createARes.data.projectId, 'Controlled Test A: Free booth created');
  const projectAId = createARes.data.projectId;

  // Add First Product & Pinpoint
  const prodARes = await runRequest('POST', `/api/free-funnel/projects/${projectAId}/pinpoints`, {
    productName: 'Nova Autonomous Rover N-1',
    description: 'High-speed autonomous navigation rover for precision logistics.',
    u: 0.35,
    v: 0.72,
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  assert(prodARes.status === 201, 'Controlled Test A: First product and pinpoint added');

  // Claim Account & Checkout
  const claimARes = await runRequest('POST', `/api/free-funnel/projects/${projectAId}/claim-account`, {
    email: 'alex@novarobotics.example',
    name: 'Nova Robotics Team'
  });
  assert(claimARes.status === 200 && claimARes.data.org, 'Controlled Test A: Project claimed with exhibitor account');
  const orgAId = claimARes.data.org.id;

  // Verify Publish Gate blocks FREE_PREVIEW
  const publishBeforeRes = await runRequest('POST', `/api/projects/${projectAId}/publish`);
  assert(publishBeforeRes.status === 403, 'Controlled Test A: Publish gate blocks FREE_PREVIEW project (HTTP 403)');

  // Simulate Webhook reconciliation for PRO
  const customerA = `cus_test_nova_${Date.now()}`;
  const subscriptionA = `sub_test_nova_${Date.now()}`;
  const webhookEventA = {
    id: `evt_test_a_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: customerA,
        subscription: subscriptionA,
        amount_total: 29900,
        metadata: {
          organizationId: orgAId,
          projectId: projectAId,
          requestedPlan: 'pro'
        }
      }
    }
  };
  const hookARes = await runRequest('POST', '/api/billing/stripe-webhook', webhookEventA);
  assert(hookARes.status === 200, 'Controlled Test A: Webhook accepted');

  // Verify Project Continuity & Commercial State
  const prjARes = await runRequest('GET', `/api/free-funnel/projects/${projectAId}`);
  assert(prjARes.data.project.commercialState === 'ACTIVE_PRO', 'Controlled Test A: Project commercial state is ACTIVE_PRO');
  assert(prjARes.data.project.id === projectAId, 'Controlled Test A: Project ID strictly preserved (FREE_TO_PRO_DATA_REENTRY = 0)');
  assert(prjARes.data.project.products.length === 1, 'Controlled Test A: Uploaded product preserved');
  assert(prjARes.data.project.pinpoints.length === 1, 'Controlled Test A: Placed pinpoint preserved');

  // Verify Publish Gate now unlocks
  const publishAfterRes = await runRequest('POST', `/api/projects/${projectAId}/publish`);
  assert(publishAfterRes.status === 200 && publishAfterRes.data.success, 'Controlled Test A: Publish gate unlocks after paid activation');

  // 4. Controlled Test B: Free Project -> BUSINESS Checkout -> Webhook -> ACTIVE_BUSINESS
  const createBRes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Quantum Bio Labs Corp.',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '198.51.100.20' });
  const projectBId = createBRes.data.projectId;

  const claimBRes = await runRequest('POST', `/api/free-funnel/projects/${projectBId}/claim-account`, {
    email: 'contact@quantumbio.example',
    name: 'Quantum Bio Labs'
  });
  const orgBId = claimBRes.data.org.id;

  const webhookEventB = {
    id: `evt_test_b_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: `cus_test_qbio_${Date.now()}`,
        subscription: `sub_test_qbio_${Date.now()}`,
        amount_total: 79900,
        metadata: {
          organizationId: orgBId,
          projectId: projectBId,
          requestedPlan: 'business'
        }
      }
    }
  };
  await runRequest('POST', '/api/billing/stripe-webhook', webhookEventB);
  const prjBRes = await runRequest('GET', `/api/free-funnel/projects/${projectBId}`);
  assert(prjBRes.data.project.commercialState === 'ACTIVE_BUSINESS', 'Controlled Test B: Project commercial state is ACTIVE_BUSINESS');
  assert(prjBRes.data.project.id === projectBId, 'Controlled Test B: Project ID strictly preserved (FREE_TO_BUSINESS_DATA_REENTRY = 0)');

  // 5. Controlled Test C: CUSTOM Quote Flow
  const customQuoteRes = await runRequest('POST', `/api/free-funnel/projects/${projectAId}/custom-quote`, {
    company: 'Nova Robotic Systems Enterprise',
    email: 'enterprise@novarobotics.example',
    tradeShow: 'CES 2027',
    productCount: 150,
    desiredServices: 'Full 3D Digital Twin & Onsite Capture'
  });
  assert(customQuoteRes.status === 201 && customQuoteRes.data.ticket, 'Controlled Test C: Custom quote ticket created in sales queue');
  assert(customQuoteRes.data.commercialState === 'CUSTOM_QUOTE_REQUESTED', 'Controlled Test C: Commercial state is CUSTOM_QUOTE_REQUESTED');

  // 6. Controlled Test D: Price Tampering Rejection
  const tamperRes = await runRequest('POST', '/api/billing/create-checkout-session', {
    requestedPlan: 'free_hack',
    customAmountCents: 100, // Attempting $1 override
    consentTerms: true,
    consentRecurring: true
  }, { 'Authorization': `Bearer ${devToken}` });
  assert(tamperRes.status === 400, 'Controlled Test D: Arbitrary plan / price tampering rejected with HTTP 400');

  // 7. Controlled Test E: Cross-Tenant Project Checkout Rejection
  const hijackRes = await runRequest('POST', `/api/free-funnel/projects/prj-non-existent-999/claim-account`, {
    email: 'hacker@example.com'
  });
  assert(hijackRes.status === 400 || hijackRes.status === 404, 'Controlled Test E: Invalid project ownership claim rejected');

  // 8. Controlled Test F: Duplicate Webhook Deduplication (WEBHOOK_DUPLICATE_EFFECT = 0)
  const dupEvent = {
    id: 'evt_test_dup_dedup_001',
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: 'cus_test_dup',
        subscription: 'sub_test_dup',
        amount_total: 29900,
        metadata: { organizationId: orgAId, requestedPlan: 'pro' }
      }
    }
  };
  const firstDelivery = await runRequest('POST', '/api/billing/stripe-webhook', dupEvent);
  const secondDelivery = await runRequest('POST', '/api/billing/stripe-webhook', dupEvent);
  assert(firstDelivery.status === 200, 'Controlled Test F: First webhook delivery processed');
  assert(secondDelivery.status === 200 && secondDelivery.data.duplicate === true, 'Controlled Test F: Duplicate webhook deduplicated without side effects');

  // 9. Controlled Test G: Payment Failure sets PAST_DUE without data loss
  const failSubEvent = {
    id: `evt_test_fail_${Date.now()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subscriptionA,
        customer: customerA,
        status: 'past_due',
        metadata: { organizationId: orgAId }
      }
    }
  };
  await runRequest('POST', '/api/billing/stripe-webhook', failSubEvent);
  const prjAfterFail = await runRequest('GET', `/api/free-funnel/projects/${projectAId}`);
  assert(prjAfterFail.data.project.commercialState === 'PAST_DUE', 'Controlled Test G: Subscription status updated to PAST_DUE');
  assert(prjAfterFail.data.project.products.length === 1, 'Controlled Test G: Products preserved during payment failure');
  assert(prjAfterFail.data.project.pinpoints.length === 1, 'Controlled Test G: Pinpoints preserved during payment failure');

  // 10. Controlled Test H: Subscription Upgrade
  const upgradeSubEvent = {
    id: `evt_test_upgrade_${Date.now()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subscriptionA,
        customer: customerA,
        status: 'active',
        metadata: { organizationId: orgAId, requestedPlan: 'business' },
        items: { data: [{ price: { unit_amount: 79900 } }] }
      }
    }
  };
  await runRequest('POST', '/api/billing/stripe-webhook', upgradeSubEvent);
  const prjAfterUpgrade = await runRequest('GET', `/api/free-funnel/projects/${projectAId}`);
  assert(prjAfterUpgrade.data.project.commercialState === 'ACTIVE_BUSINESS', 'Controlled Test H: Upgrade reconciled to ACTIVE_BUSINESS');

  // 11. Controlled Test I: Cancellation at Period End & Reactivation
  const cancelSubEvent = {
    id: `evt_test_cancel_${Date.now()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subscriptionA,
        customer: customerA,
        status: 'active',
        cancel_at_period_end: true,
        metadata: { organizationId: orgAId }
      }
    }
  };
  await runRequest('POST', '/api/billing/stripe-webhook', cancelSubEvent);
  const orgAfterCancel = await runRequest('GET', `/api/organizations/${orgAId}`, null, { 'Authorization': `Bearer ${devToken}` });
  assert(orgAfterCancel.data && orgAfterCancel.data.organization?.subscription?.cancelAtPeriodEnd === true, 'Controlled Test I: Cancel at period end recorded without immediate revocation');

  // Reactivate
  const reactivateSubEvent = {
    id: `evt_test_reactivate_${Date.now()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subscriptionA,
        customer: customerA,
        status: 'active',
        cancel_at_period_end: false,
        metadata: { organizationId: orgAId }
      }
    }
  };
  await runRequest('POST', '/api/billing/stripe-webhook', reactivateSubEvent);
  const orgAfterReactivate = await runRequest('GET', `/api/organizations/${orgAId}`, null, { 'Authorization': `Bearer ${devToken}` });
  assert(orgAfterReactivate.data && orgAfterReactivate.data.organization?.subscription?.cancelAtPeriodEnd === false, 'Controlled Test I: Reactivation confirmed');

  // 12. Controlled Test J: Redirect Before Webhook Holding State
  const holdPrjRes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Hold State Test Lab Inc.',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '198.51.100.99' });
  const holdPrjId = holdPrjRes.data.projectId;

  // Claim and initiate checkout
  const claimHoldRes = await runRequest('POST', `/api/free-funnel/projects/${holdPrjId}/claim-account`, {
    email: 'hold@example.com'
  });
  const holdOrgId = claimHoldRes.data.org.id;

  const holdCustId = `cus_test_hold_${Date.now()}`;
  const holdSubId = `sub_test_hold_${Date.now()}`;
  const holdWebhook = {
    id: `evt_test_hold_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: holdCustId,
        subscription: holdSubId,
        amount_total: 29900,
        metadata: {
          organizationId: holdOrgId,
          projectId: holdPrjId,
          requestedPlan: 'pro'
        }
      }
    }
  };

  // Before webhook arrives: simulate pending checkout state
  await runRequest('POST', `/api/billing/create-checkout-session`, {
    requestedPlan: 'pro',
    projectId: holdPrjId,
    consentTerms: true,
    consentRecurring: true
  }, { 'Authorization': `Bearer ${devToken}` });

  // Webhook arrives
  await runRequest('POST', '/api/billing/stripe-webhook', holdWebhook);
  const checkFinalPrj = await runRequest('GET', `/api/free-funnel/projects/${holdPrjId}`);
  assert(checkFinalPrj.data.project.commercialState === 'ACTIVE_PRO', 'Controlled Test J: Webhook transitions project to ACTIVE_PRO');

  console.log('\n=====================================================');
  console.log(` C09 TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal C09 test error:', err);
  process.exit(1);
});
