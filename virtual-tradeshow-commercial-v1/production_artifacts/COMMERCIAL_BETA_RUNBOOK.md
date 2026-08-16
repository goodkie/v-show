# COMMERCIAL BETA RUNBOOK — Virtual Trade Show SaaS (Phase 8)

## 1. 개요 (Overview)
본 문서는 Virtual Trade Show Commercial V1의 주최사(Organizer) 및 시스템 운영자를 위한 상용 베타 운영 런북입니다. 멀티테넌트 환경에서 행사 개설, 참가사 온보딩, GPU 3D 재구성 승인 및 데이터 관리를 안내합니다.

---

## 2. 운영자 계정 및 접속 주소 (Access Points & Credentials)
- **Public Event Lobby (공개 행사 로비)**: `https://v-show-commercial-v1-production.up.railway.app/lobby.html` (또는 `http://localhost:3000/lobby.html`)
- **Organizer Admin Console (주최사 콘솔)**: `/organizer.html`
  - 계정: `organizer@vshow.com`
  - 초기 비밀번호: `admin123`
- **Exhibitor Admin Console (참가사 콘솔)**: `/admin.html`
  - 계정: `apex@vshow.com` / `bio@vshow.com`
  - 초기 비밀번호: `admin123`

---

## 3. 행사 개설 및 참가사 온보딩 워크플로우 (Event & Exhibitor Onboarding)
1. **행사 생성 (Create Event)**:
   - Organizer 콘솔 접속 -> 신규 행사명, 슬러그(slug), 행사 일정(시작일/종료일), 배너 이미지 설정.
2. **참가사 초대 및 등록 (Add Exhibitors)**:
   - Organizer 콘솔 -> '참가사 등록' 버튼 -> 기업명, 산업 카테고리, 부스 번호(예: A-101) 지정.
   - 시스템이 신규 참가사 조직(`org-exhibitor-...`) 및 관리자 계정을 생성.

---

## 4. 3D 가우시안 재구성 승인제 (Reconstruction Approval Workflow)
의도치 않은 클라우드 GPU 비용 발생을 완벽하게 방지하기 위해 2단계 승인 프로세스를 적용합니다:
1. **참가사 사진 업로드 & 요청**: 참가사가 50~100장의 부스 사진을 업로드하고 재구성을 요청하면 `awaiting_approval` 상태가 됨.
2. **주최사 검토 및 승인**: Organizer 콘솔의 '3D 가우시안 재구성 작업 승인' 테이블에서 사진 수 및 프리셋을 확인 후 `승인 및 GPU 큐잉` 버튼 클릭.
3. **GPU 워커 처리**: 승인된 작업(`status: pending, approvalStatus: approved`)만 Modal L4 GPU 워커가 클레임하여 연산 실행.

---

## 5. 테넌트 데이터 격리 및 보안 정책 (Tenant Isolation Policy)
- **RBAC 원칙**: `organizer_admin`은 전체 행사/참가사 모니터링이 가능하며, `exhibitor_admin`은 오직 자사 부스, 제품, 리드, RFQ만 조회/수정 가능.
- **Cross-Tenant 차단**: 타사 자원 ID로 API 호출 시 서버에서 즉시 `403 Forbidden`을 반환합니다.

---

## 6. 장애 대응 및 백업 (Troubleshooting & Backup)
- **데이터 백업**: Railway Volume `/data/db.json` 파일이 런타임 상태를 유지합니다. 주요 업데이트 전 `/data/db.json` 백업 복사본을 유지합니다.
- **Photo Preview Fallback**: 3D 가우시안 자산 로드 실패 시 자동으로 Three.js 기본 포토 부스로 전환되어 바이어의 명함 교환 및 상담이 중단 없이 진행됩니다.
