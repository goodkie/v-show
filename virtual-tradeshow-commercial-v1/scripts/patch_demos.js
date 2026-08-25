const fs = require("fs");
const path = require("path");

const BASE = "E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client";
const demoFiles = ["demo-fashion.html", "demo-cosmetic.html", "demo-furniture.html"];

function patchDemoFile(filename) {
  const filePath = path.join(BASE, filename);
  let html = fs.readFileSync(filePath, "utf8");
  const origLen = html.length;

  // 1. initDrawer3D() call
  html = html.replace(/[ \t]*initDrawer3D\(\);\r?\n/g, "");

  // 2. 3D variable declarations
  html = html.replace(/let drawer3dScene, drawer3dCamera, drawer3dRenderer, drawer3dControls;\r?\n/g, "");
  html = html.replace(/let drawer3dModelGroup = null;\r?\n/g, "");
  html = html.replace(/let drawer3dAutoRotate = true;\r?\n/g, "");
  html = html.replace(/let drawer3dWireframe = false;\r?\n/g, "");
  html = html.replace(/let currentMediaMode = 'photo';[^\n]*\r?\n/g, "");

  // 3. initDrawer3D function block (ends before buildProceduralRobotModel)
  html = html.replace(/function initDrawer3D\(\)[\s\S]*?(?=\nfunction buildProceduralRobotModel)/, "");

  // 4. buildProceduralRobotModel function block
  html = html.replace(/function buildProceduralRobotModel[\s\S]*?(?=\nfunction setDrawerMediaMode)/, "");

  // 5. setDrawerMediaMode function block
  html = html.replace(/function setDrawerMediaMode[\s\S]*?(?=\nfunction toggleDrawer3dAutoRotate)/, "");

  // 6. toggleDrawer3dAutoRotate
  html = html.replace(/function toggleDrawer3dAutoRotate[\s\S]*?(?=\nfunction toggleDrawer3dWireframe)/, "");

  // 7. toggleDrawer3dWireframe
  html = html.replace(/function toggleDrawer3dWireframe[\s\S]*?(?=\nfunction resetDrawer3dCamera)/, "");

  // 8. resetDrawer3dCamera
  html = html.replace(/function resetDrawer3dCamera[\s\S]*?(?=\nfunction openProductDrawer)/, "");

  // 9. Remove 3D branch inside openProductDrawer
  html = html.replace(/[ \t]*\/\/ Update 3D model if already in 3D mode\r?\n[ \t]*if \(currentMediaMode === '3d'\) \{[\s\S]*?\}\r?\n/, "");

  // 10. Remove drawer-3d-view div (HTML)
  html = html.replace(/[ \t]*<div id="drawer-3d-view"[\s\S]*?<\/div>[ \t]*\r?\n(?=[ \t]*<\/div>)/, "");

  // 11. Remove '3D Showroom' anchor button
  html = html.replace(/[ \t]*<a href="\/demo\.html"[\s\S]*?🌐 Open in Virtual 3D Showroom →[\s\S]*?<\/a>[ \t]*\r?\n/, "");

  // 12. Update comments
  html = html.replace(
    "<!-- Media Mode Switcher Tabs -->\n      <!-- High-Res Product Hero Photo & 360 3D Mini View -->",
    "<!-- High-Res Product Hero Photo -->"
  );
  html = html.replace(
    "PRODUCT INSPECTION DRAWER WITH HIGH-RES HERO VISUALS & 360° 3D MINI PLAYER",
    "PRODUCT INSPECTION DRAWER WITH HIGH-RES HERO VISUALS"
  );

  fs.writeFileSync(filePath, html, "utf8");
  console.log("OK " + filename + " (" + origLen + " -> " + html.length + " bytes, removed " + (origLen - html.length) + ")");
}

demoFiles.forEach(f => patchDemoFile(f));

// index.html 1 column
const indexPath = path.join(BASE, "index.html");
let idx = fs.readFileSync(indexPath, "utf8");
idx = idx.replace("grid-template-columns: repeat(2, 1fr)", "grid-template-columns: 1fr");
fs.writeFileSync(indexPath, idx, "utf8");
console.log("OK index.html 1-column layout");
console.log("DONE");
