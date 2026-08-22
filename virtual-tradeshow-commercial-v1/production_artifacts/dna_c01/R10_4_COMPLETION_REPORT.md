# PHASE 10.7N-R10.4 — REJECT FAILED PARTIAL MODEL & TARGETED RECAPTURE EXECUTION PACKAGE REPORT

**실행 일시**: 2026-08-19  
**대상 시스템**: Virtual Trade Show Commercial V1 — Wilo 3D Showroom  
**모드**: `EVIDENCE-BASED` / `REAL-CAPTURE-ONLY` / `NO-SYNTHETIC` / `NO-RETRAINING` / `NO-GAUSSIAN-TRAINING`  
**최종 상태**: **R10_4_TARGETED_RECAPTURE_READY (PASS)**

---

## 1. 개요 및 목적 (Mission Summary)

PHASE 10.7N-R10.3F 시각 품질 포렌식 결과에 따라, 시각적으로 인식 불가능한 15장 부분 가우시안 모델(`WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01`)을 공개 쇼룸에서 완전히 제거하고, 정직한 2-상태 쇼룸 UI(Photo Tour + 3D Pending)로 복구했습니다. 동시에 완전한 360° 부스 재구성을 위한 **6개 단절 구간 정밀 보충 촬영(Targeted Recapture) 실행 패키지(24~32장)**를 구축 및 배포 완료했습니다.

---

## 2. 실패 모델 동결 및 아카이브 (Step 1)

- **보존 파일**:
  - `production_artifacts/r10_4/rejected_partial_experiment/WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply` (52.2 MB, SHA256: `4DB41B3EAA3A...`)
  - `production_artifacts/r10_4/rejected_partial_experiment/WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz` (20.9 MB, SHA256: `D7E46475DBD7...`)
- **생성 매니페스트**: [`R10_4_REJECTED_PARTIAL_MODEL_MANIFEST.json`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_REJECTED_PARTIAL_MODEL_MANIFEST.json)

---

## 3. 공개 쇼룸 UI 정리 및 진실성 보장 (Steps 2 & 12)

- **공개 UI 모드 스위처 (2-상태)**:
  - `[ 📷 Photo Tour (Primary) ]`: 12개 실제 현장 고해상도 각도 탐색 (기본 활성)
  - `[ 🌐 3D Reconstruction (Pending) ]`: 클릭 시 "360° 부스 재구성을 위해 추가 현장 브릿지 촬영 진행 중" 안내 카드 노출
  - **`[ Partial Experimental Preview ]` 버튼 완전 제거** (고객 대면 노출 0건)
- **런타임 상태 (`window.__VSHOW_STATE__`)**:
  ```json
  {
    "tenant": "org-wilo-golden-demo",
    "photoTour": true,
    "partialAuthentic3DPreview": false,
    "fullAuthenticGaussian3D": false,
    "fullReconstructionStatus": "PENDING_ADDITIONAL_REAL_CAPTURE",
    "failedPartialModelPubliclyVisible": false,
    "syntheticFallback": false
  }
  ```

---

## 4. 엔지니어링 내부 진단 경로 보존 (Step 3)

- **내부 진단 URL**: `/diagnostics/wilo-partial-experiment-01.html`
- **상태 고지**: 상단에 빨간색 경고 배너 명시 (`⚠️ REJECTED EXPERIMENTAL RECONSTRUCTION — NOT FOR PRODUCTION`)

---

## 5. 뷰어 아키텍처 표준 결정 (Step 4)

- **문서**: [`R10_4_VIEWER_FORMAT_DECISION.md`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_VIEWER_FORMAT_DECISION.md)
- **표준**: 차기 정식 재구성 시 WebGL2 호환성이 검증된 **`GaussianSplats3D` 기반 PLY / KSPLAT 파이프라인**을 단일 표준으로 확정.

---

## 6. 6개 브릿지 촬영 가이드 시트 (Steps 5, 6, 7, 8, 9)

| Break ID | FROM 이미지 | TO 이미지 | 목표 프레임 | 이동 벡터 및 Depth Baseline 촬영 규칙 |
|---|---|---|---|---|
| **BREAK_01** | `booth01_a2.jpg` | `booth01_a3.jpg` | 4-6장 | 우측으로 ~1.5m 이동, 좌측으로 ~15° 회전 (20~30cm 측면 병진) |
| **BREAK_02** | `booth04_a3.jpg` | `booth05_a1.jpg` | 4-6장 | 우측 통로에서 펌프 아일랜드 전면으로 진입 (녹색 경계선 따라 30cm 간격) |
| **BREAK_03** | `booth07_a2.jpg` | `booth07_a3.jpg` | 4-6장 | 좌측 통로 따라 후퇴하며 후면 상담 구역 패닝 (통로 좌우 측면 이동) |
| **BREAK_04** | `booth07_a3.jpg` | `booth08_a1.jpg` | 4-6장 | 좌측 후면에서 부스 중앙 미팅 테이블 방향 전진 (각 1m 전진마다 좌/중/우) |
| **BREAK_05** | `booth13_a3.jpg` | `booth14_a1.jpg` | 4-6장 | 중앙 테이블 구역에서 후면 기술/전시 패널로 이동 (눈높이~허리높이 시점 변환) |
| **BREAK_06** | `booth14_a3.jpg` | `booth15_a1.jpg` | 4-6장 | 후면 기술 구역에서 우측 출구 루프 완성 (배면 파티션 벽면 측면 이동) |

- **목표 신규 촬영 수량**: **총 24~32장**
- **가이드 아티팩트**:
  - [`R10_4_BREAK_01_CAPTURE_GUIDE.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_BREAK_01_CAPTURE_GUIDE.png)
  - [`R10_4_BREAK_02_CAPTURE_GUIDE.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_BREAK_02_CAPTURE_GUIDE.png)
  - [`R10_4_BREAK_03_CAPTURE_GUIDE.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_BREAK_03_CAPTURE_GUIDE.png)
  - [`R10_4_BREAK_04_CAPTURE_GUIDE.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_BREAK_04_CAPTURE_GUIDE.png)
  - [`R10_4_BREAK_05_CAPTURE_GUIDE.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_BREAK_05_CAPTURE_GUIDE.png)
  - [`R10_4_BREAK_06_CAPTURE_GUIDE.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_BREAK_06_CAPTURE_GUIDE.png)

---

## 7. 현장 촬영 매니페스트 및 신규 수집 디렉토리 (Steps 10 & 11)

- **신규 수집 경로**: `data/capture-ingest/wilo/recapture-r10-4/` (`incoming/`, `accepted/`, `rejected/`, `manifests/`)
- **현장 매니페스트**: [`R10_4_FIELD_CAPTURE_MANIFEST.csv`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_FIELD_CAPTURE_MANIFEST.csv)

---

## 8. 라이브 프로덕션 배포 및 픽셀 검증 (Steps 13 & 14)

- **배포 URL**: `https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html`
- **검증 캡처**:
  - [`R10_4_PROD_PHOTO_TOUR.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_PROD_PHOTO_TOUR.png): 공개 쇼룸 정상 로드 (Photo Tour Primary 활성)
  - [`R10_4_PROD_3D_PENDING.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_PROD_3D_PENDING.png): 3D 모드 진입 시 정직한 보류 상태 카드 정상 표시
  - [`R10_4_DIAGNOSTIC_REJECTED.png`](file:///C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/R10_4_DIAGNOSTIC_REJECTED.png): 내부 진단 페이지 경고 배너 확인

---

## 9. 최종 필수 보고 값 (FINAL REQUIRED VALUES)

```
FAILED_PARTIAL_MODEL_PRESERVED=true
FAILED_PARTIAL_MODEL_PRODUCTION_APPROVED=false
FAILED_PARTIAL_MODEL_PUBLICLY_VISIBLE=false
PHOTO_TOUR_ACTIVE=true
FULL_AUTHENTIC_3D=false
TARGETED_RECAPTURE_REQUIRED=true
RECAPTURE_TARGET_IMAGES=24-32
GAUSSIAN_RETRAINING_ALLOWED=false

FINAL_STATUS=
R10_4_TARGETED_RECAPTURE_READY
```
