const fs = require('fs');

const otherPages = [
  'app_build/client/pricing.html',
  'app_build/client/start.html',
  'app_build/client/card.html',
  'app_build/client/production.html',
  'app_build/client/photo-viewer.html',
  'app_build/client/builder.html'
];

otherPages.forEach(p => {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    // Global scrollbar hide
    if (!content.includes('scrollbar-width: none')) {
      content = content.replace('</style>', `
      html, body { scrollbar-width: none; -ms-overflow-style: none; }
      ::-webkit-scrollbar { display: none; width: 0; height: 0; }
      </style>`);
    }
    fs.writeFileSync(p, content, 'utf8');
    console.log(`✅ ${p} synchronized`);
  }
});
