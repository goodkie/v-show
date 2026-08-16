const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'commercial-beta-session-secret-2026';
const RECONSTRUCTION_WORKER_SECRET = process.env.RECONSTRUCTION_WORKER_SECRET || 'dev-worker-secret-key-2026';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

// Dynamic Data Directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const MODELS_DIR = path.join(UPLOADS_DIR, 'models');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `capture-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// In-Memory Active Session Store (Token -> { userId, organizationId, email, name, role, createdAt })
const activeSessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateSessionToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: Date.now()
  });
  return token;
}

// Authentication Middleware with 24h TTL Check
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token.' });
  }

  const token = authHeader.substring(7);
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid.' });
  }

  // Enforce 24-hour expiration
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized: Session expired. Please log in again.' });
  }

  req.user = session;
  next();
}

function optionalAuth(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const session = activeSessions.get(token);
    if (session && (Date.now() - session.createdAt <= SESSION_TTL_MS)) {
      return session;
    }
  }
  return null;
}


// Organizer Role Check Middleware
function requireOrganizer(req, res, next) {
  if (!req.user || req.user.role !== 'organizer_admin') {
    return res.status(403).json({ error: 'Forbidden: Organizer Admin privilege required.' });
  }
  next();
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

// Zero-Cost In-Memory Sliding Window Rate Limiter
const rateLimitMap = new Map();
function createRateLimiter(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const route = req.baseUrl + req.path;
    const key = `${ip}:${route}`;
    const now = Date.now();

    const record = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }
    rateLimitMap.set(key, record);

    if (record.count > maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests: Rate limit exceeded. Please wait a moment.'
      });
    }
    next();
  };
}

// Capture Validator Helper (50~100 Photos Production Support)
function validateBoothCapture(photos = []) {
  const count = photos.length;
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
    return {
      quality: 'poor',
      validCount: count,
      warnings: [`Only ${count} photo(s) found. Minimum 3 required for trial testing.`],
      canReconstruct: false,
      recommendedAction: 'Upload at least 3-10 photos for basic preview, or 50-100 for production Gaussian Splatting.'
    };
  }
  if (count >= 3 && count < 15) {
    return {
      quality: 'acceptable',
      validCount: count,
      warnings: [`Current dataset has ${count} photos. This satisfies minimal trial requirements.`],
      canReconstruct: true,
      qualityScore: 65,
      recommendedAction: 'Ready for trial reconstruction. Adding 30-80 more photos will significantly enhance 3D detail.'
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

// Static File Routes
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/vendor/spark', express.static(path.join(__dirname, '..', 'node_modules', '@sparkjsdev', 'spark', 'dist')));
app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three')));
app.use(express.static(path.join(__dirname, '..', 'client')));

// --- 1. Healthcheck Endpoint ---
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'virtual-tradeshow-commercial-v1',
    schemaVersion: 4,
    storageDriver: process.env.STORAGE_DRIVER || 'volume',
    timestamp: new Date().toISOString()
  });
});

// --- 2. Authentication APIs ---
app.post('/api/auth/login', createRateLimiter(10, 60000), (req, res) => {
  const { email, username, password } = req.body;
  const targetEmail = email || username;

  if (!targetEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  // 1. Check user in database
  const user = db.getUserByEmail(targetEmail);
  if (user) {
    if (db.verifyPassword(password, user.hash, user.salt)) {
      const token = generateSessionToken(user);
      const org = db.getOrganizationById(user.organizationId);
      db.logAudit(user.id, user.organizationId, 'auth.login', 'user', user.id, { email: user.email });
      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: Boolean(user.mustChangePassword)
        },
        organization: org
      });
    }
  }

  // 2. Break-glass migration fallback for legacy admin account
  if ((targetEmail === 'admin' || targetEmail === 'organizer@vshow.com') && password === 'admin123') {
    const orgUser = db.getUserByEmail('organizer@vshow.com') || {
      id: 'user-organizer-admin',
      organizationId: 'org-organizer-01',
      email: 'organizer@vshow.com',
      name: 'Global Expo Operations',
      role: 'organizer_admin',
      mustChangePassword: false
    };
    const token = generateSessionToken(orgUser);
    const org = db.getOrganizationById(orgUser.organizationId);
    return res.json({
      token,
      user: {
        id: orgUser.id,
        email: orgUser.email,
        name: orgUser.name,
        role: orgUser.role,
        mustChangePassword: Boolean(orgUser.mustChangePassword)
      },
      organization: org
    });
  }

  return res.status(401).json({ error: 'Invalid email or password.' });
});


app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.getUserById(req.user.userId) || req.user;
  const org = db.getOrganizationById(req.user.organizationId);
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    organization: org
  });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    const user = db.getUserById(req.user.userId);
    if (user && user.hash && user.salt) {
      if (!db.verifyPassword(currentPassword, user.hash, user.salt)) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }
    await db.updateUserPassword(req.user.userId, newPassword);
    db.logAudit(req.user.userId, req.user.organizationId, 'auth.change_password', 'user', req.user.userId);
    res.json({ success: true, message: 'Password successfully updated.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.substring(7);
  activeSessions.delete(token);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// --- 3. Events API ---
app.get('/api/events', (req, res) => {
  const user = optionalAuth(req);
  const isOrganizer = user && user.role === 'organizer_admin';
  const events = db.getEvents(!isOrganizer);
  res.json(events);
});

app.get('/api/events/:slugOrId', (req, res) => {
  const identifier = req.params.slugOrId;
  let event = db.getEventBySlug(identifier) || db.getEventById(identifier);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  const eventExhibitors = db.getEventExhibitors(event.id);
  const booths = db.getBooths(false, null, event.id);

  res.json({
    event,
    exhibitorsCount: eventExhibitors.length,
    boothsCount: booths.length,
    booths
  });
});

app.post('/api/events', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const { name, slug, description, bannerImage, startsAt, endsAt } = req.body;
    if (!name) return res.status(400).json({ error: 'Event name is required.' });

    const event = await db.createEvent({
      organizerOrganizationId: req.user.organizationId,
      name,
      slug,
      description,
      bannerImage,
      startsAt,
      endsAt
    });
    db.logAudit(req.user.userId, req.user.organizationId, 'event.create', 'event', event.id);
    res.status(201).json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/events/:id/exhibitors', (req, res) => {
  const exhibitors = db.getEventExhibitors(req.params.id);
  res.json(exhibitors);
});

app.post('/api/events/:id/exhibitors', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const { exhibitorOrganizationId, name, category, boothNumber } = req.body;
    let targetOrgId = exhibitorOrganizationId;

    if (!targetOrgId && name) {
      const newOrg = await db.createOrganization({ type: 'exhibitor', name, category });
      targetOrgId = newOrg.id;
    }

    const entry = await db.addEventExhibitor({
      eventId: req.params.id,
      exhibitorOrganizationId: targetOrgId,
      category,
      boothNumber
    });
    db.logAudit(req.user.userId, req.user.organizationId, 'event.add_exhibitor', 'eventExhibitor', entry.id);
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Organizer Dedicated Exhibitor Onboarding & Account Provisioning Endpoint
app.post('/api/events/:id/invite-exhibitor', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const { companyName, adminEmail, adminName, category, boothNumber, tempPassword } = req.body;
    if (!companyName || !adminEmail) {
      return res.status(400).json({ error: 'Company name and admin email are required.' });
    }

    const initialPassword = tempPassword || `BetaPass${Math.floor(1000 + Math.random() * 9000)}!`;

    // 1. Create Exhibitor Organization
    const org = await db.createOrganization({
      type: 'exhibitor',
      name: companyName,
      category: category || 'Industrial Automation'
    });

    // 2. Create Exhibitor Admin User with mustChangePassword = true
    const user = await db.createUser({
      organizationId: org.id,
      email: adminEmail.toLowerCase().trim(),
      name: adminName || `${companyName} Admin`,
      role: 'exhibitor_admin',
      password: initialPassword,
      mustChangePassword: true
    });

    // 3. Create Default Booth
    const booth = await db.createBooth({
      organizationId: org.id,
      eventId: req.params.id,
      exhibitorId: user.id,
      name: companyName,
      description: `${companyName} virtual showcase.`,
      status: 'draft',
      photos: []
    });

    // 4. Register to Event
    const eventExhibitor = await db.addEventExhibitor({
      eventId: req.params.id,
      exhibitorOrganizationId: org.id,
      boothId: booth.id,
      category: category || 'General',
      boothNumber: boothNumber || `B-${Math.floor(100 + Math.random() * 900)}`
    });

    db.logAudit(req.user.userId, req.user.organizationId, 'organizer.invite_exhibitor', 'organization', org.id, {
      adminEmail: user.email,
      boothId: booth.id
    });

    res.status(201).json({
      success: true,
      message: 'Exhibitor organization, admin account, and booth created successfully.',
      organization: org,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: true },
      tempPassword: initialPassword,
      booth,
      eventExhibitor
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// --- 4. Organizations API ---
app.get('/api/organizations', requireAuth, (req, res) => {
  if (req.user.role === 'organizer_admin') {
    return res.json(db.getOrganizations());
  }
  const org = db.getOrganizationById(req.user.organizationId);
  res.json(org ? [org] : []);
});

// --- 5. Booths API (with Multi-Tenant Isolation) ---
app.get('/api/booths', (req, res) => {
  const user = optionalAuth(req);
  const isOrganizer = user && user.role === 'organizer_admin';
  const orgId = isOrganizer ? (req.query.organizationId || null) : (user ? user.organizationId : null);
  const includeDrafts = Boolean(user && req.query.all === 'true');
  const eventId = req.query.eventId || null;

  const booths = db.getBooths(includeDrafts, orgId, eventId);
  res.json(booths);
});

app.get('/api/booths/:id', (req, res) => {
  const user = optionalAuth(req);
  const booth = db.getBoothById(req.params.id, true);

  if (!booth) {
    return res.status(404).json({ error: 'Booth not found.' });
  }

  // Tenant Security Check: If draft, only owner exhibitor or organizer can view
  if (booth.status !== 'published') {
    if (!user) {
      return res.status(404).json({ error: 'Booth not found or in draft status.' });
    }
    if (user.role !== 'organizer_admin' && user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access another exhibitor’s draft booth.' });
    }
  }

  res.json(booth);
});

app.post('/api/booths', requireAuth, async (req, res) => {
  try {
    const { name, description, themeColor, status, photos, eventId, organizationId } = req.body;
    if (!name) return res.status(400).json({ error: 'Booth name is required' });

    // Enforce Tenant Scope: Exhibitors can only create booths for own organization
    const targetOrgId = req.user.role === 'organizer_admin' ? (organizationId || req.user.organizationId) : req.user.organizationId;
    const targetEventId = eventId || 'event-global-tech-2026';

    const booth = await db.createBooth({
      name,
      description,
      themeColor,
      status,
      photos,
      organizationId: targetOrgId,
      eventId: targetEventId,
      exhibitorId: req.user.userId
    });

    db.logAudit(req.user.userId, targetOrgId, 'booth.create', 'booth', booth.id);
    res.status(201).json(booth);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/booths/:id', requireAuth, async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    // Strict Tenant Isolation: Only owner exhibitor or organizer can update
    if (req.user.role !== 'organizer_admin' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant modification rejected.' });
    }

    if (req.body.spatialModel && req.body.spatialModel.assetUrl) {
      const url = req.body.spatialModel.assetUrl;
      if (!url.startsWith('/') && !url.startsWith('https://') && !url.startsWith('http://localhost')) {
        return res.status(400).json({ error: 'Invalid asset URL.' });
      }
    }

    const updated = await db.updateBooth(req.params.id, req.body);
    db.logAudit(req.user.userId, booth.organizationId, 'booth.update', 'booth', booth.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Photo Upload Endpoint
app.post('/api/booths/:id/photos', requireAuth, upload.array('photos', 100), async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant upload rejected.' });
    }

    const uploadedUrls = (req.files || []).map(f => `/uploads/${f.filename}`);
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 6. Precision Reconstruction APIs (with Approval Workflow) ---
app.get('/api/booths/:id/reconstruction', requireAuth, (req, res) => {
  const booth = db.getBoothById(req.params.id, true);
  if (!booth) return res.status(404).json({ error: 'Booth not found.' });

  if (req.user.role !== 'organizer_admin' && req.user.organizationId !== booth.organizationId) {
    return res.status(403).json({ error: 'Forbidden: Cross-tenant access rejected.' });
  }

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

app.post('/api/booths/:id/reconstruction', requireAuth, async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant job request rejected.' });
    }

    const validation = validateBoothCapture(booth.photos || []);
    if (!validation.canReconstruct) {
      return res.status(400).json({ error: 'Capture validation failed.', validation });
    }

    const { qualityPreset, engine } = req.body || {};
    // Commercial Beta: Require approval for GPU jobs if requested by exhibitor
    const requireApproval = req.user.role !== 'organizer_admin';

    const job = await db.createReconstructionJob(booth.id, {
      qualityPreset,
      engine,
      requireApproval
    });

    db.logAudit(req.user.userId, booth.organizationId, 'reconstruction.request', 'reconstructionJob', job.id);

    res.status(201).json({
      success: true,
      message: requireApproval ? 'Reconstruction job submitted. Awaiting Organizer approval.' : 'Reconstruction job queued.',
      jobId: job.id,
      status: job.status,
      job
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Organizer Approve Reconstruction Job
app.post('/api/reconstruction/jobs/:id/approve', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const approved = await db.approveReconstructionJob(req.params.id);
    db.logAudit(req.user.userId, req.user.organizationId, 'reconstruction.approve', 'reconstructionJob', approved.id);
    res.json({ success: true, message: 'Reconstruction job approved and queued for GPU worker.', job: approved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Worker Job APIs
app.post('/api/worker/jobs/claim', requireWorkerAuth, async (req, res) => {
  const { workerId } = req.body;
  const safeWorkerId = workerId || `worker-${crypto.randomBytes(4).toString('hex')}`;
  const job = await db.claimNextPendingJob(safeWorkerId);
  res.json({ claimed: Boolean(job), job });
});

app.post('/api/worker/jobs/:id/complete', requireWorkerAuth, async (req, res) => {
  try {
    const { output, diagnostics } = req.body;
    const completed = await db.completeJob(req.params.id, output, diagnostics);
    res.json({ success: true, message: 'Job completed successfully.', job: completed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Precision Verify
app.post('/api/reconstruction/jobs/:id/verify', requireAuth, async (req, res) => {
  try {
    const job = db.getReconstructionJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (req.user.role !== 'organizer_admin' && req.user.organizationId !== job.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant verification rejected.' });
    }

    const { alignment } = req.body;
    const verified = await db.verifyJob(req.params.id, alignment);
    db.logAudit(req.user.userId, job.organizationId, 'reconstruction.verify', 'reconstructionJob', job.id);
    res.json({ success: true, message: 'Reconstructed 3D booth verified and approved for public display.', job: verified });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- 7. Products & Hotspots API ---
app.get('/api/booths/:boothId/products', (req, res) => {
  const products = db.getProductsByBooth(req.params.boothId);
  res.json(products);
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const { boothId, name, price, category, sku, moq, description, images, specs } = req.body;
    const booth = db.getBoothById(boothId, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant product creation rejected.' });
    }

    const product = await db.createProduct({
      organizationId: booth.organizationId,
      boothId,
      name,
      price,
      category,
      sku,
      moq,
      description,
      images,
      specs
    });
    db.logAudit(req.user.userId, booth.organizationId, 'product.create', 'product', product.id);
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/booths/:boothId/hotspots', (req, res) => {
  const hotspots = db.getHotspotsByBooth(req.params.boothId);
  res.json(hotspots);
});

app.post('/api/hotspots', requireAuth, async (req, res) => {
  try {
    const { boothId, productId, position, label } = req.body;
    const booth = db.getBoothById(boothId, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant hotspot creation rejected.' });
    }

    const hotspot = await db.createHotspot({
      organizationId: booth.organizationId,
      boothId,
      productId,
      position,
      label
    });
    db.logAudit(req.user.userId, booth.organizationId, 'hotspot.create', 'hotspot', hotspot.id);
    res.status(201).json(hotspot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- 8. Buyer Lead / RFQ / Sample / Appointment APIs ---
app.post('/api/leads', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { boothId, buyerName, company, email, phone, jobTitle, notes } = req.body;
    if (!boothId || !buyerName || !email) {
      return res.status(400).json({ error: 'Booth ID, name, and email are required.' });
    }
    const booth = db.getBoothById(boothId, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    const lead = await db.createLead({
      organizationId: booth.organizationId,
      eventId: booth.eventId,
      boothId,
      buyerName,
      company,
      email,
      phone,
      jobTitle,
      notes
    });
    res.status(201).json({ success: true, message: 'Digital business card exchanged successfully.', lead });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/leads', requireAuth, (req, res) => {
  const orgId = req.user.role === 'organizer_admin' ? (req.query.organizationId || null) : req.user.organizationId;
  const leads = db.getLeads(orgId, req.query.boothId);
  res.json(leads);
});

app.post('/api/rfqs', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { boothId, productId, buyerName, company, email, quantity, targetPrice, notes } = req.body;
    if (!boothId || !productId || !email || !buyerName) {
      return res.status(400).json({ error: 'Booth, product, buyer name, and email are required.' });
    }
    const booth = db.getBoothById(boothId, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    const rfq = await db.createRfq({
      organizationId: booth.organizationId,
      eventId: booth.eventId,
      boothId,
      productId,
      buyerName,
      company,
      email,
      quantity,
      targetPrice,
      notes
    });
    res.status(201).json({ success: true, message: 'RFQ submitted successfully.', rfq });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/rfqs', requireAuth, (req, res) => {
  const orgId = req.user.role === 'organizer_admin' ? (req.query.organizationId || null) : req.user.organizationId;
  const rfqs = db.getRfqs(orgId, req.query.boothId);
  res.json(rfqs);
});

app.post('/api/samples', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { boothId, productId, buyerName, company, email, quantity, notes } = req.body;
    const booth = db.getBoothById(boothId, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    const sample = await db.createSample({
      organizationId: booth.organizationId,
      eventId: booth.eventId,
      boothId,
      productId,
      buyerName,
      company,
      email,
      quantity,
      notes
    });
    res.status(201).json({ success: true, message: 'Sample request submitted.', sample });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/samples', requireAuth, (req, res) => {
  const orgId = req.user.role === 'organizer_admin' ? (req.query.organizationId || null) : req.user.organizationId;
  res.json(db.getSamples(orgId, req.query.boothId));
});

app.post('/api/appointments', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { boothId, productId, buyerName, company, email, requestedAt, notes } = req.body;
    const booth = db.getBoothById(boothId, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    const apt = await db.createAppointment({
      organizationId: booth.organizationId,
      eventId: booth.eventId,
      boothId,
      productId,
      buyerName,
      company,
      email,
      requestedAt,
      notes
    });
    res.status(201).json({ success: true, message: 'Meeting appointment requested.', appointment: apt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/appointments', requireAuth, (req, res) => {
  const orgId = req.user.role === 'organizer_admin' ? (req.query.organizationId || null) : req.user.organizationId;
  res.json(db.getAppointments(orgId, req.query.boothId));
});

// --- 9. Realtime Analytics API ---
app.post('/api/analytics/events', createRateLimiter(120, 60000), async (req, res) => {
  try {
    const { eventType, boothId, productId, viewerMode, sessionId, metadata } = req.body;
    let orgId = null;
    let eventId = null;

    if (boothId) {
      const booth = db.getBoothById(boothId, true);
      if (booth) {
        orgId = booth.organizationId;
        eventId = booth.eventId;
      }
    }

    const event = await db.trackAnalyticsEvent({
      eventType,
      organizationId: orgId,
      eventId,
      boothId,
      productId,
      viewerMode,
      sessionId,
      metadata
    });
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/analytics/summary', requireAuth, (req, res) => {
  const isOrganizer = req.user.role === 'organizer_admin';
  const orgId = isOrganizer ? (req.query.organizationId || null) : req.user.organizationId;
  const eventId = req.query.eventId || null;

  const events = db.getAnalyticsEvents(orgId, eventId);
  const leads = db.getLeads(orgId);
  const rfqs = db.getRfqs(orgId);
  const samples = db.getSamples(orgId);
  const appointments = db.getAppointments(orgId);
  const booths = db.getBooths(true, orgId, eventId);
  const jobs = db.getReconstructionJobs(orgId, eventId);

  const summary = {
    totalBooths: booths.length,
    publishedBooths: booths.filter(b => b.status === 'published').length,
    precisionVerifiedBooths: booths.filter(b => b.reconstructionStatus === 'verified').length,
    totalVisits: events.filter(e => e.eventType === 'booth_view').length,
    productViews: events.filter(e => e.eventType === 'product_view').length,
    hotspotClicks: events.filter(e => e.eventType === 'hotspot_click').length,
    totalLeads: leads.length,
    totalRfqs: rfqs.length,
    totalSamples: samples.length,
    totalAppointments: appointments.length,
    reconstructionJobsCount: jobs.length
  };

  res.json(summary);
});

// --- 10. WebSocket Realtime Signaling & Showhost Presence ---
const rooms = new Map(); // roomId -> Set of ws clients
const showhostPresence = new Map(); // boothId -> status

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join': {
          currentRoom = data.roomId;
          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, new Set());
          }
          rooms.get(currentRoom).add(ws);
          ws.send(JSON.stringify({ type: 'joined', roomId: currentRoom }));
          break;
        }
        case 'showhost_presence': {
          if (data.boothId) {
            showhostPresence.set(data.boothId, data.status || 'available');
            // Broadcast to all clients in booth room
            if (rooms.has(data.boothId)) {
              for (const client of rooms.get(data.boothId)) {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: 'showhost_status', status: data.status }));
                }
              }
            }
          }
          break;
        }
        case 'signal': {
          if (currentRoom && rooms.has(currentRoom)) {
            for (const client of rooms.get(currentRoom)) {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
              }
            }
          }
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

// SPA Fallback Route
app.get('*', (req, res) => {
  if (req.path.startsWith('/uploads/') || req.path.startsWith('/api/') || req.path.startsWith('/vendor/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  if (req.path.startsWith('/organizer')) {
    return res.sendFile(path.join(__dirname, '..', 'client', 'organizer.html'));
  }
  if (req.path.startsWith('/lobby') || req.path.startsWith('/event')) {
    return res.sendFile(path.join(__dirname, '..', 'client', 'lobby.html'));
  }
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Virtual Trade Show Commercial Beta Server (Phase 8 Multi-Tenant)`);
  console.log(` Port: ${PORT}`);
  console.log(` Schema Version: 4`);
  console.log(` Data Directory: ${DATA_DIR}`);
  console.log(` Healthcheck: http://localhost:${PORT}/health`);
  console.log(` Event Lobby: http://localhost:${PORT}/lobby.html`);
  console.log(` Organizer Admin: http://localhost:${PORT}/organizer.html`);
  console.log(` Exhibitor Admin: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
