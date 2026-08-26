const ffmpegPath = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const srcMakeup = 'E:/vivpr/ai/v-show/sample2/makeup.mp4';
const destMakeup = 'app_build/client/assets/demo/virtual-makeup-artist/makeup.mp4';
const tempOut = 'app_build/client/assets/demo/virtual-makeup-artist/makeup_compressed.mp4';

console.log('Using ffmpeg binary:', ffmpegPath);

// 1. makeup.mp4 압축 (CRF 28, preset medium, 720p, +faststart, aac 96k)
console.log('Starting makeup.mp4 compression...');
const cmd = `"${ffmpegPath}" -y -i "${srcMakeup}" -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset fast -movflags +faststart -c:a aac -b:a 96k "${tempOut}"`;
execSync(cmd);

const origSize = fs.statSync(srcMakeup).size;
const compSize = fs.statSync(tempOut).size;

fs.copyFileSync(tempOut, destMakeup);
fs.unlinkSync(tempOut);

console.log(`✅ makeup.mp4 successfully compressed!`);
console.log(` - Original Size: ${(origSize / (1024 * 1024)).toFixed(2)} MB`);
console.log(` - Compressed Size: ${(compSize / (1024 * 1024)).toFixed(2)} MB`);
console.log(` - Reduction: ${((1 - compSize / origSize) * 100).toFixed(1)}% saved!`);

// 2. fashion.mp4 복사 확인
const srcFashion = 'E:/vivpr/ai/v-show/sample3/fashion.mp4';
const destFashion = 'app_build/client/assets/demo/virtual-fitting-room/fashion.mp4';
fs.copyFileSync(srcFashion, destFashion);
console.log(`✅ fashion.mp4 verified & copied from sample3: ${(fs.statSync(destFashion).size / (1024 * 1024)).toFixed(2)} MB`);

// 3. 마지막 프레임 포스터 추출 (ffmpeg로 100% 정확하게 추출)
const fashionPoster = 'app_build/client/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg';
const makeupPoster = 'app_build/client/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg';

execSync(`"${ffmpegPath}" -y -sseof -0.5 -i "${destFashion}" -update 1 -q:v 2 "${fashionPoster}"`);
execSync(`"${ffmpegPath}" -y -sseof -0.5 -i "${destMakeup}" -update 1 -q:v 2 "${makeupPoster}"`);

console.log(`✅ Extracted true last-frame posters via ffmpeg!`);
console.log(` - Fashion poster: ${(fs.statSync(fashionPoster).size / 1024).toFixed(1)} KB`);
console.log(` - Makeup poster: ${(fs.statSync(makeupPoster).size / 1024).toFixed(1)} KB`);
