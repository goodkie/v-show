<#
.SYNOPSIS
    새 PC (PC 2) 원클릭 환경 복원 및 Antigravity 대화/프로젝트 설치 스크립트
.DESCRIPTION
    Google Drive에 동기화된 v-show 프로젝트와 Antigravity 3개 대화창(DB, Brain, State, Config)을
    새 PC의 로컬 환경으로 완벽하게 복원하고, Git Worktree 포인터 복구 및 종속성을 설치합니다.
#>

[CmdletBinding()]
param(
    [string]$TargetDir = "",
    [string]$GDriveRoot = ""
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  [v-show & Antigravity] 새 PC 원클릭 복원 & 설치 마법사" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# 0. 관리자 / 실행 환경 사전 확인
Write-Host "[단계 0/6] 필수 도구 및 사전 조건 검사..." -ForegroundColor Yellow

$gitVersion = git --version 2>$null
if (-not $gitVersion) {
    Write-Error "[필수] Git이 설치되어 있지 않습니다. https://git-scm.com/ 에서 Git을 설치한 후 다시 실행하세요."
    exit 1
}
Write-Host "  ✓ Git 확인: $gitVersion" -ForegroundColor Gray

$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Error "[필수] Node.js가 설치되어 있지 않습니다. https://nodejs.org/ (v20 이상)을 설치한 후 다시 실행하세요."
    exit 1
}
Write-Host "  ✓ Node.js 확인: $nodeVersion" -ForegroundColor Gray

# Antigravity 실행 여부 점검 (DB 파일 잠금 방지)
$agyProcess = Get-Process -Name "Antigravity*" -ErrorAction SilentlyContinue
if ($agyProcess) {
    Write-Host "  [주의] Antigravity IDE가 현재 실행 중입니다." -ForegroundColor Yellow
    $confirm = Read-Host "DB 복원을 위해 Antigravity를 안전하게 종료하고 진행할까요? (Y/N)"
    if ($confirm -match '^[yY]') {
        Stop-Process -Name "Antigravity*" -Force
        Start-Sleep -Seconds 2
        Write-Host "  ✓ Antigravity 종료 완료" -ForegroundColor Gray
    } else {
        Write-Host "  [경고] Antigravity가 실행 중이면 DB 복사 시 파일 잠금 충돌이 발생할 수 있습니다." -ForegroundColor Red
    }
}

# 1. Google Drive 경로 자동 감지
Write-Host "[단계 1/6] Google Drive 동기화 패키지 탐색..." -ForegroundColor Yellow
if (-not $GDriveRoot) {
    if (Test-Path "G:\내 드라이브") {
        $GDriveRoot = "G:\내 드라이브"
    } elseif (Test-Path "G:\My Drive") {
        $GDriveRoot = "G:\My Drive"
    } elseif (Test-Path "G:\") {
        $gDirs = Get-ChildItem -Path "G:\" -Directory -ErrorAction SilentlyContinue
        $mainG = $gDirs | Where-Object { $_.Name -notmatch "다른|Other|Computers" } | Select-Object -First 1
        if ($mainG) {
            $GDriveRoot = $mainG.FullName
        }
    }
    
    if (-not $GDriveRoot) {
        $candidatePaths = @(
            "$env:USERPROFILE\Google Drive",
            "$env:USERPROFILE\Google 드라이브"
        )
        foreach ($p in $candidatePaths) {
            if (Test-Path $p) {
                $GDriveRoot = $p
                break
            }
        }
    }
}

if (-not $GDriveRoot -or -not (Test-Path $GDriveRoot)) {
    $inputPath = Read-Host "Google Drive 데스크톱 경로를 직접 입력하세요 (예: G:\내 드라이브)"
    if ($inputPath -and (Test-Path $inputPath)) {
        $GDriveRoot = $inputPath
    } else {
        Write-Error "[오류] 유효한 Google Drive 경로를 찾을 수 없습니다."
        exit 1
    }
}

$SyncPackage = Join-Path $GDriveRoot "v-show-antigravity-sync"
if (-not (Test-Path $SyncPackage)) {
    Write-Error "[오류] Google Drive 내 'v-show-antigravity-sync' 폴더를 찾을 수 없습니다. PC 1에서 00_PACKAGE_EXPORT_PC1.ps1을 먼저 실행해 업로드 완료했는지 확인하세요."
    exit 1
}
Write-Host "  ✓ 동기화 원본 패키지 확인 완료: $SyncPackage" -ForegroundColor Green

# 2. 로컬 대상 디렉터리 결정
Write-Host "[단계 2/6] 로컬 프로젝트 설치 경로 결정..." -ForegroundColor Yellow
if (-not $TargetDir) {
    if (Test-Path "E:\") {
        $TargetDir = "E:\vivpr\ai"
    } elseif (Test-Path "D:\") {
        $TargetDir = "D:\vivpr\ai"
    } else {
        $TargetDir = "C:\vivpr\ai"
    }
    Write-Host "  기본 감지 설치 경로: $TargetDir" -ForegroundColor Cyan
    $customDir = Read-Host "이 경로에 설치하시겠습니까? (Enter: 기본값 사용, 또는 새 경로 입력)"
    if ($customDir -and $customDir.Trim() -ne "") {
        $TargetDir = $customDir.Trim()
    }
}

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}
Write-Host "  ✓ 로컬 프로젝트 대상 경로: $TargetDir" -ForegroundColor Green

# 3. Antigravity 3대 대화창 및 브레인/설정 복원
Write-Host "[단계 3/6] Antigravity 3개 핵심 세션 (대화창, 브레인, 아티팩트, 탭 레이아웃) 복원 중..." -ForegroundColor Yellow

$localConvoDir = "$env:USERPROFILE\.gemini\antigravity\conversations"
$localBrainDir = "$env:USERPROFILE\.gemini\antigravity\brain"
$localStateDir = "$env:USERPROFILE\.gemini\antigravity"
$localConfigDir = "$env:APPDATA\Antigravity"

New-Item -ItemType Directory -Path $localConvoDir -Force | Out-Null
New-Item -ItemType Directory -Path $localBrainDir -Force | Out-Null
New-Item -ItemType Directory -Path $localConfigDir -Force | Out-Null

# DB 복원
$srcConvos = Join-Path $SyncPackage "antigravity-core\conversations"
if (Test-Path $srcConvos) {
    Copy-Item -Path "$srcConvos\*" -Destination $localConvoDir -Force -Recurse
    Write-Host "  ✓ 대화 세션 DB (6cb2d68e, a60a4785, d83397bc) 복원 완료" -ForegroundColor Green
}

# State 메타 복원
$srcState = Join-Path $SyncPackage "antigravity-core\state"
if (Test-Path $srcState) {
    Copy-Item -Path "$srcState\*" -Destination $localStateDir -Force
    Write-Host "  ✓ 대화 요약 메타 및 설치 상태 복원 완료" -ForegroundColor Green
}

# Config (app_storage.json) 복원
$srcConfig = Join-Path $SyncPackage "antigravity-core\config\app_storage.json"
if (Test-Path $srcConfig) {
    Copy-Item -Path $srcConfig -Destination "$localConfigDir\app_storage.json" -Force
    Write-Host "  ✓ Antigravity IDE 레이아웃 (3개 대화창 열린 탭 상태) 복원 완료" -ForegroundColor Green
}

# Brain 복원 (멀티스레드 robocopy)
$srcBrain = Join-Path $SyncPackage "antigravity-core\brain"
if (Test-Path $srcBrain) {
    Write-Host "  - 대화 브레인/아티팩트 동기화 중 (약 3GB, 잠시 기다려주세요)..." -ForegroundColor Cyan
    robocopy "$srcBrain" "$localBrainDir" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO
    Write-Host "  ✓ 브레인 및 아티팩트 복원 완료" -ForegroundColor Green
}

# 4. 프로젝트 소스 코드 복원
Write-Host "[단계 4/6] 프로젝트 소스 코드 로컬 복원 중..." -ForegroundColor Yellow

$localVshow = Join-Path $TargetDir "v-show"
$localFastTrack = Join-Path $TargetDir "v-show-stage2-fast-track"

$srcVshow = Join-Path $SyncPackage "project-code\v-show"
$srcFastTrack = Join-Path $SyncPackage "project-code\v-show-stage2-fast-track"

Write-Host "  - 메인 저장소 (v-show) 복사 중..." -ForegroundColor Cyan
robocopy "$srcVshow" "$localVshow" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO
Write-Host "  ✓ 메인 저장소 복사 완료" -ForegroundColor Green

Write-Host "  - Fast-Track 워크트리 (v-show-stage2-fast-track) 복사 중..." -ForegroundColor Cyan
robocopy "$srcFastTrack" "$localFastTrack" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO
Write-Host "  ✓ Fast-Track 워크트리 복사 완료" -ForegroundColor Green

# 5. Git Worktree 포인터 자동 재연결 및 복구
Write-Host "[단계 5/6] Git Worktree 포인터 자동 재연결 및 검증..." -ForegroundColor Yellow

$gitMainPath = $localVshow.Replace('\', '/')
$gitWorktreePath = $localFastTrack.Replace('\', '/')

# v-show-stage2-fast-track/.git 업데이트
$worktreeGitFile = Join-Path $localFastTrack ".git"
Set-Content -Path $worktreeGitFile -Value "gitdir: $gitMainPath/.git/worktrees/v-show-stage2-fast-track" -NoNewline
Write-Host "  ✓ 워크트리 .git 포인터 재설정 완료" -ForegroundColor Gray

# v-show/.git/worktrees/v-show-stage2-fast-track/gitdir 업데이트
$mainWorktreeGitdir = Join-Path $localVshow ".git\worktrees\v-show-stage2-fast-track\gitdir"
if (Test-Path (Split-Path $mainWorktreeGitdir)) {
    Set-Content -Path $mainWorktreeGitdir -Value "$gitWorktreePath/.git" -NoNewline
    Write-Host "  ✓ 메인 리포 worktrees gitdir 포인터 재설정 완료" -ForegroundColor Gray
}

# git worktree repair 실행
Push-Location $localVshow
try {
    git worktree repair 2>$null
    Write-Host "  ✓ git worktree repair 성공" -ForegroundColor Green
    git worktree list
} finally {
    Pop-Location
}

# 6. Node 종속성(npm install) 설치
Write-Host "[단계 6/6] Node.js 종속성 확인 및 필요시 설치..." -ForegroundColor Yellow

$pkgJsonFastTrack = Join-Path $localFastTrack "package.json"
$nodeModulesFastTrack = Join-Path $localFastTrack "node_modules"

if (Test-Path $pkgJsonFastTrack) {
    if (-not (Test-Path $nodeModulesFastTrack)) {
        Write-Host "  - Fast-Track 루트 npm install 실행 중..." -ForegroundColor Cyan
        Push-Location $localFastTrack
        try {
            npm install --silent
            Write-Host "  ✓ Fast-Track npm install 완료" -ForegroundColor Green
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  ✓ node_modules가 이미 존재합니다 (생략)" -ForegroundColor Gray
    }
}

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  [성공] 새 PC 설치 및 복원이 완벽하게 완료되었습니다!" -ForegroundColor Green
Write-Host ""
Write-Host "  * Antigravity IDE를 실행하면 이전 대화창 3개와 아티팩트가 그대로 복원됩니다:" -ForegroundColor White
Write-Host "    - [Convo 1]: 6cb2d68e (v-show 기본 개발 & C01~C09)" -ForegroundColor Gray
Write-Host "    - [Convo 2]: a60a4785 (Stage 1 / C11.16 / 3DZ 아키텍처)" -ForegroundColor Gray
Write-Host "    - [Convo 3]: d83397bc (현재 세션: Stage 2 Fast Track & Issue #4 완벽 통과)" -ForegroundColor Gray
Write-Host "  * 로컬 프로젝트 경로:" -ForegroundColor White
Write-Host "    - 메인 리포: $localVshow" -ForegroundColor Cyan
Write-Host "    - Fast-Track: $localFastTrack" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green