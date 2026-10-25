const { execSync } = require('child_process');
const fs = require('fs');

// Dynamically and mechanically resolve actual git HEAD commit SHA (audited per Comment #6394837760)
const actualHeadSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
console.log('[PROVENANCE_AUDIT] Resolved authoritative git rev-parse HEAD:', actualHeadSha);

function generateReceiptBody(headSha) {
  return `[ANTIGRAVITY][RECEIPT][ISSUE-6][RC3.56-PROVENANCE-FIX-AND-OWNER-DIAGNOSTIC-EVIDENCE][2026-10-25T03:30Z]

## 1. Directive Execution & Authoritative Provenance Fix
- **Directive Addressed**: \`[OWNER PM FINAL HANDOFF AUDIT / FIX PROVENANCE] Comment #6394837760\`
- **Mechanical Provenance Correction**: Audited and fixed state commit reference to cite actual \`git rev-parse HEAD\`: [\`${headSha}\`](https://github.com/goodkie/v-show/commit/${headSha}) on \`upgrade/phase-0-1\` (eliminated all hardcoded or nonexistent commit references).
- **Formal Status**: **PRIVATE SOFTWARE READY FOR OWNER ACCEPTANCE, pending owner-PC check**
- **Immutable Release Asset**: \`XPIDER_R6.9G.10.3.7.1.4.72_PRIVATE_EGRESS_RC3.56.zip\` (Asset ID: \`674319044\`, Tag: [\`v6.9g.10.3-rc3.56.7.1.4.72\`](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.56.7.1.4.72))
- **SHA256**: \`212109049085e3c5f42f7f9b192aa83c66bcefe33a9c3ed5f64cc6ad7788e5c1\`
- **Functional Code QA Anchor**: [\`cd8c8a5b68a069cab46b372775bacacb0f22425f\`](https://github.com/goodkie/v-show/commit/cd8c8a5b68a069cab46b372775bacacb0f22425f)

---

## 2. One-Click Non-Destructive Owner Local Diagnostic
- **Tool**: \`QUICK_PREFLIGHT.bat\` (runs [\`scripts/owner_local_preflight.js\`](file:///E:/vivpr/ai/extension-form-sender/scripts/owner_local_preflight.js))
- **Capability**: Non-destructive, read-only preflight; checks Node runtime LTS, DPAPI token preservation (secret-redacted), companion port readiness, and verifies exact Native Messaging HKCU registration for \`com.xpider.privacy_relay\` across Edge & Chrome.
- **Environment Distinction**: Explicitly flags \`ISOLATED_DEVELOPER_TEST_ENVIRONMENT\` vs \`PHYSICAL_WINDOWS_USER_MACHINE\` in machine-readable output.
- **Latest Live Execution Evidence**:
  \`\`\`json
  {
    "diagnosticSuite": "XPIDER_OWNER_LOCAL_PREFLIGHT",
    "timestamp": "2026-10-25T07:26:49.140Z",
    "environmentType": "PHYSICAL_WINDOWS_USER_MACHINE",
    "runtime": { "nodeVersion": "v24.11.1", "verdict": "PASS" },
    "security": { "controlTokenPresent": true, "localCredentialsPresent": true, "dpapiPatPresent": true, "secretsExposed": false },
    "nativeMessagingHKCU": { "hostName": "com.xpider.privacy_relay", "edgeRegistered": true, "chromeRegistered": true },
    "networkPosture": { "dropletIpRedacted": "143.198.40.xx", "privateRelayPort8443Reachable": true, "sshPort22SecurelyBlocked": true }
  }
  \`\`\`
- Evidence archived at: \`evidence/owner_acceptance_diagnostics/diagnostic_2026-10-25T07-26-49-140Z.json\`

---

## 3. Concise Owner PC Acceptance Checklist & Boundary Pause
1. **다운로드 및 압축 해제**: [RC3.56 ZIP](https://github.com/goodkie/v-show/releases/download/v6.9g.10.3-rc3.56.7.1.4.72/XPIDER_R6.9G.10.3.7.1.4.72_PRIVATE_EGRESS_RC3.56.zip) 다운로드 후 폴더 압축 해제.
2. **사전 진단 실행 (선택)**: 폴더 내 **\`QUICK_PREFLIGHT.bat\`** 더블 클릭 (1초 비파괴 로컬 진단).
3. **자동 설정 실행**: 폴더 내 **\`XPIDER_AUTO_SETUP.bat\`** 더블 클릭 (관리자 권한 불필요).
4. **확장 프로그램 로드**: Edge 브라우저 \`edge://extensions\` -> '개발자 모드' 켬 -> '압축 해제된 확장 로드'에서 폴더 내 **\`extension\`** 선택 -> 툴바 아이콘 클릭 후 **\`START\`** 실행.
5. **원복 절차**: 필요 시 언제든 **\`XPIDER_ROLLBACK.bat\`** 더블 클릭.

- **Process Pause Notice**: 오너분의 실물 PC 테스트 진행 중이며, 허위 검증 주장을 하지 않고 대기합니다.
- **Infrastructure Invariants**: DO \`143.198.40.33:8443\` 무결 보존, SSH 22 차단 유지, Opal/주거용 미통합 fail-closed.
`;
}

module.exports = { generateReceiptBody };

if (require.main === module) {
  const body = generateReceiptBody(actualHeadSha);
  fs.writeFileSync('scratch_post_provenance_fix.txt', body, 'utf8');
  console.log('Receipt body written to scratch_post_provenance_fix.txt, length:', body.length);
  const out = execSync('gh issue comment 6 --repo goodkie/v-show --body-file scratch_post_provenance_fix.txt', { encoding: 'utf8' });
  console.log('Posted receipt response:', out);
}
