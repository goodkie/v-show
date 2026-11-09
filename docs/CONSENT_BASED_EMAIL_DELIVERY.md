# XPIDER 이메일 발송 기능 — 구현 범위 및 보안 계약

브랜치: `feature/consent-based-email-delivery-20261109` (REV22를 건드리지 않는 분리 개발).

## 현재 구현
- `extension/modules/email-delivery-policy.js`: 명시적 수신 동의 증거, 구독 취소/반송/신고 제외, 중복 제거, SPF/DKIM/DMARC 및 발신 도메인 정렬 확인, 원클릭 수신거부 및 웹훅 검증 상태, 운영자 승인, 시간당 발송 상한 확인 후 **미리보기만** 반환
- `test/run_email_delivery_policy.js`: 동의 없는 수집 이메일 차단, 수신거부·반송, 중복, 인증 누락, 속도 제한 등을 검증하도록 작성. 현재 실행 결과는 미확인
- 수집된 주소나 Contact 페이지에서 발견한 주소는 **동의로 간주하지 않음**.

## 실제 발송 구현을 위한 필수 연결
1. 서버 측 ESP(예: Amazon SES, Postmark, SendGrid, Mailgun) 계정과 발송 도메인 선택. **API 비밀키는 Chrome 확장 프로그램에 저장 금지**
2. 발신 도메인의 SPF, DKIM, DMARC와 TLS/정렬 DNS 검증; 실패 시 발송 불가
3. 안전한 서버 측 발송 엔드포인트 및 인증된 작업자 승인. 발송 직전에도 서버에서 수신 동의와 suppression DB 재검증
4. 실제 HTTP POST로 즉시 구독해제되는 RFC 8058 List-Unsubscribe 헤더 및 메일 본문 수신 거부 링크, 반송·스팸 신고 웹훅
5. 마케팅 메일 발송량 제한, 중복 방지 키, 재시도 보류, 감사 로그, 테스트 주소만 발송하는 샌드박스 실행. '100% 스팸 방지' 문구 금지
6. 도메인과 발신 주소 설정 이후 provider sandbox 테스트 완료 시만 `PREVIEW_ONLY`에서 별도의 승인된 서버 API를 통한 발송 경로 개통

## 수용 테스트
동의 없는 Email Collector 주소로 자동 발송 불가; 유효한 수신 동의와 필수 인증 상태가 없으면 전송 불가; 수신 거부 즉시 반영; TEST 모드 네트워크 발송 0; 승인 없이 임의 대량발송 불가; 실제 SPF/DKIM/DMARC 확인 기록; 메일 발송 실패는 SUCCESS로 세지 않음.

## 배포 상태
`REV22` 불변 유지, 기존 폼 자동제출/Email Collector 및 히스토리/레저 유지. 새로운 기능은 별도 개발 브랜치에서만 작업. 사용자의 데이터 백업 및 복원과 Windows 10 배포 검증 전까지 RELEASE HOLD.