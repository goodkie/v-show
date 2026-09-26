# 🚀 v-show & Antigravity 멀티 PC Google Drive 동기화 및 완전 복원 사용설명서

본 문서는 현재 PC(PC 1)에서 진행된 **Antigravity AI 어시스턴트와의 3대 핵심 대화 세션(전체 대화 이력, 아티팩트, 생성 파일, IDE 탭 레이아웃)** 및 **v-show 프로젝트 코드베이스 전체(Git 원본 + Fast-Track Worktree)**를 새 PC(PC 2)로 100% 손실 없이 이전하고, **Google Drive 데스크톱**을 통해 여러 대의 컴퓨터에서 원활하게 동기화하며 개발할 수 있도록 설계된 통합 가이드입니다.

---

## 📌 목차
1. [동기화 아키텍처 및 원리](#1-동기화-아키텍처-및-원리)
2. [패키지 디렉터리 구성](#2-패키지-디렉터리-구성)
3. [새 PC (PC 2) 최초 1회 원클릭 설치 방법](#3-새-pc-pc-2-최초-1회-원클릭-설치-방법)
4. [일상 개발 시 멀티 PC 2-Way 동기화 방법 (Push / Pull)](#4-일상-개발-시-멀티-pc-2-way-동기화-방법-push--pull)
5. [환경 무결성 검증 (Verification)](#5-환경-무결성-검증-verification)
6. [자주 묻는 질문 (FAQ) 및 문제 해결](#6-자주-묻는-질문-faq-및-문제-해결)

---

## 1. 동기화 아키텍처 및 원리

### 1) Antigravity 3대 핵심 대화 세션의 영속성
Antigravity는 다음 경로에 세션 정보를 분산 저장합니다:
- **대화 데이터베이스**: `%USERPROFILE%\.gemini\antigravity\conversations\<convo-id>.db` (+ wal, shm)
- **두뇌(Brain) 로그 & 아티팩트**: `%USERPROFILE%\.gemini\antigravity\brain\<convo-id>\` (생성된 코드 아티팩트, 스크린샷, 전체 JSONL 대화 로그)
- **대화 요약 및 인덱스**: `%USERPROFILE%\.gemini\antigravity\conversation_summaries.db`, `antigravity_state.pbtxt`
- **IDE 탭 레이아웃 상태**: `%APPDATA%\Antigravity\app_storage.json`

> **본 패키지에 포함된 3대 핵심 대화 ID**:
> 1. `6cb2d68e-c042-42a8-aee2-b8a40fa9f737`: 기본 v-show 개발 및 C01~C09 대화
> 2. `a60a4785-daac-4045-b047-9b489e649678`: Stage 1 / C11.16 / 3DZ 아키텍처 대화
> 3. `d83397bc-3323-46b8-a23f-951c5d5d9f30`: 현재 세션 (Stage 2 Fast-Track, Issue #4 검증 및 12-Point 캡처 개발)

### 2) Google Drive 동기화 최적화 (스마트 필터링)
Google Drive 데스크톱 동기화 시 수만 개의 임시 파일이 포함된 `node_modules`와 25GB에 달하는 과거 아카이브 백업 덤프(`archive_staging`, `sample3`, `sample4`)를 그대로 올리면 업로드 지연 및 파일 잠금(`EBUSY`) 오류가 발생합니다.
- 본 동기화 시스템은 **핵심 소스 코드, 전체 Git 커밋 히스토리(.git), 설정, 테스트 파일, 활성 워크트리**만을 엄선하여 패키징하므로 용량을 획기적으로 줄이고(약 15~18GB), 클라우드 동기화 속도를 극대화합니다.
- `node_modules`는 새 PC에서 스크립트가 자동으로 `npm install`하여 재생성합니다.

### 3) Git Worktree 자동 복구 메커니즘
`v-show` 메인 리포지토리와 `v-show-stage2-fast-track` 워크트리는 절대 경로로 상호 참조됩니다. 새 PC에서 드라이브 문자(C:, D:, E: 등)가 바뀌더라도 복원 스크립트가 `.git` 포인터를 자동으로 계산하여 `git worktree repair`를 수행하므로 깨짐 없이 즉시 개발을 이어갈 수 있습니다.

---

## 2. 패키지 디렉터리 구성

Google Drive 내 `v-show-antigravity-sync` 디렉터리는 다음과 같이 구성됩니다:

```text
G:\내 드라이브\v-show-antigravity-sync\
│
├── antigravity-core\                # Antigravity AI 어시스턴트 복원 코어
│   ├── conversations\               # 3개 대화창 SQLite DB (6cb2d68e, a60a4785, d83397bc)
│   ├── brain\                       # 3개 세션의 모든 Artifact, 스크린샷, Transcript 로그
│   ├── state\                       # 최근 대화 목록 및 요약 메타데이터 DB
│   └── config\                      # Antigravity IDE 열린 탭 레이아웃 (app_storage.json)
│
├── project-code\                    # 프로젝트 소스 코드
│   ├── v-show\                      # 메인 Git 저장소 (전체 Git 히스토리 포함)
│   └── v-show-stage2-fast-track\    # Stage 2 12-Point Fast-Track 활성 워크트리
│
├── scripts\                         # 자동화 PowerShell 스크립트 모음
│   ├── 00_PACKAGE_EXPORT_PC1.ps1    # [PC 1] Google Drive로 전체 패키지 내보내기/업데이트
│   ├── 01_SETUP_RESTORE_NEW_PC.ps1  # [PC 2] 새 PC 원클릭 전체 복원 마법사
│   ├── 02_SYNC_PUSH_TO_GDRIVE.ps1   # 작업 종료 시 클라우드로 업로드
│   ├── 03_SYNC_PULL_FROM_GDRIVE.ps1 # 작업 시작 시 클라우드에서 최신 다운로드
│   └── 04_VERIFY_INSTALLATION.ps1   # 6대 무결성 자동 진단 테스트
│
└── README_사용설명서.md              # 본 설명서
```

---

## 3. 새 PC (PC 2) 최초 1회 원클릭 설치 방법

새 PC에 프로젝트와 Antigravity를 처음 세팅할 때의 절차입니다.

### [사전 준비]
1. **Google Drive 데스크톱 설치 및 로그인**:
   - `G:\내 드라이브` (또는 사용자 환경 드라이브)에 `v-show-antigravity-sync` 폴더가 동기화 완료될 때까지 잠시 대기합니다.
2. **필수 런타임 설치**:
   - **Git**: [https://git-scm.com/](https://git-scm.com/) 설치 (기본 설정 권장)
   - **Node.js**: [https://nodejs.org/](https://nodejs.org/) v20 이상 LTS 설치
   - **Antigravity IDE**: 설치 완료 후, **아직 실행하지 마세요** (실행 중이라면 완전히 종료).

### [원클릭 복원 실행]
1. 새 PC에서 **PowerShell**을 관리자 권한으로 실행합니다.
2. Google Drive 내의 설치 스크립트를 직접 실행합니다:

```powershell
powershell -ExecutionPolicy Bypass -File "G:\내 드라이브\v-show-antigravity-sync\scripts\01_SETUP_RESTORE_NEW_PC.ps1"
```
*(만약 Google Drive 문자가 G:가 아니라면 해당 드라이브 경로로 지정하세요)*

3. **스크립트 안내에 따라 진행**:
   - 로컬 설치 경로 확인 (기본값: `E:\vivpr\ai`, `D:\vivpr\ai`, 또는 `C:\vivpr\ai` 자동 감지, Enter 누르면 기본값 적용)
   - Antigravity 대화 DB, Brain(아티팩트 포함), IDE 레이아웃 자동 복원
   - 프로젝트 메인 리포 및 워크트리 복사
   - Git Worktree 포인터 자동 재연결 (`git worktree repair`)
   - `npm install` 자동 실행
4. 설치가 완료되면 Antigravity IDE를 실행합니다.
   - **결과**: 상단 탭에 이전 대화창 3개(`v-show`, `Stage 1`, `Stage 2 Fast-Track`)가 그대로 복원되어 열리며, 모든 아티팩트와 대화 내역이 100% 온전하게 표시됩니다!

---

## 4. 일상 개발 시 멀티 PC 2-Way 동기화 방법 (Push / Pull)

PC 1과 PC 2를 번갈아가며 작업할 때는 아래의 2단계 규칙만 기억하시면 충돌 없이 안전합니다.

### 💼 [규칙 1] 오늘 PC에서 작업이 끝났을 때 (Push)
퇴근하거나 다른 PC로 옮기기 전, 터미널에서 다음 명령을 실행합니다:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\vivpr\ai\v-show-stage2-fast-track\sync_scripts\02_SYNC_PUSH_TO_GDRIVE.ps1"
```
- 당일 나눈 AI와의 대화 내용, 새로 생성된 아티팩트, 수정한 소스 코드가 Google Drive로 업로드됩니다.

---

### 💻 [규칙 2] 다른 PC로 이동해서 작업을 시작할 때 (Pull)
Antigravity IDE를 열기 전, 최신 변경사항을 로컬로 가져옵니다:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\vivpr\ai\v-show-stage2-fast-track\sync_scripts\03_SYNC_PULL_FROM_GDRIVE.ps1"
```
- Antigravity가 켜져 있으면 스크립트가 종료 여부를 묻고 안전하게 종료 후 동기화합니다.
- 동기화 완료 메시지가 뜨면 Antigravity IDE를 열고 이전 PC에서 마친 지점부터 즉시 이어서 작업합니다.

---

## 5. 환경 무결성 검증 (Verification)

새 PC에 복원했거나 동기화 후 상태를 점검하고 싶을 때는 검증 스크립트를 실행합니다:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\vivpr\ai\v-show-stage2-fast-track\sync_scripts\04_VERIFY_INSTALLATION.ps1"
```

### 진단 항목 (6대 검사)
1. **Antigravity DB 무결성**: 3개 대화 DB (`6cb2d68e`, `a60a4785`, `d83397bc`) 존재 및 크기 확인
2. **Antigravity Brain 로그**: 각 대화 세션의 `transcript.jsonl` 및 아티팩트 보존 상태
3. **IDE 레이아웃 설정**: `app_storage.json`의 대화창 세션 매핑 상태
4. **Git Worktree 연결**: `git worktree list` 정상 출력 및 연동 상태
5. **Node.js 런타임**: Node 실행 환경 및 버전 점검
6. **Stage 2 12-Point 핵심 빌드**: 프로덕션 서버 엔트리 및 테스트 아티팩트 존재 여부

> **6개 항목 모두 초록색 `✓` (6/6 통과)로 표시되면 개발 준비가 100% 완료된 상태입니다.**

---

## 6. 자주 묻는 질문 (FAQ) 및 문제 해결

### Q1. Google Drive Desktop의 드라이브 문자가 `G:`가 아닙니다.
- 스크립트 실행 시 `-GDriveRoot` 파라미터로 드라이브 경로를 직접 지정할 수 있습니다:
  ```powershell
  & ".\01_SETUP_RESTORE_NEW_PC.ps1" -GDriveRoot "F:\내 드라이브"
  ```

### Q2. 새 PC에서 Antigravity를 켰는데 이전 대화창이 보이지 않습니다.
- Antigravity가 켜진 상태에서 DB 파일을 복사하면 SQLite 캐시 때문에 읽어오지 못할 수 있습니다.
- Antigravity를 완전히 종료한 후 `01_SETUP_RESTORE_NEW_PC.ps1` 또는 `03_SYNC_PULL_FROM_GDRIVE.ps1`을 다시 실행하고 Antigravity를 재실행하세요.

### Q3. 새 PC의 드라이브가 C: 뿐이라 E: 드라이브가 없습니다.
- `01_SETUP_RESTORE_NEW_PC.ps1` 스크립트가 실행될 때 드라이브를 감지하여 기본값으로 `C:\vivpr\ai`를 제시하거나 원하는 경로를 입력받습니다.
- 스크립트가 Git Worktree 내부 참조 경로(`.git` 및 `gitdir`)를 새 경로에 맞춰 자동으로 다시 작성하므로 전혀 문제 없습니다.

### Q4. 동기화 도중 "다른 프로세스가 파일을 사용 중" 오류가 납니다.
- Google Drive 데스크톱이 방금 변경된 대용량 파일을 백그라운드에서 클라우드로 전송 중일 때 일시적으로 발생할 수 있습니다.
- 10~20초 후 다시 실행하시거나, 작업 중인 터미널/IDE를 종료하고 실행하시면 정상 처리됩니다.

---
**제작 및 보증**: Antigravity AI Assistant & Google DeepMind Pair Programming System
**대상 프로젝트**: v-show & Stage 2 Fast-Track (Issue #4 Passed)
