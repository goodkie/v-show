<#
.SYNOPSIS
    PC 1 -> Google Drive Desktop 완벽 패키징 & 백업 스크립트
.DESCRIPTION
    v-show 프로젝트의 3개 대화창(Antigravity DB, Brain, State, Config)과
    메인 저장소(v-show) 및 Fast-Track 워크트리(v-show-stage2-fast-track)를
    Google Drive Desktop(G:\내 드라이브\v-show-antigravity-sync)으로 완벽하게 패키징합니다.
#>

[CmdletBinding()]
param(
    [string]$GDriveRoot = ""
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  [v-show & Antigravity] PC 1 -> Google Drive 패키징 시작" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

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
Write-Host "[1/5] 동기화 대상 디렉터리: $SyncRoot" -ForegroundColor Green

# 대상 디렉터리 생성
$dirs = @(
    "$SyncRoot\antigravity-core\conversations",
    "$SyncRoot\antigravity-core\brain",
    "$SyncRoot\antigravity-core\state",
    "$SyncRoot\antigravity-core\config",
    "$SyncRoot\project-code\v-show",
    "$SyncRoot\project-code\v-show-stage2-fast-track",
    "$SyncRoot\scripts"
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

# 2. Antigravity 3개 핵심 대화창 DB 및 WAL/SHM 복사
Write-Host "[2/5] Antigravity 3개 핵심 대화 세션 DB 복사 중..." -ForegroundColor Yellow
$convoIds = @(
    "6cb2d68e-c042-42a8-aee2-b8a40fa9f737",
    "a60a4785-daac-4045-b047-9b489e649678",
    "d83397bc-3323-46b8-a23f-951c5d5d9f30"
)

$localConvoDir = "$env:USERPROFILE\.gemini\antigravity\conversations"
$targetConvoDir = "$SyncRoot\antigravity-core\conversations"

foreach ($id in $convoIds) {
    $files = Get-ChildItem -Path $localConvoDir -Filter "$id.*" -ErrorAction SilentlyContinue
    foreach ($f in $files) {
        Copy-Item -Path $f.FullName -Destination $targetConvoDir -Force
        Write-Host "  - DB 복사 완료: $($f.Name) ($([math]::Round($f.Length/1MB, 2)) MB)" -ForegroundColor Gray
    }
}

# Antigravity 상태 및 최근 대화 목록 DB 복사
$localAgyDir = "$env:USERPROFILE\.gemini\antigravity"
$targetStateDir = "$SyncRoot\antigravity-core\state"
$stateFiles = @("conversation_summaries.db", "agyhub_summaries_proto.pb", "antigravity_state.pbtxt", "installation_id")
foreach ($sf in $stateFiles) {
    $fullPath = Join-Path $localAgyDir $sf
    if (Test-Path $fullPath) {
        Copy-Item -Path $fullPath -Destination $targetStateDir -Force
        Write-Host "  - 상태 메타 복사: $sf" -ForegroundColor Gray
    }
}

# Antigravity IDE layout (app_storage.json) 복사
$localAppStorage = "$env:APPDATA\Antigravity\app_storage.json"
$targetConfigDir = "$SyncRoot\antigravity-core\config"
if (Test-Path $localAppStorage) {
    Copy-Item -Path $localAppStorage -Destination $targetConfigDir -Force
    Write-Host "  - IDE 탭 레이아웃 복사: app_storage.json" -ForegroundColor Gray
}

# 3. Antigravity Brain 디렉터리 동기화 (Robocopy 멀티스레드)
Write-Host "[3/5] Antigravity Brain (대화 로그, Artifact, 첨부 이미지 등) 동기화 중..." -ForegroundColor Yellow
$localBrainDir = "$env:USERPROFILE\.gemini\antigravity\brain"
$targetBrainDir = "$SyncRoot\antigravity-core\brain"

foreach ($id in $convoIds) {
    $bSrc = Join-Path $localBrainDir $id
    $bDst = Join-Path $targetBrainDir $id
    if (Test-Path $bSrc) {
        Write-Host "  - Brain 동기화 시작: $id ..." -ForegroundColor Cyan
        robocopy "$bSrc" "$bDst" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO
        Write-Host "  - Brain 동기화 완료: $id" -ForegroundColor Green
    }
}

# 4. 프로젝트 소스 코드 동기화 (node_modules 및 중복 대용량 아카이브 제외)
Write-Host "[4/5] 프로젝트 코드 동기화 중..." -ForegroundColor Yellow

$vshowSrc = "E:\vivpr\ai\v-show"
$vshowDst = "$SyncRoot\project-code\v-show"
if (Test-Path $vshowSrc) {
    Write-Host "  - 메인 저장소 (v-show) 동기화 중..." -ForegroundColor Cyan
    robocopy "$vshowSrc" "$vshowDst" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* archive_staging sample3 sample4 backups __pycache__ .system_generated
    Write-Host "  - 메인 저장소 동기화 완료." -ForegroundColor Green
}

$stage2Src = "E:\vivpr\ai\v-show-stage2-fast-track"
$stage2Dst = "$SyncRoot\project-code\v-show-stage2-fast-track"
if (Test-Path $stage2Src) {
    Write-Host "  - Fast-Track 워크트리 (v-show-stage2-fast-track) 동기화 중..." -ForegroundColor Cyan
    robocopy "$stage2Src" "$stage2Dst" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* __pycache__ .system_generated
    Write-Host "  - Fast-Track 워크트리 동기화 완료." -ForegroundColor Green
}

# 5. 스크립트 복제
Write-Host "[5/5] 관리 스크립트 동기화 중..." -ForegroundColor Yellow
$scriptSrc = "E:\vivpr\ai\v-show-stage2-fast-track\sync_scripts"
$scriptDst = "$SyncRoot\scripts"
if (Test-Path $scriptSrc) {
    robocopy "$scriptSrc" "$scriptDst" /E /R:1 /W:1 /NFL /NDL /NP
}

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  [완료] Google Drive 데스크톱 완벽 패키징이 완료되었습니다!" -ForegroundColor Green
Write-Host "  동기화 경로: $SyncRoot" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green