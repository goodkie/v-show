<#
.SYNOPSIS
    작업 완료 후 로컬 -> Google Drive 동기화 스크립트 (Push)
.DESCRIPTION
    현재 PC에서 작업한 Antigravity 대화 내용, 브레인 및 소스 코드 변경사항을
    Google Drive 데스크톱 동기화 폴더로 안전하게 푸시합니다.
    설치 경로(C:, D:, E: 등)가 달라도 설정 파일 및 자동 감지로 완벽하게 동기화합니다.
#>

[CmdletBinding()]
param(
    [string]$GDriveRoot = "",
    [string]$LocalDir = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  [v-show] 로컬 작업 내용 -> Google Drive 동기화 (Push) 시작" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

# 0. Antigravity 프로세스 확인 및 안전 종료 처리
$agyProcess = Get-Process -Name "Antigravity*" -ErrorAction SilentlyContinue
if ($agyProcess) {
    if ($Force) {
        Write-Host "[-Force 옵션 적용] 실행 중인 Antigravity 프로세스를 안전하게 자동 종료합니다." -ForegroundColor Yellow
        Stop-Process -Name "Antigravity*" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    } else {
        Write-Host "[주의] Antigravity IDE가 켜져 있으면 DB 동기화 중 파일 충돌이 발생할 수 있습니다." -ForegroundColor Yellow
        $ans = Read-Host "Antigravity를 지금 자동 종료하고 계속 진행하시겠습니까? (Y/N)"
        if ($ans -match '^[yY]') {
            Stop-Process -Name "Antigravity*" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
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
    Write-Error "[오류] Google Drive Desktop 경로를 찾을 수 없습니다. G: 드라이브 마운트 상태를 확인하세요."
    exit 1
}

$SyncRoot = Join-Path $GDriveRoot "v-show-antigravity-sync"
if (-not (Test-Path $SyncRoot)) {
    Write-Error "[오류] Google Drive에 동기화 패키지($SyncRoot)가 존재하지 않습니다."
    exit 1
}

# 2. 로컬 프로젝트 경로 자동 해결 및 동적 로드
$configPath = "$env:USERPROFILE\.gemini\vshow_sync_config.json"
$resolvedLocalDir = $null

# 2-1. 매개변수로 명시 전달된 경우
if ($LocalDir -and (Test-Path $LocalDir)) {
    $resolvedLocalDir = (Resolve-Path $LocalDir).Path
}

# 2-2. 영구 설정 파일(vshow_sync_config.json) 확인
if (-not $resolvedLocalDir -and (Test-Path $configPath)) {
    try {
        $cfg = Get-Content $configPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue | ConvertFrom-Json
        if ($cfg.LocalProjectRoot -and (Test-Path $cfg.LocalProjectRoot)) {
            $resolvedLocalDir = $cfg.LocalProjectRoot
        }
    } catch {}
}

# 2-3. 현재 작업 디렉터리 기준 감지
if (-not $resolvedLocalDir) {
    $curr = (Get-Location).Path
    if ((Test-Path "$curr\v-show") -or (Test-Path "$curr\v-show-stage2-fast-track")) {
        $resolvedLocalDir = $curr
    } elseif ($curr -match "v-show") {
        $parent = Split-Path -Parent $curr
        if ((Test-Path "$parent\v-show") -or (Test-Path "$parent\v-show-stage2-fast-track")) {
            $resolvedLocalDir = $parent
        }
    }
}

# 2-4. 공통 드라이브 후보군 자동 탐색 (E:, D:, C:, UserProfile 등)
if (-not $resolvedLocalDir) {
    $candidates = @(
        "E:\vivpr\ai",
        "D:\vivpr\ai",
        "C:\vivpr\ai",
        "$HOME\ai",
        "$env:USERPROFILE\ai",
        "$env:USERPROFILE\projects\v-show"
    )
    foreach ($c in $candidates) {
        if ((Test-Path "$c\v-show") -or (Test-Path "$c\v-show-stage2-fast-track")) {
            $resolvedLocalDir = $c
            break
        }
    }
}

if (-not $resolvedLocalDir -or -not (Test-Path $resolvedLocalDir)) {
    Write-Error "[오류] 로컬 v-show 프로젝트 경로를 찾을 수 없습니다. -LocalDir 매개변수를 지정하거나 01_SETUP_RESTORE_NEW_PC.ps1을 먼저 실행하세요."
    exit 1
}

# 설정 파일 자동 저장/갱신 (UTF-8 인코딩 보장)
try {
    $geminiDir = Split-Path -Parent $configPath
    if (-not (Test-Path $geminiDir)) { New-Item -ItemType Directory -Path $geminiDir -Force | Out-Null }
    $cfgObj = [PSCustomObject]@{
        LocalProjectRoot = $resolvedLocalDir
        GDriveRoot       = $GDriveRoot
        LastPushTime     = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
    $jsonContent = $cfgObj | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($configPath, $jsonContent, [System.Text.Encoding]::UTF8)
} catch {}

Write-Host "  ✓ Google Drive 경로: $SyncRoot" -ForegroundColor Green
Write-Host "  ✓ 로컬 소스 루트: $resolvedLocalDir" -ForegroundColor Green

# 3. Antigravity 모든 대화 DB & State 푸시
Write-Host "`n[1/3] Antigravity 전체 대화 DB & 상태 메타 푸시 중..." -ForegroundColor Yellow

$localAgyRoots = @(
    "$env:USERPROFILE\.gemini\antigravity-ide",
    "$env:USERPROFILE\.gemini\antigravity"
)

$targetConvoDir = "$SyncRoot\antigravity-core\conversations"
$targetBrainDir = "$SyncRoot\antigravity-core\brain"
$targetStateDir = "$SyncRoot\antigravity-core\state"
$targetConfigDir = "$SyncRoot\antigravity-core\config"

New-Item -ItemType Directory -Path $targetConvoDir -Force | Out-Null
New-Item -ItemType Directory -Path $targetBrainDir -Force | Out-Null
New-Item -ItemType Directory -Path $targetStateDir -Force | Out-Null
New-Item -ItemType Directory -Path $targetConfigDir -Force | Out-Null

$allConvoIds = [System.Collections.Generic.HashSet[string]]::new()

foreach ($root in $localAgyRoots) {
    $cDir = Join-Path $root "conversations"
    if (Test-Path $cDir) {
        $dbFiles = Get-ChildItem -Path $cDir -Filter "*.db" -ErrorAction SilentlyContinue
        foreach ($db in $dbFiles) {
            $cid = $db.BaseName
            [void]$allConvoIds.Add($cid)
            $related = Get-ChildItem -Path $cDir -Filter "$cid.*" -ErrorAction SilentlyContinue
            foreach ($rf in $related) {
                Copy-Item -Path $rf.FullName -Destination $targetConvoDir -Force
            }
        }
    }
}

Write-Host "  ✓ 동기화된 대화창 세션 DB 수: $($allConvoIds.Count)개" -ForegroundColor Gray

# State 메타 파일 복사
$stateFiles = @("conversation_summaries.db", "agyhub_summaries_proto.pb", "antigravity_state.pbtxt")
foreach ($root in $localAgyRoots) {
    foreach ($sf in $stateFiles) {
        $fullPath = Join-Path $root $sf
        if (Test-Path $fullPath) {
            Copy-Item -Path $fullPath -Destination $targetStateDir -Force
        }
    }
}

# Config 파일 복사
$configCandidates = @(
    "$env:APPDATA\Antigravity IDE\app_storage.json",
    "$env:APPDATA\Antigravity\app_storage.json"
)
foreach ($cfg in $configCandidates) {
    if (Test-Path $cfg) {
        Copy-Item -Path $cfg -Destination "$targetConfigDir\app_storage.json" -Force
        break
    }
}

# 4. Brain 증분 동기화
Write-Host "`n[2/3] Antigravity Brain 증분 동기화 중..." -ForegroundColor Yellow
foreach ($root in $localAgyRoots) {
    $bDir = Join-Path $root "brain"
    if (Test-Path $bDir) {
        foreach ($id in $allConvoIds) {
            $bSrc = Join-Path $bDir $id
            $bDst = Join-Path $targetBrainDir $id
            if (Test-Path $bSrc) {
                robocopy "$bSrc" "$bDst" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO
            }
        }
    }
}

# 5. 소스 코드 동기화 (해결된 $resolvedLocalDir 기준)
Write-Host "`n[3/3] 소스 코드 동기화 중..." -ForegroundColor Yellow

$repoMain = Join-Path $resolvedLocalDir "v-show"
$repoFastTrack = Join-Path $resolvedLocalDir "v-show-stage2-fast-track"

if (Test-Path $repoMain) {
    Write-Host "  - v-show 메인 저장소 동기화 ($repoMain)..." -ForegroundColor Cyan
    robocopy "$repoMain" "$SyncRoot\project-code\v-show" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* archive_staging sample3 sample4 backups __pycache__ .system_generated
    Write-Host "  ✓ v-show 메인 저장소 동기화 완료" -ForegroundColor Green
} else {
    Write-Host "  [주의] $repoMain 경로가 존재하지 않아 메인 저장소 동기화를 건너뜁니다." -ForegroundColor Yellow
}

if (Test-Path $repoFastTrack) {
    Write-Host "  - v-show-stage2-fast-track 동기화 ($repoFastTrack)..." -ForegroundColor Cyan
    robocopy "$repoFastTrack" "$SyncRoot\project-code\v-show-stage2-fast-track" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* __pycache__ .system_generated
    Write-Host "  ✓ v-show-stage2-fast-track 동기화 완료" -ForegroundColor Green
} else {
    Write-Host "  [주의] $repoFastTrack 경로가 존재하지 않아 Fast-Track 동기화를 건너뜁니다." -ForegroundColor Yellow
}

Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "  [완료] Google Drive로의 동기화(Push)가 완벽하게 완료되었습니다!" -ForegroundColor Green
Write-Host "  동기화 시간: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green