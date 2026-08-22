# R10_4 VIEWER FORMAT & RUNTIME ARCHITECTURE DECISION

**문서 일자**: 2026-08-19  
**프로젝트**: Virtual Trade Show Commercial V1 — Wilo 3D Showroom  
**목적**: 3D 가우시안 뷰어 엔진과 파일 포맷(PLY, SPZ, SPLAT, KSPLAT) 간의 호환성 분석 및 차기 정식 재구성 시 사용할 뷰어 파이프라인 표준 확정  

---

## 1. 배경 및 진단 결과

PHASE 10.7N-R10.3F 시각 품질 포렌식 과정에서 다음의 뷰어-포맷 비호환성이 확인되었습니다:

1. **`GaussianSplats3D` (mkkellogg)**:
   - 지원 포맷: `.ply`, `.splat`, `.ksplat` (압축 청크 포맷)
   - **미지원 포맷**: Niantic `.spz` (압축 바이너리 포맷 직접 로드 시 `File format not supported` 발생)
2. **`Spark 2.1.0` (WebGL2 Radiance Engine)**:
   - 지원 포맷: `.spz`, `.ply`
   - 제약 사항: 외부 벤더 JS 라이브러리(`spark.module.js`) 및 WebGL2 전용 셰이더 의존성 필요

---

## 2. 뷰어 파이프라인 비교 분석

| 평가 항목 | 옵션 A: Spark + SPZ 파이프라인 | 옵션 B: GaussianSplats3D + PLY/KSPLAT 파이프라인 |
|---|---|---|
| **압축률 / 파일 크기** | 매우 우수 (~20 MB 수준) | PLY: 50~100MB / KSPLAT: ~25MB |
| **Three.js 버전 호환성** | Three.js r128~r159 커스텀 메시 연동 필요 | Three.js 최신 릴리스 및 독립 캔버스 안정 구동 |
| **CDN / 오픈소스 유지보수** | Niantic Studio 생태계 중심 | GitHub / npm 활발한 커뮤니티 지원 |
| **모바일 / 저사양 WebGL2 지원** | 높음 (SPZ 고속 디코딩) | 우수 (LOD, Progressive Loading 지원) |
| **프로덕션 통합 용이성** | WASM 디코더 추가 번들링 필요 | 단일 모듈 임베드 또는 독립 iframe 가능 |

---

## 3. 최종 결정 (Architectural Decision)

### 📌 선택 표준: **옵션 B (`GaussianSplats3D` 기반 PLY / KSPLAT 파이프라인)**

1. **이유**:
   - WebGL2 표준 호환성이 높고, 360° 대규모 부스 모델에서 점진적 정렬(Splat Sorting)과 LOD 성능이 검증됨.
   - 포맷 변환 시 복잡한 WASM 브릿지 없이 `ns-export gaussian-splat`의 표준 PLY 또는 KSPLAT 컨버터를 직접 활용 가능.
2. **차기 재구성 적용 규칙**:
   - 보충 현장 촬영(24~32장) 완료 후 정식 Gaussian 재구성 시, `GaussianSplats3D` 지원 포맷(`.ply` 또는 `.ksplat`)으로 빌드하여 배포함.
   - Niantic SPZ를 사용해야 할 경우 반드시 공식 Niantic WASM 디코더를 번들링하여 사전 검증을 완료한 후 연동함.
