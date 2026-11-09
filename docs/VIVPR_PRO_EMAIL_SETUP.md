# XPIDER – vivpr.pro 발신 도메인 설정 (현재 코드 단계)

**사용자 지정 도메인:** `vivpr.pro`. 이 정보만으로 실제 SMTP 메일 서버의 주소, 소유권 또는 인증이 확인된 것은 아닙니다.

**개발 브랜치:** `feature/consent-based-email-delivery-20261109`. REV22 배포본은 유지합니다.

## 연결 구조
사용자 Windows PC의 XPIDER 로컬 companion → **기존 Privacy Relay** HTTP CONNECT `127.0.0.1:18988` → TLS `api.resend.com:443` → 인증된 `vivpr.pro` 발신 도메인. 이는 vivpr.pro 자체의 SMTP 호스트를 구성하는 것과 다릅니다. 사용자에게 별도 SMTP 서버가 있다면 서버 호스트명·포트·TLS 방식은 별도 확인 후 연결해야 합니다.

## 무조건 차단되는 경우
- 발신자가 `@vivpr.pro` 밖이거나 도메인 소유권 미검증
- Resend에 `vivpr.pro` 도메인이 인증되지 않음
- SPF/DKIM/DMARC 검증 실패
- 실제 Privacy Relay CONNECT 목적지 검증이 없거나 `PRIVACY: BLOCKED`
- **Decodo 데이터 한도 소진**: 사용자가 2026-11-09에 사용량 0 확인. `HTTP_407` 상태에서 프록시 인증 재시도·직접 연결 우회 금지
- 수신자에게 연락할 권한/동의가 없거나 수신 거부 주소
- 발송자 명시 승인, 실발송용 API 토큰 등 누락

`companion/vivpr-sender-identity.js`는 위 조건을 검사합니다. `companion/local-email-privacy-relay.js`는 실발송 경로에서 해당 검사를 선행합니다. 별도 Node 테스트 `test/run_vivpr_sender_identity.js` 작성. 현재 CI 실행 결과 **UNKNOWN**; 실제 발송 **0건**.

## 사용자 설정 절차 (절대 비밀번호/API 키를 GitHub Issue에 올리지 말 것)
1. 발신용 이메일 주소를 정함, 예: `notice@vivpr.pro`. **예시 주소로 실제 우편함 존재를 주장하지 않음**.
2. 실제 이메일 서버를 vivpr.pro 직접 호스팅하는지, Resend 같은 HTTPS API를 발송 서버로 사용할지 확인. 본 개발 브랜치는 Resend API 연결 기준.
3. Resend에서 `vivpr.pro` 추가 → Resend가 제시하는 **계정별 정확한** DKIM/SPF/Return-Path DNS 값을 등록 → 상태 VERIFIED 확인. 기존 vivpr.pro 메일 수신용 MX/SPF를 근거 없이 지우거나 중복 SPF를 만들지 말 것. DMARC 상태 별도 점검.
4. Relay가 `PRIVACY: READY`이며 HTTPS CONNECT로 Resend API에 실제 접근 가능한지 검사. Decodo 소진 시 검증 완료 전 실발송 불가. 우회하거나 레지던셜 IP를 스팸 회피용으로 회전하지 않음.
5. 수신동의/정상 업무 알림 대상, 수신거부 및 반송·신고 처리, 로컬 비밀 저장, 감사 로그 검증 후 별도 샌드박스 테스트.

## 품질 게이트
- 코드는 GitHub feature 브랜치에만 반영. 확장 프로그램에 ESP 비밀키 저장 금지.
- 발송 성공은 서버 수락과 전달 완료를 구분.
- 기존 XPIDER 개인정보, 히스토리/CSV, Privacy Relay 설정은 변경 금지.
- 정식 배포 **RELEASE HOLD**: 사용자 PC 백업·복원 검증/ESP 계정 승인/도메인 DNS 검증/실제 네트워크 점검/로컬 테스트가 모두 필요.
