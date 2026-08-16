# SECURITY LAUNCH AUDIT REPORT
**Virtual Trade Show Commercial V1 — Pre-Production Security Assessment**

---

## 1. 감사 요약 (Executive Summary)
- **감사 일시**: 2026년 8월 16일
- **감사 범위**: Express 백엔드 API, RBAC 권한 분리, Stripe 웹훅 서명 검증, 파일 업로드 필터링, 프론트엔드 XSS 방어, 비밀 키 노출 여부.
- **최종 판정**: **`PASS (Production Hardened)`** — 중대한 취약점 0건, $0.00 안전 모드 검증 완료.

---

## 2. 세부 점검 결과 (Audit Findings)

### A. 인증 및 역할 기반 접근 제어 (RBAC & Isolation)
- **플랫폼 오너 보호**: `/api/platform/*` 및 `/grand-control.html`에 대해 `requirePlatformOwner` 미들웨어가 비인가 요청을 HTTP 403으로 완벽 차단.
- **멀티 테넌트 격리**: 3개 참가사 간 교차 데이터 수정(부스, 제품, 핫스팟, 리드) 시도 100% 차단 확인.
- **세션 보안**: 서명된 Bearer 토큰 발급, 로그아웃 시 토큰 폐기, 만료 주기 관리.

### B. 결제 시스템 보안 (Stripe Webhook & Modes)
- **원시 바이트 파싱**: `POST /api/billing/stripe-webhook`에 `express.raw({ type: 'application/json' })`를 적용하여 `STRIPE_WEBHOOK_SECRET` 기반 암호학적 서명 검증 수행.
- **멱등성 보증**: `stripeEvents` 컬렉션을 통해 중복 전달된 웹훅 이벤트 자동 무시.
- **모드 불일치 방어**: `STRIPE_MODE=test`와 라이브 키 간의 교차 주입 시 결제 가동 즉시 거부.
- **카드 정보 보호**: 신용카드 번호(PAN) 및 CVC 일체 미수집/미저장.

### C. 프론트엔드 XSS 방어 및 데이터 살균
- **HTML 이스케이핑**: `escapeHtml()` 함수를 통해 Grand Control, 인앱 메시지, 제품 설명, 리드 정보 내 악성 스크립트(`<script>`, `onload` 등) 무력화.
- **URL 프로토콜 검증**: `javascript:`, `data:`, `file:` 등의 비정상 프로토콜 주입 방지 및 `https://` 또는 상대 경로만 허용.

### D. 파일 업로드 보안
- **MIME 타입 검사**: `image/jpeg`, `image/png`, `image/webp`, `model/ply`, `application/octet-stream` 화이트리스트 적용.
- **확장자 위변조 방어**: 이중 확장자(`image.jpg.exe`) 및 HTML 실행 파일 업로드 차단.
- **경로 순회(Path Traversal) 방어**: `path.basename()` 및 고유 UUID 파일명 매핑 적용.

### E. 의존성 취약점 점검 (`npm audit`)
- **Critical / High 취약점**: **`0건`**
- **Moderate 취약점**: 1건 (`uuid` 버퍼 경계 검사 — 우리 코드는 버퍼 없는 `uuidv4()`만 호출하므로 위험성 없음).
