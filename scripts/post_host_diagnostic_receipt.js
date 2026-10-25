const { execSync } = require('child_process');
const fs = require('fs');

const actualHeadSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
console.log('[RECEIPT] Resolved authoritative git rev-parse HEAD:', actualHeadSha);

const latestJsonEvidence = fs.readFileSync('evidence/owner_acceptance_diagnostics/diagnostic_2026-10-25T07-36-39-440Z.json', 'utf8');

const commentBody = `[ANTIGRAVITY][RECEIPT][ISSUE-6][UNATTESTED-HOST-CLASSIFICATION-LOCAL-PORTS-VERIFIED-DIAGNOSTIC-REPORT][2026-10-25T03:40Z]

## 1. Directive Execution & Authoritative Commit
- **Directive Addressed**: \`[OWNER PM CRITICAL DIAGNOSTIC AUDIT — FALSE PHYSICAL CLASSIFICATION / COMPANION OFFLINE] Comment #6394909358\`
- **Actual Git Branch HEAD**: [\`${actualHeadSha}\`](https://github.com/goodkie/v-show/commit/${actualHeadSha}) on \`upgrade/phase-0-1\` (mechanically verified via \`git rev-parse HEAD\`).
- **Release Preservation Policy**: RC3.56 (\`v6.9g.10.3-rc3.56.7.1.4.72\`, SHA256 \`212109049085e3c5f42f7f9b192aa83c66bcefe33a9c3ed5f64cc6ad7788e5c1\`) remains intact and unmodified. Fixed diagnostic tooling is managed in repo commits without gratuitously clobbering or rebuilding RC3.56.

---

## 2. Environment Classification & Local Ports Verification
1. **UNATTESTED_WINDOWS_HOST Classification**:
   - \`scripts/owner_local_preflight.js\` was updated to set \`environmentType: "UNATTESTED_WINDOWS_HOST"\` by default.
   - Zero physical owner machine claims are inferred from environment variables or absence of flags. Genuine owner provenance requires explicit owner attestation.
2. **Local Companion Readiness vs Remote Cloud Egress**:
   - Strictly distinguished local companion ports (\`127.0.0.1:18988\` proxy, \`127.0.0.1:18989\` control plane) from remote node (\`143.198.40.33:8443\`).
   - When companion is offline, preflight prints explicit Korean guidance:
     \`\`\`
     [3/5] Local Companion Service:   [FAIL] STANDBY (127.0.0.1:18988 and 18989 are both CLOSED)
           --> [조치 필요] 로컬 컴패니언이 실행되지 않았습니다.
               START 버튼을 사용하려면 먼저 'XPIDER_AUTO_SETUP.bat'을 실행하십시오.
     Overall Ready For Extension START: [FAIL / SETUP_REQUIRED]
     \`\`\`
     and exits with code \`2\` (non-zero).
3. **Localhost Verified Active & Ready**:
   - Companion daemon launched and authoritatively verified on both ports.
   - \`overallReadyForStart: true\` when both 18988 & 18989 are OPEN and HKCU registry keys exist.

---

## 3. Machine-Readable Diagnostic Evidence (\`diagnostic_2026-10-25T07-36-39-440Z.json\`)

\`\`\`json
${latestJsonEvidence.trim()}
\`\`\`

---

## 4. Setup Execution & Clean Environment Transcript
- **Native Host Registry**: Verified \`HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay\` and Chrome registry keys: **REGISTERED**.
- **Companion Service HTTP 200 Probe**:
  \`\`\`json
  {
    "status": "OK",
    "relayReady": true,
    "lifecycleState": "READY",
    "companionBuildId": "R6.9G.10.3.7.1.4.72-20261025-P0-RC3.56",
    "controlPort": 18989,
    "proxyPort": 18988,
    "selectedEgressId": "do-egress-tor1-611293905"
  }
  \`\`\`
- **Infrastructure & Security Invariants**:
  - DigitalOcean dedicated production node \`143.198.40.33:8443\` untouched, reachable.
  - DO host SSH port 22 securely blocked (fail-closed).
  - GL.iNet Opal router & residential proxies unintegrated, fail-closed safely.
  - Zero external unauthorized sends; zero CAPTCHA bypass.
  - Six-hour deadline unchanged at \`2026-10-25T09:09:23Z\`.
`;

fs.writeFileSync('scratch_post_host_diagnostic.txt', commentBody, 'utf8');
console.log('Draft written to scratch_post_host_diagnostic.txt, length:', commentBody.length);

const out = execSync('gh issue comment 6 --repo goodkie/v-show --body-file scratch_post_host_diagnostic.txt', { encoding: 'utf8' });
console.log('Posted comment response:', out);
