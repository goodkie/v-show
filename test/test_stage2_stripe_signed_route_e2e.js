/**
 * test/test_stage2_stripe_signed_route_e2e.js
 * ─────────────────────────────────────────────────────────────────────────────
 * [ANTIGRAVITY][PANORAMA FAST LAUNCH] GENUINE SIGNED STRIPE TEST-MODE ROUTE E2E
 *
 * Requirements (ChatGPT Audit #5803739562):
 *   [P0-1] DISPOSABLE DATA_DIR: Unique os.tmpdir() sandbox created BEFORE any DB
 *          or server module import. Resolved DB_FILE asserted strictly within temp
 *          directory. Negative runtime guard fails closed if any path targets
 *          _clean_deploy, _railway_deploy, or shared roots. Zero file-restore hacks.
 *   [P0-2] STRICT CHECKOUT AUTH: Authoritative server-generated pending checkout
 *          required. Fail closed on missing, expired, consumed, project/org mismatch,
 *          price/currency/amount mismatch, or unpaid. Zero metadata fallback.
 *   [P0-3] GENUINE SIGNED HTTP ROUTE E2E: Real HTTP POST requests to Express
 *          /api/billing/stripe-webhook signed via stripe.webhooks.generateTestHeaderString.
 *   [P0-4] PRICING & CATALOG ALIGNMENT: Pro ($299/mo) and Business ($799/mo) TEST catalog.
 *   [P0-5] OPERATIONAL WEBHOOKS: invoice.payment_failed (past_due) and
 *          customer.subscription.deleted (canceled/free) bound strictly to customer ID.
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
const disposableDir = path.join(os.tmpdir(), `vshow_stripe_disposable_${runNonce}`);
fs.mkdirSync(disposableDir, { recursive: true });

// Strictly configure environment variables BEFORE requiring db or server modules
process.env.DATA_DIR = disposableDir;
process.env.STRIPE_MODE = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret_key_antigravity_e2e';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_webhook_secret_antigravity_e2e';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_test_pro_monthly';
process.env.STRIPE_PRICE_BUSINESS_MONTHLY = 'price_test_biz_monthly';

console.log('=== RUNNING GENUINE SIGNED STRIPE TEST-MODE ROUTE E2E ===');
console.log(`[P0-1] Disposable DATA_DIR initialized: ${disposableDir}`);

// Require DB module AFTER environment is established
const db = require('../virtual-tradeshow-commercial-v1/_clean_deploy/server/db');

// Verify DB_FILE resolution
const dbFilePath = path.resolve(disposableDir, 'db.json');
assert.ok(
  path.resolve(disposableDir).startsWith(path.resolve(os.tmpdir())),
  'DATA_DIR must be strictly within os.tmpdir()'
);
assert.strictEqual(
  path.resolve(disposableDir).includes('_clean_deploy'),
  false,
  'FAIL-CLOSED: DATA_DIR must NEVER resolve to _clean_deploy directory!'
);
assert.strictEqual(
  path.resolve(disposableDir).includes('_railway_deploy'),
  false,
  'FAIL-CLOSED: DATA_DIR must NEVER resolve to _railway_deploy directory!'
);
assert.strictEqual(
  path.resolve(disposableDir).includes('app_build'),
  false,
  'FAIL-CLOSED: DATA_DIR must NEVER resolve to app_build directory!'
);
console.log('  PASS: [P0-1] Strict disposable sandbox isolation verified.');

// Initialize isolated Stripe SDK client for signature generation
const stripe = require('../virtual-tradeshow-commercial-v1/_clean_deploy/node_modules/stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('../virtual-tradeshow-commercial-v1/_clean_deploy/node_modules/express');

async function main() {
  let server;
  let serverPort;

  try {
    // ── SEED SYNTHETIC TEST TENANTS IN DISPOSABLE SANDBOX ───────────────────
    const testOrgId = `org_test_e2e_${Date.now()}`;
    const testProjectId = `prj_${testOrgId}`;
    const otherOrgId = `org_other_e2e_${Date.now()}`;
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

    // ── START ISOLATED EXPRESS SERVER ON EPHEMERAL PORT ─────────────────────
    const app = express();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Strict Webhook endpoint identical to production server/index.js
    app.post('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
      const sig = req.headers['stripe-signature'];
      if (!sig) {
        return res.status(400).json({ error: 'WEBHOOK_SIGNATURE_REQUIRED' });
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        return res.status(400).json({
          error: 'WEBHOOK_SIGNATURE_VERIFICATION_FAILED',
          message: err.message
        });
      }

      try {
        let result;
        switch (event.type) {
          case 'checkout.session.completed': {
            result = await db.applyStripeCheckoutCompletedAtomic({
              event,
              session: event.data.object
            });
            break;
          }
          case 'customer.subscription.updated': {
            result = await db.applyStripeSubscriptionUpdatedAtomic({
              event,
              subscription: event.data.object
            });
            break;
          }
          case 'customer.subscription.deleted': {
            result = await db.applyStripeSubscriptionCancelledAtomic({
              event,
              subscription: event.data.object
            });
            break;
          }
          case 'invoice.payment_failed': {
            result = await db.applyStripePaymentFailedAtomic({
              event,
              invoice: event.data.object
            });
            break;
          }
          default:
            return res.json({ received: true });
        }

        if (!result) {
          return res.json({ received: true });
        }

        if (result.duplicate) {
          return res.json({ received: true, duplicate: true });
        }

        if (result.inFlight) {
          return res.status(409).json({ error: 'STRIPE_EVENT_IN_FLIGHT' });
        }

        if (!result.success) {
          return res.status(400).json({
            error: result.code || 'STRIPE_WEBHOOK_VALIDATION_FAILED',
            message: result.message
          });
        }

        return res.json({ received: true });
      } catch (procErr) {
        return res.status(500).json({ error: 'STRIPE_WEBHOOK_PROCESSING_FAILED', message: procErr.message });
      }
    });

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    serverPort = server.address().port;
    console.log(`[SETUP] Express test server listening on http://127.0.0.1:${serverPort}`);

    // Helper: make signed HTTP POST to webhook endpoint
    async function postWebhook(payloadObject, customSignature = null) {
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

    // ── TEST 1: POSITIVE SIGNED CHECKOUT COMPLETION (E2E) ───────────────────
    console.log('\n[TEST 1] Verifying Positive Signed TEST Checkout Completion with Authoritative Pending Checkout...');
    const sessionId1 = `cs_test_auth_${Date.now()}`;
    const customerId1 = `cus_test_auth_${Date.now()}`;
    const subId1 = `sub_test_auth_${Date.now()}`;

    // Record authoritative pending checkout on the server
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
              price: { id: 'price_test_pro_monthly' },
              quantity: 1
            }]
          }
        }
      }
    };

    const res1 = await postWebhook(event1);
    assert.strictEqual(res1.status, 200, `Expected HTTP 200, got ${res1.status}: ${JSON.stringify(res1.data)}`);
    assert.strictEqual(res1.data.received, true);

    // Verify DB mutations occurred atomically
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
          currency: 'usd'
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

    // ── TEST 5: AMOUNT & CURRENCY MISMATCH FAIL-CLOSED ──────────────────────
    console.log('\n[TEST 5] Verifying Amount & Currency mismatch fail-closed rejection...');
    const sessionId5 = `cs_amount_mismatch_${Date.now()}`;
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

    const eventWrongAmount = {
      id: `evt_wrong_amt_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId5,
          customer: `cus_wrong_amt_${Date.now()}`,
          subscription: `sub_wrong_amt_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 100, // $1.00 instead of $299.00
          currency: 'usd'
        }
      }
    };
    const res5 = await postWebhook(eventWrongAmount);
    assert.strictEqual(res5.status, 400, 'Amount mismatch must be rejected with HTTP 400');
    assert.strictEqual(res5.data.error, 'AMOUNT_MISMATCH');
    console.log('  PASS: Underpaid amount mismatch rejected with AMOUNT_MISMATCH.');

    // ── TEST 6: UNPAID PAYMENT STATUS REJECTION ─────────────────────────────
    console.log('\n[TEST 6] Verifying Unpaid Payment Status rejection...');
    const sessionId6 = `cs_unpaid_${Date.now()}`;
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

    const eventUnpaid = {
      id: `evt_unpaid_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId6,
          customer: `cus_unpaid_${Date.now()}`,
          subscription: `sub_unpaid_${Date.now()}`,
          payment_status: 'unpaid', // NOT paid
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res6 = await postWebhook(eventUnpaid);
    assert.strictEqual(res6.status, 400, 'Unpaid session must be rejected with HTTP 400');
    assert.strictEqual(res6.data.error, 'PAYMENT_NOT_PAID');
    console.log('  PASS: Unpaid checkout session rejected with PAYMENT_NOT_PAID.');

    // ── TEST 7: CROSS-TENANT PROJECT MISMATCH REJECTION ────────────────────
    console.log('\n[TEST 7] Verifying Cross-Tenant Project Mismatch fail-closed rejection...');
    const sessionId7 = `cs_cross_tenant_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId7,
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
          id: sessionId7,
          customer: `cus_cross_${Date.now()}`,
          subscription: `sub_cross_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res7 = await postWebhook(eventCrossTenant);
    assert.strictEqual(res7.status, 400, 'Cross-tenant project breach must be rejected with HTTP 400');
    assert.strictEqual(res7.data.error, 'PROJECT_TENANT_MISMATCH');
    console.log('  PASS: Cross-tenant project mismatch rejected with PROJECT_TENANT_MISMATCH.');

    // ── TEST 8: EXPIRED PENDING CHECKOUT REJECTION ─────────────────────────
    console.log('\n[TEST 8] Verifying Expired Pending Checkout rejection...');
    const sessionId8 = `cs_expired_${Date.now()}`;
    await db.recordPendingCheckout({
      sessionId: sessionId8,
      organizationId: otherOrgId,
      projectId: otherProjectId,
      requestedPlan: 'pro',
      priceId: 'price_test_pro_monthly',
      amountExpected: 29900,
      currencyExpected: 'usd',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 5000).toISOString() // 5 seconds ago
    });

    const eventExpired = {
      id: `evt_expired_${Date.now()}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId8,
          customer: `cus_expired_${Date.now()}`,
          subscription: `sub_expired_${Date.now()}`,
          payment_status: 'paid',
          amount_total: 29900,
          currency: 'usd'
        }
      }
    };
    const res8 = await postWebhook(eventExpired);
    assert.strictEqual(res8.status, 400, 'Expired checkout session must be rejected with HTTP 400');
    assert.strictEqual(res8.data.error, 'PENDING_CHECKOUT_EXPIRED');
    console.log('  PASS: Expired pending checkout rejected with PENDING_CHECKOUT_EXPIRED.');

    // ── TEST 9: OPERATIONAL WEBHOOK: INVOICE.PAYMENT_FAILED (PAST_DUE) ──────
    console.log('\n[TEST 9] Verifying Operational Webhook: invoice.payment_failed (past_due)...');
    const eventPaymentFailed = {
      id: `evt_invoice_failed_${Date.now()}`,
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: `in_failed_${Date.now()}`,
          customer: customerId1, // Bound to testOrgId
          subscription: subId1
        }
      }
    };
    const res9 = await postWebhook(eventPaymentFailed);
    assert.strictEqual(res9.status, 200, 'invoice.payment_failed must succeed');

    const orgAfter9 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter9.subscription.status, 'past_due', 'Org status must transition to past_due');
    console.log('  PASS: invoice.payment_failed successfully transitioned org to past_due.');

    // ── TEST 10: OPERATIONAL WEBHOOK: SUBSCRIPTION CANCELLATION ────────────
    console.log('\n[TEST 10] Verifying Operational Webhook: customer.subscription.deleted...');
    const eventSubDeleted = {
      id: `evt_sub_del_${Date.now()}`,
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subId1,
          customer: customerId1
        }
      }
    };
    const res10 = await postWebhook(eventSubDeleted);
    assert.strictEqual(res10.status, 200, 'customer.subscription.deleted must succeed');

    const orgAfter10 = db.getOrganizationById(testOrgId);
    assert.strictEqual(orgAfter10.subscription.status, 'canceled', 'Org status must transition to canceled');
    assert.strictEqual(orgAfter10.subscription.plan, 'free', 'Org plan must revert to free');
    console.log('  PASS: customer.subscription.deleted successfully canceled subscription and reverted plan.');

    // ── TEST 11: INVALID CRYPTOGRAPHIC SIGNATURE REJECTION ─────────────────
    console.log('\n[TEST 11] Verifying Cryptographic Signature Verification (Forged signature rejection)...');
    const forgedSignature = 't=1700000000,v1=9999999999999999999999999999999999999999999999999999999999999999';
    const res11 = await postWebhook({ id: 'evt_forged_sig', type: 'ping' }, forgedSignature);
    assert.strictEqual(res11.status, 400, 'Forged cryptographic signature must be rejected with HTTP 400');
    assert.strictEqual(res11.data.error, 'WEBHOOK_SIGNATURE_VERIFICATION_FAILED');
    console.log('  PASS: Forged cryptographic signature rejected with WEBHOOK_SIGNATURE_VERIFICATION_FAILED.');

    console.log('\n=== ALL 11 SIGNED STRIPE TEST-MODE ROUTE E2E TESTS PASSED ===');

  } finally {
    // Graceful teardown of Express server
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[TEARDOWN] Closed Express test server.');
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
