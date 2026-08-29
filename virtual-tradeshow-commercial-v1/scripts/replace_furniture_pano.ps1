Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8\.user_uploaded\media_1787945744361.jpg"
$baseDir = "E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1"
$furniturePanoDir = "$baseDir\app_build\client\assets\demo\furniture-showcase\pano360"

# 1. 8K 원본 자리에 복사
Copy-Item $srcPath "$furniturePanoDir\node0_360_panorama_8k.jpg" -Force

# 2. 4K 최적화 및 Preview 생성
function Save-Resized-Jpeg {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [int]$Width,
        [int]$Height,
        [long]$Quality = 90
    )

    $srcImg = [System.Drawing.Image]::FromFile($SourcePath)
    $destBmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $destBmp.SetResolution($srcImg.HorizontalResolution, $srcImg.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destBmp)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $graphics.DrawImage($srcImg, 0, 0, $Width, $Height)

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $Quality)

    $destBmp.Save($DestinationPath, $codec, $encoderParams)

    $graphics.Dispose()
    $destBmp.Dispose()
    $srcImg.Dispose()
}

Save-Resized-Jpeg -SourcePath $srcPath -DestinationPath "$furniturePanoDir\node0_360_panorama_4k_opt.jpg" -Width 2048 -Height 1024 -Quality 90
Save-Resized-Jpeg -SourcePath $srcPath -DestinationPath "$furniturePanoDir\node0_preview.jpg" -Width 512 -Height 256 -Quality 80

Write-Host "✅ Replaced furniture-showcase panorama assets with uploaded image!"
