const fs = require("fs");

const BASE = "E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client";
const files = ["demo-fashion.html", "demo-cosmetic.html", "demo-furniture.html"];

files.forEach(filename => {
  const fp = BASE + "/" + filename;
  let html = fs.readFileSync(fp, "utf8");

  // Fix extra closing div inside drawer-img-box
  // Pattern: <img id="drw-img" ... >\n         \n         </div>\n      </div>
  // Should be: <img id="drw-img" ... >\n      </div>
  html = html.replace(
    /(<img id="drw-img"[^>]*>)\s*\n\s*<\/div>\s*\n(\s*<\/div>)/m,
    "$1\n$2"
  );

  fs.writeFileSync(fp, html, "utf8");
  console.log("Fixed: " + filename);
});
console.log("DONE");
