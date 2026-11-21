param(
  [string]$OutDir = "",
  [string]$NodeExePath = ""
)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $repoRoot "dist_v71" }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$gitFull = (git -C $repoRoot rev-parse HEAD).Trim()
$gitShort = (git -C $repoRoot rev-parse --short=8 HEAD).Trim()
if (-not $NodeExePath) {
  $NodeExePath = (Get-Command node).Source
}
if (-not (Test-Path $NodeExePath)) { throw "NODE_EXE_NOT_FOUND: $NodeExePath" }

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "DOTNET_CSC_NOT_FOUND: $csc" }

$stageDir = Join-Path $env:TEMP ("xpider_v71_stage_" + $gitShort + "_" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

try {
  Write-Output "[BUILD] Staging clean XPIDER V7.1.0 payload from commit $gitShort..."

  # 1. Bundled portable x64 Node.js runtime (zero system Node dependency on clean PCs)
  $rtDir = Join-Path $stageDir "runtime"
  New-Item -ItemType Directory -Path $rtDir -Force | Out-Null
  Copy-Item -Path $NodeExePath -Destination (Join-Path $rtDir "node.exe") -Force
  $nodeVer = (& (Join-Path $rtDir "node.exe") -v).Trim()

  # 2. Copy companion, extension, and owner-extension-test-site cleanly (zero state/secrets/git/nested dirs)
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

  # 3. Verify pinned Extension ID manifest key (392 chars -> ldlijlaccfeelfdhgnjbibniocefckjj)
  $mfPath = Join-Path $stageDir "extension\manifest.json"
  $mf = Get-Content $mfPath -Raw | ConvertFrom-Json
  if (-not $mf.key -or $mf.key.Length -ne 392) {
    throw "PINNED_EXTENSION_KEY_INVALID: len=$($mf.key.Length)"
  }

  # 4. Write install-relative .bat helpers using strictly %~dp0runtime\node.exe (never E:\... or system node)
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

  # 5. Write provenance & honest Windows install README (zero secrets)
  $prov = @{
    app = "XPIDER AutoForm Sender Pro"
    packageVersion = "7.1.0"
    manifestVersion = $mf.version
    pinnedExtensionId = "ldlijlaccfeelfdhgnjbibniocefckjj"
    commitFull = $gitFull
    commitShort = $gitShort
    bundledNodeVersion = $nodeVer
    signingStatus = "UNSIGNED"
    builtAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText((Join-Path $stageDir "RELEASE_PROVENANCE.json"), $prov + "`n", (New-Object System.Text.UTF8Encoding $false))

  $readme = @"
XPIDER AutoForm Sender Pro v7.1.0 — Windows 10/11 x64 Universal Package (UNSIGNED)
==================================================================================
Commit: $gitShort ($gitFull)
Bundled Node.js Runtime: $nodeVer (runtime\node.exe — no pre-installed Node.js required)
Pinned Extension ID: ldlijlaccfeelfdhgnjbibniocefckjj
Code Signing Status: UNSIGNED (no code-signing certificate bundled)

1. INSTALL & BROWSER ACTIVATION (NO SECURE PREFERENCES TAMPERING)
   - Run XPIDER_V7.1.0_SETUP_${gitShort}.exe (per-user install to %LOCALAPPDATA%\XPIDER\App, zero admin required).
   - Native Messaging Hosts (com.xpider.email_sidecar & com.xpider.privacy_relay) are registered in HKCU
     pointing to %LOCALAPPDATA%\XPIDER\App\runtime\node.exe.
   - Open chrome://extensions or edge://extensions -> enable Developer Mode -> click "Load unpacked" ->
     select %LOCALAPPDATA%\XPIDER\App\extension (pinned ID ldlijlaccfeelfdhgnjbibniocefckjj preserved).
   - When upgrading from V7.0, do NOT delete the existing extension; load the new folder directly to retain ID/data.

2. DURABLE DATA & NEW PC DPAPI RE-PROVISIONING
   - Durable user data (consent ledger, suppression list, outbox, campaign history, DPAPI secrets) lives in
     %LOCALAPPDATA%\XPIDER\Sidecar and is preserved across upgrades and uninstalls (--retain-data default).
   - Because secrets are encrypted with Windows DPAPI (CurrentUser scope), a new PC cannot decrypt another PC's
     DPAPI vault; re-enter Resend API key / Google OAuth Client ID and re-authorize Gmail accounts on a new PC.

3. GMAIL SENDER COMPLIANCE NOTICE
   - Uses official Google OAuth 2.0 PKCE flow with minimum mail scope (gmail.send).
   - GMAIL_API_ACCEPTED means Google API accepted the request — NOT delivered, inbox, or opened.
   - Per-account and aggregate domain rolling-24h caps + 401/403/429 errors PAUSE the entire campaign;
     XPIDER never hops accounts to bypass limits or provider restrictions.
"@
  [System.IO.File]::WriteAllText((Join-Path $stageDir "README_INSTALL_WINDOWS.txt"), $readme, (New-Object System.Text.UTF8Encoding $false))

  # 6. Strict leak & path audit across all staged text files BEFORE zipping/compiling!
  Write-Output "[AUDIT] Scanning staged payload for hardcoded workspace paths and secrets..."
  $scanFiles = Get-ChildItem $stageDir -Recurse -File | Where-Object { $_.Extension -in @(".js",".json",".html",".css",".bat",".txt",".md") -and $_.FullName -notmatch "node_modules" }
  foreach ($f in $scanFiles) {
    $txt = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $txt) { continue }
    if ($txt -match 'E:\\vivpr\\ai\\extension-form-sender|E:/vivpr/ai/extension-form-sender') {
      throw "HARDCODED_WORKSPACE_PATH_DETECTED: $($f.FullName)"
    }
    if ($txt -cmatch '\bre_[A-Za-z0-9_]{16,}|\bwhsec_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{24,}|ya29\.[A-Za-z0-9._-]{16,}|GOCSPX-[A-Za-z0-9_-]{16,}') {
      throw "SECRET_DETECTED_IN_PAYLOAD: $($f.FullName)"
    }
  }
  Write-Output "[AUDIT] PAYLOAD_CLEAN (0 workspace paths, 0 secrets)"

  # 7. Create portable ZIP & embedded payload ZIP
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $portableZip = Join-Path $OutDir "XPIDER_V7.1.0_PORTABLE_${gitShort}.zip"
  $payloadZip = Join-Path $stageDir "XPIDER_PAYLOAD.zip"
  if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stageDir, $portableZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  Copy-Item $portableZip $payloadZip -Force

  # 8. Compile native Windows self-extracting installer EXE via .NET Framework csc.exe (UNSIGNED)
  $setupExe = Join-Path $OutDir "XPIDER_V7.1.0_SETUP_${gitShort}.exe"
  if (Test-Path $setupExe) { Remove-Item $setupExe -Force }
  $csSource = Join-Path $repoRoot "installer\XpiderSetup.cs"
  Write-Output "[COMPILE] Building $setupExe (UNSIGNED, embedding XPIDER_PAYLOAD.zip)..."
  & $csc /nologo /target:winexe /platform:x64 /optimize+ `
    /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
    /res:"$payloadZip,XPIDER_PAYLOAD.zip" `
    /out:"$setupExe" `
    "$csSource"
  if ($LASTEXITCODE -ne 0) { throw "CSC_COMPILE_FAILED (exit=$LASTEXITCODE)" }

  $exeInfo = Get-Item $setupExe
  $exeSha = (Get-FileHash $setupExe -Algorithm SHA256).Hash.ToLowerInvariant()
  $zipInfo = Get-Item $portableZip
  $zipSha = (Get-FileHash $portableZip -Algorithm SHA256).Hash.ToLowerInvariant()

  $shaTxt = @"
$exeSha  XPIDER_V7.1.0_SETUP_${gitShort}.exe
$zipSha  XPIDER_V7.1.0_PORTABLE_${gitShort}.zip
"@
  [System.IO.File]::WriteAllText((Join-Path $OutDir "XPIDER_V7.1.0_${gitShort}.sha256.txt"), $shaTxt, (New-Object System.Text.UTF8Encoding $false))

  Write-Output "SETUP_EXE=$setupExe"
  Write-Output "SETUP_EXE_BYTES=$($exeInfo.Length)"
  Write-Output "SETUP_EXE_SHA256=$exeSha"
  Write-Output "PORTABLE_ZIP=$portableZip"
  Write-Output "PORTABLE_ZIP_BYTES=$($zipInfo.Length)"
  Write-Output "PORTABLE_ZIP_SHA256=$zipSha"
  Write-Output "SIGNING_STATUS=UNSIGNED"
  Write-Output "BUNDLED_NODE_VERSION=$nodeVer"
} finally {
  if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir -ErrorAction SilentlyContinue }
}
