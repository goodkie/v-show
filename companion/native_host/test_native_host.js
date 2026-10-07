/**
 * test_native_host.js
 * Unit test for Native Messaging Host protocol communication
 */

const { spawn } = require('child_process');
const path = require('path');

function encodeMsg(obj) {
  const str = JSON.stringify(obj);
  const len = Buffer.byteLength(str, 'utf8');
  const buf = Buffer.alloc(4 + len);
  buf.writeUInt32LE(len, 0);
  buf.write(str, 4, 'utf8');
  return buf;
}

async function testNativeHost() {
  console.log('[TEST] Spawning Native Host child process...');
  const hostPath = path.join(__dirname, 'xpider_native_host.js');
  const child = spawn(process.execPath, [hostPath], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  return new Promise((resolve, reject) => {
    let outBuf = Buffer.alloc(0);

    child.stdout.on('data', (chunk) => {
      outBuf = Buffer.concat([outBuf, chunk]);
      while (outBuf.length >= 4) {
        const msgLen = outBuf.readUInt32LE(0);
        if (outBuf.length < 4 + msgLen) break;
        const msgBytes = outBuf.subarray(4, 4 + msgLen);
        outBuf = outBuf.subarray(4 + msgLen);
        const msg = JSON.parse(msgBytes.toString('utf8'));
        console.log('[NATIVE_HOST_RESPONSE]', msg);

        if (msg.action === 'PONG') {
          console.log('✅ Native Host PING/PONG verified.');
          child.kill();
          resolve(true);
        }
      }
    });

    child.on('error', reject);

    // Send PING
    child.stdin.write(encodeMsg({ action: 'PING' }));
  });
}

if (require.main === module) {
  testNativeHost().then(() => {
    console.log('✅ ALL NATIVE HOST TESTS PASSED!');
    setTimeout(() => process.exit(0), 100);
  }).catch(err => {
    console.error('❌ Native Host Test Failed:', err);
    setTimeout(() => process.exit(1), 100);
  });
}

module.exports = { testNativeHost };
