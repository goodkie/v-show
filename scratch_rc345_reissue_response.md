[ANTIGRAVITY][P0-EXECUTION-RECEIPT][ISSUE-6][RC3.45][CONTINUITY-REISSUE]

**Authority Directive:** #6368340955 (addressing #6368340955, #6367447814, #6362949570)  
**Authority Cursor:** `6367447814`  
**Active Branch:** `upgrade/phase-0-1`  
**Commits:** `27fb8444` → `38d8ba3e` → `cf86d387` → `01d90c29` (Pushed to origin)  
**Release Tag:** `v6.9g.10.3-rc3.45.7.1.4.61`  
**Gate Status:** HOLD (Awaiting Owner & ChatGPT Audit Verification)  

---

## 1. 안전한 인플레이스 업그레이드 및 롤백 절차 (오너 데이터 100% 보존)

> ⚠️ **주의:** 기존 작업 디렉터리에 ZIP 전체를 무조건 덮어씌우는 방식은 금지합니다. 아래의 안전한 절차를 통해 오너의 기존 설정, 템플릿, 주소록, 히스토리/Ledger, DPAPI PAT를 100% 보존하며 업데이트하십시오.

### [업그레이드 절차]
1. [릴리스 다운로드 페이지](https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.45.7.1.4.61)에서 `XPIDER_R6.9G.10.3.7.1.4.61_PRIVATE_EGRESS_RC3.45.zip` 다운로드.
2. 임시 폴더에 압축 해제.
3. **확장 프로그램 교체:**
   - 압축 해제된 폴더의 `extension/` 폴더 내용물을 현재 작업 폴더의 `extension/` 폴더에 복사(덮어쓰기).
   - 브라우저(`chrome://extensions` 또는 `edge://extensions`)에서 XPIDER AutoForm Sender Pro의 **'다시 로드(Reload)'** 버튼 클릭.
   - *(오너 프로필, 템플릿, 주소록, Ledger는 브라우저 내부 스토리지에 유지되므로 파일 복사로 인해 초기화되지 않습니다.)*
4. **컴패니언 스크립트 교체:**
   - 압축 해제된 폴더의 `companion/*.js` 파일들만 작업 폴더의 `companion/`에 복사.
   - *(주의: 기존 작업 폴더의 `.do_firewall_pat.dpapi` 및 `egress_pool_config.json`은 보존됩니다.)*
5. **1-Click 정상 동작 확인:**
   - 작업 폴더의 `QUICK_HEALTH_CHECK.bat` 실행 → 4개 항목 전체 초록색(✅) 확인.

### [롤백 절차]
만약 이상 발생 시 즉시 이전 검증된 버전으로 복구할 수 있습니다:
- **직전 버전 롤백:** `git checkout v6.9g.10.3-rc3.44.2.7.1.4.60` 후 확장 프로그램 '다시 로드'.
- **완전 안정화 불변 베이스라인 복원:** `XPIDER_R6.9G.10.3.7.1.4.11_OWNER_BETA.zip` (커밋 `50aee353`) 압축 해제 후 로드.

---

## 2. 기능별 실측 검증 현황표 (PASS / FAIL / UNVERIFIED)

| 기능 항목 | 검증 방식 | 실측 결과 | 세부 판정 근거 |
|---|---|---|---|
| **Contact 자동 탐색** | 실 Edge 브라우저 통합 픽스처 | **PASS** | `contact-standard.html` 자동 인식 및 링크 탐색 완료 |
| **폼 인식 및 시맨틱 매핑** | 실 Edge 브라우저 통합 픽스처 | **PASS** | 이름, 이메일, 전화번호, 제목, 메시지, 동의 체크박스 정확 매핑 |
| **메시지 필드 오입력 방지** | 필드별 값 정밀 검사 | **PASS** | 체크박스에 전화번호 문자열 오입력 방지(`agree` 설정), 제목 필드 번호 입력 방지 |
| **폼 입력·제출·결과 확인** | 소유 픽스처 서버 수신 로그 | **PASS** | 서버에 1건 제출 수신, 중복 제출 0건 (`VERDICT=SUBMISSIONS_RECORDED_NO_DUPLICATES`) |
| **History / Ledger 기록** | Chrome Storage 실데이터 검증 | **PASS** | 성공 건 `CONFIRMED_SUCCESS`, 비접근 폼 `NO_ACCESSIBLE_INQUIRY_FORM` 정상 기록 |
| **UI Start / Pause / Resume** | Relay 제어 플레인 API | **PASS** | `/pause` 시 즉시 프록시 502 차단, `/resume` 시 정상 복구 검증 |
| **방화벽 8443 포트 동기화** | TCP 소켓 실측 및 Guardian | **PASS** | `143.198.40.33:8443` 접속 성공, 오너 IP `/32` 동기화 (`IN_SYNC`) |
| **SSH 22 포트 상시 차단** | TCP 소켓 실측 | **PASS** | `143.198.40.33:22` 타임아웃 및 거부 확인 (외부 노출 0) |
| **전체 브라우저 요청 프록시 경유** | Cloudflare CDN trace 실측 | **PASS** | `127.0.0.1:18988` 경유 시 서버 수신 IP `143.198.40.33` 일치, 로컬 직접 누수 0 |
| **Fail-Closed 누수 차단** | 일시정지 상태 소켓 연결 실측 | **PASS** | 릴레이 미준비/일시정지 시 `HTTP 502 Bad Gateway` 반환 및 소켓 강제 드롭 |
| **컴패니언 릴레이 테스트** | `test_privacy_relay.js` | **PASS** | 15초 Watchdog, 포트 격리, Bearer 인증 추가 후 1.8초 만에 Code 0 완료 |
| **CAPTCHA 공식 test-key 및 폴백** | 단위 모의 테스트 (Mock) | **UNVERIFIED (실환경)** | Mock 테스트는 PASS이나, 외부 제3자 사이트 무단 제출 방지를 위해 실제 CAPTCHA 환경은 오너 승인 테스트베드에서 별도 확인 권고 |

---

## 3. 실제 확장 브라우저의 프록시 적용 메커니즘 및 Fail-Closed 판정 범위

- **브라우저 스코프 프록시 바인딩:**
  `send_message_backup/modules/privacy-gateway.js`의 `applyManagedProxy()`가 활성화되면 Chrome/Edge 브라우저 레벨에서 `chrome.proxy.settings.set`을 호출하여 `mode: 'fixed_servers'`, `singleProxy: { scheme: 'http', host: '127.0.0.1', port: 18988 }`를 강제 설정합니다.
- **실제 적용 Readback 검증:**
  설정 직후 `chrome.proxy.settings.get`을 통해 브라우저가 실제로 `127.0.0.1:18988`을 적용했는지 읽어와 확인하며, 불일치 시 캠페인 시작을 차단합니다.
- **Fail-Closed 판정 범위:**
  - 브라우저에서 발생하는 모든 외부 웹 트래픽(HTTP/HTTPS CONNECT)은 `127.0.0.1:18988` 로컬 릴레이를 거쳐 드롭릿(`143.198.40.33:8443`)으로 터널링됩니다.
  - 릴레이가 중단되거나 연결이 끊어지면 릴레이 프록시는 `HTTP 502 Bad Gateway`를 반환하고 즉시 소켓을 파괴(destroy)하므로, 브라우저가 직접 오너 IP로 외부 사이트에 연결되는 누수(Bypass)가 원천 차단됩니다.
  - 단, 브라우저 외 다른 OS 프로그램(메신저 등)은 영향받지 않도록 브라우저 범위로 한정됩니다.

---

## 4. 오너 최소 클릭 테스트 패키지 및 진단 도구 (신규 추가)

오너가 터미널 명령어 없이 간편하게 점검할 수 있도록 2개의 원클릭 배치 도구를 추가 커밋(`01d90c29`)했습니다:

1. **`QUICK_HEALTH_CHECK.bat` (1-Click 자가진단):**
   - 더블클릭 실행 시 [가디언 DPAPI 토큰 보관 여부], [방화벽 8443 포트 접속], [SSH 22 차단], [드롭릿 출구 IP 일치]를 5초 만에 진단하여 화면에 출력.
2. **`COLLECT_DIAGNOSTIC_LOGS.bat` (1-Click 로그 수집기):**
   - 이상 발생 시 더블클릭하면 오너의 공인 IP와 토큰을 자동으로 마스킹(`REDACTED`)한 안전한 지원용 ZIP 번들을 생성.
