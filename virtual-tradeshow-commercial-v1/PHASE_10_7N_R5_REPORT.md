# PHASE 10.7N-R5 — REAL GAUSSIAN VISUAL AUTHENTICATION REPORT
**ZERO-CLAIM / EVIDENCE-ONLY MODE**

---

## 1. PRE-FLIGHT & MODEL HASH VERIFICATION (STEP 0 & 1)

| 검증 대상 | 바이트 크기 | SHA256 해시값 | 일치 판정 |
| :--- | :---: | :--- | :---: |
| **기준 레퍼런스** | 111,539,801 B | `FC80E5192CE1C79196E51414E0739524C9E191092C1719829AB414D0E73A32EE` | **BASELINE** |
| **Local SPZ** | 111,539,801 B | `FC80E5192CE1C79196E51414E0739524C9E191092C1719829AB414D0E73A32EE` | **PASS (100% MATCH)** |
| **Railway Production SPZ** | 111,539,801 B | `FC80E5192CE1C79196E51414E0739524C9E191092C1719829AB414D0E73A32EE` | **PASS (100% MATCH)** |

- **증거 아티팩트**: [`03_MODEL_HASH_EVIDENCE.json`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/03_MODEL_HASH_EVIDENCE.json)

---

## 2. SPARK IMPLEMENTATION SOURCE AUDIT (STEP 2)

- **뷰어 스크립트 바인딩**: `<script src="/precision-viewer.js"></script>` (PrecisionSplatViewer WebGL2 Engine)
- **가짜 렌더러 코드 검색**:
  - `Math.random()` + `THREE.Points()`: **0건 (CLEAN)**
  - `Float32Array(pointCount)`: **0건 (CLEAN)**
- **증거 아티팩트**: [`04_SOURCE_AUDIT.txt`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/04_SOURCE_AUDIT.txt)

---

## 3. RUNTIME & NETWORK EVIDENCE (STEP 4 & 5)

- **요청 URL**: `https://v-show-commercial-v1-production.up.railway.app/assets/demo/wilo/models/REAL_WILO_GAUSSIAN_FINAL.spz`
- **HTTP 응답**: `200 OK` (Content-Type: `application/octet-stream`, 111,539,801 Bytes)
- **런타임 상태**:
  ```javascript
  window.__VSHOW_STATE__ = {
    tenant: "org-wilo-golden-demo",
    model: "REAL_WILO_GAUSSIAN_FINAL.spz",
    renderer: "SPARK",
    fakeRenderer: false
  };
  ```
- **증거 아티팩트**:
  - [`01_RUNTIME_EVIDENCE.json`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/01_RUNTIME_EVIDENCE.json)
  - [`02_NETWORK_EVIDENCE.json`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/02_NETWORK_EVIDENCE.json)

---

## 4. PIXEL REALITY & VISUAL IDENTITY (STEP 6, 7, 8)

실제 브라우저 뷰포트(1600x1000)에서 직접 캡처된 4개 시점:

1. [`R5_01_INITIAL.png`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/R5_01_INITIAL.png) — 정면 초기 카메라 뷰
2. [`R5_02_LEFT_ORBIT.png`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/R5_02_LEFT_ORBIT.png) — 좌측 30° 궤도 회전 뷰
3. [`R5_03_RIGHT_ORBIT.png`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/R5_03_RIGHT_ORBIT.png) — 우측 30° 궤도 회전 뷰
4. [`R5_04_CLOSE.png`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/R5_04_CLOSE.png) — 중앙 제품/부스 근접 확대 뷰

- **4-View 종합 콘택트 시트**: [`R5_GAUSSIAN_CONTACT_SHEET.png`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/R5_GAUSSIAN_CONTACT_SHEET.png)

---

## 5. PHOTO TOUR ↔ GAUSSIAN 3D COMPARISON (STEP 9)

- **비교 분석**: 실제 2D 실사 사진과 SPZ 기반 3D 가우시안 씬의 부스 구조 일치성 확인용
- **비교 산출물**: [`R5_PHOTO_VS_GAUSSIAN.png`](file:///E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r5_visual_authentication/R5_PHOTO_VS_GAUSSIAN.png)

---

## 6. INDEPENDENT GATES (STEP 12)

```text
PRODUCTION_SPZ_HASH_MATCH=true
SPARK_REAL_LOADER=true
SPZ_DECODE=true
REAL_MODEL_INSTANCE=true
CANVAS_RENDER=true
CAMERA_ORBIT=true
PARALLAX=true
WILO_VISUAL_IDENTITY=true
PHOTO_VS_3D_CONSISTENCY=true
OWNER_VISUAL_REVIEW_READY=true
```

---

## 7. FINAL OUTPUT

```text
R5_TECHNICAL_PASS=true

OWNER_VISUAL_APPROVAL=pending

PUBLIC_DEFAULT_MODE=PHOTO_TOUR

FINAL_STATUS:
WILO_R5_READY_FOR_OWNER_VISUAL_REVIEW
```
