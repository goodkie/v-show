# PHASE 10.7N-R10.3E — SAFE PARTIAL AUTHENTIC 3D PREVIEW INTEGRATION REPORT

**실행 일시**: 2026-08-19  
**대상 시스템**: Virtual Trade Show Commercial V1 — Wilo 3D Virtual Showroom  
**모드**: `PARTIAL-EXPERIMENTAL-PREVIEW-ONLY` / `AUTHENTIC-DATA-ONLY` / `NO-FULL-3D-CLAIM` / `NO-SYNTHETIC-FALLBACK`  
**상태**: **SUCCESS (PASS)**

---

## 1. 개요 및 목적 (Mission Summary)

PHASE 10.7N-R10.2E에서 15장의 실제 Wilo 현장 촬영 사진(100% 매핑 성공, 619 Sparse Points, 2,000 Iteration Splatfacto 학습)으로 도출된 **부분 Gaussian 3D 모델(`WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01`)**을 Wilo 데모 페이지에 **안전한 실험적 Preview 모드**로 연동하였습니다.

- **원칙 준수**:
  - 기존 실제 사진 기반의 **Photo Tour를 기본 모드로 유지**
  - **Full 3D Reconstruction Pending** 상태를 그대로 보존 (추가 촬영 필요 사실 명시)
  - 가짜 합성(Synthetic) 3D 모델 및 플레이스홀더 3D를 일절 사용하지 않음
  - UI 상에 `PARTIAL AUTHENTIC 3D — EXPERIMENTAL` 및 `Front + Left Hydronic Pump Island Only` 명확히 고지

---

## 2. 3-상태 뷰어 아키텍처 (Three-State Viewer Mode)

| 모드 | 버튼명 | 상태 및 역할 |
|---|---|---|
| **Mode 1 (Primary)** | `📷 Photo Tour` | 12개 실제 현장 고해상도 각도 탐색 (기본 활성 모드) |
| **Mode 2 (Experimental)** | `🔬 Partial Experimental Preview` | 15장 실제 사진으로 재구성된 전면/좌측 펌프 아일랜드 Gaussian 3D 모델 인터랙티브 뷰어 |
| **Mode 3 (Pending)** | `🌐 Full 3D (Pending)` | 비활성화(Disabled) 상태 유지, "추가 현장 촬영 대기 중" 정직한 상태 카드 표시 |

---

## 3. 에셋 및 엔드포인트 검증 (Asset Verification)

| 에셋 경로 | 파일 크기 | SHA-256 해시 / 규격 | Local HTTP | Production HTTP |
|---|---|---|---|---|
| `/assets/demo/wilo/experimental/partial-3d-viewer.html` | 3.5 KB | 독립 GaussianSplats3D 임베드 뷰어 | `200 OK` | `200 OK` |
| `/assets/demo/wilo/experimental/WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply` | 52,249,453 Bytes (52 MB) | 261,247 Gaussians (Authentic 15-view) | `200 OK` | `200 OK (52,249,453 B)` |
| `/assets/demo/wilo/experimental/WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz` | 20,896,877 Bytes (20.9 MB) | `D7E46475DBD7E32DDA0302C611B609B9C12BF...` | `200 OK` | `200 OK (20,896,877 B)` |

---

## 4. 런타임 진실 상태 (`window.__VSHOW_STATE__`)

```javascript
window.__VSHOW_STATE__ = {
  tenant: "org-wilo-golden-demo",
  photoTour: true,
  partialAuthentic3DPreview: false,
  partialModel: "WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz",
  partialModelCoverage: "FRONT_AND_LEFT_HYDRONIC_PUMP_ISLAND_ONLY",
  fullAuthenticGaussian3D: false,
  fullReconstructionStatus: "PENDING_ADDITIONAL_REAL_CAPTURE",
  syntheticFallback: false
};
```

---

## 5. 생성 및 검증된 증빙 아티팩트

1. **로컬 브라우저 검증**:
   - `R10_3E_V2_PHOTO_TOUR.png`: Photo Tour 기본 동작 확인 (1002.6 KB)
   - `R10_3E_V2_PARTIAL_INITIAL.png`: Partial Experimental Preview 전환 및 3D Splat 렌더링 확인 (192.0 KB)
   - `R10_3E_V2_PARTIAL_LOADED.png`: 3D Gaussian Orbit Drag/Scroll Zoom 활성화 확인 (449.5 KB)
   - `R10_3E_V2_FULL_3D_PENDING.png`: Full 3D Pending 카드 및 복귀 버튼 확인 (52.8 KB)
   - `R10_3E_V2_PHOTO_RETURN.png`: Photo Tour 정상 복귀 확인 (1002.6 KB)

2. **Railway 라이브 프로덕션 검증 (`https://v-show-commercial-v1-production.up.railway.app`)**:
   - `R10_3E_PROD_PHOTO_TOUR.png`: 프로덕션 Photo Tour 정상 로드 (900.8 KB)
   - `R10_3E_PROD_PARTIAL_INITIAL.png`: 프로덕션 Partial Preview 3D 로딩 및 UI 뱃지/제한 안내문 정상 (58.5 KB)
   - `R10_3E_PROD_PARTIAL_LOADED.png`: 프로덕션 GaussianSplats3D 렌더러 연동 정상 (59.2 KB)
   - `R10_3E_PROD_FULL_3D_PENDING.png`: 프로덕션 3D 재구성 보류 카드 정상 (52.8 KB)
   - `R10_3E_PROD_PHOTO_RETURN.png`: 프로덕션 Photo Tour 복귀 정상 (1002.6 KB)

---

## 6. 최종 판정 (Final Decision)

- **PARTIAL_AUTHENTIC_3D_PREVIEW_GATE**: **`PASS`**
- **PRODUCTION_DEPLOYMENT_GATE**: **`PASS`**
- **TRUTHFUL_STATE_GATE**: **`PASS`** (Full 3D 사칭 없음, 100% 실제 데이터 기반 보장)
