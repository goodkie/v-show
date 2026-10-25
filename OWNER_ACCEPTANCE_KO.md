# XPIDER AutoForm Sender Pro — 오너 승인 및 인수 안내서 (Owner Acceptance)

> **버전**: v6.9g.10.3 (RC3.59 Private Owner Release)  
> **빌드 ID**: `R6.9G.10.3.7.1.4.75-20261025-P0-RC3.59`  
> **지원 환경**: Windows 10 / 11 64-bit, Microsoft Edge / Google Chrome, Node.js LTS (v22 / v24)  
> **공식 배포 URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.59.7.1.4.75  
> **에셋 파일**: `XPIDER_R6.9G.10.3.7.1.4.75_PRIVATE_EGRESS_RC3.59.zip`  
> **패키지 SHA256**: `e2493a9d6a27f7d2024b3e2a4955cf48df4908350684ac1bac10488b1141f147`  

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

## 🛡️ 동적 VPN IP 변경 시 오너 승인형 방화벽 갱신 (RC3.58 구현 완료)

Proton VPN 재접속 시 공인 IP가 변경되어 `RECONNECTING` 또는 `REMOTE_EGRESS_REPAIR_REQUIRED` 상태가 될 때, 오너가 직접 안전하게 방화벽을 갱신하는 3단계 절차입니다:

### 3단계 동적 방화벽 IP 갱신 절차 (<= 3 Simple Steps)

1. **배치 파일 실행**:
   - 압축 해제 폴더 내 **`QUICK_UPDATE_FIREWALL_IP.bat`**를 더블 클릭합니다.
2. **사전 점검 화면(Dry-Run Diff) 확인**:
   - 스크립트가 로컬 Proton VPN 터널(`ProTUN`)과 현재 공인 IPv4(`/32`), 대상 Droplet(`611293905` / `143.198.40.33`), 방화벽 규칙 변경 전/후 비교(Diff)를 화면에 출력합니다.
   - 기존 안전 정적 IP(`74.39.42.139/32`)는 자동 보존되며, 불필요하거나 비인가된 `0.0.0.0/0`은 원천 배제됩니다.
3. **오너 명시적 승인 (`YES` 입력)**:
   - 프롬프트 안내에 따라 대문자 **`YES`**를 입력하고 Enter를 누르면 DigitalOcean API를 통해 원자적(Atomic)으로 `/32` 규칙이 안전하게 갱신 및 검증됩니다.
   - 방화벽 갱신 완료 즉시 RC3.57/RC3.58 내장 자가 치유(Self-Healing) 엔진에 의해 프로세스 재시작 없이 30초 내 `READY` 상태로 자동 복구됩니다.
   - *(취소 시 `YES`가 아닌 키를 누르거나 창을 닫으면 0건의 변경으로 안전 종료됩니다.)*

---

## 📌 오너 최종 검증 상태 (Verification State)

- **소프트웨어 코어 로직 & 목(Mock) 회귀 테스트**: **PASS (11/11 단위/통합 회귀 테스트 100% 통과)**
  - 비 Proton 네트워크 및 무효 IP 감지, 기존 allowlist 중복 시 no-op, 타겟 Droplet/Firewall ID 불일치 감지, 401/403 토큰 스코프 부족 시 안전 차단, 동시 수정 경합(Concurrency Conflict) 감지, 불필요 All IPv4(`0.0.0.0/0`) 원천 배제, 오너 승인 거부 시 0-Write 무변조 보장, 토큰/시크릿 마스킹 검증 완료.
- **실물 물리 환경 검증**: **OWNER_VALIDATION_PENDING (오너 실제 PC 실행 대기)**
  - 본 RC3.58 패키지는 오너의 실제 Proton VPN 환경에서 `QUICK_UPDATE_FIREWALL_IP.bat`를 실행하여 최종 승인(`YES`)을 거치는 물리 검증 단계를 대기하고 있습니다. (인공적 임의 승인 시뮬레이션 절대 금지 원칙 준수)
- **보안 및 아키텍처 한계 명시**:
  - HTTPS CONNECT 터널링 정상 동작, 일반 HTTP non-CONNECT 요청은 의도된 `404 Not Found` 보안 차단 유지.
  - DNS/WebRTC 누수 방지 계측 및 GL.iNet Opal 물리 라우터/주거용 프록시 연동은 물리 배포 전까지 `UNVERIFIED` 상태를 유지합니다.


