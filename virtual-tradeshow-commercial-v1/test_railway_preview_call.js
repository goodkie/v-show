const fs = require('fs');
const path = require('path');

(async () => {
  const photoPath = path.join(__dirname, 'app_build', 'client', 'assets', 'demo', 'dna-showcase', 'pano360', 'node0_preview.jpg');
  const fileBlob = new Blob([fs.readFileSync(photoPath)], { type: 'image/jpeg' });

  const formData = new FormData();
  formData.append('businessName', 'Vantelle Test ' + Date.now().toString().slice(-4));
  formData.append('email', 'lead-dev@internal.vshow.com');
  formData.append('photo', fileBlob, 'booth.jpg');

  console.log('Sending request to Railway...');
  const res = await fetch('https://v-show-commercial-v1-production.up.railway.app/api/free-funnel/preview', {
    method: 'POST',
    body: formData
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response:', data);
})();
