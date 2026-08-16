const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const TRIAL_ADMIN_USER = process.env.TRIAL_ADMIN_USER || 'admin';
const TRIAL_ADMIN_PASSWORD = process.env.TRIAL_ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'trial-session-secret-key';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-Memory Active Session Store
const activeSessions = new Map(); // token -> { userId, username, createdAt }

// Generate Secure Cryptographic Session Token
function generateSessionToken(userId, username) {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    userId,
    username,
    createdAt: Date.now()
  });
  return token;
}

// Authentication Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token.' });
  }

  const token = authHeader.substring(7);
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Session token expired or invalid.' });
  }

  req.user = session;
  next();
}

// Optional Auth Helper (for dual public/admin route behavior)
function optionalAuth(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return activeSessions.get(token) || null;
  }
  return null;
}

// Multer Storage & Strict MIME Validation
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate safe cryptographically random filename
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type (${file.mimetype}). Only JPG, PNG, and WebP images are permitted.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB individual limit
});

// Middleware Setup
if (ALLOWED_ORIGIN) {
  app.use(cors({ origin: ALLOWED_ORIGIN }));
} else {
  app.use(cors()); // Same-origin trial default
}
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..', 'client')));

// --- REST API Endpoints ---

// 1. Auth APIs
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === TRIAL_ADMIN_USER && password === TRIAL_ADMIN_PASSWORD) {
    const token = generateSessionToken('user-admin-1', username);
    return res.json({
      success: true,
      token,
      user: { id: 'user-admin-1', username, name: 'Exhibitor Manager', role: 'exhibitor' }
    });
  }
  return res.status(401).json({ error: 'Invalid credentials. Please check your username and password.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ id: req.user.userId, username: req.user.username, role: 'exhibitor' });
});

// 2. Booths API (Separating Public and Admin Access)
app.get('/api/booths', (req, res) => {
  const user = optionalAuth(req);
  const includeDrafts = Boolean(user && req.query.all === 'true');
  const booths = db.getBooths(includeDrafts);
  res.json(booths);
});

app.get('/api/booths/:id', (req, res) => {
  const user = optionalAuth(req);
  const includeDrafts = Boolean(user);
  const booth = db.getBoothById(req.params.id, includeDrafts);

  if (!booth) {
    return res.status(404).json({ error: 'Booth not found or currently in unpublished draft status.' });
  }
  res.json(booth);
});

app.post('/api/booths', requireAuth, async (req, res) => {
  try {
    const { name, description, themeColor } = req.body;
    if (!name) return res.status(400).json({ error: 'Booth name is required' });
    const booth = await db.createBooth({ name, description, themeColor, exhibitorId: req.user.userId });
    res.status(201).json(booth);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/booths/:id', requireAuth, async (req, res) => {
  try {
    const updated = await db.updateBooth(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Booth not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Booth Photos Upload (Protected)
app.post('/api/booths/:id/photos', requireAuth, (req, res) => {
  upload.array('photos', 50)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload error' });
    }

    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found' });

    const uploadedUrls = (req.files || []).map(file => `/uploads/${file.filename}`);
    const combinedPhotos = [...(booth.photos || []), ...uploadedUrls];

    const updated = await db.updateBooth(req.params.id, {
      photos: combinedPhotos,
      reconstructionStatus: 'photo_preview'
    });

    res.json({
      success: true,
      count: uploadedUrls.length,
      photos: updated.photos,
      booth: updated
    });
  });
});

// Request Precision Reconstruction (Protected)
app.post('/api/booths/:id/reconstruction', requireAuth, async (req, res) => {
  const booth = db.getBoothById(req.params.id, true);
  if (!booth) return res.status(404).json({ error: 'Booth not found' });

  if (!booth.photos || booth.photos.length < 3) {
    return res.status(400).json({
      error: 'At least 3 photos (recommended 30-100) are required for precision reconstruction.'
    });
  }

  const updated = await db.updateBooth(req.params.id, {
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

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const { boothId, name, sku, category, moq, price, contactForPrice, description, images, specifications, sampleAvailable } = req.body;
    if (!boothId || !name) {
      return res.status(400).json({ error: 'boothId and name are required' });
    }
    const product = await db.createProduct({
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
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const updated = await db.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const success = await db.deleteProduct(req.params.id);
    if (!success) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/upload-image', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url });
  });
});

// 4. Hotspots API
app.get('/api/booths/:boothId/hotspots', (req, res) => {
  const hotspots = db.getHotspotsByBoothId(req.params.boothId);
  res.json(hotspots);
});

app.post('/api/hotspots', requireAuth, async (req, res) => {
  try {
    const { boothId, productId, position, label, type } = req.body;
    if (!boothId || !productId || !position) {
      return res.status(400).json({ error: 'boothId, productId, and position are required' });
    }
    const hotspot = await db.createHotspot({ boothId, productId, position, label, type });
    res.status(201).json(hotspot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/hotspots/:id', requireAuth, async (req, res) => {
  try {
    const updated = await db.updateHotspot(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Hotspot not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/hotspots/:id', requireAuth, async (req, res) => {
  try {
    const success = await db.deleteHotspot(req.params.id);
    if (!success) return res.status(404).json({ error: 'Hotspot not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Analytics & Real Events API
const ALLOWED_EVENT_TYPES = [
  'booth_view',
  'product_view',
  'product_click',
  'hotspot_click',
  'lead_capture',
  'sample_request',
  'rfq_submit',
  'appointment_request',
  'consultation_start'
];

app.post('/api/events', async (req, res) => {
  try {
    const { boothId, productId, sessionId, type, metadata } = req.body;
    if (!boothId || !type) {
      return res.status(400).json({ error: 'boothId and type are required' });
    }
    if (!ALLOWED_EVENT_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid event type. Allowed: ${ALLOWED_EVENT_TYPES.join(', ')}` });
    }

    const event = await db.recordEvent({ boothId, productId, sessionId, type, metadata });
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Public Engagement Endpoints (Server creates events automatically)
app.post('/api/leads', async (req, res) => {
  try {
    const { boothId, productId, company, name, email, phone, jobTitle, notes } = req.body;
    if (!boothId || !name || !email) {
      return res.status(400).json({ error: 'boothId, name, and email are required' });
    }
    // Basic email format check
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const lead = await db.createLead({ boothId, productId, company, name, email, phone, jobTitle, notes });
    res.status(201).json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rfqs', async (req, res) => {
  try {
    const { boothId, productId, buyerName, company, email, quantity, targetPrice, deliveryDate, notes } = req.body;
    if (!boothId || !productId || !email || !quantity) {
      return res.status(400).json({ error: 'boothId, productId, email, and quantity are required' });
    }
    const rfq = await db.createRFQ({ boothId, productId, buyerName, company, email, quantity: Number(quantity), targetPrice, deliveryDate, notes });
    res.status(201).json({ success: true, rfq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/samples', async (req, res) => {
  try {
    const { boothId, productId, buyerName, company, email, quantity, shippingAddress, notes } = req.body;
    if (!boothId || !productId || !email) {
      return res.status(400).json({ error: 'boothId, productId, and email are required' });
    }
    const sample = await db.createSampleRequest({ boothId, productId, buyerName, company, email, quantity: Number(quantity) || 1, shippingAddress, notes });
    res.status(201).json({ success: true, sample });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const { boothId, productId, buyerName, company, email, requestedTime, notes } = req.body;
    if (!boothId || !email || !requestedTime) {
      return res.status(400).json({ error: 'boothId, email, and requestedTime are required' });
    }
    const apt = await db.createAppointment({ boothId, productId, buyerName, company, email, requestedTime, notes });
    res.status(201).json({ success: true, appointment: apt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Analytics (Protected)
app.get('/api/booths/:boothId/analytics', requireAuth, (req, res) => {
  const analytics = db.getBoothAnalytics(req.params.boothId);
  res.json(analytics);
});

// --- WebSocket Signaling for Realtime / WebRTC Consultation ---
const rooms = new Map();

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
      console.error('WebSocket parse error:', e);
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

// Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Virtual Trade Show Commercial V1 (Hardened Phase 2)`);
  console.log(` Port: ${PORT}`);
  console.log(` Public Viewer: http://localhost:${PORT}/`);
  console.log(` Exhibitor Admin: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
