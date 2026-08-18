# 02_MODEL_DEACTIVATION_REPORT — 비정격 합성 3D 모델 프로덕션 비활성화 보고서
(Phase 10.7N-R8 Active Production Deactivation)

---

## 1. 비활성화 대상 모델 (Deactivated Artifacts)

- `REAL_WILO_GAUSSIAN_FINAL.spz` (SHA256: `FC80E5192CE1C79196E51414E0739524C9E191092C1719829AB414D0E73A32EE`)
- `REAL_WILO_GAUSSIAN_FINAL.ply` (SHA256: `B40F8035DDC51817538F99AFFFA7EECA6836E8FCAA243A93BD214166B877CD4D`)

---

## 2. 조치 내역 (Actions Taken)

1. **포렌식 증거 격리 및 보존**:
   - `production_artifacts/r6/rejected_synthetic_model/`로 영구 격리 보존 완료.
   - `REJECTED_MODEL_MANIFEST.json` 생성 (`classification: "SYNTHETIC_SMART_FACTORY"`, `wilo_reconstruction: false`).
2. **프로덕션 서빙 엔드포인트 차단 (`server/index.js`)**:
   - `/assets/demo/wilo/models/REAL_WILO_GAUSSIAN_FINAL.spz`에 대한 Release CDN 302 리디렉션 삭제.
   - `HTTP 404 (AUTHENTIC_3D_RECONSTRUCTION_UNAVAILABLE)` 및 안내 메시지 반환 처리.
3. **Wilo 뷰어 UI 및 런타임 수정 (`client/wilo-demo.html`)**:
   - 3D 모드 버튼 비활성화 및 `3D Reconstruction — Capture Required` 툴팁 표시.
   - `window.__VSHOW_STATE__`에서 허위 모델 및 `fakeRenderer` 상태 제거.
   - `window.__ACTIVE_MODEL__ = null`, `window.__VIEW_MODE__ = 'PHOTO_TOUR'`, `reconstructionStatus: 'BLOCKED_NO_REAL_CAPTURE'` 설정.
   - `mode=gaussian3d&review=owner` 진입 시 허위 모델 로딩을 전면 차단하고 `⚠️ Authentic 3D Reconstruction Unavailable (Real Camera Capture Required)` 배너 표출 및 Photo Tour로 안전 렌더링.
4. **데이터베이스 스키마 상태 교정 (`server/db.js`)**:
   - `booth-wilo-golden-demo` 엔티티의 `reconstructionStatus`를 `'BLOCKED_NO_REAL_CAPTURE'`로 갱신.
   - `photoTour: true`, `authenticGaussian3D: false`, `captureDatasetAvailable: false` 반영.
