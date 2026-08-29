Add-Type -AssemblyName System.Drawing

function Resize-Panorama {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [int]$Width = 4096,
        [int]$Height = 2048,
        [long]$Quality = 85
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

    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($DestinationPath)) | Out-Null
    $destBmp.Save($DestinationPath, $codec, $encoderParams)

    $graphics.Dispose()
    $destBmp.Dispose()
    $srcImg.Dispose()

    $newSize = (Get-Item $DestinationPath).Length / 1KB
    Write-Host "✅ Created: $DestinationPath ($([math]::Round($newSize, 1)) KB)"
}

$base = "E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build\client\assets\demo"

Resize-Panorama -SourcePath "$base\vantelle-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\vantelle-showcase\pano360\node0_360_panorama_4k_opt.jpg" -Quality 85
Resize-Panorama -SourcePath "$base\lumiere-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\lumiere-showcase\pano360\node0_360_panorama_4k_opt.jpg" -Quality 85
Resize-Panorama -SourcePath "$base\furniture-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\furniture-showcase\pano360\node0_360_panorama_4k_opt.jpg" -Quality 85
Resize-Panorama -SourcePath "$base\dna-showcase\pano360\node0_360_panorama_8k.jpg" -DestinationPath "$base\dna-showcase\pano360\node0_360_panorama_4k_opt.jpg" -Quality 85
