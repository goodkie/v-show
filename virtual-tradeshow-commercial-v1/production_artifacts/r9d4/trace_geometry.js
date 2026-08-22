const fs = require('fs');
const path = require('path');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientDir = path.join(root, 'app_build', 'client');
const artifactsDir = path.join(root, 'production_artifacts', 'r9d4');
fs.mkdirSync(artifactsDir, { recursive: true });

const patterns = [
  'BoxGeometry', 'PlaneGeometry', 'CylinderGeometry', 'GridHelper',
  'createBooth', 'createScene', 'placeholder', 'demoGeometry', 'showroom', 'buildWiloShowroomStage'
];

const results = [];
const files = fs.readdirSync(clientDir).filter(f => /\.(html|js)$/i.test(f));

files.forEach(file => {
  const fullPath = path.join(clientDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    patterns.forEach(pat => {
      if (line.includes(pat)) {
        results.push({
          file: file,
          lineNum: idx + 1,
          pattern: pat,
          line: line.trim()
        });
      }
    });
  });
});

let traceText = '01_PLACEHOLDER_GEOMETRY_TRACE.txt\n';
traceText += 'Generated: ' + new Date().toISOString() + '\n\n';
traceText += `Found ${results.length} geometry / placeholder references in client code:\n\n`;

results.forEach(r => {
  traceText += `[${r.file}:${r.lineNum}] (${r.pattern}) ${r.line}\n`;
});

traceText += '\n============================================================\n';
traceText += 'IDENTIFIED PLACEHOLDER FUNCTION:\n';
traceText += 'PLACEHOLDER_SCENE_FUNCTION=buildWiloShowroomStage\n';
traceText += 'LOCATION=app_build/client/wilo-demo.html:569-615\n';
traceText += 'RESPONSIBLE GEOMETRY: floor PlaneGeometry, GridHelper, backWall BoxGeometry, screen PlaneGeometry, counter CylinderGeometry, table BoxGeometry, truss TorusGeometry\n';
traceText += 'ACTION: Complete removal of placeholder meshes when authentic Gaussian 3D model is pending.\n';

fs.writeFileSync(path.join(artifactsDir, '01_PLACEHOLDER_GEOMETRY_TRACE.txt'), traceText);
console.log('Trace file written. Found', results.length, 'matches.');
console.log('PLACEHOLDER_SCENE_FUNCTION=buildWiloShowroomStage');
