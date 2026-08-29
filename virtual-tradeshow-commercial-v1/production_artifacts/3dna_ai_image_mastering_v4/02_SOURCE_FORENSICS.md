# 02. Source Forensics & Visual Shooting Guide

## Part 1: Source Forensics Audit Engine
Before any enhancement, the system executes an automated forensic scan:
- **Dimensions & Aspect Ratio**: Width, Height, Aspect Ratio calculation.
- **Optical Quality**: Laplacian blur variance, sensor noise estimation, compression artifact level.
- **Scene Composition**: Booth visibility percentage, occlusion index, framing quality.
- **Bad Source Gating**: Rejection threshold for extreme blur or low resolution (<480p).
  - `BAD_IMAGE_CONSUMES_FREE_ALLOWANCE = false`

---

## Part 2: 📸 최적화 부스 사진 촬영 가이드 (스마트폰 & DSLR)

고객이 업로드 시점에서 최고 화질의 부스 사진을 촬영할 수 있도록 제공되는 **초간단 비주얼 가이드**입니다.

### 📱 1. 스마트폰(Phone Camera) 촬영 핵심 5계명
1. **렌즈 닦기**: 촬영 전 카메라 렌즈를 옷이나 안경천으로 깨끗이 닦아 지문 빛번짐을 없앱니다.
2. **1x 메인 렌즈 사용**: 0.5x(초광각)는 부스가 찌그러지고, 3x 디지털 줌은 화질이 깨집니다. 반드시 **1x 기본 렌즈**를 사용하세요.
3. **가로(16:9 / 4:3) & 수평 유지**: 카메라를 가로로 잡고, 눈높이(지상 1.4~1.5m)에서 수평선을 바르게 맞춥니다.
4. **부스 꽉 채우기 (85% 프레이밍)**: 부스에서 3~5걸음 뒤로 물러나, 부스 전체가 화면의 85% 이상 꽉 차도록 구도를 잡습니다.
5. **초점 & 노출 고정**: 화면의 **브랜드 로고**나 **메인 제품**을 손가락으로 탭하여 초점과 밝기를 맞춥니다.

### 📷 2. DSLR / 미러리스 카메라 촬영 추천 세팅
- **화각 (Focal Length)**: 35mm ~ 50mm 표준 렌즈 (왜곡 방지)
- **조리개 (Aperture)**: **f/5.6 ~ f/8.0** (앞뒤 모든 제품이 또렷한 팬포커스 확보)
- **셔터스피드**: **1/125초 이상** (손떨림 블러 방지)
- **ISO 감도**: **ISO 100 ~ 400** (노이즈 최소화)

### 🚫 3. 피해야 할 3대 주의사항 (DON'T)
- ❌ **사람이나 짐이 부스 앞을 가로막은 사진** (제품 가림 방지)
- ❌ **어안 렌즈 수준의 과도한 왜곡 사진**
- ❌ **어두운 역광 또는 심하게 흔들린 사진**
