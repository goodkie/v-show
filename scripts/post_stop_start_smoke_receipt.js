const { execSync } = require('child_process');
const fs = require('fs');

const actualHeadSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
console.log('[RECEIPT] Resolved authoritative git rev-parse HEAD:', actualHeadSha);

const smokeJson = fs.readFileSync('evidence/clean_lifecycle_smoke/companion_stop_start_smoke_2026-10-25T07-52-55-561Z.json', 'utf8');

const commentBody = `[ANTIGRAVITY][RECEIPT][ISSUE-6][CLEAN-STATE-COMPANION-STOP-START-LIFECYCLE-SMOKE-PASS][2026-10-25T03:55Z]

## 1. Directive Execution & Authoritative Git Anchor
- **Directive Addressed**: \`[OWNER PM REACTIVATE AFTER NO NEW RECEIPT] Comment #6395042864\`
- **Authoritative Git HEAD**: [\`${actualHeadSha}\`](https://github.com/goodkie/v-show/commit/${actualHeadSha}) on \`upgrade/phase-0-1\` (verified mechanically via \`git rev-parse HEAD\`).
- **Release Preservation**: RC3.56 (\`v6.9g.10.3-rc3.56.7.1.4.72\`, SHA256 \`212109049085e3c5f42f7f9b192aa83c66bcefe33a9c3ed5f64cc6ad7788e5c1\`) remains strictly preserved without gratuitous RC3.57 rebuild.

---

## 2. Tooling & Packaging Clarification (RC3.56 ZIP vs Repository)
- **RC3.56 Archive Contents**: The released ZIP contains the primary setup script \`XPIDER_AUTO_SETUP.bat\`, which automatically validates locked runtime dependencies (\`ssh2\`), registers Native Messaging in HKCU for Chrome & Edge (\`com.xpider.privacy_relay\`), and starts the companion service with watchdog supervision.
- **Revised Diagnostic Scope**: The hardened \`scripts/owner_local_preflight.js\` (with strict \`UNATTESTED_WINDOWS_HOST\` classification and exit code 2 on down state) is maintained directly in git repository commits. Running \`XPIDER_AUTO_SETUP.bat\` directly from the RC3.56 ZIP is fully self-contained and unblocks normal owner usage without requiring a new release tag.

---

## 3. Clean-State STOP / START & Port Probe Smoke Results (\`test/run_companion_stop_start_smoke.js\`)

A complete clean-state lifecycle smoke test was executed against local listeners with zero mock stubs:
1. **Initial Baseline Teardown**: Teardown of prior instance; confirmed 18988 & 18989 released (**PASS**).
2. **Clean Launch via \`ensure_companion_service.js\`**: Bound ports 18988 & 18989 (**PASS**).
3. **HTTP Probes**:
   - \`GET http://127.0.0.1:18989/health\`: HTTP 200 \`{"status":"OK","relayReady":true,"lifecycleState":"READY",...}\` (PID 34112, Build: \`R6.9G.10.3.7.1.4.72-20261025-P0-RC3.56\`) (**PASS**).
   - \`GET http://127.0.0.1:18989/status\` with Bearer control token: HTTP 200 authenticated status returned with 10 API capabilities (**PASS**).
4. **Security & DPAPI Preservation**:
   - DPAPI encrypted PAT present: \`true\`.
   - Local credentials present: \`true\`.
   - Control token present: \`true\`.
   - Secrets exposed: \`false\` (**PASS**).
5. **Intentional STOP via \`/shutdown\`**: POST to \`/shutdown\` with Bearer token returned HTTP 200; ports 18988 & 18989 verified completely released (**PASS**).
6. **Clean RE-START via \`ensure_companion_service.js\`**: Companion successfully restarted (PID 30208), ports rebound, HTTP 200 verified (**PASS**).
7. **Native Messaging Host Registry**: Edge & Chrome HKCU \`com.xpider.privacy_relay\` verified (**PASS**).

### Machine-Readable Lifecycle Evidence (\`companion_stop_start_smoke_2026-10-25T07-52-55-561Z.json\`):
\`\`\`json
${smokeJson.trim()}
\`\`\`

---

## 4. Concise Owner Physical PC Acceptance Steps
1. **다운로드**: [RC3.56 배포 ZIP 다운로드](https://github.com/goodkie/v-show/releases/download/v6.9g.10.3-rc3.56.7.1.4.72/XPIDER_R6.9G.10.3.7.1.4.72_PRIVATE_EGRESS_RC3.56.zip)
   - SHA256: \`212109049085e3c5f42f7f9b192aa83c66bcefe33a9c3ed5f64cc6ad7788e5c1\`
2. **자동 설정**: 압축 해제 후 **\`XPIDER_AUTO_SETUP.bat\`** 더블 클릭 (관리자 권한 불필요).
3. **확장 프로그램 로드**: Edge 브라우저 \`edge://extensions\` -> '개발자 모드' 켬 -> '압축 해제된 확장 로드'에서 폴더 내 **\`extension\`** 선택 -> 툴바 아이콘 클릭 후 **\`START\`** 실행.
4. **원복 절차**: 필요 시 언제든 **\`XPIDER_ROLLBACK.bat\`** 더블 클릭.

- **Process Pause Notice**: 개발자 환경을 오너 실물 PC로 간주하지 않으며, 오너분의 실물 PC 테스트 진행을 위해 절차를 일시 정지(Pause)하고 대기합니다.
- **Invariants**: DO 생산 노드 \`143.198.40.33:8443\` 무결 유지, SSH 22 영구 차단 유지, Opal/주거용 미통합 fail-closed.
`;

fs.writeFileSync('scratch_post_stop_start_smoke.txt', commentBody, 'utf8');
console.log('Draft written to scratch_post_stop_start_smoke.txt, length:', commentBody.length);

const out = execSync('gh issue comment 6 --repo goodkie/v-show --body-file scratch_post_stop_start_smoke.txt', { encoding: 'utf8' });
console.log('Posted comment response:', out);
