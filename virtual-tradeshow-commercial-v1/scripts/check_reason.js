const path = require('path');
const db = require(path.join(__dirname, '..', 'app_build', 'server', 'db.js'));
const res = db.checkFreePreviewEligibility({
  businessName: 'Clean Company Corp',
  email: 'clean.test@company.com',
  ip: '11.22.33.44',
  isVerified: true
});
console.log('check result:', res);
