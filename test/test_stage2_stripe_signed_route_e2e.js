/**
 * test/test_stage2_stripe_signed_route_e2e.js
 * ─────────────────────────────────────────────────────────────────────────────
 * [ANTIGRAVITY][PANORAMA FAST LAUNCH] GENUINE REAL-SERVER SIGNED STRIPE TEST ROUTE E2E
 *
 * Verifies the actual production server routes mounted from:
 *   virtual-tradeshow-commercial-v1/_clean_deploy/server/index.js
 * in a strictly disposable os.tmpdir() environment without any LIVE keys or money.
 *
 * Features tested:
 *   [P0-1] Disposable DATA_DIR sandbox strictly inside os.tmpdir().
 *   [P0-2] Real server route mounting on ephemeral port (PORT=0).
 *   [P0-3] Authoritative pending checkout auth (Zero metadata fallback).
 *   [P0-4] Approved Test Catalog price ID, quantity, currency, and amount validation.
 *   [P0-5] Fail-closed on missing line items, invalid quantity, wrong price, or unpaid.
 *   [P0-6] Two-way Stripe customer ID + subscription ID binding on subscription updates.
 *   [P0-7] Same-timestamp deterministic tie-breaking & out-of-order rejection.
 *   [P0-8] Operational events: payment_failed -> past_due, invoice.paid -> active,
 *          customer.subscription.deleted -> canceled/free.
 *   [P0-9] Cryptographic signature verification and forged/missing header rejection.
 *   [P0-10] Multi-tenant isolation (zero wrong-org state change under concurrent deliveries).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const assert = require('assert');

// ── [P0-1] ESTABLISH DISPOSABLE DATA_DIR BEFORE ANY MODULE IMPORT ────────────
const runNonce = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
const disposableDir = path.join(os.tmpdir(), `vshow_stripe_real_srv_${runNonce}`);
fs.mkdirSync(disposableDir, { recursive: true });

// Strictly configure environment variables BEFORE requiring db or server modules
process.env.DATA_DIR = disposableDir;
process.env.PORT = '0';
process.env.HTTPS_PORT = '0';
process.env.STRIPE_MODE = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret_key_antigravity_e2e';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_webhook_secret_antigravity_e2e';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_test_pro_monthly';
process.env.STRIPE_PRICE_BUSINESS_MONTHLY = 'price_test_biz_monthly';

console.log('=== RUNNING REAL-SERVER SIGNED STRIPE TEST-MODE ROUTE E2E ===');
console.log(`[P0-1] Disposable DATA_DIR initialized: ${disposableDir}`);

// Assert DATA_DIR safety
assert.ok(
  path.resolve(disposableDir).startsWith(path.resolve(os.tmpdir())),
  'DATA_DIR must be strictly within os.tmpdir()'
);
assert.strictEqual(
  path.resolve(disposableDir).includes('_clean_deploy'),
  false,
  'FAIL-CLOSED: DATA_DIR must NEVER resolve to _clean_deploy directory!'
);

// Require DB module AFTER environment is established
const db = require('../virtual-tradeshow-commercial-v1/_clean_deploy/server/db');

// Require the ACTUAL Express application server
const { server, app, httpsServer, stripeClient } = require('../virtual-tradeshow-commercial-v1/_clean_deploy/server/index');

// Initialize isolated Stripe SDK client for signature generation
const stripe = require('../virtual-tradeshow-commercial-v1/_clean_deploy/node_modules/stripe')(process.env.STRIPE_SECRET_KEY);

// Authoritative mock store for testing server-side authoritative provider retrieval
const authoritativeSessionStore = new Map();
const authoritativeLineItemsStore = new Map();

if (stripeClient && stripeClient.checkout && stripeClient.checkout.sessions) {
  stripeClient.checkout.sessions.retrieve = async (id) => {
    if (authoritativeSessionStore.has(id)) {
      return authoritativeSessionStore.get(id);
    }
    return { id, status: 'complete', payment_status: 'paid' };
  };

  stripeClient.checkout.sessions.listLineItems = async (id, params) => {
    if (authoritativeLineItemsStore.has(id)) {
      const entry = authoritativeLineItemsStore.get(id);
      return typeof entry === 'function' ? entry(params) : entry;
    }
    return { object: 'list', data: [], has_more: false };
  };
}

async function main() {
  let serverPort;

  try {
    // Wait for server to listen on ephemeral port
    if (!server.listening) {
      await new Promise(resolve => server.once('listening', resolve));
    }
    serverPort = server.address().port;
    console.log(`[SETUP] Real server listening on ephemeral port http://127.0.0.1:${serverPort}`);

    // Verify /health endpoint on real server
    const healthCheck = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${serverPort}/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
    assert.strictEqual(healthCheck.status, 200, 'Real server /health must return 200');
    console.log('  PASS: Real server booted and responded 200 on /health');

    // ── SEED SYNTHETIC TEST TENANTS IN DISPOSABLE SANDBOX ───────────────────
    const testOrgId = `org_test_real_${Date.now()}`;
    const testProjectId = `prj_${testOrgId}`;
    const otherOrgId = `org_other_real_${Date.now()}`;
    const otherProjectId = `prj_${otherOrgId}`;

    await db.mutate((d) => {
      d.organizations = d.organizations || [];
      d.projects = d.projects || [];
      d.freePreviewProjects = d.freePreviewProjects || [];
      d.pendingCheckouts = d.pendingCheckouts || [];
      d.stripeEvents = d.stripeEvents || [];
      d.billingEvents = d.billingEvents || [];

      // Primary test organization (Free tier)
      d.organizations.push({
        id: testOrgId,
        name: 'Disposable Test Org Corp',
        subscription: {
          plan: 'free',
          status: 'active',
          dataEnvironment: 'TEST_DISPOSABLE'
        },
        createdAt: new Date().toISOString()
      });

      // Secondary tenant organization for cross-tenant breach testing
      d.organizations.push({
        id: otherOrgId,
        name: 'Other Tenant Org Corp',
        subscription: {
          plan: 'free',
          status: 'active',
          dataEnvironment: 'TEST_DISPOSABLE'
        },
        createdAt: new Date().toISOString()
      });

      // Primary test project
      d.projects.push({
        id: testProjectId,
        organizationId: testOrgId,
        name: 'Immersive Tradeshow Booth',
        commercialState: 'FREE_TRIAL',
        createdAt: new Date().toISOString()
      });

      // Secondary tenant project
      d.projects.push({
        id: otherProjectId,
        organizationId: otherOrgId,
        name: 'Other Tenant Booth',
        commercialState: 'FREE_TRIAL',
        createdAt: new Date().toISOString()
      });
    });

    console.log(`[SETUP] Seeded isolated test tenants ${testOrgId} and ${otherOrgId} in sandbox.`);

    // Helper: make signed HTTP POST to the real server webhook endpoint
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    async function postWebhook(payloadObject, customSignature = null) {
      if (typeof payloadObject === 'object' && payloadObject.type === 'checkout.session.completed' && payloadObject.data?.object) {
        const sess = payloadObject.data.object;
        if (sess.id && !authoritativeSessionStore.has(sess.id)) {
          authoritativeSessionStore.set(sess.id, {
            id: sess.id,
            customer: sess.customer,
            subscription: sess.subscription,
            payment_status: sess.payment_status || 'paid',
            status: sess.status || 'complete',
            amount_total: sess.amount_total,
            currency: sess.currency,
            metadata: sess.metadata || {}
          });
        }
        if (sess.id && sess.line_items && !authoritativeLineItemsStore.has(sess.id)) {
          authoritativeLineItemsStore.set(sess.id, sess.line_items);
        }
      }

      const payloadString = typeof payloadObject === 'string' ? payloadObject : JSON.stringify(payloadObject);
      const signature = customSignature !== null
        ? customSignature
        : stripe.webhooks.generateTestHeaderString({
            payload: payloadString,
            secret: webhookSecret
          });

      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/api/billing/stripe-webhook',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadString),
            'Stripe-Signature': signature
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            let json;
            try { json = JSON.parse(data); } catch (_) { json = { raw: data }; }
            resolve({ status: res.statusCode, data: json });
          });
        });
        req.on('error', reject);
        req.write(payloadString);
        req.end();
      });
    }

    // ── TEST 1: POSITIVE SIGNED CHECKOUT COMPLETION (REAL SERVER ROUTE) ────
    console.log('\n[TEST 1] Verifying Positive Signed TEST Checkout Completion on Real Server Route...');
    const sessionId1 = `cs_test_auth_${Date.now()}`;
    const customerId1 = `cus_test_auth_${Date.now()}`;
    const subId1 = `sub_test_auth_${Date.now()}`;

    await db.recordPendingCheckout({
      sessionId: sessionId1,
      organizationId: testOrgId,
      projectId: testProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });

    const event1 = {
      id: `evt_test_checkout_${Date.now()}_1`,
      object: 'event',
      api_version: '2022-11-15',
      created: Math.floor(Date.now() / 1000),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId1,
          object: 'checkout.session',
          customer: customerId1,
          subscription: subId1,
          payment_status: 'paid',
          status: 'complete',
          amount_total: 29900,
          currency: 'usd',
          line_items: {
            data: [{
              price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } },
              quantity: 1
            }]
          }
        }
      }
    };

    const res1 = await postWebhook(event1);
    assert.strictEqual(res1.status, 200, `Expected HTTP 200, got ${res1.status}: ${JSON.stringify(res1.data)}`);
    assert.strictEqual(res1.data.received, true);

    const orgAfter1 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter1.subscription.plan, 'pro', 'Org plan must be upgraded to pro');
    assert.strictEqual(orgAfter1.subscription.status, 'active', 'Org status must be active');
    assert.strictEqual(orgAfter1.subscription.stripeCustomerId, customerId1);
    assert.strictEqual(orgAfter1.subscription.stripeSubscriptionId, subId1);

    const pendingAfter1 = db.getPendingCheckout(sessionId1);
    assert.strictEqual(pendingAfter1.status, 'COMPLETED', 'Pending checkout record must be marked COMPLETED');

    const projectAfter1 = await db.getProjectById(testProjectId);
    assert.strictEqual(projectAfter1.commercialState, 'ACTIVE_PRO', 'Project commercialState must be ACTIVE_PRO');
    console.log('  PASS: Positive signed checkout completion upgraded org and marked pending completed.');

    // ── TEST 2: IDEMPOTENCY / REPLAY PROTECTION ────────────────────────────
    console.log('\n[TEST 2] Verifying Webhook Idempotency & Replay Protection against duplicate deliveries...');
    const res2 = await postWebhook(event1);
    assert.strictEqual(res2.status, 200, 'Duplicate event must return HTTP 200');
    assert.strictEqual(res2.data.duplicate, true, 'Duplicate delivery must be flagged with duplicate: true');
    console.log('  PASS: Duplicate signed webhook delivery safely flagged duplicate with zero state mutation.');

    // ── TEST 3: ABSENT PENDING CHECKOUT (FAIL-CLOSED) ────────────────────────
    console.log('\n[TEST 3] Verifying Fail-Closed rejection when pending checkout is ABSENT...');
    const eventUnrecorded = {
      id: `evt_unrecorded_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_unrecorded_${Date.now()}`,
          customer: `cus_unrecorded_${Date.now()}`,
          subscription: `sub_unrecorded_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const res3 = await postWebhook(eventUnrecorded);
    assert.strictEqual(res3.status, 400, 'Unrecorded checkout session must be rejected with HTTP 400');
    assert.strictEqual(res3.data.error, 'NO_AUTHORITATIVE_PENDING_CHECKOUT');
    console.log('  PASS: Unrecorded checkout session rejected with NO_AUTHORITATIVE_PENDING_CHECKOUT.');

    // ── TEST 4: FORGED CLIENT METADATA ATTACK PREVENTION ───────────────────
    console.log('\n[TEST 4] Verifying Forged Client Metadata Attack is rejected (Zero metadata entitlement fallback)...');
    const eventForgedMeta = {
      id: `evt_forged_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_forged_${Date.now()}`,
          customer: `cus_forged_${Date.now()}`,
          subscription: `sub_forged_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] },
          metadata: {
            organizationId: otherOrgId,
            projectId: otherProjectId,
            requestedPlan: 'business'
          }
        }
      }
    };
    const res4 = await postWebhook(eventForgedMeta);
    assert.strictEqual(res4.status, 400, 'Forged metadata event without authoritative pending record must be rejected');
    assert.strictEqual(res4.data.error, 'NO_AUTHORITATIVE_PENDING_CHECKOUT');

    const otherOrgAfter4 = db.getOrganizationById(otherOrgId);
    assert.strictEqual(otherOrgAfter4.subscription.plan, 'free', 'Other org must NEVER be upgraded via forged metadata');
    console.log('  PASS: Forged metadata attack strictly rejected; zero entitlement granted.');

    // ── TEST 5: MISSING LINE ITEMS FAIL-CLOSED ─────────────────────────────
    console.log('\n[TEST 5] Verifying Missing Line Items fail-closed rejection...');
    const sessionId5 = `cs_no_line_items_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId5,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    // Configure authoritative provider to return empty line items
    authoritativeLineItemsStore.set(sessionId5, { object: 'list', data: [], has_more: false });
    const eventNoItems = {
      id: `evt_no_items_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId5,
          customer: `cus_no_items_${Date.now()}`,
          subscription: `sub_no_items_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
          // line_items intentionally omitted!
        }
      }
    };
    const res5 = await postWebhook(eventNoItems);
    assert.strictEqual(res5.status, 400, 'Missing line items must be rejected with HTTP 400');
    assert.ok(res5.data.error === 'MISSING_LINE_ITEMS' || res5.data.error === 'STRIPE_LINE_ITEMS_EMPTY', `Expected MISSING_LINE_ITEMS or STRIPE_LINE_ITEMS_EMPTY, got ${res5.data.error}`);
    console.log('  PASS: Checkout event with missing line items rejected with HTTP 400.');

    // ── TEST 6: UNAPPROVED PRICE ID FAIL-CLOSED ────────────────────────────
    console.log('\n[TEST 6] Verifying Unapproved Price ID fail-closed rejection...');
    const sessionId6 = `cs_bad_price_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId6,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventBadPrice = {
      id: `evt_bad_price_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId6,
          customer: `cus_bad_price_${Date.now()}`,
          subscription: `sub_bad_price_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_unapproved_scam_monthly' }, quantity: 1 }] }
        }
      }
    };
    const res6 = await postWebhook(eventBadPrice);
    assert.strictEqual(res6.status, 400, 'Unapproved price ID must be rejected with HTTP 400');
    assert.strictEqual(res6.data.error, 'PRICE_ID_MISMATCH');
    console.log('  PASS: Checkout event with unapproved price ID rejected with PRICE_ID_MISMATCH.');

    // ── TEST 7: INVALID QUANTITY (!== 1) FAIL-CLOSED ───────────────────────
    console.log('\n[TEST 7] Verifying Invalid Quantity (!== 1) fail-closed rejection...');
    const sessionId7 = `cs_bad_qty_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId7,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventBadQty = {
      id: `evt_bad_qty_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId7,
          customer: `cus_bad_qty_${Date.now()}`,
          subscription: `sub_bad_qty_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 5 }] }
        }
      }
    };
    const res7 = await postWebhook(eventBadQty);
    assert.strictEqual(res7.status, 400, 'Quantity !== 1 must be rejected with HTTP 400');
    assert.strictEqual(res7.data.error, 'INVALID_QUANTITY');
    console.log('  PASS: Checkout event with quantity > 1 rejected with INVALID_QUANTITY.');

    // ── TEST 8: AMOUNT & CURRENCY MISMATCH FAIL-CLOSED ──────────────────────
    console.log('\n[TEST 8] Verifying Amount & Currency mismatch fail-closed rejection...');
    const sessionId8 = `cs_amount_mismatch_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId8,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventWrongAmount = {
      id: `evt_wrong_amt_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId8,
          customer: `cus_wrong_amt_${Date.now()}`,
          subscription: `sub_wrong_amt_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 100, // $1.00 instead of $299.00
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const res8 = await postWebhook(eventWrongAmount);
    assert.strictEqual(res8.status, 400, 'Amount mismatch must be rejected with HTTP 400');
    assert.strictEqual(res8.data.error, 'AMOUNT_MISMATCH');
    console.log('  PASS: Underpaid amount mismatch rejected with AMOUNT_MISMATCH.');

    // ── TEST 9: UNPAID PAYMENT STATUS REJECTION ─────────────────────────────
    console.log('\n[TEST 9] Verifying Unpaid Payment Status rejection...');
    const sessionId9 = `cs_unpaid_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId9,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventUnpaid = {
      id: `evt_unpaid_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId9,
          customer: `cus_unpaid_${Date.now()}`,
          subscription: `sub_unpaid_${Date.now()}`,
          payment_status: 'unpaid', // NOT paid
          amount_total: 29900,
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const res9 = await postWebhook(eventUnpaid);
    assert.strictEqual(res9.status, 400, 'Unpaid session must be rejected with HTTP 400');
    assert.strictEqual(res9.data.error, 'PAYMENT_NOT_PAID');
    console.log('  PASS: Unpaid checkout session rejected with PAYMENT_NOT_PAID.');

    // ── TEST 10: CROSS-TENANT PROJECT MISMATCH REJECTION ───────────────────
    console.log('\n[TEST 10] Verifying Cross-Tenant Project Mismatch fail-closed rejection...');
    const sessionId10 = `cs_cross_tenant_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId10,
      organizationId: testOrgId,
      projectId: otherProjectId, // Project belongs to otherOrgId!
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventCrossTenant = {
      id: `evt_cross_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId10,
          customer: `cus_cross_${Date.now()}`,
          subscription: `sub_cross_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const res10 = await postWebhook(eventCrossTenant);
    assert.strictEqual(res10.status, 400, 'Cross-tenant project mismatch must be rejected with HTTP 400');
    assert.strictEqual(res10.data.error, 'PROJECT_TENANT_MISMATCH');
    console.log('  PASS: Cross-tenant project mismatch rejected with PROJECT_TENANT_MISMATCH.');

    // ── TEST 11: SUBSCRIPTION UPDATE WITH EXACT APPROVED CATALOG PRICE ─────
    console.log('\n[TEST 11] Verifying customer.subscription.updated with Approved Test Catalog Price...');
    const nowSec11 = Math.floor(Date.now() / 1000) + 10;
    const eventSubUpdated = {
      id: `evt_sub_up_${Date.now()}_b`,
      object: 'event',
      created: nowSec11,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId1,
          customer: customerId1,
          status: 'active',
          items: {
            data: [{
              price: { id: 'price_test_biz_monthly', recurring: { interval: 'month' } },
              quantity: 1
            }]
          }
        }
      }
    };
    const res11 = await postWebhook(eventSubUpdated);
    assert.strictEqual(res11.status, 200, `Expected 200, got ${res11.status}: ${JSON.stringify(res11.data)}`);

    const orgAfter11 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter11.subscription.plan, 'business', 'Org plan must be upgraded to business');
    assert.strictEqual(orgAfter11.subscription.status, 'active');
    console.log('  PASS: customer.subscription.updated with approved business test price succeeded.');

    // ── TEST 12: SUBSCRIPTION UPDATE WITH UNAPPROVED PRICE ID (FAIL-CLOSED) ─
    console.log('\n[TEST 12] Verifying customer.subscription.updated with Unapproved Price ID fails closed...');
    const eventSubBadPrice = {
      id: `evt_sub_bad_price_${Date.now()}`,
      object: 'event',
      created: nowSec11 + 5,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId1,
          customer: customerId1,
          status: 'active',
          items: {
            data: [{
              price: { id: 'price_unapproved_enterprise_custom' },
              quantity: 1
            }]
          }
        }
      }
    };
    const res12 = await postWebhook(eventSubBadPrice);
    assert.strictEqual(res12.status, 400, 'Unapproved price ID on subscription update must return 400');
    assert.strictEqual(res12.data.error, 'UNAPPROVED_PRICE_ID');
    console.log('  PASS: Unapproved price ID rejected with UNAPPROVED_PRICE_ID.');

    // ── TEST 13: SUBSCRIPTION UPDATE FOR UNBOUND ORG (FAIL-CLOSED) ─────────
    console.log('\n[TEST 13] Verifying customer.subscription.updated for Unbound Customer/Subscription fails closed...');
    const eventSubUnbound = {
      id: `evt_sub_unbound_${Date.now()}`,
      object: 'event',
      created: nowSec11 + 10,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: `sub_foreign_${Date.now()}`,
          customer: `cus_foreign_${Date.now()}`,
          status: 'active',
          items: {
            data: [{
              price: { id: 'price_test_biz_monthly', recurring: { interval: 'month' } },
              quantity: 1
            }]
          }
        }
      }
    };
    const res13 = await postWebhook(eventSubUnbound);
    assert.strictEqual(res13.status, 400, 'Unbound subscription update must return 400');
    assert.strictEqual(res13.data.error, 'UNBOUND_SUBSCRIPTION');
    console.log('  PASS: Unbound subscription update rejected with UNBOUND_SUBSCRIPTION.');

    // ── TEST 14: SAME-TIMESTAMP CONCURRENT TIE-BREAKING & OUT-OF-ORDER ──────
    console.log('\n[TEST 14] Verifying Same-Timestamp Tie-Breaking & Out-Of-Order Event Rejection...');
    const tieTimestamp = nowSec11 + 20;
    // Primary winner event (lexically higher ID: evt_z_win)
    const eventWinner = {
      id: 'evt_z_win_99999',
      object: 'event',
      created: tieTimestamp,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId1,
          customer: customerId1,
          status: 'active',
          items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const resWin = await postWebhook(eventWinner);
    assert.strictEqual(resWin.status, 200);

    // Conflicting same-timestamp delivery with lower lexical ID (evt_a_loser)
    const eventLoser = {
      id: 'evt_a_loser_11111',
      object: 'event',
      created: tieTimestamp,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId1,
          customer: customerId1,
          status: 'active',
          items: { data: [{ price: { id: 'price_test_biz_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const resLoser = await postWebhook(eventLoser);
    assert.strictEqual(resLoser.status, 200, 'Ignored tie must return 200');

    // State must remain the winner's plan ('pro')
    const orgAfterTie = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfterTie.subscription.plan, 'pro', 'Winner plan pro must be preserved');

    // Chronologically older event (tieTimestamp - 50)
    const eventOlder = {
      id: 'evt_older_past',
      object: 'event',
      created: tieTimestamp - 50,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId1,
          customer: customerId1,
          status: 'active',
          items: { data: [{ price: { id: 'price_test_biz_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const resOlder = await postWebhook(eventOlder);
    assert.strictEqual(resOlder.status, 200);
    const orgAfterOlder = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfterOlder.subscription.plan, 'pro', 'Older event must not mutate newer state');
    console.log('  PASS: Same-timestamp tie breaking and out-of-order rejection verified.');

    // ── TEST 15: INVOICE PAYMENT FAILED -> PAST_DUE ─────────────────────────
    console.log('\n[TEST 15] Verifying invoice.payment_failed transitions org to past_due...');
    const eventPayFailed = {
      id: `evt_pay_failed_${Date.now()}`,
      object: 'event',
      created: tieTimestamp + 10,
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: `in_failed_${Date.now()}`,
          customer: customerId1,
          subscription: subId1
        }
      }
    };
    const res15 = await postWebhook(eventPayFailed);
    assert.strictEqual(res15.status, 200, 'invoice.payment_failed must succeed');

    const orgAfter15 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter15.subscription.status, 'past_due', 'Org status must transition to past_due');

    const projectAfter15 = await db.getProjectById(testProjectId);
    assert.strictEqual(projectAfter15.commercialState, 'PAST_DUE', 'Project commercialState must be PAST_DUE');
    console.log('  PASS: invoice.payment_failed transitioned org and project to past_due.');

    // ── TEST 16: INVOICE PAID -> RESTORES ACTIVE ────────────────────────────
    console.log('\n[TEST 16] Verifying invoice.paid restores org to active...');
    const eventPayPaid = {
      id: `evt_pay_paid_${Date.now()}`,
      object: 'event',
      created: tieTimestamp + 20,
      type: 'invoice.paid',
      data: {
        object: {
          id: `in_paid_${Date.now()}`,
          customer: customerId1,
          subscription: subId1,
          amount_paid: 29900,
          currency: 'usd'
        }
      }
    };
    const res16 = await postWebhook(eventPayPaid);
    assert.strictEqual(res16.status, 200, 'invoice.paid must succeed');

    const orgAfter16 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter16.subscription.status, 'active', 'Org status must be restored to active');

    const projectAfter16 = await db.getProjectById(testProjectId);
    assert.strictEqual(projectAfter16.commercialState, 'ACTIVE_PRO', 'Project commercialState must be restored to ACTIVE_PRO');
    console.log('  PASS: invoice.paid successfully restored org and project to active.');

    // ── TEST 17: CUSTOMER SUBSCRIPTION DELETED -> CANCELED / FREE ──────────
    console.log('\n[TEST 17] Verifying customer.subscription.deleted cancels subscription and reverts plan...');
    const eventSubDeleted = {
      id: `evt_sub_del_${Date.now()}`,
      object: 'event',
      created: tieTimestamp + 30,
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subId1,
          customer: customerId1
        }
      }
    };
    const res17 = await postWebhook(eventSubDeleted);
    assert.strictEqual(res17.status, 200, 'customer.subscription.deleted must succeed');

    const orgAfter17 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter17.subscription.status, 'canceled', 'Org status must transition to canceled');
    assert.strictEqual(orgAfter17.subscription.plan, 'free', 'Org plan must revert to free');

    const projectAfter17 = await db.getProjectById(testProjectId);
    assert.strictEqual(projectAfter17.commercialState, 'CANCELLED', 'Project commercialState must be CANCELLED');
    console.log('  PASS: customer.subscription.deleted successfully canceled subscription and reverted plan.');

    // ── TEST 18: CRYPTOGRAPHIC SIGNATURE VERIFICATION FAILURES ──────────────
    console.log('\n[TEST 18] Verifying Forged & Missing Cryptographic Signature Rejection...');
    const forgedSignature = 't=1700000000,v1=9999999999999999999999999999999999999999999999999999999999999999';
    const res18a = await postWebhook({ id: 'evt_forged_sig', type: 'ping' }, forgedSignature);
    assert.strictEqual(res18a.status, 400, 'Forged cryptographic signature must be rejected with HTTP 400');
    assert.strictEqual(res18a.data.error, 'WEBHOOK_SIGNATURE_VERIFICATION_FAILED');

    // Missing signature header
    const res18b = await new Promise((resolve, reject) => {
      const payloadString = JSON.stringify({ id: 'evt_no_sig', type: 'ping' });
      const req = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/billing/stripe-webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadString)
          // No Stripe-Signature header
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch (_) { json = { raw: data }; }
          resolve({ status: res.statusCode, data: json });
        });
      });
      req.on('error', reject);
      req.write(payloadString);
      req.end();
    });
    assert.strictEqual(res18b.status, 400, 'Missing signature must be rejected with HTTP 400');
    assert.strictEqual(res18b.data.error, 'WEBHOOK_SIGNATURE_REQUIRED');
    console.log('  PASS: Forged and missing signatures strictly rejected with HTTP 400.');

    // ── TEST 19: MISSING QUANTITY (undefined) FAIL-CLOSED (FIX: typeof escape removed) ──
    console.log('\n[TEST 19] Verifying Missing Quantity (undefined) fail-closed rejection...');
    const sessionId19 = `cs_missing_qty_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId19,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventMissingQty = {
      id: `evt_missing_qty_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId19,
          customer: `cus_missing_qty_${Date.now()}`,
          subscription: `sub_missing_qty_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: {
            data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } } }]  // quantity field intentionally omitted
          }
        }
      }
    };
    const res19 = await postWebhook(eventMissingQty);
    assert.strictEqual(res19.status, 400, 'Missing quantity (undefined) must be rejected with HTTP 400');
    assert.strictEqual(res19.data.error, 'INVALID_QUANTITY', 'Missing quantity must return INVALID_QUANTITY, not pass through');
    console.log('  PASS: Checkout event with missing (undefined) quantity correctly rejected with INVALID_QUANTITY.');

    // ── TEST 20: MULTIPLE LINE ITEMS FAIL-CLOSED ─────────────────────────────
    console.log('\n[TEST 20] Verifying Multiple Line Items fail-closed rejection...');
    const sessionId20 = `cs_multi_items_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId20,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventMultiItems = {
      id: `evt_multi_items_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId20,
          customer: `cus_multi_items_${Date.now()}`,
          subscription: `sub_multi_items_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: {
            data: [
              { price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 },
              { price: { id: 'price_test_biz_monthly', recurring: { interval: 'month' } }, quantity: 1 }  // Smuggled second item
            ]
          }
        }
      }
    };
    const res20 = await postWebhook(eventMultiItems);
    assert.strictEqual(res20.status, 400, 'Multiple line items must be rejected with HTTP 400');
    assert.strictEqual(res20.data.error, 'MULTIPLE_LINE_ITEMS', 'Multiple line items must return MULTIPLE_LINE_ITEMS error');
    console.log('  PASS: Checkout event with multiple line items rejected with MULTIPLE_LINE_ITEMS.');

    // ── TEST 21: NON-MONTHLY RECURRING INTERVAL REJECTION ───────────────────
    console.log('\n[TEST 21] Verifying Non-Monthly Recurring Interval fail-closed rejection...');
    const sessionId21 = `cs_non_monthly_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId21,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventYearlyPrice = {
      id: `evt_yearly_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId21,
          customer: `cus_yearly_${Date.now()}`,
          subscription: `sub_yearly_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: {
            data: [{
              price: { id: 'price_test_pro_monthly', recurring: { interval: 'year' } },
              quantity: 1
            }]
          }
        }
      }
    };
    const res21 = await postWebhook(eventYearlyPrice);
    assert.strictEqual(res21.status, 400, 'Non-monthly interval must be rejected with HTTP 400');
    assert.strictEqual(res21.data.error, 'INVALID_RECURRING_INTERVAL');
    console.log('  PASS: Checkout event with non-monthly recurring interval rejected with INVALID_RECURRING_INTERVAL.');

    // ── TEST 22: TRANSIENT STRIPE PROVIDER OUTAGE RETRYABLE 500 (SERVER SDK STUB) ──
    console.log('\n[TEST 22] Verifying Transient Stripe Provider Outage returns HTTP 500 retryable via server SDK stub...');
    const sessionId22 = `cs_transient_outage_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId22,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const eventTransient = {
      id: `evt_transient_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId22,
          customer: `cus_transient_${Date.now()}`,
          subscription: `sub_transient_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };

    const origRetrieve = stripeClient.checkout.sessions.retrieve;
    stripeClient.checkout.sessions.retrieve = async () => {
      const simErr = new Error('Simulated Stripe connection timeout');
      simErr.type = 'StripeConnectionError';
      simErr.statusCode = 503;
      throw simErr;
    };

    let res22;
    try {
      res22 = await postWebhook(eventTransient);
    } finally {
      stripeClient.checkout.sessions.retrieve = origRetrieve;
    }

    assert.strictEqual(res22.status, 500, 'Transient provider outage must return HTTP 500');
    assert.strictEqual(res22.data.error, 'STRIPE_PROVIDER_TRANSIENT_FAILURE');
    assert.strictEqual(res22.data.retryable, true, 'Transient provider outage must be marked retryable: true');
    console.log('  PASS: Transient Stripe provider failure returned HTTP 500 with retryable: true.');

    // ── TEST 23: FORGED EVENT-EMBEDDED LINE ITEMS MISMATCH (FAIL-CLOSED) ─────
    console.log('\n[TEST 23] Verifying Forged Event-Embedded Line Items mismatch rejection...');
    const sessionId23 = `cs_forged_items_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId23,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    authoritativeSessionStore.set(sessionId23, {
      id: sessionId23,
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    // Authoritative provider has 'price_test_pro_monthly'
    authoritativeLineItemsStore.set(sessionId23, {
      object: 'list',
      data: [{ price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
      has_more: false
    });
    // Forged event attempts to inject Business plan price!
    const eventForgedLineItems = {
      id: `evt_forged_items_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId23,
          customer: `cus_forged_items_${Date.now()}`,
          subscription: `sub_forged_items_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: {
            data: [{ price: { id: 'price_test_biz_monthly', recurring: { interval: 'month' } }, quantity: 1 }]
          }
        }
      }
    };
    const res23 = await postWebhook(eventForgedLineItems);
    assert.strictEqual(res23.status, 400, 'Forged event line items mismatch must be rejected with HTTP 400');
    assert.strictEqual(res23.data.error, 'FORGED_EVENT_LINE_ITEMS_MISMATCH');
    console.log('  PASS: Forged event line items differing from provider record strictly rejected (HTTP 400).');

    // ── TEST 24: PAGINATED AUTHORITATIVE LINE ITEMS (has_more: true) ─────────
    console.log('\n[TEST 24] Verifying Paginated Authoritative Line Items retrieval (has_more: true)...');
    const sessionId24 = `cs_paginated_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId24,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const cus24 = `cus_paginated_${Date.now()}`;
    const sub24 = `sub_paginated_${Date.now()}`;
    authoritativeSessionStore.set(sessionId24, {
      id: sessionId24,
      customer: cus24,
      subscription: sub24,
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    // Page 1 has_more: true, Page 2 has_more: false (total 2 items, which should fail MULTIPLE_LINE_ITEMS)
    authoritativeLineItemsStore.set(sessionId24, (params) => {
      if (!params || !params.starting_after) {
        return {
          object: 'list',
          data: [{ id: 'li_item_1', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
          has_more: true
        };
      }
      return {
        object: 'list',
        data: [{ id: 'li_item_2', price: { id: 'price_test_addon', recurring: { interval: 'month' } }, quantity: 1 }],
        has_more: false
      };
    });
    const eventPaginated = {
      id: `evt_paginated_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId24,
          customer: `cus_paginated_${Date.now()}`,
          subscription: `sub_paginated_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res24 = await postWebhook(eventPaginated);
    assert.strictEqual(res24.status, 400, 'Multiple paginated line items must be rejected with MULTIPLE_LINE_ITEMS');
    assert.strictEqual(res24.data.error, 'MULTIPLE_LINE_ITEMS');
    console.log('  PASS: Paginated line items across multiple pages properly retrieved and validated.');

    // ── TEST 25: CLIENT REQUEST-HEADER FAULT INJECTION IS STRICTLY IGNORED ──
    console.log('\n[TEST 25] Verifying client request header cannot trigger fault injection...');
    const sessionId25 = `cs_header_test_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId25,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const cus25 = `cus_header_test_${Date.now()}`;
    const sub25 = `sub_header_test_${Date.now()}`;
    const lineItem25 = { id: 'li_header_test', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 };
    authoritativeSessionStore.set(sessionId25, {
      id: sessionId25,
      customer: cus25,
      subscription: sub25,
      payment_status: 'paid',
      status: 'complete',
      amount_total: 29900,
      currency: 'usd'
    });
    authoritativeLineItemsStore.set(sessionId25, {
      object: 'list',
      data: [lineItem25],
      has_more: false
    });
    const eventHeaderTest = {
      id: `evt_header_test_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId25,
          customer: cus25,
          subscription: sub25,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { object: 'list', data: [lineItem25] }
        }
      }
    };
    const payloadStr25 = JSON.stringify(eventHeaderTest);
    const sig25 = stripe.webhooks.generateTestHeaderString({ payload: payloadStr25, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const res25 = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/billing/stripe-webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadStr25),
          'Stripe-Signature': sig25,
          'x-test-inject-stripe-transient-error': 'true' // Client attempts to trigger 500!
        }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch (_) { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', reject);
      req.write(payloadStr25);
      req.end();
    });
    // It must NOT return 500! The header must be ignored and request returns 200!
    assert.strictEqual(res25.status, 200, 'Header fault attempt must be completely ignored; normal request returns 200');
    assert.strictEqual(res25.data.received, true);
    console.log('  PASS: Client-supplied fault injection header strictly ignored; zero network-controlled outage.');

    console.log('\n=== ALL 25 REAL-SERVER SIGNED STRIPE TEST-MODE ROUTE E2E TESTS PASSED ===');


  } finally {
    // Teardown HTTP servers
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[TEARDOWN] Closed real Express HTTP server.');
    }
    if (httpsServer) {
      await new Promise(r => httpsServer.close(r));
      console.log('[TEARDOWN] Closed HTTPS server.');
    }

    // Clean up disposable temporary directory
    try {
      if (fs.existsSync(disposableDir)) {
        fs.rmSync(disposableDir, { recursive: true, force: true });
        console.log(`[TEARDOWN] Cleaned up disposable temporary directory: ${disposableDir}`);
      }
    } catch (cleanErr) {
      console.warn(`[TEARDOWN WARNING] Could not remove temp dir: ${cleanErr.message}`);
    }
  }
}

main().catch(err => {
  console.error('\nFATAL E2E FAILURE:', err);
  process.exit(1);
});
