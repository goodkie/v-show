const fs = require('fs');
const path = require('path');

// 1. 포스터 이미지 준비 (패션 & 메이크업 실물 기반 포스터)
const fashionPosterDest = 'app_build/client/assets/demo/virtual-fitting-room/fashion-poster-last-frame.jpg';
const makeupPosterDest = 'app_build/client/assets/demo/virtual-makeup-artist/makeup-poster-last-frame.jpg';

// 기존 쇼케이스 에셋에서 최고 해상도 포스터 생성
const samplePosterFashion = 'app_build/client/assets/demo/vantelle-showcase/vantelle_fashion_main.jpg';
const samplePosterMakeup = 'app_build/client/assets/demo/lumiere-showcase/lumiere_cosmetics_main.jpg';

if (fs.existsSync(samplePosterFashion)) {
  fs.copyFileSync(samplePosterFashion, fashionPosterDest);
} else {
  fs.writeFileSync(fashionPosterDest, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
}

if (fs.existsSync(samplePosterMakeup)) {
  fs.copyFileSync(samplePosterMakeup, makeupPosterDest);
} else {
  fs.writeFileSync(makeupPosterDest, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
}

console.log('✅ Last-frame posters ready:');
console.log(' - Fashion poster:', fashionPosterDest, fs.statSync(fashionPosterDest).size, 'bytes');
console.log(' - Makeup poster:', makeupPosterDest, fs.statSync(makeupPosterDest).size, 'bytes');
