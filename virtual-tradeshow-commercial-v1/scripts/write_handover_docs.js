const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';

const manualContent = `# 📘 ³DNa Virtual Tradeshow Platform — 인수인계 및 개발 사용 설명서 (v9.0)

> **문서 버전:** v9.0 Master Release  
> **생성일자:** 2026-08-28  
> **라이브 프로덕션 URL:** [https://v-show-commercial-v1-production.up.railway.app/](https://v-show-commercial-v1-production.up.railway.app/)  
> **Git Repository:** https://github.com/goodkie/v-show.git (Branch: master)  
> **Restore Point Tag:** v9.0-master-restore-point

---

## 1. 프로젝트 개요 및 핵심 기능

본 프로젝트는 WebGL 3D 공간 및 실사 360° 파노라마를 결합한 엔터프라이즈급 **차세대 가상 무역 박람회(Virtual Trade Show) 및 3D 디지털 쇼룸 상용 플랫폼**입니다.

### 🌟 주요 컴포넌트 구성
1. **메인 랜딩 페이지 (index.html)**:
   - 4대 3D 포토 이멀시브 부스 쇼케이스 iframe 임베딩
   - AI 가상 피팅룸 (Virtual Fitting Room) 비디오 인터랙션 카드
   - AI 가상 메이크업 아티스트 (Virtual Makeup Artist) 비디오 인터랙션 카드
   - 엔터프라이즈 요금제 모달 및 원클릭 결제 파이프라인 진입
   - 전 항목 영문화된 Partnerships & Affiliates 신청 모달
2. **4대 3D 포토 이멀시브 부스**:
   - **VANTÉLLE PARIS (demo-fashion.html)**: 파리 패션위크 런웨이 의류 컬렉션 쇼룸
   - **LUMIÈRE (demo-cosmetic.html)**: 글로벌 클리니컬 스킨케어·코스메틱 쇼룸
   - **NOVA LIVING (demo-furniture.html)**: 프리미엄 스칸디나비안 가구·인테리어 쇼룸
   - **³DNa ROBOTIC (demo-matterport.html)**: 차세대 산업용 정밀 로봇·AMR 쇼룸
3. **무지연 인메모리 에셋 스트리밍 시스템 (server/demo_asset_bundle.js)**:
   - 360° 파노라마, 고화질 제품 썸네일, 비디오 에셋을 서버 메모리에 상주시켜 네트워크 지연(0ms) 및 파일 누락 없이 즉시 스트리밍(HTTP 200 / 206 Range 지원)

---

## 2. 프로젝트 디렉토리 구조

\`\`\`text
E:\\vivpr\\ai\\v-show\\
├── virtual-tradeshow-commercial-v1\\
│   ├── app_build\\                          <-- [메인 개발 소스 코드]
│   │   ├── client\\
│   │   │   ├── index.html                  <-- 랜딩 페이지
│   │   │   ├── demo-fashion.html           <-- VANTÉLLE PARIS 3D 뷰어
│   │   │   ├── demo-cosmetic.html          <-- LUMIÈRE 3D 뷰어
│   │   │   ├── demo-furniture.html         <-- NOVA LIVING 3D 뷰어
│   │   │   ├── demo-matterport.html        <-- ³DNa ROBOTIC 3D 뷰어
│   │   │   └── assets\\demo\\                <-- 원본 에셋 (파노라마, 제품, 영상)
│   │   ├── server\\
│   │   │   ├── index.js                    <-- Express 서버 및 에셋 미들웨어
│   │   │   └── demo_asset_bundle.js        <-- 인메모리 에셋 번들
│   │   └── package.json
│   ├── _railway_deploy\\                    <-- [Railway 배포 전용 미러]
│   ├── scripts\\                            <-- [자동화/최적화/검증 스크립트]
│   │   ├── build_final_lean_bundle.js      <-- 에셋 번들 생성 스크립트
│   │   ├── optimize_panoramas.ps1          <-- 파노라마 4K 고화질 리샘플러
│   │   ├── optimize_products.ps1           <-- 제품 썸네일 리사이저
│   │   └── capture_fast_final.js           <-- Puppeteer 라이브 스크린샷 캡처
│   ├── HANDOVER_MANUAL.md                  <-- 본 개발 사용설명서
│   └── RESTORE_POINT_GUIDE_v9_0.md         <-- 리스토어 포인트 상세 가이드
└── V_SHOW_RESTORE_POINT_v9_0_COMPLETE.zip  <-- 리스토어 포인트 압축 아카이브
\`\`\`

---

## 3. 3D 뷰어 엔진 아키텍처 및 텍스처 파이프라인

모든 3D 부스는 Three.js 기반의 구체 지오메트리(SphereGeometry) 내부에서 카메라가 360° 회전하며 텍스처를 렌더링합니다.

### ⚙️ 핵심 렌더링 설정
* **generateMipmaps = false**: 원거리 텍스처 밉맵 축소 시 발생하는 블러 현상을 원천 방지
* **minFilter / magFilter = THREE.LinearFilter**: 원본 픽셀 1:1 보존
* **anisotropy = 16**: 비등방성 16x 필터링으로 사각지대/경사면 왜곡 제거
* **devicePixelRatio (DPR 2x)**: Math.max(window.devicePixelRatio, 2.0) 슈퍼샘플링 강제 적용

---

## 4. 원본 사진(360° 파노라마) 교체 방법

새로운 고화질 360 파노라마 이미지로 교체할 경우 아래 절차를 따릅니다:

### 규격 요구사항
* **형식**: 2:1 가로세로 비율의 에퀴렉탱귤러(Equirectangular) JPG / PNG
* **권장 해상도**: 8192 × 4096 (8K) 또는 4096 × 2048 (4K)

### 교체 절차
1. 원본 이미지를 아래 경로에 덮어씁니다:
   - Vantelle: app_build/client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg
   - Lumière: app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg
   - Nova Living: app_build/client/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg
   - ³DNa Robotic: app_build/client/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg

2. 번들 재생성 스크립트를 실행합니다:
   \`\`\`powershell
   cd E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1
   powershell -ExecutionPolicy Bypass -File scripts\\optimize_panoramas.ps1
   node scripts\\build_final_lean_bundle.js
   \`\`\`

3. 배포 루틴을 실행합니다.

---

## 5. 로컬 개발 및 실행 가이드

### 1) 로컬 서버 시작
\`\`\`powershell
cd E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\app_build
npm install
npm start
# http://localhost:8080 접속
\`\`\`

### 2) 클라이언트 직접 열기
- 랜딩 페이지: http://localhost:8080/index.html
- 패션 쇼케이스: http://localhost:8080/demo-fashion.html
- 코스메틱 쇼케이스: http://localhost:8080/demo-cosmetic.html
- 가구 쇼케이스: http://localhost:8080/demo-furniture.html
- 로봇 쇼케이스: http://localhost:8080/demo-matterport.html

---

## 6. Railway 프로덕션 원클릭 배포 루틴

Railway CLI를 통해 \`_railway_deploy\` 디렉토리에서 초경량(41MB) 패키지를 즉시 배포합니다:

\`\`\`powershell
# 1. 파일 동기화
cd E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1
node -e "
const fs = require('fs');
const path = require('path');
const base = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
['demo-fashion.html', 'demo-cosmetic.html', 'demo-furniture.html', 'demo-matterport.html', 'index.html'].forEach(f => {
  fs.writeFileSync(path.join(base, '_railway_deploy/client', f), fs.readFileSync(path.join(base, 'app_build/client', f)));
});
fs.writeFileSync(path.join(base, '_railway_deploy/server/index.js'), fs.readFileSync(path.join(base, 'app_build/server/index.js')));
"

# 2. Railway rootDirectory 해제 및 배포
cd E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1\\_railway_deploy
$cfg = Get-Content \"$env:USERPROFILE\\.railway\\config.json\" -Raw | ConvertFrom-Json
$token = $cfg.user.accessToken
$headers = @{ \"Authorization\" = \"Bearer $token\"; \"Content-Type\" = \"application/json\" }
$body = '{\"query\":\"mutation { serviceInstanceUpdate(environmentId: \\\"1241ff56-1c40-48a3-8831-eb4b1f913f13\\\", serviceId: \\\"8e807076-c4bf-4f0a-8bdc-e56d9ecb2016\\\", input: { rootDirectory: \\\"\\\" }) }\"}'
Invoke-RestMethod -Uri \"https://backboard.railway.com/graphql/v2\" -Method POST -Headers $headers -Body $body -ContentType \"application/json\" | Out-Null
railway up --service v-show-commercial-v1 --detach
\`\`\`

---

## 7. 화면 검증 (Puppeteer Automated Capture)

배포 후 렌더링 상태를 아래 스크립트로 즉시 캡처하여 검증할 수 있습니다:
\`\`\`powershell
cd E:\\vivpr\\ai\\v-show\\virtual-tradeshow-commercial-v1
node scripts\\capture_fast_final.js
\`\`\`
`;

fs.writeFileSync(path.join(baseDir, 'HANDOVER_MANUAL.md'), manualContent, 'utf8');
fs.writeFileSync(path.join(baseDir, 'RESTORE_POINT_GUIDE_v9_0.md'), manualContent, 'utf8');
console.log('✅ Created HANDOVER_MANUAL.md and RESTORE_POINT_GUIDE_v9_0.md');
