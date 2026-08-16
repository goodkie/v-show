# FIRST PAYING CUSTOMER PILOT REPORT
**Virtual Trade Show Commercial V1 — Production Commercial Outcome Report**

---

## 1. 파일럿 기본 정보 (Pilot Profile)
- **고객사명 (Company Name)**: `[AWAITING_INPUT]` (예: Alpha Industrial Automation Ltd.)
- **관리자 이메일 (Admin Email)**: `[AWAITING_INPUT]`
- **행사명 (Event Name)**: `[AWAITING_INPUT]`
- **부스 번호 (Booth Number)**: `[AWAITING_INPUT]`
- **데이터 환경 (Data Environment)**: **`REAL`**
- **파일럿 정원 제한**: `1 / 1` (`LIVE_PILOT_MAX_CUSTOMERS = 1`)

---

## 2. 결제 및 라이프사이클 결과 (Stripe Live Lifecycle)
- **구독 티어**: `PRO Tier ($299 / month)` (또는 승인된 파일럿 가격)
- **Stripe Mode**: `LIVE`
- **실제 결제 금액**: `$299.00 USD` (또는 승인된 금액)
- **Stripe Checkout Session**: `[PENDING_PAYMENT]`
- **Live Webhook 수신**: `[PENDING_WEBHOOK]` (`checkout.session.completed`)
- **PRO 엔타이틀먼트 활성화**: `[PENDING_ENTITLEMENT]`
- **Grand Control REAL MRR 반영**: `+$299.00`

---

## 3. 부스 촬영 및 3DGS 재구성 (Capture & 3D Reconstruction)
- **실제 사진 수 (Photos Count)**: `[PENDING_UPLOAD]` (권장 60~80장)
- **Capture QA 결과**: `[PENDING_QA]`
- **COLMAP SfM 정합률**: `[PENDING_COLMAP]` (목표 >= 90%)
- **Modal L4 GPU 연산 시간**: `[PENDING_GPU]` (~3분)
- **최종 SPZ 파일 크기**: `[PENDING_SPZ]` (~6.8 MB)
- **Spark 2.1.0 뷰어 렌더링**: `[PENDING_VERIFY]`

---

## 4. 바이어 참여 및 운영 지표 (Buyer Engagement & Telemetry)
- **부스 방문자 수**: `0`
- **제품 뷰 수**: `0`
- **수집된 리드 (Leads)**: `0`
- **접수된 견적 요청 (RFQs)**: `0`
- **고객지원 응대 (Support Messages)**: `0`
- **발생 장애 (Incidents)**: `0`

---

## 5. 단위 경제성 및 마진 (First Customer Unit Economics)
- **월간 매출 (Revenue)**: `$299.00`
- **Stripe 결제 수수료 (추정)**: `-$8.97` (2.9% + 30¢)
- **Modal GPU 연산 비용**: `-$0.25`
- **스토리지 및 대역폭 비용**: `-$0.35`
- **추정 순기여이익 (Gross Contribution)**: **`+$289.43 (96.8%)`**

---

## 6. 최종 종합 판정 (Final Pilot Evaluation)
- **상태**: **`WAITING_FOR_CUSTOMER_INPUT`**
- **대중 공개 전환 여부**: **`OFF (Invite-Only Restricted)`**
