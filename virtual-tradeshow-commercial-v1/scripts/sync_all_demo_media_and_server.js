const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const appBuildClient = path.join(baseDir, 'app_build', 'client');
const cleanDeployClient = path.join(baseDir, '_clean_deploy', 'client');
const railwayDeployClient = path.join(baseDir, '_railway_deploy', 'client');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. app_build/client 전체를 _clean_deploy/client 및 _railway_deploy/client 로 완전 복사
console.log('Copying client directory to deploy targets...');
copyRecursive(appBuildClient, cleanDeployClient);
copyRecursive(appBuildClient, railwayDeployClient);

// 2. server/index.js 에 /assets 정적 서빙 확실히 보강
const serverIndexPath = path.join(baseDir, 'app_build', 'server', 'index.js');
let serverJs = fs.readFileSync(serverIndexPath, 'utf8');

if (!serverJs.includes("app.use('/assets', express.static")) {
  serverJs = serverJs.replace(
    "app.use(express.static(path.join(__dirname, '..', 'client')));",
    `app.use('/assets', express.static(path.join(__dirname, '..', 'client', 'assets')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use(express.static(path.join(__dirname, '..')));`
  );
  fs.writeFileSync(serverIndexPath, serverJs, 'utf8');
}

fs.copyFileSync(serverIndexPath, path.join(baseDir, '_clean_deploy', 'server', 'index.js'));
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_railway_deploy', 'server', 'index.js'));

console.log('✅ Synchronized all demo media and updated server static routing!');
