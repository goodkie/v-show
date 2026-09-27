<#
.SYNOPSIS
    작업 시작 전 Google Drive -> 로컬 동기화 스크립트 (Pull)
.DESCRIPTION
    다른 PC에서 작업하여 Google Drive에 업데이트된 최신 대화창(Antigravity DB, Brain) 및
    프로젝트 소스 코드를 현재 로컬 PC로 당겨옵니다.
#>

[CmdletBinding()]
param(
    [string]$GDriveRoot = ""
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  [v-show] Google Drive -> 로컬 PC 동기화 (Pull) 시작" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# 0. Antigravity 프로세스 확인
$agyProcess = Get-Process -Name "Antigravity*" -ErrorAction SilentlyContinue
if ($agyProcess) {
    Write-Host "[경고] Antigravity IDE가 켜져 있으면 DB 동기화 중 파일 충돌이 발생할 수 있습니다." -ForegroundColor Yellow
    $ans = Read-Host "Antigravity를 지금 자동 종료하고 계속 진행하시겠습니까? (Y/N)"
    if ($ans -match '^[yY]') {
        Stop-Process -Name "Antigravity*" -Force
        Start-Sleep -Seconds 2
        Write-Host "✓ Antigravity 종료 완료" -ForegroundColor Green
    }
}

# 1. Google Drive 경로 자동 감지
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
    Write-Error "[오류] Google Drive Desktop 경로를 찾을 수 없습니다."
    exit 1
}

$SyncRoot = Join-Path $GDriveRoot "v-show-antigravity-sync"
if (-not (Test-Path $SyncRoot)) {
    Write-Error "[오류] Google Drive 동기화 패키지가 존재하지 않습니다: $SyncRoot"
    exit 1
}

# 2. Antigravity DB & State 복원/업데이트 (Antigravity 2.0 & IDE 듀얼 지원)
Write-Host "[1/3] Antigravity 대화 DB & 상태 업데이트 중..." -ForegroundColor Yellow

$localAgyRoots = @(
    "$env:USERPROFILE\.gemini\antigravity-ide",
    "$env:USERPROFILE\.gemini\antigravity"
)
$targetConfigDirs = @(
    "$env:APPDATA\Antigravity IDE",
    "$env:APPDATA\Antigravity"
)

$srcConvoDir = "$SyncRoot\antigravity-core\conversations"
$srcStateDir = "$SyncRoot\antigravity-core\state"
$srcAppStorage = "$SyncRoot\antigravity-core\config\app_storage.json"
$srcBrainDir = "$SyncRoot\antigravity-core\brain"

# 구글 드라이브 상의 모든 대화 세션 탐색
$convoFiles = Get-ChildItem -Path $srcConvoDir -Filter "*.db" -ErrorAction SilentlyContinue
$convoIds = $convoFiles | ForEach-Object { $_.BaseName }

foreach ($root in $localAgyRoots) {
    $cDir = Join-Path $root "conversations"
    $bDir = Join-Path $root "brain"
    New-Item -ItemType Directory -Path $cDir -Force | Out-Null
    New-Item -ItemType Directory -Path $bDir -Force | Out-Null

    # DB 증분 복사 (로컬이 더 최신이면 보존)
    if (Test-Path $srcConvoDir) {
        $srcFiles = Get-ChildItem -Path "$srcConvoDir\*.db" -ErrorAction SilentlyContinue
        foreach ($sf in $srcFiles) {
            $dfPath = Join-Path $cDir $sf.Name
            if (-not (Test-Path $dfPath) -or ($sf.LastWriteTimeUtc -gt (Get-Item $dfPath).LastWriteTimeUtc)) {
                Copy-Item -Path $sf.FullName -Destination $dfPath -Force
            }
        }
    }

    # State 복사 (로컬 파일 보호: 최신 유지 및 백업)
    if (Test-Path $srcStateDir) {
        $stateFiles = Get-ChildItem -Path "$srcStateDir\*" -ErrorAction SilentlyContinue
        foreach ($sf in $stateFiles) {
            $dfPath = Join-Path $root $sf.Name
            if (-not (Test-Path $dfPath) -or ($sf.LastWriteTimeUtc -gt (Get-Item $dfPath).LastWriteTimeUtc)) {
                if (Test-Path $dfPath) {
                    Copy-Item -Path $dfPath -Destination "$dfPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')" -Force
                }
                Copy-Item -Path $sf.FullName -Destination $dfPath -Force
            }
        }
        if ($root -match "-ide$") {
            $sumDb = Join-Path $root "conversation_summaries.db"
            if (Test-Path $sumDb) {
                try {
                    python -c "import sqlite3; conn = sqlite3.connect(r'$sumDb'); conn.execute(\"UPDATE conversation_summaries SET app_data_dir = 'antigravity-ide'\"); conn.commit()" 2>$null
                } catch {}
            }
        }
    }

    # Brain 증분 동기화
    if (Test-Path $srcBrainDir) {
        robocopy "$srcBrainDir" "$bDir" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO
    }
}

# Config 복사
foreach ($cfgDir in $targetConfigDirs) {
    New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null
    if (Test-Path $srcAppStorage) {
        Copy-Item -Path $srcAppStorage -Destination "$cfgDir\app_storage.json" -Force
    }
}
Write-Host "  ✓ 대화 세션 DB ($($convoIds.Count)개) 및 브레인/설정 동기화 완료" -ForegroundColor Green

# 4. 소스 코드 동기화
Write-Host "[3/3] 로컬 소스 코드 동기화 중..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoFastTrack = Split-Path -Parent $scriptDir
$repoMain = Join-Path (Split-Path -Parent $repoFastTrack) "v-show"

if (Test-Path $repoMain) {
    Write-Host "  - v-show 메인 저장소 업데이트..." -ForegroundColor Cyan
    robocopy "$SyncRoot\project-code\v-show" "$repoMain" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* archive_staging sample3 sample4 backups __pycache__ .system_generated
}

if (Test-Path $repoFastTrack) {
    Write-Host "  - v-show-stage2-fast-track 업데이트..." -ForegroundColor Cyan
    robocopy "$SyncRoot\project-code\v-show-stage2-fast-track" "$repoFastTrack" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* __pycache__ .system_generated
}

# Git worktree 검증
if (Test-Path $repoMain) {
    Push-Location $repoMain
    try {
        git worktree repair 2>$null
        Write-Host "  ✓ Git worktree 검증 완료" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  [완료] Google Drive로부터 최신 작업내용 동기화(Pull) 완료! ( $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') )" -ForegroundColor Green
Write-Host "  이제 Antigravity IDE를 열어 작업을 이어서 진행하시면 됩니다." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green