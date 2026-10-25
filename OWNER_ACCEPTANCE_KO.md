# XPIDER AutoForm Sender Pro — 오너 승인 및 인수 안내서 (Owner Acceptance)

> **버전**: v6.9g.10.3 (RC3.57 Private Owner Release)  
> **빌드 ID**: `R6.9G.10.3.7.1.4.73-20261025-P0-RC3.57`  
> **지원 환경**: Windows 10 / 11 64-bit, Microsoft Edge / Google Chrome, Node.js LTS (v22 / v24)  
> **공식 배포 URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.57.7.1.4.73  
> **에셋 파일**: `XPIDER_R6.9G.10.3.7.1.4.73_PRIVATE_EGRESS_RC3.57.zip`  
> **패키지 SHA256**: `b0bb98cf1245c38db61c4d1de9d7f4c3dad1bf4a02bc61f2faab62f21a07ea0f`  

---

## 🚀 3단계 원클릭 설치 및 실행 절차 (<= 3 Simple Steps)

### 1단계: 원클릭 OS 자동 설정 실행
- 다운로드한 ZIP 압축을 임의 폴더에 해제한 후, **`XPIDER_AUTO_SETUP.bat`** 파일을 더블 클릭합니다.
- 관리자 권한 불필요 (`HKCU` 사용자 레지스트리 기반).
- 백그라운드 프라이빗 릴레이(포트 18988 / 18989) 기동 및 네이티브 메시징 호스트가 Windows 레지스트리에 자동 등록됩니다.
- *(선택)* 사전 환경 점검이 필요한 경우 **`QUICK_PREFLIGHT.bat`**를 실행하여 1초 내에 점검할 수 있습니다.

### 2단계: 브라우저에 확장 프로그램 로드
1. **Microsoft Edge** 또는 **Google Chrome** 브라우저를 엽니다.
2. 주소창에 `edge://extensions` (Edge) 또는 `chrome://extensions` (Chrome)을 입력합니다.
3. 우측 상단의 **'개발자 모드' (Developer mode)**를 켭니다.
4. **'압축해제된 확장 프로그램 로드' (Load unpacked)** 버튼을 클릭하고, 압축 해제 폴더 내 **`extension`** 폴더를 선택합니다.

### 3단계: 확장 프로그램 팝업 열기 및 시작
1. 브라우저 툴바의 **XPIDER 아이콘**을 클릭하여 팝업을 엽니다.
2. 폼 발송 대상 및 템플릿(이름, 이메일, 문의 본문)을 확인합니다.
3. **`START`** 버튼을 클릭하여 안전한 프라이빗 이그레스 릴레이를 통한 자동 전송을 시작합니다.

---

## 🔄 원클릭 원복 및 제거 (Rollback & Clean Removal)

- 확장을 제거하거나 이전 상태로 복구해야 할 경우, 압축 해제 폴더 내 **`XPIDER_ROLLBACK.bat`**를 더블 클릭합니다.
- 백그라운드 컴패니언 프로세스가 즉시 안전하게 종료되며, `HKCU` 레지스트리에 등록된 네이티브 메시징 호스트가 완전 삭제됩니다.
- 소유자의 DPAPI 암호화 제어 토큰은 비파괴적으로 보존됩니다.

---

## 🔒 보안, 인프라 및 지원 한계 (Honest Boundaries & Disclosures)

1. **DigitalOcean 프러덕션 전용 노드 (`143.198.40.33:8443`)**:
   - 상시 암호화 이그레스 포트 8443이 열려 있으며, 오너 전용 IP에서만 접근 가능하도록 Cloud Firewall로 보호됩니다.
2. **DigitalOcean SSH 22 포트 영구 차단 (DO SSH Blocked)**:
   - 보안 아키텍처 원칙에 따라 내부 UFW 및 키 삭제를 통해 SSH 포트 22는 **엄격히 차단(BLOCKED)**되어 있으며, 원격 터미널 접근은 지원되지 않습니다.
3. **GL.iNet Opal 물리 라우터 & 주거용 프록시 (Fail-Closed Disclosures)**:
   - 본 패키지는 물리 라우터 하드웨어 및 외부 유상 주거용 프록시를 강제 통합하지 않습니다. 해당 장비나 자격 증명이 부재할 경우 시스템은 **안전 차단(Fail-Closed)** 모드로 진입합니다.
   - *이중 주거용 프록시나 상용 VPN 동등성을 허위 주장하지 않습니다.*
4. **안전한 CAPTCHA 정책 (Zero Bypass)**:
   - 인공적인 캡차 무단 우회나 비인가 외부 전송을 시도하지 않으며, Turnstile 또는 reCAPTCHA 감지 시 소유자 수동 확인(`PENDING_OWNER`) 상태로 안전하게 일시정지합니다.

---

## 📋 실 PC 인수 검증 증적 및 상태 경계 (Factual PASS vs UNVERIFIED)

### ✅ 실물 Windows PC 검증 완료 (PASS)
- **로컬 폼 자동화**: DOM 탐색, 시맨틱 입력 매핑, 폼 전송, HistoryStore 중복 방지, 일시정지/재개/중지 라이프사이클 정상 통과.
- **RC3.57 기동 진단 & 자가 치유(Self-Recovery)**: 부팅 직후 방화벽 IP 불일치 시 `phase=UPSTREAM_TLS` 타임아웃 정확히 진단 후 무한 백오프 재시도 대기. 오너가 DO 방화벽에 새 공인 IP(`159.26.98.242/32`)를 등록하자 프로세스 재시작 없이 30초 내 `relayReady=True`, `lifecycleState=READY`, `phase=SUCCESS` (지연시간 378ms)로 자동 복구됨.
- **실제 프라이빗 이그레스 경로**: 로컬 프록시(`127.0.0.1:18988`)를 통한 `https://api.ipify.org` 조회 시 DO Droplet 공인 IP인 `143.198.40.33`이 정확히 반환되었으며, 프록시 미경유 시에는 오너 PC의 Proton VPN IP(`159.26.98.242`)가 반환되어 프록시 우회 및 분기 라우팅 정상 동작 입증.

### ⚠️ 미검증 아키텍처 경계 (UNVERIFIED)
- **종단간 기밀성 / DNS / WebRTC 누수 방지**: 실제 운영 대상 도메인 전체에 대한 완벽한 DNS 누수 방지는 아직 별도 계측되지 않았으며 추후 운영 단계에서 지속 관측 필요.
- **물리 라우터(GL.iNet Opal) & 유상 주거용 프록시**: 물리 장비 연동 전 상태로 `NOT VERIFIED / CONFIG_REQUIRED` 안전 차단(Fail-Closed) 유지.

---

## 🔍 프록시 'Not Found' 텍스트 관련 기술 분석 (Status & Header Testing)

- **재현 및 원인 규명**:
  - `curl -x http://127.0.0.1:18988 https://api.ipify.org` (HTTPS CONNECT 터널링): `HTTP/1.1 200 Connection Established` -> `HTTP/1.1 200 OK` -> `143.198.40.33` 정상 반환.
  - `curl -x http://127.0.0.1:18988 http://api.ipify.org` (일반 HTTP 포워딩): Droplet의 `proxy-service.js`는 보안상 **HTTP CONNECT 터널링 전용** 프록시로 설계되어 있으며, 표준 HTTP `request` 이벤트에 대해서는 내부 헬스체크(`/_health`, `/_telemetry`) 외 모든 요청에 대해 `404 Not Found`로 차단(Fail-Closed)하도록 하드코딩되어 있습니다 (`res.writeHead(404); res.end('Not Found\n')`).
  - 오너 쉘 테스트 시 일반 HTTP 요청 또는 미지원 경로 테스트의 404 응답이 후속 HTTPS 응답과 혼합 출력된 것으로, 브라우저 확장 프로그램의 실제 웹 폼 전송(HTTPS CONNECT 기반)에는 전혀 영향을 미치지 않는 정상적인 보안 차단 동작입니다.

---

## 🛡️ 동적 VPN IP 변경 시 최소 권한 방화벽 갱신 전략 (Proposed Strategy)

Proton VPN 재접속 시 공인 IP가 수시로 변경되는 환경에서 안전하게 인바운드를 갱신하기 위한 전략입니다:
1. **0.0.0.0/0 완전 금지 & TLS 무력화 금지**: 전체 개방을 절대 하지 않으며 `rejectUnauthorized=true`를 엄격히 유지합니다.
2. **사전 자동 감지 (Pre-flight IP Discovery)**: `UPSTREAM_TLS` 타임아웃 감지 시 컴패니언이 현재 로컬 PC의 공인 IP(`159.26.98.242`)를 안전하게 판별합니다.
3. **오너 승인 기반 단일 클릭 스크립트 제공**:
   - 오너가 직접 실행할 수 있는 `QUICK_UPDATE_FIREWALL_IP.bat` 스크립트를 제공하여, 변경된 IP를 오너 화면에 명시적으로 확인(`승인하시겠습니까? (Y/N)`)받은 후 DO API를 통해 단일 `/32` 규칙만 갱신(기존 안전 IP 보존, 불필요 IP 자동 정리)합니다.
   - 무단 백그라운드 변조나 토큰 노출이 원천 차단됩니다.

