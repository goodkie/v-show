const { execSync } = require('child_process');
const fs = require('fs');

let orig = execSync('git show a1ecad9:virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html', { encoding: 'utf8' });
let lines = orig.split('\n');

// 1. Line 630-665 주변: drawer-media-tabs 와 drawer-3d-view 제거
let newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  // Media tabs 제거 (630~637행 근처)
  if (line.includes('<!-- Media Mode Switcher Tabs -->')) {
    skip = true;
    continue;
  }
  if (skip && line.includes('<!-- High-Res Product Hero Photo & 360 3D Mini View -->')) {
    skip = false;
    newLines.push('      <!-- High-Res Product Hero Photo -->');
    continue;
  }

  // drawer-3d-view 제거 (641~664행 근처)
  if (line.includes('<div id="drawer-3d-view">')) {
    skip = true;
    continue;
  }
  if (skip && line.includes('<div class="drawer-hero">')) {
    skip = false;
    newLines.push('      </div>'); // drw-img-box 닫기
    newLines.push('');
    newLines.push(line);
    continue;
  }

  // 3D Showroom 링크 버튼 제거
  if (line.includes('Open in Virtual 3D Showroom')) {
    // 이전 줄 a태그와 다음줄 /a 태그 스킵
    if (newLines[newLines.length - 1] && newLines[newLines.length - 1].includes('<a href="/demo.html"')) {
      newLines.pop();
    }
    if (lines[i+1] && lines[i+1].includes('</a>')) {
      i++;
    }
    continue;
  }

  // initDrawer3D(); 호출 라인 제거
  if (line.trim() === 'initDrawer3D();') {
    continue;
  }

  // 3D 변수 선언 및 3D 함수 블록 제거 (line 1110 ~ openProductDrawer 직전)
  if (line.includes('// 10. PRODUCT INSPECTION DRAWER (WITH HIGH-RES HERO IMAGE & 360° 3D MINI PLAYER)')) {
    newLines.push('// 10. PRODUCT INSPECTION DRAWER');
    skip = true;
    continue;
  }
  if (skip && line.includes('function openProductDrawer(idx) {')) {
    skip = false;
    newLines.push(line);
    continue;
  }

  // openProductDrawer 내부 3D 분기 제거
  if (line.includes("// Update 3D model if already in 3D mode")) {
    // 3줄 스킵
    i += 2;
    continue;
  }

  if (!skip) {
    newLines.push(line);
  }
}

let result = newLines.join('\n');

// CSS 블록 제거
result = result.replace(/\/\* MINI 3D TURNTABLE CONTAINER \*\/[\s\S]*?\.mini-3d-pill:hover \{ background: var\(--cyan\); color: #000; \}\r?\n/m, "");
result = result.replace(/\.drawer-media-tabs\s*\{[\s\S]*?\}\r?\n/m, "");
result = result.replace(/\.drawer-media-tab\s*\{[\s\S]*?\}\r?\n/m, "");
result = result.replace(/\.drawer-media-tab\.active\s*\{[\s\S]*?\}\r?\n/m, "");
result = result.replace(/\.drawer-media-tab:hover\s*\{[\s\S]*?\}\r?\n/m, "");

fs.writeFileSync('app_build/client/demo-matterport.html', result, 'utf8');
console.log('✅ Rebuilt demo-matterport.html successfully, lines:', newLines.length, 'bytes:', result.length);
