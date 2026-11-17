'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createUnsubscribeRailwayServer } = require('../companion/unsubscribe-railway/server');
const { EmailProductionPipeline } = require('../companion/email-production-pipeline');
const { issueUnsubscribeToken } = require('../companion/email-unsubscribe-server');

function httpReq(port, method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, text: d, json });
      });
    });
    r.on('error', reject);
    if (body !== null) r.write(body);
    r.end();
  });
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_railway_test_'));
  let pass = 0;
  async function run(name, fn) {
    await fn();
    pass++;
    console.log('PASS ' + name);
  }

  try {
    const dataDir = path.join(tmpDir, 'vol');
    const hmacSecret = 'c'.repeat(64);
    const syncToken = 'sync_rail_' + 'd'.repeat(32);

    const tok1 = issueUnsubscribeToken({
      email: 'rail-user1@example.org',
      campaignId: 'camp_rail',
      keyRing: { activeKeyId: 'k1', keys: { k1: hmacSecret } }
    });
    const tokOld = issueUnsubscribeToken({
      email: 'rail-old@example.org',
      campaignId: 'camp_11y',
      keyRing: { activeKeyId: 'k1', keys: { k1: hmacSecret } },
      now: Date.now() - 11 * 365 * 86400000,
      ttlMs: 10 * 365 * 86400000
    });

    await run('RAILWAY_SERVER_HEALTH_SCANNER_GET_CONFIRM_POST_RFC8058_AND_PERSISTENCE', async () => {
      let srvObj = createUnsubscribeRailwayServer({ dataDir, hmacSecret, syncToken, allowedHost: 'unsubscribe.vivpr.pro' });
      await new Promise(r => srvObj.server.listen(0, '127.0.0.1', r));
      const port = srvObj.server.address().port;
      try {
        const h = await httpReq(port, 'GET', '/health');
        assert.equal(h.statusCode, 200);
        assert.equal(h.json.service, 'xpider-unsubscribe');

        const uPath = `/unsubscribe/${encodeURIComponent(tok1)}`;
        const g = await httpReq(port, 'GET', uPath, { Accept: 'text/html' });
        assert.equal(g.statusCode, 200);
        assert.ok(!g.text.includes('rail-user1@example.org'));
        assert.equal(srvObj.store.suppressions.size, 0, 'GET must not mutate state');

        const csrf = g.text.match(/name="confirmCsrf" value="([^"]+)"/)[1];
        const badCsrf = await httpReq(port, 'POST', uPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click&confirmCsrf=bad');
        assert.equal(badCsrf.statusCode, 403);

        const goodPost = await httpReq(port, 'POST', uPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, `List-Unsubscribe=One-Click&confirmCsrf=${encodeURIComponent(csrf)}`);
        assert.equal(goodPost.statusCode, 200);
        assert.equal(goodPost.json.status, 'UNSUBSCRIBED');
        assert.equal(goodPost.json.idempotentReplay, false);

        const replay = await httpReq(port, 'POST', uPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click');
        assert.equal(replay.statusCode, 200);
        assert.equal(replay.json.idempotentReplay, true);

        const expPost = await httpReq(port, 'POST', `/unsubscribe/${encodeURIComponent(tokOld)}`, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click');
        assert.equal(expPost.statusCode, 200);
        assert.equal(expPost.json.expiredTokenGrace, true);
      } finally {
        await new Promise(r => srvObj.server.close(r));
      }

      // Restart Railway server on same volume -> suppressions persist and sync to Sidecar
      srvObj = createUnsubscribeRailwayServer({ dataDir, hmacSecret, syncToken, allowedHost: 'unsubscribe.vivpr.pro' });
      await new Promise(r => srvObj.server.listen(0, '127.0.0.1', r));
      const port2 = srvObj.server.address().port;
      try {
        const stateDir = path.join(tmpDir, 'sidecar');
        const p = new EmailProductionPipeline({ stateDir, trustedTestMode: true });
        const syncRes = await p.syncRemoteSuppressions({
          baseUrl: `http://127.0.0.1:${port2}`,
          syncToken
        });
        assert.equal(syncRes.ok, true);
        assert.equal(syncRes.addedCount, 2);
        assert.equal(p.isRecipientSuppressed('rail-user1@example.org'), true);
        assert.equal(p.isRecipientSuppressed('rail-old@example.org'), true);

        const imp = p.importAndPersistRecipients({
          csvText: 'email,name\nrail-user1@example.org,User1\nok@example.org,Ok',
          messageKind: 'marketing',
          consentAttested: true
        });
        assert.equal(imp.summary.counts.SKIPPED_SUPPRESSED, 1);
        assert.equal(imp.summary.counts.PENDING, 1);
      } finally {
        await new Promise(r => srvObj.server.close(r));
      }
    });

    console.log(`\nALL RAILWAY UNSUBSCRIBE TESTS PASSED (${pass}/${pass})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
