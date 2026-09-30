## [ANTIGRAVITY][DISCOVERY][extension-form-sender]

**Report Date:** 2026-09-30  
**Stage:** DISCOVERY  
**Reporter:** Antigravity  
**Source Path:** `E:\vivpr\ai\extension-form-sender\send_message_backup`

---

## A. EXECUTIVE SUMMARY

현재 `send_message_backup` 디렉토리는 **XPIDER AutoForm Sender Pro v1.2.0** Chrome Extension의 완전한 소스 스냅샷입니다. Git 저장소는 존재하지 않으며, 이 폴더 자체가 v1.1.0 Restore Point로 문서화된 안정화 상태의 스냅샷입니다.

Extension은 **Manifest V3** 기반이며, Side Panel을 기본 UI로 사용합니다. 핵심 기능은 URL 목록을 받아 각 사이트의 Contact Form을 자동 탐지하고, 사용자 템플릿 데이터(이름/이메일/전화/메시지)를 자동 입력 후 Submit하는 **대량 폼 자동 발송 엔진**입니다.

코드 규모:
- `content-script.js`: **2,621줄** (138KB) — Form 탐지/입력/제출 전체 엔진
- `popup.js`: **1,712줄** (76KB) — Side Panel UI 로직
- `background.js`: **1,161줄** (49KB) — Service Worker 캠페인 오케스트레이터

---

## B. CURRENT EXTENSION

| 항목 | 값 |
|---|---|
| **Name** | XPIDER AutoForm Sender Pro |
| **Version** | 1.2.0 (manifest.json 기준) / HTML에 v1.1.0 표시 |
| **Manifest Version** | 3 (MV3) |
| **Status** | BACKUP SNAPSHOT — Git 없음, 빌드 시스템 없음, 테스트 없음 |

---

## C. REPOSITORY / LOCAL SOURCE

| 항목 | 값 |
|---|---|
| **Source Path** | `E:\vivpr\ai\extension-form-sender\send_message_backup` |
| **Git Repository** | ❌ NOT FOUND |
| **Build System** | 없음 (Raw JS 파일 직접 로드) |
| **Version Control** | `RESTORE_POINT_SUMMARY.md`로 수동 관리 |

---

## D. ARCHITECTURE

```
[User] → Side Panel (popup.html + popup.js)
    ↓  chrome.runtime.sendMessage
[Background Service Worker] (background.js)
    ├── Campaign Orchestrator (processNextCampaignTarget)
    ├── Contact Path Scanner (scanContactPaths — HTTP fetch)
    ├── Single-URL Orchestrator (orchestrateSending)
    ├── Tab Manager (safeTabs wrapper)
    ├── CAPTCHA Solver Core (XpiderSolverCore — inline class)
    ├── Alarm-based Watchdog
    └── Campaign State (in-memory + chrome.storage.local)
        ↓  chrome.scripting.executeScript
[Content Script] (content-script.js)
    ├── Form Discovery Engine (findOptimalForm — score-based)
    ├── Form Fill Engine (fillFormIntelligent — HyperEngine v4.0)
    │   ├── typeHumanlike (Bezier mouse + char-by-char typing)
    │   ├── applySelect / applyCustomDropdown
    │   ├── applyRadio / applyCheckbox
    │   └── selfHealErrorFields
    ├── Submit Controller (submitForm — Shadow DOM 지원)
    └── Success Detector (detectSubmissionResult — 10s multi-poll)
        ↓  chrome.runtime.sendMessage (SENDER_FINISHED)
[Background] → chrome.storage 갱신 → UPDATE_STATS → [Popup UI]
```

**추가:**
- `solver-content.js`: CAPTCHA iframe 전용 Content Script + Stealth Patch (navigator.webdriver 위조)
- `xpiderInvoke()`: window.postMessage IPC 브리지 — Electron Wrapper 연동 흔적

---

## E. COMPONENT INVENTORY

| Component | 역할 | Source | Lines |
|---|---|---|---|
| **Campaign Orchestrator** | 전체 캠페인 루프 | background.js | 481-671 |
| **Contact Path Scanner** | HTTP fetch 사전 경로 탐지 | background.js | 781-815 |
| **orchestrateSending** | 단일 URL 처리 | background.js | 817-1050 |
| **navWatcher** | SPA URL 변경 감지 | background.js | 930-957 |
| **saveCampaignState** | 상태 영속화 | background.js | 1052-1078 |
| **restoreCampaignState** | SW 재시작 복구 | background.js | 1080-1128 |
| **XpiderSolverCore** | CAPTCHA 해결 (Wit.ai/2Captcha/NopeCHA) | background.js | 171-307 |
| **findOptimalForm** | 점수 기반 최적 폼 탐지 | content-script.js | 666-851 |
| **fillFormIntelligent** | HyperEngine v4.0 (11단계) | content-script.js | 853-1905 |
| **typeHumanlike** | Bezier 마우스 + 1자씩 타이핑 | content-script.js | 1301-1409 |
| **submitForm** | Shadow DOM 포함 Submit | content-script.js | 2419-2467 |
| **detectSubmissionResult** | 10초 5기준 성공 판정 | content-script.js | 2469-2611 |
| **selfHealErrorFields** | 에러 필드 자가 복구 | content-script.js | 2097-2257 |
| **startActiveEmptyFieldSweeper** | 150ms 공란 실시간 감시 | content-script.js | 2263-2354 |
| **XpiderSolverContent** | CAPTCHA iframe 처리 | solver-content.js | 73+ |
| **Popup UI Controller** | Campaign 제어 및 상태 | popup.js | 전체 |

---

## F. SOURCE MAP

```
send_message_backup/
├── manifest.json          [1.5KB]  MV3, v1.2.0
├── RESTORE_POINT_SUMMARY.md        v1.1.0 수동 체인지로그
├── background.js         [49KB, 1161줄]  Service Worker — Campaign Engine
├── content-script.js    [138KB, 2621줄]  Content Script — Form Engine
├── popup.js              [76KB, 1712줄]  Side Panel Logic
├── popup.html            [21KB, 340줄]   Side Panel UI
├── popup.css             [28KB]          Styling
├── solver-core.js         [5.5KB]  ESM export class (연결 미확인)
├── solver-content.js      [18KB]   CAPTCHA Content Script
├── blacklist_data.js      [7.3KB]  3333+ 블랙리스트 도메인
├── translations.js        [15KB]   i18n (EN/KO/JA/ZH/ES/DE/FR/IT/PT/ID)
├── icons/ ...
└── build/
    └── extension/   [소스 복사본 — 동일 파일 구조]
```

---

## G. USER FLOW

1. Extension 설치 → Side Panel 자동 오픈
2. Template 탭: 발신자 정보 입력 (이름/이메일/전화/메시지)
3. Campaign 탭: URL 목록 입력 (수동 / CSV/TXT 업로드)
4. Settings: 언어, CAPTCHA 해결 방식(Audio/2Captcha/NopeCHA), Stealth Mode, Double Submit
5. "Start Sending" → START_CAMPAIGN → background
6. Background Loop:
   - URL queue에서 FIFO 처리
   - about:blank 탭 생성 후 URL 로드
   - scanContactPaths: 50경로 병렬 사전 탐색
   - content-script + solver-content 주입
7. Content Script:
   - 팝업/배너 제거, 폼 3회 폴링 탐지
   - 없으면 링크 스캔 → 네비게이션
   - 발견 시 HyperEngine v4.0 11단계 자동 입력
   - CAPTCHA 시 solver 작동 (최대 3회)
   - Submit → 10초 5기준 성공 판정
   - 에러 감지 시 자가 복구 후 재제출
8. 결과 → SENDER_FINISHED → background → UPDATE_STATS → popup
9. Queue 소진 시 완료. CSV export 기능 미구현.

---

## H. MESSAGE / EVENT FLOW

**주요 액션:**
- `START_CAMPAIGN`, `STOP_CAMPAIGN`, `PAUSE_CAMPAIGN`, `RESUME_CAMPAIGN`
- `GET_STATE`, `PING`, `UI_HEARTBEAT`
- `SENDER_READY`, `SENDER_FINISHED`, `SENDER_LOG`
- `UPDATE_STATS`, `CLOSE_ALL_EXTRA_TABS`
- `PERFORM_TRANSCRIPTION`, `SOLVE_CAPTCHA`
- `QUEUE_BRANCHES` (content→bg 전송되나 bg에서 **미처리 — 버그**)
- `UPDATE_WIT_KEY`, `XPIDER_LOG`, `GET_BOOT_LOG`

---

## I. FORM DETECTION / SUBMISSION LOGIC

### findOptimalForm — 점수 기반 알고리즘

| 조건 | 점수 |
|---|---|
| `<form>` 태그 | +200 |
| `<textarea>` | +70 |
| `<input type="email">` | +50 |
| `<input type="tel">` | +40 |
| 입력 필드 2~45개 | +30 |
| WordPress CF7 (`wpcf7-form`) | +500 |
| Squarespace (`sqs-`) | +300 |
| Wix (`wixui`) | +250 |
| Shopify | +150 |
| Modal/Lightbox active | +450 |
| 검색 폼 (`search`) | -850 |
| BODY/HTML | -500 |
| 입력 필드 0개 | -999 |

**Threshold**: 일반 35점, Contact 페이지 10점

### Field Mapping (FIELD_PATTERNS)
- **대상 필드**: firstName, lastName, name, email, subject, phone, message
- **매칭 기준**: label + placeholder + name + id + className + aria-label + autocomplete
- **다국어**: KO/JA/ZH/ES/DE/FR
- **splitName**: 한글 복성 포함 (황보, 남궁 등) 2/3/4자 분리

### Auto-Fill: 11단계 HyperEngine v4.0
1. 전체 필드 수집 (form + 부모)
2. Native SELECT 처리
3. Custom Dropdown (React Select, MUI, Ant Design, Wix)
4. 약관/동의 체크박스
5. 텍스트 패턴 매칭
6. SmartHint 빈 필드 채우기
7. 미선택 라디오 그룹
8. 필수 체크박스
9. ARIA 커스텀 체크/라디오
10. contentEditable BruteForce
11. Super-BruteForce Final Sweeper

### typeHumanlike (Human-Like Mode)
- Bezier Curve 마우스 궤적 (6~10 step)
- 1자씩 keydown/keypress/input/keyup
- 1.2% 확률 오타 + Backspace 시뮬레이션
- 문장부호 180~400ms, 일반 45~95ms 딜레이

### Submit
- Shadow DOM 포함 탐색
- 텍스트 기반: `send`, `submit`, `전송`, `보내기`, `送信`
- 최후: `HTMLFormElement.prototype.submit.call(form)`

### Success Detection (10초 / 1초 폴링)
1. UI 요소 `thank you`, `완료되었습니다` 등
2. URL `thank/success/confirm/sent` 변경
3. 본문 새 성공 키워드 (preSnapshot 비교)
4. 폼 DOM에서 사라짐
5. Textarea 값 초기화 (AJAX 리셋)

### CAPTCHA
- 감지: iframe src `recaptcha/hcaptcha/turnstile`
- Audio(Wit.ai) / 2Captcha / NopeCHA / 수동 (4가지 모드)
- 동일 URL 3회 초과 시 중단

### Contact 경로 탐색
- 50개 경로 10개 배치 병렬 (no-cors, 2.5초 timeout)
- 한국어 `/문의`, 일본어 `/お問い合わせ`, 중국어 `/联系` 포함
- DOM 링크 점수화 (`findBestContactLink`)
- 최후: 홈페이지(`/`) 시도

---

## J. QUEUE / TAB / STATE MANAGEMENT

### Queue
- FIFO (`queue.shift()`), `chrome.storage.local` 영속화
- 중복: `visitedUrls[]` normalized 비교
- QUEUE_BRANCHES: Content→BG 전송되나 BG handler 없음 (**F-2 버그**)

### Tab Management
- `about:blank` 탭 생성 → URL 업데이트 방식
- 성공/실패/180초 timeout 후 `tabs.remove()` (finally 블록)

### SW Recovery
- `restoreCampaignState()`: SW 재시작 시 chrome.storage에서 복구
- `xpider_isActive=true` + queue.length>0 시 자동 재개

### Race Condition 방어
- `isLoopRunning` flag, `sessionId` 증가
- ⚠️ **잠재적 문제**: `processNextCampaignTarget:648`과 `finish():886` 양쪽에서 `successCount++`

---

## K. STORAGE / DATA MODEL

### chrome.storage.local 주요 Keys

| Key | Type | 설명 |
|---|---|---|
| `xpider_isActive` | boolean | 캠페인 활성 상태 |
| `xpider_queue` | string[] | 대기 URL 목록 |
| `xpider_tpl` | object | 메시지 템플릿 |
| `xpider_delayMs` | number | 타겟 간 딜레이 |
| `xpider_fillDelayMs` | number | 입력 딜레이 |
| `xpider_submitDelayMs` | number | 제출 딜레이 |
| `xpider_sessionId` | number | stale loop 차단 |
| `xpider_success` | number | 성공 카운트 |
| `xpider_visited` | string[] | 방문 URL |
| `xpider_successful` | string[] | 성공 URL |
| `xpider_stt_api_key` | string | Wit.ai Key (primary) |
| `audioSttKey` | string | Wit.ai Key (legacy) |
| `witKey` | string | Wit.ai Key (legacy2) |
| `captchaApiKey` | string | 2Captcha/NopeCHA Key (평문) |
| `xpider_fill_mode` | string | `instant` or `human` |
| `xpider_double_submit` | boolean | 이중 제출 모드 |
| `xpider_blackbox_logs` | object[] | 시스템 로그 (max 50) |
| `tplLibrary` | object | 템플릿 라이브러리 |
| `savedUrlLists` | object | 저장된 URL 목록 |

### sessionStorage (Content Script)

| Key | 용도 |
|---|---|
| `xpider_last_submit_path` | 마지막 제출 경로 |
| `xpider_initial_url` | 제출 전 초기 URL |
| `xpider_initial_form_present` | 초기 폼 존재 여부 |
| `xpider_pending_verify` | redirect recovery 플래그 |
| `xpider_submit_count` | Double Submit 카운터 |

---

## L. CHROME API / PERMISSIONS

```json
"permissions": ["storage", "tabs", "scripting", "activeTab", "sidePanel", "alarms", "downloads"]
"host_permissions": ["<all_urls>"]
```

| API | 사용 목적 |
|---|---|
| `chrome.tabs.create/update/remove/get` | 탭 생성/이동/종료 |
| `chrome.tabs.sendMessage` | Content Script 통신 |
| `chrome.tabs.onUpdated` | SPA 변경 감시 |
| `chrome.scripting.executeScript` | Content Script 동적 주입 |
| `chrome.storage.local.*` | 상태 저장/복구 |
| `chrome.runtime.sendMessage/onMessage` | 컴포넌트 간 통신 |
| `chrome.alarms.*` | Watchdog, Failsafe |
| `chrome.sidePanel.setPanelBehavior` | Side Panel 자동 오픈 |
| `chrome.runtime.reload` | Hard Reset |
| `downloads` | **미사용** |

---

## M. SECURITY / PRIVACY REVIEW

### 🔴 Critical

| # | 문제 | 위치 |
|---|---|---|
| C-1 | `<all_urls>` host_permission — 모든 사이트 완전 접근 | manifest.json:16 |
| C-2 | API Key 평문 저장 (`captchaApiKey`, `xpider_stt_api_key`) | chrome.storage.local |

### 🟠 High

| # | 문제 | 위치 |
|---|---|---|
| H-1 | `console.*` 전체 인터셉트 (3개 컨텍스트) | background/popup/content |
| H-2 | DOM 직접 조작 (요소 숨김/제거) | content-script.js |
| H-3 | `innerHTML` 사용 (XSS 패턴) | popup.js:383,385 |
| H-4 | `<script>` 동적 주입 — navigator.webdriver 위조 | solver-content.js:9-66 |

### 🟡 Medium

| # | 문제 | 위치 |
|---|---|---|
| M-1 | `downloads` 권한 미사용 | manifest.json |
| M-2 | 오디오 데이터 Wit.ai 외부 전송 | background.js:213 |
| M-3 | Wit.ai key 3중 저장 (3개 key로) | popup.js:302 |
| M-4 | navigator.webdriver 위조 (bot 탐지 우회) | solver-content.js:13 |

---

## N. TEST / QA STATUS

**테스트 커버리지: 0%**

| 항목 | 상태 |
|---|---|
| Unit / Integration / E2E Tests | NOT_VERIFIED — 파일 없음 |
| Lint Config | NOT_VERIFIED — .eslintrc 없음 |
| Build Script | NOT_VERIFIED — package.json 없음 |
| Git History | NOT_VERIFIED — Git 없음 |

---

## O. BUGS / TECHNICAL DEBT

### Functional Bugs

| # | 버그 | 위치 | 심각도 |
|---|---|---|---|
| F-1 | **Double successCount 카운팅** | background.js:648 AND 886 | HIGH |
| F-2 | **QUEUE_BRANCHES 핸들러 누락** | background.js onMessage | MEDIUM |
| F-3 | **버전 불일치** | popup.html `v1.1.0` vs manifest `v1.2.0` | LOW |
| F-4 | **solver-core.js ESM 미연결** | solver-core.js:6 (export class, import 없음) | MEDIUM |

### Reliability

| # | 이슈 | 심각도 |
|---|---|---|
| R-1 | MV3 SW 30초 종료 — setTimeout 기반 타이머 손실 가능 | HIGH |
| R-2 | `no-cors` fetch — opaque response로 실제 200/404 구분 불가 | MEDIUM |

### Architecture

- **A-1**: content-script.js 138KB 단일 파일
- **A-2**: 상수/설정 코드 내 하드코딩 산재
- **A-3**: XpiderSolverCore 중복 정의 (background 인라인 + solver-core.js ESM)
- **A-4**: Electron IPC 코드 혼재 (`xpiderInvoke`, `XPIDER_INVOKE`)
- **A-5**: build/ 목적 불명 (소스 동일 복사본)

---

## P. UPGRADE PROPOSALS

| ID | 제목 | 우선순위 | 난이도 |
|---|---|---|---|
| P0-F1 | double successCount 즉시 수정 (background.js:648 제거) | P0 | TRIVIAL |
| P0-F2 | QUEUE_BRANCHES 핸들러 구현 | P0 | LOW |
| P1-GIT | Git 저장소 + 기본 CI 구성 | P1 | LOW |
| P1-SW | SW Lifecycle — setTimeout→chrome.alarms 전면 교체 | P1 | HIGH |
| P2-MOD | content-script.js 모듈 분리 (FormDetector, FormFiller, etc.) | P2 | MEDIUM |
| P2-FETCH | no-cors fetch → HEAD request 교체 | P2 | LOW |
| P2-CSV | CSV Export 결과 기록 구현 | P2 | LOW |
| P3-KEY | API Key 암호화 저장 (crypto.subtle) | P3 | MEDIUM |
| P3-PERM | downloads 미사용 권한 제거 | P3 | TRIVIAL |

---

## Q. RISKS

| Risk | 심각도 |
|---|---|
| Chrome Web Store 거부 (`<all_urls>` + 광범위 권한) | HIGH |
| SW 종료로 캠페인 중단 (MV3 30초 제한) | HIGH |
| Double successCount 통계 오류 (F-1) | HIGH |
| Bot 탐지/IP 차단 | MEDIUM |
| Wit.ai 무료 티어 한도 초과 | MEDIUM |
| 사용자 오디오 외부 전송 | MEDIUM |
| Electron IPC 의존 이식성 문제 | LOW |

---

## R. QUESTIONS FOR CHATGPT

1. P0 버그(F-1, F-2) 수정을 Phase 1으로 처리할지
2. Git 도입을 Upgrade 최우선으로 포함할지
3. SW Lifecycle: setTimeout 완전 교체 vs 하이브리드 유지
4. Electron IPC 코드 (`xpiderInvoke`) 제거 여부
5. `<all_urls>` → activeTab 전환 가능 여부
6. 결과 저장: CSV download vs IndexedDB
7. E2E 테스트 도입 여부 (Playwright + Mock Extension)
8. solver-core.js: 삭제 vs background.js 통합
9. QUEUE_BRANCHES: main queue vs 별도 priority queue
10. Double Submit 기능의 계속 지원 여부

---

## S. EVIDENCE INDEX

| 항목 | 상태 |
|---|---|
| manifest.json, background.js, content-script.js | PASS |
| popup.js, popup.html, solver-content.js, solver-core.js | PASS |
| translations.js, blacklist_data.js, RESTORE_POINT_SUMMARY.md | PASS |
| build/extension/ (소스 복사본) | PASS |
| Git Repository | FAIL — 없음 |
| Build System / Tests | NOT_VERIFIED — 없음 |
| F-1 Double successCount | FAIL — 버그 확인 (background.js:648, 886) |
| F-2 QUEUE_BRANCHES 핸들러 | FAIL — case 없음 확인 |
| F-3 버전 불일치 | FAIL — popup.html v1.1.0 vs manifest v1.2.0 |
| F-4 solver-core.js ESM 미연결 | FAIL — import 없음 |
| C-1 `<all_urls>` | FAIL — 위험 권한 |
| C-2 API Key 평문 | FAIL — 평문 저장 확인 |
| M-1 downloads 미사용 | FAIL — 미사용 권한 |

---

```
REPORT PATH: E:\vivpr\ai\extension-form-sender\send_message_backup\ANTIGRAVITY_DISCOVERY_REPORT.md
REPORT STATUS: COMPLETE
GIT BRANCH: N/A (Git repo 없음)
HEAD SHA: N/A
TEST SUMMARY: 0% — 전체 테스트 미존재
BLOCKERS: 없음
```

**Discovery Report 완료.**  
ChatGPT에게 이 파일을 전달하여 GitHub Issue #6에 게시 및 Upgrade Master Plan 확정을 요청하십시오.
