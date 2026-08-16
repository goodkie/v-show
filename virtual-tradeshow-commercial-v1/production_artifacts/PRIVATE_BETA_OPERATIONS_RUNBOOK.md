# PRIVATE BETA OPERATIONS RUNBOOK — Virtual Trade Show (Phase 9)

## 1. 운영 목적 및 범위 (Purpose & Scope)
본 문서는 프라이빗 베타(3~5개 참가사, 1개 주최사)를 성공적이고 안정적으로 운영하기 위한 표준 운영 절차서(SOP)입니다.

---

## 2. 참가사 온보딩 7단계 절차 (7-Step Exhibitor Onboarding SOP)

```
[1. 주최사 계정 발급] ──> [2. 참가사 최초 로그인] ──> [3. 12자 암호 변경] ──> [4. 50-100장 사진 업로드]
                                                                                   │
[7. 부스 공개 & 운영] <── [6. 3D 핫스팟/제품 연동] <── [5. 주최사 GPU 승인 & 연산] <──┘
```

1. **주최사 콘솔 접속**: `/organizer.html` 로그인 (`organizer@vshow.com`).
2. **참가사 등록 & 자격 증명 발급**:
   - `+ 신규 참가사 등록` 클릭 -> 기업명, 이메일, 카테고리 입력 -> 시스템이 **16자 보안 난수 임시 비밀번호** 생성 및 조직/부스 자동 생성.
   - 발급된 이메일과 임시 비밀번호를 참가사 담당자에게 전달.
3. **참가사 첫 로그인 & 비밀번호 변경**:
   - 참가사가 `/admin.html`에서 전달받은 임시 비밀번호로 로그인.
   - 강제 비밀번호 변경 모달에서 **12자 이상(대문자, 소문자, 숫자 포함)**의 새 비밀번호로 설정.
4. **부스 사진 업로드 (50~100장)**:
   - `부스 사진 & 3D 재구성` 탭에서 60~80% 중첩률을 갖는 고화질 사진 업로드 -> 품질 점수(`Capture QA`) 확인 후 `3D 재구성 요청` 클릭 (`awaiting_approval` 전환).
5. **주최사 GPU 승인 (Cost Guard)**:
   - 주최사 콘솔에서 요청 내역 확인 후 `승인 및 GPU 큐잉` 클릭 -> Modal L4 GPU 워커가 고품질 Splatfacto 연산 수행 -> 약 6~8MB SPZ 모델 자동 배포.
6. **3D 정렬 & 핫스팟 배치**:
   - 참가사 콘솔에서 3D 뷰어 정렬 검증 및 제품 핫스팟 핀을 바닥/전시대에 배치.
7. **부스 공개 발행 (Publish)**:
   - 상단 `[부스 공개 발행하기]` 클릭 -> `/lobby.html` 공개 로비에 즉시 전시 시작.

---

## 3. 일일 운영 점검 항목 (Daily Operations Checklist)
- [ ] `/health` 상태 확인 (HTTP 200, schemaVersion: 4)
- [ ] `/api/organizer/telemetry` 조회하여 신규 리드/RFQ 수 및 바이어 방문자 수 모니터링
- [ ] 미승인된 3D 재구성 요청(`awaiting_approval`) 여부 확인 및 승인
- [ ] 인시던트 로그(`GET /api/organizer/telemetry` 내 `incidents`) 에러 발생 여부 확인

---

## 4. 백업 및 롤백 절차 (Backup & Rollback SOP)
- **정기 백업**: 매일 종료 시 또는 대규모 업데이트 전 Railway Volume의 `db.json`을 타임스탬프 파일로 복사.
- **복원 (Restore)**: 이상 발생 시 직전 정상 백업 파일(`db.backup.phase9.*.json`)을 `db.json`으로 교체 후 서버 재시작.
