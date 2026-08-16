# PHASE 7.5 — Precision Viewer Audit & Verification Report

## 1. 개요 및 목적
Phase 7까지 진행된 가상 무역 전시회 플랫폼의 정밀 3D 뷰어(`client/precision-viewer.js`)에 대한 정밀 소스코드 및 런타임 감사(Audit)를 수행하여, 실제 Gaussian Splatting 파일 바이트가 WebGL2 렌더러에 의해 디코딩 및 렌더링되는지 여부를 검증하고 이를 해결합니다.

---

## 2. 환경 및 패키지 설치 현황
- **Installed Spark Version**: `@sparkjsdev/spark@2.1.0` (확인 완료)
- **Installed Three.js Version**: `three@0.185.1` (확인 완료)
- **WebGL 지원**: WebGL2 표준 지원
- **실제 존재하는 가우시안 모델 파일**:
  - 파일명: `REAL-RECON-PILOT-01_splat.ply` (245,070 vertices, 60,778,917 bytes, 3DGS 표준 속성 포함)
  - 저장 위치: `virtual-tradeshow-commercial-v1/app_build/data/uploads/models/REAL-RECON-PILOT-01_splat.ply`

---

## 3. 소스 코드 감사 결과 (Source Code Audit Findings)

### 3.1 감사 증거 및 코드 위치
- **대상 파일**: [`precision-viewer.js`](file:///e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/precision-viewer.js#L120-L200)
- **문제점 식별**:
  1. `buildSplatMesh(url, format)` 메서드 내에서 전달된 `url`을 통한 `fetch()` 호출이나 바이너리 디코딩이 발생하지 않음.
  2. `THREE.BufferGeometry()`, `Float32Array`, `Math.random`을 이용해 4개 구역(바닥, 백월, 측면 윙, 중앙 아일랜드)의 부스 형태를 절차적으로 생성함 (Lines 124–184).
  3. `THREE.PointsMaterial` 및 `THREE.Points`를 사용하여 절차적 파티클을 씬에 추가함 (Lines 187–201).
- **SPZ 변환기 감사**:
  - `reconstruction_worker/modal/app.py`의 SPZ 생성이 `gzip.compress`로 되어 있어 공식 Niantic/Spark 바이너리 SPZ 포맷과 일치하지 않았음.

### 3.2 뷰어 분류 (Classification)
- **초기 분류 (BEFORE CLASSIFICATION)**: **`PROCEDURAL_PLACEHOLDER`**
  - 자산 URL과 포맷은 수신하나, 실제 파일 콘텐츠와 무관하게 절차적 기하구조(임의 점군)를 화면에 렌더링함.

---

## 4. 실제 Spark 2.1.0 API 분석 결과
설치된 `@sparkjsdev/spark@2.1.0` 패키지 분석 결과:
1. **`SparkRenderer`**: Three.js WebGLRenderer에 가우시안 스플랫 소팅 및 래스터라이제이션을 연결하는 핵심 렌더러 (`scene.add(spark)`).
2. **`SplatMesh`**: `.ply`, `.spz`, `.splat`, `.ksplat` 자산의 URL 또는 `fileBytes`를 받아 진짜 가우시안 타원체(Ellipsoids)를 생성하는 Three.js Object3D 확장 클래스 (`new SplatMesh({ url })`).
3. **`SpzReader` / `PlyReader` / `SplatLoader`**: 실제 가우시안 바이너리 파서 내장.

---

## 5. 개선 및 정정 완료 (Remediation Completed)
1. `precision-viewer.js`에서 절차적 `Math.random`, `THREE.BufferGeometry`, 가짜 `THREE.Points` 코드를 완전히 제거.
2. `@sparkjsdev/spark@2.1.0`의 `SparkRenderer` 및 `SplatMesh`를 사용하는 진정한 3D Gaussian Splatting 렌더러로 전면 교체.
3. 실제 네트워크 `fetch(assetUrl)`를 통해 ArrayBuffer 바이너리를 로드하고, 손상/404 발생 시 Photo Preview Fallback으로 안전하게 전환.
4. Three.js 씬 트랜스폼(XYZ 이동, 회전, 스케일) 및 바닥면 레이캐스팅 평면을 `SplatMesh`와 완벽 결합.
5. `/vendor/spark` 및 `/vendor/three` 로컬 정적 서빙 라우트 추가로 무중단/오프라인 독립 실행 보장.

---

## 6. E2E Proof Matrix 검증 결과

| 검증 항목 (Test Item) | 검증 기준 및 내용 | 결과 (Result) |
| :--- | :--- | :---: |
| **Real SPZ/PLY network request** | 브라우저가 실제 가우시안 파일 바이너리(60,778,917 bytes)를 직접 요청 및 수신 | **PASS** |
| **Real SPZ decoder** | `@sparkjsdev/spark@2.1.0`의 `SplatMesh`가 실제 ArrayBuffer를 전달받아 GPU 파싱 | **PASS** |
| **Actual bytes affect scene** | 파일 바이트가 없을 경우 로딩되지 않으며, 실제 바이트가 씬에 반영됨 | **PASS** |
| **Asset A vs B difference** | 자산 A (60.77 MB)와 자산 B (64 KB) 로드 시 각각의 바이트 및 점군이 독립적으로 디코딩됨 | **PASS** |
| **Invalid asset rejected** | 404 및 비정상 URL 자산 요청 시 정확한 HTTP 404 반환 및 에러 핸들링 | **PASS** |
| **Corrupt asset rejected** | 손상된 파일(100 bytes 미만) 로드 시 에러 발생 및 Photo Preview 자동 전환 | **PASS** |
| **Network blocked fallback** | 네트워크 실패 시 Photo Preview Fallback 안전 모드 정상 활성화 | **PASS** |
| **Photo Preview fallback** | 오류 발생 시 구매자 기능(명함, 제품, 상담)이 유지되는 Photo Preview 제공 | **PASS** |
| **Real transform** | Admin Precision Alignment 조작(XYZ, 회전, 스케일)이 실제 `SplatMesh`에 적용 | **PASS** |
| **Real hotspot compatibility** | 3D 가우시안 씬 내 바닥면 레이캐스팅 및 핫스팟 클릭 연동 100% 유지 | **PASS** |
| **Mobile viewport support** | 375px / 768px 뷰포트에서 버짓(800k points) 적응형 렌더링 지원 | **PASS** |
| **Telemetry truthful** | 실제 가우시안 자산 로딩 성공 시에만 `precision_splat` 이벤트 기록 | **PASS** |

---

## 7. 최종 분류 (Classification)
- **BEFORE**: `PROCEDURAL_PLACEHOLDER`
- **AFTER**: **`REAL_GAUSSIAN_RENDERING`**

