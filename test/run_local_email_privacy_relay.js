'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const { sendOne, httpConnect, payloadForRecipient, RELAY_HOST, RELAY_PORT } = require('../companion/local-email-privacy-relay');

const s = {
  transportConfigured: true,
  spfVerified: true,
  dkimVerified: true,
  dmarcVerified: true,
  domainAligned: true,
  unsubscribeEndpointVerified: true,
  bounceWebhookVerified: true,
  complaintWebhookVerified: true,
  operatorApproved: true,
  maxPerHour: 10
};
const r = {
  email: 'test@example.test',
  consentStatus: 'OPTED_IN',
  consentProof: { method: 'double_opt_in', source: 'fixture', timestamp: '2026-11-01T00:00:00Z' }
};
const campaign = {
  subject: 'Test',
  content: 'Local fixture',
  unsubscribeUrl: 'https://example.test/unsubscribe/x',
  recipients: [r],
  now: Date.parse('2026-11-09T00:00:00Z')
};
const id = 'test-local-example-20261109-001';

function startMockRelay(onClientConnect) {
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      let buf = '';
      socket.on('data', chunk => {
        buf += chunk.toString('utf8');
        if (buf.includes('\r\n\r\n')) {
          socket.removeAllListeners('data');
          onClientConnect(socket, buf);
        }
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise(res => server.close(() => res()))
      });
    });
  });
}

(async () => {
  let count = 0;
  async function check(name, fn) {
    await fn();
    count++;
    console.log('PASS', name);
  }

  await check('privacy-ready preview needs explicit operator approval', async () => {
    const x = await sendOne({
      campaign,
      settings: s,
      from: 'team@example.test',
      recipient: r,
      privacyReady: true,
      approvedLive: false,
      idempotencyKey: id
    });
    assert.equal(x.status, 'BLOCKED');
  });

  await check('dry run does not require any network or API key', async () => {
    const x = await sendOne({
      campaign,
      settings: s,
      from: 'team@example.test',
      recipient: r,
      approvedLive: true,
      idempotencyKey: id,
      dryRun: true
    });
    assert.equal(x.status, 'PREVIEW_ONLY');
    assert.equal(x.relay, '127.0.0.1:18988');
  });

  await check('email collector address alone cannot send', async () => {
    const u = { email: 'collector@example.test' };
    const x = await sendOne({
      campaign: { ...campaign, recipients: [u] },
      settings: s,
      from: 'team@example.test',
      recipient: u,
      approvedLive: true,
      idempotencyKey: id,
      dryRun: false
    });
    assert.equal(x.status, 'BLOCKED');
  });

  await check('relay rejects unauthorized external destination without networking', async () => {
    await assert.rejects(httpConnect({ host: 'example.com' }), /DESTINATION_DENIED/);
  });

  await check('no live transmit if relay not ready', async () => {
    const senderVerification = {
      domainOwnershipVerified: true,
      providerDomainVerified: true,
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
      relayConnectVerified: true
    };
    await assert.rejects(
      sendOne({
        campaign,
        settings: s,
        from: 'notice@vivpr.pro',
        senderVerification,
        recipient: r,
        approvedLive: true,
        idempotencyKey: id,
        apiKey: 're_test_dummykey',
        privacyReady: false,
        dryRun: false
      }),
      /PRIVACY_RELAY_NOT_READY/
    );
  });

  await check('no direct fallback if relay unavailable', async () => {
    assert.equal(RELAY_HOST, '127.0.0.1');
    assert.equal(RELAY_PORT, 18988);
    await assert.rejects(httpConnect({ relayHost: '8.8.8.8' }), /NON_LOOPBACK_RELAY_DENIED/);
  });

  await check('one-click unsubscribe headers are included', async () => {
    const p = payloadForRecipient({ ...campaign, from: 'team@example.test' }, r);
    assert.equal(p.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  });

  // --- P0 Item 5: Loopback CONNECT Negative & TLS-Failure / Timeout Mock Tests ---
  await check('loopback CONNECT HTTP 407 (Decodo quota exhausted) fails closed without direct fallback', async () => {
    const mock = await startMockRelay(socket => {
      socket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Decodo"\r\n\r\n');
      socket.end();
    });
    try {
      await assert.rejects(
        httpConnect({ relayPort: mock.port, timeoutMs: 2000 }),
        /RELAY_HTTP_407_PROXY_AUTH_REQUIRED/
      );
    } finally {
      await mock.close();
    }
  });

  await check('loopback CONNECT HTTP 502 fails closed with RELAY_CONNECT_DENIED', async () => {
    const mock = await startMockRelay(socket => {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.end();
    });
    try {
      await assert.rejects(
        httpConnect({ relayPort: mock.port, timeoutMs: 2000 }),
        /RELAY_CONNECT_DENIED/
      );
    } finally {
      await mock.close();
    }
  });

  await check('loopback CONNECT 200 with unexpected tunnel smuggling head bytes fails closed', async () => {
    const mock = await startMockRelay(socket => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\nSMUGGLED_HEAD_BYTES');
      socket.end();
    });
    try {
      await assert.rejects(
        httpConnect({ relayPort: mock.port, timeoutMs: 2000 }),
        /RELAY_CONNECT_DENIED/
      );
    } finally {
      await mock.close();
    }
  });

  await check('loopback CONNECT timeout fails closed with PRIVACY_RELAY_CONNECT_TIMEOUT', async () => {
    const mock = await startMockRelay(_socket => {
      // Intentionally stall without writing response headers
    });
    try {
      await assert.rejects(
        httpConnect({ relayPort: mock.port, timeoutMs: 150 }),
        /PRIVACY_RELAY_CONNECT_TIMEOUT/
      );
    } finally {
      await mock.close();
    }
  });

  await check('loopback CONNECT 200 followed by non-TLS / corrupt TLS handshake fails closed with RELAY_TLS_ERROR', async () => {
    const mock = await startMockRelay(socket => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      setTimeout(() => {
        socket.write('PLAIN_HTTP_NOT_TLS_GARBAGE\r\n\r\n');
        socket.end();
      }, 20);
    });
    try {
      await assert.rejects(
        httpConnect({ relayPort: mock.port, timeoutMs: 2000 }),
        /RELAY_TLS_ERROR/
      );
    } finally {
      await mock.close();
    }
  });

  await check('loopback CONNECT 200 followed by stalled TLS handshake fails closed with RELAY_TLS_TIMEOUT', async () => {
    const sockets = [];
    const mock = await startMockRelay(socket => {
      sockets.push(socket);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Stall after 200 OK so TLS ClientHello receives no ServerHello
    });
    try {
      await assert.rejects(
        httpConnect({ relayPort: mock.port, timeoutMs: 180 }),
        /RELAY_TLS_TIMEOUT/
      );
    } finally {
      for (const s of sockets) s.destroy();
      await mock.close();
    }
  });

  await check('sendOne with live flags still fails closed when loopback relay returns HTTP 407', async () => {
    const mock = await startMockRelay(socket => {
      socket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      socket.end();
    });
    const senderVerification = {
      domainOwnershipVerified: true,
      providerDomainVerified: true,
      spfVerified: true,
      dkimVerified: true,
      dmarcVerified: true,
      relayConnectVerified: true
    };
    try {
      await assert.rejects(
        sendOne({
          campaign,
          settings: s,
          from: 'notice@vivpr.pro',
          senderVerification,
          recipient: r,
          approvedLive: true,
          idempotencyKey: id,
          apiKey: 're_test_dummykey',
          privacyReady: true,
          dryRun: false,
          relayPort: mock.port,
          timeoutMs: 1500
        }),
        /RELAY_HTTP_407_PROXY_AUTH_REQUIRED/
      );
    } finally {
      await mock.close();
    }
  });

  console.log(count + '/' + count + ' PASS');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
