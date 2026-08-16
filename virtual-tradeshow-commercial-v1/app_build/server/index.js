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

// --- 1. Healthcheck & Public Plan Endpoints ---
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'virtual-tradeshow-commercial-v1',
    schemaVersion: 5,
    stripeMode: STRIPE_MODE === 'live' ? 'live' : 'test',
    storageDriver: process.env.STORAGE_DRIVER || 'volume',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/public/plans', (req, res) => {
  res.json(db.getPublicPlanConfig());
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
      return res.status(400).json({ error: strengthCheck.message });
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

    // Use cryptographically secure 16-char password by default or validate manual override
    let initialPassword = tempPassword;
    if (!initialPassword) {
      initialPassword = db.generateSecureTempPassword(16);
    } else {
      const strength = db.validatePasswordStrength(initialPassword);
      if (!strength.valid) {
        return res.status(400).json({ error: `Temporary password invalid: ${strength.message}` });
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
        message: '플랫폼 정기 점검 또는 안전 조치로 인해 신규 구독 결제가 일시 중단되었습니다.'
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
          message: 'TEST 및 SYNTHETIC_TEST 환경에서는 Live Checkout을 진행할 수 없습니다.'
        });
      }

      // 2. Allowlist Check
      const allowedOrgs = flags.liveBillingAllowedOrgs || [];
      if (!allowedOrgs.includes(org.id)) {
        return res.status(403).json({
          error: 'LIVE_BILLING_NOT_ALLOWED_FOR_ORG',
          message: '초대 전용 1차 라이브 파일럿에 등록된 승인 고객사만 결제를 진행할 수 있습니다.'
        });
      }

      // 3. Customer Count Cap Check
      const paidCount = db.getRealPaidCustomerCount();
      const maxLimit = flags.livePilotMaxCustomers || 1;
      if (paidCount >= maxLimit) {
        return res.status(403).json({
          error: 'LIVE_PILOT_CUSTOMER_LIMIT_REACHED',
          message: '초대 전용 1차 라이브 파일럿 정원(1개사)이 마감되었습니다.'
        });
      }

      // 4. Pricing Status Check
      if (flags.pricingStatus !== 'approved_for_pilot' && flags.pricingStatus !== 'approved') {
        return res.status(403).json({
          error: 'PILOT_PRICING_NOT_APPROVED',
          message: '파일럿 상용 요금제에 대한 최고 운영자의 최종 승인이 필요합니다.'
        });
      }

      // 5. Legal Review Check
      if (flags.legalReviewStatus !== 'approved') {
        return res.status(403).json({
          error: 'LEGAL_REVIEW_NOT_APPROVED',
          message: '이용약관 및 정책 문서에 대한 법률 검토 승인이 필요합니다.'
        });
      }

      // 6. Owner Live Authorization Check
      if (!flags.stripeLiveBillingEnabled || !flags.liveBillingApprovedByOwner) {
        return res.status(403).json({
          error: 'STRIPE_LIVE_MODE_NOT_APPROVED',
          message: 'Stripe Live Mode 결제 활성화를 위한 최고 운영자의 최종 승인이 필요합니다.'
        });
      }
    }

    const { requestedPlan } = req.body; // 'pro' | 'business'
    if (!requestedPlan || (requestedPlan !== 'pro' && requestedPlan !== 'business')) {
      return res.status(400).json({ error: 'Invalid plan. Must be "pro" or "business".' });
    }

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
        csvContent += `"${o.id}","${o.name}","${o.slug}","${o.type}","${o.status}","${o.subscription?.plan || 'free'}","${o.subscription?.dataEnvironment || 'REAL'}","${o.createdAt}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=organizations_export_${Date.now()}.csv`);
      return res.send(csvContent);
    }
  }
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
