# PHASE 9.5 — AUREX SYNTHETIC PILOT SPECIFICATION & AUDIT
**Virtual Trade Show Commercial V1 — Deterministic 3D Multi-View Reconstruction Dataset**

---

## 1. 개요 및 합성 파일럿 규격 (Executive Synthetic Summary)
- **목적**: 2D AI 이미지 생성기가 아닌, **단 하나의 고정된 3D 지오메트리 & 고정된 조명 & 고정된 텍스처**를 가진 가상 부스에서 60개의 수학적으로 일관된 카메라 궤적을 렌더링하여 **SfM / COLMAP 및 3DGS 재구성 전용 결정론적 벤치마크 데이터셋**을 구축.
- **분류 (Classification)**: **`SYNTHETIC_TEST`**
- **데이터 출처**: **결정론적 3D WebGL2 / Three.js 렌더링 엔진** (비고객 가상 시뮬레이션 데이터)
- **가짜 고객/데이터 배제**: 실제 고객 사진 및 실제 바이어 데이터가 아님을 시스템 전반에 명확히 표기.

---

## 2. 가상 부스 아키텍처 및 3D 지오메트리 (Booth Architecture)
- **크기**: Width 10.0m x Depth 8.0m x Max Height 4.5m
- **색상 시스템**: Deep Navy (`#0b132b`), Electric Blue (`#1c64f2`), Semi-matte White (`#f8fafc`), Graphite (`#1e293b`), Cyan Accent (`#06b6d4`).
- **주요 구조물 (Fixed 3D Entities)**:
  1. **대형 상단 행거 (Overhead Header)**: `AUREX AUTOMATION TECHNOLOGIES`
  2. **메인 후면 벽 (Rear Wall)**: 대형 디스플레이 월 (`SMART FACTORY PLATFORM • AUTONOMOUS LOGISTICS`)
  3. **바닥 카펫 (Floor Carpet)**: SfM 코너 검출에 최적화된 고대비 그리드 및 네비게이션 마커 패턴
  4. **중앙 아일랜드 (Central Island)**: `AXR-500` 자율이동로봇(AMR) 원형 플랫폼
  5. **좌측 로봇 존 (Left Robot Cell)**: `COBOT-C7` 7축 코봇, `GRIP-PRO` 그리퍼, `FLEX-20` 스마트 컨베이어
  6. **우측 비전 & 센서 존 (Right Sensor Tower)**: `VIS-4K` 머신비전 검사기, `LIDAR-X360` 360 스캐너, `SAFE-500` 안전센서
  7. **전면 안내 데스크 (Info Kiosk)**: 브랜드 로고 및 키오스크
- **조명 체계 (Fixed Lighting Rig)**:
  - Ambient Fill Light: Intensity 0.75
  - Directional Main Light 1: `[-5, 7, 5]`, Intensity 1.1 (Shadow Enabled)
  - Directional Fill Light 2: `[5, 7, 5]`, Intensity 0.9
  - Point Accent Light: `[0, 3.8, 0]`, Intensity 1.2

---

## 3. 60개 결정론적 카메라 포즈 궤적 (60 Camera Poses Manifest)

| 카메라 패스 구간 | 프레임 번호 | 궤적 설명 | 렌더링 목적 |
| :--- | :---: | :--- | :--- |
| **Pass A: Exterior Arc** | `001` ~ `020` | 반경 11m, 방위각 -70° ~ +70°, 높이 1.65m 원거리 반원 아크 | 부스 전면 전체 외관 및 주변 구조물 SfM 매칭 |
| **Pass B: Medium Arc** | `021` ~ `035` | 반경 7.8m, 방위각 -60° ~ +60°, 높이 1.55m 중거리 아크 | 주요 제품 아일랜드 및 전시존 중첩 뷰포인트 확보 |
| **Pass C: Interior Walk** | `036` ~ `050` | 좌측 통로 진입 → 중앙 AMR → 우측 비전존 내부 워크스루 | 내부 제품 근접 지오메트리 및 가려진 후면 매칭 |
| **Pass D: Close Detail & Return** | `051` ~ `060` | 코봇/비전/컨트롤러 정밀 디테일 캡처 및 전면 복귀 | 서보/PLC/센서 디테일 핫스팟 매핑 및 루프 클로저 |

---

## 4. 15개 제품 카탈로그 및 3D 공간 앵커 (15 Product Catalog)

| SKU | 제품명 (Product Name) | 카테고리 | 3D 공간 좌표 `[X, Y, Z]` |
| :--- | :--- | :--- | :---: |
| **AXR-500** | AXR-500 Autonomous Mobile Robot | Autonomous Robotics | `[0.0, 0.4, 0.0]` |
| **COBOT-C7** | COBOT C7 Collaborative Robot | Collaborative Robotics | `[-3.2, 1.0, -1.5]` |
| **VIS-4K** | VIS-4K Machine Vision System | Machine Vision | `[3.1, 1.2, -1.0]` |
| **FLEX-20** | FLEX-20 Smart Conveyor | Material Handling | `[-2.5, 0.8, -2.8]` |
| **LIDAR-X360** | LIDAR X360 Industrial Scanner | Industrial Sensors | `[2.2, 1.1, -0.5]` |
| **GRIP-PRO** | GRIP-PRO Adaptive Robot Gripper | Robot Tooling | `[-2.0, 1.0, -0.8]` |
| **EDGE-X** | EDGE-X Industrial Edge Computer | Industrial Computing | `[3.5, 1.3, -2.5]` |
| **SAFE-500** | SAFE-500 Safety Scanner | Safety Systems | `[2.5, 0.6, 1.5]` |
| **SERVO-X8** | SERVO-X8 Motion Controller | Motion Control | `[1.5, 1.5, -3.8]` |
| **PLC-NOVA** | PLC-NOVA Programmable Controller | Industrial Control | `[0.5, 1.5, -3.8]` |
| **AGV-FLEET** | AGV-FLEET Fleet Management Platform | Fleet Software | `[-0.5, 2.2, -3.9]` |
| **DTWIN** | DTWIN Factory Digital Twin | Digital Twin | `[0.0, 2.5, -3.9]` |
| **INSPECT-AI** | INSPECT-AI Vision Inspection Platform | AI Inspection | `[2.8, 1.2, -1.8]` |
| **PICK-X** | PICK-X Robotic Picking Cell | Robotic Cells | `[-3.5, 1.2, -2.5]` |
| **SMART-IO** | SMART-I/O Distributed I/O System | Industrial I/O | `[-1.5, 1.4, -3.8]` |

---

## 5. 데이터셋 검증 및 캡처 QA 보고서 (Capture QA: 100% PASS)
- **독립 소스 이미지 수**: **정확히 60장 (`booth_001.jpg` ~ `booth_060.jpg`)**
- **해상도 일관성**: **1600 x 1200** (전수 100% 동일)
- **전체 데이터셋 크기**: **13,446,140 bytes (~13.4 MB)**
- **손상/누락 프레임**: **0건 (None)**
- **리뷰용 60뷰 콘택트 시트**: [`aurex_60view_contact_sheet.jpg`](file:///E:/vivpr/ai/v-show/phase9_5-synthetic-pilot/booth/reference/aurex_60view_contact_sheet.jpg) (3200x1440, 980 KB)
- **Capture QA 판정**: **`PASS`** (`productionReady: true`)

---

## 6. 플랫폼 SYNTHETIC_TEST 테넌트 온보딩 현황
- **Company**: `AUREX Automation Technologies` (Org: `org-exhibitor-4351986b`)
- **Booth**: D-401 (`booth-089e2c7f`)
- **Admin**: `pilot-admin@aurex-automation.test` (비밀번호 보안 강화 완료)
- **Reconstruction State**: **`synthetic_capture_ready`**
- **Current Viewer Mode**: **Photo Preview** (안전 서빙 가동)
- **Modal GPU 실연산**: **NOT RUN ($0.00 유지)**
