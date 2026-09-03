# 🛡️ ³D₂ Virtual Tradeshow — 리스토어 포인트 가이드 (v12.0)

> **리스토어 포인트 명칭:** `v12.0-master-restore-point` (Phase 3.23 Complete Baseline)  
> **보조 태그:** `restore-point-phase-3.23-complete`  
> **생성일자:** 2026-09-03  
> **라이브 프로덕션 URL:** [https://v-show-commercial-v1-production.up.railway.app/](https://v-show-commercial-v1-production.up.railway.app/)  
> **기준 검증 프로젝트:** `?projectId=prj-free-f4370ccd`  
> **프로덕션 Railway 배포 ID:** `6d41adcb-074b-4060-a013-0a3100a0937a` (`SUCCESS`)  
> **백업 압축 파일:** `V_SHOW_RESTORE_POINT_v12_0_COMPLETE.zip` (저장소 루트 위치)

---

## 1. 리스토어 포인트의 기술적 상태 보증 (Certified Technical State)

이 시점의 소스코드는 다음 모든 기능이 100% 정상 작동하며 프로덕션 환경에서 실측 검증되었습니다:

1. **아이레벨 수평 시야각 캘리브레이션**:
   - `photoSphere.rotation.y = -Math.PI / 2`
   - `camera.position = (0, 0, 0.01)`
   - `controls.target = (0, 0, 0)`
   - 초기 진입 시 천장이 아닌 부스 정면 안내 데스크 및 ArcBest 로고가 화면 정중앙에 수평으로 배치됨.
2. **9종 방향성 내비게이션 프리셋**:
   - `NORMAL`, `WIDE`, `LEFT VIEW`, `CENTER`, `RIGHT VIEW`, `LOOK UP`, `LOOK DOWN`, `CLOSE VIEW`, `RESET`
   - 부드러운 스페리컬 트윈 애니메이션 및 활성 버튼 하이라이트.
3. **자동 행인 제거 토글 (Automatic People Removal)**:
   - AI Enhance 모달 내 반응형 스위치 및 `✓ ON` / `OFF` 배지.
   - `window.autoRemovePeople` 상태 연동 및 API 페이로드 파라미터 전달.
4. **점진적 텍스처 폴백 로더 (Multi-Tier Progressive Texture Loader)**:
   - `16k -> 8k -> 4k -> 2k -> 데모 파노라마` 단계적 자동 폴백으로 블랙스크린 원천 차단.
5. **세션 지속성**:
   - 새로고침, 로그아웃, OTP 재로그인(`goodkie.com@gmail.com` / `123456`), 시크릿 브라우저 접속 시에도 동일한 16K 배경 및 앵글 유지.

---

## 2. Git 태그를 이용한 원클릭 복구 (Git Tag Restore)

코드베이스를 본 안정 상태로 즉시 롤백하려면 아래 명령을 실행합니다:

```powershell
# 1. 저장소 루트 이동
cd E:\vivpr\ai\v-show

# 2. 로컬 변경사항 정리 및 태그 체크아웃
git stash
git checkout v12.0-master-restore-point

# 3. 신규 작업 브랜치 생성하여 개발 재개 (권장)
git checkout -b restore-v12.0-continuation
```

---

## 3. 압축 아카이브를 이용한 독립 복구 (Zip Archive Restore)

Git 저장소가 손상되었거나 완전히 새로운 서버/환경에서 복원할 경우:

1. 루트 디렉토리의 `V_SHOW_RESTORE_POINT_v12_0_COMPLETE.zip` 파일을 원하는 디렉토리에 압축 해제합니다.
2. PowerShell에서 압축 해제:
   ```powershell
   Expand-Archive -Path "V_SHOW_RESTORE_POINT_v12_0_COMPLETE.zip" -DestinationPath "E:\vivpr\ai\v-show-restored"
   cd "E:\vivpr\ai\v-show-restored"
   ```
3. 의존성 설치 및 서버 시작:
   ```powershell
   npm install
   cd virtual-tradeshow-commercial-v1\app_build
   npm install
   npm start
   ```
4. 브라우저에서 `http://localhost:8080/?projectId=prj-free-f4370ccd` 접속하여 확인.

---

## 4. 복구 후 정상 작동 검증 체크리스트

복구 후 다음 항목을 점검하십시오:
- [ ] 브라우저 로딩 시 부스 정면이 눈높이 수평으로 보이는가 (`02_NEW_EYE_LEVEL_NORMAL.png` 형태)?
- [ ] 하단 내비게이션 바의 `WIDE`, `LEFT VIEW`, `LOOK UP` 등 버튼 클릭 시 카메라가 부드럽게 회전하는가?
- [ ] AI Enhance 모달에서 'Automatic People Removal' 스위치가 정상 토글(`✓ ON` / `OFF`)되는가?
- [ ] 콘솔창에 Three.js 텍스처 에러나 404가 발생하지 않는가?
