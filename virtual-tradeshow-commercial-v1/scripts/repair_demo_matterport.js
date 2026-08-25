const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. git a1ecad9에서 깨끗한 demo-matterport.html 내용 가져오기
let html = execSync('git show a1ecad9:virtual-tradeshow-commercial-v1/app_build/client/demo-matterport.html', { encoding: 'utf8' });

console.log('Clean original demo-matterport loaded:', html.length, 'bytes');

// 2. 3D Drawer 관련 코드 제거 (다른 데모들과 동일한 표준 적용)
// 2-1. initDrawer3D() 호출 제거
html = html.replace(/[ \t]*initDrawer3D\(\);\r?\n/g, "");

// 2-2. 3D 변수 선언 제거
html = html.replace(/let drawer3dScene, drawer3dCamera, drawer3dRenderer, drawer3dControls;\r?\n/g, "");
html = html.replace(/let drawer3dModelGroup = null;\r?\n/g, "");
html = html.replace(/let drawer3dAutoRotate = true;\r?\n/g, "");
html = html.replace(/let drawer3dWireframe = false;\r?\n/g, "");
html = html.replace(/let currentMediaMode = 'photo';[^\n]*\r?\n/g, "");

// 2-3. initDrawer3D 함수 블록 제거
html = html.replace(/function initDrawer3D\(\)[\s\S]*?(?=\nfunction buildProceduralRobotModel)/, "");

// 2-4. buildProceduralRobotModel 함수 블록 제거
html = html.replace(/function buildProceduralRobotModel[\s\S]*?(?=\nfunction setDrawerMediaMode)/, "");

// 2-5. setDrawerMediaMode 함수 블록 제거
html = html.replace(/function setDrawerMediaMode[\s\S]*?(?=\nfunction toggleDrawer3dAutoRotate)/, "");

// 2-6. toggleDrawer3dAutoRotate 제거
html = html.replace(/function toggleDrawer3dAutoRotate[\s\S]*?(?=\nfunction toggleDrawer3dWireframe)/, "");

// 2-7. toggleDrawer3dWireframe 제거
html = html.replace(/function toggleDrawer3dWireframe[\s\S]*?(?=\nfunction resetDrawer3dCamera)/, "");

// 2-8. resetDrawer3dCamera 제거
html = html.replace(/function resetDrawer3dCamera[\s\S]*?(?=\nfunction openProductDrawer)/, "");

// 2-9. openProductDrawer 내 3D 분기 제거
html = html.replace(/[ \t]*\/\/ Update 3D model if already in 3D mode\r?\n[ \t]*if \(currentMediaMode === '3d'\) \{[\s\S]*?\}\r?\n/, "");

// 2-10. HTML에서 drawer-media-tabs 제거
html = html.replace(/<div class="drawer-media-tabs"[\s\S]*?<\/div>\s*\r?\n(?=[ \t]*<div class="drawer-img-box")/s, "");

// 2-11. HTML에서 drawer-3d-view 제거
html = html.replace(/[ \t]*<div id="drawer-3d-view"[\s\S]*?<\/div>[ \t]*\r?\n(?=[ \t]*<\/div>)/, "");

// 2-12. HTML에서 3D Showroom 버튼 제거
html = html.replace(/[ \t]*<a href="\/demo\.html"[\s\S]*?🌐 Open in Virtual 3D Showroom →[\s\S]*?<\/a>[ \t]*\r?\n/, "");

// 2-13. 주석 정리
html = html.replace(
  "<!-- Media Mode Switcher Tabs -->\n      <!-- High-Res Product Hero Photo & 360 3D Mini View -->",
  "<!-- High-Res Product Hero Photo -->"
);
html = html.replace(
  "PRODUCT INSPECTION DRAWER WITH HIGH-RES HERO VISUALS & 360° 3D MINI PLAYER",
  "PRODUCT INSPECTION DRAWER WITH HIGH-RES HERO VISUALS"
);

// 2-14. CSS 정리
html = html.replace(/\/\* MINI 3D TURNTABLE CONTAINER \*\/[\s\S]*?\.mini-3d-pill:hover \{ background: var\(--cyan\); color: #000; \}\r?\n/m, "");
html = html.replace(/\.drawer-media-tabs\s*\{[\s\S]*?\}\r?\n/m, "");
html = html.replace(/\.drawer-media-tab\s*\{[\s\S]*?\}\r?\n/m, "");
html = html.replace(/\.drawer-media-tab\.active\s*\{[\s\S]*?\}\r?\n/m, "");
html = html.replace(/\.drawer-media-tab:hover\s*\{[\s\S]*?\}\r?\n/m, "");

// 대상 위치에 UTF-8로 저장
const targetPath = 'app_build/client/demo-matterport.html';
fs.writeFileSync(targetPath, html, 'utf8');
console.log('✅ demo-matterport.html repaired and saved. Size:', html.length, 'bytes');
console.log('Contains ?? :', html.includes('??'));
