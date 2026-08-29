Add-Type -AssemblyName System.Drawing

function Enhance-8K-Panorama {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [int]$TargetWidth = 8192,
        [int]$TargetHeight = 4096,
        [long]$Quality = 92
    )

    if (-not (Test-Path $SourcePath)) { 
        Write-Warning "File not found: $SourcePath"
        return 
    }

    $srcImg = [System.Drawing.Image]::FromFile($SourcePath)
    $destBmp = New-Object System.Drawing.Bitmap($TargetWidth, $TargetHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $destBmp.SetResolution(300, 300)

    $graphics = [System.Drawing.Graphics]::FromImage($destBmp)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # ImageAttributes for contrast & sharpness boost
    $imageAttr = New-Object System.Drawing.Imaging.ImageAttributes
    
    # Color matrix to boost contrast by 8% and vibrance slightly
    # Contrast = c, t = (1-c)/2 -> c = 1.08, t = -0.04
    $c = 1.07
    $t = (1.0 - $c) / 2.0
    $cm = New-Object System.Drawing.Imaging.ColorMatrix
    $cm.Matrix00 = $c; $cm.Matrix01 = 0; $cm.Matrix02 = 0; $cm.Matrix03 = 0; $cm.Matrix04 = 0
    $cm.Matrix10 = 0; $cm.Matrix11 = $c; $cm.Matrix12 = 0; $cm.Matrix13 = 0; $cm.Matrix14 = 0
    $cm.Matrix20 = 0; $cm.Matrix21 = 0; $cm.Matrix22 = $c; $cm.Matrix23 = 0; $cm.Matrix24 = 0
    $cm.Matrix30 = 0; $cm.Matrix31 = 0; $cm.Matrix32 = 0; $cm.Matrix33 = 1; $cm.Matrix34 = 0
    $cm.Matrix40 = $t; $cm.Matrix41 = $t; $cm.Matrix42 = $t; $cm.Matrix43 = 0; $cm.Matrix44 = 1

    $imageAttr.SetColorMatrix($cm, [System.Drawing.Imaging.ColorMatrixFlag]::Default, [System.Drawing.Imaging.ColorAdjustType]::Bitmap)

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $TargetWidth, $TargetHeight)
    $graphics.DrawImage($srcImg, $destRect, 0, 0, $srcImg.Width, $srcImg.Height, [System.Drawing.GraphicsUnit]::Pixel, $imageAttr)

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $Quality)

    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($DestinationPath)) | Out-Null
    $destBmp.Save($DestinationPath, $codec, $encoderParams)

    $graphics.Dispose()
    $destBmp.Dispose()
    $srcImg.Dispose()
    $imageAttr.Dispose()

    $newMb = [math]::Round((Get-Item $DestinationPath).Length / 1MB, 2)
    Write-Host "✅ 8K Ultra Master: $DestinationPath ($TargetWidth x $TargetHeight, $newMb MB)"
}

$base = "E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build\client\assets\demo"

Enhance-8K-Panorama -SourcePath "$base\vantelle-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\vantelle-showcase\pano360\node0_360_panorama_ultra8k.jpg" -TargetWidth 8192 -TargetHeight 4096 -Quality 90
Enhance-8K-Panorama -SourcePath "$base\lumiere-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\lumiere-showcase\pano360\node0_360_panorama_ultra8k.jpg" -TargetWidth 8192 -TargetHeight 4096 -Quality 90
Enhance-8K-Panorama -SourcePath "$base\furniture-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\furniture-showcase\pano360\node0_360_panorama_ultra8k.jpg" -TargetWidth 8192 -TargetHeight 4096 -Quality 90
Enhance-8K-Panorama -SourcePath "$base\dna-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\dna-showcase\pano360\node0_360_panorama_ultra8k.jpg" -TargetWidth 8192 -TargetHeight 4096 -Quality 90
