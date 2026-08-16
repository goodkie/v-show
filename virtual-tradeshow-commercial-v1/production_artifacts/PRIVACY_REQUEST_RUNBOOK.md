# PRIVACY REQUEST RUNBOOK (DSR SOP)
**Virtual Trade Show Commercial V1 — Data Subject Rights Operational Guide**

---

## 1. 개요 (Overview)
본 런북은 전시 참가사 및 바이어가 개인정보 열람(Access), 정정(Rectification), 삭제(Erasure), 처리정지(Restriction)를 요청했을 때 운영진이 준수해야 할 표준 운영 절차입니다.

---

## 2. 4가지 권리별 처리 절차

### A. 개인정보 열람 및 데이터 이동 요청 (Access / Portability)
1. **참가사 자율 다운로드**: 참가사 관리자는 어드민 콘솔의 [내보내기] 기능을 통해 자신의 프로필, 제품 카탈로그, 리드, RFQ 데이터를 CSV로 즉시 다운로드 가능.
2. **바이어 명함 열람 요청**: 운영진이 Grand Control에서 바이어 이메일로 검색하여 접수된 명함 및 견적 내역을 추출하여 암호화 전달.

### B. 개인정보 삭제 요청 (Right to be Forgotten)
1. **계정 탈퇴 처리**: 참가사 요청 시 `DELETE /api/platform/organizations/:id` 또는 영구 파기 스크립트 가동.
2. **바이어 리드 삭제**: 특정 바이어의 삭제 요청 시 DB `leads`, `rfqs` 컬렉션에서 해당 이메일 매칭 레코드 즉시 삭제.
3. **3D 모델 파일 파기**: `data/uploads/` 내 업로드 사진 및 생성된 SPZ/PLY 파일 삭제.
4. **법적 보존 분리**: 상법/세법상 보존 의무가 있는 결제 참조 메타데이터만 5년간 분리 보관.

### C. 데이터 정정 요청 (Rectification)
- 회사 정보, 담당자 이메일, 제품 정보는 참가사 관리자 콘솔에서 실시간 직접 수정 가능.
