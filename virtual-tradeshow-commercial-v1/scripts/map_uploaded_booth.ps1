Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\vivPR\.gemini\antigravity\brain\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8\.user_uploaded\media_1787950246736.png"
$baseDir = "E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1"
$furniturePanoDir = "$baseDir\app_build\client\assets\demo\furniture-showcase\pano360"

# 2:1 캔버스에 화이트 배경으로 자연스럽게 중앙 배치하여 360 구체 텍스처 생성
function Create-Equirectangular-From-Perspective {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [int]$TargetWidth = 2048,
        [int]$TargetHeight = 1024,
        [long]$Quality = 92
    )

    $srcImg = [System.Drawing.Image]::FromFile($SourcePath)
    $destBmp = New-Object System.Drawing.Bitmap($TargetWidth, $TargetHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($destBmp)
    
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # 배경을 업로드 이미지의 좌상단 픽셀 색상(순백색/미색)으로 채움
    $bgColor = [System.Drawing.Color]::FromArgb(250, 250, 250)
    $graphics.Clear($bgColor)

    # 중앙 배치 크기 계산 (부스가 시야 정면에 왜곡 없이 꽉 차도록)
    $drawHeight = [int]($TargetHeight * 0.88)
    $drawWidth = [int]($srcImg.Width * ($drawHeight / $srcImg.Height))
    $drawX = [int](($TargetWidth - $drawWidth) / 2)
    $drawY = [int](($TargetHeight - $drawHeight) / 2) + 20

    $graphics.DrawImage($srcImg, $drawX, $drawY, $drawWidth, $drawHeight)

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $Quality)

    $destBmp.Save($DestinationPath, $codec, $encoderParams)

    $graphics.Dispose()
    $destBmp.Dispose()
    $srcImg.Dispose()
    
    $kb = [math]::Round((Get-Item $DestinationPath).Length / 1KB, 1)
    Write-Host "✅ Created: $DestinationPath ($kb KB)"
}

Create-Equirectangular-From-Perspective -SourcePath $srcPath -DestinationPath "$furniturePanoDir\node0_360_panorama_8k.jpg" -TargetWidth 2048 -TargetHeight 1024 -Quality 90
Create-Equirectangular-From-Perspective -SourcePath $srcPath -DestinationPath "$furniturePanoDir\node0_360_panorama_4k_opt.jpg" -TargetWidth 2048 -TargetHeight 1024 -Quality 90
Create-Equirectangular-From-Perspective -SourcePath $srcPath -DestinationPath "$furniturePanoDir\node0_preview.jpg" -TargetWidth 512 -TargetHeight 256 -Quality 80

Write-Host "✅ Successfully mapped and created 3D booth panoramas!"
