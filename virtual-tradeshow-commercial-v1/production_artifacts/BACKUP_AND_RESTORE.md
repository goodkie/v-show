# BACKUP AND RESTORE STRATEGY
**Virtual Trade Show Commercial V1 — Disaster Recovery Runbook**

---

## 1. 개요 (Overview)
- **대상 데이터**: `data/db.json` (스키마 v5 런타임 데이터베이스) 및 `data/uploads/` (부스 사진, 모델 파일 메타데이터).
- **원칙**: 제3자 유료 SaaS 도입 없이 노드 런타임 자체 스크립트 기반의 무과금($0.00) 로컬/볼륨 백업을 제공합니다.

---

## 2. 자동화 백업 도구 (`scripts/backup_runtime_data.js`)
- **실행 명령**:
  ```bash
  node scripts/backup_runtime_data.js
  ```
- **출력물**:
  - `data/backups/db_backup_<timestamp>_v5.json`: 원본 데이터베이스 스냅샷
  - `data/backups/meta_<timestamp>.json`: 스키마 버전, 조직 수, 제품 수, 리드 수, 파일 크기 메타데이터
- **보안 원칙**: 결제 카드 번호(PAN) 및 비밀 키는 데이터베이스에 저장되지 않으므로 백업 파일에도 유출되지 않습니다.

---

## 3. 복구 및 무결성 드릴 도구 (`scripts/restore_drill.js`)
- **실행 명령**:
  ```bash
  node scripts/restore_drill.js
  ```
- **수행 절차**:
  1. 최신 런타임 스냅샷 자동 생성
  2. 격리된 샌드박스 폴더(`data/_restore_drill_sandbox/`)로 복사
  3. 샌드박스 내 데이터 손상 시뮬레이션
  4. 백업 파일로부터 복원 수행
  5. 스키마 버전, 테넌트 조직 수, 제품 목록, 사용자 목록 100% 일치 무결성 검증
  6. 임시 샌드박스 자동 정리

---

## 4. 운영 백업 일정 권고
- **정기 백업**: 매일 1회 (자정 자동 백업 cron 또는 Railway CLI 연동)
- **배포 전 백업**: 새로운 스키마 마이그레이션 또는 주요 패치 배포 전 필수 실행
