const https = require('https');

https.get('https://v-show-commercial-v1-production.up.railway.app/', (res) => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    console.log('Live <title>:', titleMatch ? titleMatch[1] : 'NOT FOUND');
    
    const brandLogoMatch = html.match(/<a[^>]*class="brand-logo"[^>]*>([\s\S]*?)<\/a>/);
    console.log('Live brand-logo HTML:\n', brandLogoMatch ? brandLogoMatch[0] : 'NOT FOUND');
    
    const heroTitleMatch = html.match(/<h1 class="hero-title">([\s\S]*?)<\/h1>/);
    console.log('Live hero-title:\n', heroTitleMatch ? heroTitleMatch[0] : 'NOT FOUND');
  });
}).on('error', err => console.error('Fetch error:', err));