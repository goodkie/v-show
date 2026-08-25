const fs = require('fs');
const files = fs.readdirSync('E:/vivpr/ai/v-show/sample2');
files.forEach(f => {
  if (f.startsWith('ChatGPT Image')) {
    console.log(f, fs.statSync('E:/vivpr/ai/v-show/sample2/' + f).size);
  }
});
