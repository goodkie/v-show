# 📘 ³D₂ Virtual Tradeshow Platform — 인수인계 및 개발 사용 설명서 (v12.0)

> **문서 버전:** v12.0 Master Release (Phase 3.23 Complete)  
> **작성일자:** 2026-09-03  
> **라이브 프로덕션 URL:** [https://v-show-commercial-v1-production.up.railway.app/](https://v-show-commercial-v1-production.up.railway.app/)  
> **기준 검증 프로젝트:** `?projectId=prj-free-f4370ccd` (ArcBest 3D Showcase Booth)  
> **Git Repository:** `https://github.com/goodkie/v-show.git` (Branch: `master`)  
> **Restore Point Tags:** `v12.0-master-restore-point`, `restore-point-phase-3.23-complete`  
> **아카이브 파일:** `V_SHOW_RESTORE_POINT_v12_0_COMPLETE.zip`

---

## 1. 프로젝트 개요 (Project Overview)

본 플랫폼은 단 한 장의 사진 또는 360° 파노라마를 업로드하여 웹 브라우저에서 즉시 체험 가능한 **차세대 WebGL/Three.js 기반 3D 가상 무역 박람회(Virtual Trade Show) 및 디지털 트윈(Digital Twin) 상용 플랫폼**입니다.

### 🌟 핵심 주요 기능
1. **360° 파노라믹 3D 뷰어 & 스튜디오**:
   - Three.js 구체 지오메트리(`SphereGeometry`) 및 고성능 셰이더 텍스처 렌더링
   - 부스 전면 안내 데스크와 브랜드를 정면으로 응시하는 **아이레벨 수평 시야(Eye-Level Standing Horizon)** 정밀 캘리브레이션
   - 뷰어 하단 플로팅 글래스모피즘 **9종 방향성 내비게이션 프리셋 바** (`NORMAL`, `WIDE`, `LEFT VIEW`, `CENTER`, `RIGHT VIEW`, `LOOK UP`, `LOOK DOWN`, `CLOSE VIEW`, `RESET`)
   - 3D 레이더 미니맵(Radar Minimap) 및 반응형 제품 인터랙티브 핀(Product Hotspots)
2. **AI 부스 강화 파이프라인 (AI Enhance Booth Engine)**:
   - 16K 초고해상도 신경망 업스케일링 & 깊이 맵(Depth Map) 생성
   - **자동 행인 제거(Automatic People Removal)** 기능: 부스 사진 속 불필요한 관람객/행인을 신경망 세그멘테이션으로 자동 감지하여 깨끗한 부스 전경으로 인페인팅 (사용자가 직관적으로 ON/OFF 전환 가능)
   - 멀티 포맷 이미지 인제스트: 손상된 SOI(Start of Image) 마커 자동 복구 및 Sharp/pure-JS 다중 디코딩 폴백 지원
3. **점진적 텍스처 폴백 스트리밍 (Progressive Fallback Loader)**:
   - 클라이언트 뷰어 초기화 시 `16k -> 8k -> 4k -> 2k -> 데모 파노라마` 순으로 자동 폴백을 시도하여 네트워크 오류나 에셋 누락 시에도 블랙 스크린 없이 100% 화면 표시 보장
4. **고객 셀프 온보딩 & 세션 인증 (Customer Funnel & Auth)**:
   - 무료 3D 부스 즉시 생성 깔때기
   - 이메일 OTP 기반 보안 로그인 (내부 QA용 공통 코드: `123456`)
   - 고객 토큰(`3d2_customer_token`) 기반 브라우저 세션 및 부스 상태 영구 유지

---

## 2. 디렉토리 구조 (Directory Structure)

```text
E:\vivpr\ai\v-show\
├── virtual-tradeshow-commercial-v1\
│   ├── app_build\                          <-- [메인 개발 소스 코드의 원천]
│   │   ├── client\
│   │   │   ├── index.html                  <-- 메인 3D 부스 뷰어 & 고객 스튜디오 대시보드
│   │   │   ├── login.html                  <-- 이메일 OTP 고객 로그인 페이지
│   │   │   ├── demo-fashion.html           <-- VANTÉLLE PARIS 쇼룸
│   │   │   ├── demo-cosmetic.html          <-- LUMIÈRE 쇼룸
│   │   │   ├── demo-furniture.html         <-- NOVA LIVING 쇼룸
│   │   │   ├── demo-matterport.html        <-- ³DNa ROBOTIC 쇼룸
│   │   │   └── assets\                     <-- 3D 모델, 기본 텍스처, 브랜드 에셋
│   │   ├── server\
│   │   │   ├── index.js                    <-- Express 백엔드 API & 에셋 스트리밍
│   │   │   └── lib\
│   │   │       └── jpeg-js\                <-- Pure-JS JPEG 디코더 (Sharp 네이티브 바인딩 폴백용)
│   │   ├── uploads\                        <-- 업로드된 실사 파노라마 원본 및 16K/8K/4K/2K 파생본
│   │   ├── data\                           <-- 부스 프로젝트 메타데이터 JSON 저장소
│   │   └── package.json
│   ├── _railway_deploy\                    <-- [Railway 배포 전용 클린 미러]
│   ├── _clean_deploy\                      <-- [로컬 테스트 및 배포 검증용 동기화 디렉토리]
│   ├── production_artifacts\
│   │   └── p323\                           <-- Phase 3.23 프로덕션 실측 스크린샷 15종
│   └── scripts\                            <-- 자동화 검증, 캡처, 최적화 스크립트
├── package.json                            <-- 루트 패키지 및 Railway 실행 엔트리포인트
├── nixpacks.toml                           <-- Nixpacks 컨테이너 빌드 구성
├── Procfile                                <-- 웹 프로세스 실행 스크립트
├── HANDOVER_MANUAL_v12_0.md                <-- [본 인수인계 설명서]
├── RESTORE_POINT_GUIDE_v12_0.md            <-- [리스토어 포인트 가이드]
└── V_SHOW_RESTORE_POINT_v12_0_COMPLETE.zip <-- [전체 소스코드 완전 백업 압축 파일]
```

---

## 3. 핵심 아키텍처 및 3D 엔진 설정

### 1) 아이레벨 수평 시야각 보정 (Eye-Level Horizon Calibration)
* **문제 배경**: 과거 초기 뷰어 렌더링 시 카메라 피치가 위로 솟구쳐 어두운 천장 조명 트러스가 중앙에 오고 메인 부스가 아래로 쏠리는 현상 발생.
* **해결 원리**:
  - `photoSphere.rotation.y = -Math.PI / 2` (-90°): 부스 정면 안내 데스크와 메인 브랜드 텍스트가 정확히 카메라 전면을 마주보도록 텍스처 구체 초기 위상 정렬.
  - `camera.position.set(0, 0, 0.01)`: 360 구체의 정확한 중앙 원점에 카메라 배치.
  - `controls.target.set(0, 0, 0)`: 컨트롤의 시선 중심점을 수평선(0, 0, 0)에 고정.
  - `camera.fov = 50`: 사람의 실제 선 자세 시야각과 가장 일치하는 50° 기본 화각 적용.

### 2) 9종 방향성 내비게이션 프리셋 (Directional Presets Toolbar)
`client/index.html` 내 뷰어 하단 중앙에 플로팅 툴바(`#directionalPresetsBar`)가 배치되어 있습니다:
```html
<div id="directionalPresetsBar" style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 6px; background: rgba(15,23,42,0.85); backdrop-filter: blur(10px); padding: 6px 12px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.12);">
  <!-- NORMAL, WIDE, LEFT VIEW, CENTER, RIGHT VIEW, LOOK UP, LOOK DOWN, CLOSE VIEW, RESET -->
</div>
```
* **애니메이션 메커니즘**: `tweenCameraLook(targetPitch, targetYaw, targetFov)` 함수가 Three.js 렌더링 루프에서 부드러운 구면 보간을 통해 카메라 앵글을 이동시킵니다.
* **프리셋 사양**:
  - `NORMAL`: FOV 50°, 시선 수평 정면
  - `WIDE`: FOV 75° (넓은 전체 부스 파노라마 조망)
  - `LEFT VIEW`: 수평 왼쪽 35° 회전 (좌측 쇼케이스 관람)
  - `CENTER`: 정면 수평 정렬
  - `RIGHT VIEW`: 수평 오른쪽 35° 회전 (우측 쇼케이스 관람)
  - `LOOK UP`: 상단 25° 틸트 (상단 현수막 및 조명 점검)
  - `LOOK DOWN`: 하단 25° 틸트 (탁자 전시품 및 제품 카운터 점검)
  - `CLOSE VIEW`: FOV 40° (디테일 확대 시야)
  - `RESET`: 디폴트 좌표 완전 초기화

### 3) 자동 행인 제거 토글 (Automatic People Removal Toggle)
* AI Enhance 모달(`#aiEnhanceBoothModal`)에 배치된 직관적 토글 스위치.
* 함수: `window.updateAiEnhancePeopleToggleUI(isChecked)`
* 상태:
  - `ON`: 하늘색 슬라이더, `✓ ON` 배지 (`window.autoRemovePeople = true`)
  - `OFF`: 어두운 슬레이트 슬라이더, `OFF` 배지 (`window.autoRemovePeople = false`)
* 부스 생성 요청 시 `removePeople: window.autoRemovePeople` 매개변수가 백엔드로 전달됩니다.

---

## 4. 로컬 실행 및 개발 가이드

### 1) 로컬 개발 환경 준비
* 필수 요구사항: Node.js 20 이상, npm
```powershell
# 저장소 루트로 이동
cd E:\vivpr\ai\v-show

# 의존성 설치 (루트 및 app_build)
npm install
cd virtual-tradeshow-commercial-v1\app_build
npm install
```

### 2) 로컬 서버 시작
```powershell
# 개발 서버 실행
npm start
# 또는 루트에서: node virtual-tradeshow-commercial-v1/app_build/server/index.js
```
* 로컬 접속 주소: `http://localhost:8080/?projectId=prj-free-f4370ccd`
* 로그인 포털: `http://localhost:8080/login.html` (QA OTP 코드: `123456`)

---

## 5. 변경사항 동기화 및 Railway 프로덕션 배포 파이프라인

`app_build`에서 작업한 코드는 `_clean_deploy`와 `_railway_deploy`에 동기화된 후 배포됩니다.

### 1) 3개 디렉토리 일괄 동기화 스크립트
```powershell
# 소스 변경 후 동기화
cd E:\vivpr\ai\v-show
node -e "
const fs = require('fs');
const path = require('path');
const base = 'virtual-tradeshow-commercial-v1';
const targets = ['_clean_deploy', '_railway_deploy'];
const syncFiles = [
  'client/index.html',
  'client/login.html',
  'server/index.js'
];
targets.forEach(t => {
  syncFiles.forEach(f => {
    const src = path.join(base, 'app_build', f);
    const dst = path.join(base, t, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log('Synced', f, 'to', t);
    }
  });
});
"
```

### 2) Git 푸시 및 Railway 원클릭 자동 배포
```powershell
# 1. 변경사항 커밋 & 푸시
git add virtual-tradeshow-commercial-v1/
git commit -m "feat: your feature description"
git push origin master

# 2. Railway 배포 트리거 및 빌드 상태 실시간 추적
node "C:\Users\oPus\.gemini\antigravity\brain\a60a4785-daac-4045-b047-9b489e649678\scratch\trigger_and_track_p321.js"
```
* 배포가 완료되면 `🎉 Deployment <ID> SUCCEEDED!` 메시지가 출력됩니다.

---

## 6. 프로덕션 검증 스위트 (Automated Verification)

배포 후 15개 핵심 뷰어 및 사용자 플로우를 Puppeteer 헤드리스 크롬으로 100% 자동 검증합니다:
```powershell
$env:NODE_PATH="E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\_clean_deploy\node_modules"
node "C:\Users\oPus\.gemini\antigravity\brain\a60a4785-daac-4045-b047-9b489e649678\scratch\verify_p323_production.js"
```
검증 항목:
- `01_OLD_TOO_HIGH.png` vs `02_NEW_EYE_LEVEL_NORMAL.png`: 수평 시야각 보정 확인
- `03_WIDE.png` ~ `10_RESET.png`: 9종 프리셋 앵글 및 트랜지션 확인
- `AUTO_REMOVE_ON.png` / `AUTO_REMOVE_OFF.png`: 행인 제거 토글 상태 확인
- `11_APPLIED_B.png` ~ `15_NEW_SESSION_B.png`: 새로고침, 로그아웃, 재로그인, 시크릿 모드 지속성 확인

---

## 7. 다음 에이전트/개발자를 위한 핵심 주의사항 (Important Tips)

> [!IMPORTANT]
> 1. **Three.js 텍스처 인코딩 호환성**:
>    최신 Three.js 버전에서는 `sRGBEncoding` 대신 `SRGBColorSpace`를 사용합니다. 코드 작성 시 항상 `tex.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;`로 이중 호환을 유지하십시오.
> 2. **Sharp 네이티브 바이너리**:
>    Railway 리눅스 컨테이너와 윈도우 로컬 환경 간 Sharp 네이티브 모듈 차이로 에러가 발생하지 않도록 `server/lib/jpeg-js` pure-JS 디코더 폴백이 항상 활성화되어 있습니다.
> 3. **배포 시 3개 디렉토리 동기화 필수**:
>    반드시 `app_build`, `_clean_deploy`, `_railway_deploy` 3개 폴더의 `client/index.html` 및 `server/index.js`를 동일하게 유지해야 배포 롤백이나 불일치가 발생하지 않습니다.
