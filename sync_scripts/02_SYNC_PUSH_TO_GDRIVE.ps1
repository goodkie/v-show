<#
.SYNOPSIS
    작업 완료 후 로컬 -> Google Drive 동기화 스크립트 (Push)
.DESCRIPTION
    현재 PC에서 작업한 Antigravity 대화 내용, 브레인 및 코드 변경사항을
    Google Drive 데스크톱 동기화 폴더로 안전하게 푸시합니다.
#>

[CmdletBinding()]
param(
    [string]$GDriveRoot = ""
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  [v-show] 로컬 작업 내용 -> Google Drive 동기화 (Push) 시작" -ForegroundColor Cyan
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
    Write-Error "[오류] Google Drive Desktop 경로를 찾을 수 없습니다."
    exit 1
}

$SyncRoot = Join-Path $GDriveRoot "v-show-antigravity-sync"
if (-not (Test-Path $SyncRoot)) {
    Write-Error "[오류] Google Drive에 동기화 패키지($SyncRoot)가 존재하지 않습니다."
    exit 1
}

# 2. Antigravity 3개 대화 DB & State 푸시
Write-Host "[1/3] Antigravity 대화 DB & 상태 메타 푸시 중..." -ForegroundColor Yellow
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
    }
}

$localAgyDir = "$env:USERPROFILE\.gemini\antigravity"
$targetStateDir = "$SyncRoot\antigravity-core\state"
$stateFiles = @("conversation_summaries.db", "agyhub_summaries_proto.pb", "antigravity_state.pbtxt")
foreach ($sf in $stateFiles) {
    $fullPath = Join-Path $localAgyDir $sf
    if (Test-Path $fullPath) {
        Copy-Item -Path $fullPath -Destination $targetStateDir -Force
    }
}

$localAppStorage = "$env:APPDATA\Antigravity\app_storage.json"
if (Test-Path $localAppStorage) {
    Copy-Item -Path $localAppStorage -Destination "$SyncRoot\antigravity-core\config\" -Force
}

# 3. Brain 증분 동기화
Write-Host "[2/3] Antigravity Brain 증분 동기화 중..." -ForegroundColor Yellow
$localBrainDir = "$env:USERPROFILE\.gemini\antigravity\brain"
$targetBrainDir = "$SyncRoot\antigravity-core\brain"
foreach ($id in $convoIds) {
    $bSrc = Join-Path $localBrainDir $id
    $bDst = Join-Path $targetBrainDir $id
    if (Test-Path $bSrc) {
        robocopy "$bSrc" "$bDst" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO
    }
}

# 4. 소스 코드 동기화
Write-Host "[3/3] 소스 코드 동기화 중..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoFastTrack = Split-Path -Parent $scriptDir
$repoMain = Join-Path (Split-Path -Parent $repoFastTrack) "v-show"

if (Test-Path $repoMain) {
    Write-Host "  - v-show 메인 저장소 동기화..." -ForegroundColor Cyan
    robocopy "$repoMain" "$SyncRoot\project-code\v-show" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* archive_staging sample3 sample4 backups __pycache__ .system_generated
}

if (Test-Path $repoFastTrack) {
    Write-Host "  - v-show-stage2-fast-track 동기화..." -ForegroundColor Cyan
    robocopy "$repoFastTrack" "$SyncRoot\project-code\v-show-stage2-fast-track" /E /MT:16 /R:1 /W:1 /NFL /NDL /NP /XO /XD node_modules .tmp* __pycache__ .system_generated
}

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  [완료] Google Drive로의 동기화(Push)가 완료되었습니다! ( $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') )" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green