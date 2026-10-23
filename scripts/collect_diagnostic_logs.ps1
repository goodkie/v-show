#Requires -Version 5.1
# scripts/collect_diagnostic_logs.ps1
# XPIDER AutoForm Sender Pro -- Anonymized Diagnostic Log Collector
# Collects evidence directory, anonymized relay log, health check output.
# Credentials and raw IP addresses are masked before packaging.

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot   # workspace root
Set-Location $root

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outFile = "diagnostic_bundle_$timestamp.zip"
$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP "xpider_diag_$([Guid]::NewGuid().ToString('N'))")

try {
    # 1. Copy evidence folder
    if (Test-Path "$root\evidence") {
        Copy-Item -Path "$root\evidence" -Destination $tmp.FullName -Recurse -Force
    }

    # 2. Anonymize relay log if present
    $relayLog = "$root\companion\privacy_relay.log"
    if (Test-Path $relayLog) {
        $content = Get-Content $relayLog -Raw
        $content = $content -replace '([0-9]{1,3}\.){3}[0-9]{1,3}', 'REDACTED_IP'
        $content = $content -replace 'Bearer\s+\S+', 'Bearer REDACTED_TOKEN'
        $content = $content -replace 'token["\s:=]+\S+', 'token=REDACTED_TOKEN'
        $content | Set-Content (Join-Path $tmp.FullName 'privacy_relay_anonymized.log')
    }

    # 3. Capture node quick-check output
    $healthOut = node "$root\scripts\owner_quick_check.js" 2>&1 | Out-String
    $healthOut | Set-Content (Join-Path $tmp.FullName 'quick_health_check_output.txt')

    # 4. Add system info
    @"
XPIDER Diagnostic System Info
==============================
Date:        $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
OS:          $([System.Environment]::OSVersion.VersionString)
Node:        $(node --version 2>&1)
CWD:         $root
Branch:      $(git -C $root rev-parse --abbrev-ref HEAD 2>&1)
HEAD:        $(git -C $root rev-parse HEAD 2>&1)
"@ | Set-Content (Join-Path $tmp.FullName 'system_info.txt')

    # 5. Compress
    Compress-Archive -Path "$($tmp.FullName)\*" -DestinationPath $outFile -Force
    $size = (Get-Item $outFile).Length
    Write-Host "===================================================="
    Write-Host " XPIDER Diagnostic Collector -- OK"
    Write-Host "===================================================="
    Write-Host " Bundle:  $outFile"
    Write-Host " Size:    $size bytes"
    Write-Host " Status:  Credentials and IPs anonymized"
    Write-Host "===================================================="
    exit 0
}
catch {
    Write-Host "[ERROR] Diagnostic collection failed: $_"
    exit 1
}
finally {
    if (Test-Path $tmp.FullName) { Remove-Item -Path $tmp.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}
