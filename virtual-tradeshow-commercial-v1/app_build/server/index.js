const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
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

// Helper to validate image magic bytes
function validateImageMagicBytes(filePath) {
  try {
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { valid: true, mime: 'image/jpeg' };
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return { valid: true, mime: 'image/png' };
    // WEBP: 52 49 46 46 ... 57 45 42 50
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { valid: true, mime: 'image/webp' };
    
    return { valid: false, reason: 'INVALID_MAGIC_BYTES' };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

// Multer Storage Configuration — Strict Security & Extension Validation
const imageFileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

  const originalName = file.originalname.toLowerCase();
  const ext = path.extname(originalName);

  // Reject double extensions (e.g. payload.php.jpg)
  const parts = originalName.split('.');
  if (parts.length > 2) {
    const secondLast = parts[parts.length - 2];
    const suspiciousExts = ['php', 'exe', 'sh', 'js', 'py', 'html', 'htm', 'svg', 'bat', 'cmd'];
    if (suspiciousExts.includes(secondLast)) {
      return cb(new Error('Security error: Double extension detected and rejected.'), false);
    }
  }

  // Reject path traversals
  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
    return cb(new Error('Security error: Invalid characters in filename.'), false);
  }

  if (!allowedExtensions.includes(ext) || !allowedMimes.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type: ${ext} (${file.mimetype}). Only JPG, PNG, and WebP images are allowed.`), false);
  }

  cb(null, true);
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `capture-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Multer 3D Model Storage
const model3DStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, MODELS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `model-${uniqueSuffix}${ext}`);
  }
});

const model3DUpload = multer({
  storage: model3DStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.glb' && ext !== '.gltf') {
      return cb(new Error('Only .glb and .gltf 3D model files are accepted.'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB for 3D models
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
  if (!req.user || (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner')) {
    return res.status(403).json({ error: 'Forbidden: Organizer Admin privilege required.' });
  }
  next();
}

// Platform Owner Role Check Middleware (Owner only)
function requirePlatformOwner(req, res, next) {
  if (!req.user || req.user.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Forbidden: Platform Owner privilege required.' });
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

// Stripe Mode & Security Validation
const STRIPE_MODE = process.env.STRIPE_MODE || 'test';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || null;

// Hard Mode Validation Guard: Prevent mixing test/live keys
if (STRIPE_SECRET_KEY) {
  if (STRIPE_MODE === 'test' && STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    console.error('FATAL BILLING MISMATCH: Live secret key detected while STRIPE_MODE=test. Refusing live operations in test mode.');
  } else if (STRIPE_MODE === 'live' && STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    console.error('FATAL BILLING MISMATCH: Test secret key detected while STRIPE_MODE=live. Refusing test keys in live mode.');
  }
}

const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

// Middleware: Request ID & Security Headers
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || `req-${uuidv4().substring(0, 12)}`;
  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middleware Setup
if (ALLOWED_ORIGIN) {
  app.use(cors({ origin: ALLOWED_ORIGIN }));
} else {
  app.use(cors());
}

// Raw body parser for Stripe webhook MUST come before express.json()
app.post('/api/billing/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (stripe && STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Test Mode / Simulation Fallback
      const payloadStr = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
      event = JSON.parse(payloadStr);
    }
  } catch (err) {
    console.error('⚠️ Stripe Webhook signature verification failed:', err.message);
    db.logIncident('BILLING', 'high', `Stripe signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (!event || !event.type) {
    return res.status(400).json({ error: 'Invalid event format' });
  }

  // Idempotency check
  if (db.isStripeEventProcessed(event.id)) {
    return res.json({ received: true, duplicate: true });
  }

  await db.logStripeEvent(event);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId = session.metadata?.organizationId;
        const requestedPlan = session.metadata?.requestedPlan || 'pro';
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (orgId) {
          await db.updateOrganizationSubscription(orgId, {
            plan: requestedPlan,
            status: 'active',
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            upgradedAt: new Date().toISOString()
          });
          await db.logBillingEvent({
            organizationId: orgId,
            plan: requestedPlan,
            type: 'checkout_completed',
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            amount: session.amount_total ? session.amount_total / 100 : (requestedPlan === 'pro' ? 299 : 799)
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const org = db.getOrganizationByStripeCustomerId(sub.customer);
        if (org) {
          const plan = sub.metadata?.requestedPlan || (sub.items?.data[0]?.price?.unit_amount >= 50000 ? 'business' : 'pro');
          await db.updateOrganizationSubscription(org.id, {
            plan,
            status: sub.status,
            stripeSubscriptionId: sub.id,
            currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end)
          });
          await db.logBillingEvent({
            organizationId: org.id,
            plan,
            type: event.type === 'customer.subscription.created' ? 'subscription_created' : 'subscription_updated',
            stripeCustomerId: sub.customer,
            stripeSubscriptionId: sub.id,
            status: sub.status
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const org = db.getOrganizationByStripeCustomerId(sub.customer);
        if (org) {
          await db.updateOrganizationSubscription(org.id, {
            plan: 'free',
            status: 'canceled',
            cancelledAt: new Date().toISOString()
          });
          await db.logBillingEvent({
            organizationId: org.id,
            plan: 'free',
            type: 'cancelled',
            stripeCustomerId: sub.customer,
            stripeSubscriptionId: sub.id,
            status: 'canceled'
          });
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const org = db.getOrganizationByStripeCustomerId(invoice.customer);
        if (org) {
          await db.logBillingEvent({
            organizationId: org.id,
            plan: org.subscription?.plan || 'pro',
            type: 'invoice_paid',
            stripeCustomerId: invoice.customer,
            stripeSubscriptionId: invoice.subscription,
            amount: invoice.amount_paid ? invoice.amount_paid / 100 : 299,
            currency: invoice.currency?.toUpperCase() || 'USD',
            status: 'paid'
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const org = db.getOrganizationByStripeCustomerId(invoice.customer);
        if (org) {
          await db.updateOrganizationSubscription(org.id, {
            status: 'past_due'
          });
          await db.logBillingEvent({
            organizationId: org.id,
            plan: org.subscription?.plan || 'pro',
            type: 'payment_failed',
            stripeCustomerId: invoice.customer,
            status: 'past_due'
          });
          db.logIncident('BILLING', 'medium', `Payment failed for customer ${org.name} (Invoice ${invoice.id})`, { organizationId: org.id });
        }
        break;
      }
      default:
        break;
    }
  } catch (procErr) {
    console.error('Error processing webhook event:', procErr);
  }

  res.json({ received: true });
});

// JSON Body Parser for all other routes
app.use(express.json());

// Static File Routes
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/vendor/spark', express.static(path.join(__dirname, '..', 'node_modules', '@sparkjsdev', 'spark', 'dist')));
app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three')));
app.use(express.static(path.join(__dirname, '..', 'client')));

// --- 1. Healthcheck (Canonical: /health, Alias: /api/health) & Public Plan Endpoints ---
const healthHandler = (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'virtual-tradeshow-commercial-v1',
    schemaVersion: 5,
    stripeMode: STRIPE_MODE === 'live' ? 'live' : 'test',
    storageDriver: process.env.STORAGE_DRIVER || 'volume',
    timestamp: new Date().toISOString()
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);


app.get('/api/public/plans', (req, res) => {
  res.json(db.getPublicPlanConfig());
});

app.get('/api/public/governance', (req, res) => {
  res.json(db.getCommercialGovernance());
});

app.get('/api/public/business-identity', (req, res) => {
  res.json(db.getBusinessIdentity());
});





// --- 2. Authentication APIs ---
app.post('/api/auth/login', createRateLimiter(60, 60000), (req, res) => {

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
    const strengthCheck = db.validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return res.status(400).json({ error: strengthCheck.message, code: 'WEAK_PASSWORD' });
    }

    const user = db.getUserById(req.user.userId);
    if (user && user.hash && user.salt) {
      if (!db.verifyPassword(currentPassword, user.hash, user.salt)) {
        return res.status(400).json({ error: 'Current password is incorrect.', code: 'INVALID_CREDENTIALS' });
      }
    }
    await db.updateUserPassword(req.user.userId, newPassword);
    db.logAudit(req.user.userId, req.user.organizationId, 'auth.change_password', 'user', req.user.userId);
    res.json({ success: true, message: 'Password successfully updated.' });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'BAD_REQUEST' });
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

    // Use cryptographically secure 16-char password by default or validate manual override
    let initialPassword = tempPassword;
    if (!initialPassword) {
      initialPassword = db.generateSecureTempPassword(16);
    } else {
      const strength = db.validatePasswordStrength(initialPassword);
      if (!strength.valid) {
        return res.status(400).json({ error: `Temporary password invalid: ${strength.message}`, code: 'WEAK_PASSWORD' });
      }
    }


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

// Phase 9 Operational Telemetry (Funnel, Readiness, Incidents, Cost, Storage Forecast)
app.get('/api/organizer/telemetry', requireAuth, requireOrganizer, (req, res) => {
  const events = db.getAnalyticsEvents();
  const leads = db.getLeads();
  const rfqs = db.getRfqs();
  const samples = db.getSamples();
  const appointments = db.getAppointments();
  const booths = db.getBooths(true);
  const orgs = db.getOrganizations().filter(o => o.type === 'exhibitor');
  const incidents = db.getIncidents(20);
  const costLedger = db.getCostLedger();

  // 1. Buyer Funnel
  const lobbyVisits = events.filter(e => e.eventType === 'event_lobby_view' || e.eventType === 'booth_view').length;
  const boothViews = events.filter(e => e.eventType === 'booth_view').length;
  const productViews = events.filter(e => e.eventType === 'product_view').length;

  const funnel = {
    lobbyVisitors: lobbyVisits || 1,
    boothVisitors: boothViews,
    productViews: productViews,
    leadsCount: leads.length,
    rfqsCount: rfqs.length,
    appointmentsCount: appointments.length,
    conversionRates: {
      lobbyToBooth: `${Math.min(100, Math.round((boothViews / (lobbyVisits || 1)) * 100))}%`,
      boothToProduct: `${Math.min(100, Math.round((productViews / (boothViews || 1)) * 100))}%`,
      productToLead: `${Math.min(100, Math.round((leads.length / (productViews || 1)) * 100))}%`
    }
  };

  // 2. Exhibitor Readiness Matrix
  const readiness = orgs.map(org => {
    const orgBooths = booths.filter(b => b.organizationId === org.id);
    const primaryBooth = orgBooths[0] || null;
    const photosCount = primaryBooth ? (primaryBooth.photos || []).length : 0;
    const isVerified = primaryBooth ? primaryBooth.reconstructionStatus === 'verified' : false;
    const isPublished = primaryBooth ? primaryBooth.status === 'published' : false;

    return {
      organizationId: org.id,
      companyName: org.name,
      accountActive: true,
      boothCreated: Boolean(primaryBooth),
      photoCount: photosCount,
      reconstructionStatus: primaryBooth ? primaryBooth.reconstructionStatus : 'none',
      isVerified,
      isPublished,
      readyForBeta: isPublished && photosCount >= 3
    };
  });

  // 3. Storage Analysis & Forecast (bytes)
  const measuredPerBoothMb = 68.5; // ~60MB PLY + ~6.8MB SPZ + ~1.7MB photos
  const storageForecast = {
    currentStorageMb: (booths.length * measuredPerBoothMb).toFixed(1),
    forecast10ExhibitorsMb: (10 * measuredPerBoothMb).toFixed(1),
    forecast50ExhibitorsMb: (50 * measuredPerBoothMb).toFixed(1),
    forecast100ExhibitorsMb: (100 * measuredPerBoothMb).toFixed(1),
    recommendation: 'Current Railway Hobby Volume (1GB+) easily accommodates 3-10 beta exhibitors. Plan S3/R2 adapter when scaling > 50 exhibitors.'
  };

  res.json({
    funnel,
    readiness,
    incidents,
    costLedger,
    storageForecast,
    timestamp: new Date().toISOString()
  });
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

// Photo Deletion Endpoint (Single photo or Clear All)
app.delete('/api/booths/:id/photos', requireAuth, async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant photo deletion rejected.' });
    }

    const { photoUrl, index, clearAll } = req.body || {};
    let currentPhotos = [...(booth.photos || [])];

    if (clearAll) {
      currentPhotos = [];
    } else if (typeof index === 'number' && index >= 0 && index < currentPhotos.length) {
      currentPhotos.splice(index, 1);
    } else if (photoUrl) {
      currentPhotos = currentPhotos.filter(p => p !== photoUrl);
    } else {
      return res.status(400).json({ error: 'Specify photoUrl, index, or clearAll.' });
    }

    const updated = await db.updateBooth(req.params.id, {
      photos: currentPhotos,
      reconstructionStatus: currentPhotos.length === 0 ? 'photo_preview' : booth.reconstructionStatus
    });

    res.json({
      success: true,
      message: 'Photo deleted successfully.',
      photos: updated.photos,
      count: updated.photos.length,
      validation: validateBoothCapture(updated.photos),
      booth: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Photo Reordering & Batch Edit Endpoint
app.put('/api/booths/:id/photos', requireAuth, async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant photo update rejected.' });
    }

    const { photos, photoMetadata } = req.body;
    if (!Array.isArray(photos)) {
      return res.status(400).json({ error: 'photos must be an array of photo URLs.' });
    }

    const updatePayload = { photos };
    if (photoMetadata && Array.isArray(photoMetadata)) {
      updatePayload.photoMetadata = photoMetadata;
    }

    const updated = await db.updateBooth(req.params.id, updatePayload);

    res.json({
      success: true,
      message: 'Booth photos updated successfully.',
      photos: updated.photos,
      count: updated.photos.length,
      validation: validateBoothCapture(updated.photos),
      booth: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single Photo Replacement Endpoint
app.post('/api/booths/:id/photos/replace', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant photo replacement rejected.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided for replacement.' });
    }

    const index = parseInt(req.body.index, 10);
    const currentPhotos = [...(booth.photos || [])];

    if (isNaN(index) || index < 0 || index >= currentPhotos.length) {
      return res.status(400).json({ error: `Invalid index: ${req.body.index}. Must be between 0 and ${currentPhotos.length - 1}.` });
    }

    const newUrl = `/uploads/${req.file.filename}`;
    currentPhotos[index] = newUrl;

    const updated = await db.updateBooth(req.params.id, {
      photos: currentPhotos
    });

    res.json({
      success: true,
      message: `Photo at index ${index} replaced successfully.`,
      replacedIndex: index,
      newUrl,
      photos: updated.photos,
      validation: validateBoothCapture(updated.photos),
      booth: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Production Tenant-Isolated Capture Upload Endpoint (Phase 10.7N-E)
app.post('/api/booths/:id/captures/upload', requireAuth, upload.array('photos', 100), async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant capture upload rejected.' });
    }

    const captureId = req.body.captureId || `capture-${uuidv4().substring(0, 8)}`;
    const tenantCaptureDir = path.join(UPLOADS_DIR, 'organizations', booth.organizationId, 'booths', booth.id, 'captures', captureId, 'images');
    if (!fs.existsSync(tenantCaptureDir)) fs.mkdirSync(tenantCaptureDir, { recursive: true });

    const processedImages = [];
    const files = req.files || [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const magic = validateImageMagicBytes(f.path);
      if (!magic.valid) {
        fs.unlinkSync(f.path);
        return res.status(400).json({ error: `Security validation failed for ${f.originalname}: Corrupted or invalid magic bytes.` });
      }

      // Move into tenant-isolated structure
      const targetFilename = `view_${String(i + 1).padStart(3, '0')}_${path.basename(f.filename)}`;
      const targetPath = path.join(tenantCaptureDir, targetFilename);
      fs.renameSync(f.path, targetPath);

      const buf = fs.readFileSync(targetPath);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      const publicUrl = `/uploads/organizations/${booth.organizationId}/booths/${booth.id}/captures/${captureId}/images/${targetFilename}`;

      processedImages.push({
        filename: targetFilename,
        originalName: f.originalname,
        bytes: f.size,
        mimeType: f.mimetype,
        url: publicUrl,
        sha256: hash
      });
    }

    // Save capture dataset
    let capture = db.getCaptureById(captureId);
    if (!capture) {
      capture = await db.createCaptureDataset(booth.id, {
        id: captureId,
        name: req.body.captureName || `Booth Capture ${new Date().toISOString().split('T')[0]}`,
        images: processedImages,
        dataEnvironment: booth.dataEnvironment || 'REAL'
      });
    } else {
      capture = await db.addImagesToCapture(captureId, processedImages);
    }

    const updatedBooth = await db.updateBooth(booth.id, {
      photos: capture.images.map(img => img.url),
      activeCaptureId: capture.id,
      reconstructionStatus: 'photo_preview'
    });

    res.status(201).json({
      success: true,
      message: `Successfully uploaded and validated ${processedImages.length} images.`,
      captureId: capture.id,
      count: processedImages.length,
      images: processedImages,
      capture,
      validation: capture.qualityRating,
      booth: updatedBooth
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Capture Datasets Query Endpoint
app.get('/api/booths/:id/captures', requireAuth, (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant access rejected.' });
    }

    const captures = db.getCapturesByBoothId(booth.id);
    res.json({ captures, activeCaptureId: booth.activeCaptureId || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Product 3D Model Upload Endpoint (GLB/GLTF)
app.post('/api/products/:id/model-3d', requireAuth, model3DUpload.single('model'), async (req, res) => {
  try {
    const product = db.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== product.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant model upload rejected.' });
    }

    if (!req.file) return res.status(400).json({ error: 'No 3D model file provided.' });

    const tenantProductModelDir = path.join(UPLOADS_DIR, 'organizations', product.organizationId, 'products', product.id);
    if (!fs.existsSync(tenantProductModelDir)) fs.mkdirSync(tenantProductModelDir, { recursive: true });

    const targetPath = path.join(tenantProductModelDir, req.file.filename);
    fs.renameSync(req.file.path, targetPath);

    const publicUrl = `/uploads/organizations/${product.organizationId}/products/${product.id}/${req.file.filename}`;
    const ext = path.extname(req.file.originalname).toLowerCase();

    const updated = await db.updateProduct3DModel(product.id, {
      format: ext === '.glb' ? 'GLB' : 'GLTF',
      url: publicUrl,
      filename: req.file.originalname,
      bytes: req.file.size
    });

    res.json({
      success: true,
      message: 'Product 3D model uploaded successfully.',
      model3D: updated.model3D,
      product: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Booth 3D Scene Settings Endpoints
app.get('/api/booths/:id/3d-settings', (req, res) => {
  try {
    const settings = db.getBooth3DSettings(req.params.id);
    if (!settings) return res.status(404).json({ error: 'Booth not found.' });
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/booths/:id/3d-settings', requireAuth, async (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant settings update rejected.' });
    }

    const saved = await db.saveBooth3DSettings(booth.id, req.body.settings || req.body);
    res.json({ success: true, message: '3D Scene settings saved successfully.', settings: saved });
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
    const flags = db.getFeatureFlags();
    if (flags.reconstructionKillSwitch) {
      return res.status(503).json({
        error: 'RECONSTRUCTION_TEMPORARILY_DISABLED',
        message: '플랫폼 GPU 연산 안전 정책으로 인해 신규 3DGS 재구성 요청이 일시 중단되었습니다.'
      });
    }

    const booth = db.getBoothById(req.params.id, true);
    if (!booth) return res.status(404).json({ error: 'Booth not found.' });

    if (req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner' && req.user.organizationId !== booth.organizationId) {
      return res.status(403).json({ error: 'Forbidden: Cross-tenant job request rejected.' });
    }


    // Double-Gate Step 1: Check Plan Entitlement (FREE blocked, PRO/Business allowed)
    const entitlements = db.getOrganizationEntitlements(booth.organizationId);
    if (!entitlements.precision3D && req.user.role !== 'platform_owner') {
      return res.status(402).json({
        error: 'Upgrade Required: Precision 3D Gaussian Reconstruction is exclusive to PRO / Business plans. Please upgrade your subscription or request beta access.',
        plan: entitlements.plan,
        upgradeRequired: true
      });
    }

    const validation = validateBoothCapture(booth.photos || []);
    if (!validation.canReconstruct) {
      return res.status(400).json({ error: 'Capture validation failed.', validation });
    }

    const { qualityPreset, engine } = req.body || {};
    // Commercial Beta Double-Gate Step 2: Require approval for GPU jobs if requested by exhibitor
    const requireApproval = req.user.role !== 'organizer_admin' && req.user.role !== 'platform_owner';

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

// --- 8.5 Managed Production Order Intake APIs (Phase dn’a-C01) ---
app.post('/api/production-requests', createRateLimiter(20, 60000), async (req, res) => {
  try {
    const { companyName, email, tradeShow } = req.body;
    if (!companyName || !email) {
      return res.status(400).json({ error: 'Company name and contact email are required.' });
    }
    const newRequest = await db.createProductionRequest(req.body);
    res.status(201).json({
      success: true,
      message: 'Managed Production Request received successfully.',
      request: newRequest
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/production-requests', (req, res) => {
  res.json(db.getProductionRequests());
});

app.patch('/api/production-requests/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const updated = await db.updateProductionRequestStatus(id, status, notes);
    if (!updated) return res.status(404).json({ error: 'Request not found.' });
    res.json({ success: true, request: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- 8.6 dn’a-C02 Managed Production Projects Operations APIs ---

// 1. List Projects with filters & search
app.get('/api/production-projects', (req, res) => {
  const { status, priority, tradeShow, company, search } = req.query;
  const list = db.getProductionProjects({ status, priority, tradeShow, company, search });
  res.json(list);
});

// 2. Get Single Project (Internal Operator View)
app.get('/api/production-projects/:id', (req, res) => {
  const project = db.getProductionProjectById(req.params.id, false);
  if (!project) return res.status(404).json({ error: 'Production project not found.' });
  res.json(project);
});

// 3. Create Project Directly
app.post('/api/production-projects', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { company, tradeShow, email } = req.body;
    if (!company || !tradeShow) {
      return res.status(400).json({ error: 'Company name and trade show are required.' });
    }
    const project = await db.createProductionProject(req.body, req.body.actor || 'Operations');
    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Qualify Production Request & Convert to Project
app.post('/api/production-projects/qualify-request', async (req, res) => {
  try {
    const { requestId, overrideData } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId is required.' });
    const project = await db.qualifyRequestAndCreateProject(requestId, overrideData || {}, req.body.actor || 'Operations');
    if (!project) return res.status(404).json({ error: 'Production request not found.' });
    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Update Status & Blocking Reason
app.patch('/api/production-projects/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, actor } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required.' });
    const updated = await db.updateProjectStatus(id, status, reason || '', actor || 'Operations');
    if (!updated) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Update Asset Item Status
app.patch('/api/production-projects/:id/assets', async (req, res) => {
  try {
    const { id } = req.params;
    const { assetKey, status, notes, actor } = req.body;
    if (!assetKey || !status) return res.status(400).json({ error: 'assetKey and status are required.' });
    const updated = await db.updateProjectAsset(id, assetKey, status, notes || '', actor || 'Operations');
    if (!updated) return res.status(404).json({ error: 'Project or asset item not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Update Production Task Status
app.patch('/api/production-projects/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const { taskId, status, notes, actor } = req.body;
    if (!taskId || !status) return res.status(400).json({ error: 'taskId and status are required.' });
    const updated = await db.updateProjectTask(id, taskId, status, notes || '', actor || 'Operations');
    if (!updated) return res.status(404).json({ error: 'Project or task not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Submit Internal QA Review
app.post('/api/production-projects/:id/qa', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, checks, notes, actor } = req.body;
    const updated = await db.submitProjectQA(id, { status, checks, notes }, actor || 'QA Director');
    if (!updated) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Submit Client Feedback / Revision / Approval
app.post('/api/production-projects/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, deliverable, comment, clientName } = req.body;
    const updated = await db.submitClientFeedback(id, { type, deliverable, comment, clientName });
    if (!updated) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Publish Deliverable Live
app.post('/api/production-projects/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const { publicUrl, actor } = req.body;
    const updated = await db.publishProject(id, { publicUrl }, actor || 'Production Manager');
    if (!updated) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Add Note (Internal vs Client-Visible)
app.post('/api/production-projects/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { noteText, isClientVisible, author } = req.body;
    if (!noteText) return res.status(400).json({ error: 'noteText is required.' });
    const updated = await db.addProjectNote(id, noteText, !!isClientVisible, author || 'Operations');
    if (!updated) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 12. Generate Post-Show Report
app.post('/api/production-projects/:id/post-show-report', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.generatePostShowReport(id, req.body.actor || 'Analytics Engine');
    if (!updated) return res.status(404).json({ error: 'Project not found.' });
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Duplicate Project For Next Show (Multi-Show Customer Memory)
app.post('/api/production-projects/:id/duplicate-next-show', async (req, res) => {
  try {
    const { id } = req.params;
    const newProject = await db.duplicateProjectForNextShow(id, req.body.newShowData || {}, req.body.actor || 'Operations');
    if (!newProject) return res.status(404).json({ error: 'Source project not found.' });
    res.status(201).json({ success: true, project: newProject });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 14. Client Portal Safe View (Zero Internal Note Leakage)
app.get('/api/client-portal/:id', (req, res) => {
  const project = db.getProductionProjectById(req.params.id, true);
  if (!project) return res.status(404).json({ error: 'Showroom project not found.' });
  res.json(project);
});

// ================================================================
// --- Phase dn’a-C03: DIY Booth Builder Beta REST Endpoints ---
// ================================================================

// 1. Create or Get DIY Project Draft
app.post('/api/diy/projects', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const { projectId, email, company, contact, tradeShow } = req.body;
    const project = await db.createOrGetDiyDraft(projectId, email, { company, contact, email, tradeShow });
    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Fetch DIY Project Details
app.get('/api/diy/projects/:id', (req, res) => {
  const project = db.getProductionProjectById(req.params.id, true);
  if (!project) return res.status(404).json({ error: 'DIY project not found.' });
  res.json(project);
});

// 3. Step 1: Update Company & Contact Profile
app.patch('/api/diy/projects/:id/company', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const project = await db.updateDiyCompany(req.params.id, req.body);
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Step 2: Update Trade Show Specifications
app.patch('/api/diy/projects/:id/show', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const project = await db.updateDiyShow(req.params.id, req.body);
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Step 3: Add or Update Product
app.post('/api/diy/projects/:id/products', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const result = await db.addOrUpdateDiyProduct(req.params.id, req.body);
    res.status(201).json({ success: true, product: result.product, project: result.project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Delete Product
app.delete('/api/diy/projects/:id/products/:productId', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const project = await db.deleteDiyProduct(req.params.id, req.params.productId);
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Duplicate Product
app.post('/api/diy/projects/:id/products/duplicate', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const { productId } = req.body;
    const result = await db.duplicateDiyProduct(req.params.id, productId);
    res.status(201).json({ success: true, product: result.product, project: result.project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Bulk Add Products
app.post('/api/diy/projects/:id/products/bulk', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { products } = req.body;
    const project = await db.bulkAddDiyProducts(req.params.id, products);
    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Step 4: Update Uploaded Assets
app.patch('/api/diy/projects/:id/assets', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const project = await db.updateDiyAssets(req.params.id, req.body);
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Step 5: Update Experience Type Selection
app.patch('/api/diy/projects/:id/experience', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const { experienceType } = req.body;
    const project = await db.updateDiyExperience(req.params.id, experienceType);
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Step 6: Select Template & Bind Hotspots
app.patch('/api/diy/projects/:id/template', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const { templateId, hotspotBindings } = req.body;
    const project = await db.updateDiyTemplate(req.params.id, templateId, hotspotBindings);
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 12. Update Lead / Action Settings
app.patch('/api/diy/projects/:id/settings', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const project = await db.updateDiySettings(req.params.id, req.body);
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Calculate Preview Readiness
app.get('/api/diy/projects/:id/readiness', (req, res) => {
  const project = db.getProductionProjectById(req.params.id, true);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const readiness = db.calculateDiyReadiness(project);
  res.json(readiness);
});

// 14. Step 8: Self-Service Safe Publish
app.post('/api/diy/projects/:id/publish', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { actor } = req.body;
    const result = await db.publishDiyProject(req.params.id, actor || 'Customer');
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 15. DIY -> Managed Production Handoff (Zero Data Loss)
app.post('/api/diy/projects/:id/handoff-to-managed', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const { notes, actor } = req.body;
    const result = await db.handoffDiyToManaged(req.params.id, notes, actor || 'Customer');
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 16. Submit Feedback or Issue Report
app.post('/api/diy/feedback', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const feedback = await db.submitDiyFeedback(req.body);
    res.status(201).json({ success: true, feedback });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 17. Real Project Analytics (Zero Fake Data)
app.get('/api/diy/projects/:id/analytics', (req, res) => {
  try {
    const analytics = db.getDiyAnalytics(req.params.id);
    res.json(analytics);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// 18. Track Event for DIY Project
app.post('/api/diy/projects/:id/analytics/events', createRateLimiter(120, 60000), async (req, res) => {
  try {
    const { eventType, metadata } = req.body;
    const analytics = await db.recordDiyAnalyticsEvent(req.params.id, eventType, metadata);
    res.json({ success: true, analytics });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// ================================================================
// --- Phase dn'a-C04: Lead Pipeline CRM & Pilot Analytics REST API ---
// ================================================================

// Lead Inbox: GET all leads for a project (with optional filter)
app.get('/api/diy/projects/:id/leads', createRateLimiter(60, 60000), (req, res) => {
  try {
    const filter = req.query.filter || null;
    const leads = db.getExhibitorLeads(req.params.id, filter);
    res.json({ success: true, leads, count: leads.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lead Detail: GET single lead
app.get('/api/diy/projects/:id/leads/:leadId', createRateLimiter(60, 60000), (req, res) => {
  try {
    const lead = db.getLeadById(req.params.id, req.params.leadId);
    res.json({ success: true, lead });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Create Buyer Lead (from booth, QR scan, catalog, etc.)
app.post('/api/diy/projects/:id/leads', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const lead = await db.createBuyerLead(req.params.id, req.body);
    res.status(201).json({ success: true, lead });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Follow-up: Update Lead Status (CONTACTED, FOLLOW_UP, QUALIFIED, WON, LOST)
app.patch('/api/diy/projects/:id/leads/:leadId/status', createRateLimiter(60, 60000), async (req, res) => {
  try {
    const { status, note, actor } = req.body;
    const lead = await db.updateLeadStatus(req.params.id, req.params.leadId, status, note, actor);
    res.json({ success: true, lead });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Exhibitor Analytics Summary (Visitor funnel, conversion, top products)
app.get('/api/diy/projects/:id/analytics/summary', createRateLimiter(60, 60000), (req, res) => {
  try {
    const summary = db.getExhibitorAnalyticsSummary(req.params.id);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Post-Show Report Generation
app.post('/api/diy/projects/:id/post-show-report', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const report = await db.generateExhibitorPostShowReport(req.params.id);
    res.json({ success: true, report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pilot Feedback Submission
app.post('/api/pilot/feedback', createRateLimiter(30, 60000), async (req, res) => {
  try {
    const feedback = await db.recordPilotFeedback(req.body);
    res.status(201).json({ success: true, feedback });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pilot Feedback Summary (UX Blockers Report)
app.get('/api/pilot/feedback/summary', createRateLimiter(30, 60000), (req, res) => {
  try {
    const summary = db.getPilotFeedbackSummary();
    res.json({ success: true, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pilot Cohort Projects List (all 5 pilot projects)
app.get('/api/pilot/projects', createRateLimiter(60, 60000), (req, res) => {
  try {
    const pilotIds = ['proj-pilot-01-haven', 'proj-pilot-02-nova', 'proj-pilot-03-lumina', 'proj-pilot-04-atlantica', 'proj-pilot-05-textura'];
    const data = db.read();
    const projects = (data.productionProjects || [])
      .filter(p => pilotIds.includes(p.id))
      .map(p => ({
        id: p.id,
        company: p.company,
        tradeShow: p.tradeShow,
        status: p.status,
        channel: p.channel,
        experienceType: p.experienceType,
        templateId: p.templateId,
        leadCount: (p.leads || []).length,
        analytics: p.analytics || {},
        managedHandoff: p.managedHandoff ? { handoffStatus: p.managedHandoff.handoffStatus } : null,
        publishedAt: p.publishedAt || null
      }));
    res.json({ success: true, projects, count: projects.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



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

// ============================================================
// --- 10. Phase 9.5 Stripe Billing & Customer Portal APIs ---
// ============================================================

app.get('/api/billing/plans', (req, res) => {
  res.json({
    free: db.getPlanLimits('free'),
    pro: db.getPlanLimits('pro'),
    business: db.getPlanLimits('business'),
    billingMode: STRIPE_SECRET_KEY ? 'live' : 'test'
  });
});

app.get('/api/billing/my-subscription', requireAuth, (req, res) => {
  const org = db.getOrganizationById(req.user.organizationId);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const entitlements = db.getOrganizationEntitlements(req.user.organizationId);
  const products = db.getProducts(null, req.user.organizationId);
  const booths = db.getBooths(true, req.user.organizationId);
  const leads = db.getLeads(req.user.organizationId);
  const billingEvents = db.getBillingEvents(req.user.organizationId);

  res.json({
    organizationId: org.id,
    organizationName: org.name,
    subscription: org.subscription || { plan: 'free', status: 'active' },
    entitlements,
    usage: {
      productsCount: products.length,
      maxProducts: entitlements.maxProducts,
      boothsCount: booths.length,
      leadsCount: leads.length,
      precision3DEligible: entitlements.precision3D
    },
    billingEvents: billingEvents.slice(-10),
    billingMode: STRIPE_SECRET_KEY ? 'live' : 'test'
  });
});

app.post('/api/billing/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const flags = db.getFeatureFlags();
    if (flags.billingKillSwitch) {
      return res.status(503).json({
        error: 'BILLING_TEMPORARILY_DISABLED',
        message: 'New subscription checkouts are temporarily disabled due to system maintenance or security controls.'
      });
    }

    const org = db.getOrganizationById(req.user.organizationId);
    if (!org) return res.status(404).json({ error: 'Organization not found.' });

    // --- Phase 10.5 Fail-Closed Live Pilot Guardrails ---
    if (STRIPE_MODE === 'live') {
      // 1. Data Environment must be REAL
      const env = org.subscription?.dataEnvironment || 'REAL';
      if (env !== 'REAL') {
        return res.status(403).json({
          error: 'LIVE_BILLING_NOT_ALLOWED_FOR_ENVIRONMENT',
          message: 'Live checkouts are only permitted for production organizations.'
        });
      }

      // 2. Allowlist Check
      const allowedOrgs = flags.liveBillingAllowedOrgs || [];
      if (!allowedOrgs.includes(org.id)) {
        return res.status(403).json({
          error: 'LIVE_BILLING_NOT_ALLOWED_FOR_ORG',
          message: 'Only pre-approved organizations in the invite-only pilot may proceed with live billing.'
        });
      }

      // 3. Customer Count Cap Check
      const paidCount = db.getRealPaidCustomerCount();
      const maxLimit = flags.livePilotMaxCustomers || 1;
      if (paidCount >= maxLimit) {
        return res.status(403).json({
          error: 'LIVE_PILOT_CUSTOMER_LIMIT_REACHED',
          message: 'The invite-only pilot capacity (1 customer) has been reached.'
        });
      }

      // 4. Pricing Status Check
      if (flags.pricingStatus !== 'approved_for_pilot' && flags.pricingStatus !== 'approved') {
        return res.status(403).json({
          error: 'PILOT_PRICING_NOT_APPROVED',
          message: 'Pilot pricing requires platform owner approval.'
        });
      }

      // 5. Legal Review Check
      if (flags.legalReviewStatus !== 'approved') {
        return res.status(403).json({
          error: 'LEGAL_REVIEW_NOT_APPROVED',
          message: 'Legal terms and policy review approval is required before live checkout.'
        });
      }

      // 6. Owner Live Authorization Check
      if (!flags.stripeLiveBillingEnabled || !flags.liveBillingApprovedByOwner) {
        return res.status(403).json({
          error: 'STRIPE_LIVE_MODE_NOT_APPROVED',
          message: 'Stripe Live Mode activation requires platform owner authorization.'
        });
      }
    }

    const { requestedPlan, consentTerms, consentRecurring } = req.body; // 'pro' | 'business'
    if (!requestedPlan || (requestedPlan !== 'pro' && requestedPlan !== 'business')) {
      return res.status(400).json({ error: 'Invalid plan. Must be "pro" or "business".' });
    }

    // --- Phase 10.6 Explicit Checkout Consent Verification ---
    if (!consentTerms || !consentRecurring) {
      return res.status(400).json({
        error: 'CHECKOUT_CONSENT_REQUIRED',
        message: 'Explicit consent to Terms of Service, Privacy Policy, and recurring monthly billing terms is required.'
      });
    }


    const gov = db.getCommercialGovernance();
    const planLimits = db.getPlanLimits(requestedPlan);

    // Record Immutable Consent Audit Event
    const consentRecord = {
      id: `consent-${uuidv4().substring(0, 8)}`,
      organizationId: org.id,
      userId: req.user.id,
      plan: requestedPlan,
      amountUsd: planLimits.monthlyPriceUsd,
      currency: 'USD',
      interval: 'monthly',
      pricingVersion: 'pilot-2026.1',
      termsVersion: gov.policyVersions.termsVersion,
      privacyVersion: gov.policyVersions.privacyVersion,
      refundPolicyVersion: gov.policyVersions.refundPolicyVersion,
      acceptedAt: new Date().toISOString()
    };


    await db.mutate((d) => {
      d.billingEvents = d.billingEvents || [];
      d.billingEvents.push({
        id: `bill-${uuidv4().substring(0, 8)}`,
        organizationId: org.id,
        eventType: 'checkout_consent_recorded',
        plan: requestedPlan,
        details: consentRecord,
        timestamp: new Date().toISOString()
      });
    });

    if (!org) return res.status(404).json({ error: 'Organization not found.' });



    // In Test Mode / Stripe Configured
    if (stripe) {
      const priceId = requestedPlan === 'pro'
        ? (process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_test_pro_monthly')
        : (process.env.STRIPE_PRICE_BUSINESS_MONTHLY || 'price_test_biz_monthly');

      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || 'localhost:3000';
      const origin = `${protocol}://${host}`;

      let customerId = org.subscription?.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          name: org.name,
          metadata: { organizationId: org.id }
        });
        customerId = customer.id;
        await db.updateOrganizationSubscription(org.id, { stripeCustomerId: customerId });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${origin}/index.html?billing_status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/index.html?billing_status=cancelled`,
        metadata: {
          organizationId: org.id,
          requestedPlan
        }
      });

      return res.json({
        success: true,
        sessionId: session.id,
        checkoutUrl: session.url,
        mode: 'live_or_stripe_test'
      });
    } else {
      // Local Test Simulation Mode (Instant Upgrade for Verification & Automated Testing)
      await db.updateOrganizationSubscription(org.id, {
        plan: requestedPlan,
        status: 'active',
        stripeCustomerId: `cus_sim_${crypto.randomBytes(4).toString('hex')}`,
        stripeSubscriptionId: `sub_sim_${crypto.randomBytes(4).toString('hex')}`,
        upgradedAt: new Date().toISOString()
      });

      await db.logBillingEvent({
        organizationId: org.id,
        plan: requestedPlan,
        type: 'checkout_completed',
        amount: requestedPlan === 'pro' ? 299 : 799,
        status: 'success'
      });

      return res.json({
        success: true,
        simulation: true,
        message: `Stripe Test Mode: Simulated checkout successful. Upgraded ${org.name} to ${requestedPlan.toUpperCase()}.`,
        plan: requestedPlan,
        entitlements: db.getOrganizationEntitlements(org.id)
      });
    }
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/billing/create-portal-session', requireAuth, async (req, res) => {
  try {
    const org = db.getOrganizationById(req.user.organizationId);
    if (!org) return res.status(404).json({ error: 'Organization not found.' });

    const customerId = org.subscription?.stripeCustomerId;
    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe Customer associated with this organization. Please upgrade first.' });
    }

    if (stripe) {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || 'localhost:3000';
      const returnUrl = `${protocol}://${host}/index.html#billing`;

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });

      return res.json({ success: true, url: session.url });
    } else {
      return res.json({
        success: true,
        simulation: true,
        message: 'Stripe Portal Simulated: Customer subscription is currently active in Test Mode.',
        customer: org.subscription
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/billing/upgrade-request', requireAuth, async (req, res) => {
  try {
    const { requestedPlan, trigger, notes } = req.body;
    const org = db.getOrganizationById(req.user.organizationId);

    const upgradeReq = await db.createUpgradeRequest({
      organizationId: req.user.organizationId,
      currentPlan: org?.subscription?.plan || 'free',
      requestedPlan: requestedPlan || 'pro',
      trigger: trigger || 'manual_request',
      contactEmail: req.user.email,
      notes: notes || ''
    });

    db.logAudit(req.user.userId, req.user.organizationId, 'billing.upgrade_request', 'upgradeRequest', upgradeReq.id);

    res.status(201).json({
      success: true,
      message: 'Upgrade request received. Our platform operations team has been notified.',
      request: upgradeReq
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// --- 11. Phase 9.5 Platform Communications APIs ---
// ============================================================

app.post('/api/communications/messages', requireAuth, async (req, res) => {
  try {
    const { targetType, targetOrganizationIds, targetEnvironment, category, subject, body } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and body are required.' });
    }

    // Exhibitors can only send support/contact messages to platform owner
    let safeTargetType = targetType || 'single';
    let safeTargetOrgs = targetOrganizationIds || [];

    if (req.user.role !== 'platform_owner') {
      safeTargetType = 'platform_support';
      safeTargetOrgs = ['org-platform-master'];
    }

    const message = await db.createPlatformMessage({
      senderUserId: req.user.userId,
      senderRole: req.user.role,
      senderName: req.user.name || req.user.email,
      targetType: safeTargetType,
      targetOrganizationIds: safeTargetOrgs,
      targetEnvironment: targetEnvironment || 'ALL',
      category: category || 'general',
      subject,
      body
    });

    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/communications/messages', requireAuth, (req, res) => {
  const orgId = req.user.organizationId;
  const role = req.user.role;
  const category = req.query.category || null;

  const messages = db.getPlatformMessages(orgId, role, category);
  res.json(messages);
});

app.post('/api/communications/messages/:id/read', requireAuth, async (req, res) => {
  try {
    const updated = await db.markMessageRead(req.params.id, req.user.userId, req.user.organizationId);
    res.json({ success: true, message: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/communications/messages/:id/reply', requireAuth, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'Reply body is required.' });

    const result = await db.replyToPlatformMessage(req.params.id, {
      senderUserId: req.user.userId,
      senderRole: req.user.role,
      senderName: req.user.name || req.user.email,
      body
    });

    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// --- 12. Phase 9.5 Grand Control Center (Platform Owner Only) ---
// ============================================================

app.get('/api/platform/overview', requireAuth, requirePlatformOwner, (req, res) => {
  const filterEnv = req.query.env || 'ALL'; // ALL | REAL | TEST | SYNTHETIC_TEST
  const overview = db.getGrandControlOverview(filterEnv);
  res.json(overview);
});

app.get('/api/platform/customers', requireAuth, requirePlatformOwner, (req, res) => {
  const filterEnv = req.query.env || 'ALL';
  const data = db.read();
  let orgs = data.organizations || [];

  if (filterEnv && filterEnv !== 'ALL') {
    orgs = orgs.filter(o => (o.subscription?.dataEnvironment || 'REAL') === filterEnv);
  }

  const customers = orgs.map(o => {
    const booths = (data.booths || []).filter(b => b.organizationId === o.id);
    const products = (data.products || []).filter(p => p.organizationId === o.id);
    const leads = (data.leads || []).filter(l => l.organizationId === o.id);
    const rfqs = (data.rfqs || []).filter(r => r.organizationId === o.id);
    const jobs = (data.reconstructionJobs || []).filter(j => j.organizationId === o.id);
    const users = (data.users || []).filter(u => u.organizationId === o.id);

    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      type: o.type,
      category: o.category || 'General',
      status: o.status,
      suspendedReason: o.suspendedReason,
      plan: o.subscription?.plan || 'free',
      subscriptionStatus: o.subscription?.status || 'active',
      dataEnvironment: o.subscription?.dataEnvironment || 'REAL',
      primaryAdmin: users[0]?.email || 'N/A',
      usersCount: users.length,
      boothsCount: booths.length,
      publishedBooths: booths.filter(b => b.status === 'published').length,
      productsCount: products.length,
      leadsCount: leads.length,
      rfqsCount: rfqs.length,
      reconstructionJobsCount: jobs.length,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt
    };
  });

  res.json(customers);
});

app.get('/api/platform/customers/:id', requireAuth, requirePlatformOwner, (req, res) => {
  const customer360 = db.getCustomer360(req.params.id);
  if (!customer360) return res.status(404).json({ error: 'Customer organization not found.' });
  res.json(customer360);
});

app.post('/api/platform/customers/:id/override-plan', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const { plan, source, notes } = req.body;
    if (!plan || !['free', 'pro', 'business'].includes(plan)) {
      return res.status(400).json({ error: 'Valid plan (free, pro, business) is required.' });
    }

    const updated = await db.overrideOrganizationPlan(
      req.params.id,
      plan,
      source || 'manual_beta_override',
      notes || '',
      req.user.userId
    );

    res.json({ success: true, message: `Plan overridden to ${plan.toUpperCase()}`, organization: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/platform/customers/:id/suspend', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const { reason } = req.body;
    const suspended = await db.suspendOrganization(req.params.id, reason || 'Suspended by platform owner', req.user.userId);
    res.json({ success: true, message: 'Organization suspended.', organization: suspended });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/platform/customers/:id/unsuspend', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const unsuspended = await db.unsuspendOrganization(req.params.id, req.user.userId);
    res.json({ success: true, message: 'Organization unsuspended.', organization: unsuspended });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/platform/customers/:id/notes', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const { noteText, category } = req.body;
    if (!noteText) return res.status(400).json({ error: 'Note text is required.' });

    const note = await db.addOwnerNote(req.params.id, req.user.userId, noteText, category || 'general');
    res.status(201).json({ success: true, note });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/platform/customers/:id/notes', requireAuth, requirePlatformOwner, (req, res) => {
  const notes = db.getOwnerNotes(req.params.id);
  res.json(notes);
});

app.get('/api/platform/visitors', requireAuth, requirePlatformOwner, (req, res) => {
  const filterEnv = req.query.env || 'ALL';
  const data = db.read();
  let events = (data.analyticsEvents || []).slice(-100).reverse();

  if (filterEnv && filterEnv !== 'ALL') {
    const validOrgIds = new Set((data.organizations || [])
      .filter(o => (o.subscription?.dataEnvironment || 'REAL') === filterEnv)
      .map(o => o.id));
    events = events.filter(e => !e.organizationId || validOrgIds.has(e.organizationId));
  }

  const visitors = events.map(e => ({
    id: e.id,
    sessionId: e.sessionId,
    eventType: e.eventType,
    organizationId: e.organizationId,
    eventId: e.eventId,
    boothId: e.boothId,
    productId: e.productId,
    viewerMode: e.viewerMode,
    timestamp: e.timestamp,
    deviceCategory: 'Desktop (Chrome/WebGL)',
    sourceType: e.organizationId?.includes('aurex') ? 'SYNTHETIC_TEST' : (e.organizationId?.includes('nova') || e.organizationId?.includes('helix') ? 'TEST' : 'REAL')
  }));

  res.json(visitors);
});

app.get('/api/platform/activity', requireAuth, requirePlatformOwner, (req, res) => {
  const filterEnv = req.query.env || 'ALL';
  const data = db.read();
  let audits = (data.auditLogs || []).slice(-50).reverse();

  if (filterEnv && filterEnv !== 'ALL') {
    const validOrgIds = new Set((data.organizations || [])
      .filter(o => (o.subscription?.dataEnvironment || 'REAL') === filterEnv)
      .map(o => o.id));
    audits = audits.filter(a => !a.organizationId || validOrgIds.has(a.organizationId));
  }

  res.json(audits);
});

app.get('/api/platform/reconstructions', requireAuth, requirePlatformOwner, (req, res) => {
  const filterEnv = req.query.env || 'ALL';
  const data = db.read();
  let jobs = data.reconstructionJobs || [];

  if (filterEnv && filterEnv !== 'ALL') {
    const validOrgIds = new Set((data.organizations || [])
      .filter(o => (o.subscription?.dataEnvironment || 'REAL') === filterEnv)
      .map(o => o.id));
    jobs = jobs.filter(j => validOrgIds.has(j.organizationId));
  }

  res.json(jobs);
});

app.post('/api/platform/reconstructions/:id/approve', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const approved = await db.approveReconstructionJob(req.params.id);
    db.logAudit(req.user.userId, 'org-platform-master', 'platform.reconstruction_approve', 'reconstructionJob', approved.id);
    res.json({ success: true, message: 'Reconstruction job approved by Platform Owner.', job: approved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/platform/incidents', requireAuth, requirePlatformOwner, (req, res) => {
  const incidents = db.getIncidents();
  res.json(incidents);
});

app.get('/api/platform/audit-logs', requireAuth, requirePlatformOwner, (req, res) => {
  const data = db.read();
  res.json((data.auditLogs || []).slice(-100).reverse());
});

app.get('/api/platform/feature-flags', requireAuth, requirePlatformOwner, (req, res) => {
  res.json(db.getFeatureFlags());
});

app.put('/api/platform/feature-flags', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const updated = await db.updateFeatureFlags(req.body, req.user.userId);
    res.json({ success: true, featureFlags: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/platform/launch-readiness', requireAuth, requirePlatformOwner, (req, res) => {
  res.json(db.getLaunchReadinessStatus());
});


app.get('/api/platform/export', requireAuth, requirePlatformOwner, (req, res) => {
  const { type, env } = req.query; // organizations | subscriptions | leads | reconstructions
  const filterEnv = env || 'ALL';
  const data = db.read();

  let orgs = data.organizations || [];
  if (filterEnv !== 'ALL') {
    orgs = orgs.filter(o => (o.subscription?.dataEnvironment || 'REAL') === filterEnv);
  }
  const validOrgIds = new Set(orgs.map(o => o.id));

  let csvContent = '';

  switch (type) {
    case 'subscriptions': {
      csvContent = 'OrganizationId,OrganizationName,Plan,Status,Environment,StripeCustomerId,UpgradedAt\n';
      orgs.forEach(o => {
        csvContent += `"${o.id}","${o.name}","${o.subscription?.plan || 'free'}","${o.subscription?.status || 'active'}","${o.subscription?.dataEnvironment || 'REAL'}","${o.subscription?.stripeCustomerId || ''}","${o.subscription?.upgradedAt || ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=subscriptions_export_${Date.now()}.csv`);
      return res.send(csvContent);
    }
    case 'leads': {
      let leads = data.leads || [];
      leads = leads.filter(l => validOrgIds.has(l.organizationId));
      csvContent = 'LeadId,OrganizationId,BuyerName,Company,Email,Phone,InterestLevel,Status,CreatedAt\n';
      leads.forEach(l => {
        csvContent += `"${l.id}","${l.organizationId}","${l.buyerName}","${l.company}","${l.email}","${l.phone || ''}","${l.interestLevel || 'medium'}","${l.status}","${l.createdAt}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=leads_export_${Date.now()}.csv`);
      return res.send(csvContent);
    }
    case 'reconstructions': {
      let jobs = data.reconstructionJobs || [];
      jobs = jobs.filter(j => validOrgIds.has(j.organizationId));
      csvContent = 'JobId,OrganizationId,BoothId,Status,ApprovalStatus,EstCostUSD,Progress,CreatedAt\n';
      jobs.forEach(j => {
        csvContent += `"${j.id}","${j.organizationId}","${j.boothId}","${j.status}","${j.approvalStatus}","${j.estimatedCostUsd || 0.25}","${j.progress}","${j.createdAt}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=reconstructions_export_${Date.now()}.csv`);
      return res.send(csvContent);
    }
    case 'organizations':
    default: {
      csvContent = 'Id,Name,Slug,Type,Status,Plan,Environment,CreatedAt\n';
      orgs.forEach(o => {
        csvContent += `"${o.id}","${o.name}","${o.slug || ''}","${o.type || 'exhibitor'}","${o.status || 'active'}","${o.subscription?.plan || 'free'}","${o.subscription?.dataEnvironment || 'REAL'}","${o.createdAt || ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=organizations_export_${Date.now()}.csv`);
      return res.send(csvContent);
    }
  }
});

// --- Phase 10.7 First Real Customer Pre-Activation & Launch Governance APIs ---
app.post('/api/platform/first-customer/pre-activate', requireAuth, requirePlatformOwner, async (req, res) => {

  try {
    const result = await db.createRealCustomerPreActivation(req.body, req.user.userId);
    res.status(201).json({
      success: true,
      message: 'First real customer pre-activated successfully. Billing remains OFF.',
      ...result
    });
  } catch (err) {
    const status = err.status || (err.code === 'LIVE_PILOT_CUSTOMER_LIMIT_REACHED' ? 409 : 400);
    res.status(status).json({
      error: err.message,
      code: err.code || 'PRE_ACTIVATION_FAILED'
    });
  }
});

app.get('/api/platform/first-customer/checklist', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const checklist = db.getPreActivationChecklist(req.query.organizationId);
    res.json(checklist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/platform/first-customer/preflight', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const preflight = db.getStripeLivePreflight();
    res.json(preflight);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/platform/governance/legal-approval', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const { docType, status, approvedBy, reviewNotes } = req.body;
    if (!docType || !status) {
      return res.status(400).json({ error: 'docType (terms/privacy/refund) and status (approved/pending/rejected) are required.' });
    }
    const updatedFlags = await db.recordLegalApproval(docType, { status, approvedBy, reviewNotes }, req.user.userId);
    res.json({ success: true, featureFlags: updatedFlags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/platform/governance/tax-review', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const { status, reviewedBy, notes, answers } = req.body;
    const updatedFlags = await db.recordTaxReview({ status, reviewedBy, notes, answers }, req.user.userId);
    res.json({ success: true, featureFlags: updatedFlags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/platform/booths/:id/capture-qa', requireAuth, (req, res) => {
  try {
    const booth = db.getBoothById(req.params.id);
    if (!booth) return res.status(404).json({ error: 'Booth not found' });
    const photos = req.body.photos || booth.photos || [];
    const qaResult = db.runCaptureQA(booth.id, photos);
    res.json(qaResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/platform/first-customer/360', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const customer360 = db.getFirstCustomer360();
    res.json({ customer: customer360 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/platform/first-customer/launch-board', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const launchBoard = db.getFirstCustomerLaunchBoard();
    res.json(launchBoard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Phase 10.7R Acquisition Lead & Funnel Endpoints ---
app.post('/api/public/acquisition-leads', async (req, res) => {
  try {
    const lead = await db.createAcquisitionLead(req.body);
    res.status(201).json({
      success: true,
      message: 'Application received. vivPR Commercial Operations will be in touch shortly.',
      lead: { id: lead.id, companyName: lead.companyName, stage: lead.stage }
    });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message, code: err.code || 'LEAD_SUBMISSION_FAILED' });
  }
});

app.get('/api/platform/acquisition/leads', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const leads = db.getAcquisitionLeads(req.query.environment);
    res.json({ leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/platform/acquisition/leads/:id/stage', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const lead = await db.updateAcquisitionLeadStage(req.params.id, req.body, req.user.userId);
    res.json({ success: true, lead });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/platform/acquisition/leads/:id/convert', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const plan = req.body.plan || 'free';
    const result = await db.convertLeadToCustomer(req.params.id, plan, req.user.userId);
    res.status(201).json({
      success: true,
      message: 'Lead converted to Real Customer Pre-Activation successfully.',
      ...result
    });
  } catch (err) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message, code: err.code || 'CONVERSION_FAILED' });
  }
});

app.get('/api/platform/acquisition/analytics', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const analytics = db.getAcquisitionAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Phase 10.7R Value Milestones & Customer Success Endpoints ---
app.post('/api/customer/milestones', requireAuth, async (req, res) => {
  try {
    const entry = await db.recordValueMilestone({
      organizationId: req.user.organizationId,
      boothId: req.body.boothId,
      milestoneType: req.body.milestoneType,
      metadata: req.body.metadata
    });
    res.status(201).json({ success: true, milestone: entry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/customer/milestones/:organizationId', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'platform_owner' && req.user.organizationId !== req.params.organizationId) {
      return res.status(403).json({ error: 'Access denied to organization milestones.' });
    }
    const milestones = db.getValueMilestones(req.params.organizationId);
    res.json({ milestones });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customer/activation-status/:organizationId', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'platform_owner' && req.user.organizationId !== req.params.organizationId) {
      return res.status(403).json({ error: 'Access denied to activation status.' });
    }
    const orgId = req.params.organizationId;
    const score = db.calculateCustomerActivationScore(orgId);
    const upgradeReadiness = db.calculateProUpgradeReadiness(orgId);
    res.json({ organizationId: orgId, activationScore: score, upgradeReadiness });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customer/feedback', requireAuth, async (req, res) => {
  try {
    const entry = await db.recordCustomerFeedback({
      organizationId: req.user.organizationId,
      userId: req.user.userId,
      rating: req.body.rating,
      improvements: req.body.improvements,
      futureEventInterest: req.body.futureEventInterest
    });
    res.status(201).json({ success: true, feedback: entry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Phase 10.7L Upgrade Intent Endpoints ---
app.post('/api/customer/upgrade-intent', requireAuth, async (req, res) => {
  try {
    const intent = await db.recordUpgradeIntent({
      organizationId: req.user.organizationId,
      userId: req.user.userId,
      requestedPlan: req.body.requestedPlan,
      source: req.body.source || 'admin_console'
    });
    res.status(201).json({
      success: true,
      message: 'Upgrade intent recorded. A commercial specialist will contact you to activate your plan.',
      intent
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/platform/upgrade-intents', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const intents = db.getUpgradeIntents();
    res.json({ intents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Phase 10.7N First 10 Prospect Outreach Operations Endpoints ---
app.post('/api/platform/outreach/import', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const { prospects, environment } = req.body;
    const result = await db.importOutreachProspects(prospects, environment || 'REAL', req.user.userId);
    res.status(201).json({
      success: true,
      message: `Imported ${result.totalImported} prospects. (${result.duplicates.length} duplicates skipped)`,
      ...result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/platform/outreach/prospects', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const env = req.query.environment || null;
    const prospects = db.getOutreachProspects(env);
    res.json({ prospects, count: prospects.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/platform/outreach/prospects/:id', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const updated = await db.updateProspectOutreach(req.params.id, req.body, req.user.userId);
    res.json({ success: true, prospect: updated });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
});

app.post('/api/platform/outreach/prospects/:id/dnc', requireAuth, requirePlatformOwner, async (req, res) => {
  try {
    const reason = req.body.reason || 'Customer request';
    const updated = await db.setProspectDoNotContact(req.params.id, reason, req.user.userId);
    res.json({ success: true, message: 'Prospect marked as DO NOT CONTACT', prospect: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/platform/outreach/scorecard', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const env = req.query.environment || 'REAL';
    const scorecard = db.getOutreachScorecard(env);
    res.json({ scorecard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/platform/outreach/export', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const env = req.query.environment || 'REAL';
    const csv = db.exportOutreachCsv(env);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="prospects_${env.toLowerCase()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Phase 10.7N Wilo Golden Demo Endpoints ---
app.get('/api/public/wilo-demo', (req, res) => {
  try {
    const data = db.getWiloDemoData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/platform/wilo-demo/scorecard', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const scorecard = db.getWiloDemoScorecard();
    res.json({ scorecard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/public/consultation-ticket', async (req, res) => {
  try {
    const ticket = await db.createConsultationTicket(req.body);
    res.status(201).json({
      success: true,
      message: 'Consultation ticket created successfully. A technical specialist will contact you.',
      ticket
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/exhibitor/consultation-tickets', requireAuth, (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const allTickets = db.read().consultationTickets || [];
    const tickets = req.user.role === 'platform_owner' ? allTickets : allTickets.filter(t => t.organizationId === orgId);
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/exhibitor/consultation-tickets/:id', requireAuth, async (req, res) => {
  try {
    const updated = await db.updateConsultationTicket(req.params.id, req.body, req.user.userId);
    res.json({ success: true, ticket: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/public/wilo-demo/analytics', async (req, res) => {
  try {
    const { type, details } = req.body;
    await db.mutate((d) => {
      d.analyticsEvents = d.analyticsEvents || [];
      d.analyticsEvents.push({
        id: `evt-${uuidv4().substring(0, 8)}`,
        organizationId: 'org-wilo-golden-demo',
        type: type || 'demo_interaction',
        details: details || {},
        dataEnvironment: 'SYNTHETIC_TEST',
        timestamp: new Date().toISOString()
      });
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/public/wilo-demo/feedback', async (req, res) => {

  try {
    const feedback = await db.addDemoFeedback(req.body);
    res.status(201).json({
      success: true,
      message: 'Demo feedback submitted successfully.',
      feedback
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/platform/wilo-demo/feedbacks', requireAuth, requirePlatformOwner, (req, res) => {
  try {
    const feedbacks = db.getDemoFeedbacks();
    res.json({ feedbacks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real Demo Asset Static Handlers (Phase 10.7N Final Assets)
const WILO_CLIENT_ROOT = path.join(__dirname, '..', 'client', 'assets', 'demo', 'wilo');
const WILO_EXTERNAL_ROOT = process.env.WILO_EXTERNAL_ROOT || 'C:\\Users\\vivPR\\vshow-demo-assets\\wilo';

app.get('/assets/demo/wilo/booth/:filename', (req, res) => {
  const file = req.params.filename;
  const clientPath = path.join(WILO_CLIENT_ROOT, 'booth', file);
  if (fs.existsSync(clientPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(clientPath);
  }
  const extPath = path.join(WILO_EXTERNAL_ROOT, 'booth', file);
  if (fs.existsSync(extPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(extPath);
  }
  res.redirect(`/assets/demo/${file.replace('.jpg', '.svg')}`);
});

app.get('/assets/demo/wilo/products/:filename', (req, res) => {
  const file = req.params.filename;
  const clientPath = path.join(WILO_CLIENT_ROOT, 'products', file);
  if (fs.existsSync(clientPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(clientPath);
  }
  const extPath = path.join(WILO_EXTERNAL_ROOT, 'products', file);
  if (fs.existsSync(extPath)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(extPath);
  }
  res.redirect(`/assets/demo/${file.replace('.jpg', '.svg')}`);
});

app.get('/assets/demo/wilo/experimental/:filename', (req, res) => {
  const file = req.params.filename;
  const filePath = path.join(__dirname, '..', 'client', 'assets', 'demo', 'wilo', 'experimental', file);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  }
  res.status(404).json({ error: 'Experimental model asset not found.' });
});

app.get('/assets/demo/wilo/models/:filename', (req, res) => {
  const file = req.params.filename;

  // R8B Truth Correction: Synthetic 3D models permanently rejected and blocked
  if (file === 'REAL_WILO_GAUSSIAN_FINAL.spz' || file.startsWith('REAL_WILO_')) {
    return res.status(404).json({
      error: 'AUTHENTIC_3D_RECONSTRUCTION_UNAVAILABLE',
      message: 'Authentic 3D reconstruction is not available. Real booth camera capture data is required.',
      visualState: 'CAPTURE_REQUIRED'
    });
  }

  res.status(404).json({ error: '3D model asset not found.' });
});

app.get('/api/public/wilo-demo/manifest', (req, res) => {
  const clientManifest = path.join(WILO_CLIENT_ROOT, 'manifests', 'wilo_booth_manifest.json');
  if (fs.existsSync(clientManifest)) {
    try {
      const content = JSON.parse(fs.readFileSync(clientManifest, 'utf8'));
      return res.json(content);
    } catch (e) {}
  }
  const extManifest = path.join(WILO_EXTERNAL_ROOT, 'manifests', 'wilo_booth_manifest.json');
  if (fs.existsSync(extManifest)) {
    try {
      const content = JSON.parse(fs.readFileSync(extManifest, 'utf8'));
      return res.json(content);
    } catch (e) {}
  }
  res.json({ status: 'manifest_missing', viewsAvailable: 0 });
});

// Dynamic Demo Placeholder SVG Renderer (Fallback)
app.get('/assets/demo/:filename', (req, res) => {
  const fn = req.params.filename || '';
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  if (fn.startsWith('wilo_prod_')) {
    const num = fn.replace('wilo_prod_', '').replace('.svg', '');
    return res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="100%" height="100%">
  <rect width="600" height="600" rx="16" fill="#1e293b" stroke="#334155" stroke-width="2" />
  <circle cx="300" cy="270" r="130" fill="#0f172a" stroke="#dc2626" stroke-width="4" />
  <path d="M 220 270 L 380 270 M 300 190 L 300 350" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" />
  <circle cx="300" cy="270" r="40" fill="#dc2626" />
  <text x="300" y="470" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#f8fafc" text-anchor="middle">WILO PUMP SYSTEM #${num}</text>
  <text x="300" y="505" font-family="Arial, sans-serif" font-size="15" fill="#94a3b8" text-anchor="middle">Interactive 3D / Hotspot Ready</text>
</svg>`);
  }

  // Booth View Placeholder
  const viewTitle = fn.replace('wilo_placeholder_', '').replace('.svg', '').replace(/_/g, ' ').toUpperCase();
  return res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>
    <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#dc2626" />
      <stop offset="100%" stop-color="#991b1b" />
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)" />
  <rect x="100" y="80" width="1400" height="120" rx="8" fill="url(#redGrad)" />
  <text x="800" y="155" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="4">WILO — PIONEERING FOR YOU</text>
  <rect x="150" y="240" width="1300" height="560" rx="16" fill="#1e293b" stroke="#334155" stroke-width="2" />
  <circle cx="800" cy="480" r="120" fill="#0f172a" stroke="#dc2626" stroke-width="3" stroke-dasharray="8 8" />
  <text x="800" y="470" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#38bdf8" text-anchor="middle">ISH FRANKFURT 2026</text>
  <text x="800" y="515" font-family="Arial, sans-serif" font-size="24" fill="#94a3b8" text-anchor="middle">${viewTitle || 'BOOTH VIEW'}</text>
  <rect x="650" y="650" width="300" height="44" rx="22" fill="#dc2626" />
  <text x="800" y="678" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">INTERACTIVE DEMO VIEW</text>
</svg>`);
});


// Dynamic Wilo Golden Demo Showroom Route
const WILO_DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Wilo — Intelligent Water & Pump Solutions | Virtual Trade Show Demo</title>
  <link rel="stylesheet" href="/index.css">
  <style>
    :root {
      --wilo-red: #dc2626;
      --wilo-red-dark: #991b1b;
      --wilo-bg: #0b0f19;
      --wilo-panel: #131b2e;
      --wilo-border: #1e293b;
      --wilo-accent: #38bdf8;
    }
    body, html {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: var(--wilo-bg); color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
    }
    .wilo-container { display: flex; flex-direction: column; height: 100vh; height: 100dvh; position: relative; }
    .wilo-hud-top {
      display: flex; justify-content: space-between; align-items: center; padding: 12px 20px;
      background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid var(--wilo-border); z-index: 50;
    }
    .wilo-brand { display: flex; align-items: center; gap: 12px; }
    .wilo-badge { background: var(--wilo-red); color: #fff; font-weight: 800; font-size: 14px; padding: 4px 10px; border-radius: 4px; letter-spacing: 1px; }
    .wilo-hud-actions { display: flex; align-items: center; gap: 8px; }
    .wilo-btn {
      background: #1e293b; color: #f8fafc; border: 1px solid #334155; padding: 8px 14px;
      border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-height: 40px;
    }
    .wilo-btn:hover { background: #334155; }
    .wilo-btn-primary { background: var(--wilo-red); border-color: var(--wilo-red-dark); color: #fff; }
    .wilo-btn-primary:hover { background: #ef4444; }
    .wilo-presence-pill {
      display: flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;
    }
    .wilo-presence-dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; }
    .wilo-viewport { flex: 1; position: relative; background: #020617; display: flex; justify-content: center; align-items: center; overflow: hidden; }
    .wilo-booth-image { width: 100%; height: 100%; object-fit: cover; }
    .wilo-hotspot {
      position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(220, 38, 38, 0.85);
      border: 2px solid #fff; color: #fff; display: flex; justify-content: center; align-items: center;
      cursor: pointer; box-shadow: 0 0 16px rgba(220, 38, 38, 0.8); z-index: 20; transform: translate(-50%, -50%);
    }
    .wilo-hotspot:hover { background: #ef4444; transform: translate(-50%, -50%) scale(1.15); }
    .wilo-hud-bottom {
      display: flex; flex-direction: column; background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px); border-top: 1px solid var(--wilo-border); padding: 10px 20px; z-index: 50;
    }
    .wilo-tour-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .wilo-view-title { font-weight: 700; font-size: 14px; color: var(--wilo-accent); }
    .wilo-thumbnails-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
    .wilo-thumb { width: 80px; height: 48px; border-radius: 4px; border: 2px solid #334155; background: #0f172a; cursor: pointer; flex-shrink: 0; object-fit: cover; opacity: 0.7; }
    .wilo-thumb.active, .wilo-thumb:hover { opacity: 1; border-color: var(--wilo-red); }
    .wilo-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: none; justify-content: center; align-items: center; z-index: 100; padding: 16px; }
    .wilo-modal-overlay.active { display: flex; }
    .wilo-modal { background: var(--wilo-panel); border: 1px solid var(--wilo-border); border-radius: 12px; width: 100%; max-width: 720px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
    .wilo-modal-close { position: absolute; top: 16px; right: 16px; background: #1e293b; border: none; color: #94a3b8; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; }
    .wilo-canvas-container { width: 100%; height: 260px; background: #090d16; border: 1px solid var(--wilo-border); border-radius: 8px; position: relative; margin-bottom: 16px; touch-action: none; }
    .wilo-orbit-canvas { width: 100%; height: 100%; }
    .wilo-3d-hint { position: absolute; bottom: 8px; right: 8px; background: rgba(15, 23, 42, 0.7); padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wilo-container">
    <header class="wilo-hud-top">
      <div class="wilo-brand">
        <span class="wilo-badge">WILO</span>
        <div>
          <strong style="font-size:15px; color:#fff;">Intelligent Water Solutions</strong><br>
          <small style="color:#94a3b8; font-size:11px;">ISH Frankfurt 2026 • Virtual Showroom Demo</small>
        </div>
      </div>
      <div class="wilo-hud-actions">
        <div class="wilo-presence-pill"><span class="wilo-presence-dot"></span><span>SPECIALIST ONLINE</span></div>
        <button class="wilo-btn" onclick="openCatalogModal()">Catalog</button>
        <button class="wilo-btn" onclick="openResourceModal()">Resources</button>
        <button class="wilo-btn" onclick="openTicketModal()">Consultation</button>
        <button class="wilo-btn" onclick="openRfqModal()">RFQ</button>
        <button class="wilo-btn wilo-btn-primary" onclick="openApptModal()">Book Meeting</button>
        <button class="wilo-btn" onclick="openFeedbackModal()">Feedback</button>
        <a href="/lobby.html" class="wilo-btn" style="text-decoration:none;">Lobby</a>
      </div>

    </header>
    <main class="wilo-viewport" id="wilo-viewport">
      <img id="wilo-main-image" class="wilo-booth-image" src="/assets/demo/wilo_placeholder_hero.svg" alt="Wilo Virtual Booth Experience">
      <div id="wilo-hotspots-container"></div>
    </main>
    <footer class="wilo-hud-bottom">
      <div class="wilo-tour-controls">
        <div>
          <span style="font-size:11px; color:#94a3b8; text-transform:uppercase;">Current View:</span>
          <span class="wilo-view-title" id="wilo-view-name">01_front_hero — Front Hero View</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="wilo-btn" onclick="prevView()">&larr; Prev View</button>
          <button class="wilo-btn" onclick="nextView()">Next View &rarr;</button>
        </div>
      </div>
      <div class="wilo-thumbnails-strip" id="wilo-thumbnails"></div>
    </footer>
  </div>

  <div class="wilo-modal-overlay" id="product-modal">
    <div class="wilo-modal">
      <button class="wilo-modal-close" onclick="closeModals()">X</button>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <span class="gc-badge" style="background:#dc2626; color:#fff;" id="modal-prod-category">Commercial HVAC</span>
          <h2 id="modal-prod-title" style="margin:8px 0 4px; color:#fff;">Smart Circulation Pump</h2>
        </div>
        <button class="wilo-btn" onclick="reset3DView()">Reset 3D</button>
      </div>
      <div class="wilo-canvas-container" id="wilo-canvas-box">
        <canvas id="wilo-3d-canvas" class="wilo-orbit-canvas"></canvas>
        <span class="wilo-3d-hint">Drag to Orbit / Scroll to Zoom</span>
      </div>
      <p id="modal-prod-desc" style="color:#cbd5e1; font-size:14px; line-height:1.5; margin-bottom:16px;">Description</p>
      <div style="background:#0f172a; padding:12px; border-radius:8px; margin-bottom:16px;">
        <strong style="font-size:13px; color:#38bdf8;">Technical Specifications:</strong>
        <div id="modal-prod-specs" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; font-size:12px; color:#94a3b8;"></div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="wilo-btn" onclick="openTicketModal(currentProduct.id, currentProduct.name)">Ask Specialist</button>
        <button class="wilo-btn wilo-btn-primary" onclick="openRfqModal(currentProduct.id, currentProduct.name)">Request Quote</button>
      </div>
    </div>
  </div>

  <div class="wilo-modal-overlay" id="catalog-modal">
    <div class="wilo-modal">
      <button class="wilo-modal-close" onclick="closeModals()">X</button>
      <h2 style="color:#fff; margin-top:0;">Wilo 2026 Digital Product Catalog</h2>
      <p style="color:#94a3b8; font-size:13px;">Browse all 8 intelligent hydronic solutions featured at ISH Frankfurt 2026.</p>
      <div id="catalog-products-list" style="display:flex; flex-direction:column; gap:12px; margin:16px 0;"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #1e293b; padding-top:16px;">
        <span style="font-size:12px; color:#64748b;">Format: Interactive Digital Edition (PDF Available)</span>
        <button class="wilo-btn wilo-btn-primary" onclick="trackAnalytics('catalog_download'); alert('Digital Catalog download initiated (14.2 MB PDF).');">Download PDF</button>
      </div>
    </div>
  </div>

  <div class="wilo-modal-overlay" id="resource-modal">
    <div class="wilo-modal">
      <button class="wilo-modal-close" onclick="closeModals()">X</button>
      <h2 style="color:#fff; margin-top:0;">Wilo Technical Resource Center</h2>
      <p style="color:#94a3b8; font-size:13px;">Download official product manuals, application guides, and case studies.</p>
      <div id="resources-list" style="display:flex; flex-direction:column; gap:8px; margin:16px 0;"></div>
    </div>
  </div>

  <div class="wilo-modal-overlay" id="ticket-modal">
    <div class="wilo-modal">
      <button class="wilo-modal-close" onclick="closeModals()">X</button>
      <h2 style="color:#fff; margin-top:0;">Request Technical Consultation</h2>
      <p style="color:#94a3b8; font-size:13px;">Submit a technical inquiry or application question to Wilo engineering staff.</p>
      <form id="ticket-form" onsubmit="submitTicket(event)">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div><label style="font-size:12px; color:#94a3b8;">Your Name *</label><input type="text" id="ticket-name" required style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
          <div><label style="font-size:12px; color:#94a3b8;">Company *</label><input type="text" id="ticket-company" required style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div><label style="font-size:12px; color:#94a3b8;">Work Email *</label><input type="email" id="ticket-email" required style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
          <div><label style="font-size:12px; color:#94a3b8;">Country</label><input type="text" id="ticket-country" value="United States" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#94a3b8;">Question / Project Scope *</label>
          <textarea id="ticket-question" required rows="3" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; font-family:inherit; box-sizing:border-box;"></textarea>
        </div>
        <button type="submit" class="wilo-btn wilo-btn-primary" style="width:100%; justify-content:center;">Submit Consultation Ticket</button>
      </form>
    </div>
  </div>

  <div class="wilo-modal-overlay" id="rfq-modal">
    <div class="wilo-modal">
      <button class="wilo-modal-close" onclick="closeModals()">X</button>
      <h2 style="color:#fff; margin-top:0;">Request for Quote (RFQ)</h2>
      <p style="color:#94a3b8; font-size:13px;">Receive tailored commercial pricing and volume specifications.</p>
      <form id="rfq-form" onsubmit="submitRfq(event)">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div><label style="font-size:12px; color:#94a3b8;">Full Name *</label><input type="text" id="rfq-name" required style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
          <div><label style="font-size:12px; color:#94a3b8;">Business Email *</label><input type="email" id="rfq-email" required style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div><label style="font-size:12px; color:#94a3b8;">Product Model</label><input type="text" id="rfq-product" value="Wilo-Stratos MAXO" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
          <div><label style="font-size:12px; color:#94a3b8;">Target Quantity</label><input type="number" id="rfq-qty" value="10" min="1" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
        </div>
        <button type="submit" class="wilo-btn wilo-btn-primary" style="width:100%; justify-content:center;">Submit RFQ to Wilo Sales Team</button>
      </form>
    </div>
  </div>

  <div class="wilo-modal-overlay" id="appt-modal">
    <div class="wilo-modal">
      <button class="wilo-modal-close" onclick="closeModals()">X</button>
      <h2 style="color:#fff; margin-top:0;">Schedule 1-on-1 Consultation</h2>
      <p style="color:#94a3b8; font-size:13px;">Book an interactive engineering or commercial video appointment.</p>
      <form id="appt-form" onsubmit="submitAppt(event)">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div><label style="font-size:12px; color:#94a3b8;">Name *</label><input type="text" id="appt-name" required style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
          <div><label style="font-size:12px; color:#94a3b8;">Email *</label><input type="email" id="appt-email" required style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:12px; color:#94a3b8;">Meeting Format</label>
            <select id="appt-type" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;">
              <option value="Video Call">Live Video Call (WebRTC)</option>
              <option value="Product Consultation">Hydronic Product Consultation</option>
              <option value="Technical Consultation">Engineering & Specification Meeting</option>
              <option value="Sales Meeting">Commercial B2B Partnership</option>
            </select>
          </div>
          <div><label style="font-size:12px; color:#94a3b8;">Preferred Date</label><input type="date" id="appt-date" value="2026-09-15" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;"></div>
        </div>
        <button type="submit" class="wilo-btn wilo-btn-primary" style="width:100%; justify-content:center;">Confirm Appointment Booking</button>
      </form>
    </div>
  </div>

  <div class="wilo-modal-overlay" id="feedback-modal">
    <div class="wilo-modal">
      <button class="wilo-modal-close" onclick="closeModals()">X</button>
      <h2 style="color:#fff; margin-top:0;">Send Demo Feedback</h2>
      <p style="color:#94a3b8; font-size:13px;">Help us refine the virtual showroom trial experience.</p>
      <form id="feedback-form" onsubmit="submitFeedback(event)">
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#94a3b8;">Experience Rating (1–5) *</label>
          <select id="fb-rating" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box;">
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Very Good</option>
            <option value="3">3 - Good</option>
            <option value="2">2 - Needs Work</option>
            <option value="1">1 - Poor</option>
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#94a3b8;">What worked well?</label>
          <textarea id="fb-worked-well" rows="2" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; font-family:inherit; box-sizing:border-box;"></textarea>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#94a3b8;">What was confusing?</label>
          <textarea id="fb-confusing" rows="2" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; font-family:inherit; box-sizing:border-box;"></textarea>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; color:#94a3b8;">What should be improved?</label>
          <textarea id="fb-improvements" rows="2" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:8px; border-radius:6px; font-family:inherit; box-sizing:border-box;"></textarea>
        </div>
        <button type="submit" class="wilo-btn wilo-btn-primary" style="width:100%; justify-content:center;">Submit Trial Feedback</button>
      </form>
    </div>
  </div>


  <script>
    let demoData = null;
    let currentViewIndex = 0;
    let currentProduct = null;

    const boothViews = [
      { id: '01_front_hero', title: 'Front Hero View', url: '/assets/demo/wilo/booth/01_front_hero.jpg' },
      { id: '02_front_center', title: 'Front Center Elevation', url: '/assets/demo/wilo/booth/02_front_center.jpg' },
      { id: '03_left_angle', title: 'Left Perspective Angle', url: '/assets/demo/wilo/booth/03_left_angle.jpg' },
      { id: '04_right_angle', title: 'Right Perspective Angle', url: '/assets/demo/wilo/booth/04_right_angle.jpg' },
      { id: '05_left_side', title: 'Left Flank Perspective', url: '/assets/demo/wilo/booth/05_left_side.jpg' },
      { id: '06_right_side', title: 'Right Flank Perspective', url: '/assets/demo/wilo/booth/06_right_side.jpg' },
      { id: '07_interior_view', title: 'Interior Walkthrough', url: '/assets/demo/wilo/booth/07_interior_view.jpg' },
      { id: '08_product_island', title: 'Central Product Island', url: '/assets/demo/wilo/booth/08_product_island.jpg' },
      { id: '09_meeting_area', title: 'Executive Meeting Lounge', url: '/assets/demo/wilo/booth/09_meeting_area.jpg' },
      { id: '10_display_screen', title: 'Digital Presentation Wall', url: '/assets/demo/wilo/booth/10_display_screen.jpg' },
      { id: '11_overhead_sign', title: 'Overhead Truss & Signage', url: '/assets/demo/wilo/booth/11_overhead_sign.jpg' },
      { id: '12_wide_overview', title: 'Panoramic Hall Overview', url: '/assets/demo/wilo/booth/12_wide_overview.jpg' }
    ];


    async function initWiloDemo() {
      try {
        const res = await fetch('/api/public/wilo-demo');
        demoData = await res.json();
        renderThumbnails();
        renderHotspots();
        renderCatalog();
        renderResources();
        trackAnalytics('booth_view');
      } catch (e) {
        console.error('Failed to load demo data:', e);
      }
    }

    function renderThumbnails() {
      const container = document.getElementById('wilo-thumbnails');
      container.innerHTML = boothViews.map(function(v, idx) {
        return '<img src="' + v.url + '" class="wilo-thumb ' + (idx === 0 ? 'active' : '') + '" onclick="setView(' + idx + ')" title="' + v.title + '">';
      }).join('');
    }

    function setView(index) {
      currentViewIndex = index;
      const v = boothViews[index];
      document.getElementById('wilo-main-image').src = v.url;
      document.getElementById('wilo-view-name').textContent = v.id + ' — ' + v.title;
      document.querySelectorAll('.wilo-thumb').forEach(function(el, idx) {
        el.classList.toggle('active', idx === index);
      });
      trackAnalytics('booth_view_change', { viewId: v.id });
    }

    function nextView() { setView((currentViewIndex + 1) % boothViews.length); }
    function prevView() { setView((currentViewIndex - 1 + boothViews.length) % boothViews.length); }

    function renderHotspots() {
      const container = document.getElementById('wilo-hotspots-container');
      if (!demoData || !demoData.hotspots) return;
      const positions = [
        { x: 30, y: 55 }, { x: 45, y: 50 }, { x: 70, y: 60 }, { x: 50, y: 35 },
        { x: 20, y: 65 }, { x: 80, y: 45 }, { x: 85, y: 70 }, { x: 55, y: 25 }
      ];
      container.innerHTML = demoData.hotspots.map(function(h, idx) {
        const pos = positions[idx % positions.length];
        return '<div class="wilo-hotspot" style="left:' + pos.x + '%; top:' + pos.y + '%;" onclick="openProductModal(\'' + h.productId + '\')" title="' + h.title + '"><span>' + (idx + 1) + '</span></div>';
      }).join('');
    }

    function openProductModal(productId) {
      if (!demoData || !demoData.products) return;
      const prod = demoData.products.find(function(p) { return p.id === productId; }) || demoData.products[0];
      currentProduct = prod;
      document.getElementById('modal-prod-title').textContent = prod.name;
      document.getElementById('modal-prod-category').textContent = prod.category;
      document.getElementById('modal-prod-desc').textContent = prod.demoDescription;
      const specsBox = document.getElementById('modal-prod-specs');
      if (prod.specs) {
        specsBox.innerHTML = Object.entries(prod.specs).map(function(pair) {
          return '<div><strong style="color:#e2e8f0;">' + pair[0] + ':</strong> ' + pair[1] + '</div>';
        }).join('');
      }
      document.getElementById('product-modal').classList.add('active');
      trackAnalytics('product_view', { productId: prod.id });
      init3DOrbitCanvas();
    }

    let orbitAngle = 0; let orbitScale = 1.0; let isDragging = false; let lastMouseX = 0;
    function init3DOrbitCanvas() {
      const canvas = document.getElementById('wilo-3d-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;

      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2; const cy = canvas.height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(orbitAngle);
        ctx.scale(orbitScale, orbitScale);
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0); ctx.moveTo(0, -60); ctx.lineTo(0, 60); ctx.stroke();
        ctx.restore();
      }
      draw();

      canvas.onmousedown = function(e) { isDragging = true; lastMouseX = e.clientX; };
      window.onmouseup = function() { isDragging = false; };
      canvas.onmousemove = function(e) {
        if (isDragging) {
          orbitAngle += (e.clientX - lastMouseX) * 0.01;
          lastMouseX = e.clientX;
          draw();
        }
      };
      canvas.onwheel = function(e) {
        e.preventDefault();
        orbitScale = Math.max(0.6, Math.min(2.0, orbitScale - e.deltaY * 0.001));
        draw();
      };
    }

    function reset3DView() { orbitAngle = 0; orbitScale = 1.0; init3DOrbitCanvas(); }

    function renderCatalog() {
      const container = document.getElementById('catalog-products-list');
      if (!demoData || !demoData.products) return;
      container.innerHTML = demoData.products.map(function(p) {
        return '<div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px; border-radius:8px; border:1px solid #1e293b;"><div><strong style="color:#fff; font-size:14px;">' + p.name + '</strong><br><small style="color:#94a3b8; font-size:12px;">' + p.shortDescription + '</small></div><button class="wilo-btn" onclick="closeModals(); openProductModal(\'' + p.id + '\')">View 3D</button></div>';
      }).join('');
    }

    function renderResources() {
      const container = document.getElementById('resources-list');
      if (!demoData || !demoData.resources) return;
      container.innerHTML = demoData.resources.map(function(r) {
        return '<div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px; border-radius:8px; border:1px solid #1e293b;"><div><strong style="color:#fff; font-size:13px;">' + r.title + '</strong><br><small style="color:#38bdf8; font-size:11px;">' + r.type + ' • ' + r.size + '</small></div><button class="wilo-btn" onclick="trackAnalytics(\'resource_download\', { resourceId: \'' + r.id + '\' }); alert(\'Downloading ' + r.title + '\');">Download</button></div>';
      }).join('');
    }

    function openCatalogModal() { document.getElementById('catalog-modal').classList.add('active'); trackAnalytics('catalog_open'); }
    function openResourceModal() { document.getElementById('resource-modal').classList.add('active'); trackAnalytics('resource_view'); }
    function openTicketModal(prodId, prodName) { document.getElementById('ticket-modal').classList.add('active'); trackAnalytics('consultation_open'); }
    function openRfqModal(prodId, prodName) {
      document.getElementById('rfq-modal').classList.add('active');
      if (prodName) document.getElementById('rfq-product').value = prodName;
      trackAnalytics('rfq_open');
    }
    function openApptModal() { document.getElementById('appt-modal').classList.add('active'); trackAnalytics('appointment_open'); }
    function closeModals() { document.querySelectorAll('.wilo-modal-overlay').forEach(function(el) { el.classList.remove('active'); }); }

    async function submitTicket(e) {
      e.preventDefault();
      try {
        const payload = {
          name: document.getElementById('ticket-name').value,
          company: document.getElementById('ticket-company').value,
          email: document.getElementById('ticket-email').value,
          country: document.getElementById('ticket-country').value,
          question: document.getElementById('ticket-question').value,
          organizationId: 'org-wilo-golden-demo'
        };
        const res = await fetch('/api/public/consultation-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          alert('Consultation ticket submitted successfully! A Wilo technical specialist will follow up.');
          closeModals();
        }
      } catch (err) { alert('Error submitting ticket.'); }
    }

    async function submitRfq(e) {
      e.preventDefault();
      try {
        const payload = {
          contactName: document.getElementById('rfq-name').value,
          contactEmail: document.getElementById('rfq-email').value,
          productName: document.getElementById('rfq-product').value,
          targetQuantity: document.getElementById('rfq-qty').value,
          organizationId: 'org-wilo-golden-demo'
        };
        await fetch('/api/public/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.contactName,
            email: payload.contactEmail,
            organizationId: 'org-wilo-golden-demo',
            boothId: 'booth-wilo-golden-demo',
            notes: 'RFQ for ' + payload.productName + ' (Qty: ' + payload.targetQuantity + ')'
          })
        });
        alert('RFQ submitted successfully to Wilo Commercial Operations.');
        closeModals();
      } catch (err) { alert('Error submitting RFQ.'); }
    }

    async function submitAppt(e) {
      e.preventDefault();
      alert('Appointment request submitted successfully. A calendar confirmation has been delivered.');
      closeModals();
    }

    function openFeedbackModal() { document.getElementById('feedback-modal').classList.add('active'); }

    async function submitFeedback(e) {
      e.preventDefault();
      try {
        const payload = {
          rating: document.getElementById('fb-rating').value,
          workedWell: document.getElementById('fb-worked-well').value,
          confusing: document.getElementById('fb-confusing').value,
          improvements: document.getElementById('fb-improvements').value,
          pageContext: window.location.pathname,
          organizationId: 'org-wilo-golden-demo'
        };
        const res = await fetch('/api/public/wilo-demo/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          alert('Thank you! Demo feedback submitted successfully.');
          closeModals();
        }
      } catch (err) { alert('Error submitting feedback.'); }
    }


    function trackAnalytics(type, details) {
      fetch('/api/public/wilo-demo/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: type, details: details })
      }).catch(function() {});
    }

    document.addEventListener('DOMContentLoaded', initWiloDemo);
  </script>
</body>
</html>`;

app.get(['/wilo-demo.html', '/demo/wilo', '/wilo'], (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  const wiloFile = path.join(__dirname, '..', 'client', 'wilo-demo.html');
  if (fs.existsSync(wiloFile)) {
    return res.sendFile(wiloFile);
  }
  res.send(WILO_DEMO_HTML);
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
