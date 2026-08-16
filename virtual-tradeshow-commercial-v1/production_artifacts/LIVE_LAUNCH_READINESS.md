# LIVE LAUNCH READINESS REPORT
**Virtual Trade Show Commercial V1 — Pre-Production Hardening & Safety Matrix**

---

## 1. 개요 및 최종 판정 (Executive Status)
- **전체 상태 (Overall Status)**: **`TECHNICALLY_READY_FOR_LIVE_APPROVAL`**
- **Stripe Mode**: **`TEST`** (`stripeMode: test`) — 실제 현금 결제 $0.00 유지.
- **Stripe Live Mode**: **`OFF (Disabled)`** — 최고 운영자 승인 전 활성화 불가.
- **상용 요금제 승인 상태 (Pricing Status)**: **`DRAFT (Provisional: PRO $299, Business $799)`**
- **법률 검토 상태 (Legal Review Status)**: **`PENDING (Draft Terms & Policies Created)`**

---

## 2. 런치 준비성 감사 매트릭스 (Launch Readiness Matrix)

| 카테고리 (Category) | 점검 항목 (Audit Item) | 판정 (Status) | 세부 내용 및 운영 결과 |
| :--- | :--- | :---: | :--- |
| **Technical** | Railway Schema Version 5 | **`READY`** | 스키마 v5 마이그레이션 및 원자적 영속화 완료 |
| **Technical** | 공개 웹 페이지 및 로비 | **`READY`** | `/lobby.html`, `/viewer.html`, `/precision-viewer.js` 정상 서빙 |
| **Security** | Platform Owner RBAC 보호 | **`READY`** | `/api/platform/*` 및 `/grand-control.html` 403 Forbidden 격리 |
| **Security** | 멀티 테넌트 데이터 격리 | **`READY`** | 3개 전시자 상호 변조 시도 전원 차단 확인 |
| **Security** | XSS 및 파일 업로드 보안 | **`READY`** | HTML 이스케이핑, MIME 타입 화이트리스트, Path Traversal 방어 |
| **Billing** | Stripe Test Mode 통합 | **`READY`** | Checkout 세션, 고객 포털, Raw Body Webhook 서명 검증 완료 |
| **Billing** | 요금제 중앙 설정 (PLAN_CONFIG) | **`READY`** | `GET /api/public/plans` 엔드포인트 제공 및 환경변수 오버라이드 지원 |
| **Billing** | Double-Gate GPU 방어 | **`READY`** | Free 계정 차단(402) 및 Pro/Business 승인 큐 작동 확인 |
| **Operations** | 긴급 킬 스위치 3종 | **`READY`** | Billing(503), Reconstruction(503), Maintenance 스위치 검증 |
| **Operations** | 백업 및 복구 훈련 | **`READY`** | `scripts/restore_drill.js` 실행 결과 100% 무결성 복원 성공 |
| **Legal** | 약관 및 개인정보/환불 페이지 | **`READY`** | `/terms.html`, `/privacy.html`, `/refund-policy.html` 배포 및 링크 완료 |
| **Commercial** | 상용 요금제 확정 | **`WARNING`** | 현재 잠정 가격 책정 ($299 / $799), 운영진 최종 승인 대기 |
| **Legal** | 법률 전문가 최종 검토 | **`WARNING`** | 이용약관 및 개인정보처리방침 초안 상태 (변호사 최종 검토 대기) |
| **Billing** | Stripe Live Mode 활성화 | **`OFF`** | 실제 라이브 키 미설정 및 2단계 라이브 스위치 꺼짐 상태 유지 |

---

## 3. 필수 인간 결정 사항 (Human Decisions Required)
1. **상용 요금제 최종 확정**: Free($0), Pro($299/월), Business($799/월) 최종 가격 승인 여부 결정.
2. **법률 문서 최종 승인**: 변호사/법무팀 검토 후 `terms.html`, `privacy.html`, `refund-policy.html`의 DRAFT 표기 해제.
3. **Stripe Live Mode 전환 승인**: 실제 신용카드 과금을 개시할 시점에 Stripe Live Secret Key를 Railway 환경 변수에 주입하고 라이브 승인 플래그 활성화.
4. **대용량 오브젝트 스토리지 도입 시점 결정**: 활성 참가사가 10~50개를 초과할 때 AWS S3 / Cloudflare R2 스토리지 어댑터로 전환.
