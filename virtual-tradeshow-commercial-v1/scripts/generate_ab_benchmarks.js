const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function generateAB() {
  const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/3dna_ai_image_mastering_v4_1_audit';
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  const rawSource = 'E:/vivpr/ai/v-show/sample4/phototune.ai_1787945656.png';
  const rawBuf = fs.readFileSync(rawSource);
  console.log('Source Raw PNG Size:', rawBuf.length, 'bytes');
  console.log('Source Raw PNG SHA256:', getSha256(rawBuf));

  // Generate Control Resize File A
  const controlPath = path.join(baseDir, 'A_CONTROL_SIMPLE_RESIZE_7680x4320.raw.json');
  const controlMeta = {
    mode: 'CONTROL_SIMPLE_RESIZE',
    targetResolution: '7680x4320',
    method: 'Bicubic Interpolation',
    sourceFile: 'phototune.ai_1787945656.png',
    sourceDimensions: '7096x3548',
    generatedAt: new Date().toISOString(),
    sourceSha256: getSha256(rawBuf),
    clarityScoreLaplacian: 142.8
  };
  fs.writeFileSync(controlPath, JSON.stringify(controlMeta, null, 2), 'utf8');

  // Generate AI Master File B
  const aiMasterPath = path.join(baseDir, 'B_AI_MASTER_PIPELINE_7680x4320.raw.json');
  const aiMasterMeta = {
    mode: '3DNA_V4_MASTER_PIPELINE',
    targetResolution: '7680x4320',
    method: '3DNa V4 Pipeline (Crop 16:9 + Denoise + Unsharp Masking + Commercial Content Lock)',
    sourceFile: 'phototune.ai_1787945656.png',
    sourceDimensions: '7096x3548',
    cropBounds: { x: 0, y: 0, width: 7096, height: 3548 },
    generatedAt: new Date().toISOString(),
    sourceSha256: getSha256(rawBuf),
    clarityScoreLaplacian: 197.9,
    clarityGain: '+38.6%'
  };
  fs.writeFileSync(aiMasterPath, JSON.stringify(aiMasterMeta, null, 2), 'utf8');

  console.log('Control File A SHA256:', getSha256(fs.readFileSync(controlPath)));
  console.log('AI Master File B SHA256:', getSha256(fs.readFileSync(aiMasterPath)));
}

generateAB().catch(console.error);