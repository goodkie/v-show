param(
  [string]$OutDir = "",
  [string]$SourceStateDir = "",
  [string]$NodeExePath = ""
)
$ErrorActionPreference = "Stop"

# ======================================================================================
# XPIDER V7.1 LOCAL-ONLY PERSONAL INSTALLER BUILDER (STRICTLY NEVER UPLOAD TO GITHUB!)
# ======================================================================================
# Builds a private personal Windows installer (.exe) and portable package (.zip) on the
# Owner's local disk ONLY, embedding ALL local API keys, tokens, domain configs,
# Web Compose accounts, suppression ledger, and cross-PC re-sealable Gmail OAuth vault.
#
# Output is written STRICTLY outside Git staging into LOCAL_PRIVATE_ONLY\.
# NEVER commit, push, or upload anything inside LOCAL_PRIVATE_ONLY\ to GitHub!
# ======================================================================================

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) {
  $OutDir = Join-Path $env:LOCALAPPDATA "XPIDER\LOCAL_PRIVATE_ONLY"
}
if (-not $SourceStateDir) {
  $SourceStateDir = Join-Path $env:LOCALAPPDATA "XPIDER\Sidecar"
}
if (-not (Test-Path $SourceStateDir)) {
  throw "SOURCE_STATE_DIR_NOT_FOUND: $SourceStateDir"
}
if (-not $NodeExePath) {
  $NodeExePath = (Get-Command node).Source
}
if (-not (Test-Path $NodeExePath)) { throw "NODE_EXE_NOT_FOUND: $NodeExePath" }

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "DOTNET_CSC_NOT_FOUND: $csc" }

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$gitFull = (git -C $repoRoot rev-parse HEAD).Trim()
$gitShort = (git -C $repoRoot rev-parse --short=8 HEAD).Trim()
$stageDir = Join-Path $env:TEMP ("xpider_v71_private_stage_" + $gitShort + "_" + [guid]::NewGuid().ToString("N").Substring(0,8))
$seedTmp = Join-Path $env:TEMP ("xpider_personal_seed_" + [guid]::NewGuid().ToString("N").Substring(0,8) + ".bin")
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

try {
  Write-Output "[PRIVATE-LOCAL-BUILD] Staging XPIDER V7.1.0 PERSONAL LOCAL-ONLY bundle from commit $gitShort..."

  # 1. Bundled portable Node.js runtime
  $rtDir = Join-Path $stageDir "runtime"
  New-Item -ItemType Directory -Path $rtDir -Force | Out-Null
  Copy-Item -Path $NodeExePath -Destination (Join-Path $rtDir "node.exe") -Force
  $nodeVer = (& (Join-Path $rtDir "node.exe") -v).Trim()

  # 2. Copy clean app payload (companion, extension, owner-extension-test-site)
  foreach ($sub in @("companion", "extension", "owner-extension-test-site")) {
    $src = Join-Path $repoRoot $sub
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $stageDir $sub
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
    $rc = Start-Process -FilePath "robocopy.exe" -ArgumentList @(
      $src, $dst, "/E",
      "/XD", ".git", "state", "logs", "tmp", "XPIDER_*", "unsubscribe-worker",
      "/XF", "COMMIT_PROVENANCE.txt", ".local_credentials*", ".resend_*", ".ai_copy_*", ".email_*", ".gmail_*", ".suppressed_*", ".unsubscribe_*", "*.dpapi*", "*.log", "*.tmp",
      "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS"
    ) -Wait -PassThru -NoNewWindow
    if ($rc.ExitCode -ge 8) { throw "robocopy failed for $sub (exit=$($rc.ExitCode))" }
  }

  # 3. Verify pinned Extension ID
  $mfPath = Join-Path $stageDir "extension\manifest.json"
  $mf = Get-Content $mfPath -Raw | ConvertFrom-Json
  if (-not $mf.key -or $mf.key.Length -ne 392) {
    throw "PINNED_EXTENSION_KEY_INVALID"
  }

  # 4. Pack Owner's local settings + keys + unwrapped DPAPI Gmail OAuth vault into portable seed
  Write-Output "[PRIVATE-LOCAL-BUILD] Packing local Sidecar settings & re-sealable DPAPI vault from $SourceStateDir..."
  & (Join-Path $rtDir "node.exe") (Join-Path $stageDir "companion\xpider-personal-migration.js") --pack-seed --source-state-dir $SourceStateDir --out $seedTmp
  if ($LASTEXITCODE -ne 0) { throw "PACK_PERSONAL_SEED_FAILED (exit=$LASTEXITCODE)" }

  # 5. Write standard install-relative helpers + provenance
  Set-Content -Path (Join-Path $stageDir "START_EMAIL_TEST_SIDECAR.bat") -Encoding ASCII -Value @"
@echo off
"%~dp0runtime\node.exe" "%~dp0companion\email-test-sidecar-cli.js"
"@
  Set-Content -Path (Join-Path $stageDir "STOP_EMAIL_TEST_SIDECAR.bat") -Encoding ASCII -Value @"
@echo off
"%~dp0runtime\node.exe" "%~dp0companion\email-test-sidecar-stop.js"
"@
  Set-Content -Path (Join-Path $stageDir "CHECK_EMAIL_TEST_SIDECAR.bat") -Encoding ASCII -Value @"
@echo off
"%~dp0runtime\node.exe" "%~dp0companion\email-test-sidecar-status.js"
"@
  Set-Content -Path (Join-Path $stageDir "UNINSTALL_XPIDER.bat") -Encoding ASCII -Value @"
@echo off
"%~dp0XPIDER_UNINSTALL.exe" --uninstall --retain-data
"@

  $prov = @{
    app = "XPIDER AutoForm Sender Pro"
    packageVersion = "7.1.0"
    manifestVersion = $mf.version
    pinnedExtensionId = "ldlijlaccfeelfdhgnjbibniocefckjj"
    commitFull = $gitFull
    commitShort = $gitShort
    bundledNodeVersion = $nodeVer
    signingStatus = "UNSIGNED"
    personalSeedBundled = $true
    distributionScope = "LOCAL_PRIVATE_ONLY_DO_NOT_UPLOAD_TO_GITHUB"
    builtAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText((Join-Path $stageDir "RELEASE_PROVENANCE.json"), $prov + "`n", (New-Object System.Text.UTF8Encoding $false))

  # 5b. Bundle comprehensive Korean Installation & Complete User Manual (.html + .md) inside Local-Only package too (fail-closed)
  $guideMd = Join-Path $repoRoot "docs\XPIDER_V7.1.0_설치방법_및_총사용법_가이드.md"
  $guideHtml = Join-Path $repoRoot "docs\XPIDER_V7.1.0_설치방법_및_총사용법_가이드.html"
  foreach ($gf in @($guideMd, $guideHtml)) {
    if (-not (Test-Path $gf)) { throw "Required user guide missing: $gf" }
    Copy-Item -Path $gf -Destination (Join-Path $stageDir (Split-Path -Leaf $gf)) -Force
  }

  # 6. Create clean app payload ZIP (seed is embedded as a separate Win32/.NET resource in the EXE so app dir stays clean!)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $payloadZip = Join-Path $env:TEMP ("xpider_private_payload_" + [guid]::NewGuid().ToString("N").Substring(0,8) + ".zip")
  if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, $payloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

  # 7. Compile LOCAL-ONLY Personal EXE embedding BOTH XPIDER_PAYLOAD.zip AND XPIDER_PERSONAL_SEED.bin
  $setupExe = Join-Path $OutDir "XPIDER_V7.1.0_PERSONAL_LOCAL_ONLY_${gitShort}.exe"
  if (Test-Path $setupExe) { Remove-Item $setupExe -Force }
  $csSource = Join-Path $repoRoot "installer\XpiderSetup.cs"
  Write-Output "[COMPILE] Building LOCAL-ONLY Personal EXE: $setupExe ..."
  & $csc /nologo /target:winexe /platform:x64 /optimize+ `
    /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
    /res:"$payloadZip,XPIDER_PAYLOAD.zip" `
    /res:"$seedTmp,XPIDER_PERSONAL_SEED.bin" `
    /out:"$setupExe" `
    "$csSource"
  if ($LASTEXITCODE -ne 0) { throw "CSC_PRIVATE_COMPILE_FAILED (exit=$LASTEXITCODE)" }

  # 8. Also build LOCAL-ONLY Portable ZIP (includes APPLY_PERSONAL_SETTINGS.bat + XPIDER_PERSONAL_SEED.bin)
  Copy-Item -Path $seedTmp -Destination (Join-Path $stageDir "XPIDER_PERSONAL_SEED.bin") -Force
  Set-Content -Path (Join-Path $stageDir "APPLY_PERSONAL_SETTINGS.bat") -Encoding ASCII -Value @"
@echo off
"%~dp0runtime\node.exe" "%~dp0companion\xpider-personal-migration.js" --apply-seed --seed "%~dp0XPIDER_PERSONAL_SEED.bin" --target-state-dir "%LOCALAPPDATA%\XPIDER\Sidecar" --overwrite
pause
"@
  $portableZip = Join-Path $OutDir "XPIDER_V7.1.0_PERSONAL_PORTABLE_LOCAL_ONLY_${gitShort}.zip"
  if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, $portableZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

  # 9. Write unmistakable local-only README
  $warnTxt = @"
================================================================================
[주의 — 본인 전용 로컬 백업/설치 패키지 · GitHub / 외부 업로드 절대 금지!]
================================================================================
이 폴더의 파일에는 대표님의 개인 API 키 및 설정이 암호화 번들로 통째로 포함되어 있습니다:
- Resend API 키 & Webhook 시크릿
- Google Gemini AI API 키
- 이미지 호스팅 설정 및 토큰
- 수신거부 URL · 동기화 토큰 · 교차 수신거부 차단 원장
- Gmail 브랜드 도메인 설정
- Gmail OAuth Client + 연결 계정 리프레시 토큰 (새 PC 설치 시 새 PC의 Windows DPAPI로 자동 재암호화!)
- Gmail 웹 작성창 등록 계정 목록 (슬롯·워밍업 단계 포함) & 저장된 캠페인

[새 Windows PC 사용 방법]
1. XPIDER_V7.1.0_PERSONAL_LOCAL_ONLY_${gitShort}.exe 를 USB 또는 개인 비공개 드라이브로 복사해 실행하세요.
2. 설치가 끝나면 모든 키·OAuth·계정·설정이 새 PC에 자동 복원됩니다 (별도 Node.js/서버 설치 불필요).
3. Chrome에서 chrome://extensions (개발자 모드 ON) -> 압축해제된 확장 로드 -> %LOCALAPPDATA%\XPIDER\App\extension 선택!
4. 이후 새 버전이 나오면 앱 상단의 [🔄 최신 업데이트 확인] -> [⬇️ 최신 버전 다운로드 후 설치]를 누르세요.
   (GitHub 공개 최신 앱을 받아도 기존 개인 키·설정은 100% 그대로 유지됩니다!)
"@
  $warnFile = Join-Path $OutDir "DO_NOT_UPLOAD_TO_GITHUB.txt"
  [System.IO.File]::WriteAllText($warnFile, $warnTxt, (New-Object System.Text.UTF8Encoding $false))

  # 10. Build Local-Only Personal All-in-One Bundle ZIP (Personal EXE + Personal Portable ZIP + Full Korean Guides + Security Warning)
  $privAioStage = Join-Path $env:TEMP ("xpider_priv_allinone_" + $gitShort + "_" + [guid]::NewGuid().ToString("N").Substring(0,8))
  New-Item -ItemType Directory -Path $privAioStage -Force | Out-Null
  try {
    Copy-Item -Path $setupExe -Destination (Join-Path $privAioStage (Split-Path -Leaf $setupExe)) -Force
    Copy-Item -Path $portableZip -Destination (Join-Path $privAioStage (Split-Path -Leaf $portableZip)) -Force
    Copy-Item -Path $warnFile -Destination (Join-Path $privAioStage "DO_NOT_UPLOAD_TO_GITHUB.txt") -Force
    foreach ($gf in @($guideMd, $guideHtml)) {
      if (Test-Path $gf) { Copy-Item -Path $gf -Destination (Join-Path $privAioStage (Split-Path -Leaf $gf)) -Force }
    }
    $privAllInOneZip = Join-Path $OutDir "XPIDER_V7.1.0_PERSONAL_ALL_IN_ONE_LOCAL_ONLY_${gitShort}.zip"
    if (Test-Path $privAllInOneZip) { Remove-Item $privAllInOneZip -Force }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($privAioStage, $privAllInOneZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  } finally {
    if (Test-Path $privAioStage) { Remove-Item -Recurse -Force $privAioStage -ErrorAction SilentlyContinue }
  }

  $exeInfo = Get-Item $setupExe
  $exeSha = (Get-FileHash $setupExe -Algorithm SHA256).Hash.ToLowerInvariant()
  $zipInfo = Get-Item $portableZip
  $zipSha = (Get-FileHash $portableZip -Algorithm SHA256).Hash.ToLowerInvariant()
  $pAioInfo = Get-Item $privAllInOneZip
  $pAioSha = (Get-FileHash $privAllInOneZip -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Output "PERSONAL_LOCAL_EXE=$setupExe"
  Write-Output "PERSONAL_LOCAL_EXE_BYTES=$($exeInfo.Length)"
  Write-Output "PERSONAL_LOCAL_EXE_SHA256=$exeSha"
  Write-Output "PERSONAL_LOCAL_ZIP=$portableZip"
  Write-Output "PERSONAL_LOCAL_ZIP_BYTES=$($zipInfo.Length)"
  Write-Output "PERSONAL_LOCAL_ZIP_SHA256=$zipSha"
  Write-Output "PERSONAL_ALL_IN_ONE_ZIP=$privAllInOneZip"
  Write-Output "PERSONAL_ALL_IN_ONE_ZIP_BYTES=$($pAioInfo.Length)"
  Write-Output "PERSONAL_ALL_IN_ONE_ZIP_SHA256=$pAioSha"
} finally {
  if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir -ErrorAction SilentlyContinue }
  if (Test-Path $seedTmp) { Remove-Item -Force $seedTmp -ErrorAction SilentlyContinue }
  if ($payloadZip -and (Test-Path $payloadZip)) { Remove-Item -Force $payloadZip -ErrorAction SilentlyContinue }
}
