const fs = require('fs');
const p = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/scripts/run_c11_11_p0_r1_acceptance.js';
let code = fs.readFileSync(p, 'utf8');

code = code.replace(
  `  const fileInput = await page.$('#booth-file-input');
  await fileInput.uploadFile(sampleImagePath);
  await wait(400);`,
  `  const fileInput = await page.$('#booth-file-input');
  await fileInput.uploadFile(sampleImagePath);
  await page.evaluate(() => {
    const inp = document.getElementById('booth-file-input');
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(400);`
);

fs.writeFileSync(p, code, 'utf8');
console.log('Fixed file input change event trigger in run_c11_11_p0_r1_acceptance.js');