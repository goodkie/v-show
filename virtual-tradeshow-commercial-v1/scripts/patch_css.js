const fs = require("fs");

const BASE = "E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client";
const files = ["demo-fashion.html", "demo-cosmetic.html", "demo-furniture.html"];

files.forEach(filename => {
  const fp = BASE + "/" + filename;
  let html = fs.readFileSync(fp, "utf8");
  const before = html.length;

  // Remove CSS blocks for 3D drawer elements
  // #drawer-3d-view { ... }
  html = html.replace(/\/\* MINI 3D TURNTABLE CONTAINER \*\/[\s\S]*?\.mini-3d-pill:hover \{ background: var\(--cyan\); color: #000; \}\r?\n/m, "");

  // Remove .drawer-media-tabs CSS if exists
  html = html.replace(/\.drawer-media-tabs\s*\{[\s\S]*?\}\r?\n/m, "");
  html = html.replace(/\.drawer-media-tab\s*\{[\s\S]*?\}\r?\n/m, "");
  html = html.replace(/\.drawer-media-tab\.active\s*\{[\s\S]*?\}\r?\n/m, "");
  html = html.replace(/\.drawer-media-tab:hover\s*\{[\s\S]*?\}\r?\n/m, "");

  fs.writeFileSync(fp, html, "utf8");
  console.log("OK " + filename + " CSS cleaned (" + before + " -> " + html.length + " bytes)");
});
console.log("DONE");
