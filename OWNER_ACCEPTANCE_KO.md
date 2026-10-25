# XPIDER AutoForm Sender Pro — 오너 승인 및 인수 안내서 (Owner Acceptance)

> **버전**: v6.9g.10.3 (RC3.57 Private Owner Release)  
> **빌드 ID**: `R6.9G.10.3.7.1.4.73-20261025-P0-RC3.57`  
> **지원 환경**: Windows 10 / 11 64-bit, Microsoft Edge / Google Chrome, Node.js LTS (v22 / v24)  
> **공식 배포 URL**: https://github.com/goodkie/v-show/releases/tag/v6.9g.10.3-rc3.57.7.1.4.73  
> **에셋 파일**: `XPIDER_R6.9G.10.3.7.1.4.73_PRIVATE_EGRESS_RC3.57.zip`  
> **패키지 SHA256**: `d9b41fae2a5926eab5c7086c600ec37d0db7f81d9d4f4e0c7ae5bbbc320a8c7b`  

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
