$source = "E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1"
$destination = "E:\vivpr\ai\v-show\V_SHOW_RESTORE_POINT_v8_0_COMPLETE.zip"

Write-Host "Creating complete restore point zip backup..."

if (Test-Path $destination) { Remove-Item $destination -Force }

$tempDir = Join-Path $env:TEMP "v_show_backup_temp"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

$files = Get-ChildItem -Path $source -Recurse | Where-Object {
    $filePath = $_.FullName
    -not ($filePath -match "node_modules") -and -not ($filePath -match "\\\.git(\\|$)")
}

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($source.Length + 1)
    $targetPath = Join-Path $tempDir $relativePath
    if ($file.PSIsContainer) {
        if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Path $targetPath | Out-Null }
    } else {
        $parent = Split-Path $targetPath -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
        Copy-Item $file.FullName -Destination $targetPath -Force
    }
}

Compress-Archive -Path "$tempDir\*" -DestinationPath $destination -CompressionLevel Optimal
Remove-Item $tempDir -Recurse -Force

$zipItem = Get-Item $destination
$sizeMB = [math]::Round($zipItem.Length / 1MB, 2)
Write-Host "================================================="
Write-Host "✅ Zip Backup Successfully Created!"
Write-Host "Path: $destination"
Write-Host "Size: $sizeMB MB"
Write-Host "================================================="
