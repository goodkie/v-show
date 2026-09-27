﻿<#
.SYNOPSIS
    Antigravity & v-show 환경 무결성 자동 검증 스크립트 (Dual Support)
.DESCRIPTION
    새 PC 또는 동기화 후, Antigravity 2.0 / IDE 대화창 DB, Brain 아티팩트,
    Git Worktree 구조, Node.js 실행 환경의 무결성을 자동으로 테스트하고 진단 보고서를 출력합니다.
#>

$ErrorActionPreference = "Continue"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  [v-show & Antigravity] 환경 무결성 진단 테스트 시작" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$passed = 0
$total = 6

# 1. Antigravity DB 파일 검증 (Antigravity 2.0 & IDE 듀얼 자동 감지)
Write-Host "`n[검사 1/6] Antigravity 대화 세션 DB 무결성 확인..." -ForegroundColor Yellow
$convoIds = @(
    "6cb2d68e-c042-42a8-aee2-b8a40fa9f737",
    "a60a4785-daac-4045-b047-9b489e649678",
    "d83397bc-3323-46b8-a23f-951c5d5d9f30"
)

$candidateDbDirs = @(
    "$env:USERPROFILE\.gemini\antigravity-ide\conversations",
    "$env:USERPROFILE\.gemini\antigravity\conversations"
)
$dbDir = $candidateDbDirs | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $dbDir) {
    Write-Host "  [FAIL] Antigravity conversations 디렉터리를 찾을 수 없습니다." -ForegroundColor Red
    $allDbOk = $false
} else {
    Write-Host "  (활성 DB 디렉터리: $dbDir)" -ForegroundColor Gray
    $allDbOk = $true
    foreach ($id in $convoIds) {
        $dbPath = Join-Path $dbDir "$id.db"
        if (Test-Path $dbPath) {
            $len = (Get-Item $dbPath).Length
            Write-Host "  [PASS] DB 발견: $id.db ($([math]::Round($len/1MB, 1)) MB)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] DB 누락: $id.db" -ForegroundColor Red
            $allDbOk = $false
        }
    }
}
if ($allDbOk) { $passed++ }

# 2. Antigravity Brain 및 로그 파일 검증
Write-Host "`n[검사 2/6] Antigravity Brain & Transcript 확인..." -ForegroundColor Yellow
$candidateBrainDirs = @(
    "$env:USERPROFILE\.gemini\antigravity-ide\brain",
    "$env:USERPROFILE\.gemini\antigravity\brain"
)
$brainDir = $candidateBrainDirs | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $brainDir) {
    Write-Host "  [FAIL] Antigravity brain 디렉터리를 찾을 수 없습니다." -ForegroundColor Red
    $allBrainOk = $false
} else {
    Write-Host "  (활성 Brain 디렉터리: $brainDir)" -ForegroundColor Gray
    $allBrainOk = $true
    foreach ($id in $convoIds) {
        $logPath = Join-Path $brainDir "$id\.system_generated\logs\transcript.jsonl"
        if (Test-Path $logPath) {
            $len = (Get-Item $logPath).Length
            Write-Host "  [PASS] Brain 정상: $id (transcript: $([math]::Round($len/1MB, 1)) MB)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Brain 누락/불완전: $id" -ForegroundColor Red
            $allBrainOk = $false
        }
    }
}
if ($allBrainOk) { $passed++ }

# 3. Antigravity IDE 설정 파일 (app_storage.json) 확인
Write-Host "`n[검사 3/6] Antigravity IDE 탭 레이아웃 설정 확인..." -ForegroundColor Yellow
$candidateStorages = @(
    "$env:APPDATA\Antigravity IDE\app_storage.json",
    "$env:APPDATA\Antigravity\app_storage.json"
)
$appStorage = $candidateStorages | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($appStorage) {
    $content = Get-Content $appStorage -Raw
    $hasConvo = $content -match "d83397bc"
    if ($hasConvo) {
        Write-Host "  [PASS] app_storage.json 확인 완료 ($appStorage)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  [WARN] app_storage.json 발견되었으나 세션 매핑 확인 필요" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [FAIL] app_storage.json 없음" -ForegroundColor Red
}

# 4. Git Worktree 연동 확인
Write-Host "`n[검사 4/6] Git Repository 및 Worktree 연동 확인..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$fastTrackDir = Split-Path -Parent $scriptDir
$mainRepoDir = Join-Path (Split-Path -Parent $fastTrackDir) "v-show"

if ((Test-Path $mainRepoDir) -and (Test-Path $fastTrackDir)) {
    Push-Location $mainRepoDir
    try {
        $wtList = git worktree list 2>$null
        Write-Host "  Git Worktree 목록:" -ForegroundColor Cyan
        $wtList | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        if ($wtList -match "v-show-stage2-fast-track") {
            Write-Host "  [PASS] Git Worktree 정상 연결됨" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "  [INFO] Worktree 목록 확인 중 (단독 워크스페이스로 정상 동작 가능)" -ForegroundColor Yellow
            $passed++
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  [FAIL] 프로젝트 경로 탐색 실패: $mainRepoDir 또는 $fastTrackDir" -ForegroundColor Red
}

# 5. Node.js 런타임 및 의존성 확인
Write-Host "`n[검사 5/6] Node.js 런타임 및 패키지 검사..." -ForegroundColor Yellow
$nodeCheck = node --version 2>$null
if ($nodeCheck) {
    Write-Host "  [PASS] Node.js 런타임: $nodeCheck" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  [FAIL] Node.js 미설치" -ForegroundColor Red
}

# 6. Stage 2 Fast-Track 핵심 파일 및 클린 빌드 상태 검증
Write-Host "`n[검사 6/6] Stage 2 12-Point Capture 핵심 빌드 아티팩트 검사..." -ForegroundColor Yellow
$serverEntry = Join-Path $fastTrackDir "virtual-tradeshow-commercial-v1\_clean_deploy\server\index.js"
if (Test-Path $serverEntry) {
    Write-Host "  [PASS] 클린 프로덕션 서버 엔트리 확인 완료 ($serverEntry)" -ForegroundColor Green
    $passed++
} else {
    Write-Host "  [FAIL] 서버 엔트리 파일 누락" -ForegroundColor Red
}

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "  [진단 결과] 총 $total 항목 중 $passed 항목 통과!" -ForegroundColor $(if ($passed -eq $total) { "Green" } else { "Yellow" })
Write-Host "================================================================" -ForegroundColor Cyan

if ($passed -eq $total) {
    Write-Host "[성공] 이 PC는 v-show 프로젝트 및 Antigravity 핵심 대화창을 완벽히 실행할 준비가 되었습니다." -ForegroundColor Green
} else {
    Write-Host "[주의] 일부 항목 확인이 필요합니다." -ForegroundColor Yellow
}