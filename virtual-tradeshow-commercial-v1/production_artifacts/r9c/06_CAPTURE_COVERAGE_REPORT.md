# 06_CAPTURE_COVERAGE_REPORT — 실사 커버리지 및 중첩도 분석 보고서

---

## 1. 이미지 구성 현황

- **총 이미지 파일 수**: **71장**
  - `ChatGPT Image *.jpg`: **20장** (1024x1024 / AI 텍스트 프롬프트 생성물)
  - `boothXX_aY_*.jpg`: **51장** (1024x1024 49장, 1200x896 2장 / AI 다각도 시드 생성물)

---

## 2. 시점 및 각도 분포 (Coverage Distribution)

- 전면(Front), 조감(Aerial Overview), 근접(Closeup), 측면(Flank) 등 다양한 가각도 프레임이 구성되어 있으나, **물리적 카메라 이동 경로에 따른 기하학적 연속체(Geometric Continuity)가 아님**.

---

## 3. 중첩도(Overlap) 및 기하학적 정합성 평가

- **추정 2D 시각 중첩도**: 50% ~ 75%
- **3D Epipolar Geometry 정합성**: **FAIL (불일치)**
  - 프레임 간 조명 트러스 형상, 배후 전시홀 구조, 안내 데스크 텍스트 표기(`Welcome for Bay What Energy`), 관람객 인물 및 배치 등이 매 프레임마다 AI 디퓨전 샘플링 과정에서 미세하게 변형(Hallucination)되어 있어, **COLMAP 특징점 매칭(SIFT Feature Matching) 시 삼각측량(Triangulation) 및 번들 조정(Bundle Adjustment)이 실패하거나 유령 기하구조(Ghost Geometry)를 형성**함.
