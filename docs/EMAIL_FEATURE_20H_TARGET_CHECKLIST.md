# XPIDER 이메일 기능 — 20시간 목표 검증 계획

프로젝트: goodkie/v-show Issue #6
브랜치: `feature/consent-based-email-delivery-20261109`
목표: 개발/정적 검증·격리 테스트를 최우선으로 진행. 사용자 PC의 실제 설치나 Resend API 승인/DNS 및 메일 발송은 소유자의 외부 작업이 필수이고 20시간 내 성공을 보장하지 않습니다.

| 우선순위 | 항목 | 현재 상태 | 완료 조건 |
|---|---|---|---|
| P0 | 독립 HTML 이미지/텍스트 이메일 편집기 | 코드 작성됨 | 실제 Chrome / Edge 렌더·모바일·이미지 안전 테스트 PASS |
| P0 | TEST/PRODUCTION 모드 분리 | 독립 정책 작성됨 | 테스트 주소 whitelist 테스트 PASS; 실발송 worker 연계 |
| P0 | vivpr.pro 발신 정책 | 코드 작성됨 | Resend 도메인 인증/DNS 확인 + 비밀키 로컬 보관 |
| P0 | Privacy Relay 실패 시 차단 | 코드 작성됨 | HTTP 407/CONNECT 실패·시간초과 실제 모킹 테스트 |
| P1 | Resend HTML/TXT/MIME 연동 | 미완료 | 테스트 모드에서 공식 시뮬레이터만 허용·명시적 승인 |
| P1 | RFC 8058 원클릭 수신 거부 | 미완료 | POST 실제 동작·수신거부 DB 반영 테스트 |
| P1 | 대기열/중복·반송·신고 이벤트 | 미완료 | 내구성 저장소와 서명검증·재시도 제한 통합 테스트 |
| P1 | XPIDER 확장 앱 UI 통합 | 미완료 | CSP 준수 별도 JS/CSS, 기존 탭/데이터 보존 증거 |
| OWNER | Resend 계정 및 vivpr.pro 도메인 | 확인 필요 | 공식 DNS 기록 / 실제 운영 Reply-To / 계정 승인 |
| OWNER | Windows 10 백업·복원 | 확인 필요 | 기존 REV22 데이터 무손실 검증 |
| SAFETY | 승인 없는 외부 이메일 0건 | 지켜야 함 | 외부 수신자·Email Collector 주소 발송 차단 |
| RELEASE | 신규 기능 HOLD | 유지 | 모든 기술·법적·계정·사용자 승인 게이트 통과 전 해제 금지 |

## Resend 공식 테스트 주소
- 테스트 발신 주소 `onboarding@resend.dev` (실사용 계정의 허용 조건 내).
- 이벤트 전용 수신 주소 `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`.
- `companion/resend-test-mode.js`는 TEST 모드에서 위 3개 수신자만 허용하고, 그 외는 무조건 차단합니다. 현재 `sendEnabled: false`로 실제 전송 권한을 제공하지 않는 독립 프리플라이트 정책입니다.
- 출처: https://resend.com/changelog/sending-test-emails 및 https://resend.com/features/email-api .
- 실제 테스트 주소라도 API 요청은 외부 전송이므로 소유자 계정·발송 동의·Relay 검증 및 명시적 테스트 명령 전에는 보내지 않습니다.

## 20시간 결과 보고 방법
- 매 항목마다 GitHub 커밋, Node/Chrome 실제 테스트 로그, 파일 SHA·명확한 증거를 확인할 것.
- 부재한 증거는 `UNKNOWN`, 완료하지 않은 항목은 `INCOMPLETE`.
- 잘못된 PASS·설치 완료·실발송 보고 금지.
- IVCS Manager 개발/스케줄 권한은 ChatGPT에만 있고, XPIDER Issue 작업과 혼동하지 않을 것.
