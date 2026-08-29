Add-Type -AssemblyName System.Drawing

function Optimize-Image {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [int]$MaxWidth = 600,
        [int]$MaxHeight = 600,
        [long]$Quality = 85
    )

    if (-not (Test-Path $SourcePath)) { return }
    $srcImg = [System.Drawing.Image]::FromFile($SourcePath)

    $ratioX = $MaxWidth / $srcImg.Width
    $ratioY = $MaxHeight / $srcImg.Height
    $ratio = [Math]::Min(1.0, [Math]::Min($ratioX, $ratioY))

    $newWidth = [Math]::Max(1, [int]($srcImg.Width * $ratio))
    $newHeight = [Math]::Max(1, [int]($srcImg.Height * $ratio))

    $destBmp = New-Object System.Drawing.Bitmap($newWidth, $newHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $destBmp.SetResolution($srcImg.HorizontalResolution, $srcImg.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destBmp)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $graphics.DrawImage($srcImg, 0, 0, $newWidth, $newHeight)

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $Quality)

    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($DestinationPath)) | Out-Null
    $destBmp.Save($DestinationPath, $codec, $encoderParams)

    $graphics.Dispose()
    $destBmp.Dispose()
    $srcImg.Dispose()
}

$base = "E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build\client\assets\demo"

$productDirs = @(
    "$base\vantelle-showcase\products",
    "$base\lumiere-showcase\products",
    "$base\furniture-showcase\products",
    "$base\dna-showcase\products"
)

foreach ($dir in $productDirs) {
    if (Test-Path $dir) {
        Get-ChildItem $dir -File | Where-Object { $_.Extension -match '\.(jpg|jpeg|png|webp)' -and $_.Name -notlike "*_opt*" } | ForEach-Object {
            $dest = Join-Path $_.DirectoryName ($_.BaseName + "_opt.jpg")
            Optimize-Image -SourcePath $_.FullName -DestinationPath $dest -MaxWidth 600 -MaxHeight 600 -Quality 85
            $origKb = [math]::Round($_.Length / 1KB, 1)
            $newKb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
            Write-Host "Optimized product: $($_.Name) ($origKb KB -> $newKb KB)"
        }
    }
}
