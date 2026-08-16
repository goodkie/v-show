# BETA INCIDENT RESPONSE RUNBOOK — Virtual Trade Show (Phase 9)

## 1. 인시던트 분류 및 심각도 기준 (Incident Classification & Severity)

| 심각도 (Severity) | 정의 (Definition) | 대응 목표 시간 (SLA) | 즉시 중단 여부 (Halt Beta?) |
| :--- | :--- | :---: | :---: |
| **CRITICAL** | 테넌트 데이터 유출, 자격 증명 유출, 런타임 DB 손상, 무단 GPU 과금 | **즉시 (15분 이내)** | **YES (즉시 베타 중단)** |
| **HIGH** | 3D 렌더러 전면 장애, 로그인 불가, 리드 저장 실패 | **1시간 이내** | NO (Photo Fallback 활용) |
| **MEDIUM** | 특정 브라우저 UI 깨짐, 쇼호스트 웹소켓 끊김 | **4시간 이내** | NO |
| **LOW** | 경미한 스타일 오차, 텍스트 오타 | **24시간 이내** | NO |

---

## 2. 긴급 상황별 대응 시나리오 (Incident Playbooks)

### 2.1 Cross-Tenant 데이터 접근 의심 시 (Tenant Leakage)
1. **즉시 조치**: 서버 재시작 및 세션 전체 만료 처리 (`activeSessions.clear()`).
2. **원인 분석**: 해당 API 라우트의 `requireAuth` 및 `booth.organizationId === req.user.organizationId` 검증 로직 점검.
3. **기록**: `logIncident({ category: 'TENANT', severity: 'CRITICAL', message: '...' })` 기록.

### 2.2 3D 가우시안 스플랫 로드 실패 시 (3D Viewer Load Error)
1. **자동 보호**: 클라이언트 뷰어가 404, 손상 파일, WebGL2 미지원 감지 시 즉시 **Photo Preview Fallback**으로 자동 전환.
2. **확인 사항**: 업로드된 SPZ/PLY 파일이 `/uploads/models/`에 존재하는지 확인.

### 2.3 GPU 연산 크레딧 경고 시 (GPU Budget Alert)
1. **원칙**: Modal L4 Starter 무료 크레딧 한도(Free Quota)에 도달할 경우 즉시 신규 작업 승인을 중단하고 사용자에게 **`GPU BUDGET APPROVAL REQUIRED`**를 보고함.
2. 추가 현금 과금이 절대 발생하지 않도록 유지.
