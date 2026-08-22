# PHASE 10.7N-R10.3F — PARTIAL GAUSSIAN VISUAL QUALITY FORENSICS REPORT

**실행 일시**: 2026-08-19  
**진단 대상**: `WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply` / `WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz`  
**모드**: `DIAGNOSTIC-ONLY` / `NO-RETRAINING` / `NO-SYNTHETIC-DATA` / `NO-MODEL-REPLACEMENT` / `NO-PRODUCTION-QUALITY-CLAIM`  
**최종 상태**: **R10_3F_DIAGNOSTIC_COMPLETE (FAIL)**

---

## 1. 모델 동결 및 무결성 검증 (Step 1)

| 파일명 | 파일 크기 (Bytes) | SHA-256 해시 | 상태 |
|---|---|---|---|
| `WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.ply` | 52,249,453 Bytes (52.2 MB) | `4DB41B3EAA3A0E69059365156777CB8F0E31EF6979AC225C066067FA44EFB421` | 동결 보존 |
| `WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz` | 20,896,877 Bytes (20.9 MB) | `D7E46475DBD7E32DDA0302C611B609B9C12BF2152114932B6A9D7BA32FDB882E` | 동결 보존 |

---

## 2. PLY vs SPZ 렌더링 비교 (Step 2)

- **`R10_3F_PLY_FRONT.png`**: PLY 포맷은 `GaussianSplats3D` 엔진에서 210,677개 가우시안 포인트 클라우드로 로드 및 렌더링됨.
- **`R10_3F_SPZ_FRONT.png`**: `GaussianSplats3D`는 Niantic `.spz` 압축 포맷을 네이티브 지원하지 않아 `File format not supported` 에러 발생.
- **판정**:
  - `PLY_VISUALLY_RECOGNIZABLE=false`
  - `SPZ_VISUALLY_RECOGNIZABLE=false`
  - `SPZ_CONVERSION_DEGRADATION=SPZ_FORMAT_UNSUPPORTED_IN_GAUSSIANSPLATS3D`

---

## 3. 모델 바운딩 박스 정밀 측정 (Step 3)

바이너리 PLY 파싱을 통해 210,677개 가우시안 중심 좌표(XYZ)를 전수 측정함:

- **`GAUSSIAN_COUNT`**: 210,677
- **`MODEL_BBOX_MIN`**: `[-6.6312, -6.7164, -9.4282]`
- **`MODEL_BBOX_MAX`**: `[10.2977, 11.3561, 4.9998]`
- **`MODEL_CENTER`**: `[1.8333, 2.3198, -2.2142]`
- **`MODEL_EXTENT`**: `[16.9288, 18.0725, 14.4280]`
- **`ROBUST_CENTER (1%~99%)`**: `[-0.0246, -0.0451, -0.0734]`
- **`ROBUST_EXTENT (1%~99%)`**: `[9.0753, 9.0332, 9.3348]`

---

## 4. 카메라 프레이밍 산출 (Step 4)

- **`BEST_CAMERA_TARGET`**: `[-0.0246, -0.0451, -0.0734]`
- **`BEST_CAMERA_DISTANCE`**: `16.83`
- **`BEST_CAMERA_POSITION`**: `[-0.0246, -0.0451, 16.8287]`

---

## 5. 회전각 스위프 및 궤도 뷰 분석 (Steps 5 & 6)

- **회전 스위프 (12개 후보)**:
  - `R10_3F_ORIENTATION_SWEEP.png` 생성 완료
  - `ROT_0_0_0` (기본 항등 회전) 및 `ROT_X180_Y0`이 데이터의 가장 정합된 시점을 제공함
  - `BEST_MODEL_ROTATION=[0, 0, 0]`
- **제어 궤도 뷰 (6개 뷰)**:
  - `R10_3F_CAMERA_ORBIT_CONTACT_SHEET.png` 생성 완료
  - 원거리(`cz=12`): 작은 포인트 클라우드 덩어리로만 보임
  - 근거리(`cz=4.5`, `ORBIT_CLOSE_PRODUCT`): 가우시안들이 길쭉한 침(Needle) 형태의 반투명 플로터로 흩어져 렌더링됨

---

## 6. 원본 촬영 사진 vs 가우시안 렌더 비교 (Step 8)

COLMAP 등록 카메라 포즈 4개(`booth08_a1`, `booth05_a1`, `booth04_a2`, `booth16_a2`)와 동일 위치에서 렌더링을 수행함:

- **`R10_3F_SOURCE_VS_RENDER_CONTACT_SHEET.png`** 대조 결과:
  - 실제 사진 속 선명한 Wilo 부스 벽면, 선명한 로고, 펌프 제품의 형태가 가우시안 렌더에서는 **재현되지 않음**
  - 카메라 광선 방향으로 늘어진 침(Needle) 형태의 노이즈와 뿌연 색상 덩어리만 형성됨
  - `TRAINING_POSE_RENDER_RECOGNIZABLE=false`

---

## 7. 시각적 인식성 평가 (Step 7)

| 항목 | 진단 결과 | 상세 내용 |
|---|---|---|
| **부스 구조 인식 여부** | **`false`** | 벽면, 기둥, 상단 아치 구조 인식 불가 |
| **펌프 아일랜드 인식 여부** | **`false`** | 청록색 펌프의 형상/윤곽 인식 불가 (색상 얼룩 수준) |
| **Wilo 브랜딩 인식 여부** | **`false`** | 텍스트/로고 전혀 판독 불가 |
| **깊이 일관성 (Depth Coherent)** | **`false`** | 시점 이동 시 가우시안 겹침 및 왜곡 심함 |
| **플로터 수준 (Floaters)** | **`HIGH`** | 공간상에 흩어진 불필요한 가우시안 다수 존재 |
| **홀(Hole) 수준** | **`SEVERE`** | 15개 시야각 외 전 영역이 완전 결손 |

---

## 8. 근본 원인 분석 (Step 9 — Root Cause)

**`PRIMARY_ROOT_CAUSE = GAUSSIAN_TRAINING_QUALITY_FAILURE`**

### 원인 세부 증거:
1. **극소수의 촬영 시점 (15/51 = 29.4% 수렴)**: 
   - 전체 51장 중 15장만 부분 연결되어 시차(Parallax)와 광선 교차각(Ray Intersection Angle)이 극도로 부족함.
   - 삼각측량 제약이 없는 자유 공간으로 가우시안이 길쭉하게 늘어지는 Needle Floater 현상 발생.
2. **Splatfacto 저반복 학습 (2,000 Iterations)**:
   - 밀도 제어(Densification) 및 불투명도 리셋(Opacity Reset)이 충분히 진행되지 않아 가우시안 크기가 수렴하지 못함.
3. **부차적 요인 (뷰어 프레이밍 및 포맷)**:
   - 기본 뷰어 카메라 거리(6.0)가 모델 크기(9.0) 대비 너무 가까워 플로터 내부로 진입했던 점 (`VIEWER_CAMERA_ERROR`)
   - `GaussianSplats3D` 라이브러리의 `.spz` 포맷 미지원 (`SPZ_CONVERSION_ERROR`)

---

## 9. 프로덕션 안전 조치 및 결론 (Step 10)

- **시각 품질 합격(PASS) 처리 절대 불가**
- UI 라벨은 **`Partial Experimental Preview`** 유지 (Full 3D 승격 금지)
- 가짜 합성(Synthetic) 데이터 사용 금지
- 진정한 3D 부스 재구성을 위해서는 **`R10.1 TARGETED_RECAPTURE_PLAN.md`에 정의된 보충 현장 촬영(360° 연속 촬영)**이 유일한 해법임.

---

## 10. 최종 제출 필수 값 (Final Required Values)

```
PLY_VISUALLY_RECOGNIZABLE=false
SPZ_VISUALLY_RECOGNIZABLE=false
SPZ_CONVERSION_DEGRADATION=SPZ_FORMAT_UNSUPPORTED_IN_GAUSSIANSPLATS3D

MODEL_BBOX_MIN=[-6.6312, -6.7164, -9.4282]
MODEL_BBOX_MAX=[10.2977, 11.3561, 4.9998]
MODEL_CENTER=[1.8333, 2.3198, -2.2142]
MODEL_EXTENT=[16.9288, 18.0725, 14.4280]

BEST_MODEL_ROTATION=[0, 0, 0]
BEST_CAMERA_POSITION=[-0.0246, -0.0451, 16.8287]
BEST_CAMERA_TARGET=[-0.0246, -0.0451, -0.0734]

TRAINING_POSE_RENDER_RECOGNIZABLE=false

BOOTH_STRUCTURE_RECOGNIZABLE=false
PUMP_ISLAND_RECOGNIZABLE=false
WILO_BRANDING_RECOGNIZABLE=false
DEPTH_COHERENT=false

PRIMARY_ROOT_CAUSE=GAUSSIAN_TRAINING_QUALITY_FAILURE

OWNER_VISUAL_ACCEPTANCE=false

FINAL_STATUS=
R10_3F_DIAGNOSTIC_COMPLETE
```
