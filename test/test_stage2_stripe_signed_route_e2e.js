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
const { server, app, httpsServer, stripeClient, activeSessions } = require('../virtual-tradeshow-commercial-v1/_clean_deploy/server/index');

// Initialize isolated Stripe SDK client for signature generation
const stripe = require('../virtual-tradeshow-commercial-v1/_clean_deploy/node_modules/stripe')(process.env.STRIPE_SECRET_KEY);

// Authoritative mock store for testing server-side authoritative provider retrieval
const authoritativeSessionStore = new Map();
const authoritativeLineItemsStore = new Map();
const authoritativeSubscriptionStore = new Map();
const authoritativeInvoiceStore = new Map();

if (stripeClient) {
  if (stripeClient.checkout && stripeClient.checkout.sessions) {
    stripeClient.checkout.sessions.retrieve = async (id) => {
      if (authoritativeSessionStore.has(id)) {
        const val = authoritativeSessionStore.get(id);
        if (val instanceof Error) throw val;
        return val;
      }
      return { id, status: 'complete', payment_status: 'paid', customer: 'cus_default_test', subscription: 'sub_default_test', mode: 'subscription' };
    };

    stripeClient.checkout.sessions.listLineItems = async (id, params) => {
      if (authoritativeLineItemsStore.has(id)) {
        const entry = authoritativeLineItemsStore.get(id);
        return typeof entry === 'function' ? entry(params) : entry;
      }
      return { object: 'list', data: [], has_more: false };
    };
  }

  if (!stripeClient.subscriptions) stripeClient.subscriptions = {};
  stripeClient.subscriptions.retrieve = async (id) => {
    if (authoritativeSubscriptionStore.has(id)) {
      const val = authoritativeSubscriptionStore.get(id);
      if (val instanceof Error) throw val;
      return val;
    }
    return { id, customer: 'cus_default_test', status: 'active', current_period_end: Math.floor((Date.now() + 86400000) / 1000) };
  };

  if (!stripeClient.invoices) stripeClient.invoices = {};
  stripeClient.invoices.retrieve = async (id) => {
    if (authoritativeInvoiceStore.has(id)) {
      const val = authoritativeInvoiceStore.get(id);
      if (val instanceof Error) throw val;
      return val;
    }
    return { id, customer: 'cus_default_test', subscription: 'sub_default_test', status: 'paid', paid: true };
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

      // Seed accounts for referential integrity testing
      d.accounts = d.accounts || [];
      d.accounts.push({
        id: `acct_${testOrgId}`,
        organizationId: testOrgId,
        email: 'test@example.com',
        planCode: 'FREE_BOOTH'
      });
      d.accounts.push({
        id: `acct_${otherOrgId}`,
        organizationId: otherOrgId,
        email: 'other@example.com',
        planCode: 'FREE_BOOTH'
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
            mode: sess.mode || 'subscription',
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

      if (typeof payloadObject === 'object' && payloadObject.type && payloadObject.type.startsWith('customer.subscription.') && payloadObject.data?.object) {
        const sub = payloadObject.data.object;
        if (sub.id && (!authoritativeSubscriptionStore.has(sub.id) || authoritativeSubscriptionStore.get(sub.id)?._autoSeeded)) {
          authoritativeSubscriptionStore.set(sub.id, {
            id: sub.id,
            customer: sub.customer || 'cus_default_test',
            status: payloadObject.type === 'customer.subscription.deleted' ? 'canceled' : (sub.status || 'active'),
            current_period_end: sub.current_period_end || Math.floor((Date.now() + 86400000) / 1000),
            items: sub.items || { data: [] },
            _autoSeeded: true
          });
        }
      }

      if (typeof payloadObject === 'object' && payloadObject.type && payloadObject.type.startsWith('invoice.') && payloadObject.data?.object) {
        const inv = payloadObject.data.object;
        if (inv.id && (!authoritativeInvoiceStore.has(inv.id) || authoritativeInvoiceStore.get(inv.id)?._autoSeeded)) {
          authoritativeInvoiceStore.set(inv.id, {
            id: inv.id,
            customer: inv.customer || 'cus_default_test',
            subscription: inv.subscription || 'sub_default_test',
            status: payloadObject.type === 'invoice.payment_failed' ? 'open' : (inv.status || 'paid'),
            paid: payloadObject.type === 'invoice.payment_failed' ? false : (inv.paid !== false),
            amount_paid: inv.amount_paid || 29900,
            _autoSeeded: true
          });
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
    const failedInvId = `in_failed_${Date.now()}`;
    authoritativeSubscriptionStore.set(subId1, {
      id: subId1,
      customer: customerId1,
      status: 'past_due'
    });
    authoritativeInvoiceStore.set(failedInvId, {
      id: failedInvId,
      customer: customerId1,
      subscription: subId1,
      status: 'open',
      paid: false
    });
    const eventPayFailed = {
      id: `evt_pay_failed_${Date.now()}`,
      object: 'event',
      created: tieTimestamp + 10,
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: failedInvId,
          customer: customerId1,
          subscription: subId1
        }
      }
    };
    const res15 = await postWebhook(eventPayFailed);
    assert.strictEqual(res15.status, 200, `invoice.payment_failed must succeed: ${JSON.stringify(res15.data)}`);

    const orgAfter15 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter15.subscription.status, 'past_due', 'Org status must transition to past_due');

    const projectAfter15 = await db.getProjectById(testProjectId);
    assert.strictEqual(projectAfter15.commercialState, 'PAST_DUE', 'Project commercialState must be PAST_DUE');
    console.log('  PASS: invoice.payment_failed transitioned org and project to past_due.');

    // ── TEST 16: INVOICE PAID -> RESTORES ACTIVE ────────────────────────────
    console.log('\n[TEST 16] Verifying invoice.paid restores org to active...');
    const paidInvId = `in_paid_${Date.now()}`;
    authoritativeSubscriptionStore.set(subId1, {
      id: subId1,
      customer: customerId1,
      status: 'active'
    });
    authoritativeInvoiceStore.set(paidInvId, {
      id: paidInvId,
      customer: customerId1,
      subscription: subId1,
      status: 'paid',
      paid: true,
      amount_paid: 29900,
      currency: 'usd'
    });
    const eventPayPaid = {
      id: `evt_pay_paid_${Date.now()}`,
      object: 'event',
      created: tieTimestamp + 20,
      type: 'invoice.paid',
      data: {
        object: {
          id: paidInvId,
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
    authoritativeSubscriptionStore.set(subId1, {
      id: subId1,
      customer: customerId1,
      status: 'canceled'
    });
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
    const cus23 = `cus_forged_items_${Date.now()}`;
    const sub23 = `sub_forged_items_${Date.now()}`;
    authoritativeSessionStore.set(sessionId23, {
      id: sessionId23,
      customer: cus23,
      subscription: sub23,
      mode: 'subscription',
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
          customer: cus23,
          subscription: sub23,
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
      mode: 'subscription',
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
          customer: cus24,
          subscription: sub24,
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
      mode: 'subscription',
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

    // ── TEST 26: PROVIDER-ABSENT FAIL-CLOSED ────────────────────────────────
    console.log('\n[TEST 26] Verifying Provider-Absent Fail-Closed (Zero Fallback to Event-Embedded Line Items)...');
    const sessionId26 = `cs_no_provider_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId26,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    // Set provider client to null on app.locals to simulate unconfigured/mismatched Stripe
    app.locals.stripe = null;
    const eventNoProvider = {
      id: `evt_no_provider_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId26,
          customer: `cus_no_provider_${Date.now()}`,
          subscription: `sub_no_provider_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          line_items: { object: 'list', data: [{ id: 'li_embedded', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }] }
        }
      }
    };
    const res26 = await postWebhook(eventNoProvider);
    assert.strictEqual(res26.status, 503, 'Provider-absent webhook must fail-closed with HTTP 503');
    assert.strictEqual(res26.data.error, 'STRIPE_PROVIDER_UNAVAILABLE');
    // Assert ZERO DB state mutation occurred: pending checkout MUST remain PENDING!
    const pending26 = await db.getPendingCheckout(sessionId26);
    assert.strictEqual(pending26.status, 'PENDING', 'Pending checkout must remain PENDING when provider is absent');
    // Restore stripe client on app.locals
    app.locals.stripe = stripeClient;
    console.log('  PASS: Provider-absent commercial checkout strictly rejected (HTTP 503) with zero DB entitlement mutation.');

    // ── TEST 27: INCOMPLETE PROVIDER PAGINATION FAIL-CLOSED ─────────────────
    console.log('\n[TEST 27] Verifying Incomplete Provider Pagination Fail-Closed (Empty Continuation Page)...');
    const sessionId27 = `cs_incomp_page_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId27,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const cus27 = `cus_incomp_${Date.now()}`;
    const sub27 = `sub_incomp_${Date.now()}`;
    authoritativeSessionStore.set(sessionId27, {
      id: sessionId27,
      customer: cus27,
      subscription: sub27,
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    // Page 1 has_more: true, but Page 2 returns empty data: []!
    authoritativeLineItemsStore.set(sessionId27, (params) => {
      if (!params || !params.starting_after) {
        return {
          object: 'list',
          data: [{ id: 'li_page1_item', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
          has_more: true
        };
      }
      return {
        object: 'list',
        data: [], // Provider claims has_more was true, but sends 0 items!
        has_more: false
      };
    });
    const eventIncomp = {
      id: `evt_incomp_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId27,
          customer: cus27,
          subscription: sub27,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res27 = await postWebhook(eventIncomp);
    assert.strictEqual(res27.status, 502, 'Incomplete continuation pagination must return HTTP 502 retryable');
    assert.strictEqual(res27.data.error, 'STRIPE_PAGINATION_EMPTY_CONTINUATION');
    const pending27 = await db.getPendingCheckout(sessionId27);
    assert.strictEqual(pending27.status, 'PENDING', 'Pending checkout must remain PENDING on incomplete pagination');
    console.log('  PASS: Incomplete provider pagination safely rejected (HTTP 502) with zero partial authorization.');

    // ── TEST 28: REPEATED CURSOR LOOP DETECTION FAIL-CLOSED ─────────────────
    console.log('\n[TEST 28] Verifying Repeated Cursor Pagination Loop Detection Fail-Closed...');
    const sessionId28 = `cs_loop_page_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId28,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const cus28 = `cus_loop_${Date.now()}`;
    const sub28 = `sub_loop_${Date.now()}`;
    authoritativeSessionStore.set(sessionId28, {
      id: sessionId28,
      customer: cus28,
      subscription: sub28,
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    // Provider returns same cursor item repeatedly
    authoritativeLineItemsStore.set(sessionId28, (params) => {
      return {
        object: 'list',
        data: [{ id: 'li_stuck_cursor_item', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
        has_more: true
      };
    });
    const eventLoop = {
      id: `evt_loop_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId28,
          customer: cus28,
          subscription: sub28,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res28 = await postWebhook(eventLoop);
    assert.strictEqual(res28.status, 502, 'Repeated cursor pagination loop must return HTTP 502 retryable');
    assert.strictEqual(res28.data.error, 'STRIPE_PAGINATION_REPEATED_CURSOR');
    const pending28 = await db.getPendingCheckout(sessionId28);
    assert.strictEqual(pending28.status, 'PENDING', 'Pending checkout must remain PENDING on loop detection');
    console.log('  PASS: Repeated cursor pagination loop safely detected and aborted (HTTP 502).');

    // ── TEST 29: NON-COMPLETE PROVIDER SESSION STATUS FAIL-CLOSED ───────────
    console.log('\n[TEST 29] Verifying Non-Complete Provider Session Status Fail-Closed...');
    const sessionId29 = `cs_incomplete_status_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId29,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const cus29 = `cus_open_${Date.now()}`;
    const sub29 = `sub_open_${Date.now()}`;
    authoritativeSessionStore.set(sessionId29, {
      id: sessionId29,
      customer: cus29,
      subscription: sub29,
      mode: 'subscription',
      status: 'open', // Non-complete status!
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    authoritativeLineItemsStore.set(sessionId29, {
      object: 'list',
      data: [{ id: 'li_item_open', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
      has_more: false
    });
    const eventOpen = {
      id: `evt_open_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId29,
          customer: cus29,
          subscription: sub29,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res29 = await postWebhook(eventOpen);
    assert.strictEqual(res29.status, 400, 'Non-complete provider session must be rejected with HTTP 400');
    assert.strictEqual(res29.data.error, 'STRIPE_SESSION_NOT_COMPLETE');
    const pending29 = await db.getPendingCheckout(sessionId29);
    assert.strictEqual(pending29.status, 'PENDING');
    console.log('  PASS: Non-complete provider session strictly rejected (HTTP 400 STRIPE_SESSION_NOT_COMPLETE).');

    // ── TEST 30: CUSTOMER / SUBSCRIPTION MISMATCH FAIL-CLOSED ───────────────
    console.log('\n[TEST 30] Verifying Customer / Subscription Mismatch Fail-Closed...');
    const sessionId30 = `cs_mismatch_cus_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId30,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    authoritativeSessionStore.set(sessionId30, {
      id: sessionId30,
      customer: 'cus_provider_real_123',
      subscription: 'sub_provider_real_123',
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    authoritativeLineItemsStore.set(sessionId30, {
      object: 'list',
      data: [{ id: 'li_item_30', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
      has_more: false
    });
    const eventMismatchedCus = {
      id: `evt_mismatch_cus_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId30,
          customer: 'cus_attacker_forged_999', // Mismatched!
          subscription: 'sub_provider_real_123',
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res30 = await postWebhook(eventMismatchedCus);
    assert.strictEqual(res30.status, 400, 'Customer mismatch must be rejected with HTTP 400');
    assert.strictEqual(res30.data.error, 'STRIPE_CUSTOMER_MISMATCH');
    const pending30 = await db.getPendingCheckout(sessionId30);
    assert.strictEqual(pending30.status, 'PENDING');
    console.log('  PASS: Forged event customer mismatch strictly rejected (HTTP 400 STRIPE_CUSTOMER_MISMATCH).');

    // ── TEST 31: METADATA FORGERY OVERRIDE DETECTION FAIL-CLOSED ────────────
    console.log('\n[TEST 31] Verifying Metadata Forgery Override Detection Fail-Closed...');
    const sessionId31 = `cs_meta_forgery_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId31,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    const cus31 = `cus_meta_${Date.now()}`;
    const sub31 = `sub_meta_${Date.now()}`;
    authoritativeSessionStore.set(sessionId31, {
      id: sessionId31,
      customer: cus31,
      subscription: sub31,
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd',
      metadata: { organizationId: otherOrgId, authorized: 'true' }
    });
    authoritativeLineItemsStore.set(sessionId31, {
      object: 'list',
      data: [{ id: 'li_item_31', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
      has_more: false
    });
    const eventForgedMeta31 = {
      id: `evt_forged_meta_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId31,
          customer: cus31,
          subscription: sub31,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd',
          metadata: { organizationId: 'org_attacker_takeover_corp', authorized: 'true' } // Attempt to redirect org!
        }
      }
    };
    const res31 = await postWebhook(eventForgedMeta31);
    assert.strictEqual(res31.status, 400, 'Metadata forgery attempt must be rejected with HTTP 400');
    assert.strictEqual(res31.data.error, 'METADATA_FORGERY_DETECTED');
    const pending31 = await db.getPendingCheckout(sessionId31);
    assert.strictEqual(pending31.status, 'PENDING');
    console.log('  PASS: Event metadata discrepancy detected and strictly rejected (HTTP 400 METADATA_FORGERY_DETECTED).');

    // ── TEST 32: PLATFORM OWNER ADMIN GRANT ROUTES & PROVENANCE ──────────────
    console.log('\n[TEST 32] Verifying Platform Owner Admin Grant Routes & Provenance...');
    const ownerToken = `tok_owner_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const unauthViewerToken = `tok_viewer_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    activeSessions.set(ownerToken, {
      userId: 'user_owner_root',
      username: 'root_platform_owner',
      role: 'platform_owner',
      organizationId: testOrgId,
      createdAt: Date.now()
    });
    activeSessions.set(unauthViewerToken, {
      userId: 'user_viewer_unpriv',
      username: 'guest_viewer',
      role: 'viewer',
      organizationId: testOrgId,
      createdAt: Date.now()
    });

    // Subtest 32a: Unauthenticated / Non-Owner Access Denied
    const unprivRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: serverPort, path: '/api/admin/pilot-grants', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${unauthViewerToken}` }
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ organizationId: testOrgId, pilotExpiresAt: new Date(Date.now() + 86400000).toISOString() }));
      req.end();
    });
    assert.strictEqual(unprivRes.status, 403, 'Non-owner must be forbidden from issuing grants (HTTP 403)');

    // Subtest 32b: Platform Owner Successfully Issues Pilot Grant
    const ownerIssueRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: serverPort, path: '/api/admin/pilot-grants', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` }
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ organizationId: testOrgId, isOrgWide: true, pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(), notes: 'Audited owner pilot' }));
      req.end();
    });
    assert.strictEqual(ownerIssueRes.status, 201, `Owner must successfully issue grant (HTTP 201): ${JSON.stringify(ownerIssueRes.json)}`);
    const issuedGrantId = ownerIssueRes.json.grant.grantId;
    assert.ok(issuedGrantId.startsWith('grant_pilot_'));
    assert.strictEqual(ownerIssueRes.json.grant.status, 'active');

    // Subtest 32c: Missing Status or Non-Active Status Fails Closed in Predicate
    const mockProjectForGrant = { id: 'prj_test_grant_check', organizationId: testOrgId };
    assert.strictEqual(db.verifyPilotGrant(mockProjectForGrant), true, 'Active grant must pass verification');
    // Mutate grant status to undefined (simulate corrupted/tampered record)
    await db.mutate(d => {
      const g = d.pilotGrants.find(i => i.grantId === issuedGrantId);
      delete g.status;
    });
    assert.strictEqual(db.verifyPilotGrant(mockProjectForGrant), false, 'Grant missing status MUST fail closed');
    // Restore status to active
    await db.mutate(d => {
      const g = d.pilotGrants.find(i => i.grantId === issuedGrantId);
      g.status = 'active';
    });
    assert.strictEqual(db.verifyPilotGrant(mockProjectForGrant), true);

    // Subtest 32d: Platform Owner Revokes Pilot Grant via Route
    const revokeRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: serverPort, path: `/api/admin/pilot-grants/${issuedGrantId}`, method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ownerToken}` }
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d) }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(revokeRes.status, 200, 'Owner must successfully revoke grant (HTTP 200)');
    assert.strictEqual(revokeRes.json.grant.status, 'revoked');
    assert.strictEqual(db.verifyPilotGrant(mockProjectForGrant), false, 'Revoked grant must strictly fail verification');

    // Subtest 32e: Platform Owner Legacy Grant Issuance & Revocation
    const legacyIssueRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: serverPort, path: '/api/admin/legacy-grants', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` }
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ organizationId: testOrgId, accountId: `acct_${testOrgId}`, notes: 'Owner legacy grandfather' }));
      req.end();
    });
    assert.strictEqual(legacyIssueRes.status, 201);
    const legacyGrantId = legacyIssueRes.json.grant.grantId;
    assert.ok(legacyGrantId.startsWith('grant_leg_'));

    console.log('  PASS: Platform owner grant routes and provenance verification strictly enforced.');

    // ── TEST 33: AUTHORITATIVE PROVIDER RETRIEVAL FOR SUBSCRIPTION UPDATES ────
    console.log('\n[TEST 33] Verifying Authoritative Provider Retrieval on Subscription Updates...');
    const subId33 = `sub_auth_retrieve_${Date.now()}`;
    const cusId33 = `cus_auth_retrieve_${Date.now()}`;
    authoritativeSubscriptionStore.set(subId33, {
      id: subId33,
      customer: cusId33,
      status: 'active',
      current_period_end: Math.floor((Date.now() + 86400000) / 1000),
      items: { data: [{ price: { id: 'price_test_pro_monthly' } }] }
    });
    await db.mutate(d => {
      d.organizations.push({
        id: `org_sub_test_${Date.now()}`,
        name: 'Sub Test Org',
        status: 'active',
        subscription: {
          stripeSubscriptionId: subId33,
          stripeCustomerId: cusId33,
          status: 'incomplete',
          plan: 'pro'
        }
      });
    });
    const subEvent33 = {
      id: `evt_sub_auth_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId33,
          customer: cusId33,
          status: 'incomplete'
        }
      }
    };
    const res33 = await postWebhook(subEvent33);
    assert.strictEqual(res33.status, 200, 'Subscription update with authoritative retrieval must succeed');
    console.log('  PASS: Authoritative provider subscription retrieval verified.');

    // ── TEST 34: FORGED SUBSCRIPTION CUSTOMER MISMATCH REJECTION ────────────
    console.log('\n[TEST 34] Verifying Forged Subscription Customer Mismatch Rejection...');
    const subId34 = `sub_forged_cus_${Date.now()}`;
    const realCus34 = `cus_real_${Date.now()}`;
    authoritativeSubscriptionStore.set(subId34, {
      id: subId34,
      customer: realCus34,
      status: 'active'
    });
    const forgedSubEvent = {
      id: `evt_sub_forged_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId34,
          customer: 'cus_attacker_injected',
          status: 'active'
        }
      }
    };
    const res34 = await postWebhook(forgedSubEvent);
    assert.strictEqual(res34.status, 400, 'Forged subscription customer mismatch must be rejected with HTTP 400');
    assert.strictEqual(res34.data.error, 'STRIPE_CUSTOMER_MISMATCH');
    console.log('  PASS: Forged subscription customer mismatch rejected (HTTP 400 STRIPE_CUSTOMER_MISMATCH).');

    // ── TEST 35: AUTHORITATIVE PROVIDER RETRIEVAL FOR INVOICE EVENTS ─────────
    console.log('\n[TEST 35] Verifying Authoritative Provider Retrieval for Invoice Events...');
    const invId35 = `in_auth_test_${Date.now()}`;
    const subId35 = `sub_inv_test_${Date.now()}`;
    const cusId35 = `cus_inv_test_${Date.now()}`;
    await db.mutate(d => {
      d.organizations.push({
        id: `org_inv_test_${Date.now()}`,
        name: 'Inv Test Org',
        status: 'past_due',
        subscription: {
          stripeSubscriptionId: subId35,
          stripeCustomerId: cusId35,
          status: 'past_due',
          plan: 'pro'
        }
      });
    });
    authoritativeInvoiceStore.set(invId35, {
      id: invId35,
      customer: cusId35,
      subscription: subId35,
      status: 'paid',
      paid: true,
      amount_paid: 29900
    });
    authoritativeSubscriptionStore.set(subId35, {
      id: subId35,
      customer: cusId35,
      status: 'active'
    });
    const invEvent35 = {
      id: `evt_inv_paid_${Date.now()}`,
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: {
          id: invId35,
          customer: cusId35,
          subscription: subId35,
          status: 'paid'
        }
      }
    };
    const res35 = await postWebhook(invEvent35);
    assert.strictEqual(res35.status, 200, 'Invoice paid with authoritative provider retrieval must succeed');
    console.log('  PASS: Authoritative provider invoice retrieval verified.');

    // ── TEST 36: FORGED INVOICE NOT PAID & IDENTITY MISMATCH REJECTION ──────
    console.log('\n[TEST 36] Verifying Forged Invoice Mismatch & Unpaid Status Rejection...');
    const invId36 = `in_unpaid_test_${Date.now()}`;
    authoritativeInvoiceStore.set(invId36, {
      id: invId36,
      customer: 'cus_provider_36',
      subscription: 'sub_provider_36',
      status: 'open',
      paid: false
    });
    const forgedPaidEvent = {
      id: `evt_forged_inv_${Date.now()}`,
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: {
          id: invId36,
          customer: 'cus_provider_36',
          subscription: 'sub_provider_36',
          status: 'paid'
        }
      }
    };
    const res36 = await postWebhook(forgedPaidEvent);
    assert.strictEqual(res36.status, 400, 'Unpaid invoice claimed as paid must be rejected with HTTP 400');
    assert.strictEqual(res36.data.error, 'STRIPE_INVOICE_NOT_PAID');
    console.log('  PASS: Forged un-paid invoice event rejected (HTTP 400 STRIPE_INVOICE_NOT_PAID).');

    // ── TEST 37: TRANSIENT PROVIDER FAILURE RETURNS HTTP 500 RETRYABLE ───────
    console.log('\n[TEST 37] Verifying Transient Provider Failure Returns Retryable HTTP 500...');
    const subId37 = `sub_transient_${Date.now()}`;
    const transientErr = new Error('Connection refused to Stripe API');
    transientErr.type = 'StripeConnectionError';
    authoritativeSubscriptionStore.set(subId37, transientErr);
    const transientEvent = {
      id: `evt_transient_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subId37,
          customer: 'cus_transient',
          status: 'active'
        }
      }
    };
    const res37 = await postWebhook(transientEvent);
    assert.strictEqual(res37.status, 500, 'Transient provider error must return HTTP 500');
    assert.strictEqual(res37.data.retryable, true, 'Transient provider error response must be retryable');
    console.log('  PASS: Transient provider failure properly returned HTTP 500 retryable.');

    // ── TEST 38: GRANT REFERENTIAL INTEGRITY ENFORCEMENT ────────────────────
    console.log('\n[TEST 38] Verifying Grant Referential Integrity Enforcement...');
    // Attempt 1: Non-existent organization
    await assert.rejects(
      async () => {
        await db.issuePilotGrant({
          organizationId: 'org_non_existent_fake_id',
          pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(),
          approvedBy: 'owner_user'
        });
      },
      /REFERENTIAL_INTEGRITY_VIOLATION/,
      'Grant issuance with non-existent org must fail referential integrity'
    );

    // Attempt 2: Project belonging to a different organization
    await assert.rejects(
      async () => {
        await db.issuePilotGrant({
          organizationId: testOrgId,
          projectId: otherProjectId,
          pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(),
          approvedBy: 'owner_user'
        });
      },
      /REFERENTIAL_INTEGRITY_VIOLATION/,
      'Grant issuance with cross-org project must fail referential integrity'
    );
    console.log('  PASS: Grant referential integrity strictly enforced.');

    // ── TEST 39: IMMUTABLE GRANT AUDIT TRAIL VERIFICATION ───────────────────
    console.log('\n[TEST 39] Verifying Immutable Grant Audit Trail Recording...');
    const auditOrgId = testOrgId;
    const testPilotGrant = await db.issuePilotGrant({
      organizationId: auditOrgId,
      pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      approvedBy: 'audit_test_owner',
      createdBy: 'audit_test_owner',
      isOrgWide: true
    });
    await db.revokePilotGrant(testPilotGrant.grantId, 'audit_revoker');

    const dbSnapshot = await db.read();
    assert.ok(Array.isArray(dbSnapshot.grantAuditTrail), 'grantAuditTrail must be an array');
    const issueEntry = dbSnapshot.grantAuditTrail.find(e => e.grantId === testPilotGrant.grantId && e.action === 'ISSUED');
    const revokeEntry = dbSnapshot.grantAuditTrail.find(e => e.grantId === testPilotGrant.grantId && e.action === 'REVOKED');
    assert.ok(issueEntry, 'Audit trail must contain ISSUED entry');
    assert.strictEqual(issueEntry.organizationId, auditOrgId);
    assert.strictEqual(issueEntry.actor, 'audit_test_owner');
    assert.ok(revokeEntry, 'Audit trail must contain REVOKED entry');
    assert.strictEqual(revokeEntry.actor, 'audit_revoker');
    console.log('  PASS: Immutable grant audit trail records verified on issuance and revocation.');

    // ── TEST 40: DELAYED INVOICE.PAYMENT_FAILED ON ALREADY PAID INVOICE RECONCILIATION ───
    console.log('\n[TEST 40] Verifying Delayed invoice.payment_failed on Already Paid Invoice Acknowledgment...');
    const invId40 = `in_delayed_fail_${Date.now()}`;
    const subId40 = `sub_delayed_fail_${Date.now()}`;
    const cusId40 = `cus_delayed_fail_${Date.now()}`;
    authoritativeInvoiceStore.set(invId40, {
      id: invId40,
      customer: cusId40,
      subscription: subId40,
      status: 'paid',
      paid: true,
      amount_paid: 29900
    });
    const delayedFailedEvent = {
      id: `evt_delayed_fail_${Date.now()}`,
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: invId40,
          customer: cusId40,
          subscription: subId40,
          status: 'open',
          paid: false
        }
      }
    };
    const res40 = await postWebhook(delayedFailedEvent);
    assert.strictEqual(res40.status, 200, 'Delayed invoice.payment_failed on paid invoice must return HTTP 200 NOOP');
    assert.strictEqual(res40.data.status, 'NOOP_STALE_PAYMENT_FAILURE');
    assert.strictEqual(res40.data.reason, 'INVOICE_ALREADY_PAID');
    console.log('  PASS: Delayed invoice.payment_failed safely acknowledged as NOOP on already paid invoice.');

    // ── TEST 41: STALE CUSTOMER.SUBSCRIPTION.DELETED ON ACTIVE SUBSCRIPTION REJECTION ──
    console.log('\n[TEST 41] Verifying Stale customer.subscription.deleted on Active Subscription Rejection...');
    const subId41 = `sub_active_not_del_${Date.now()}`;
    const cusId41 = `cus_active_not_del_${Date.now()}`;
    authoritativeSubscriptionStore.set(subId41, {
      id: subId41,
      customer: cusId41,
      status: 'active', // Provider authoritative status is active, NOT canceled
      current_period_end: Math.floor((Date.now() + 86400000) / 1000)
    });
    const staleDeletedEvent = {
      id: `evt_stale_del_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subId41,
          customer: cusId41,
          status: 'canceled'
        }
      }
    };
    const res41 = await postWebhook(staleDeletedEvent);
    assert.strictEqual(res41.status, 400, 'Stale customer.subscription.deleted on active sub must be rejected with HTTP 400');
    assert.strictEqual(res41.data.error, 'STRIPE_SUBSCRIPTION_NOT_CANCELED');
    console.log('  PASS: Stale customer.subscription.deleted rejected on active subscription (STRIPE_SUBSCRIPTION_NOT_CANCELED).');

    // ── TEST 42: CHECKOUT.SESSION.COMPLETED EVENT INTEGRITY AND MODE REJECTION ──
    console.log('\n[TEST 42] Verifying checkout.session.completed Event Integrity & Mode Rejection...');
    const sessId42A = `cs_mode_test_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessId42A,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    // Mode is payment (one-time) instead of subscription
    authoritativeSessionStore.set(sessId42A, {
      id: sessId42A,
      customer: 'cus_mode_test',
      subscription: 'sub_mode_test',
      mode: 'payment', // Non-subscription mode!
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    authoritativeLineItemsStore.set(sessId42A, {
      object: 'list',
      data: [{ id: 'li_mode', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
      has_more: false
    });
    const eventMode = {
      id: `evt_mode_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessId42A,
          customer: 'cus_mode_test',
          subscription: 'sub_mode_test',
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res42A = await postWebhook(eventMode);
    assert.strictEqual(res42A.status, 400, 'Non-subscription checkout mode must be rejected with HTTP 400');
    assert.strictEqual(res42A.data.error, 'STRIPE_INVALID_CHECKOUT_MODE');

    // Event missing customer field
    const sessId42B = `cs_no_cus_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessId42B,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    authoritativeSessionStore.set(sessId42B, {
      id: sessId42B,
      customer: 'cus_has_one',
      subscription: 'sub_has_one',
      mode: 'subscription',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    authoritativeLineItemsStore.set(sessId42B, {
      object: 'list',
      data: [{ id: 'li_no_cus', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
      has_more: false
    });
    const eventNoCus = {
      id: `evt_no_cus_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessId42B,
          subscription: 'sub_has_one',
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res42B = await postWebhook(eventNoCus);
    assert.strictEqual(res42B.status, 400, 'Event missing customer must be rejected with HTTP 400');
    assert.strictEqual(res42B.data.error, 'STRIPE_EVENT_CUSTOMER_REQUIRED');
    console.log('  PASS: checkout.session.completed mode and mandatory fields strictly enforced.');

    // ── TEST 43: STRICT GRANT REFERENTIAL INTEGRITY (REJECT UNBOUND TARGET SCOPE) ──
    console.log('\n[TEST 43] Verifying Strict Grant Referential Integrity on Unbound Targets...');
    // Seed project without organizationId
    const unparentedProjectId = `proj_unparented_${Date.now()}`;
    await db.mutate(d => {
      d.projects.push({
        id: unparentedProjectId,
        name: 'Unparented Project',
        commercialState: 'FREE_TRIAL'
        // organizationId intentionally omitted/undefined!
      });
    });
    await assert.rejects(
      async () => {
        await db.issuePilotGrant({
          organizationId: testOrgId,
          projectId: unparentedProjectId,
          pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(),
          approvedBy: 'owner_user'
        });
      },
      /REFERENTIAL_INTEGRITY_VIOLATION/,
      'Grant issuance on unparented project without organizationId must fail referential integrity'
    );

    // Org-wide grant (no projectId, no accountId) succeeds with correct targetScope
    const orgWideGrant = await db.issuePilotGrant({
      organizationId: testOrgId,
      pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      approvedBy: 'owner_user',
      isOrgWide: true
    });
    assert.strictEqual(orgWideGrant.targetScope, `org:${testOrgId}`);
    console.log('  PASS: Strict grant referential integrity rejects unparented targets and allows org-wide.');

    // ── TEST 44: TAMPER-EVIDENT SHA-256 HASH-CHAINED GRANT AUDIT TRAIL ──────
    console.log('\n[TEST 44] Verifying Tamper-Evident SHA-256 Hash-Chained Grant Audit Trail...');
    const integrityBefore = db.verifyGrantAuditTrailIntegrity();
    assert.strictEqual(integrityBefore.valid, true, 'Audit trail must be valid before tampering');
    assert.ok(integrityBefore.count > 0, 'Audit trail must contain entries');

    // Simulate tampering with an audit trail entry
    const originalActor44 = (await db.read()).grantAuditTrail[0].actor;
    await db.mutate(d => {
      if (d.grantAuditTrail && d.grantAuditTrail.length > 0) {
        d.grantAuditTrail[0].actor = 'mallory_forged_actor';
      }
    });

    const integrityAfterTamper = db.verifyGrantAuditTrailIntegrity();
    assert.strictEqual(integrityAfterTamper.valid, false, 'Audit trail must detect tampering');
    assert.ok(integrityAfterTamper.error.includes('HASH_TAMPERED'), 'Tamper error must be HASH_TAMPERED');
    console.log('  PASS: SHA-256 hash-chain integrity verification detects tampered entries.');

    // Restore audit trail integrity so subsequent tests run on valid state
    await db.mutate(d => {
      if (d.grantAuditTrail && d.grantAuditTrail.length > 0) {
        d.grantAuditTrail[0].actor = originalActor44;
      }
    });

    // ── TEST 45: DELAYED INVOICE.PAYMENT_FAILED ON ACTIVE NEWER SUBSCRIPTION PERIOD ─
    console.log('\n[TEST 45] Verifying Delayed invoice.payment_failed for Older Period on Active Subscription...');
    const invId45 = `in_older_cycle_${Date.now()}`;
    const subId45 = `sub_active_new_cycle_${Date.now()}`;
    const cusId45 = `cus_active_new_cycle_${Date.now()}`;
    const nowSec45 = Math.floor(Date.now() / 1000);
    // Active subscription in current period
    authoritativeSubscriptionStore.set(subId45, {
      id: subId45,
      customer: cusId45,
      status: 'active',
      current_period_start: nowSec45 - 86400, // started 1 day ago
      current_period_end: nowSec45 + (29 * 86400),
      latest_invoice: `in_latest_active_${Date.now()}`
    });
    // Older invoice from previous cycle
    authoritativeInvoiceStore.set(invId45, {
      id: invId45,
      customer: cusId45,
      subscription: subId45,
      status: 'open',
      paid: false,
      period_start: nowSec45 - (31 * 86400),
      period_end: nowSec45 - (2 * 86400) // ended 2 days ago, before current_period_start
    });
    const delayedOldCycleEvent = {
      id: `evt_old_cycle_fail_${Date.now()}`,
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: invId45,
          customer: cusId45,
          subscription: subId45,
          status: 'open',
          paid: false
        }
      }
    };
    const res45 = await postWebhook(delayedOldCycleEvent);
    assert.strictEqual(res45.status, 200, 'Older cycle payment failure on active subscription must return HTTP 200');
    assert.strictEqual(res45.data.status, 'NOOP_STALE_PAYMENT_FAILURE');
    assert.strictEqual(res45.data.reason, 'SUPERSEDED_BY_ACTIVE_PERIOD');
    console.log('  PASS: Delayed payment failure for older cycle on active subscription safely NOOPed without demotion.');

    // ── TEST 46: CHECKOUT SESSION STRICT NON-CONDITIONAL MODE ENFORCEMENT ─────
    console.log('\n[TEST 46] Verifying Checkout Session Strict Non-Conditional Mode Enforcement...');
    const sessId46 = `cs_missing_mode_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessId46,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING'
    });
    authoritativeSessionStore.set(sessId46, {
      id: sessId46,
      customer: 'cus_mode_missing',
      subscription: 'sub_mode_missing',
      // mode intentionally omitted / undefined
      status: 'complete',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'usd'
    });
    authoritativeLineItemsStore.set(sessId46, {
      object: 'list',
      data: [{ id: 'li_mode_missing', price: { id: 'price_test_pro_monthly', recurring: { interval: 'month' } }, quantity: 1 }],
      has_more: false
    });
    const eventMissingMode = {
      id: `evt_missing_mode_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessId46,
          customer: 'cus_mode_missing',
          subscription: 'sub_mode_missing',
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res46 = await postWebhook(eventMissingMode);
    assert.strictEqual(res46.status, 400, 'Checkout session with missing mode must be rejected with HTTP 400');
    assert.strictEqual(res46.data.error, 'STRIPE_INVALID_CHECKOUT_MODE');
    console.log('  PASS: Missing checkout mode strictly rejected (HTTP 400 STRIPE_INVALID_CHECKOUT_MODE).');

    // ── TEST 47: INVOICE EVENTS MANDATORY SUBSCRIPTION FIELD ENFORCEMENT ─────
    console.log('\n[TEST 47] Verifying Invoice Events Mandatory Subscription Field Enforcement...');
    const invId47 = `in_no_sub_${Date.now()}`;
    const cusId47 = `cus_no_sub_${Date.now()}`;
    authoritativeInvoiceStore.set(invId47, {
      id: invId47,
      customer: cusId47,
      subscription: 'sub_has_sub_47',
      status: 'paid',
      paid: true,
      amount_paid: 29900,
      currency: 'usd'
    });
    const eventNoSub = {
      id: `evt_no_sub_${Date.now()}`,
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: {
          id: invId47,
          customer: cusId47,
          // subscription omitted from event!
          status: 'paid',
          paid: true,
          amount_paid: 29900,
          currency: 'usd'
        }
      }
    };
    const res47 = await postWebhook(eventNoSub);
    assert.strictEqual(res47.status, 400, 'Invoice event missing subscription must be rejected with HTTP 400');
    assert.strictEqual(res47.data.error, 'STRIPE_EVENT_SUBSCRIPTION_REQUIRED');
    console.log('  PASS: Invoice event missing subscription strictly rejected (HTTP 400 STRIPE_EVENT_SUBSCRIPTION_REQUIRED).');

    // ── TEST 48: DUAL-TARGET GRANT SCOPE AND ROOT ANCHOR VERIFICATION ───────
    console.log('\n[TEST 48] Verifying Dual-Target Grant Scope and Detached Root Anchor...');
    const testAccId48 = `acc_dual_${Date.now()}`;
    await db.mutate(d => {
      d.accounts = d.accounts || [];
      d.accounts.push({
        id: testAccId48,
        organizationId: testOrgId,
        email: 'dual_target@example.com',
        role: 'member'
      });
    });
    const dualGrant = await db.issuePilotGrant({
      organizationId: testOrgId,
      projectId: testProjectId,
      accountId: testAccId48,
      pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      approvedBy: 'owner_dual_test'
    });
    assert.strictEqual(dualGrant.targetScope, `project:${testProjectId}+account:${testAccId48}`, 'Dual-target grant must record project+account scope');

    const integrityDual = db.verifyGrantAuditTrailIntegrity();
    assert.strictEqual(integrityDual.valid, true, 'Audit trail with dual-target grant and root anchor must be valid');
    console.log('  PASS: Dual-target grant correctly recorded project+account scope and root anchor verified.');

    // ── TEST 49: DETACHED ROOT ANCHOR DETECTS EXTERNAL REWRITE TAMPERING ───
    console.log('\n[TEST 49] Verifying Detached Root Anchor Detects External Rewrite Tampering...');
    const rootAnchorPath = path.join(disposableDir, 'grant_audit_root_anchor.json');
    assert.ok(fs.existsSync(rootAnchorPath), 'grant_audit_root_anchor.json must exist');
    const rootAnchorOriginal = fs.readFileSync(rootAnchorPath, 'utf8');
    const parsedAnchor = JSON.parse(rootAnchorOriginal);

    // Tamper with root anchor
    const tamperedAnchor = { ...parsedAnchor, lastEntryHash: '0000000000000000000000000000000000000000000000000000000000000000' };
    fs.writeFileSync(rootAnchorPath, JSON.stringify(tamperedAnchor, null, 2), 'utf8');

    const integrityTamperedRoot = db.verifyGrantAuditTrailIntegrity();
    assert.strictEqual(integrityTamperedRoot.valid, false, 'Audit trail must fail verification if root anchor is tampered');
    assert.ok(integrityTamperedRoot.error.includes('AUDIT_ROOT_ANCHOR_MISMATCH'), 'Error must report AUDIT_ROOT_ANCHOR_MISMATCH');

    // Restore root anchor
    fs.writeFileSync(rootAnchorPath, rootAnchorOriginal, 'utf8');
    const integrityRestoredRoot = db.verifyGrantAuditTrailIntegrity();
    assert.strictEqual(integrityRestoredRoot.valid, true, 'Audit trail verification must pass after restoring root anchor');
    console.log('  PASS: Detached root anchor successfully detects external rewrite tampering.');

    // ── TEST 50: PROVIDER NULL/404 SUBSCRIPTION ON INVOICE.PAYMENT_FAILED FAILS CLOSED ───
    console.log('\n[TEST 50] Verifying Provider Null/404 Subscription on invoice.payment_failed Fails Closed...');
    const subId50 = `sub_null_test_${Date.now()}`;
    const cusId50 = `cus_null_test_${Date.now()}`;
    const invId50 = `in_null_test_${Date.now()}`;
    const orgId50 = `org_null_test_${Date.now()}`;

    await db.mutate(d => {
      d.organizations.push({
        id: orgId50,
        name: 'Active Org Null Sub Test',
        subscription: {
          stripeSubscriptionId: subId50,
          stripeCustomerId: cusId50,
          status: 'active',
          plan: 'pro'
        }
      });
      d.projects.push({
        id: `prj_${orgId50}`,
        organizationId: orgId50,
        commercialState: 'ACTIVE_PRO'
      });
    });

    authoritativeInvoiceStore.set(invId50, {
      id: invId50,
      customer: cusId50,
      subscription: subId50,
      status: 'open',
      paid: false
    });
    // Simulate 404 / missing subscription on Stripe provider
    const notFoundErr = new Error('No such subscription');
    notFoundErr.statusCode = 404;
    authoritativeSubscriptionStore.set(subId50, notFoundErr);

    const failClosedEvent = {
      id: `evt_fail_closed_sub_${Date.now()}`,
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: invId50,
          customer: cusId50,
          subscription: subId50
        }
      }
    };
    const res50 = await postWebhook(failClosedEvent);
    assert.strictEqual(res50.status, 502, 'Provider 404 on subscription during payment failure must fail closed with HTTP 502');
    assert.strictEqual(res50.data.error, 'STRIPE_SUBSCRIPTION_UNAVAILABLE_FOR_DEMOTION');

    // Tenant must NOT be demoted!
    const orgAfter50 = db.getOrganizationById(orgId50);
    assert.strictEqual(orgAfter50.subscription.status, 'active', 'Tenant must NOT be demoted when provider subscription is unavailable');
    const prjAfter50 = await db.getProjectById(`prj_${orgId50}`);
    assert.strictEqual(prjAfter50.commercialState, 'ACTIVE_PRO', 'Project commercialState must remain active');
    console.log('  PASS: Provider 404/null subscription on payment failure failed closed (HTTP 502) with zero tenant demotion.');

    // ── TEST 51: MISSING DETACHED ROOT ANCHOR WITH NON-EMPTY TRAIL FAILS CLOSED ──────────
    console.log('\n[TEST 51] Verifying Missing Detached Root Anchor with Non-Empty Trail Fails Closed...');
    const rootAnchorBackupPath = rootAnchorPath + '.bak';
    fs.renameSync(rootAnchorPath, rootAnchorBackupPath);

    const integrityMissingRoot = db.verifyGrantAuditTrailIntegrity();
    assert.strictEqual(integrityMissingRoot.valid, false, 'Integrity check must fail when root anchor is missing');
    assert.strictEqual(integrityMissingRoot.error, 'AUDIT_ROOT_ANCHOR_MISSING', 'Error must be AUDIT_ROOT_ANCHOR_MISSING');

    // Restore root anchor
    fs.renameSync(rootAnchorBackupPath, rootAnchorPath);
    const integrityRestoredAgain = db.verifyGrantAuditTrailIntegrity();
    assert.strictEqual(integrityRestoredAgain.valid, true, 'Integrity check must pass when root anchor is restored');
    console.log('  PASS: Missing detached root anchor strictly fails closed (AUDIT_ROOT_ANCHOR_MISSING).');

    // ── TEST 52: DELAYED INVOICE.PAID ON CANCELED SUBSCRIPTION DOES NOT REINSTATE ─────────
    console.log('\n[TEST 52] Verifying Delayed invoice.paid on Canceled Subscription NOOPs and Does Not Reinstate...');
    const subId52 = `sub_canceled_${Date.now()}`;
    const cusId52 = `cus_canceled_${Date.now()}`;
    const invId52 = `in_delayed_paid_${Date.now()}`;
    const orgId52 = `org_canceled_test_${Date.now()}`;

    await db.mutate(d => {
      d.organizations.push({
        id: orgId52,
        name: 'Canceled Org Test',
        subscription: {
          stripeSubscriptionId: subId52,
          stripeCustomerId: cusId52,
          status: 'canceled',
          plan: 'free'
        }
      });
      d.projects.push({
        id: `prj_${orgId52}`,
        organizationId: orgId52,
        commercialState: 'CANCELLED'
      });
    });

    authoritativeInvoiceStore.set(invId52, {
      id: invId52,
      customer: cusId52,
      subscription: subId52,
      status: 'paid',
      paid: true,
      amount_paid: 29900,
      currency: 'usd'
    });
    authoritativeSubscriptionStore.set(subId52, {
      id: subId52,
      customer: cusId52,
      status: 'canceled'
    });

    const delayedPaidEvent = {
      id: `evt_delayed_paid_canceled_${Date.now()}`,
      object: 'event',
      type: 'invoice.paid',
      data: {
        object: {
          id: invId52,
          customer: cusId52,
          subscription: subId52,
          amount_paid: 29900,
          currency: 'usd'
        }
      }
    };
    const res52 = await postWebhook(delayedPaidEvent);
    assert.strictEqual(res52.status, 200, 'Delayed paid invoice on canceled sub must return HTTP 200 NOOP');
    assert.strictEqual(res52.data.status, 'NOOP_STALE_PAID_INVOICE');
    assert.strictEqual(res52.data.reason, 'SUBSCRIPTION_ALREADY_CANCELED');

    const orgAfter52 = db.getOrganizationById(orgId52);
    assert.strictEqual(orgAfter52.subscription.status, 'canceled', 'Canceled org must NOT be reinstated by delayed paid invoice');
    assert.strictEqual(orgAfter52.subscription.plan, 'free');
    console.log('  PASS: Delayed invoice.paid on canceled subscription acknowledged as NOOP without entitlement reinstatement.');

    // ── TEST 53: ADMIN GRANT CREATION WITHOUT TARGETS AND WITHOUT ISORGWIDE REJECTED ─────
    console.log('\n[TEST 53] Verifying Admin Grant Creation Without Targets and Without Explicit isOrgWide is Rejected...');
    const pilotNoTargetRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: serverPort, path: '/api/admin/pilot-grants', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` }
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ organizationId: testOrgId, pilotExpiresAt: new Date(Date.now() + 86400000).toISOString() }));
      req.end();
    });
    assert.strictEqual(pilotNoTargetRes.status, 400, 'Pilot grant without targets and without isOrgWide must return HTTP 400');
    assert.strictEqual(pilotNoTargetRes.json.error, 'EXPLICIT_ORG_WIDE_APPROVAL_REQUIRED');

    const legacyNoTargetRes = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: serverPort, path: '/api/admin/legacy-grants', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` }
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(d) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ organizationId: testOrgId }));
      req.end();
    });
    assert.strictEqual(legacyNoTargetRes.status, 400, 'Legacy grant without targets and without isOrgWide must return HTTP 400');
    assert.strictEqual(legacyNoTargetRes.json.error, 'EXPLICIT_ORG_WIDE_APPROVAL_REQUIRED');
    console.log('  PASS: Admin grant routes strictly reject untargeted requests lacking explicit isOrgWide flag (HTTP 400 EXPLICIT_ORG_WIDE_APPROVAL_REQUIRED).');

    // ── TEST 54: MUTATOR REJECTS NOTES SUBSTRING ORG_WIDE_APPROVED WITHOUT ISORGWIDE ──────
    console.log('\n[TEST 54] Verifying Mutator Rejects notes Substring ORG_WIDE_APPROVED Without isOrgWide...');
    await assert.rejects(
      async () => {
        await db.issuePilotGrant({
          organizationId: testOrgId,
          pilotExpiresAt: new Date(Date.now() + 86400000).toISOString(),
          approvedBy: 'owner_user',
          notes: 'ORG_WIDE_APPROVED in notes but isOrgWide not passed'
        });
      },
      /REFERENTIAL_INTEGRITY_VIOLATION/,
      'Pilot grant with notes substring but isOrgWide missing must be rejected'
    );

    await assert.rejects(
      async () => {
        await db.issueLegacyGrant({
          organizationId: testOrgId,
          approvedBy: 'owner_user',
          notes: 'ORG_WIDE_APPROVED in notes but isOrgWide not passed'
        });
      },
      /REFERENTIAL_INTEGRITY_VIOLATION/,
      'Legacy grant with notes substring but isOrgWide missing must be rejected'
    );
    console.log('  PASS: DB mutators strictly reject notes substring checks without explicit isOrgWide boolean flag.');

    console.log('\n=== ALL 54 REAL-SERVER SIGNED STRIPE TEST-MODE ROUTE E2E TESTS PASSED ===');


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
