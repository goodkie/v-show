@echo off
REM XPIDER AutoForm Sender Pro — Anonymized Log & Evidence Collector
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {
  $out = 'diagnostic_bundle_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.zip';
  $tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ('xpider_diag_' + [Guid]::NewGuid().ToString('N')));
  if (Test-Path 'evidence') { Copy-Item -Path 'evidence' -Destination $tmp -Recurse -Force; }
  if (Test-Path 'companion\privacy_relay.log') {
    $log = Get-Content 'companion\privacy_relay.log' | ForEach-Object {
      $_ -replace '([0-9]{1,3}\.){3}[0-9]{1,3}', 'REDACTED_IP' -replace 'Bearer\s+\S+', 'Bearer REDACTED_TOKEN'
    };
    $log | Set-Content (Join-Path $tmp 'privacy_relay_anonymized.log');
  }
  Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $out -Force;
  Remove-Item -Path $tmp -Recurse -Force;
  Write-Host '====================================================';
  Write-Host ('Diagnostic logs collected (anonymized): ' + $out);
  Write-Host '====================================================';
}"
pause
