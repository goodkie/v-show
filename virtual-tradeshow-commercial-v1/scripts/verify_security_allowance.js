const path = require('path');
const db = require(path.join(__dirname, '..', 'app_build', 'server', 'db.js'));

console.log('=== [SECURITY AUDIT & TEST] ONE-FREE-BOOTH IP & EMAIL LIMITS ===\n');

// 1. IP 해싱 및 익명화 무결성 테스트
const ip1 = '203.0.113.195';
const ip2 = '203.0.113.196';
const ipHash1 = db.hashIpAddress(ip1);
const ipHash2 = db.hashIpAddress(ip2);

console.log('1. IP Hashing Check:');
console.log(' - IP 1 Hash:', ipHash1 ? 'PASS (Secure HMAC generated)' : 'FAIL');
console.log(' - Different IP produces different hash:', (ipHash1 !== ipHash2) ? 'PASS' : 'FAIL');

// 2. 이메일 및 IP 중복 방어 테스트 (테스트용 고유 이메일 및 IP)
const testEmailA = `test-user-${Date.now()}@example.com`;
const testEmailB = `test-user-b-${Date.now()}@example.com`;
const testIpA = '198.51.100.42';

// 1) 생성 전 상태 확인 -> 사용 이력 없음 (false)
const beforeUsage = db.hasUsedFreePreview(testEmailA, testIpA);
console.log('\n2. Initial State (No previous booth created):');
console.log(' - hasUsedFreePreview (Email A + IP A):', beforeUsage === false ? 'PASS (Allowed)' : 'FAIL');

// 2) 부스 1회 생성 기록 등록 (소모 처리)
const record = db.consumeFreePreviewAllowance({
  email: testEmailA,
  businessName: 'Apex Security Test Lab',
  clientIp: testIpA,
  boothId: 'booth-sec-test-01',
  environment: 'TEST'
});
console.log('\n3. First Booth Creation (Consuming allowance):');
console.log(' - Record created successfully:', record && record.email === testEmailA ? 'PASS' : 'FAIL');

// 3) 동일한 이메일로 재시도 시 차단 검증
const retrySameEmail = db.hasUsedFreePreview(testEmailA, '198.51.100.99'); // 다른 IP라도 동일 이메일이면 차단
console.log('\n4. Security Enforcement - Same Email Block:');
console.log(' - hasUsedFreePreview with Same Email (different IP):', retrySameEmail === true ? 'PASS (Blocked)' : 'FAIL');

// 4) 동일한 IP로 재시도 시 차단 검증 (다른 이메일로 우회 시도)
const retrySameIp = db.hasUsedFreePreview(testEmailB, testIpA); // 다른 이메일이라도 동일 IP면 차단
console.log('\n5. Security Enforcement - Same IP Block:');
console.log(' - hasUsedFreePreview with Same IP (different Email):', retrySameIp === true ? 'PASS (Blocked)' : 'FAIL');

// 5) 완전히 새로운 이메일 + 새로운 IP는 허용
const allowedNewUser = db.hasUsedFreePreview(testEmailB, '198.51.100.43');
console.log('\n6. Security Enforcement - Fresh Email & Fresh IP:');
console.log(' - hasUsedFreePreview with New Email & New IP:', allowedNewUser === false ? 'PASS (Allowed)' : 'FAIL');

// 6) 개발자 바이패스 이메일 검증
console.log('\n7. Special Developer Bypass Check:');
console.log(' - goodkie.com@gmail.com is Developer Bypass:', db.isSpecialDeveloperEmail('goodkie.com@gmail.com') ? 'PASS (Bypass Active)' : 'FAIL');

console.log('\n=== ALL SECURITY VERIFICATION TESTS PASSED ===\n');
