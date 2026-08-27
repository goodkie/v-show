const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const ffmpegPath = require(path.join(baseDir, 'node_modules', 'ffmpeg-static'));

const sampleFashion = 'E:/vivpr/ai/v-show/sample3/fashion.mp4';
const sampleMakeup = 'E:/vivpr/ai/v-show/sample2/makeup.mp4';

// 1. fashion.mp4를 웹 초경량(H.264, 720p, faststart, ~2.5MB)으로 인코딩
const tempFashionOut = path.join(baseDir, 'temp_fashion_web.mp4');
console.log('Compressing fashion.mp4 to ultra-fast web derivative...');
execSync(`"${ffmpegPath}" -y -i "${sampleFashion}" -vf "scale=1280:-2" -c:v libx264 -crf 26 -preset fast -movflags +faststart -c:a aac -b:a 96k "${tempFashionOut}"`);

// 2. makeup.mp4를 웹 초경량(H.264, 720p, faststart, ~1.99MB)으로 인코딩
const tempMakeupOut = path.join(baseDir, 'temp_makeup_web.mp4');
console.log('Compressing makeup.mp4 to ultra-fast web derivative...');
execSync(`"${ffmpegPath}" -y -i "${sampleMakeup}" -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset fast -movflags +faststart -c:a aac -b:a 96k "${tempMakeupOut}"`);

console.log('Compressed fashion size:', (fs.statSync(tempFashionOut).size / (1024 * 1024)).toFixed(2), 'MB');
console.log('Compressed makeup size:', (fs.statSync(tempMakeupOut).size / (1024 * 1024)).toFixed(2), 'MB');

const targets = [
  path.join(baseDir, 'app_build'),
  path.join(baseDir, '_clean_deploy'),
  path.join(baseDir, '_railway_deploy')
];

targets.forEach(t => {
  const fashionDir = path.join(t, 'client', 'assets', 'demo', 'virtual-fitting-room');
  const makeupDir = path.join(t, 'client', 'assets', 'demo', 'virtual-makeup-artist');
  fs.mkdirSync(fashionDir, { recursive: true });
  fs.mkdirSync(makeupDir, { recursive: true });

  fs.copyFileSync(tempFashionOut, path.join(fashionDir, 'fashion.mp4'));
  fs.copyFileSync(tempMakeupOut, path.join(makeupDir, 'makeup.mp4'));

  // 포스터 추출
  execSync(`"${ffmpegPath}" -y -sseof -0.5 -i "${path.join(fashionDir, 'fashion.mp4')}" -update 1 -q:v 2 "${path.join(fashionDir, 'fashion-poster-last-frame.jpg')}"`);
  execSync(`"${ffmpegPath}" -y -sseof -0.5 -i "${path.join(makeupDir, 'makeup.mp4')}" -update 1 -q:v 2 "${path.join(makeupDir, 'makeup-poster-last-frame.jpg')}"`);
});

fs.unlinkSync(tempFashionOut);
fs.unlinkSync(tempMakeupOut);

// 3. _railway_deploy 내에 완벽한 .railwayignore 생성
const railwayIgnore = `
node_modules/
.git/
*.log
`;
fs.writeFileSync(path.join(baseDir, '_railway_deploy', '.railwayignore'), railwayIgnore.trim(), 'utf8');

console.log('✅ Both videos compressed and .railwayignore created!');
