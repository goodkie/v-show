const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max per image
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..', 'client')));

// --- REST API Endpoints ---

// 1. Auth API
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  // Commercial Trial simple auth
  if (username === 'admin' && password === 'admin123') {
    return res.json({
      success: true,
      token: 'trial-token-auth-admin',
      user: { id: 'user-admin-1', name: 'Exhibitor Manager', role: 'exhibitor' }
    });
  }
  return res.status(401).json({ error: 'Invalid credentials. Use admin / admin123 for trial.' });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ id: 'user-admin-1', name: 'Exhibitor Manager', role: 'exhibitor' });
});

// 2. Booths API
app.get('/api/booths', (req, res) => {
  const booths = db.getBooths();
  res.json(booths);
});

app.get('/api/booths/:id', (req, res) => {
  const booth = db.getBoothById(req.params.id);
  if (!booth) return res.status(404).json({ error: 'Booth not found' });
  res.json(booth);
});

app.post('/api/booths', (req, res) => {
  const { name, description, themeColor } = req.body;
  if (!name) return res.status(400).json({ error: 'Booth name is required' });
  const booth = db.createBooth({ name, description, themeColor });
  res.status(201).json(booth);
});

app.put('/api/booths/:id', (req, res) => {
  const updated = db.updateBooth(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Booth not found' });
  res.json(updated);
});

// Booth Photos Upload
app.post('/api/booths/:id/photos', upload.array('photos', 50), (req, res) => {
  const booth = db.getBoothById(req.params.id);
  if (!booth) return res.status(404).json({ error: 'Booth not found' });

  const uploadedUrls = (req.files || []).map(file => `/uploads/${file.filename}`);
  const combinedPhotos = [...(booth.photos || []), ...uploadedUrls];
  
  const updated = db.updateBooth(req.params.id, {
    photos: combinedPhotos,
    reconstructionStatus: 'photo_preview' // Set to photo preview immediately
  });

  res.json({
    success: true,
    count: uploadedUrls.length,
    photos: updated.photos,
    booth: updated
  });
});

// Request Precision Reconstruction
app.post('/api/booths/:id/reconstruction', (req, res) => {
  const booth = db.getBoothById(req.params.id);
  if (!booth) return res.status(404).json({ error: 'Booth not found' });

  if (!booth.photos || booth.photos.length < 3) {
    return res.status(400).json({
      error: 'At least 3 photos (recommended 30-100) are required for precision reconstruction.'
    });
  }

  // Set state machine to reconstruction_pending
  const updated = db.updateBooth(req.params.id, {
    reconstructionStatus: 'reconstruction_pending'
  });

  res.json({
    success: true,
    message: 'Precision reconstruction job queued.',
    reconstructionStatus: updated.reconstructionStatus
  });
});

// 3. Products API
app.get('/api/booths/:boothId/products', (req, res) => {
  const products = db.getProductsByBoothId(req.params.boothId);
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const { boothId, name, sku, category, moq, price, contactForPrice, description, images, specifications, sampleAvailable } = req.body;
  if (!boothId || !name) {
    return res.status(400).json({ error: 'boothId and name are required' });
  }
  const product = db.createProduct({
    boothId,
    name,
    sku,
    category,
    moq,
    price,
    contactForPrice,
    description,
    images,
    specifications,
    sampleAvailable
  });
  res.status(201).json(product);
});

app.put('/api/products/:id', (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  res.json(updated);
});

app.delete('/api/products/:id', (req, res) => {
  const success = db.deleteProduct(req.params.id);
  if (!success) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true });
});

app.post('/api/products/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

// 4. Hotspots API
app.get('/api/booths/:boothId/hotspots', (req, res) => {
  const hotspots = db.getHotspotsByBoothId(req.params.boothId);
  res.json(hotspots);
});

app.post('/api/hotspots', (req, res) => {
  const { boothId, productId, position, label, type } = req.body;
  if (!boothId || !productId || !position) {
    return res.status(400).json({ error: 'boothId, productId, and position are required' });
  }
  const hotspot = db.createHotspot({ boothId, productId, position, label, type });
  res.status(201).json(hotspot);
});

app.delete('/api/hotspots/:id', (req, res) => {
  const success = db.deleteHotspot(req.params.id);
  if (!success) return res.status(404).json({ error: 'Hotspot not found' });
  res.json({ success: true });
});

// 5. Engagement APIs
app.post('/api/leads', (req, res) => {
  const { boothId, company, name, email, phone, jobTitle, notes } = req.body;
  if (!boothId || !name || !email) {
    return res.status(400).json({ error: 'boothId, name, and email are required' });
  }
  const lead = db.createLead({ boothId, company, name, email, phone, jobTitle, notes });
  res.status(201).json({ success: true, lead });
});

app.post('/api/rfqs', (req, res) => {
  const { boothId, productId, buyerName, company, email, quantity, targetPrice, deliveryDate, notes } = req.body;
  if (!boothId || !productId || !email || !quantity) {
    return res.status(400).json({ error: 'boothId, productId, email, and quantity are required' });
  }
  const rfq = db.createRFQ({ boothId, productId, buyerName, company, email, quantity, targetPrice, deliveryDate, notes });
  res.status(201).json({ success: true, rfq });
});

app.post('/api/samples', (req, res) => {
  const { boothId, productId, buyerName, company, email, quantity, shippingAddress, notes } = req.body;
  if (!boothId || !productId || !email) {
    return res.status(400).json({ error: 'boothId, productId, and email are required' });
  }
  const sample = db.createSampleRequest({ boothId, productId, buyerName, company, email, quantity, shippingAddress, notes });
  res.status(201).json({ success: true, sample });
});

app.post('/api/appointments', (req, res) => {
  const { boothId, buyerName, company, email, requestedTime, notes } = req.body;
  if (!boothId || !email || !requestedTime) {
    return res.status(400).json({ error: 'boothId, email, and requestedTime are required' });
  }
  const apt = db.createAppointment({ boothId, buyerName, company, email, requestedTime, notes });
  res.status(201).json({ success: true, appointment: apt });
});

app.get('/api/booths/:boothId/analytics', (req, res) => {
  const analytics = db.getBoothAnalytics(req.params.boothId);
  res.json(analytics);
});

// --- WebSocket Signaling for Realtime / WebRTC Consultation ---
const rooms = new Map(); // roomId -> Set of ws clients

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join_room': {
          currentRoom = data.roomId;
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          rooms.get(currentRoom).add(ws);
          
          // Notify room occupants
          const clientCount = rooms.get(currentRoom).size;
          ws.send(JSON.stringify({ type: 'room_joined', roomId: currentRoom, peerCount: clientCount - 1 }));
          break;
        }
        case 'signal': {
          if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).forEach(client => {
              if (client !== ws && client.readyState === ws.OPEN) {
                client.send(JSON.stringify({
                  type: 'signal',
                  from: data.from || 'peer',
                  payload: data.payload
                }));
              }
            });
          }
          break;
        }
        case 'leave_room': {
          if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).delete(ws);
            if (rooms.get(currentRoom).size === 0) {
              rooms.delete(currentRoom);
            }
          }
          currentRoom = null;
          break;
        }
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
      if (rooms.get(currentRoom).size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

// Default fallback route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Virtual Trade Show Commercial V1 Server Running`);
  console.log(` Port: ${PORT}`);
  console.log(` Public Viewer: http://localhost:${PORT}/`);
  console.log(` Exhibitor Admin: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
