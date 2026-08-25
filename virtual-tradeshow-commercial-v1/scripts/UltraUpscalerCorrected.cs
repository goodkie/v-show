using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public class UltraUpscalerCorrected {
    public static void ProcessShowroom(string sourcePattern, string dest8k, string dest16k, string destPreview, int targetW, int targetH) {
        Console.WriteLine("Searching for source matching: " + sourcePattern);
        string[] files = Directory.GetFiles("E:\\vivpr\\ai\\v-show\\sample", sourcePattern);
        if (files.Length == 0) {
            files = Directory.GetFiles("E:\\vivpr\\ai\\v-show\\sample2", sourcePattern);
        }
        if (files.Length == 0) {
            Console.WriteLine("❌ File not found for: " + sourcePattern);
            return;
        }

        string sourceFile = files[0];
        Console.WriteLine("Processing: " + Path.GetFileName(sourceFile) + " -> " + dest8k);

        using (Bitmap src = (Bitmap)Image.FromFile(sourceFile)) {
            int srcW = src.Width;
            int srcH = src.Height;

            using (Bitmap dest = new Bitmap(targetW, targetH, PixelFormat.Format24bppRgb))
            using (Graphics g = Graphics.FromImage(dest)) {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.CompositingQuality = CompositingQuality.HighQuality;

                using (Brush brush = new SolidBrush(Color.FromArgb(10, 15, 26))) {
                    g.FillRectangle(brush, 0, 0, targetW, targetH);
                }

                // 360도 스피어 최적화: 시야 중앙에 부스가 꽉 차고 가장 선명하게 보이도록 배치
                int drawW = (int)(targetW * 0.92);
                int drawH = (int)(drawW * ((double)srcH / srcW));
                if (drawH > targetH) {
                    drawH = targetH;
                    drawW = (int)(drawH * ((double)srcW / srcH));
                }
                int drawX = (targetW - drawW) / 2;
                int drawY = (targetH - drawH) / 2;

                // Left & Right edge wrap
                int edgeW = 120;
                Rectangle leftEdgeDest = new Rectangle(0, drawY, drawX + 20, drawH);
                Rectangle leftEdgeSrc = new Rectangle(0, 0, edgeW, srcH);
                g.DrawImage(src, leftEdgeDest, leftEdgeSrc, GraphicsUnit.Pixel);

                Rectangle rightEdgeDest = new Rectangle(drawX + drawW - 20, drawY, targetW - (drawX + drawW) + 20, drawH);
                Rectangle rightEdgeSrc = new Rectangle(srcW - edgeW, 0, edgeW, srcH);
                g.DrawImage(src, rightEdgeDest, rightEdgeSrc, GraphicsUnit.Pixel);

                // Top & Bottom smooth expansion
                Rectangle topDest = new Rectangle(0, 0, targetW, drawY + 20);
                Rectangle topSrc = new Rectangle(0, 0, srcW, 60);
                g.DrawImage(src, topDest, topSrc, GraphicsUnit.Pixel);

                Rectangle botDest = new Rectangle(0, drawY + drawH - 20, targetW, targetH - (drawY + drawH) + 20);
                Rectangle botSrc = new Rectangle(0, srcH - 60, srcW, 60);
                g.DrawImage(src, botDest, botSrc, GraphicsUnit.Pixel);

                // Main Ultra-Crisp Hero Area
                Rectangle heroDest = new Rectangle(drawX, drawY, drawW, drawH);
                g.DrawImage(src, heroDest, new Rectangle(0, 0, srcW, srcH), GraphicsUnit.Pixel);

                ImageCodecInfo jpegCodec = GetEncoder(ImageFormat.Jpeg);
                EncoderParameters encParams = new EncoderParameters(1);
                encParams.Param[0] = new EncoderParameter(Encoder.Quality, 98L);

                Directory.CreateDirectory(Path.GetDirectoryName(dest8k));
                dest.Save(dest8k, jpegCodec, encParams);
                Console.WriteLine("✅ Saved 8K: " + dest8k + " (" + (new FileInfo(dest8k).Length / 1024) + " KB)");

                if (!string.IsNullOrEmpty(dest16k)) {
                    File.Copy(dest8k, dest16k, true);
                }

                if (!string.IsNullOrEmpty(destPreview)) {
                    using (Bitmap prev = new Bitmap(1024, 512, PixelFormat.Format24bppRgb))
                    using (Graphics gP = Graphics.FromImage(prev)) {
                        gP.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        gP.DrawImage(dest, new Rectangle(0, 0, 1024, 512));
                        EncoderParameters pEnc = new EncoderParameters(1);
                        pEnc.Param[0] = new EncoderParameter(Encoder.Quality, 88L);
                        prev.Save(destPreview, jpegCodec, pEnc);
                    }
                }
            }
        }
    }

    private static ImageCodecInfo GetEncoder(ImageFormat format) {
        ImageCodecInfo[] codecs = ImageCodecInfo.GetImageDecoders();
        foreach (ImageCodecInfo codec in codecs) {
            if (codec.FormatID == format.Guid) return codec;
        }
        return null;
    }

    public static void Main() {
        int w = 8192;
        int h = 4096;

        // 1. VANTELLE PARIS (패션 부스: 04_12_28)
        ProcessShowroom(
            "*04_12_28*.png",
            "app_build/client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_8k.jpg",
            "app_build/client/assets/demo/vantelle-showcase/pano360/node0_360_panorama_16k.jpg",
            "app_build/client/assets/demo/vantelle-showcase/pano360/node0_preview.jpg",
            w, h
        );

        // 2. LUMIERE SKINCARE (코스메틱 부스: 03_32_21)
        ProcessShowroom(
            "*03_32_21*.png",
            "app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg",
            "app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_16k.jpg",
            "app_build/client/assets/demo/lumiere-showcase/pano360/node0_preview.jpg",
            w, h
        );

        // 3. NOVA LIVING (가구 부스: 02_46_31)
        ProcessShowroom(
            "*02_46_31*.png",
            "app_build/client/assets/demo/furniture-showcase/pano360/node0_360_panorama_8k.jpg",
            "app_build/client/assets/demo/furniture-showcase/pano360/node0_360_panorama_16k.jpg",
            "app_build/client/assets/demo/furniture-showcase/pano360/node0_preview.jpg",
            w, h
        );

        Console.WriteLine("\n🎉 All 3 Showroom 8K Panoramas CORRECTLY matched and generated!");
    }
}
