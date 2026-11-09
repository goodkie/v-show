# XPIDER 로컬 이메일 발송 · Privacy Relay 유지

## 확인된 기존 구조
- Privacy Relay 포워딩 프록시: `127.0.0.1:18988` HTTP/HTTPS CONNECT.
- Relay 제어 API: `127.0.0.1:18989`; 상태 `PRIVACY: READY`는 HTTP(S) 전송의 중계/egress 상태입니다. SMTP 서비스나 이메일 발신 도메인 인증을 뜻하지 않습니다.
- `companion/local-email-privacy-relay.js`는 기존 Relay 설정, 포트, Windows 자동 시작, Chrome 확장 프로그램 데이터를 **수정하지 않습니다**.

## 구현된 격리 기능
- 기본 `dryRun=true`. 사용자의 수신 동의 증빙, suppression, SPF/DKIM/DMARC, 원클릭 구독 해지, 반송 및 신고 웹훅 설정, 운영자 승인 등을 검증하고 이메일 발송 없이 PREVIEW_ONLY를 반환합니다.
- 실제 API 연결을 호출할 때는 `127.0.0.1:18988`을 통해 `api.resend.com:443`에 HTTPS CONNECT 터널을 만들고 TLS 인증서를 검증합니다. 프록시 중단/거부 시 직접 연결로 **절대 전환하지 않습니다**.
- 외부 API 공급자는 현재 Resend 1종만 어댑터로 작성했습니다. 이것은 이메일 발송 서버를 로컬에 새로 운영하는 것과 다릅니다. 발송은 사용자 PC에서 시작하되 외부 ESP가 수신자 측 SMTP 전달을 담당합니다.
- **실제 발송 활성화에 필요한 항목**: Resend 계정, 비밀 API 키(로컬 환경/OS 비밀 저장소에만 보관), 발신 소유 도메인과 인증 DNS(SPF/DKIM/DMARC), 확인된 수신 거부 URL, 반송·신고 수신 설정, 수신자의 입증 가능한 동의 및 운영자 승인. Chrome 확장에 API 키를 넣지 마세요.
- 아무 근거 없이 Email Collector 수집 주소를 마케팅 동의로 취급하지 마세요. 수신 동의 없는 발송은 차단합니다.
- HTTPS API가 요청을 수락해도 DELIVERED/SUCCESS가 아닙니다. 수신함 도착은 추후 웹훅과 ISP 피드백을 통해 별도로 판단해야 합니다.

## 개발 상태
- 기능 브랜치: `feature/consent-based-email-delivery-20261109`.
- `extension/modules/email-delivery-policy.js` 이메일 동의·인증 사전검증.
- `companion/local-email-privacy-relay.js` Relay-only HTTPS API 클라이언트.
- `test/run_email_delivery_policy.js`, `test/run_local_email_privacy_relay.js` 테스트 작성. **아직 테스트 실행 결과 미확인**.
- REV22 배포 ZIP은 수정하지 않았습니다. 로컬 설치/실제 API 연결/메일 발송도 하지 않았습니다.
- 실제 발송 코드가 있지만 독립적인 보안 검증과 사용자의 명시적 활성화가 끝나기 전까지 실사용 금지.

## 다음 단계
1. 두 테스트를 Node.js로 실행하고 실패 수정. 이어서 독립된 로컬 프록시 모킹 서버에서 CONNECT 성공/거부/타임아웃 및 강제 종료에 대한 안전성 테스트.
2. 사용자 PC의 Privacy Relay `READY`가 실제 해당 HTTPS CONNECT 목적지를 허용하는지 별도 비발송 preflight로 검증. 허용되지 않으면 프록시를 우회하지 않고 차단.
3. SMTP/IP를 임의로 가장하거나 소유하지 않은 도메인을 발신자로 꾸미지 않음. 기존 Privacy Relay만으로 SPF/DKIM/DMARC 인증을 대신할 수 없음.
4. 이메일 실 발송을 활성화하기 전, 제한된 테스트 수신자·수신거부 기능·서버측 suppression DB와 인증을 검증.
5. 별도 테스트 빌드, Windows 10 소유자 백업 및 명시적 승인 전 RELEASE HOLD.
