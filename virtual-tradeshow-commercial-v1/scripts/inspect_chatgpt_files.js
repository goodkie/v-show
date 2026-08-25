const fs = require('fs');

// sample 폴더의 ChatGPT 이미지 3개의 실제 매핑 확인
// 03_32_21, 04_12_28, 02_46_31
console.log('Checking sample files...');
const files = fs.readdirSync('E:/vivpr/ai/v-show/sample');
files.forEach(f => {
  if (f.startsWith('ChatGPT Image')) {
    console.log(f, fs.statSync('E:/vivpr/ai/v-show/sample/' + f).size);
  }
});
