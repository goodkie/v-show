const fs = require('fs');
const path = require('path');

const batchTemplates = {
  '[00_동기화_진단_복구_대시보드_실행].cmd': `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title AGY-Sync Master Dashboard

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\\server.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\\tools\\agy-sync-master\\server.js" (
    set "WORK_DIR=%BASE_DIR%\\tools\\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master server.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js LTS 버전을 설치한 후 다시 실행해주세요.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"
echo ================================================================
echo   [AGY-Sync Master] Universal Multi-PC Sync & Recovery Manager
echo   웹 기반 실시간 모니터링 및 진단/복구 대시보드
echo ================================================================
echo.
echo [1/2] 웹 대시보드 서버를 백그라운드에서 구동합니다...
start /b "" node server.js

timeout /t 2 >nul 2>&1
echo [2/2] 기본 웹 브라우저에서 대시보드를 엽니다 (http://localhost:3900)...
start http://localhost:3900

echo.
echo ================================================================
echo   대시보드가 브라우저에서 실행 중입니다.
echo   - 로컬 접속:   http://localhost:3900
echo ================================================================
popd
echo 창을 닫으려면 아무 키나 누르세요.
pause >nul
exit /b 0
`,

  '[01_새PC_자동설치_환경매핑_1클릭].cmd': `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 새 PC 무결점 원클릭 설치 및 환경 매핑

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\\cli.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\\tools\\agy-sync-master\\cli.js" (
    set "WORK_DIR=%BASE_DIR%\\tools\\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master cli.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js LTS 버전을 설치한 후 다시 실행해주세요.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 새 PC 원클릭 설치 및 환경 자동 매핑
echo ================================================================
echo.
echo [1] GitHub에서 직접 온전한 Git 저장소(v-show) 클론
echo [2] Fast-Track 워크트리 자동 생성
echo [3] Google Drive에서 대화 히스토리 및 세션 DB 안전 복원
echo [4] 현재 PC 사용자명 및 경로에 맞춰 설정 동적 리매핑
echo.

node cli.js setup

popd

echo.
echo ================================================================
echo 작업이 완료되었습니다. 창을 닫으려면 아무 키나 누르세요...
pause >nul
exit /b 0
`,

  '[02_작업완료_동기화_PUSH_1클릭].cmd': `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 작업 완료 동기화 (PUSH)

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\\cli.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\\tools\\agy-sync-master\\cli.js" (
    set "WORK_DIR=%BASE_DIR%\\tools\\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master cli.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 작업 완료 동기화 (PUSH)
echo ================================================================
echo.
echo [1] 최신 커밋을 GitHub 원격 저장소로 안전 푸시
echo [2] Antigravity 대화 DB 및 브레인 아티팩트를 Google Drive에 백업
echo.

node cli.js push

popd

echo.
echo ================================================================
echo 동기화 완료! 창을 닫으려면 아무 키나 누르세요 (5초 후 자동 종료)...
timeout /t 5 >nul 2>&1 || pause >nul
exit /b 0
`,

  '[03_작업시작_동기화_PULL_1클릭].cmd': `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 작업 시작 최신화 (PULL)

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\\cli.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\\tools\\agy-sync-master\\cli.js" (
    set "WORK_DIR=%BASE_DIR%\\tools\\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master cli.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 작업 시작 최신화 (PULL)
echo ================================================================
echo.
echo [1] GitHub에서 최신 소스코드 및 커밋 내역 Pull
echo [2] Google Drive에서 최신 Antigravity 세션/브레인 동기화
echo [3] 현재 PC 환경에 맞게 경로 및 세션 DB 자동 리매핑
echo.

node cli.js pull

popd

echo.
echo ================================================================
echo 최신화 완료! 창을 닫으려면 아무 키나 누르세요 (5초 후 자동 종료)...
timeout /t 5 >nul 2>&1 || pause >nul
exit /b 0
`,

  '[04_저장소_정밀진단_자동복구_1클릭].cmd': `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 저장소 정밀 진단 및 자동 복구

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\\cli.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\\tools\\agy-sync-master\\cli.js" (
    set "WORK_DIR=%BASE_DIR%\\tools\\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master cli.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 저장소 정밀 진단 및 자동 복구
echo ================================================================
echo.
echo [1] Git 팩파일 및 헤드 무결성 진단
echo [2] 손상된 0바이트 팩파일 격리 및 GitHub에서 온전한 베이스 재수신
echo [3] Antigravity 대화창 세션 및 경로 리매핑 복구
echo.

node cli.js recover

popd

echo.
echo ================================================================
echo 복구 및 진단 작업이 완료되었습니다. 창을 닫으려면 아무 키나 누르세요...
pause >nul
exit /b 0
`,

  '[05_환경경로_재매핑_1클릭].cmd': `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 환경 경로 및 사용자 계정 재매핑

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\\cli.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\\tools\\agy-sync-master\\cli.js" (
    set "WORK_DIR=%BASE_DIR%\\tools\\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master cli.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 환경 경로 및 사용자 계정 재매핑
echo ================================================================
echo.
echo [1] app_storage.json 내 타 PC 사용자명/경로를 현재 PC로 치환
echo [2] conversation_summaries.db SQLite URI 업데이트
echo [3] Git Worktree 양방향 포인터 재설정
echo.

node cli.js remap

popd

echo.
echo ================================================================
echo 경로 재매핑 완료! 창을 닫으려면 아무 키나 누르세요 (5초 후 자동 종료)...
timeout /t 5 >nul 2>&1 || pause >nul
exit /b 0
`,

  '[06_실시간_자동동기화_데몬_실행].cmd': `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title [AGY-Sync] 실시간 자동 동기화 데몬 (Auto-Sync Daemon)

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "WORK_DIR="
if exist "%BASE_DIR%\\cli.js" (
    set "WORK_DIR=%BASE_DIR%"
) else if exist "%BASE_DIR%\\tools\\agy-sync-master\\cli.js" (
    set "WORK_DIR=%BASE_DIR%\\tools\\agy-sync-master"
)

if not defined WORK_DIR (
    echo [ERROR] agy-sync-master cli.js 를 찾을 수 없습니다.
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

pushd "%WORK_DIR%"

echo ================================================================
echo   [AGY-Sync Master] 실시간 자동 동기화 데몬 (Auto-Sync Daemon)
echo ================================================================
echo.
echo  * 기능 1: 다른 PC의 새 커밋/세션 푸시 감지 시 -^> 자동 Pull
echo  * 기능 2: 현재 PC의 Antigravity 대화/커밋 변경 시 -^> 자동 Push
echo  * 감지 주기: 30초 (백그라운드 실시간 모니터링)
echo.
echo 데몬을 중지하려면 창을 닫거나 Ctrl+C를 누르세요.
echo ================================================================
echo.

node cli.js auto-sync --interval 30

popd
pause
exit /b 0
`
};

// Target directories
const targetDirs = [
  'c:/Users/server4/ai/v-show-stage2-fast-track',
  'c:/Users/server4/ai/v-show-stage2-fast-track/tools/agy-sync-master',
  'G:/내 드라이브/v-show-antigravity-sync',
  'G:/내 드라이브/v-show-antigravity-sync/tools/agy-sync-master'
];

for (const [filename, content] of Object.entries(batchTemplates)) {
  // Ensure CRLF line endings
  const crlfContent = content.replace(/\r?\n/g, '\r\n');
  for (const tDir of targetDirs) {
    if (fs.existsSync(tDir)) {
      const fullPath = path.join(tDir, filename);
      fs.writeFileSync(fullPath, crlfContent, { encoding: 'utf8' });
      console.log(`[WROTE CRLF] ${fullPath}`);
    }
  }
}
console.log('ALL batch scripts generated with strict CRLF line endings!');
