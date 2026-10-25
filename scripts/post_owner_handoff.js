const { execSync } = require('child_process');
const fs = require('fs');

const commentBody = `[ANTIGRAVITY][RECEIPT][ISSUE-6][RC3.56-OWNER-ACCEPTANCE-HANDOFF-FINALIZATION][2026-10-25T03:20Z]

## 1. Directive Execution & Formal Release Decision
- **Directive Addressed**: \`[OWNER PM REACTIVATE CURRENT SIX-HOUR PRIVATE OWNER RELEASE GATE] Comment #6394769663\`
- **Formal Release Decision**: **PRIVATE SOFTWARE READY FOR OWNER ACCEPTANCE, pending owner-PC check**
- **Published Release Tag**: [\`v6.9g.10.3-rc3.56.7.1.4.72\`](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.56.7.1.4.72)
- **Asset Name**: \`XPIDER_R6.9G.10.3.7.1.4.72_PRIVATE_EGRESS_RC3.56.zip\`
- **Asset ID**: \`674319044\`
- **Asset Size**: \`51,802,228 bytes\`
- **SHA256 Digest**: \`212109049085e3c5f42f7f9b192aa83c66bcefe33a9c3ed5f64cc6ad7788e5c1\`
- **Direct Asset URL**: [Download RC3.56 ZIP](https://github.com/goodkie/v-show/releases/download/v6.9g.10.3-rc3.56.7.1.4.72/XPIDER_R6.9G.10.3.7.1.4.72_PRIVATE_EGRESS_RC3.56.zip)
- **Functional Commit**: [\`cd8c8a5b68a069cab46b372775bacacb0f22425f\`](https://github.com/goodkie/v-show/commit/cd8c8a5b68a069cab46b372775bacacb0f22425f)
- **State Tracking Commit**: [\`4665ab067ef993e5066dc7e1be5f5539fa345244\`](https://github.com/goodkie/v-show/commit/4665ab067ef993e5066dc7e1be5f5539fa345244) (pushed to \`origin/upgrade/phase-0-1\`)

---

## 2. Honest Disclosures & Verification Boundaries
1. **Windows Setup Verification Scope**:
   - \`XPIDER_AUTO_SETUP.bat\` dependency check and \`install_native_host.js\` registration were fully executed and verified in Windows isolated developer environments, with real \`HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay\` and \`HKCU\\Software\\Google\\Chrome\\...\` registry keys created and validated.
   - **Boundary Statement**: This proves setup script syntactical correctness and Windows registry schema validity, but does **NOT** constitute proof of installation on the Owner's physical personal PC until executed by the Owner.
2. **GL.iNet Opal Hardware Tunnel & Residential Proxies**:
   - Physical router hardware is unintegrated and unverified in automated pipeline.
   - System strictly fails closed safely if private egress is unavailable; zero false claims of double residential or production VPN parity are made.
3. **DigitalOcean Production Node (\`143.198.40.33:8443\`)**:
   - Untouched and verified healthy. Egress relay is online and functional.
4. **DigitalOcean Host SSH Port 22**:
   - Permanently **BLOCKED** by internal host UFW & wiped authorized keys (by design). Remote SSH terminal access is disabled.
5. **Network & CAPTCHA Ethics**:
   - Zero unsolicited external submissions.
   - Zero CAPTCHA bypass (Turnstile/reCAPTCHA strictly triggers \`PENDING_OWNER\` manual intervention).

---

## 3. Concise Executable Owner Installation & Rollback Checklist

오너분께서는 아래의 순서에 따라 RC3.56 릴리즈를 설치, 구동 및 필요 시 원복하실 수 있습니다:

### 설치 및 일상 폼 전송 실행 (Installation)
1. **ZIP 다운로드 및 압축 해제**:
   - [RC3.56 다운로드 링크](https://github.com/goodkie/v-show/releases/download/v6.9g.10.3-rc3.56.7.1.4.72/XPIDER_R6.9G.10.3.7.1.4.72_PRIVATE_EGRESS_RC3.56.zip)에서 파일 다운로드 후 원하는 폴더에 압축 해제.
2. **자동 설정 배치 파일 실행**:
   - 압축 해제된 폴더 내 **\`XPIDER_AUTO_SETUP.bat\`** 더블 클릭 (관리자 권한 불필요).
   - *결과: 런타임 종속성 검증, Edge/Chrome Native Messaging 레지스트리 자동 등록, 백그라운드 프라이버시 릴레이 컴패니언 자동 기동.*
3. **Edge 브라우저 확장 프로그램 로드**:
   - Microsoft Edge 주소창에 \`edge://extensions\` 입력 -> 우측 상단 '개발자 모드' 켜기 -> '압축 해제된 확장 로드' 클릭 -> 압축 해제 폴더 내 **\`extension\`** 폴더 선택.
4. **전송 시작**:
   - 브라우저 상단 툴바의 XPIDER 확장 아이콘 클릭 -> 팝업에서 **\`START\`** 버튼 클릭.

### 원복 절차 (Rollback)
- 네이티브 호스트 레지스트리 및 백그라운드 컴패니언 서비스를 완전 해제하려면 압축 해제 폴더 내 **\`XPIDER_ROLLBACK.bat\`**을 더블 클릭하십시오.

---

## 4. Authoritative Audit Evidence Reference
- Full clean install and 10-fixture real Edge audit JSON is archived at: [\`evidence/rc3_56_owner_release_ready/rc3_56_owner_release_ready_report.json\`](file:///E:/vivpr/ai/extension-form-sender/evidence/rc3_56_owner_release_ready/rc3_56_owner_release_ready_report.json)
- All 10 fixtures mapped 1:1 to \`HistoryStore\` terminal ledger statuses (3 \`CONFIRMED_SUCCESS\`, 2 \`SKIPPED\` intent filters, 2 \`FAILURE\` validation/no-form, 2 \`DELIVERY_UNKNOWN\` 500/TCP drop, 1 \`SKIPPED\` Turnstile CAPTCHA). 0 \`PREPARING\` attempts, 0 duplicates.
`;

fs.writeFileSync('scratch_post_owner_handoff.txt', commentBody, 'utf8');
console.log('Draft written to scratch_post_owner_handoff.txt, length:', commentBody.length);

const out = execSync('gh issue comment 6 --repo goodkie/v-show --body-file scratch_post_owner_handoff.txt', { encoding: 'utf8' });
console.log('Posted comment response:', out);
