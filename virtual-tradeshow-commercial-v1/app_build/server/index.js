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
const RECONSTRUCTION_WORKER_SECRET = process.env.RECONSTRUCTION_WORKER_SECRET || 'dev-worker-secret-key-2026';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

// Dynamic Data Directory for Railway Volume persistence (/data)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const MODELS_DIR = path.join(UPLOADS_DIR, 'models');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// In-Memory Active Session Store
const activeSessions = new Map(); // token -> { userId, username, createdAt }

function generateSessionToken(userId, username) {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    userId,
    username,
    createdAt: Date.now()
  });
  return token;
}

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

function optionalAuth(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return activeSessions.get(token) || null;
  }
  return null;
}

// Worker Authentication Middleware
function requireWorkerAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Worker secret missing or invalid.' });
  }

  const secret = authHeader.substring(7);
  if (secret !== RECONSTRUCTION_WORKER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: Invalid worker secret.' });
  }

  next();
}

// Zero-Cost In-Memory Rate Limiter (Sliding Window)
const rateLimitMap = new Map();

function createRateLimiter(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const route = req.baseUrl + req.path;
    const key = `${ip}:${route}`;
    const now = Date.now();

    let record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitMap.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again in a minute.',
        retryAfterMs: record.resetTime - now
      });
    }

    next();
  };
}

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Multer Storage & Strict MIME Validation
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
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
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Capture Validator Helper (Phase 7 Production Pilot — 50 to 100 Photos Support)
function validateBoothCapture(photos = []) {
  const count = photos.length;
  const warnings = [];

  if (count === 0) {
    return {
      quality: 'poor',
      validCount: 0,
      warnings: ['No photos uploaded yet.'],
      canReconstruct: false,
      recommendedAction: 'Upload 50-100 high-resolution photos with 60-80% overlap for production 3D reconstruction.'
    };
  }

  if (count < 3) {
    warnings.push(`Only ${count} photo(s) found. Minimum 3 required for basic trial photogrammetry.`);
    return {
      quality: 'poor',
      validCount: count,
      warnings,
      canReconstruct: false,
      recommendedAction: 'Upload at least 3-10 photos for basic preview, or 50-100 for production Gaussian Splatting.'
    };
  }

  if (count >= 3 && count < 15) {
    warnings.push(`Current dataset has ${count} photos. This satisfies minimal trial requirements, but production quality requires 50-100 photos.`);
    return {
      quality: 'acceptable',
      validCount: count,
      warnings,
      canReconstruct: true,
      qualityScore: 65,
      recommendedAction: 'Ready for trial reconstruction. Adding 30-80 more photos will significantly enhance 3D detail and reduce splat floaters.'
    };
  }

  if (count >= 15 && count < 50) {
    return {
      quality: 'good',
      validCount: count,
      warnings: [],
      canReconstruct: true,
      qualityScore: 85,
      recommendedAction: 'Good dataset coverage. Adding 20-50 more multi-angle closeups recommended for ultra-fine product textures.'
    };
  }

  // count >= 50 (Phase 7 Production Target: 50~100 photos)
  return {
    quality: 'excellent',
    validCount: count,
    warnings: [],
    canReconstruct: true,
    qualityScore: 98,
    isProductionReady: true,
    estimatedSplatPoints: count * 1500,
    recommendedAction: 'Production-grade dataset detected (50+ photos). Optimized for high-density COLMAP SfM & Splatfacto SPZ optimization.'
  };
}


// Middleware Setup
if (ALLOWED_ORIGIN) {
  app.use(cors({ origin: ALLOWED_ORIGIN }));
} else {
  app.use(cors());
}
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, '..', 'client')));

// --- Healthcheck Endpoint ---
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'virtual-tradeshow-commercial-v1',
    schemaVersion: 3,
    timestamp: new Date().toISOString()
  });
});

// --- REST API Endpoints ---

// 1. Auth APIs
const loginLimiter = createRateLimiter(20, 60000);

app.post('/api/auth/login', loginLimiter, (req, res) => {
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

// 2. Booths API
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
    const { name, description, themeColor, status, photos } = req.body;
    if (!name) return res.status(400).json({ error: 'Booth name is required' });
    const booth = await db.createBooth({ name, description, themeColor, status, photos, exhibitorId: req.user.userId });
    res.status(201).json(booth);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/booths/:id', requireAuth, async (req, res) => {
  try {
    if (req.body.spatialModel && req.body.spatialModel.assetUrl) {
      const url = req.body.spatialModel.assetUrl;
      if (!url.startsWith('/') && !url.startsWith('https://') && !url.startsWith('http://localhost')) {
        return res.status(400).json({ error: 'Invalid or unsafe asset URL. Only HTTPS or relative paths permitted.' });
      }
    }
    const updated = await db.updateBooth(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Booth not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Booth Photos Upload
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
      validation: validateBoothCapture(updated.photos),
      booth: updated
    });
  });
});

// --- 3. Precision Reconstruction Admin APIs (Phase 4) ---

// Get Booth Reconstruction Status & Capture Validation
app.get('/api/booths/:id/reconstruction', requireAuth, (req, res) => {
  const booth = db.getBoothById(req.params.id, true);
  if (!booth) return res.status(404).json({ error: 'Booth not found' });

  const validation = validateBoothCapture(booth.photos || []);
  const activeJob = db.getReconstructionJobByBoothId(booth.id);

  res.json({
    boothId: booth.id,
    reconstructionStatus: booth.reconstructionStatus,
    spatialModel: booth.spatialModel,
    validation,
    activeJob
  });
});

// Request Precision Reconstruction (Creates Job)
app.post('/api/booths/:id/reconstruction', requireAuth, async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found' });

    const validation = validateBoothCapture(booth.photos || []);
    if (!validation.canReconstruct) {
      return res.status(400).json({
        error: 'Capture validation failed.',
        validation
      });
    }

    const { qualityPreset, engine } = req.body || {};
    const job = await db.createReconstructionJob(booth.id, { qualityPreset, engine });

    res.status(201).json({
      success: true,
      message: 'Precision reconstruction job successfully queued.',
      jobId: job.id,
      status: job.status,
      job
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Specific Reconstruction Job
app.get('/api/reconstruction/jobs/:id', requireAuth, (req, res) => {
  const job = db.getReconstructionJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Reconstruction job not found' });
  res.json(job);
});

// Cancel Pending/Processing Job
app.post('/api/reconstruction/jobs/:id/cancel', requireAuth, async (req, res) => {
  try {
    const job = await db.cancelJob(req.params.id);
    res.json({ success: true, message: 'Reconstruction job cancelled.', job });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Verify Reconstructed Booth (Human Review Gate)
app.post('/api/reconstruction/jobs/:id/verify', requireAuth, async (req, res) => {
  try {
    const job = await db.verifyJob(req.params.id);
    res.json({
      success: true,
      message: 'Reconstructed 3D booth verified and approved for public display.',
      job
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- 4. Worker Integration APIs (Protected by RECONSTRUCTION_WORKER_SECRET) ---

// Worker Claim Job (Atomic assignment)
app.post('/api/worker/jobs/claim', requireWorkerAuth, async (req, res) => {
  try {
    const { workerId } = req.body;
    const safeWorkerId = workerId || `worker-${crypto.randomBytes(4).toString('hex')}`;
    const job = await db.claimNextPendingJob(safeWorkerId);

    if (!job) {
      return res.status(204).send(); // No pending jobs available
    }

    res.json({
      success: true,
      jobId: job.id,
      boothId: job.boothId,
      qualityPreset: job.qualityPreset,
      engine: job.engine,
      photos: job.photos,
      sourcePhotoCount: job.sourcePhotoCount,
      job
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker Progress Update
app.post('/api/worker/jobs/:id/progress', requireWorkerAuth, async (req, res) => {
  try {
    const { progress, currentStage, diagnostics } = req.body;
    const updated = await db.updateJobProgress(req.params.id, progress, currentStage, diagnostics);
    res.json({ success: true, job: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Worker Complete Job
app.post('/api/worker/jobs/:id/complete', requireWorkerAuth, async (req, res) => {
  try {
    const { output, diagnostics } = req.body;
    const completed = await db.completeJob(req.params.id, output, diagnostics);
    res.json({ success: true, message: 'Job completed successfully.', job: completed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Worker Report Failure
app.post('/api/worker/jobs/:id/fail', requireWorkerAuth, async (req, res) => {
  try {
    const { stage, error } = req.body;
    const failed = await db.failJob(req.params.id, { stage, error });
    res.json({ success: true, message: 'Job marked as failed.', job: failed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- 5. Products API ---
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

// --- 6. Hotspots API ---
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

// --- 7. Analytics & Real Events API ---
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

const eventLimiter = createRateLimiter(120, 60000);

app.post('/api/events', eventLimiter, async (req, res) => {
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

// --- 8. Public Engagement Endpoints ---
const engagementLimiter = createRateLimiter(30, 60000);

app.post('/api/leads', engagementLimiter, async (req, res) => {
  try {
    const { boothId, productId, company, name, email, phone, jobTitle, notes } = req.body;
    if (!boothId || !name || !email) {
      return res.status(400).json({ error: 'boothId, name, and email are required' });
    }
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const lead = await db.createLead({ boothId, productId, company, name, email, phone, jobTitle, notes });
    res.status(201).json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rfqs', engagementLimiter, async (req, res) => {
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

app.post('/api/samples', engagementLimiter, async (req, res) => {
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

app.post('/api/appointments', engagementLimiter, async (req, res) => {
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
          currentRoom = data.roomId || 'default-room';
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          rooms.get(currentRoom).add(ws);
          const clientCount = rooms.get(currentRoom).size;
          ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: currentRoom,
            peerCount: clientCount - 1
          }));
          rooms.get(currentRoom).forEach(client => {
            if (client !== ws && client.readyState === ws.OPEN) {
              client.send(JSON.stringify({
                type: 'peer_joined',
                roomId: currentRoom,
                peerCount: clientCount
              }));
            }
          });
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
  console.log(` Virtual Trade Show Commercial V1 Server (Phase 4 Orchestration)`);
  console.log(` Port: ${PORT}`);
  console.log(` Schema Version: 3`);
  console.log(` Data Directory: ${DATA_DIR}`);
  console.log(` Healthcheck: http://localhost:${PORT}/health`);
  console.log(` Public Viewer: http://localhost:${PORT}/`);
  console.log(` Exhibitor Admin: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
