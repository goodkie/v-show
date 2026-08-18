# R9_CAPTURE_HANDOFF — 실사 촬영 데이터 인제스트 및 운영자 인수인계서
(Phase 10.7N-R9 Preparation Gate Handoff)

---

## 1. 현재 프로덕션 상태 (Current Verified State)

- **상태 명칭**: **`TRUTHFUL_EMPTY_SHOWROOM (CAPTURE_REQUIRED)`**
- **시각적 상태**: 합성 이미지 및 가짜 3D 씬 전면 제거 완료 (`Wilo Digital Showroom — Authentic Booth Capture Required` 진실 안내 화면 정상 서빙).
- **프로덕션 엔드포인트**: `https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html`
- **역량 상태 (Live API)**:
  ```json
  {
    "tenantId": "org-wilo-golden-demo",
    "boothId": "booth-wilo-golden-demo",
    "photoTour": false,
    "authenticGaussian3D": false,
    "captureDatasetAvailable": false,
    "reconstructionStatus": "BLOCKED_NO_REAL_CAPTURE",
    "viewsAvailable": 0
  }
  ```
- **합성 오염 제거**:
  - `REAL_WILO_GAUSSIAN_FINAL.spz` 영구 격리 및 HTTP 404 차단 완료.
  - 12장의 합성 렌더 JPEGs 포렌식 격리 보존 완료.

---

## 2. 결여 요건 (Missing Requirement)

- **결여 항목**: **`REAL_CAMERA_CAPTURE_DATASET` (실제 카메라로 촬영된 현장 부스 원본 사진측량 데이터셋)**
- 현재 시스템 전역에 3D Gaussian Splatting 재구성을 위한 실제 물리 카메라 촬영 데이터가 존재하지 않습니다.

---

## 3. 향후 허용된 작업 절차 (Next Allowed Operation)

운영자 또는 현장 촬영자가 실제 부스 사진을 확보한 경우 다음 순서에 따라 작업을 진행합니다:

1. **실사 사진 업로드 (Ingest Upload)**:
   - 원본 사진(60~120장)을 `data/capture-ingest/wilo/incoming/` 디렉토리에 복사.
2. **사전 기술 검증 (Preflight Validation)**:
   ```bash
   node app_build/scripts/validate_real_capture_dataset.js
   ```
3. **출처 인증 및 승인 (Human Provenance Gate)**:
   - 합성/스크린샷 배제 승인 후 `data/capture-ingest/wilo/accepted/`로 이동.
4. **COLMAP & Splatfacto 재구성 실행**:
   - Modal GPU 클라우드를 통한 SfM 및 3D Gaussian Splatting 학습.
5. **격리 진단 뷰어 시각 검증**:
   - `/diagnostics/wilo-spz-only.html`에서 5-View 궤도 렌더링 확인 후 소유자 최종 승인 시 배포.

---

## 4. 최종 게이트 판정 (Final Gate Verdict)

```text
CURRENT_STATE=TRUTHFUL_EMPTY_SHOWROOM
SYNTHETIC_ASSETS=REMOVED
REAL_CAPTURE_DATASET=false
RECONSTRUCTION_ALLOWED=false
PIPELINE_READY=true
```
