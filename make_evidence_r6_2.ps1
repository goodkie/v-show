$files = @(
    "test_form_recognition_autofill_bridge_r6_2.log",
    "send_message_backup\content-script.js",
    "send_message_backup\background.js",
    "send_message_backup\modules\form-discovery-engine-r2.js",
    "send_message_backup\modules\final-form-completion-engine.js",
    "send_message_backup\modules\contact-discovery-engine.js",
    "send_message_backup\modules\checkbox-resolver-r2.js",
    "send_message_backup\modules\select-resolver-r2.js",
    "send_message_backup\modules\contact-gate.js",
    "send_message_backup\test_form_recognition_autofill_bridge_r6_2.js"
)
$dest = "evidence_r6_2_form_recognition_autofill_bridge.zip"
if (Test-Path $dest) {
    Remove-Item $dest -Force
}
Compress-Archive -Path $files -DestinationPath $dest -Force
$hash = (Get-FileHash -Path $dest -Algorithm SHA256).Hash
$size = (Get-Item $dest).Length
Write-Host "ZIP: $dest"
Write-Host "SHA256: $hash"
Write-Host "SIZE: $size"
