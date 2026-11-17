'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { EmailProductionPipeline } = require('../companion/email-production-pipeline');
const { issueUnsubscribeToken } = require('../companion/email-unsubscribe-server');

function createMockD1() {
  const tables = {
    unsubscribe_tokens: new Map(),
    suppressions: new Map(),
    unsubscribe_audit: [],
    rate_limits: new Map()
  };

  return {
    tables,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() {
          if (sql.startsWith('SELECT 1 AS ok')) return { ok: 1 };
          if (sql.includes('FROM rate_limits WHERE bucket_key = ?')) {
            return tables.rate_limits.get(args[0]) || null;
          }
          if (sql.includes('SELECT recipient_hash FROM suppressions WHERE recipient_hash = ?')) {
            return tables.suppressions.get(args[0]) || null;
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM suppressions')) {
            const rows = Array.from(tables.suppressions.values());
            const filtered = args.length > 0 ? rows.filter(r => r.updated_at >= args[0]) : rows;
            return { results: filtered };
          }
          return { results: [] };
        },
        async run() {
          if (sql.startsWith('INSERT INTO rate_limits')) {
            tables.rate_limits.set(args[0], { bucket_key: args[0], count: 1, window_start: args[1] });
          } else if (sql.startsWith('UPDATE rate_limits SET count = count + 1')) {
            const cur = tables.rate_limits.get(args[0]);
            if (cur) cur.count += 1;
          } else if (sql.startsWith('INSERT OR IGNORE INTO unsubscribe_tokens')) {
            if (!tables.unsubscribe_tokens.has(args[0])) {
              tables.unsubscribe_tokens.set(args[0], {
                token_hash: args[0], recipient_hash: args[1], campaign_id: args[2],
                issued_at: args[3], expires_at: args[4], used_at: null
              });
            }
          } else if (sql.startsWith('INSERT INTO suppressions')) {
            const prev = tables.suppressions.get(args[0]);
            tables.suppressions.set(args[0], {
              recipient_hash: args[0],
              reason: args[1],
              source_token_hash: args[2],
              suppressed_at: prev ? prev.suppressed_at : args[3],
              updated_at: args[4]
            });
          } else if (sql.startsWith('UPDATE unsubscribe_tokens SET used_at')) {
            const cur = tables.unsubscribe_tokens.get(args[1]);
            if (cur && !cur.used_at) cur.used_at = args[0];
          } else if (sql.startsWith('INSERT INTO unsubscribe_audit')) {
            tables.unsubscribe_audit.push({
              event_type: args[0], token_hash: args[1], recipient_hash: args[2],
              ip_hash: args[3], created_at: args[4]
            });
          }
          return { success: true };
        }
      };
      return stmt;
    }
  };
}

(async () => {
  const workerMod = await import(pathToFileURL(path.resolve(__dirname, '../companion/unsubscribe-worker/src/worker.js')).href);
  const worker = workerMod.default;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_worker_test_'));
  let pass = 0;

  async function run(name, fn) {
    await fn();
    pass++;
    console.log('PASS ' + name);
  }

  try {
    const db = createMockD1();
    const hmacSecret = 'a'.repeat(64);
    const syncToken = 'sync_' + 'b'.repeat(32);
    const env = {
      DB: db,
      ALLOWED_HOST: 'unsub.vivpr.pro',
      RATE_LIMIT_MAX_PER_MIN: '30',
      UNSUBSCRIBE_HMAC_SECRET: hmacSecret,
      SIDECAR_SYNC_TOKEN: syncToken
    };

    const tokValid = issueUnsubscribeToken({
      email: 'alice@example.org',
      campaignId: 'camp_w1',
      keyRing: { activeKeyId: 'k1', keys: { k1: hmacSecret } }
    });
    const tokExpired11y = issueUnsubscribeToken({
      email: 'bob@example.org',
      campaignId: 'camp_old',
      keyRing: { activeKeyId: 'k1', keys: { k1: hmacSecret } },
      now: Date.now() - 11 * 365 * 86400000,
      ttlMs: 10 * 365 * 86400000
    });

    await run('WORKER_HEALTH_HOST_AND_UNAUTH_SYNC_REJECTED', async () => {
      const h = await worker.fetch(new Request('https://unsub.vivpr.pro/health'), env);
      assert.equal(h.status, 200);
      assert.equal((await h.json()).d1Ready, true);

      const badHost = await worker.fetch(new Request('https://evil.example/health'), env);
      assert.equal(badHost.status, 403);

      const noAuthSync = await worker.fetch(new Request('https://unsub.vivpr.pro/api/sync/suppressions'), env);
      assert.equal(noAuthSync.status, 401);
    });

    await run('WORKER_SCANNER_GET_SAFE_CONFIRM_POST_RFC8058_AND_EXPIRED_GRACE', async () => {
      const uUrl = `https://unsub.vivpr.pro/unsubscribe/${encodeURIComponent(tokValid)}`;
      const getRes = await worker.fetch(new Request(uUrl, { headers: { Accept: 'text/html' } }), env);
      assert.equal(getRes.status, 200);
      assert.ok(getRes.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
      const html = await getRes.text();
      assert.ok(!html.includes('alice@example.org'), 'Must never expose email in HTML');
      assert.equal(db.tables.suppressions.size, 0, 'GET must never mutate suppression state');

      const csrfMatch = html.match(/name="confirmCsrf" value="([^"]+)"/);
      assert.ok(csrfMatch);

      // Bad CSRF -> 403
      const badPost = await worker.fetch(new Request(uUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '1.2.3.4' },
        body: 'List-Unsubscribe=One-Click&confirmCsrf=wrong'
      }), env);
      assert.equal(badPost.status, 403);

      // Valid confirmation POST -> 200 UNSUBSCRIBED
      const goodPost = await worker.fetch(new Request(uUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '1.2.3.4' },
        body: `List-Unsubscribe=One-Click&confirmCsrf=${encodeURIComponent(csrfMatch[1])}`
      }), env);
      assert.equal(goodPost.status, 200);
      assert.equal((await goodPost.json()).status, 'UNSUBSCRIBED');

      // Repeat RFC 8058 POST -> idempotentReplay: true
      const replay = await worker.fetch(new Request(uUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '1.2.3.4' },
        body: 'List-Unsubscribe=One-Click'
      }), env);
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).idempotentReplay, true);

      // Expired >10y token with valid signature still unsubscribes!
      const expRes = await worker.fetch(new Request(`https://unsub.vivpr.pro/unsubscribe/${encodeURIComponent(tokExpired11y)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '1.2.3.5' },
        body: 'List-Unsubscribe=One-Click'
      }), env);
      assert.equal(expRes.status, 200);
      const expJson = await expRes.json();
      assert.equal(expJson.status, 'UNSUBSCRIBED');
      assert.equal(expJson.expiredTokenGrace, true);
    });

    await run('SIDECAR_OFFLINE_SYNC_BLOCKS_IMPORT_QUEUE_RESTART_AND_FAILS_CLOSED_ON_OUTAGE', async () => {
      const stateDir = path.join(tmpDir, 'sidecar_sync');
      let p = new EmailProductionPipeline({ stateDir, trustedTestMode: true });
      const fetchWorker = (url, opts) => worker.fetch(new Request(url, opts), env);

      const syncOk = await p.syncRemoteSuppressions({
        baseUrl: 'https://unsub.vivpr.pro',
        syncToken,
        fetchImpl: fetchWorker
      });
      assert.equal(syncOk.ok, true);
      assert.equal(syncOk.addedCount, 2);
      assert.equal(p.isRecipientSuppressed('alice@example.org'), true);
      assert.equal(p.isRecipientSuppressed('bob@example.org'), true);
      assert.equal(p.isRecipientSuppressed('charlie@example.org'), false);

      // Restart Sidecar pipeline on same stateDir -> hashes persist!
      p = new EmailProductionPipeline({ stateDir, trustedTestMode: true });
      assert.equal(p.isRecipientSuppressed('alice@example.org'), true);

      const imp = p.importAndPersistRecipients({
        csvText: 'email,name\nalice@example.org,Alice\ncharlie@example.org,Charlie',
        messageKind: 'marketing',
        consentAttested: true
      });
      assert.equal(imp.summary.counts.SKIPPED_SUPPRESSED, 1);
      assert.equal(imp.summary.counts.PENDING, 1);

      // Sync outage on LIVE_PRODUCTION -> MUST fail closed (UNSUBSCRIBE_SYNC_UNAVAILABLE)
      const outage = await p.runQueue({
        mode: 'LIVE_PRODUCTION',
        baseUrl: 'https://unsub.vivpr.pro',
        syncToken,
        syncFetchImpl: async () => { throw new Error('ECONNRESET'); }
      });
      assert.equal(outage.ok, false);
      assert.equal(outage.reason, 'UNSUBSCRIBE_SYNC_UNAVAILABLE');
    });

    console.log(`\nALL UNSUBSCRIBE WORKER TESTS PASSED (${pass}/${pass})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
