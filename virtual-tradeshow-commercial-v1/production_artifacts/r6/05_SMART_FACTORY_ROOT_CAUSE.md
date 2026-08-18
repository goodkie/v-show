# 05_SMART_FACTORY_ROOT_CAUSE — SMART FACTORY 시각 요소 원인 규명 보고서
(Phase 10.7N-R6 Root Cause Analysis)

---

## 1. 근본 원인 분류 (Root Cause Classification)

- **선택 분류**: **`A. encoded in REAL_WILO_GAUSSIAN_FINAL.spz`**

---

## 2. 상세 물리적 증거 (Physical Evidence Chain)

1. **SPZ 디코딩 결과**:
   - `REAL_WILO_GAUSSIAN_FINAL.spz`는 압축 해제 시 526,941개의 정밀 Gaussian Splatting 버텍스를 보유하고 있습니다.
   - Bounding Box: `[-20.95, -17.99, -20.68]` ~ `[5.00, 6.25, 5.00]`
   - Spherical Harmonics DC 컬러 데이터에 의해 파란색/청록색/네이비 계열의 조명과 텍스처가 영구적으로 인코딩되어 있습니다.

2. **학습 데이터셋 기원**:
   - `C:\Users\vivPR\vshow-reconstruction\wilo-real-recon-02` 작업 영역의 60장 이미지(`wilo_60_001.jpg` ~ `wilo_60_060.jpg`)는 `build_studio.py`를 통해 가상 렌더링된 씬이었습니다.
   - `build_studio.py`는 `phase9_5-synthetic-pilot/booth/scene/single_studio.html` (Smart Factory / Autonomous Logistics 플랫폼 지오메트리)를 기반으로 일부 텍스처를 Wilo 텍스트로 치환하여 렌더링 후 Splatfacto로 학습시킨 모델입니다.

3. **결론**:
   - 브라우저의 렌더러(`PrecisionSplatViewer` / `Spark`)나 HTML/CSS의 결함이 아니라, **학습되어 인코딩된 Gaussian 모델 파일(`REAL_WILO_GAUSSIAN_FINAL.spz`) 자체에 스마트 팩토리 계열의 가상 구조물이 포함되어 있는 것**이 확인되었습니다.
