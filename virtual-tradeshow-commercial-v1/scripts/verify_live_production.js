const https = require('https');

https.get('https://v-show-commercial-v1-production.up.railway.app', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Has #appModalRoot:', body.includes('id="appModalRoot"'));
    console.log('Has openProductCameraCapture:', body.includes('openProductCameraCapture'));
    console.log('Has opeBtnTakePhoto:', body.includes('opeBtnTakePhoto'));
    console.log('Has removeP3dTabSourceImage:', body.includes('removeP3dTabSourceImage'));
    console.log('Has 10200 confirm z-index:', body.includes('10200'));
    console.log('Has 3:4 cards CSS:', body.includes('aspect-ratio: 3/4') || body.includes('aspect-ratio:3/4'));
    console.log('Has scroll-snap tray:', body.includes('scroll-snap-type: x proximity') || body.includes('scroll-snap-type:x proximity'));
    console.log('Total HTML Bytes:', body.length);
    if (res.statusCode === 200 &&
        body.includes('id="appModalRoot"') &&
        body.includes('openProductCameraCapture') &&
        body.includes('opeBtnTakePhoto') &&
        body.includes('removeP3dTabSourceImage') &&
        body.includes('10200')) {
      console.log('\n🎉 ALL PRODUCTION LIVE CHECKS PASSED!');
    } else {
      console.error('\n❌ SOME PRODUCTION LIVE CHECKS FAILED!');
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});
