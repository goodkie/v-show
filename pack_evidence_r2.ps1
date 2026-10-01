$files = @(
    "runtime_correctness_r2_all_tests.log",
    "send_message_backup\content-script.js",
    "send_message_backup\background.js",
    "send_message_backup\popup.js",
    "send_message_backup\modules\history-store.js",
    "send_message_backup\test_runtime_correctness_r2.js"
)

$targetZip = "evidence_runtime_correctness_r2.zip"

if (Test-Path $targetZip) {
    Remove-Item $targetZip -Force
}

Compress-Archive -Path $files -DestinationPath $targetZip -Force

$hash = (Get-FileHash -Path $targetZip -Algorithm SHA256).Hash
$size = (Get-Item $targetZip).Length

Write-Host "ZIP_CREATED: $targetZip"
Write-Host "SHA256: $hash"
Write-Host "SIZE: $size"
