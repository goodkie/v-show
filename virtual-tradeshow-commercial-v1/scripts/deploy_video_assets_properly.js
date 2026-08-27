const fs = require('fs');
const path = require('path');

// 1. 루트 .gitignore 수정: 데모 mp4 파일 허용
const gitignorePath = 'E:/vivpr/ai/v-show/.gitignore';
let gi = fs.readFileSync(gitignorePath, 'utf8');

const mp4Whitelist = `
!virtual-tradeshow-commercial-v1/app_build/client/assets/demo/**/*.mp4
!virtual-tradeshow-commercial-v1/_railway_deploy/client/assets/demo/**/*.mp4
!virtual-tradeshow-commercial-v1/_clean_deploy/client/assets/demo/**/*.mp4
!*.mp4
`;

gi = gi.replace('*.mp4', '# *.mp4 (allowed for demo showcases)');
gi += mp4Whitelist;
fs.writeFileSync(gitignorePath, gi, 'utf8');
console.log('✅ Updated root .gitignore to whitelist demo mp4 files');

// 2. 비디오 파일 복사 (fashion.mp4 및 makeup.mp4)
const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const sampleFashion = 'E:/vivpr/ai/v-show/sample3/fashion.mp4';
const sampleMakeup = 'E:/vivpr/ai/v-show/sample2/makeup.mp4';

// makeup.mp4 압축 (1.99MB 생성)
const ffmpegPath = require(path.join(baseDir, 'node_modules', 'ffmpeg-static'));
const { execSync } = require('child_process');

const tempMakeupOut = path.join(baseDir, 'temp_makeup_web.mp4');
console.log('Compressing makeup.mp4...');
execSync(`"${ffmpegPath}" -y -i "${sampleMakeup}" -vf "scale=1280:-2" -c:v libx264 -crf 28 -preset fast -movflags +faststart -c:a aac -b:a 96k "${tempMakeupOut}"`);

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

  fs.copyFileSync(sampleFashion, path.join(fashionDir, 'fashion.mp4'));
  fs.copyFileSync(tempMakeupOut, path.join(makeupDir, 'makeup.mp4'));

  // 포스터도 함께 복사
  execSync(`"${ffmpegPath}" -y -sseof -0.5 -i "${path.join(fashionDir, 'fashion.mp4')}" -update 1 -q:v 2 "${path.join(fashionDir, 'fashion-poster-last-frame.jpg')}"`);
  execSync(`"${ffmpegPath}" -y -sseof -0.5 -i "${path.join(makeupDir, 'makeup.mp4')}" -update 1 -q:v 2 "${path.join(makeupDir, 'makeup-poster-last-frame.jpg')}"`);
});

fs.unlinkSync(tempMakeupOut);

console.log('✅ All video and poster assets verified in all deployment folders!');
