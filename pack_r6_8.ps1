$files = @(
    "test_r6_8_remediation.log",
    "test_r6_7_regression.log",
    "test_2captcha_regression.log",
    "send_message_backup\modules\build-provenance.js",
    "send_message_backup\modules\contact-gate.js",
    "send_message_backup\modules\vision-submit-executor.js",
    "send_message_backup\modules\history-store.js",
    "send_message_backup\content-script.js",
    "send_message_backup\background.js",
    "send_message_backup\solver-content.js",
    "send_message_backup\popup.html",
    "send_message_backup\popup.js",
    "send_message_backup\test_owner_4h_runtime_remediation_r6_8.js",
    "send_message_backup\verify_owner_runtime_acceptance_r6_8.js",
    "evidence_owner_runtime_traces_r6_8.log",
    "send_message_backup\build\preserved_r6.7_pre_remediation_b8e1d03\checksums.json"
)

$zipName = "evidence_r6_8_owner_4h_log_remediation.zip"

if (Test-Path $zipName) {
    Remove-Item $zipName -Force
}

Compress-Archive -Path $files -DestinationPath $zipName -Force

$hash = (Get-FileHash -Path $zipName -Algorithm SHA256).Hash
$size = (Get-Item $zipName).Length

Write-Host "ZIP_CREATED"
Write-Host "FILE: $zipName"
Write-Host "SHA256: $hash"
Write-Host "SIZE: $size"
