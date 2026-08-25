const { execSync } = require('child_process');
const fs = require('fs');

let html = execSync('git show a1ecad9:virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html', { encoding: 'utf8' });

// 1. HTML 영역 수정
// 1-1. drawer-media-tabs 제거
html = html.replace(/<!-- Media Mode Switcher Tabs -->[\s\S]*?<\/div>\s*<!-- High-Res Product Hero Photo & 360 3D Mini View -->/m, '<!-- High-Res Product Hero Photo -->');

// 1-2. drawer-3d-view 제거 (drw-img-box 내부는 <img id="drw-img" ...> 만 남김)
html = html.replace(/<div id="drawer-3d-view">[\s\S]*?<!-- \/drawer-3d-view -->/m, '');
html = html.replace(/<div id="drawer-3d-view">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/m, '</div>');

// 1-3. 3D Showroom 버튼 제거
html = html.replace(/<a href="\/demo\.html"[\s\S]*?Open in Virtual 3D Showroom →[\s\S]*?<\/a>\s*/m, '');

// 2. JS 영역 수정 (<script> 태그 안)
const scriptTagIdx = html.lastIndexOf('<script>');
let beforeScript = html.substring(0, scriptTagIdx);
let scriptContent = html.substring(scriptTagIdx);

// 2-1. initDrawer3D() 호출 제거
scriptContent = scriptContent.replace(/[ \t]*initDrawer3D\(\);\r?\n/g, "");

// 2-2. 3D 변수 선언 제거
scriptContent = scriptContent.replace(/let drawer3dScene, drawer3dCamera, drawer3dRenderer, drawer3dControls;\r?\n/g, "");
scriptContent = scriptContent.replace(/let drawer3dModelGroup = null;\r?\n/g, "");
scriptContent = scriptContent.replace(/let drawer3dAutoRotate = true;\r?\n/g, "");
scriptContent = scriptContent.replace(/let drawer3dWireframe = false;\r?\n/g, "");
scriptContent = scriptContent.replace(/let currentMediaMode = 'photo';[^\n]*\r?\n/g, "");

// 2-3. initDrawer3D 함수부터 openProductDrawer 직전까지 제거
const initDrawerStart = scriptContent.indexOf('function initDrawer3D()');
const openDrawerStart = scriptContent.indexOf('function openProductDrawer(idx)');
if (initDrawerStart !== -1 && openDrawerStart !== -1) {
  scriptContent = scriptContent.substring(0, initDrawerStart) + scriptContent.substring(openDrawerStart);
  console.log('✅ JS 3D functions cleanly removed from script');
}

// 2-4. openProductDrawer 내 3D 분기 제거
scriptContent = scriptContent.replace(/[ \t]*\/\/ Update 3D model if already in 3D mode\r?\n[ \t]*if \(currentMediaMode === '3d'\) \{[\s\S]*?\}\r?\n/, "");

html = beforeScript + scriptContent;

// 3. CSS 정리
html = html.replace(/\/\* MINI 3D TURNTABLE CONTAINER \*\/[\s\S]*?\.mini-3d-pill:hover \{ background: var\(--cyan\); color: #000; \}\r?\n/m, "");
html = html.replace(/\.drawer-media-tabs\s*\{[\s\S]*?\}\r?\n/m, "");
html = html.replace(/\.drawer-media-tab\s*\{[\s\S]*?\}\r?\n/m, "");
html = html.replace(/\.drawer-media-tab\.active\s*\{[\s\S]*?\}\r?\n/m, "");
html = html.replace(/\.drawer-media-tab:hover\s*\{[\s\S]*?\}\r?\n/m, "");

fs.writeFileSync('app_build/client/demo-matterport.html', html, 'utf8');
console.log('Saved demo-matterport.html, size:', html.length);
