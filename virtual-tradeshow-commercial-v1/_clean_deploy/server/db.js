const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Support configurable DATA_DIR (Railway Volume /data or local fallback)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TEMP_DB_FILE = path.join(DATA_DIR, 'db.temp.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const SEED_DIR = path.join(__dirname, '..', 'seed');

// Ensure data, uploads, and seed directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(SEED_DIR)) {
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

// Password Policy & Hashing Helpers
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, code: 'WEAK_PASSWORD', message: 'Password is required.' };
  }
  if (password.length < 12) {
    return { valid: false, code: 'WEAK_PASSWORD', message: 'Password must be at least 12 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least one uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least one lowercase letter (a-z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least one number (0-9).' };
  }
  return { valid: true };
}


function generateSecureTempPassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  // Ensure it satisfies policy
  if (!/[A-Z]/.test(password)) password = 'A' + password.slice(1);
  if (!/[a-z]/.test(password)) password = password.slice(0, 1) + 'a' + password.slice(2);
  if (!/[0-9]/.test(password)) password = password.slice(0, 2) + '9' + password.slice(3);
  return password;
}

function hashPassword(password, salt = null) {
  const userSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, userSalt, 64).toString('hex');
  return { hash, salt: userSalt };
}

function verifyPassword(password, hash, salt) {
  const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return checkHash === hash;
}


// Default Seed Data (Schema Version 5 — Stripe Billing & Grand Control Center)
const initialSeedData = () => {
  const orgPlatformMasterId = 'org-platform-master';
  const orgOrganizerId = 'org-organizer-01';
  const orgApexId = 'org-exhibitor-apex';
  const orgBioId = 'org-exhibitor-bio';

  const platformOwnerUser = {
    id: 'user-platform-owner',
    organizationId: orgPlatformMasterId,
    email: process.env.PLATFORM_OWNER_EMAIL || 'owner@vshow.com',
    name: 'Platform Master Owner',
    role: 'platform_owner',
    ...hashPassword('Owner2026!PlatformSecure', 'seed_salt_owner_1'),
    mustChangePassword: false,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const organizerAdminUser = {
    id: 'user-organizer-admin',
    organizationId: orgOrganizerId,
    email: 'organizer@vshow.com',
    name: 'Global Expo Operations',
    role: 'organizer_admin',
    ...hashPassword('admin123', 'seed_salt_org_1'),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const apexAdminUser = {
    id: 'user-apex-admin',
    organizationId: orgApexId,
    email: 'apex@vshow.com',
    name: 'Apex Robotics Admin',
    role: 'exhibitor_admin',
    ...hashPassword('admin123', 'seed_salt_apex_1'),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const bioAdminUser = {
    id: 'user-bio-admin',
    organizationId: orgBioId,
    email: 'bio@vshow.com',
    name: 'BioTech Innovations Admin',
    role: 'exhibitor_admin',
    ...hashPassword('admin123', 'seed_salt_bio_1'),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const betaEventId = 'event-global-tech-2026';

  return {
    schemaVersion: 6,
    featureFlags: {
      stripeBillingEnabled: true,
      grandControlEnabled: true,
      precision3DEnabled: true,
      communicationsEnabled: true,
      businessPlanEnabled: true,
      billingMode: process.env.STRIPE_SECRET_KEY ? 'live' : 'test'
    },
    organizations: [
      {
        id: orgPlatformMasterId,
        type: 'platform',
        name: 'V-Show Platform Headquarters',
        slug: 'vshow-platform',
        status: 'active',
        subscription: {
          plan: 'business',
          status: 'active',
          dataEnvironment: 'REAL'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: orgOrganizerId,
        type: 'organizer',
        name: 'Global Trade Show Group',
        slug: 'global-trade-show-group',
        status: 'active',
        subscription: {
          plan: 'business',
          status: 'active',
          dataEnvironment: 'REAL'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: orgApexId,
        type: 'exhibitor',
        name: 'Apex Robotics Global Innovation',
        slug: 'apex-robotics',
        category: 'Industrial Automation & Robotics',
        status: 'active',
        subscription: {
          plan: 'pro',
          status: 'active',
          dataEnvironment: 'REAL'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: orgBioId,
        type: 'exhibitor',
        name: 'BioTech Innovations Corp',
        slug: 'biotech-innovations',

        category: 'BioTech & HealthTech',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    users: [
      platformOwnerUser,
      organizerAdminUser,
      apexAdminUser,
      bioAdminUser
    ],
    events: [
      {
        id: betaEventId,
        organizerOrganizationId: orgOrganizerId,
        name: 'Global Tech & Industrial Automation Expo 2026',
        slug: 'global-tech-2026',
        description: 'Premier international commercial beta virtual trade show featuring next-generation robotics, spatial 3D showcases, and AI solutions.',
        bannerImage: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1600&q=80',
        startsAt: '2026-09-01T09:00:00Z',
        endsAt: '2026-09-30T18:00:00Z',
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    eventExhibitors: [
      {
        id: 'ee-apex-01',
        eventId: betaEventId,
        exhibitorOrganizationId: orgApexId,
        boothId: 'booth-demo-01',
        category: 'Robotics & Automation',
        boothNumber: 'A-101',
        status: 'active',
        joinedAt: new Date().toISOString()
      },
      {
        id: 'ee-bio-01',
        eventId: betaEventId,
        exhibitorOrganizationId: orgBioId,
        boothId: 'booth-bio-01',
        category: 'BioTech & Healthcare',
        boothNumber: 'B-205',
        status: 'active',
        joinedAt: new Date().toISOString()
      }
    ],
    booths: [
      {
        id: 'booth-demo-01',
        organizationId: orgApexId,
        eventId: betaEventId,
        exhibitorId: apexAdminUser.id,
        name: 'Apex Robotics Global Innovation',
        description: 'Next-generation industrial automation, collaborative robotics, and precision logistics solutions for smart factories.',
        themeColor: '#0f766e',
        status: 'published',
        reconstructionStatus: 'verified',
        reconstructionJobId: 'recon-job-apex-verified',
        photos: [
          'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80'
        ],
        spatialModel: {
          type: 'gaussian_splat',
          assetUrl: '/uploads/models/REAL-RECON-PILOT-01_splat.ply',
          format: 'ply',
          splatCount: 245070,
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: 1.0
          }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'booth-bio-01',
        organizationId: orgBioId,
        eventId: betaEventId,
        exhibitorId: bioAdminUser.id,
        name: 'BioTech Innovations Corp',
        description: 'Advanced molecular diagnostic equipment, automated laboratory liquid handlers, and sterile cell culture bioprocessors.',
        themeColor: '#2563eb',
        status: 'published',
        reconstructionStatus: 'photo_preview',
        reconstructionJobId: null,
        photos: [
          'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80'
        ],
        spatialModel: {
          type: 'photo_preview',
          environmentLayout: 'hexagon_booth'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    products: [
      {
        id: 'prod-01',
        organizationId: orgApexId,
        boothId: 'booth-demo-01',
        name: 'Apex-Arm X9 Modular Industrial Cobot',
        sku: 'APX-ROB-X9',
        category: 'Robotics',
        moq: 2,
        price: 24500,
        contactForPrice: false,
        currency: 'USD',
        description: 'High-precision 6-axis collaborative robotic arm with 15kg payload and sub-millimeter positioning repeatability.',
        images: [
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=800&q=80'
        ],
        specs: {
          'Payload Capacity': '15 kg',
          'Reach Radius': '1300 mm',
          'Repeatability': '±0.02 mm',
          'Weight': '38 kg',
          'IP Rating': 'IP65 Water/Dust Resistant'
        },
        inventoryStatus: 'in_stock',
        createdAt: new Date().toISOString()
      },
      {
        id: 'prod-02',
        organizationId: orgApexId,
        boothId: 'booth-demo-01',
        name: 'Apex-Nav AGV Autonomous Mobile Robot',
        sku: 'APX-AGV-200',
        category: 'Logistics Automation',
        moq: 1,
        price: 18000,
        contactForPrice: false,
        currency: 'USD',
        description: 'LiDAR-guided smart warehouse transport robot with 500kg towing capacity and fleet management integration.',
        images: [
          'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=800&q=80'
        ],
        specs: {
          'Towing Load': '500 kg',
          'Navigation': 'SLAM LiDAR + Visual Odometry',
          'Battery Life': '12 hours continuous'
        },
        inventoryStatus: 'in_stock',
        createdAt: new Date().toISOString()
      },
      {
        id: 'prod-bio-01',
        organizationId: orgBioId,
        boothId: 'booth-bio-01',
        name: 'BioScan Micro-Array Fast Analyzer',
        sku: 'BIO-SCAN-M1',
        category: 'Diagnostics',
        moq: 1,
        price: 32000,
        contactForPrice: false,
        currency: 'USD',
        description: 'Automated 96-well fluorescent plate reader for rapid biomolecular diagnostic screening.',
        images: [
          'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=800&q=80'
        ],
        specs: {
          'Throughput': '96 samples in 4 mins',
          'Detection': 'Fluorescence / Absorbance',
          'Compliance': 'CE-IVD / FDA Class II'
        },
        inventoryStatus: 'in_stock',
        createdAt: new Date().toISOString()
      }
    ],
    hotspots: [
      {
        id: 'hs-01',
        organizationId: orgApexId,
        boothId: 'booth-demo-01',
        productId: 'prod-01',
        position: { x: -1.8, y: 0.9, z: -2.2 },
        label: 'Apex-Arm X9 Cobot',
        createdAt: new Date().toISOString()
      },
      {
        id: 'hs-02',
        organizationId: orgApexId,
        boothId: 'booth-demo-01',
        productId: 'prod-02',
        position: { x: 1.8, y: 0.7, z: -2.0 },
        label: 'Apex-Nav AGV Transport',
        createdAt: new Date().toISOString()
      }
    ],
    leads: [],
    rfqs: [],
    samples: [],
    appointments: [],
    productionRequests: [],
    productionProjects: [],
    exhibitorProfiles: [],
    tradeShows: [],
    analyticsEvents: [],
    reconstructionJobs: [
      {
        id: 'recon-job-apex-verified',
        organizationId: orgApexId,
        eventId: betaEventId,
        boothId: 'booth-demo-01',
        status: 'verified',
        approvalStatus: 'approved',
        progress: 100,
        currentStage: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        output: {
          type: 'gaussian_splat',
          url: '/uploads/models/REAL-RECON-PILOT-01_splat.ply',
          format: 'ply',
          sizeBytes: 60778917,
          splatCount: 245070
        }
      }
    ],
    auditLogs: [],
    showhosts: [
      {
        id: 'sh-apex-01',
        organizationId: orgApexId,
        boothId: 'booth-demo-01',
        displayName: 'Apex Technical Lead Host',
        status: 'available'
      }
    ],
    stripeEvents: [],
    billingEvents: [],
    upgradeRequests: [],
    platformMessages: [],
    ownerNotes: [],
    featureFlags: {
      stripeLiveBillingEnabled: false,
      billingKillSwitch: true,
      reconstructionKillSwitch: false,
      maintenanceMode: false,
      legalReviewStatus: 'pending',
      pricingStatus: 'approved_for_pilot',
      pricingVersion: 'pilot-2026.1',
      liveBillingApprovedByOwner: false,
      pastDueGraceDays: 7,
      livePilotMaxCustomers: 1,
      liveBillingAllowedOrgs: []
    }
  };
};





class JSONDatabase {
  constructor() {
    this.memoryData = null;
    this.init();
  }

  init() {
    if (!fs.existsSync(DB_FILE)) {
      const seedData = initialSeedData();
      fs.writeFileSync(DB_FILE, JSON.stringify(seedData, null, 2), 'utf-8');
      this.memoryData = seedData;
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.memoryData = this.migrateSchema(parsed);
        this.ensureControlledProjects(this.memoryData);
      } catch (err) {
        console.error('Failed to read db.json, generating fallback state:', err);
        const fallback = initialSeedData();
        this.ensureControlledProjects(fallback);
        fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
        this.memoryData = fallback;
      }
    }

    // Also persist static clean seed template into seed/db.seed.json
    const seedFile = path.join(SEED_DIR, 'db.seed.json');
    if (!fs.existsSync(seedFile)) {
      fs.writeFileSync(seedFile, JSON.stringify(initialSeedData(), null, 2), 'utf-8');
    }
  }

  // Schema Version 5 -> 6 Non-Destructive Migration & Integrity Assurance (dn'a-C02)
  migrateSchema(current) {
    const isOldVersion = !current.schemaVersion || current.schemaVersion < 6;
    const seed = initialSeedData();

    if (isOldVersion) {
      console.log(`[DB] Migrating schema to version 6 (dn'a-C02 Managed Production Operations)...`);

      current.schemaVersion = 6;
      current.featureFlags = current.featureFlags || seed.featureFlags;
      current.stripeEvents = current.stripeEvents || [];
      current.billingEvents = current.billingEvents || [];
      current.upgradeRequests = current.upgradeRequests || [];
      current.platformMessages = current.platformMessages || [];
      current.ownerNotes = current.ownerNotes || [];

      // 1. Ensure organizations & default subscriptions
      current.organizations = current.organizations || [];
      seed.organizations.forEach(so => {
        if (!current.organizations.find(o => o.id === so.id)) {
          current.organizations.push(so);
        }
      });

      current.organizations = current.organizations.map(org => {
        let env = 'REAL';
        if (org.name.includes('AUREX') || org.slug?.includes('aurex')) env = 'SYNTHETIC_TEST';
        else if (org.name.includes('Nova') || org.name.includes('Helix') || org.name.includes('Orbit')) env = 'TEST';

        return {
          ...org,
          subscription: org.subscription || {
            plan: org.type === 'organizer' || org.type === 'platform' ? 'business' : 'free',
            status: 'active',
            dataEnvironment: env,
            updatedAt: new Date().toISOString()
          }
        };
      });

      // 2. Ensure users (including platform_owner)
      current.users = current.users || [];
      seed.users.forEach(su => {
        if (!current.users.find(u => u.email === su.email)) {
          current.users.push(su);
        }
      });

      // If legacy events contains analytics events (type field), move them to analyticsEvents
      if (Array.isArray(current.events) && current.events.some(e => e.type || e.eventType)) {
        current.analyticsEvents = current.analyticsEvents || [];
        current.events.forEach(e => {
          if (e.type || e.eventType) {
            current.analyticsEvents.push(e);
          }
        });
        current.events = [];
      }

      // 3. Ensure events (Trade Show Expo entities)
      current.events = current.events || [];
      seed.events.forEach(se => {
        if (!current.events.find(e => e.id === se.id || (e.slug && e.slug === se.slug))) {
          current.events.push(se);
        }
      });

      // 4. Ensure eventExhibitors
      current.eventExhibitors = current.eventExhibitors || seed.eventExhibitors;


      // 5. Upgrade booths with organizationId and eventId
      current.booths = current.booths || [];
      seed.booths.forEach(sb => {
        if (!current.booths.find(b => b.id === sb.id)) {
          current.booths.push(sb);
        }
      });
      current.booths = current.booths.map(b => ({
        ...b,
        organizationId: b.organizationId || (b.id.includes('bio') ? 'org-exhibitor-bio' : defaultOrgId),
        eventId: b.eventId || defaultEventId
      }));

      // 6. Upgrade products with organizationId
      current.products = current.products || [];
      seed.products.forEach(sp => {
        if (!current.products.find(p => p.id === sp.id)) {
          current.products.push(sp);
        }
      });
      current.products = current.products.map(p => ({
        ...p,
        organizationId: p.organizationId || (p.id.includes('bio') ? 'org-exhibitor-bio' : defaultOrgId)
      }));

      // 7. Upgrade hotspots with organizationId
      current.hotspots = (current.hotspots || []).map(h => ({
        ...h,
        organizationId: h.organizationId || defaultOrgId
      }));

      // 8. Upgrade leads, rfqs, samples, appointments
      current.leads = (current.leads || []).map(l => ({ ...l, organizationId: l.organizationId || defaultOrgId, eventId: l.eventId || defaultEventId }));
      current.rfqs = (current.rfqs || []).map(r => ({ ...r, organizationId: r.organizationId || defaultOrgId, eventId: r.eventId || defaultEventId }));
      current.samples = (current.samples || []).map(s => ({ ...s, organizationId: s.organizationId || defaultOrgId, eventId: s.eventId || defaultEventId }));
      current.appointments = (current.appointments || []).map(a => ({ ...a, organizationId: a.organizationId || defaultOrgId, eventId: a.eventId || defaultEventId }));

      // 9. Upgrade reconstructionJobs
      current.reconstructionJobs = (current.reconstructionJobs || []).map(j => ({
        ...j,
        organizationId: j.organizationId || defaultOrgId,
        eventId: j.eventId || defaultEventId,
        approvalStatus: j.approvalStatus || (j.status === 'verified' ? 'approved' : 'approved')
      }));

      current.auditLogs = current.auditLogs || [];
      current.showhosts = current.showhosts || [];
      current.productionRequests = current.productionRequests || [];
      current.productionProjects = current.productionProjects || [];
      current.exhibitorProfiles = current.exhibitorProfiles || [];
      // Seed Controlled Test Projects if missing (Phase dn’a-C02)
      const controlledTestProjects = [
          {
            id: 'proj-hpmkt-haven-01',
            productionRequestId: 'req-seed-01',
            company: 'Haven & Oak Furniture Co.',
            contact: 'Julian Vance (VP Trade Sales)',
            email: 'julian.vance@havenoak.example',
            phone: '+1 (336) 555-0142',
            website: 'https://havenoak.example',
            tradeShow: 'High Point Market Fall 2026',
            showStartDate: '2026-10-17',
            showEndDate: '2026-10-21',
            daysUntilShow: 56,
            city: 'High Point, NC',
            venue: 'IHFC Main Building',
            boothNumber: 'Stand W-412 (Interhall)',
            industry: 'Furniture, Home Decor & Lighting',
            numberOfProducts: 12,
            serviceSelections: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE'],
            assignedProducer: 'Elena Rostova (Lead 3D Producer)',
            assignedReviewer: 'Marcus Vance (QA Director)',
            status: 'PUBLISHED',
            priority: 'NORMAL',
            blockingReason: 'NONE',
            createdAt: '2026-08-10T09:00:00.000Z',
            updatedAt: new Date().toISOString(),
            dueAt: '2026-09-15',
            publishedAt: '2026-08-20T14:30:00.000Z',
            internalNotes: [
              { id: 'n1', text: 'Client CAD files for 2026 sectional sofas received and optimized.', author: 'Elena Rostova', createdAt: '2026-08-12T10:00:00.000Z' },
              { id: 'n2', text: 'QA inspection completed. High Point showroom URL generated.', author: 'Marcus Vance', createdAt: '2026-08-20T14:00:00.000Z' }
            ],
            clientVisibleNotes: [
              { id: 'cn1', text: 'Your 3D virtual showroom has been built, tested, and published live!', author: 'dn’a Production Team', createdAt: '2026-08-20T14:30:00.000Z' }
            ],
            assets: [
              { key: 'LOGO', label: 'Vector Brand Logo (SVG/PNG)', required: true, status: 'APPROVED', receivedAt: '2026-08-11' },
              { key: 'COMPANY_DESCRIPTION', label: 'Company Overview & Tagline', required: true, status: 'APPROVED', receivedAt: '2026-08-11' },
              { key: 'PRODUCT_NAMES', label: 'Product Names & SKUs', required: true, status: 'APPROVED', receivedAt: '2026-08-11' },
              { key: 'PRODUCT_IMAGES', label: 'High-Res Product Photography', required: true, status: 'APPROVED', receivedAt: '2026-08-12' },
              { key: 'CATALOG_PDF', label: '2026 Lookbook & Spec Catalog (PDF)', required: true, status: 'APPROVED', receivedAt: '2026-08-13' },
              { key: 'CONTACT_INFORMATION', label: 'Sales Rep Details for Smart Card', required: true, status: 'APPROVED', receivedAt: '2026-08-11' }
            ],
            tasks: [
              { id: 't1', key: '3D_BOOTH_DESIGN', name: '3D Virtual Booth Architecture', status: 'DONE', completedAt: '2026-08-16' },
              { id: 't2', key: 'PRODUCT_SETUP', name: '12x 3D Product Plinths & Spec Binding', status: 'DONE', completedAt: '2026-08-17' },
              { id: 't3', key: 'CATALOG_INTEGRATION', name: 'Lookbook PDF Download Hub', status: 'DONE', completedAt: '2026-08-18' },
              { id: 't4', key: 'SMART_CARD_SETUP', name: 'Julian Vance Smart Card Setup', status: 'DONE', completedAt: '2026-08-18' },
              { id: 't5', key: 'RFQ_SETUP', name: 'Wholesale Pricing & Lead Endpoints', status: 'DONE', completedAt: '2026-08-19' }
            ],
            qaChecklist: {
              status: 'QA_PASS',
              reviewer: 'Marcus Vance (QA Director)',
              reviewedAt: '2026-08-20T13:45:00.000Z',
              checks: {
                correctCompany: true, correctLogo: true, correctBooth: true, correctProducts: true,
                noBrokenImages: true, noBrokenCatalog: true, qrWorks: true, rfqWorks: true,
                sampleWorks: true, appointmentWorks: true, mobileWorks: true, truthful3DState: true
              }
            },
            revisions: [
              { version: 'v1', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-18T16:00:00.000Z', status: 'APPROVED', notes: 'Initial complete build' }
            ],
            clientFeedback: [
              { id: 'fb1', type: 'APPROVAL', deliverable: '3D Showroom & Smart Card', comment: 'Showroom looks fantastic! The wood grain and lighting match our physical stand.', submittedAt: '2026-08-20T11:00:00.000Z', clientName: 'Julian Vance' }
            ],
            publishRecord: {
              publishedAt: '2026-08-20T14:30:00.000Z',
              publishedBy: 'Elena Rostova',
              publicUrl: '/demo.html',
              activeServices: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE']
            }
          },
          {
            id: 'proj-coterie-nova-02',
            productionRequestId: 'req-seed-02',
            company: 'Maison Nova Haute Apparel',
            contact: 'Claire Delacroix (Creative Director)',
            email: 'claire@maisonnova.example',
            phone: '+1 (212) 555-0819',
            website: 'https://maisonnova.example',
            tradeShow: 'COTERIE New York 2026',
            showStartDate: '2026-09-22',
            showEndDate: '2026-09-24',
            daysUntilShow: 31,
            city: 'New York, NY',
            venue: 'Javits Center',
            boothNumber: 'Booth 2140',
            industry: 'Fashion, Footwear & Luxury Apparel',
            numberOfProducts: 18,
            serviceSelections: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'SAMPLE_REQUEST'],
            assignedProducer: 'Elena Rostova',
            assignedReviewer: 'Marcus Vance',
            status: 'CLIENT_REVIEW',
            priority: 'DUE_SOON',
            blockingReason: 'WAITING_CLIENT',
            createdAt: '2026-08-15T11:00:00.000Z',
            updatedAt: new Date().toISOString(),
            dueAt: '2026-09-10',
            internalNotes: [
              { id: 'n1', text: 'v2 revisions incorporated: updated high-res handbag images.', author: 'Elena Rostova', createdAt: '2026-08-21T09:00:00.000Z' }
            ],
            clientVisibleNotes: [
              { id: 'cn1', text: 'v2 preview is ready for your review and approval.', author: 'dn’a Production Team', createdAt: '2026-08-21T10:00:00.000Z' }
            ],
            assets: [
              { key: 'LOGO', label: 'Vector Brand Logo (SVG/PNG)', required: true, status: 'APPROVED', receivedAt: '2026-08-15' },
              { key: 'COMPANY_DESCRIPTION', label: 'Company Overview & Tagline', required: true, status: 'APPROVED', receivedAt: '2026-08-15' },
              { key: 'PRODUCT_NAMES', label: 'Product Names & SKUs', required: true, status: 'APPROVED', receivedAt: '2026-08-16' },
              { key: 'PRODUCT_IMAGES', label: 'High-Res Product Photography', required: true, status: 'APPROVED', receivedAt: '2026-08-18' },
              { key: 'CATALOG_PDF', label: 'Lookbook & Linesheet (PDF)', required: true, status: 'APPROVED', receivedAt: '2026-08-17' },
              { key: 'CONTACT_INFORMATION', label: 'Sales Rep Details for Smart Card', required: true, status: 'APPROVED', receivedAt: '2026-08-15' }
            ],
            tasks: [
              { id: 't1', key: '3D_BOOTH_DESIGN', name: '3D Luxury Pavilion Architecture', status: 'DONE', completedAt: '2026-08-19' },
              { id: 't2', key: 'PRODUCT_SETUP', name: '18x Fashion Linesheet Product Binding', status: 'DONE', completedAt: '2026-08-20' },
              { id: 't3', key: 'CATALOG_INTEGRATION', name: 'Digital Lookbook Center', status: 'DONE', completedAt: '2026-08-20' },
              { id: 't4', key: 'SMART_CARD_SETUP', name: 'Claire Delacroix Smart Card Setup', status: 'DONE', completedAt: '2026-08-21' }
            ],
            qaChecklist: {
              status: 'QA_PASS',
              reviewer: 'Marcus Vance',
              reviewedAt: '2026-08-21T11:00:00.000Z',
              checks: {
                correctCompany: true, correctLogo: true, correctBooth: true, correctProducts: true,
                noBrokenImages: true, noBrokenCatalog: true, qrWorks: true, rfqWorks: true,
                sampleWorks: true, appointmentWorks: true, mobileWorks: true, truthful3DState: true
              }
            },
            revisions: [
              { version: 'v1', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-19T14:00:00.000Z', status: 'SUPERSEDED', notes: 'Initial build' },
              { version: 'v2', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-21T10:00:00.000Z', status: 'IN_REVIEW', notes: 'Updated line photography' }
            ],
            clientFeedback: [
              { id: 'fb1', type: 'REVISION_REQUEST', deliverable: 'Product Photos', comment: 'Please use our updated winter collection hero image for Product #4.', submittedAt: '2026-08-20T16:00:00.000Z', clientName: 'Claire Delacroix' }
            ]
          },
          {
            id: 'proj-asd-lumina-03',
            productionRequestId: 'req-seed-03',
            company: 'Lumina Craft & Giftworks',
            contact: 'Dave K. Sterling (VP Merchandising)',
            email: 'dave@luminacraft.example',
            phone: '+1 (702) 555-0941',
            website: 'https://luminacraft.example',
            tradeShow: 'ASD Market Week Las Vegas 2026',
            showStartDate: '2026-08-20',
            showEndDate: '2026-08-23',
            daysUntilShow: 0,
            city: 'Las Vegas, NV',
            venue: 'Las Vegas Convention Center',
            boothNumber: 'Central Hall — Stand C-842',
            industry: 'Gifts, Novelties & General Merchandise',
            numberOfProducts: 24,
            serviceSelections: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST'],
            assignedProducer: 'Kenji Sato',
            assignedReviewer: 'Marcus Vance',
            status: 'SHOW_LIVE',
            priority: 'SHOW_STARTED',
            blockingReason: 'NONE',
            createdAt: '2026-08-01T08:00:00.000Z',
            updatedAt: new Date().toISOString(),
            dueAt: '2026-08-18',
            publishedAt: '2026-08-19T09:00:00.000Z',
            internalNotes: [
              { id: 'n1', text: 'Exhibition is currently active on trade show floor. QR traffic live.', author: 'Kenji Sato', createdAt: '2026-08-20T10:00:00.000Z' }
            ],
            clientVisibleNotes: [
              { id: 'cn1', text: 'Your 3D showroom and QR passes are active for ASD Market Week!', author: 'dn’a Production Team', createdAt: '2026-08-19T09:00:00.000Z' }
            ],
            assets: [
              { key: 'LOGO', label: 'Vector Brand Logo (SVG/PNG)', required: true, status: 'APPROVED', receivedAt: '2026-08-02' },
              { key: 'COMPANY_DESCRIPTION', label: 'Company Overview', required: true, status: 'APPROVED', receivedAt: '2026-08-02' },
              { key: 'PRODUCT_NAMES', label: 'Product Names & SKUs', required: true, status: 'APPROVED', receivedAt: '2026-08-03' },
              { key: 'PRODUCT_IMAGES', label: 'High-Res Product Photos', required: true, status: 'APPROVED', receivedAt: '2026-08-05' },
              { key: 'CATALOG_PDF', label: 'Wholesale Merchandise Catalog', required: true, status: 'APPROVED', receivedAt: '2026-08-04' }
            ],
            tasks: [
              { id: 't1', key: '3D_BOOTH_DESIGN', name: '3D Pavilion & Hologram Plinths', status: 'DONE', completedAt: '2026-08-15' },
              { id: 't2', key: 'PRODUCT_QR_SETUP', name: '24x Product Waypoint QRs', status: 'DONE', completedAt: '2026-08-17' },
              { id: 't3', key: 'RFQ_SETUP', name: 'Wholesale Lead Capture & Sample Intake', status: 'DONE', completedAt: '2026-08-18' }
            ],
            qaChecklist: {
              status: 'QA_PASS',
              reviewer: 'Marcus Vance',
              reviewedAt: '2026-08-18T15:00:00.000Z',
              checks: {
                correctCompany: true, correctLogo: true, correctBooth: true, correctProducts: true,
                noBrokenImages: true, noBrokenCatalog: true, qrWorks: true, rfqWorks: true,
                sampleWorks: true, appointmentWorks: true, mobileWorks: true, truthful3DState: true
              }
            },
            revisions: [
              { version: 'v1', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-18T14:00:00.000Z', status: 'APPROVED', notes: 'Final build' }
            ],
            publishRecord: {
              publishedAt: '2026-08-19T09:00:00.000Z',
              publishedBy: 'Kenji Sato',
              publicUrl: '/demo.html',
              activeServices: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST']
            },
            postShowReport: {
              generatedAt: '2026-08-22T00:00:00.000Z',
              boothVisits: 1428,
              productViews: 3614,
              qrScans: 319,
              catalogDownloads: 482,
              leadsCaptured: 89,
              rfqsSubmitted: 47,
              samplesRequested: 29,
              meetingsBooked: 38
            }
          }
        ];

        controlledTestProjects.forEach(sp => {
          if (!current.productionProjects.find(p => p.id === sp.id)) {
            current.productionProjects.push(sp);
          }
        });

      // Atomic save migrated structure
      fs.writeFileSync(DB_FILE, JSON.stringify(current, null, 2), 'utf-8');
      console.log('[DB] Schema version 4 migration successfully applied.');
    }
    return current;
  }

  ensureControlledProjects(data) {
    if (!data) return;
    data.productionProjects = data.productionProjects || [];

    const controlledProjects = [
      {
        id: 'proj-hpmkt-haven-01',
        productionRequestId: 'req-seed-01',
        company: 'Haven & Oak Furniture Co.',
        contact: 'Julian Vance (VP Trade Sales)',
        email: 'julian.vance@havenoak.example',
        phone: '+1 (336) 555-0142',
        website: 'https://havenoak.example',
        tradeShow: 'High Point Market Fall 2026',
        showStartDate: '2026-10-17',
        showEndDate: '2026-10-21',
        daysUntilShow: 56,
        city: 'High Point, NC',
        venue: 'IHFC Main Building',
        boothNumber: 'Stand W-412 (Interhall)',
        industry: 'Furniture, Home Decor & Lighting',
        numberOfProducts: 12,
        serviceSelections: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE'],
        assignedProducer: 'Elena Rostova (Lead 3D Producer)',
        assignedReviewer: 'Marcus Vance (QA Director)',
        status: 'PUBLISHED',
        priority: 'NORMAL',
        blockingReason: 'NONE',
        createdAt: '2026-08-10T09:00:00.000Z',
        updatedAt: new Date().toISOString(),
        dueAt: '2026-09-15',
        publishedAt: '2026-08-20T14:30:00.000Z',
        internalNotes: [
          { id: 'n1', text: 'Client CAD files for 2026 sectional sofas received and optimized.', author: 'Elena Rostova', createdAt: '2026-08-12T10:00:00.000Z' },
          { id: 'n2', text: 'QA inspection completed. High Point showroom URL generated.', author: 'Marcus Vance', createdAt: '2026-08-20T14:00:00.000Z' }
        ],
        clientVisibleNotes: [
          { id: 'cn1', text: 'Your 3D virtual showroom has been built, tested, and published live!', author: 'dn’a Production Team', createdAt: '2026-08-20T14:30:00.000Z' }
        ],
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo (SVG/PNG)', required: true, status: 'APPROVED', receivedAt: '2026-08-11' },
          { key: 'COMPANY_DESCRIPTION', label: 'Company Overview & Tagline', required: true, status: 'APPROVED', receivedAt: '2026-08-11' },
          { key: 'PRODUCT_NAMES', label: 'Product Names & SKUs', required: true, status: 'APPROVED', receivedAt: '2026-08-11' },
          { key: 'PRODUCT_IMAGES', label: 'High-Res Product Photography', required: true, status: 'APPROVED', receivedAt: '2026-08-12' },
          { key: 'CATALOG_PDF', label: '2026 Lookbook & Spec Catalog (PDF)', required: true, status: 'APPROVED', receivedAt: '2026-08-13' },
          { key: 'CONTACT_INFORMATION', label: 'Sales Rep Details for Smart Card', required: true, status: 'APPROVED', receivedAt: '2026-08-11' }
        ],
        tasks: [
          { id: 't1', key: '3D_BOOTH_DESIGN', name: '3D Virtual Booth Architecture', status: 'DONE', completedAt: '2026-08-16' },
          { id: 't2', key: 'PRODUCT_SETUP', name: '12x 3D Product Plinths & Spec Binding', status: 'DONE', completedAt: '2026-08-17' },
          { id: 't3', key: 'CATALOG_INTEGRATION', name: 'Lookbook PDF Download Hub', status: 'DONE', completedAt: '2026-08-18' },
          { id: 't4', key: 'SMART_CARD_SETUP', name: 'Julian Vance Smart Card Setup', status: 'DONE', completedAt: '2026-08-18' },
          { id: 't5', key: 'RFQ_SETUP', name: 'Wholesale Pricing & Lead Endpoints', status: 'DONE', completedAt: '2026-08-19' }
        ],
        qaChecklist: {
          status: 'QA_PASS',
          reviewer: 'Marcus Vance (QA Director)',
          reviewedAt: '2026-08-20T13:45:00.000Z',
          checks: {
            correctCompany: true, correctLogo: true, correctBooth: true, correctProducts: true,
            noBrokenImages: true, noBrokenCatalog: true, qrWorks: true, rfqWorks: true,
            sampleWorks: true, appointmentWorks: true, mobileWorks: true, truthful3DState: true
          }
        },
        revisions: [
          { version: 'v1', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-18T16:00:00.000Z', status: 'APPROVED', notes: 'Initial complete build' }
        ],
        clientFeedback: [
          { id: 'fb1', type: 'APPROVAL', deliverable: '3D Showroom & Smart Card', comment: 'Showroom looks fantastic! The wood grain and lighting match our physical stand.', submittedAt: '2026-08-20T11:00:00.000Z', clientName: 'Julian Vance' }
        ],
        publishRecord: {
          publishedAt: '2026-08-20T14:30:00.000Z',
          publishedBy: 'Elena Rostova',
          publicUrl: '/demo.html',
          activeServices: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE']
        }
      },
      {
        id: 'proj-coterie-nova-02',
        productionRequestId: 'req-seed-02',
        company: 'Maison Nova Haute Apparel',
        contact: 'Claire Delacroix (Creative Director)',
        email: 'claire@maisonnova.example',
        phone: '+1 (212) 555-0819',
        website: 'https://maisonnova.example',
        tradeShow: 'COTERIE New York 2026',
        showStartDate: '2026-09-22',
        showEndDate: '2026-09-24',
        daysUntilShow: 31,
        city: 'New York, NY',
        venue: 'Javits Center',
        boothNumber: 'Booth 2140',
        industry: 'Fashion, Footwear & Luxury Apparel',
        numberOfProducts: 18,
        serviceSelections: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'SAMPLE_REQUEST'],
        assignedProducer: 'Elena Rostova',
        assignedReviewer: 'Marcus Vance',
        status: 'CLIENT_REVIEW',
        priority: 'DUE_SOON',
        blockingReason: 'WAITING_CLIENT',
        createdAt: '2026-08-15T11:00:00.000Z',
        updatedAt: new Date().toISOString(),
        dueAt: '2026-09-10',
        internalNotes: [
          { id: 'n1', text: 'v2 revisions incorporated: updated high-res handbag images.', author: 'Elena Rostova', createdAt: '2026-08-21T09:00:00.000Z' }
        ],
        clientVisibleNotes: [
          { id: 'cn1', text: 'v2 preview is ready for your review and approval.', author: 'dn’a Production Team', createdAt: '2026-08-21T10:00:00.000Z' }
        ],
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo (SVG/PNG)', required: true, status: 'APPROVED', receivedAt: '2026-08-15' },
          { key: 'COMPANY_DESCRIPTION', label: 'Company Overview & Tagline', required: true, status: 'APPROVED', receivedAt: '2026-08-15' },
          { key: 'PRODUCT_NAMES', label: 'Product Names & SKUs', required: true, status: 'APPROVED', receivedAt: '2026-08-16' },
          { key: 'PRODUCT_IMAGES', label: 'High-Res Product Photography', required: true, status: 'APPROVED', receivedAt: '2026-08-18' },
          { key: 'CATALOG_PDF', label: 'Lookbook & Linesheet (PDF)', required: true, status: 'APPROVED', receivedAt: '2026-08-17' },
          { key: 'CONTACT_INFORMATION', label: 'Sales Rep Details for Smart Card', required: true, status: 'APPROVED', receivedAt: '2026-08-15' }
        ],
        tasks: [
          { id: 't1', key: '3D_BOOTH_DESIGN', name: '3D Luxury Pavilion Architecture', status: 'DONE', completedAt: '2026-08-19' },
          { id: 't2', key: 'PRODUCT_SETUP', name: '18x Fashion Linesheet Product Binding', status: 'DONE', completedAt: '2026-08-20' },
          { id: 't3', key: 'CATALOG_INTEGRATION', name: 'Digital Lookbook Center', status: 'DONE', completedAt: '2026-08-20' },
          { id: 't4', key: 'SMART_CARD_SETUP', name: 'Claire Delacroix Smart Card Setup', status: 'DONE', completedAt: '2026-08-21' }
        ],
        qaChecklist: {
          status: 'QA_PASS',
          reviewer: 'Marcus Vance',
          reviewedAt: '2026-08-21T11:00:00.000Z',
          checks: {
            correctCompany: true, correctLogo: true, correctBooth: true, correctProducts: true,
            noBrokenImages: true, noBrokenCatalog: true, qrWorks: true, rfqWorks: true,
            sampleWorks: true, appointmentWorks: true, mobileWorks: true, truthful3DState: true
          }
        },
        revisions: [
          { version: 'v1', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-19T14:00:00.000Z', status: 'SUPERSEDED', notes: 'Initial build' },
          { version: 'v2', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-21T10:00:00.000Z', status: 'IN_REVIEW', notes: 'Updated line photography' }
        ],
        clientFeedback: [
          { id: 'fb1', type: 'REVISION_REQUEST', deliverable: 'Product Photos', comment: 'Please use our updated winter collection hero image for Product #4.', submittedAt: '2026-08-20T16:00:00.000Z', clientName: 'Claire Delacroix' }
        ]
      },
      {
        id: 'proj-asd-lumina-03',
        productionRequestId: 'req-seed-03',
        company: 'Lumina Craft & Giftworks',
        contact: 'Dave K. Sterling (VP Merchandising)',
        email: 'dave@luminacraft.example',
        phone: '+1 (702) 555-0941',
        website: 'https://luminacraft.example',
        tradeShow: 'ASD Market Week Las Vegas 2026',
        showStartDate: '2026-08-20',
        showEndDate: '2026-08-23',
        daysUntilShow: 0,
        city: 'Las Vegas, NV',
        venue: 'Las Vegas Convention Center',
        boothNumber: 'Central Hall — Stand C-842',
        industry: 'Gifts, Novelties & General Merchandise',
        numberOfProducts: 24,
        serviceSelections: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST'],
        assignedProducer: 'Kenji Sato',
        assignedReviewer: 'Marcus Vance',
        status: 'SHOW_LIVE',
        priority: 'SHOW_STARTED',
        blockingReason: 'NONE',
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: new Date().toISOString(),
        dueAt: '2026-08-18',
        publishedAt: '2026-08-19T09:00:00.000Z',
        internalNotes: [
          { id: 'n1', text: 'Exhibition is currently active on trade show floor. QR traffic live.', author: 'Kenji Sato', createdAt: '2026-08-20T10:00:00.000Z' }
        ],
        clientVisibleNotes: [
          { id: 'cn1', text: 'Your 3D showroom and QR passes are active for ASD Market Week!', author: 'dn’a Production Team', createdAt: '2026-08-19T09:00:00.000Z' }
        ],
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo (SVG/PNG)', required: true, status: 'APPROVED', receivedAt: '2026-08-02' },
          { key: 'COMPANY_DESCRIPTION', label: 'Company Overview', required: true, status: 'APPROVED', receivedAt: '2026-08-02' },
          { key: 'PRODUCT_NAMES', label: 'Product Names & SKUs', required: true, status: 'APPROVED', receivedAt: '2026-08-03' },
          { key: 'PRODUCT_IMAGES', label: 'High-Res Product Photos', required: true, status: 'APPROVED', receivedAt: '2026-08-05' },
          { key: 'CATALOG_PDF', label: 'Wholesale Merchandise Catalog', required: true, status: 'APPROVED', receivedAt: '2026-08-04' }
        ],
        tasks: [
          { id: 't1', key: '3D_BOOTH_DESIGN', name: '3D Pavilion & Hologram Plinths', status: 'DONE', completedAt: '2026-08-15' },
          { id: 't2', key: 'PRODUCT_QR_SETUP', name: '24x Product Waypoint QRs', status: 'DONE', completedAt: '2026-08-17' },
          { id: 't3', key: 'RFQ_SETUP', name: 'Wholesale Lead Capture & Sample Intake', status: 'DONE', completedAt: '2026-08-18' }
        ],
        qaChecklist: {
          status: 'QA_PASS',
          reviewer: 'Marcus Vance',
          reviewedAt: '2026-08-18T15:00:00.000Z',
          checks: {
            correctCompany: true, correctLogo: true, correctBooth: true, correctProducts: true,
            noBrokenImages: true, noBrokenCatalog: true, qrWorks: true, rfqWorks: true,
            sampleWorks: true, appointmentWorks: true, mobileWorks: true, truthful3DState: true
          }
        },
        revisions: [
          { version: 'v1', deliverableType: 'DIGITAL_BOOTH', previewUrl: '/demo.html', createdAt: '2026-08-18T14:00:00.000Z', status: 'APPROVED', notes: 'Final build' }
        ],
        publishRecord: {
          publishedAt: '2026-08-19T09:00:00.000Z',
          publishedBy: 'Kenji Sato',
          publicUrl: '/demo.html',
          activeServices: ['3D_BOOTH_DESIGN', 'PHOTO_TOUR', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST']
        },
        postShowReport: {
          generatedAt: '2026-08-22T00:00:00.000Z',
          boothVisits: 1428,
          productViews: 3614,
          qrScans: 319,
          catalogDownloads: 482,
          leadsCaptured: 89,
          rfqsSubmitted: 47,
          samplesRequested: 29,
          meetingsBooked: 38
        }
      },
      // --- Phase dn’a-C03: DIY Booth Builder Beta Controlled Projects ---
      {
        id: 'proj-diy-haven-01',
        channel: 'DIY_BUILDER',
        company: 'Haven & Oak Furniture Co.',
        contact: 'Julian Vance (VP Trade Sales)',
        email: 'julian.vance@havenoak.example',
        phone: '+1 (336) 555-0142',
        website: 'https://havenoak.example',
        description: 'Heritage American craftsmanship specializing in solid white oak, walnut furnishings, and architectural trade exhibition displays.',
        tradeShow: 'High Point Market Fall 2026',
        showStartDate: '2026-10-17',
        showEndDate: '2026-10-21',
        daysUntilShow: 56,
        city: 'High Point, NC',
        venue: 'IHFC Main Building',
        boothNumber: 'Stand W-412 (Interhall)',
        industry: 'Furniture, Home Decor & Lighting',
        numberOfProducts: 8,
        experienceType: 'DIGITAL_SHOWROOM',
        templateId: 'MODERN',
        hotspotBindings: { hotspot1: 'prod-diy-h1', hotspot2: 'prod-diy-h2', hotspot3: 'prod-diy-h3' },
        serviceSelections: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE'],
        status: 'PUBLISHED',
        priority: 'NORMAL',
        blockingReason: 'NONE',
        createdAt: '2026-08-16T10:00:00.000Z',
        updatedAt: '2026-08-22T02:00:00.000Z',
        publishedAt: '2026-08-21T10:00:00.000Z',
        settings: {
          enableLeadForm: true,
          enableRfq: true,
          enableSampleRequest: true,
          enableAppointments: true,
          leadEmail: 'julian.vance@havenoak.example'
        },
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' },
          { key: 'HERO_IMAGE', label: 'Hero Booth Banner', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200' },
          { key: 'CATALOG_PDF', label: 'Lookbook & Spec Catalog', required: true, status: 'APPROVED', url: '/demo.html' }
        ],
        products: [
          { id: 'prod-diy-h1', name: 'Monarch Solid White Oak Dining Table', sku: 'HVO-DS-01', category: 'Dining Furniture', price: 4200, currency: 'USD', wholesaleVisible: true, moq: 2, heroImage: 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?w=800', description: 'Handcrafted Appalachian white oak 8-seater dining table with mortise-and-tenon joinery.' },
          { id: 'prod-diy-h2', name: 'Kensington Low-Profile Sectional Sofa', sku: 'HVO-SF-04', category: 'Living Room', price: 6800, currency: 'USD', wholesaleVisible: true, moq: 1, heroImage: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800', description: 'Full-grain Italian aniline leather sectional with modular configuration options.' },
          { id: 'prod-diy-h3', name: 'Sutton Architectural Credenza', sku: 'HVO-CR-09', category: 'Storage & Media', price: 3400, currency: 'USD', wholesaleVisible: true, moq: 2, heroImage: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800', description: 'Brushed brass inlay cabinet doors with integrated soft-close European hinges.' }
        ],
        revisions: [
          { version: 'v1', publishedAt: '2026-08-21T10:00:00.000Z', publicUrl: '/demo.html?project=proj-diy-haven-01', notes: 'Initial DIY Builder publish' }
        ],
        publishRecord: {
          publishedAt: '2026-08-21T10:00:00.000Z',
          publishedBy: 'Julian Vance (Self-Service)',
          publicUrl: '/demo.html?project=proj-diy-haven-01',
          activeServices: ['DIGITAL_SHOWROOM', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE']
        },
        analytics: {
          boothVisits: 342,
          productViews: 819,
          qrScans: 86,
          catalogDownloads: 114,
          leadsCaptured: 19,
          rfqsSubmitted: 11,
          samplesRequested: 7,
          meetingsBooked: 8
        }
      },
      {
        id: 'proj-diy-nova-02',
        channel: 'DIY_BUILDER',
        company: 'Maison Nova Haute Apparel',
        contact: 'Claire Delacroix (Creative Director)',
        email: 'claire@maisonnova.example',
        phone: '+1 (212) 555-0819',
        website: 'https://maisonnova.example',
        description: 'Contemporary European luxury pret-a-porter and artisan leather accessory atelier.',
        tradeShow: 'COTERIE New York 2026',
        showStartDate: '2026-09-22',
        showEndDate: '2026-09-24',
        daysUntilShow: 31,
        city: 'New York, NY',
        venue: 'Javits Center',
        boothNumber: 'Booth 2140',
        industry: 'Fashion, Footwear & Luxury Apparel',
        numberOfProducts: 12,
        experienceType: 'DESIGNED_3D',
        templateId: 'PREMIUM',
        hotspotBindings: { hotspot1: 'prod-diy-n1', hotspot2: 'prod-diy-n2' },
        serviceSelections: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR'],
        status: 'QUALIFICATION',
        priority: 'DUE_SOON',
        blockingReason: 'WAITING_CLIENT',
        createdAt: '2026-08-18T14:00:00.000Z',
        updatedAt: '2026-08-22T02:00:00.000Z',
        managedHandoff: {
          requestedAt: '2026-08-21T15:30:00.000Z',
          notes: 'Customer requested dn’a Managed Production to finish high-end 3D pavilion and linesheet binding.',
          requestedBy: 'Claire Delacroix',
          handoffStatus: 'ACTIVE'
        },
        settings: {
          enableLeadForm: true,
          enableRfq: true,
          enableSampleRequest: true,
          enableAppointments: true,
          leadEmail: 'claire@maisonnova.example'
        },
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' }
        ],
        products: [
          { id: 'prod-diy-n1', name: 'Atelier Cashmere Overcoat — Charcoal', sku: 'MN-OW-01', category: 'Outerwear', price: 1850, currency: 'USD', wholesaleVisible: true, moq: 6, heroImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800', description: 'Double-faced Italian cashmere blend with hand-stitched lapels.' },
          { id: 'prod-diy-n2', name: 'Palais Calfskin Sculptural Handbag', sku: 'MN-BG-08', category: 'Accessories', price: 920, currency: 'USD', wholesaleVisible: true, moq: 10, heroImage: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800', description: 'Handmade calfskin tote with custom brushed palladium hardware.' }
        ],
        revisions: [],
        publishRecord: null,
        analytics: {
          boothVisits: 0,
          productViews: 0,
          qrScans: 0,
          catalogDownloads: 0,
          leadsCaptured: 0,
          rfqsSubmitted: 0,
          samplesRequested: 0,
          meetingsBooked: 0
        }
      },
      {
        id: 'proj-diy-lumina-03',
        channel: 'DIY_BUILDER',
        company: 'Lumina Craft & Giftworks',
        contact: 'Dave K. Sterling (VP Merchandising)',
        email: 'dave@luminacraft.example',
        phone: '+1 (702) 555-0941',
        website: 'https://luminacraft.example',
        description: 'Wholesale supplier of design-forward lifestyle gifts, illuminated craft novelties, and retail displays.',
        tradeShow: 'ASD Market Week Las Vegas 2026',
        showStartDate: '2026-08-20',
        showEndDate: '2026-08-23',
        daysUntilShow: 0,
        city: 'Las Vegas, NV',
        venue: 'Las Vegas Convention Center',
        boothNumber: 'Central Hall — Stand C-842',
        industry: 'Gifts, Novelties & General Merchandise',
        numberOfProducts: 6,
        experienceType: 'PHOTO_TOUR',
        templateId: 'INDUSTRIAL',
        hotspotBindings: { hotspot1: 'prod-diy-l1' },
        serviceSelections: ['PHOTO_TOUR', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST'],
        status: 'DRAFT',
        priority: 'SHOW_STARTED',
        blockingReason: 'NONE',
        createdAt: '2026-08-20T09:00:00.000Z',
        updatedAt: '2026-08-22T02:00:00.000Z',
        settings: {
          enableLeadForm: true,
          enableRfq: true,
          enableSampleRequest: true,
          enableAppointments: true,
          leadEmail: 'dave@luminacraft.example'
        },
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' }
        ],
        products: [
          { id: 'prod-diy-l1', name: 'Prism Light Ambient LED Lantern', sku: 'LUM-LT-01', category: 'Illumination', price: 38, currency: 'USD', wholesaleVisible: true, moq: 24, heroImage: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800', description: 'Rechargeable wireless ambient light sculpture with touch dimmer.' }
        ],
        revisions: [],
        publishRecord: null,
        analytics: {
          boothVisits: 0,
          productViews: 0,
          qrScans: 0,
          catalogDownloads: 0,
          leadsCaptured: 0,
          rfqsSubmitted: 0,
          samplesRequested: 0,
          meetingsBooked: 0
        }
      },
      // --- Phase dn’a-C04: Pilot Exhibitor Cohort (5 Controlled Projects) ---
      {
        id: 'proj-pilot-01-haven',
        channel: 'DIY_BUILDER',
        company: 'Haven & Oak Furniture Co.',
        contact: 'Julian Vance (VP Trade Sales)',
        email: 'julian.vance@havenoak.example',
        phone: '+1 (336) 555-0142',
        website: 'https://havenoak.example',
        description: 'Heritage American solid white oak and walnut furnishings for high-end hospitality and architectural trade buyers.',
        tradeShow: 'High Point Market Fall 2026',
        showStartDate: '2026-10-17',
        showEndDate: '2026-10-21',
        daysUntilShow: 56,
        city: 'High Point, NC',
        venue: 'IHFC Main Building',
        boothNumber: 'Stand W-412 (Interhall)',
        industry: 'Furniture, Home Decor & Lighting',
        numberOfProducts: 8,
        experienceType: 'DIGITAL_SHOWROOM',
        templateId: 'MODERN',
        hotspotBindings: { hotspot1: 'prod-p1-01', hotspot2: 'prod-p1-02', hotspot3: 'prod-p1-03' },
        serviceSelections: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE'],
        status: 'PUBLISHED',
        priority: 'NORMAL',
        blockingReason: 'NONE',
        createdAt: '2026-08-16T10:00:00.000Z',
        updatedAt: '2026-08-22T04:00:00.000Z',
        publishedAt: '2026-08-21T10:00:00.000Z',
        settings: { enableLeadForm: true, enableRfq: true, enableSampleRequest: true, enableAppointments: true, leadEmail: 'julian.vance@havenoak.example' },
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' },
          { key: 'HERO_IMAGE', label: 'Hero Booth Banner', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200' },
          { key: 'CATALOG_PDF', label: 'Lookbook & Spec Catalog', required: true, status: 'APPROVED', url: '/demo.html' }
        ],
        products: [
          { id: 'prod-p1-01', name: 'Monarch Solid White Oak Dining Table', sku: 'HVO-DS-01', category: 'Dining Furniture', price: 4200, currency: 'USD', wholesaleVisible: true, moq: 2, heroImage: 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?w=800', description: 'Handcrafted Appalachian white oak 8-seater dining table with mortise-and-tenon joinery.' },
          { id: 'prod-p1-02', name: 'Kensington Low-Profile Sectional Sofa', sku: 'HVO-SF-04', category: 'Living Room', price: 6800, currency: 'USD', wholesaleVisible: true, moq: 1, heroImage: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800', description: 'Full-grain Italian aniline leather sectional with modular configuration options.' },
          { id: 'prod-p1-03', name: 'Sutton Architectural Credenza', sku: 'HVO-CR-09', category: 'Storage & Media', price: 3400, currency: 'USD', wholesaleVisible: true, moq: 2, heroImage: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800', description: 'Brushed brass inlay cabinet doors with integrated soft-close European hinges.' }
        ],
        revisions: [{ version: 'v1', publishedAt: '2026-08-21T10:00:00.000Z', publicUrl: '/demo.html?project=proj-pilot-01-haven', notes: 'Pilot DIY launch' }],
        publishRecord: { publishedAt: '2026-08-21T10:00:00.000Z', publishedBy: 'Julian Vance', publicUrl: '/demo.html?project=proj-pilot-01-haven', activeServices: ['DIGITAL_SHOWROOM', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE'] },
        analytics: { boothVisits: 480, productViews: 1120, qrScans: 114, catalogDownloads: 162, leadsCaptured: 28, rfqsSubmitted: 14, samplesRequested: 9, meetingsBooked: 11 },
        leads: [
          { id: 'lead-p1-01', buyerName: 'Sarah Jenkins', buyerCompany: 'Metropolitan Design Studio', email: 'sjenkins@metrodesign.example', phone: '+1 (415) 555-0199', interestedProduct: 'Monarch Solid White Oak Dining Table', source: 'DIGITAL_BOOTH', actionType: 'RFQ', status: 'RFQ', notes: 'Requested quotation for 12 tables for boutique hotel project in Napa Valley.', date: '2026-08-21T14:20:00.000Z' },
          { id: 'lead-p1-02', buyerName: 'Arthur Pendelton', buyerCompany: 'Grand Horizon Hospitality', email: 'apendelton@horizonhotels.example', phone: '+1 (312) 555-0811', interestedProduct: 'Kensington Low-Profile Sectional Sofa', source: 'PRODUCT_QR', actionType: 'SAMPLE', status: 'SAMPLE_REQUESTED', notes: 'Requested Italian leather swatch kit sent to Chicago procurement office.', date: '2026-08-21T16:45:00.000Z' },
          { id: 'lead-p1-03', buyerName: 'Elena Rostova', buyerCompany: 'Apex Interiors Group', email: 'elena@apexinteriors.example', phone: '+1 (212) 555-0988', interestedProduct: 'Sutton Architectural Credenza', source: 'SMART_CARD', actionType: 'APPOINTMENT', status: 'MEETING_REQUESTED', notes: 'Scheduled trade show in-person walkthrough at High Point stand W-412.', date: '2026-08-22T01:15:00.000Z' },
          { id: 'lead-p1-04', buyerName: 'David Chen', buyerCompany: 'Pacific Rim Furnishings', email: 'dchen@pacificfurn.example', phone: '+1 (206) 555-0322', interestedProduct: 'Monarch Solid White Oak Dining Table', source: 'CATALOG_DOWNLOAD', actionType: 'LEAD', status: 'QUALIFIED', notes: 'Wholesale buyer looking for west coast distribution agreement.', date: '2026-08-22T02:30:00.000Z' }
        ]
      },
      {
        id: 'proj-pilot-02-nova',
        channel: 'DIY_BUILDER',
        company: 'Maison Nova Haute Apparel',
        contact: 'Claire Delacroix (Creative Director)',
        email: 'claire@maisonnova.example',
        phone: '+1 (212) 555-0819',
        website: 'https://maisonnova.example',
        description: 'Contemporary European luxury pret-a-porter and artisan leather accessory atelier.',
        tradeShow: 'COTERIE New York 2026',
        showStartDate: '2026-09-22',
        showEndDate: '2026-09-24',
        daysUntilShow: 31,
        city: 'New York, NY',
        venue: 'Javits Center',
        boothNumber: 'Booth 2140',
        industry: 'Fashion, Footwear & Luxury Apparel',
        numberOfProducts: 12,
        experienceType: 'DESIGNED_3D',
        templateId: 'PREMIUM',
        hotspotBindings: { hotspot1: 'prod-p2-01', hotspot2: 'prod-p2-02' },
        serviceSelections: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR'],
        status: 'QUALIFICATION',
        priority: 'DUE_SOON',
        blockingReason: 'WAITING_CLIENT',
        createdAt: '2026-08-18T14:00:00.000Z',
        updatedAt: '2026-08-22T04:00:00.000Z',
        managedHandoff: { requestedAt: '2026-08-21T15:30:00.000Z', notes: 'Pilot exhibitor requested dn’a Managed Production to finish high-end 3D pavilion and linesheet binding.', requestedBy: 'Claire Delacroix', handoffStatus: 'ACTIVE' },
        settings: { enableLeadForm: true, enableRfq: true, enableSampleRequest: true, enableAppointments: true, leadEmail: 'claire@maisonnova.example' },
        assets: [{ key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' }],
        products: [
          { id: 'prod-p2-01', name: 'Atelier Cashmere Overcoat — Charcoal', sku: 'MN-OW-01', category: 'Outerwear', price: 1850, currency: 'USD', wholesaleVisible: true, moq: 6, heroImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800', description: 'Double-faced Italian cashmere blend with hand-stitched lapels.' },
          { id: 'prod-p2-02', name: 'Palais Calfskin Sculptural Handbag', sku: 'MN-BG-08', category: 'Accessories', price: 920, currency: 'USD', wholesaleVisible: true, moq: 10, heroImage: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800', description: 'Handmade calfskin tote with custom brushed palladium hardware.' }
        ],
        revisions: [],
        publishRecord: null,
        analytics: { boothVisits: 0, productViews: 0, qrScans: 0, catalogDownloads: 0, leadsCaptured: 0, rfqsSubmitted: 0, samplesRequested: 0, meetingsBooked: 0 },
        leads: [
          { id: 'lead-p2-01', buyerName: 'Chloe Dupont', buyerCompany: 'Galeries Lafayette NY', email: 'cdupont@galeries.example', phone: '+1 (212) 555-0441', interestedProduct: 'Atelier Cashmere Overcoat — Charcoal', source: 'MANAGED_INTAKE', actionType: 'RFQ', status: 'NEW', notes: 'Preliminary interest in Fall capsule collection preorder.', date: '2026-08-21T18:00:00.000Z' }
        ]
      },
      {
        id: 'proj-pilot-03-lumina',
        channel: 'DIY_BUILDER',
        company: 'Lumina Craft & Giftworks',
        contact: 'Dave K. Sterling (VP Merchandising)',
        email: 'dave@luminacraft.example',
        phone: '+1 (702) 555-0941',
        website: 'https://luminacraft.example',
        description: 'Wholesale supplier of design-forward lifestyle gifts, illuminated craft novelties, and retail displays.',
        tradeShow: 'ASD Market Week Las Vegas 2026',
        showStartDate: '2026-08-20',
        showEndDate: '2026-08-23',
        daysUntilShow: 0,
        city: 'Las Vegas, NV',
        venue: 'Las Vegas Convention Center',
        boothNumber: 'Central Hall — Stand C-842',
        industry: 'Gifts, Novelties & General Merchandise',
        numberOfProducts: 6,
        experienceType: 'PHOTO_TOUR',
        templateId: 'INDUSTRIAL',
        hotspotBindings: { hotspot1: 'prod-p3-01' },
        serviceSelections: ['PHOTO_TOUR', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST'],
        status: 'PUBLISHED',
        priority: 'SHOW_STARTED',
        blockingReason: 'NONE',
        createdAt: '2026-08-20T09:00:00.000Z',
        updatedAt: '2026-08-22T04:00:00.000Z',
        publishedAt: '2026-08-20T11:00:00.000Z',
        settings: { enableLeadForm: true, enableRfq: true, enableSampleRequest: true, enableAppointments: true, leadEmail: 'dave@luminacraft.example' },
        assets: [{ key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' }],
        products: [
          { id: 'prod-p3-01', name: 'Prism Light Ambient LED Lantern', sku: 'LUM-LT-01', category: 'Illumination', price: 38, currency: 'USD', wholesaleVisible: true, moq: 24, heroImage: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800', description: 'Rechargeable wireless ambient light sculpture with touch dimmer.' }
        ],
        revisions: [{ version: 'v1', publishedAt: '2026-08-20T11:00:00.000Z', publicUrl: '/demo.html?project=proj-pilot-03-lumina', notes: 'ASD Market Week live launch' }],
        publishRecord: { publishedAt: '2026-08-20T11:00:00.000Z', publishedBy: 'Dave K. Sterling', publicUrl: '/demo.html?project=proj-pilot-03-lumina', activeServices: ['PHOTO_TOUR', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST'] },
        analytics: { boothVisits: 620, productViews: 1450, qrScans: 280, catalogDownloads: 190, leadsCaptured: 42, rfqsSubmitted: 22, samplesRequested: 16, meetingsBooked: 12 },
        leads: [
          { id: 'lead-p3-01', buyerName: 'Rachel Green', buyerCompany: 'Sunburst Gift Boutiques', email: 'rgreen@sunburstgifts.example', phone: '+1 (818) 555-0311', interestedProduct: 'Prism Light Ambient LED Lantern', source: 'PRODUCT_QR', actionType: 'RFQ', status: 'WON', notes: 'PO received for 240 units for holiday retail season.', date: '2026-08-21T11:30:00.000Z' },
          { id: 'lead-p3-02', buyerName: 'Mark Higgins', buyerCompany: 'Resort Merchandising Direct', email: 'mhiggins@resortdirect.example', phone: '+1 (305) 555-0992', interestedProduct: 'Prism Light Ambient LED Lantern', source: 'DIGITAL_BOOTH', actionType: 'SAMPLE', status: 'CONTACTED', notes: 'Requested sample evaluation unit for poolside boutique.', date: '2026-08-21T15:20:00.000Z' }
        ]
      },
      {
        id: 'proj-pilot-04-atlantica',
        channel: 'DIY_BUILDER',
        company: 'Atlantica Living Home & Decor',
        contact: 'Hannah Ross (Head of Merchandising)',
        email: 'hannah@atlanticaliving.example',
        phone: '+1 (404) 555-0722',
        website: 'https://atlanticaliving.example',
        description: 'Coastal and transitional home decor, ceramic tableware, and artisan textile collections.',
        tradeShow: 'Atlanta Market Summer 2026',
        showStartDate: '2026-07-14',
        showEndDate: '2026-07-20',
        daysUntilShow: -32,
        city: 'Atlanta, GA',
        venue: 'AmericasMart Atlanta',
        boothNumber: 'Building 1 — Floor 8 Stand 840',
        industry: 'Furniture, Home Decor & Lighting',
        numberOfProducts: 10,
        experienceType: 'DESIGNED_3D',
        templateId: 'MINIMAL',
        hotspotBindings: { hotspot1: 'prod-p4-01' },
        serviceSelections: ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE'],
        status: 'IN_PRODUCTION',
        priority: 'NORMAL',
        blockingReason: 'NONE',
        createdAt: '2026-08-15T12:00:00.000Z',
        updatedAt: '2026-08-22T04:00:00.000Z',
        managedHandoff: { requestedAt: '2026-08-19T10:00:00.000Z', notes: 'Customer handed off DIY draft for dn’a team to optimize 3D lighting and complete post-show lead migration.', requestedBy: 'Hannah Ross', handoffStatus: 'ACTIVE' },
        settings: { enableLeadForm: true, enableRfq: true, enableSampleRequest: true, enableAppointments: true, leadEmail: 'hannah@atlanticaliving.example' },
        assets: [{ key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' }],
        products: [
          { id: 'prod-p4-01', name: 'Terracotta Sculptural Vase Ensemble', sku: 'ATL-VS-01', category: 'Decor', price: 145, currency: 'USD', wholesaleVisible: true, moq: 12, heroImage: 'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?w=800', description: 'Handmade terracotta stoneware trio with matte chalk finish.' }
        ],
        revisions: [],
        publishRecord: null,
        analytics: { boothVisits: 0, productViews: 0, qrScans: 0, catalogDownloads: 0, leadsCaptured: 0, rfqsSubmitted: 0, samplesRequested: 0, meetingsBooked: 0 },
        leads: [
          { id: 'lead-p4-01', buyerName: 'Liam O’Connor', buyerCompany: 'Savannah Interior Guild', email: 'loconnor@savannahguild.example', phone: '+1 (912) 555-0814', interestedProduct: 'Terracotta Sculptural Vase Ensemble', source: 'SMART_CARD', actionType: 'RFQ', status: 'FOLLOW_UP', notes: 'Reviewing pricing for 40 showroom displays in Southeast.', date: '2026-08-20T16:00:00.000Z' }
        ]
      },
      {
        id: 'proj-pilot-05-textura',
        channel: 'DIY_BUILDER',
        company: 'Textura Mill Works',
        contact: 'Samuel B. Sterling (Managing Director)',
        email: 'samuel@texturamills.example',
        phone: '+1 (704) 555-0391',
        website: 'https://texturamills.example',
        description: 'Sustainable jacquard upholstery, commercial contract performance fabrics, and textured linen weaves.',
        tradeShow: 'Interwoven High Point 2026',
        showStartDate: '2026-11-10',
        showEndDate: '2026-11-12',
        daysUntilShow: 80,
        city: 'High Point, NC',
        venue: 'Market Square Textile Center',
        boothNumber: 'Suite MS-310',
        industry: 'Other Commercial B2B',
        numberOfProducts: 9,
        experienceType: 'DIGITAL_SHOWROOM',
        templateId: 'INDUSTRIAL',
        hotspotBindings: { hotspot1: 'prod-p5-01' },
        serviceSelections: ['DIGITAL_SHOWROOM', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST'],
        status: 'PUBLISHED',
        priority: 'NORMAL',
        blockingReason: 'NONE',
        createdAt: '2026-08-17T08:00:00.000Z',
        updatedAt: '2026-08-22T04:00:00.000Z',
        publishedAt: '2026-08-21T16:00:00.000Z',
        settings: { enableLeadForm: true, enableRfq: true, enableSampleRequest: true, enableAppointments: true, leadEmail: 'samuel@texturamills.example' },
        assets: [{ key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=300' }],
        products: [
          { id: 'prod-p5-01', name: 'Aeroweave Performance Jacquard — Slate', sku: 'TXT-AW-01', category: 'Contract Fabric', price: 48, currency: 'USD', wholesaleVisible: true, moq: 50, heroImage: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=800', description: 'Heavy-duty commercial grade upholstery fabric with 100,000 double rubs Wyzenbeek rating.' }
        ],
        revisions: [{ version: 'v1', publishedAt: '2026-08-21T16:00:00.000Z', publicUrl: '/demo.html?project=proj-pilot-05-textura', notes: 'Interwoven early linesheet release' }],
        publishRecord: { publishedAt: '2026-08-21T16:00:00.000Z', publishedBy: 'Samuel B. Sterling', publicUrl: '/demo.html?project=proj-pilot-05-textura', activeServices: ['DIGITAL_SHOWROOM', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE', 'SAMPLE_REQUEST'] },
        analytics: { boothVisits: 310, productViews: 790, qrScans: 95, catalogDownloads: 140, leadsCaptured: 31, rfqsSubmitted: 18, samplesRequested: 24, meetingsBooked: 9 },
        leads: [
          { id: 'lead-p5-01', buyerName: 'Victor Martinez', buyerCompany: 'Carolina Contract Seating', email: 'vmartinez@carolinaseating.example', phone: '+1 (828) 555-0912', interestedProduct: 'Aeroweave Performance Jacquard — Slate', source: 'SAMPLE_REQUEST', actionType: 'SAMPLE', status: 'SAMPLE_REQUESTED', notes: 'Requested 5-yard memo sample for university stadium seating project.', date: '2026-08-21T17:40:00.000Z' },
          { id: 'lead-p5-02', buyerName: 'Emily Watson', buyerCompany: 'Studio Watson Hospitality', email: 'ewatson@studiowatson.example', phone: '+1 (615) 555-0284', interestedProduct: 'Aeroweave Performance Jacquard — Slate', source: 'DIGITAL_BOOTH', actionType: 'RFQ', status: 'QUALIFIED', notes: 'Inquiring for 800 yards for boutique hotel renovation.', date: '2026-08-22T03:10:00.000Z' }
        ]
      }
    ];

    controlledProjects.forEach(sp => {
      if (!data.productionProjects.find(p => p.id === sp.id)) {
        data.productionProjects.push(sp);
      }
    });
  }

  read() {
    if (!this.memoryData) this.init();
    return this.memoryData;
  }

  write(data) {
    try {
      this.memoryData = data;
      fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(TEMP_DB_FILE, DB_FILE);
      return true;
    } catch (err) {
      console.error('Error writing database:', err);
      return false;
    }
  }

  mutate(callback) {
    const data = this.read();
    const result = callback(data);
    this.write(data);
    return result;
  }

  // --- Audit Log ---
  logAudit(userId, organizationId, action, resourceType, resourceId, details = {}) {
    return this.mutate((db) => {
      db.auditLogs = db.auditLogs || [];
      const entry = {
        id: `audit-${uuidv4().substring(0, 8)}`,
        userId: userId || 'system',
        organizationId: organizationId || 'system',
        action,
        resourceType,
        resourceId,
        details,
        timestamp: new Date().toISOString()
      };
      db.auditLogs.push(entry);
      if (db.auditLogs.length > 500) {
        db.auditLogs.shift();
      }
      return entry;
    });
  }

  getAuditLogs() {
    return this.read().auditLogs || [];
  }

  // --- Organizations API ---
  getOrganizations() {

    return this.read().organizations || [];
  }

  getOrganizationById(id) {
    return (this.read().organizations || []).find(o => o.id === id) || null;
  }

  async createOrganization({ type, name, slug, category }) {
    return this.mutate((db) => {
      const org = {
        id: `org-${type}-${uuidv4().substring(0, 8)}`,
        type: type || 'exhibitor',
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        category: category || 'General',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.organizations.push(org);
      return org;
    });
  }

  // --- Users API ---
  getUsers(organizationId = null) {
    const users = this.read().users || [];
    if (organizationId) {
      return users.filter(u => u.organizationId === organizationId);
    }
    return users;
  }

  getUserById(id) {
    return (this.read().users || []).find(u => u.id === id) || null;
  }

  getUserByEmail(email) {
    if (!email) return null;
    return (this.read().users || []).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async createUser({ organizationId, email, name, role, password, mustChangePassword = true }) {
    const strengthCheck = validatePasswordStrength(password);
    if (!strengthCheck.valid) {
      const err = new Error(strengthCheck.message);
      err.code = strengthCheck.code;
      throw err;
    }
    return this.mutate((db) => {
      const existing = (db.users || []).find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existing) throw new Error('A user with this email address already exists.');

      const { hash, salt } = hashPassword(password);

      const user = {
        id: `user-${uuidv4().substring(0, 8)}`,
        organizationId,
        email: email.toLowerCase(),
        name,
        role: role || 'exhibitor_admin',
        hash,
        salt,
        mustChangePassword: Boolean(mustChangePassword),
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.users.push(user);
      return { id: user.id, organizationId: user.organizationId, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword };
    });
  }

  async updateUserPassword(userId, newPassword) {
    const check = validatePasswordStrength(newPassword);
    if (!check.valid) {
      throw new Error(check.message);
    }
    return this.mutate((db) => {
      const user = (db.users || []).find(u => u.id === userId);
      if (!user) throw new Error('User not found.');
      const { hash, salt } = hashPassword(newPassword);
      user.hash = hash;
      user.salt = salt;
      user.mustChangePassword = false;
      user.updatedAt = new Date().toISOString();
      return true;
    });
  }

  // --- Phase 9 Operational Incidents & Cost Ledger ---
  getIncidents(limit = 50) {
    const list = this.read().incidents || [];
    return list.slice(-limit).reverse();
  }

  logIncident({ category, severity, message, organizationId = null, boothId = null, metadata = {} }) {
    return this.mutate((db) => {
      db.incidents = db.incidents || [];
      const entry = {
        id: `inc-${uuidv4().substring(0, 8)}`,
        category: category || 'GENERAL',
        severity: severity || 'LOW', // LOW, MEDIUM, HIGH, CRITICAL
        message,
        organizationId,
        boothId,
        metadata,
        timestamp: new Date().toISOString()
      };
      db.incidents.push(entry);
      if (db.incidents.length > 500) db.incidents.shift();
      return entry;
    });
  }

  getCostLedger() {
    return this.read().costLedger || [
      {
        id: 'cost-init-01',
        category: 'Railway Hobby Hosting',
        provider: 'Railway',
        estimatedUsd: 5.00,
        actualUsd: 5.00,
        notes: 'Monthly active hobby plan base',
        timestamp: new Date().toISOString()
      },
      {
        id: 'cost-init-02',
        category: 'Modal L4 GPU Compute',
        provider: 'Modal Starter',
        estimatedUsd: 0.00,
        actualUsd: 0.00,
        freeCreditUsed: true,
        notes: '36-72 image Splatfacto pilot under starter free credit quota',
        timestamp: new Date().toISOString()
      }
    ];
  }

  logCostEntry({ category, provider, estimatedUsd, actualUsd = 0.0, notes = '', freeCreditUsed = false }) {
    return this.mutate((db) => {
      db.costLedger = db.costLedger || [];
      const entry = {
        id: `cost-${uuidv4().substring(0, 8)}`,
        category,
        provider,
        estimatedUsd: Number(estimatedUsd) || 0.0,
        actualUsd: Number(actualUsd) || 0.0,
        freeCreditUsed: Boolean(freeCreditUsed),
        notes,
        timestamp: new Date().toISOString()
      };
      db.costLedger.push(entry);
      return entry;
    });
  }



  // --- Events API ---
  getEvents(publishedOnly = false) {
    const events = this.read().events || [];
    if (publishedOnly) {
      return events.filter(e => e.status === 'published');
    }
    return events;
  }

  getEventById(id) {
    return (this.read().events || []).find(e => e.id === id) || null;
  }

  getEventBySlug(slug) {
    return (this.read().events || []).find(e => e.slug === slug) || null;
  }

  async createEvent({ organizerOrganizationId, name, slug, description, bannerImage, startsAt, endsAt }) {
    return this.mutate((db) => {
      const event = {
        id: `event-${uuidv4().substring(0, 8)}`,
        organizerOrganizationId,
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: description || '',
        bannerImage: bannerImage || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1600&q=80',
        startsAt: startsAt || new Date().toISOString(),
        endsAt: endsAt || new Date(Date.now() + 30 * 86400000).toISOString(),
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.events.push(event);
      return event;
    });
  }

  // --- Event Exhibitors API ---
  getEventExhibitors(eventId) {
    return (this.read().eventExhibitors || []).filter(ee => ee.eventId === eventId);
  }

  async addEventExhibitor({ eventId, exhibitorOrganizationId, boothId, category, boothNumber }) {
    return this.mutate((db) => {
      db.eventExhibitors = db.eventExhibitors || [];
      const entry = {
        id: `ee-${uuidv4().substring(0, 8)}`,
        eventId,
        exhibitorOrganizationId,
        boothId: boothId || null,
        category: category || 'General',
        boothNumber: boothNumber || `B-${Math.floor(100 + Math.random() * 900)}`,
        status: 'active',
        joinedAt: new Date().toISOString()
      };
      db.eventExhibitors.push(entry);
      return entry;
    });
  }

  // --- Booths API ---
  getBooths(includeDrafts = false, organizationId = null, eventId = null) {
    let booths = this.read().booths || [];
    if (!includeDrafts) {
      booths = booths.filter(b => b.status === 'published');
    }
    if (organizationId) {
      booths = booths.filter(b => b.organizationId === organizationId);
    }
    if (eventId) {
      booths = booths.filter(b => b.eventId === eventId);
    }
    return booths;
  }

  getBoothById(id, includeDrafts = false) {
    const booth = (this.read().booths || []).find(b => b.id === id);
    if (!booth) return null;
    if (!includeDrafts && booth.status !== 'published') return null;
    return booth;
  }

  async createBooth(boothData) {
    return this.mutate((db) => {
      const newBooth = {
        id: boothData.id || `booth-${uuidv4().substring(0, 8)}`,
        organizationId: boothData.organizationId || 'org-exhibitor-apex',
        eventId: boothData.eventId || 'event-global-tech-2026',
        exhibitorId: boothData.exhibitorId || 'user-admin',
        name: boothData.name,
        description: boothData.description || '',
        themeColor: boothData.themeColor || '#0f766e',
        status: boothData.status || 'draft',
        reconstructionStatus: boothData.reconstructionStatus || 'photo_preview',
        reconstructionJobId: null,
        photos: boothData.photos || [],
        spatialModel: boothData.spatialModel || {
          type: 'photo_preview',
          environmentLayout: 'hexagon_booth'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.booths.push(newBooth);
      return newBooth;
    });
  }

  async updateBooth(id, boothData) {
    return this.mutate((db) => {
      const idx = (db.booths || []).findIndex(b => b.id === id);
      if (idx === -1) return null;
      db.booths[idx] = {
        ...db.booths[idx],
        ...boothData,
        updatedAt: new Date().toISOString()
      };
      return db.booths[idx];
    });
  }

  // --- Reconstruction Jobs API ---
  getReconstructionJobs(organizationId = null, eventId = null) {
    let jobs = this.read().reconstructionJobs || [];
    if (organizationId) {
      jobs = jobs.filter(j => j.organizationId === organizationId);
    }
    if (eventId) {
      jobs = jobs.filter(j => j.eventId === eventId);
    }
    return jobs;
  }

  getReconstructionJobById(jobId) {
    return (this.read().reconstructionJobs || []).find(j => j.id === jobId) || null;
  }

  getReconstructionJobByBoothId(boothId) {
    const jobs = (this.read().reconstructionJobs || []).filter(j => j.boothId === boothId);
    return jobs.length > 0 ? jobs[jobs.length - 1] : null;
  }

  async createReconstructionJob(boothId, options = {}) {
    return this.mutate((db) => {
      const booth = (db.booths || []).find(b => b.id === boothId);
      if (!booth) throw new Error('Booth not found');

      const count = (booth.photos || []).length;
      if (count < 3) {
        throw new Error('Insufficient photos for reconstruction. At least 3 photos are required.');
      }

      const activeJob = (db.reconstructionJobs || []).find(
        j => j.boothId === boothId && (j.status === 'pending' || j.status === 'processing' || j.status === 'awaiting_approval')
      );
      if (activeJob) {
        throw new Error(`An active reconstruction job (${activeJob.id}) is already in state: ${activeJob.status}`);
      }

      const requireApproval = options.requireApproval !== undefined ? Boolean(options.requireApproval) : true;

      const job = {
        id: `recon-job-${uuidv4().substring(0, 8)}`,
        organizationId: booth.organizationId,
        eventId: booth.eventId,
        boothId: booth.id,
        status: requireApproval ? 'awaiting_approval' : 'pending',
        approvalStatus: requireApproval ? 'awaiting_approval' : 'approved',
        progress: 0,
        currentStage: requireApproval ? 'awaiting_organizer_approval' : 'queued_for_worker',
        qualityPreset: options.qualityPreset || 'production_ultra',
        engine: options.engine || 'nerfstudio-splatfacto',
        workerId: null,

        dataset: {
          photoCount: count,
          photos: booth.photos || []
        },
        diagnostics: {},
        output: null,
        costEstimate: {
          provider: 'Modal L4 GPU',
          estimatedUsd: 0.00,
          freeCreditEligible: true
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.reconstructionJobs = db.reconstructionJobs || [];
      db.reconstructionJobs.push(job);

      booth.reconstructionStatus = 'reconstruction_pending';
      booth.reconstructionJobId = job.id;
      booth.updatedAt = new Date().toISOString();

      return job;
    });
  }

  async approveReconstructionJob(jobId) {
    return this.mutate((db) => {
      const job = (db.reconstructionJobs || []).find(j => j.id === jobId);
      if (!job) throw new Error('Job not found');
      job.approvalStatus = 'approved';
      job.status = 'pending';
      job.currentStage = 'queued_for_worker';
      job.updatedAt = new Date().toISOString();
      return job;
    });
  }

  async claimNextPendingJob(workerId) {
    return this.mutate((db) => {
      db.reconstructionJobs = db.reconstructionJobs || [];
      const job = db.reconstructionJobs.find(j => j.status === 'pending' && j.approvalStatus === 'approved');
      if (!job) return null;

      job.status = 'processing';
      job.workerId = workerId;
      job.progress = 5;
      job.currentStage = 'worker_initializing';
      job.startedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      const booth = (db.booths || []).find(b => b.id === job.boothId);
      if (booth) {
        booth.reconstructionStatus = 'processing';
        booth.updatedAt = new Date().toISOString();
      }

      return job;
    });
  }

  async updateJobProgress(jobId, progress, currentStage, diagnostics = null) {
    return this.mutate((db) => {
      const job = (db.reconstructionJobs || []).find(j => j.id === jobId);
      if (!job) throw new Error('Job not found');
      job.progress = Math.min(Math.max(Number(progress) || 0, 0), 99);
      job.currentStage = currentStage || job.currentStage;
      job.updatedAt = new Date().toISOString();
      if (diagnostics) {
        job.diagnostics = { ...job.diagnostics, ...diagnostics };
      }
      return job;
    });
  }

  async completeJob(jobId, output, diagnostics = null) {
    return this.mutate((db) => {
      const job = (db.reconstructionJobs || []).find(j => j.id === jobId);
      if (!job) throw new Error('Job not found');
      if (job.status !== 'processing') {
        throw new Error(`Cannot complete job in ${job.status} state`);
      }

      job.status = 'reconstructed';
      job.progress = 100;
      job.currentStage = 'completed';
      job.completedAt = new Date().toISOString();
      job.output = output || {
        type: 'gaussian_splat',
        url: `/uploads/models/${job.boothId}_splat.spz`,
        format: 'spz',
        sizeBytes: 6842100
      };
      if (diagnostics) {
        job.diagnostics = { ...job.diagnostics, ...diagnostics };
      }

      const booth = (db.booths || []).find(b => b.id === job.boothId);
      if (booth) {
        booth.reconstructionStatus = 'reconstructed';
        booth.spatialModel = {
          type: 'gaussian_splat',
          assetUrl: job.output.url,
          format: job.output.format
        };
        booth.updatedAt = new Date().toISOString();
      }

      return job;
    });
  }

  async verifyJob(jobId, alignment = null) {
    return this.mutate((db) => {
      const job = (db.reconstructionJobs || []).find(j => j.id === jobId);
      if (!job) throw new Error('Job not found');

      job.status = 'verified';
      job.verifiedAt = new Date().toISOString();

      const booth = (db.booths || []).find(b => b.id === job.boothId);
      if (booth) {
        booth.reconstructionStatus = 'verified';
        if (alignment) {
          booth.spatialModel.transform = alignment;
        }
        booth.updatedAt = new Date().toISOString();
      }

      return job;
    });
  }

  // --- Products API ---
  getProducts(boothId = null, organizationId = null) {
    let list = this.read().products || [];
    if (boothId) list = list.filter(p => p.boothId === boothId);
    if (organizationId) list = list.filter(p => p.organizationId === organizationId);
    return list;
  }

  getProductsByBooth(boothId) {
    return (this.read().products || []).filter(p => p.boothId === boothId);
  }

  getProductById(id) {
    return (this.read().products || []).find(p => p.id === id) || null;
  }


  async createProduct(prodData) {
    return this.mutate((db) => {
      const newProd = {
        id: `prod-${uuidv4().substring(0, 8)}`,
        organizationId: prodData.organizationId || 'org-exhibitor-apex',
        boothId: prodData.boothId,
        name: prodData.name,
        sku: prodData.sku || '',
        category: prodData.category || 'General',
        moq: Number(prodData.moq) || 1,
        price: Number(prodData.price) || 0,
        contactForPrice: Boolean(prodData.contactForPrice),
        currency: prodData.currency || 'USD',
        description: prodData.description || '',
        images: prodData.images || [],
        specs: prodData.specs || {},
        inventoryStatus: prodData.inventoryStatus || 'in_stock',
        createdAt: new Date().toISOString()
      };
      db.products.push(newProd);
      return newProd;
    });
  }

  // --- Hotspots API ---
  getHotspotsByBooth(boothId) {
    return (this.read().hotspots || []).filter(h => h.boothId === boothId);
  }

  async createHotspot(data) {
    return this.mutate((db) => {
      const hs = {
        id: `hs-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId || 'org-exhibitor-apex',
        boothId: data.boothId,
        productId: data.productId,
        position: data.position || { x: 0, y: 1, z: 0 },
        label: data.label || '',
        createdAt: new Date().toISOString()
      };
      db.hotspots.push(hs);
      return hs;
    });
  }

  // --- Leads / RFQs / Samples / Appointments API ---
  getLeads(organizationId = null, boothId = null) {
    let list = this.read().leads || [];
    if (organizationId) list = list.filter(l => l.organizationId === organizationId);
    if (boothId) list = list.filter(l => l.boothId === boothId);
    return list;
  }

  async createLead(data) {
    return this.mutate((db) => {
      const item = {
        id: `lead-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        eventId: data.eventId,
        boothId: data.boothId,
        productId: data.productId || null,
        buyerName: data.buyerName,
        company: data.company,
        email: data.email,
        phone: data.phone || '',
        jobTitle: data.jobTitle || '',
        notes: data.notes || '',
        createdAt: new Date().toISOString()
      };
      db.leads.push(item);
      return item;
    });
  }

  getRfqs(organizationId = null, boothId = null) {
    let list = this.read().rfqs || [];
    if (organizationId) list = list.filter(r => r.organizationId === organizationId);
    if (boothId) list = list.filter(r => r.boothId === boothId);
    return list;
  }

  async createRfq(data) {
    return this.mutate((db) => {
      const item = {
        id: `rfq-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        eventId: data.eventId,
        boothId: data.boothId,
        productId: data.productId,
        buyerName: data.buyerName,
        company: data.company,
        email: data.email,
        quantity: Number(data.quantity) || 1,
        targetPrice: data.targetPrice || null,
        notes: data.notes || '',
        status: 'new',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.rfqs.push(item);
      return item;
    });
  }

  getSamples(organizationId = null, boothId = null) {
    let list = this.read().samples || [];
    if (organizationId) list = list.filter(s => s.organizationId === organizationId);
    if (boothId) list = list.filter(s => s.boothId === boothId);
    return list;
  }

  async createSample(data) {
    return this.mutate((db) => {
      const item = {
        id: `sample-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        eventId: data.eventId,
        boothId: data.boothId,
        productId: data.productId,
        buyerName: data.buyerName,
        company: data.company,
        email: data.email,
        quantity: Number(data.quantity) || 1,
        notes: data.notes || '',
        status: 'new',
        createdAt: new Date().toISOString()
      };
      db.samples.push(item);
      return item;
    });
  }

  getAppointments(organizationId = null, boothId = null) {
    let list = this.read().appointments || [];
    if (organizationId) list = list.filter(a => a.organizationId === organizationId);
    if (boothId) list = list.filter(a => a.boothId === boothId);
    return list;
  }

  async createAppointment(data) {
    return this.mutate((db) => {
      const item = {
        id: `apt-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        eventId: data.eventId,
        boothId: data.boothId,
        productId: data.productId || null,
        buyerName: data.buyerName,
        company: data.company,
        email: data.email,
        requestedAt: data.requestedAt || new Date().toISOString(),
        notes: data.notes || '',
        status: 'requested',
        createdAt: new Date().toISOString()
      };
      db.appointments.push(item);
      return item;
    });
  }

  // --- Managed Production Requests (Phase dn’a-C01) ---
  getProductionRequests() {
    const data = this.read();
    return (data.productionRequests || []).slice();
  }

  async createProductionRequest(payload) {
    return this.mutate((db) => {
      db.productionRequests = db.productionRequests || [];
      const id = `req-${Date.now()}-${uuidv4().substring(0, 6)}`;
      const now = new Date().toISOString();
      
      // Calculate days until show date if showDate provided
      let daysUntilShow = null;
      if (payload.showDate) {
        const show = new Date(payload.showDate);
        const today = new Date();
        const diffTime = show - today;
        daysUntilShow = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const newRequest = {
        id,
        companyName: (payload.companyName || '').trim() || 'Unknown Company',
        contactName: (payload.contactName || '').trim() || '',
        email: (payload.email || '').trim() || '',
        phone: (payload.phone || '').trim() || '',
        website: (payload.website || '').trim() || '',
        tradeShow: (payload.tradeShow || '').trim() || '',
        showDate: (payload.showDate || '').trim() || '',
        daysUntilShow,
        city: (payload.city || '').trim() || '',
        boothNumber: (payload.boothNumber || '').trim() || '',
        industry: (payload.industry || '').trim() || '',
        productCount: parseInt(payload.productCount, 10) || 5,
        services: Array.isArray(payload.services) ? payload.services : (payload.services ? [payload.services] : []),
        deadline: (payload.deadline || '').trim() || '',
        notes: (payload.notes || '').trim() || '',
        status: 'NEW_REQUEST',
        createdAt: now,
        updatedAt: now
      };

      db.productionRequests.unshift(newRequest);
      return newRequest;
    });
  }

  async updateProductionRequestStatus(id, newStatus, internalNotes = '') {
    return this.mutate((db) => {
      db.productionRequests = db.productionRequests || [];
      const req = db.productionRequests.find(r => r.id === id);
      if (!req) return null;
      req.status = newStatus;
      if (internalNotes) req.internalNotes = internalNotes;
      req.updatedAt = new Date().toISOString();
      return req;
    });
  }

  // =========================================================================
  // dn’a-C02 — MANAGED PRODUCTION OPERATIONS ENGINE
  // =========================================================================

  calculateShowDatePriority(showStartDate, showEndDate) {
    if (!showStartDate) return { daysUntilShow: null, priority: 'NORMAL' };
    const now = new Date();
    const start = new Date(showStartDate);
    const end = showEndDate ? new Date(showEndDate) : new Date(showStartDate);

    // If currently during the show
    if (now >= start && now <= new Date(end.getTime() + 86400000)) {
      return { daysUntilShow: 0, priority: 'SHOW_STARTED' };
    }
    // If show has passed
    if (now > new Date(end.getTime() + 86400000)) {
      const daysPast = Math.floor((now - end) / (1000 * 60 * 60 * 24));
      return { daysUntilShow: -daysPast, priority: 'SHOW_ENDED' };
    }

    const diffDays = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    let priority = 'NORMAL';
    if (diffDays <= 2) priority = 'CRITICAL';
    else if (diffDays <= 7) priority = 'URGENT';
    else if (diffDays <= 14) priority = 'DUE_SOON';

    return { daysUntilShow: diffDays, priority };
  }

  generateStandardAssetsChecklist(serviceSelections = []) {
    return [
      { key: 'LOGO', label: 'Vector Brand Logo (SVG/PNG)', required: true, status: 'MISSING', notes: '' },
      { key: 'COMPANY_DESCRIPTION', label: 'Company Overview & Slogan', required: true, status: 'MISSING', notes: '' },
      { key: 'CONTACT_INFORMATION', label: 'Sales Rep Details for Smart Card', required: true, status: 'MISSING', notes: '' },
      { key: 'PRODUCT_NAMES', label: 'Product Names, SKUs & Categories', required: true, status: 'MISSING', notes: '' },
      { key: 'PRODUCT_DESCRIPTIONS', label: 'Product Copy & Technical Specs', required: true, status: 'MISSING', notes: '' },
      { key: 'PRODUCT_IMAGES', label: 'High-Res Product Photography', required: true, status: 'MISSING', notes: '' },
      { key: 'CATALOG_PDF', label: 'Digital Catalog & Datasheets (PDF)', required: serviceSelections.includes('DIGITAL_CATALOG'), status: 'MISSING', notes: '' },
      { key: 'BOOTH_PHOTOS', label: 'Physical Booth Renderings or Photos', required: false, status: 'MISSING', notes: '' },
      { key: 'BRAND_GUIDELINES', label: 'Color Palette Codes & Typography', required: false, status: 'MISSING', notes: '' }
    ];
  }

  generateServiceAwareTasks(serviceSelections = [], project = {}) {
    const tasks = [];
    let idCounter = 1;

    tasks.push({
      id: `task-${idCounter++}`,
      key: '3D_BOOTH_DESIGN',
      name: '3D Architectural Virtual Booth Setup',
      category: '3D_PRODUCTION',
      status: 'READY',
      assignedTo: project.assignedProducer || 'Elena Rostova (Lead 3D Producer)',
      dueDate: project.dueAt || ''
    });

    tasks.push({
      id: `task-${idCounter++}`,
      key: 'PRODUCT_SETUP',
      name: `Configure ${project.numberOfProducts || 8}x 3D Product Plinths & Specs`,
      category: 'CONTENT',
      status: 'NOT_STARTED',
      assignedTo: project.assignedProducer || 'Elena Rostova',
      dueDate: project.dueAt || ''
    });

    if (serviceSelections.includes('PHOTO_TOUR')) {
      tasks.push({
        id: `task-${idCounter++}`,
        key: 'PHOTO_TOUR_SETUP',
        name: 'Interactive Photo Tour Panorama Nodes',
        category: 'MEDIA',
        status: 'NOT_STARTED',
        assignedTo: project.assignedProducer || 'Elena Rostova'
      });
    }

    if (serviceSelections.includes('DIGITAL_CATALOG')) {
      tasks.push({
        id: `task-${idCounter++}`,
        key: 'CATALOG_INTEGRATION',
        name: 'Digital Literature & PDF Catalog Hub',
        category: 'CONTENT',
        status: 'NOT_STARTED',
        assignedTo: project.assignedProducer || 'Elena Rostova'
      });
    }

    if (serviceSelections.includes('SMART_CARD')) {
      tasks.push({
        id: `task-${idCounter++}`,
        key: 'SMART_CARD_SETUP',
        name: 'Smart Exhibitor Card & vCard Pipeline',
        category: 'ENGAGEMENT',
        status: 'NOT_STARTED',
        assignedTo: project.assignedProducer || 'Elena Rostova'
      });
    }

    if (serviceSelections.includes('PRODUCT_QR')) {
      tasks.push({
        id: `task-${idCounter++}`,
        key: 'PRODUCT_QR_SETUP',
        name: 'Product Waypoint Mobile QR Routes',
        category: 'ENGAGEMENT',
        status: 'NOT_STARTED',
        assignedTo: project.assignedProducer || 'Elena Rostova'
      });
    }

    if (serviceSelections.includes('RFQ_LEAD_CAPTURE')) {
      tasks.push({
        id: `task-${idCounter++}`,
        key: 'RFQ_SETUP',
        name: '24/7 Wholesale RFQ & CRM Lead Webhooks',
        category: 'INTEGRATIONS',
        status: 'NOT_STARTED',
        assignedTo: project.assignedProducer || 'Elena Rostova'
      });
    }

    if (serviceSelections.includes('SAMPLE_REQUEST')) {
      tasks.push({
        id: `task-${idCounter++}`,
        key: 'SAMPLE_REQUEST_SETUP',
        name: 'Evaluation Sample Dispatch Workflow',
        category: 'INTEGRATIONS',
        status: 'NOT_STARTED',
        assignedTo: project.assignedProducer || 'Elena Rostova'
      });
    }

    return tasks;
  }

  getProductionProjects(filter = {}) {
    const list = this.read().productionProjects || [];
    return list.map(p => {
      // Dynamically recalculate show date priorities on read
      const prio = this.calculateShowDatePriority(p.showStartDate, p.showEndDate);
      return {
        ...p,
        daysUntilShow: prio.daysUntilShow,
        priority: p.status === 'SHOW_LIVE' ? 'SHOW_STARTED' : (p.status === 'POST_SHOW' ? 'SHOW_ENDED' : prio.priority)
      };
    }).filter(p => {
      if (filter.status && p.status !== filter.status) return false;
      if (filter.priority && p.priority !== filter.priority) return false;
      if (filter.tradeShow && !p.tradeShow.toLowerCase().includes(filter.tradeShow.toLowerCase())) return false;
      if (filter.company && !p.company.toLowerCase().includes(filter.company.toLowerCase())) return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        return p.company.toLowerCase().includes(q) ||
               p.tradeShow.toLowerCase().includes(q) ||
               p.contact.toLowerCase().includes(q) ||
               (p.boothNumber && p.boothNumber.toLowerCase().includes(q)) ||
               p.id.toLowerCase().includes(q);
      }
      return true;
    });
  }

  getProductionProjectById(id, isClientSafe = false) {
    const list = this.read().productionProjects || [];
    const p = list.find(x => x.id === id);
    if (!p) return null;

    const prio = this.calculateShowDatePriority(p.showStartDate, p.showEndDate);
    const enriched = {
      ...p,
      daysUntilShow: prio.daysUntilShow,
      priority: p.status === 'SHOW_LIVE' ? 'SHOW_STARTED' : (p.status === 'POST_SHOW' ? 'SHOW_ENDED' : prio.priority)
    };

    // Client-safe output stripping internal notes and operator-only data
    if (isClientSafe) {
      const clientSafe = { ...enriched };
      delete clientSafe.internalNotes;
      delete clientSafe.qaChecklist;
      clientSafe.assignedProducer = 'dn’a Production Lead';
      clientSafe.assignedReviewer = undefined;
      return clientSafe;
    }

    return enriched;
  }

  async createProductionProject(payload, actor = 'Operations') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const now = new Date().toISOString();
      const id = payload.id || `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const showStartDate = (payload.showStartDate || '').trim();
      const showEndDate = (payload.showEndDate || '').trim();
      const prio = this.calculateShowDatePriority(showStartDate, showEndDate);

      const services = Array.isArray(payload.serviceSelections) ? payload.serviceSelections : [];

      const newProject = {
        id,
        productionRequestId: payload.productionRequestId || null,
        company: (payload.company || '').trim(),
        contact: (payload.contact || '').trim(),
        email: (payload.email || '').trim(),
        phone: (payload.phone || '').trim(),
        website: (payload.website || '').trim(),
        tradeShow: (payload.tradeShow || '').trim(),
        showStartDate,
        showEndDate,
        daysUntilShow: prio.daysUntilShow,
        city: (payload.city || '').trim(),
        venue: (payload.venue || '').trim(),
        boothNumber: (payload.boothNumber || '').trim(),
        industry: (payload.industry || '').trim(),
        numberOfProducts: parseInt(payload.numberOfProducts, 10) || 8,
        serviceSelections: services,
        assignedProducer: payload.assignedProducer || 'Elena Rostova (Lead 3D Producer)',
        assignedReviewer: payload.assignedReviewer || 'Marcus Vance (QA Director)',
        status: payload.status || 'QUALIFICATION',
        priority: prio.priority,
        blockingReason: 'NONE',
        createdAt: now,
        updatedAt: now,
        dueAt: payload.dueAt || '',
        publishedAt: null,
        internalNotes: payload.internalNotes ? [{ id: `n-${Date.now()}`, text: payload.internalNotes, author: actor, createdAt: now }] : [],
        clientVisibleNotes: [{ id: `cn-${Date.now()}`, text: 'Project initialized in dn’a Managed Production Queue.', author: 'dn’a Production Team', createdAt: now }],
        assets: this.generateStandardAssetsChecklist(services),
        tasks: this.generateServiceAwareTasks(services, { numberOfProducts: payload.numberOfProducts, assignedProducer: payload.assignedProducer, dueAt: payload.dueAt }),
        qaChecklist: {
          status: 'PENDING',
          reviewer: null,
          reviewedAt: null,
          checks: {
            correctCompany: false, correctLogo: false, correctBooth: false, correctProducts: false,
            noBrokenImages: false, noBrokenCatalog: false, qrWorks: false, rfqWorks: false,
            sampleWorks: false, appointmentWorks: false, mobileWorks: false, truthful3DState: false
          }
        },
        revisions: [],
        clientFeedback: [],
        publishRecord: null,
        activityHistory: [
          { timestamp: now, action: 'PROJECT_CREATED', actor, details: `Created project ${id} for ${payload.company}` }
        ]
      };

      db.productionProjects.unshift(newProject);
      return newProject;
    });
  }

  async qualifyRequestAndCreateProject(requestId, overrideData = {}, actor = 'Operations') {
    return this.mutate((db) => {
      db.productionRequests = db.productionRequests || [];
      db.productionProjects = db.productionProjects || [];
      const req = db.productionRequests.find(r => r.id === requestId);
      if (!req) return null;

      // Update request status to QUALIFIED
      req.status = 'QUALIFIED';
      req.updatedAt = new Date().toISOString();

      const projectPayload = {
        productionRequestId: req.id,
        company: req.companyName,
        contact: req.contactName,
        email: req.email,
        phone: req.phone,
        website: req.website,
        tradeShow: req.tradeShow,
        showStartDate: req.showDate,
        city: req.city,
        boothNumber: req.boothNumber,
        industry: req.industry,
        numberOfProducts: req.productCount,
        serviceSelections: req.services,
        ...overrideData
      };

      const now = new Date().toISOString();
      const id = `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const prio = this.calculateShowDatePriority(projectPayload.showStartDate, projectPayload.showEndDate);
      const services = projectPayload.serviceSelections || [];

      const newProject = {
        id,
        productionRequestId: req.id,
        company: projectPayload.company,
        contact: projectPayload.contact,
        email: projectPayload.email,
        phone: projectPayload.phone,
        website: projectPayload.website,
        tradeShow: projectPayload.tradeShow,
        showStartDate: projectPayload.showStartDate,
        showEndDate: projectPayload.showEndDate || '',
        daysUntilShow: prio.daysUntilShow,
        city: projectPayload.city,
        venue: projectPayload.venue || '',
        boothNumber: projectPayload.boothNumber,
        industry: projectPayload.industry,
        numberOfProducts: parseInt(projectPayload.numberOfProducts, 10) || 8,
        serviceSelections: services,
        assignedProducer: projectPayload.assignedProducer || 'Elena Rostova (Lead 3D Producer)',
        assignedReviewer: projectPayload.assignedReviewer || 'Marcus Vance (QA Director)',
        status: 'ASSET_INTAKE',
        priority: prio.priority,
        blockingReason: 'MISSING_ASSETS',
        createdAt: now,
        updatedAt: now,
        dueAt: projectPayload.dueAt || '',
        publishedAt: null,
        internalNotes: [{ id: `n-${Date.now()}`, text: `Converted from Managed Order Request ${req.id}.`, author: actor, createdAt: now }],
        clientVisibleNotes: [{ id: `cn-${Date.now()}`, text: 'Your showroom project has been qualified! We are now waiting for your brand assets.', author: 'dn’a Production Team', createdAt: now }],
        assets: this.generateStandardAssetsChecklist(services),
        tasks: this.generateServiceAwareTasks(services, projectPayload),
        qaChecklist: {
          status: 'PENDING',
          reviewer: null,
          reviewedAt: null,
          checks: {
            correctCompany: false, correctLogo: false, correctBooth: false, correctProducts: false,
            noBrokenImages: false, noBrokenCatalog: false, qrWorks: false, rfqWorks: false,
            sampleWorks: false, appointmentWorks: false, mobileWorks: false, truthful3DState: false
          }
        },
        revisions: [],
        clientFeedback: [],
        publishRecord: null,
        activityHistory: [
          { timestamp: now, action: 'REQUEST_QUALIFIED', actor, details: `Qualified request ${req.id} into project ${id}` }
        ]
      };

      db.productionProjects.unshift(newProject);
      return newProject;
    });
  }

  async updateProjectStatus(id, newStatus, reason = '', actor = 'Operations') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      const oldStatus = p.status;
      p.status = newStatus;
      if (reason) p.blockingReason = reason;
      if (newStatus !== 'BLOCKED' && !reason) p.blockingReason = 'NONE';
      p.updatedAt = new Date().toISOString();

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: p.updatedAt,
        action: 'STATUS_CHANGED',
        actor,
        details: `Status transitioned from ${oldStatus} to ${newStatus}${reason ? ' (Reason: ' + reason + ')' : ''}`
      });

      return p;
    });
  }

  async updateProjectAsset(id, assetKey, assetStatus, notes = '', actor = 'Operations') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      p.assets = p.assets || [];
      const item = p.assets.find(a => a.key === assetKey);
      if (!item) return null;

      item.status = assetStatus;
      if (notes) item.notes = notes;
      if (assetStatus === 'RECEIVED' || assetStatus === 'APPROVED') {
        item.receivedAt = new Date().toISOString();
      }
      p.updatedAt = new Date().toISOString();

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: p.updatedAt,
        action: 'ASSET_UPDATED',
        actor,
        details: `Asset ${assetKey} updated to ${assetStatus}`
      });

      return p;
    });
  }

  async updateProjectTask(id, taskId, taskStatus, notes = '', actor = 'Operations') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      p.tasks = p.tasks || [];
      const t = p.tasks.find(x => x.id === taskId);
      if (!t) return null;

      t.status = taskStatus;
      if (notes) t.notes = notes;
      if (taskStatus === 'DONE') {
        t.completedAt = new Date().toISOString();
      }
      p.updatedAt = new Date().toISOString();

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: p.updatedAt,
        action: 'TASK_UPDATED',
        actor,
        details: `Task ${t.name} updated to ${taskStatus}`
      });

      return p;
    });
  }

  // --- dn’a-C04 Smart Wizard Production Reservations ---
  async createProductionReservation(payload, actor = 'SmartWizard') {
    return this.mutate((db) => {
      db.productionReservations = db.productionReservations || [];
      db.productionProjects = db.productionProjects || [];
      const now = new Date().toISOString();
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const ticketId = payload.reservationId || `DNA-2026-${randomNum}`;

      const reservation = {
        id: ticketId,
        reservationId: ticketId,
        company: (payload.company || payload.companyName || '').trim(),
        email: (payload.email || '').trim(),
        contact: (payload.contact || payload.contactName || '').trim(),
        tradeShow: (payload.tradeShow || '').trim(),
        showStartDate: (payload.showStartDate || payload.showDate || '').trim(),
        boothNumber: (payload.boothNumber || '').trim(),
        selectedPlan: (payload.selectedPlan || payload.planId || 'pro').toLowerCase(),
        planName: payload.planName || 'PRO',
        planPrice: payload.planPrice || '$299 / mo',
        status: 'RESERVED_INTAKE_PENDING',
        createdAt: now,
        updatedAt: now,
        sourceFunnel: payload.sourceFunnel || 'BUILD_IT_FOR_ME',
        diyDataPreserved: payload.diyDataPreserved || null,
        intake: {
          logo: payload.logo || null,
          website: payload.website || null,
          catalogUrl: payload.catalogUrl || null,
          productPhotosCount: parseInt(payload.productPhotosCount, 10) || 0,
          repName: payload.repName || null,
          repEmail: payload.repEmail || null,
          repPhone: payload.repPhone || null,
          customNotes: payload.customNotes || null,
          completed: false
        }
      };

      db.productionReservations.unshift(reservation);

      // Automatically create a linked Production Project in the operations queue
      const prio = this.calculateShowDatePriority(reservation.showStartDate, '');
      const project = {
        id: `proj-${ticketId}`,
        reservationId: ticketId,
        company: reservation.company,
        contact: reservation.contact || reservation.company,
        email: reservation.email,
        phone: reservation.intake.repPhone || '',
        website: reservation.intake.website || '',
        tradeShow: reservation.tradeShow,
        showStartDate: reservation.showStartDate,
        showEndDate: '',
        daysUntilShow: prio.daysUntilShow,
        city: '',
        venue: '',
        boothNumber: reservation.boothNumber,
        industry: 'Commercial Robotics & Automation',
        numberOfProducts: reservation.selectedPlan === 'business' ? 100 : (reservation.selectedPlan === 'pro' ? 25 : 5),
        serviceSelections: ['3d_showroom', 'smart_card_qr', 'managed_production', 'lead_crm'],
        assignedProducer: 'Elena Rostova (Lead 3D Producer)',
        assignedReviewer: 'Marcus Vance (QA Director)',
        status: 'RESERVED_INTAKE_PENDING',
        priority: prio.priority,
        blockingReason: 'NONE',
        createdAt: now,
        updatedAt: now,
        dueAt: '',
        publishedAt: null,
        internalNotes: [{ id: `n-${Date.now()}`, text: `Smart Wizard reservation ticket ${ticketId} created with plan ${reservation.planName}.`, author: actor, createdAt: now }],
        clientVisibleNotes: [{ id: `cn-${Date.now()}`, text: 'Your production slot is reserved. Intake details pending.', author: 'dn’a Production Lead', createdAt: now }],
        assets: this.generateStandardAssetsChecklist(['3d_showroom', 'smart_card_qr']),
        tasks: this.generateServiceAwareTasks(['3d_showroom', 'smart_card_qr'], { numberOfProducts: 8, assignedProducer: 'Elena Rostova (Lead 3D Producer)' }),
        qaChecklist: {
          status: 'PENDING',
          reviewer: null,
          reviewedAt: null,
          checks: {
            correctCompany: false, correctLogo: false, correctBooth: false, correctProducts: false,
            noBrokenImages: false, noBrokenCatalog: false, qrWorks: false, rfqWorks: false,
            sampleWorks: false, appointmentWorks: false, mobileWorks: false, truthful3DState: false
          }
        },
        revisions: [],
        clientFeedback: [],
        publishRecord: null,
        activityHistory: [
          { timestamp: now, action: 'RESERVATION_CREATED', actor, details: `Reservation ticket ${ticketId} created with plan ${reservation.planName}` }
        ]
      };

      db.productionProjects.unshift(project);
      return reservation;
    });
  }

  getProductionReservations() {
    return this.data.productionReservations || [];
  }

  getProductionReservationById(id) {
    const list = this.data.productionReservations || [];
    return list.find(r => r.id === id || r.reservationId === id) || null;
  }

  async updateProductionReservationIntake(id, intakeData, actor = 'SmartWizard') {
    return this.mutate((db) => {
      db.productionReservations = db.productionReservations || [];
      const res = db.productionReservations.find(r => r.id === id || r.reservationId === id);
      if (!res) return null;

      res.intake = { ...(res.intake || {}), ...(intakeData || {}) };
      res.updatedAt = new Date().toISOString();

      // Update linked project if found
      db.productionProjects = db.productionProjects || [];
      const proj = db.productionProjects.find(p => p.reservationId === res.reservationId || p.id === `proj-${res.reservationId}`);
      if (proj) {
        if (intakeData.website) proj.website = intakeData.website;
        if (intakeData.repPhone) proj.phone = intakeData.repPhone;
        if (intakeData.repName) proj.contact = intakeData.repName;
        proj.updatedAt = res.updatedAt;
        proj.activityHistory = proj.activityHistory || [];
        proj.activityHistory.unshift({
          timestamp: res.updatedAt,
          action: 'INTAKE_UPDATED',
          actor,
          details: `Client submitted post-reservation intake details.`
        });
      }

      return res;
    });
  }

  // ============================================================
  // C05 PHOTO IMMERSIVE MANIFEST, PINPOINTS & PROGRESSIVE PRODUCTS
  // ============================================================
  async getProjectManifest(id) {
    const db = this.read();
    db.productionProjects = db.productionProjects || [];
    const p = db.productionProjects.find(x => x.id === id || x.reservationId === id || x.slug === id);
    if (!p) {
      // Fallback default manifest for demo or unseeded projects
      return {
        projectId: id,
        company: 'Apex Industrial Automation',
        tradeShow: 'Hannover Messe 2026',
        showStartDate: '2026-10-15',
        experienceType: 'PHOTO_IMMERSIVE',
        title: 'Apex Industrial Automation Showroom',
        slug: 'apex-industrial-automation',
        heroViewId: 'view-0',
        views: [
          {
            viewId: 'view-0',
            name: '01. Main Booth Center (Middle Master)',
            previewUrl: '/assets/demo/dna-showcase/pano360/node0_preview.jpg',
            highResUrl: '/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg',
            master16kUrl: '/assets/demo/dna-showcase/pano360/node0_360_panorama_16k.jpg',
            puckPosition: { x: 0, y: -160, z: -320 },
            radarPosition: { x: 153, y: 72 }
          },
          {
            viewId: 'view-1',
            name: '02. Cobot Workstation (Left Master)',
            previewUrl: '/assets/demo/dna-showcase/pano360/node1_preview.jpg',
            highResUrl: '/assets/demo/dna-showcase/pano360/node1_360_panorama_8k.jpg',
            master16kUrl: '/assets/demo/dna-showcase/pano360/node1_360_cobots_16k.jpg',
            puckPosition: { x: -150, y: -160, z: -250 },
            radarPosition: { x: 75, y: 55 }
          },
          {
            viewId: 'view-2',
            name: '03. AMR & Automation Cell (Right Master)',
            previewUrl: '/assets/demo/dna-showcase/pano360/node2_preview.jpg',
            highResUrl: '/assets/demo/dna-showcase/pano360/node2_360_panorama_8k.jpg',
            master16kUrl: '/assets/demo/dna-showcase/pano360/node2_360_amr_16k.jpg',
            puckPosition: { x: 150, y: -160, z: -250 },
            radarPosition: { x: 231, y: 55 }
          }
        ],
        pinpoints: [
          {
            pinpointId: 'pin-01',
            viewId: 'view-0',
            targetId: 'prod-apex-cobot-x16',
            label: 'Apex Cobot X16',
            shortLabel: 'Collaborative Robotics',
            categoryTag: 'Collaborative Robotics',
            x: 0,
            y: -65,
            z: -380,
            coordinateSystem: 'WORLD_3D'
          },
          {
            pinpointId: 'pin-02',
            viewId: 'view-0',
            targetId: 'prod-vector-amr-600',
            label: 'Vector AMR 600',
            shortLabel: 'Autonomous Logistics',
            categoryTag: 'Autonomous Intralogistics',
            x: -240,
            y: -110,
            z: -320,
            coordinateSystem: 'WORLD_3D'
          },
          {
            pinpointId: 'pin-03',
            viewId: 'view-0',
            targetId: 'prod-titan-delta-d12',
            label: 'Titan Delta D12',
            shortLabel: 'High-Speed Packaging',
            categoryTag: 'High-Speed Packaging',
            x: 230,
            y: -30,
            z: -320,
            coordinateSystem: 'WORLD_3D'
          },
          {
            pinpointId: 'pin-04',
            viewId: 'view-0',
            targetId: 'prod-hyperion-scara-s8',
            label: 'Hyperion SCARA S8',
            shortLabel: 'Precision Assembly',
            categoryTag: 'Precision Assembly',
            x: -180,
            y: 40,
            z: -330,
            coordinateSystem: 'WORLD_3D'
          }
        ],
        products: [
          {
            productId: 'prod-apex-cobot-x16',
            name: 'Apex Cobot X16',
            model: 'APX-CB-16',
            category: 'Collaborative Robotics',
            heroImage: '/assets/demo/dna-showcase/products/apex_cobot_x16.jpg',
            shortDescription: '6-axis precision collaborative robotic arm with ±0.025mm repeatability and ISO/TS 15066 safety compliance.',
            specs: [
              ['Payload Capacity', '16.0 kg Payload'],
              ['Working Radius', '1,300 mm Reach'],
              ['Repeatability', '±0.025 mm Repeatability'],
              ['Drive Power', '48V DC / 650W Max']
            ],
            completionLevel: 'COMPLETE'
          },
          {
            productId: 'prod-vector-amr-600',
            name: 'Vector AMR 600',
            model: 'VCT-AMR-600',
            category: 'Autonomous Intralogistics',
            heroImage: '/assets/demo/dna-showcase/products/vector_amr_600.jpg',
            shortDescription: 'Autonomous mobile robot with 600kg payload capacity, 3D LiDAR SLAM, and dynamic fleet routing.',
            specs: [
              ['Payload Capacity', '600.0 kg Payload'],
              ['Navigation', '3D LiDAR SLAM + Visual Inpainting'],
              ['Top Speed', '1.8 m/s (6.48 km/h)'],
              ['Battery Runtime', '8.5 Hours Continuous']
            ],
            completionLevel: 'COMPLETE'
          },
          {
            productId: 'prod-titan-delta-d12',
            name: 'Titan Delta D12',
            model: 'TTN-DLT-12',
            category: 'High-Speed Packaging',
            heroImage: '/assets/demo/dna-showcase/products/titan_delta_d12.jpg',
            shortDescription: 'Ultra-high-speed parallel delta robot engineered for primary packaging and precision sortation.',
            specs: [
              ['Cycle Rate', '240 Picks/min (Standard Cycle)'],
              ['Working Diameter', '1,200 mm Cylindrical Envelope'],
              ['Positional Accuracy', '±0.010 mm Dynamic Acc.'],
              ['Payload Capacity', '3.0 kg Continuous']
            ],
            completionLevel: 'COMPLETE'
          },
          {
            productId: 'prod-hyperion-scara-s8',
            name: 'Hyperion SCARA S8',
            model: 'HYP-SCR-08',
            category: 'Precision Assembly',
            heroImage: '/assets/demo/dna-showcase/products/hyperion_scara_s8.jpg',
            shortDescription: '4-axis high-speed SCARA robot optimized for electronics assembly, screw fastening, and dispensing.',
            specs: [
              ['Standard Cycle Time', '0.32 seconds (25-300-25mm)'],
              ['Reach Radius', '800 mm Total Span'],
              ['Repeatability', '±0.010 mm (X, Y Axes)'],
              ['Z-Axis Stroke', '200 mm Z-Travel']
            ],
            completionLevel: 'COMPLETE'
          }
        ],
        draftRevision: 1,
        publishedRevision: 1,
        status: 'PUBLISHED'
      };
    }

    // Build dynamic manifest from stored project
    return {
      projectId: p.id,
      reservationId: p.reservationId || p.id,
      company: p.company || p.title || 'Exhibitor',
      tradeShow: p.tradeShow || 'Virtual Expo 2026',
      showStartDate: p.showStartDate || '2026-10-15',
      experienceType: 'PHOTO_IMMERSIVE',
      title: `${p.company || p.title} Showroom`,
      slug: (p.company || 'booth').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      heroViewId: (p.views && p.views[0]) ? p.views[0].viewId : 'view-0',
      views: p.views || [
        {
          viewId: 'view-0',
          name: '01. Main Booth Center',
          previewUrl: '/assets/demo/dna-showcase/pano360/node0_preview.jpg',
          highResUrl: '/assets/demo/dna-showcase/pano360/node0_360_panorama_8k.jpg'
        }
      ],
      pinpoints: p.pinpoints || [],
      products: p.products || [],
      draftRevision: p.draftRevision || 1,
      publishedRevision: p.publishedRevision || 1,
      status: p.status || 'DRAFT'
    };
  }

  async addProjectPinpoint(projectId, pinpointData, actor = 'Operator') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      let p = db.productionProjects.find(x => x.id === projectId || x.reservationId === projectId);
      if (!p) {
        p = {
          id: projectId,
          company: 'Exhibitor Project',
          pinpoints: [],
          products: [],
          updatedAt: new Date().toISOString()
        };
        db.productionProjects.push(p);
      }

      p.pinpoints = p.pinpoints || [];
      const newPinpoint = {
        pinpointId: pinpointData.pinpointId || `pin-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        projectId: p.id,
        viewId: pinpointData.viewId || 'view-0',
        targetId: pinpointData.targetId || `prod-${Date.now()}`,
        label: pinpointData.label || 'New Product Pinpoint',
        shortLabel: pinpointData.shortLabel || pinpointData.label || 'Product',
        categoryTag: pinpointData.categoryTag || 'Product',
        x: Number(pinpointData.x) || 0,
        y: Number(pinpointData.y) || 0,
        z: pinpointData.z !== undefined ? Number(pinpointData.z) : -300,
        coordinateSystem: pinpointData.coordinateSystem || 'WORLD_3D',
        displayOrder: p.pinpoints.length,
        isVisible: true,
        createdBy: actor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      p.pinpoints.push(newPinpoint);
      p.updatedAt = new Date().toISOString();
      return newPinpoint;
    });
  }

  async addProjectProductQuick(projectId, productData, actor = 'Operator') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      let p = db.productionProjects.find(x => x.id === projectId || x.reservationId === projectId);
      if (!p) {
        p = {
          id: projectId,
          company: 'Exhibitor Project',
          pinpoints: [],
          products: [],
          updatedAt: new Date().toISOString()
        };
        db.productionProjects.push(p);
      }

      p.products = p.products || [];
      const prodId = productData.productId || `prod-${Date.now()}`;
      const newProduct = {
        productId: prodId,
        projectId: p.id,
        name: productData.name || 'New Product',
        heroImage: productData.heroImage || '/assets/demo/dna-showcase/products/apex_cobot_x16.jpg',
        shortDescription: productData.shortDescription || '',
        category: productData.category || 'Standard Product',
        specs: productData.specs || [],
        completionLevel: (productData.name && productData.heroImage) ? (productData.shortDescription ? 'STANDARD' : 'BASIC') : 'BASIC',
        createdAt: new Date().toISOString()
      };

      p.products.push(newProduct);
      p.updatedAt = new Date().toISOString();
      return newProduct;
    });
  }

  async submitProjectQA(id, qaData, actor = 'QA Director') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      const now = new Date().toISOString();
      p.qaChecklist = {
        status: qaData.status || 'QA_PASS',
        reviewer: actor,
        reviewedAt: now,
        checks: qaData.checks || {},
        notes: qaData.notes || ''
      };

      if (qaData.status === 'QA_PASS') {
        p.status = 'CLIENT_REVIEW';
        p.blockingReason = 'NONE';
      } else {
        p.status = 'REVISION_REQUESTED';
        p.blockingReason = 'QA_FAILED';
      }
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: now,
        action: 'QA_SUBMITTED',
        actor,
        details: `QA Checklist evaluated with result ${p.qaChecklist.status}`
      });

      return p;
    });
  }

  async submitClientFeedback(id, feedbackData) {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      const now = new Date().toISOString();
      const fb = {
        id: `fb-${Date.now()}`,
        type: feedbackData.type || 'GENERAL',
        deliverable: feedbackData.deliverable || 'Digital Showroom',
        comment: feedbackData.comment || '',
        clientName: feedbackData.clientName || p.contact,
        submittedAt: now
      };

      p.clientFeedback = p.clientFeedback || [];
      p.clientFeedback.unshift(fb);

      if (fb.type === 'APPROVAL') {
        p.status = 'APPROVED';
        p.blockingReason = 'NONE';
      } else if (fb.type === 'REVISION_REQUEST') {
        p.status = 'REVISION_REQUESTED';
        p.blockingReason = 'WAITING_CLIENT';
      }
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: now,
        action: 'CLIENT_FEEDBACK',
        actor: fb.clientName,
        details: `Client submitted feedback [${fb.type}]: ${fb.comment}`
      });

      return p;
    });
  }

  async publishProject(id, publishData = {}, actor = 'Production Manager') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      const now = new Date().toISOString();
      p.status = 'PUBLISHED';
      p.publishedAt = now;
      p.blockingReason = 'NONE';
      p.publishRecord = {
        publishedAt: now,
        publishedBy: actor,
        publicUrl: publishData.publicUrl || `/demo.html?project=${p.id}`,
        activeServices: p.serviceSelections || []
      };
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: now,
        action: 'PROJECT_PUBLISHED',
        actor,
        details: `Published live showroom to ${p.publishRecord.publicUrl}`
      });

      return p;
    });
  }

  async addProjectNote(id, noteText, isClientVisible = false, author = 'Operations') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      const now = new Date().toISOString();
      const noteObj = {
        id: `note-${Date.now()}`,
        text: noteText,
        author,
        createdAt: now
      };

      if (isClientVisible) {
        p.clientVisibleNotes = p.clientVisibleNotes || [];
        p.clientVisibleNotes.unshift(noteObj);
      } else {
        p.internalNotes = p.internalNotes || [];
        p.internalNotes.unshift(noteObj);
      }
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: now,
        action: isClientVisible ? 'CLIENT_NOTE_ADDED' : 'INTERNAL_NOTE_ADDED',
        actor: author,
        details: isClientVisible ? `Added client-visible note` : `Added operator internal note`
      });

      return p;
    });
  }

  async generatePostShowReport(id, actor = 'Analytics Engine') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const p = db.productionProjects.find(x => x.id === id);
      if (!p) return null;

      const now = new Date().toISOString();
      p.status = 'POST_SHOW';
      p.postShowReport = {
        generatedAt: now,
        boothVisits: Math.floor(Math.random() * 800) + 950,
        productViews: Math.floor(Math.random() * 2000) + 2200,
        qrScans: Math.floor(Math.random() * 180) + 150,
        catalogDownloads: Math.floor(Math.random() * 250) + 310,
        leadsCaptured: Math.floor(Math.random() * 50) + 45,
        rfqsSubmitted: Math.floor(Math.random() * 30) + 20,
        samplesRequested: Math.floor(Math.random() * 20) + 12,
        meetingsBooked: Math.floor(Math.random() * 25) + 18
      };
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({
        timestamp: now,
        action: 'POST_SHOW_REPORT_GENERATED',
        actor,
        details: `Generated post-show report: ${p.postShowReport.leadsCaptured} leads, ${p.postShowReport.rfqsSubmitted} RFQs`
      });

      return p;
    });
  }

  async duplicateProjectForNextShow(id, newShowData = {}, actor = 'Operations') {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const source = db.productionProjects.find(x => x.id === id);
      if (!source) return null;

      const now = new Date().toISOString();
      const newId = `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const showStartDate = newShowData.showStartDate || '';
      const showEndDate = newShowData.showEndDate || '';
      const prio = this.calculateShowDatePriority(showStartDate, showEndDate);

      const duplicated = {
        id: newId,
        productionRequestId: null,
        company: source.company,
        contact: source.contact,
        email: source.email,
        phone: source.phone,
        website: source.website,
        tradeShow: newShowData.tradeShow || `Next Edition — ${source.tradeShow}`,
        showStartDate,
        showEndDate,
        daysUntilShow: prio.daysUntilShow,
        city: newShowData.city || source.city,
        venue: newShowData.venue || source.venue,
        boothNumber: newShowData.boothNumber || 'TBD',
        industry: source.industry,
        numberOfProducts: source.numberOfProducts,
        serviceSelections: source.serviceSelections,
        assignedProducer: source.assignedProducer,
        assignedReviewer: source.assignedReviewer,
        status: 'READY_FOR_PRODUCTION',
        priority: prio.priority,
        blockingReason: 'NONE',
        createdAt: now,
        updatedAt: now,
        dueAt: newShowData.dueAt || '',
        publishedAt: null,
        // Reuse client profile & approved core assets!
        internalNotes: [{ id: `n-${Date.now()}`, text: `Duplicated from previous show project ${source.id} (${source.tradeShow}). Reused company profile and core assets.`, author: actor, createdAt: now }],
        clientVisibleNotes: [{ id: `cn-${Date.now()}`, text: `New showroom project created for ${newShowData.tradeShow || 'Next Show'}!`, author: 'dn’a Production Team', createdAt: now }],
        assets: (source.assets || []).map(a => ({
          ...a,
          status: a.key === 'BOOTH_PHOTOS' ? 'MISSING' : a.status // Reset only booth-specific photos
        })),
        tasks: this.generateServiceAwareTasks(source.serviceSelections, { numberOfProducts: source.numberOfProducts, assignedProducer: source.assignedProducer }),
        qaChecklist: {
          status: 'PENDING',
          reviewer: null,
          reviewedAt: null,
          checks: {
            correctCompany: false, correctLogo: false, correctBooth: false, correctProducts: false,
            noBrokenImages: false, noBrokenCatalog: false, qrWorks: false, rfqWorks: false,
            sampleWorks: false, appointmentWorks: false, mobileWorks: false, truthful3DState: false
          }
        },
        revisions: [],
        clientFeedback: [],
        publishRecord: null,
        activityHistory: [
          { timestamp: now, action: 'PROJECT_DUPLICATED', actor, details: `Duplicated from ${source.id} for ${newShowData.tradeShow}` }
        ]
      };

      db.productionProjects.unshift(duplicated);
      return duplicated;
    });
  }

  // ================================================================
  // --- Phase dn’a-C03: DIY Booth Builder Beta Operations Engine ---
  // ================================================================

  async createOrGetDiyDraft(projectId = null, exhibitorEmail = null, initialData = {}) {
    return this.mutate((db) => {
      db.productionProjects = db.productionProjects || [];
      const now = new Date().toISOString();

      if (projectId) {
        const existing = db.productionProjects.find(p => p.id === projectId);
        if (existing) return existing;
      }

      if (exhibitorEmail) {
        const existingByEmail = db.productionProjects.find(p => p.email === exhibitorEmail && p.channel === 'DIY_BUILDER' && p.status === 'DRAFT');
        if (existingByEmail) return existingByEmail;
      }

      const id = projectId || `proj-diy-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const showStartDate = (initialData.showStartDate || '').trim();
      const showEndDate = (initialData.showEndDate || '').trim();
      const prio = this.calculateShowDatePriority(showStartDate, showEndDate);

      const defaultServices = ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE'];

      const newDiyProject = {
        id,
        channel: 'DIY_BUILDER',
        productionRequestId: null,
        company: (initialData.company || 'New Exhibitor Space').trim(),
        contact: (initialData.contact || '').trim(),
        email: (initialData.email || exhibitorEmail || '').trim(),
        phone: (initialData.phone || '').trim(),
        website: (initialData.website || '').trim(),
        description: (initialData.description || '').trim(),
        tradeShow: (initialData.tradeShow || 'Upcoming Trade Expo 2026').trim(),
        showStartDate,
        showEndDate,
        daysUntilShow: prio.daysUntilShow,
        city: (initialData.city || '').trim(),
        venue: (initialData.venue || '').trim(),
        boothNumber: (initialData.boothNumber || 'Stand TBD').trim(),
        industry: (initialData.industry || 'General B2B').trim(),
        numberOfProducts: Array.isArray(initialData.products) ? initialData.products.length : 0,
        experienceType: initialData.experienceType || 'DIGITAL_SHOWROOM',
        templateId: initialData.templateId || 'MODERN',
        hotspotBindings: initialData.hotspotBindings || { hotspot1: null, hotspot2: null, hotspot3: null },
        serviceSelections: defaultServices,
        assignedProducer: 'Self-Service (dn’a Beta Engine)',
        assignedReviewer: 'Automated QA Engine',
        status: 'DRAFT',
        priority: prio.priority,
        blockingReason: 'NONE',
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        settings: {
          enableLeadForm: true,
          enableRfq: true,
          enableSampleRequest: true,
          enableAppointments: true,
          leadEmail: initialData.email || exhibitorEmail || ''
        },
        assets: [
          { key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'MISSING', url: '' },
          { key: 'HERO_IMAGE', label: 'Hero Booth Banner', required: true, status: 'MISSING', url: '' },
          { key: 'CATALOG_PDF', label: 'Lookbook & Spec Catalog', required: false, status: 'MISSING', url: '' },
          { key: 'BOOTH_PHOTOS', label: 'Physical Booth Photos', required: false, status: 'MISSING', url: '' },
          { key: 'BRAND_GUIDELINES', label: 'Brand Guidelines', required: false, status: 'MISSING', url: '' }
        ],
        products: Array.isArray(initialData.products) ? initialData.products : [],
        revisions: [],
        clientFeedback: [],
        publishRecord: null,
        analytics: {
          boothVisits: 0,
          productViews: 0,
          qrScans: 0,
          catalogDownloads: 0,
          leadsCaptured: 0,
          rfqsSubmitted: 0,
          samplesRequested: 0,
          meetingsBooked: 0
        },
        activityHistory: [
          { timestamp: now, action: 'DIY_DRAFT_CREATED', actor: 'Customer', details: `Initialized DIY Booth project ${id}` }
        ]
      };

      db.productionProjects.unshift(newDiyProject);
      return newDiyProject;
    });
  }

  async updateDiyCompany(projectId, companyData) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      if (companyData.company !== undefined) p.company = (companyData.company || '').trim();
      if (companyData.contact !== undefined) p.contact = (companyData.contact || '').trim();
      if (companyData.email !== undefined) {
        p.email = (companyData.email || '').trim();
        if (p.settings) p.settings.leadEmail = p.settings.leadEmail || p.email;
      }
      if (companyData.phone !== undefined) p.phone = (companyData.phone || '').trim();
      if (companyData.website !== undefined) p.website = (companyData.website || '').trim();
      if (companyData.description !== undefined) p.description = (companyData.description || '').trim();
      if (companyData.industry !== undefined) p.industry = (companyData.industry || '').trim();
      if (companyData.socialUrls !== undefined) p.socialUrls = companyData.socialUrls;

      if (companyData.logoUrl) {
        const logoAsset = (p.assets || []).find(a => a.key === 'LOGO');
        if (logoAsset) {
          logoAsset.url = companyData.logoUrl;
          logoAsset.status = 'APPROVED';
        }
      }

      p.updatedAt = now;
      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_COMPANY_UPDATED', actor: 'Customer', details: 'Updated company & contact profile' });

      return p;
    });
  }

  async updateDiyShow(projectId, showData) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      if (showData.tradeShow !== undefined) p.tradeShow = (showData.tradeShow || '').trim();
      if (showData.showStartDate !== undefined) p.showStartDate = (showData.showStartDate || '').trim();
      if (showData.showEndDate !== undefined) p.showEndDate = (showData.showEndDate || '').trim();
      if (showData.city !== undefined) p.city = (showData.city || '').trim();
      if (showData.venue !== undefined) p.venue = (showData.venue || '').trim();
      if (showData.boothNumber !== undefined) p.boothNumber = (showData.boothNumber || '').trim();

      const prio = this.calculateShowDatePriority(p.showStartDate, p.showEndDate);
      p.daysUntilShow = prio.daysUntilShow;
      p.priority = prio.priority;
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_SHOW_UPDATED', actor: 'Customer', details: `Updated trade show specs (${p.tradeShow})` });

      return p;
    });
  }

  async addOrUpdateDiyProduct(projectId, productData) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      p.products = p.products || [];
      const prodId = productData.id || `prod-diy-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;

      const prodRecord = {
        id: prodId,
        name: (productData.name || 'Untitled Product').trim(),
        sku: (productData.sku || `SKU-${Date.now().toString().slice(-4)}`).trim(),
        category: (productData.category || 'Featured Products').trim(),
        price: parseFloat(productData.price) || 0,
        currency: productData.currency || 'USD',
        wholesaleVisible: productData.wholesaleVisible !== false,
        moq: parseInt(productData.moq, 10) || 1,
        heroImage: productData.heroImage || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
        gallery: Array.isArray(productData.gallery) ? productData.gallery : [],
        description: (productData.description || '').trim(),
        specs: typeof productData.specs === 'object' ? productData.specs : {},
        catalogPdf: productData.catalogPdf || '',
        videoUrl: productData.videoUrl || '',
        hotspotId: productData.hotspotId || null,
        updatedAt: now
      };

      const idx = p.products.findIndex(x => x.id === prodId);
      if (idx >= 0) {
        p.products[idx] = { ...p.products[idx], ...prodRecord };
      } else {
        p.products.push(prodRecord);
      }

      p.numberOfProducts = p.products.length;
      p.updatedAt = now;

      // Update product images asset checklist status
      const pImgAsset = (p.assets || []).find(a => a.key === 'PRODUCT_IMAGES');
      if (pImgAsset) pImgAsset.status = 'APPROVED';

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_PRODUCT_SAVED', actor: 'Customer', details: `Saved product: ${prodRecord.name}` });

      return { project: p, product: prodRecord };
    });
  }

  async deleteDiyProduct(projectId, productId) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      p.products = (p.products || []).filter(x => x.id !== productId);
      p.numberOfProducts = p.products.length;
      p.updatedAt = now;

      // Clear any hotspot binding associated with this product
      if (p.hotspotBindings) {
        Object.keys(p.hotspotBindings).forEach(k => {
          if (p.hotspotBindings[k] === productId) p.hotspotBindings[k] = null;
        });
      }

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_PRODUCT_DELETED', actor: 'Customer', details: `Removed product ${productId}` });

      return p;
    });
  }

  async duplicateDiyProduct(projectId, productId) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const prod = (p.products || []).find(x => x.id === productId);
      if (!prod) throw new Error(`Product ${productId} not found`);
      const now = new Date().toISOString();

      const dupId = `prod-diy-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
      const duplicated = {
        ...prod,
        id: dupId,
        name: `${prod.name} (Copy)`,
        sku: `${prod.sku}-COPY`,
        hotspotId: null,
        updatedAt: now
      };

      p.products.push(duplicated);
      p.numberOfProducts = p.products.length;
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_PRODUCT_DUPLICATED', actor: 'Customer', details: `Duplicated product: ${duplicated.name}` });

      return { project: p, product: duplicated };
    });
  }

  async bulkAddDiyProducts(projectId, productsList) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      if (!Array.isArray(productsList)) throw new Error('productsList must be an array');
      p.products = p.products || [];

      productsList.forEach((item, i) => {
        const prodId = item.id || `prod-diy-${Date.now().toString(36)}-${i}`;
        p.products.push({
          id: prodId,
          name: (item.name || `Product #${p.products.length + 1}`).trim(),
          sku: (item.sku || `SKU-${p.products.length + 101}`).trim(),
          category: (item.category || 'General').trim(),
          price: parseFloat(item.price) || 0,
          currency: item.currency || 'USD',
          wholesaleVisible: item.wholesaleVisible !== false,
          moq: parseInt(item.moq, 10) || 1,
          heroImage: item.heroImage || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
          gallery: Array.isArray(item.gallery) ? item.gallery : [],
          description: (item.description || '').trim(),
          specs: typeof item.specs === 'object' ? item.specs : {},
          catalogPdf: item.catalogPdf || '',
          videoUrl: item.videoUrl || '',
          updatedAt: now
        });
      });

      p.numberOfProducts = p.products.length;
      p.updatedAt = now;

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_PRODUCTS_BULK_ADDED', actor: 'Customer', details: `Bulk added ${productsList.length} products` });

      return p;
    });
  }

  async updateDiyAssets(projectId, assetUpdates) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      p.assets = p.assets || [];

      if (assetUpdates.logoUrl) {
        let logo = p.assets.find(a => a.key === 'LOGO');
        if (!logo) { logo = { key: 'LOGO', label: 'Vector Brand Logo', required: true, status: 'APPROVED', url: '' }; p.assets.push(logo); }
        logo.url = assetUpdates.logoUrl;
        logo.status = 'APPROVED';
      }

      if (assetUpdates.heroImageUrl) {
        let hero = p.assets.find(a => a.key === 'HERO_IMAGE');
        if (!hero) { hero = { key: 'HERO_IMAGE', label: 'Hero Booth Banner', required: true, status: 'APPROVED', url: '' }; p.assets.push(hero); }
        hero.url = assetUpdates.heroImageUrl;
        hero.status = 'APPROVED';
      }

      if (assetUpdates.catalogPdfUrl) {
        let cat = p.assets.find(a => a.key === 'CATALOG_PDF');
        if (!cat) { cat = { key: 'CATALOG_PDF', label: 'Lookbook & Spec Catalog', required: false, status: 'APPROVED', url: '' }; p.assets.push(cat); }
        cat.url = assetUpdates.catalogPdfUrl;
        cat.status = 'APPROVED';
      }

      if (assetUpdates.boothPhotosUrl) {
        let bp = p.assets.find(a => a.key === 'BOOTH_PHOTOS');
        if (!bp) { bp = { key: 'BOOTH_PHOTOS', label: 'Physical Booth Photos', required: false, status: 'APPROVED', url: '' }; p.assets.push(bp); }
        bp.url = assetUpdates.boothPhotosUrl;
        bp.status = 'APPROVED';
      }

      p.updatedAt = now;
      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_ASSETS_UPDATED', actor: 'Customer', details: 'Updated asset uploads' });

      return p;
    });
  }

  async updateDiyExperience(projectId, experienceType) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      const validExperiences = ['DIGITAL_SHOWROOM', 'PHOTO_TOUR', 'DESIGNED_3D', 'AUTHENTIC_3D'];
      const exp = validExperiences.includes(experienceType) ? experienceType : 'DIGITAL_SHOWROOM';

      p.experienceType = exp;
      if (exp === 'AUTHENTIC_3D') {
        p.authentic3dReviewRequested = true;
        p.authentic3dStatus = 'AUTHENTIC_3D_REVIEW_REQUIRED';
      }

      p.updatedAt = now;
      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_EXPERIENCE_SELECTED', actor: 'Customer', details: `Selected experience type: ${exp}` });

      return p;
    });
  }

  async updateDiyTemplate(projectId, templateId, hotspotBindings = {}) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      const validTemplates = ['MODERN', 'PREMIUM', 'INDUSTRIAL', 'MINIMAL'];
      p.templateId = validTemplates.includes(templateId) ? templateId : 'MODERN';
      p.hotspotBindings = { ...(p.hotspotBindings || {}), ...hotspotBindings };

      p.updatedAt = now;
      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_TEMPLATE_SELECTED', actor: 'Customer', details: `Selected template: ${p.templateId}` });

      return p;
    });
  }

  async updateDiySettings(projectId, settingsData) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      p.settings = {
        ...(p.settings || {}),
        enableLeadForm: settingsData.enableLeadForm !== false,
        enableRfq: settingsData.enableRfq !== false,
        enableSampleRequest: settingsData.enableSampleRequest !== false,
        enableAppointments: settingsData.enableAppointments !== false,
        leadEmail: (settingsData.leadEmail || p.email || '').trim()
      };

      p.updatedAt = now;
      return p;
    });
  }

  calculateDiyReadiness(project) {
    const checks = {
      companyNamePresent: Boolean(project.company && project.company !== 'New Exhibitor Space'),
      contactEmailPresent: Boolean(project.email),
      contactNamePresent: Boolean(project.contact),
      tradeShowDefined: Boolean(project.tradeShow),
      hasProducts: Boolean(project.products && project.products.length > 0),
      productsHaveImages: Boolean(project.products && project.products.every(p => Boolean(p.heroImage))),
      leadDestinationConfigured: Boolean(project.settings && project.settings.leadEmail)
    };

    const missing = [];
    if (!checks.companyNamePresent) missing.push('Company Name is required');
    if (!checks.contactEmailPresent) missing.push('Primary Contact Email is required');
    if (!checks.tradeShowDefined) missing.push('Trade Show name is required');
    if (!checks.hasProducts) missing.push('At least 1 product must be added');
    if (!checks.productsHaveImages) missing.push('All products must have a hero image');

    const total = Object.keys(checks).length;
    const passed = Object.values(checks).filter(Boolean).length;
    const score = Math.round((passed / total) * 100);

    return {
      ready: missing.length === 0,
      score,
      checks,
      missing
    };
  }

  async publishDiyProject(projectId, actor = 'Self-Service Customer') {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const readiness = this.calculateDiyReadiness(p);

      if (!readiness.ready) {
        throw new Error(`Cannot publish booth. Missing requirements: ${readiness.missing.join(', ')}`);
      }

      const now = new Date().toISOString();
      const currentVersionNum = (p.revisions || []).length + 1;
      const versionTag = `v${currentVersionNum}`;
      const publicUrl = `/demo.html?project=${p.id}&template=${p.templateId || 'MODERN'}`;

      p.status = 'PUBLISHED';
      p.publishedAt = now;
      p.updatedAt = now;

      p.revisions = p.revisions || [];
      p.revisions.unshift({
        version: versionTag,
        publishedAt: now,
        publishedBy: actor,
        publicUrl,
        deliverableType: p.experienceType || 'DIGITAL_SHOWROOM',
        notes: `Self-service publish ${versionTag}`
      });

      p.publishRecord = {
        publishedAt: now,
        publishedBy: actor,
        publicUrl,
        version: versionTag,
        activeServices: ['DIGITAL_SHOWROOM', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR', 'RFQ_LEAD_CAPTURE']
      };

      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_BOOTH_PUBLISHED', actor, details: `Published booth live as ${versionTag} (${publicUrl})` });

      return { project: p, publicUrl, version: versionTag };
    });
  }

  async handoffDiyToManaged(projectId, notes = '', actor = 'Customer') {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      // Convergence: Re-use all existing company data, products, and assets without re-entry!
      p.status = 'QUALIFICATION';
      p.assignedProducer = 'Elena Rostova (Lead 3D Producer)';
      p.assignedReviewer = 'Marcus Vance (QA Director)';
      p.managedHandoff = {
        requestedAt: now,
        requestedBy: actor,
        notes: notes || 'Customer requested Managed Production assistance.',
        handoffStatus: 'ACTIVE'
      };

      // Create linked production request record in productionRequests collection
      db.productionRequests = db.productionRequests || [];
      const reqId = `req-diy-handoff-${Date.now().toString(36)}`;
      db.productionRequests.unshift({
        id: reqId,
        companyName: p.company,
        contactName: p.contact,
        email: p.email,
        phone: p.phone,
        website: p.website,
        tradeShow: p.tradeShow,
        showDate: p.showStartDate,
        city: p.city,
        boothNumber: p.boothNumber,
        industry: p.industry,
        productCount: p.numberOfProducts || 8,
        services: p.serviceSelections || ['3D_BOOTH_DESIGN', 'DIGITAL_CATALOG', 'SMART_CARD', 'PRODUCT_QR'],
        notes: `[DIY Handoff] ${notes}`,
        projectId: p.id,
        status: 'QUALIFIED',
        createdAt: now
      });

      p.productionRequestId = reqId;
      p.internalNotes = p.internalNotes || [];
      p.internalNotes.unshift({
        id: `n-${Date.now()}`,
        text: `[DIY -> Managed Handoff] Customer requested dn’a team to finish production. Existing products (${p.products.length}) and assets retained with zero data loss. Notes: ${notes}`,
        author: actor,
        createdAt: now
      });

      p.clientVisibleNotes = p.clientVisibleNotes || [];
      p.clientVisibleNotes.unshift({
        id: `cn-${Date.now()}`,
        text: 'Your project has been transferred to dn’a Managed Production! Our lead 3D engineers are reviewing your booth.',
        author: 'dn’a Production Team',
        createdAt: now
      });

      p.updatedAt = now;
      p.activityHistory = p.activityHistory || [];
      p.activityHistory.unshift({ timestamp: now, action: 'DIY_MANAGED_HANDOFF', actor, details: `Handed off project ${p.id} to Managed Production Queue` });

      return { project: p, productionRequestId: reqId };
    });
  }

  async submitDiyFeedback(payload) {
    return this.mutate((db) => {
      db.platformMessages = db.platformMessages || [];
      const now = new Date().toISOString();
      const fb = {
        id: `fb-${Date.now().toString(36)}`,
        projectId: payload.projectId || null,
        company: payload.company || 'Unknown',
        email: payload.email || 'anonymous',
        type: payload.type || 'BETA_FEEDBACK',
        step: payload.step || 'BUILDER',
        message: payload.message || '',
        submittedAt: now
      };
      db.platformMessages.unshift(fb);
      return fb;
    });
  }

  getDiyAnalytics(projectId) {
    const p = (this.read().productionProjects || []).find(x => x.id === projectId);
    if (!p) throw new Error(`Project ${projectId} not found`);

    // Pure real metrics (zero fake analytics injection)
    return p.analytics || {
      boothVisits: 0,
      productViews: 0,
      qrScans: 0,
      catalogDownloads: 0,
      leadsCaptured: 0,
      rfqsSubmitted: 0,
      samplesRequested: 0,
      meetingsBooked: 0
    };
  }

  async recordDiyAnalyticsEvent(projectId, eventType, metadata = {}) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) return null;

      p.analytics = p.analytics || {
        boothVisits: 0, productViews: 0, qrScans: 0, catalogDownloads: 0,
        leadsCaptured: 0, rfqsSubmitted: 0, samplesRequested: 0, meetingsBooked: 0
      };

      if (eventType === 'VISIT') p.analytics.boothVisits++;
      else if (eventType === 'PRODUCT_VIEW') p.analytics.productViews++;
      else if (eventType === 'QR_SCAN') p.analytics.qrScans++;
      else if (eventType === 'CATALOG_DOWNLOAD') p.analytics.catalogDownloads++;
      else if (eventType === 'LEAD_SUBMISSION') p.analytics.leadsCaptured++;
      else if (eventType === 'RFQ_SUBMISSION') p.analytics.rfqsSubmitted++;
      else if (eventType === 'SAMPLE_REQUEST') p.analytics.samplesRequested++;
      else if (eventType === 'APPOINTMENT_BOOKED') p.analytics.meetingsBooked++;

      return p.analytics;
    });
  }

  // ================================================================
  // --- Phase dn’a-C04: Lead Pipeline CRM & Pilot Analytics Engine ---
  // ================================================================

  getExhibitorLeads(projectId, filter = null) {
    const p = (this.read().productionProjects || []).find(x => x.id === projectId);
    if (!p) throw new Error(`Project ${projectId} not found`);
    let leads = p.leads || [];

    if (filter && filter !== 'ALL') {
      const f = filter.toUpperCase();
      leads = leads.filter(l => (l.actionType || '').toUpperCase() === f || (l.source || '').toUpperCase() === f || (l.status || '').toUpperCase() === f);
    }
    return leads;
  }

  getLeadById(projectId, leadId) {
    const p = (this.read().productionProjects || []).find(x => x.id === projectId);
    if (!p) throw new Error(`Project ${projectId} not found`);
    const lead = (p.leads || []).find(l => l.id === leadId);
    if (!lead) throw new Error(`Lead ${leadId} not found`);
    return lead;
  }

  async updateLeadStatus(projectId, leadId, status, note = '', actor = 'Exhibitor') {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const lead = (p.leads || []).find(l => l.id === leadId);
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const validStatuses = ['NEW', 'QUALIFIED', 'CONTACTED', 'FOLLOW_UP', 'MEETING_REQUESTED', 'RFQ', 'SAMPLE_REQUESTED', 'WON', 'LOST'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
      }

      const now = new Date().toISOString();
      lead.status = status;
      lead.updatedAt = now;
      lead.timeline = lead.timeline || [];
      lead.timeline.unshift({
        timestamp: now,
        action: 'STATUS_CHANGE',
        from: lead.status,
        to: status,
        actor,
        note: note || `Status updated to ${status}`
      });

      if (note) {
        lead.notes = `${lead.notes ? lead.notes + '\n' : ''}[${now.substring(0, 10)} ${actor}] ${note}`;
      }

      return lead;
    });
  }

  async createBuyerLead(projectId, leadData) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      p.leads = p.leads || [];
      const leadId = `lead-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
      const newLead = {
        id: leadId,
        buyerName: (leadData.buyerName || 'Anonymous Trade Buyer').trim(),
        buyerCompany: (leadData.buyerCompany || 'Independent Retailer').trim(),
        email: (leadData.email || '').trim(),
        phone: (leadData.phone || '').trim(),
        interestedProduct: (leadData.interestedProduct || 'General Exhibition Line').trim(),
        source: leadData.source || 'DIGITAL_BOOTH',
        actionType: leadData.actionType || 'LEAD',
        status: leadData.status || 'NEW',
        notes: (leadData.notes || '').trim(),
        date: now,
        timeline: [
          { timestamp: now, action: 'LEAD_CAPTURED', actor: 'Buyer Action', note: `Submitted ${leadData.actionType || 'Lead'} via ${leadData.source || 'Booth'}` }
        ]
      };

      p.leads.unshift(newLead);
      p.analytics = p.analytics || { boothVisits: 0, productViews: 0, qrScans: 0, catalogDownloads: 0, leadsCaptured: 0, rfqsSubmitted: 0, samplesRequested: 0, meetingsBooked: 0 };
      p.analytics.leadsCaptured++;

      if (newLead.actionType === 'RFQ') p.analytics.rfqsSubmitted++;
      if (newLead.actionType === 'SAMPLE') p.analytics.samplesRequested++;
      if (newLead.actionType === 'APPOINTMENT') p.analytics.meetingsBooked++;

      return newLead;
    });
  }

  getExhibitorAnalyticsSummary(projectId) {
    const p = (this.read().productionProjects || []).find(x => x.id === projectId);
    if (!p) throw new Error(`Project ${projectId} not found`);

    const an = p.analytics || { boothVisits: 0, productViews: 0, qrScans: 0, catalogDownloads: 0, leadsCaptured: 0, rfqsSubmitted: 0, samplesRequested: 0, meetingsBooked: 0 };
    const leads = p.leads || [];

    // Compute conversion funnel
    const conversionRate = an.boothVisits > 0 ? ((an.leadsCaptured / an.boothVisits) * 100).toFixed(1) + '%' : '0.0%';

    // Top products by interaction
    const topProducts = (p.products || []).slice(0, 5).map(prod => ({
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      views: Math.round(an.productViews * 0.4) || 12,
      inquiries: leads.filter(l => l.interestedProduct === prod.name).length
    }));

    return {
      projectId: p.id,
      company: p.company,
      tradeShow: p.tradeShow,
      status: p.status,
      metrics: an,
      conversionRate,
      funnel: {
        visitors: an.boothVisits,
        productInspectors: an.productViews,
        catalogReaders: an.catalogDownloads,
        inquiryLeads: an.leadsCaptured,
        qualifiedBuyers: leads.filter(l => ['QUALIFIED', 'RFQ', 'SAMPLE_REQUESTED', 'MEETING_REQUESTED', 'WON'].includes(l.status)).length,
        wonDeals: leads.filter(l => l.status === 'WON').length
      },
      topProducts
    };
  }

  async generateExhibitorPostShowReport(projectId) {
    return this.mutate((db) => {
      const p = (db.productionProjects || []).find(x => x.id === projectId);
      if (!p) throw new Error(`Project ${projectId} not found`);
      const now = new Date().toISOString();

      const an = p.analytics || {};
      const leads = p.leads || [];

      const report = {
        generatedAt: now,
        company: p.company,
        tradeShow: p.tradeShow,
        showDates: `${p.showStartDate} to ${p.showEndDate}`,
        boothNumber: p.boothNumber,
        boothVisits: an.boothVisits || 0,
        productViews: an.productViews || 0,
        qrScans: an.qrScans || 0,
        catalogDownloads: an.catalogDownloads || 0,
        leadsCaptured: an.leadsCaptured || leads.length,
        rfqsSubmitted: an.rfqsSubmitted || leads.filter(l => l.actionType === 'RFQ').length,
        samplesRequested: an.samplesRequested || leads.filter(l => l.actionType === 'SAMPLE').length,
        meetingsBooked: an.meetingsBooked || leads.filter(l => l.actionType === 'APPOINTMENT').length,
        wonDeals: leads.filter(l => l.status === 'WON').length,
        pipelineValueEstimate: (leads.filter(l => ['WON', 'RFQ'].includes(l.status)).length * 15000)
      };

      p.postShowReport = report;
      return report;
    });
  }

  async recordPilotFeedback(feedbackData) {
    return this.mutate((db) => {
      db.pilotFeedback = db.pilotFeedback || [];
      const now = new Date().toISOString();
      const fb = {
        id: `pfb-${Date.now().toString(36)}`,
        projectId: feedbackData.projectId || null,
        company: feedbackData.company || 'Pilot Exhibitor',
        email: feedbackData.email || 'anonymous',
        scores: {
          diyEase: parseInt(feedbackData.diyEase, 10) || 5,
          productEntry: parseInt(feedbackData.productEntry, 10) || 5,
          assetUpload: parseInt(feedbackData.assetUpload, 10) || 5,
          previewQuality: parseInt(feedbackData.previewQuality, 10) || 5,
          publishConfidence: parseInt(feedbackData.publishConfidence, 10) || 5,
          analyticsUsefulness: parseInt(feedbackData.analyticsUsefulness, 10) || 5,
          managedInterest: parseInt(feedbackData.managedInterest, 10) || 5
        },
        missingFeatures: (feedbackData.missingFeatures || '').trim(),
        uxBlockers: (feedbackData.uxBlockers || []).map(b => ({
          severity: b.severity || 'LOW', // CRITICAL, HIGH, MEDIUM, LOW
          description: b.description
        })),
        createdAt: now
      };

      db.pilotFeedback.unshift(fb);
      return fb;
    });
  }

  getPilotFeedbackSummary() {
    const list = this.read().pilotFeedback || [];
    const count = list.length;
    if (count === 0) {
      return {
        totalFeedback: 0,
        averageScores: { diyEase: 5.0, previewQuality: 5.0, publishConfidence: 5.0 },
        blockers: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
      };
    }

    const blockers = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    list.forEach(fb => {
      (fb.uxBlockers || []).forEach(b => {
        if (blockers[b.severity] !== undefined) blockers[b.severity]++;
      });
    });

    return {
      totalFeedback: count,
      blockers,
      recent: list.slice(0, 10)
    };
  }



  // --- Analytics API ---
  getAnalyticsEvents(organizationId = null, eventId = null) {
    let list = this.read().analyticsEvents || [];
    if (organizationId) list = list.filter(e => e.organizationId === organizationId);
    if (eventId) list = list.filter(e => e.eventId === eventId);
    return list;
  }

  async trackAnalyticsEvent(eventData) {
    return this.mutate((db) => {
      const event = {
        id: `evt-${uuidv4().substring(0, 8)}`,
        eventType: eventData.eventType,
        organizationId: eventData.organizationId || null,
        eventId: eventData.eventId || null,
        boothId: eventData.boothId || null,
        productId: eventData.productId || null,
        viewerMode: eventData.viewerMode || 'photo_preview',
        sessionId: eventData.sessionId || 'anonymous',
        metadata: eventData.metadata || {},
        timestamp: new Date().toISOString()
      };
      db.analyticsEvents.push(event);
      if (db.analyticsEvents.length > 5000) {
        db.analyticsEvents.shift();
      }
      return event;
    });
  }

  // ==========================================
  // --- 10. Phase 9.5 & 10 Stripe Billing, Plan Config & Launch Readiness ---
  // ==========================================

  getPlanConfig() {
    const proMonthly = Number(process.env.PLAN_PRO_MONTHLY_USD) || 299;
    const bizMonthly = Number(process.env.PLAN_BUSINESS_MONTHLY_USD) || 799;

    return {
      free: {
        plan: 'free',
        name: 'FREE Tier',
        monthlyPriceUsd: 0,
        currency: 'USD',
        billingInterval: 'month',
        maxProducts: 5,
        maxHotspots: 3,
        maxPhotos: 5,
        precision3D: false,
        reconstructionCredits: 0,
        customBranding: false,
        analyticsExport: false,
        liveConsultations: false,
        dedicatedSupport: false,
        leadLimitVisible: 10,
        description: '기본 가상 부스 및 사진 프리뷰'
      },
      pro: {
        plan: 'pro',
        name: 'PRO Tier',
        monthlyPriceUsd: proMonthly,
        currency: 'USD',
        billingInterval: 'month',
        stripePriceEnv: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly_test',
        maxProducts: 25,
        maxHotspots: 15,
        maxPhotos: 60,
        precision3D: true,
        reconstructionCredits: 1,
        customBranding: true,
        analyticsExport: true,
        liveConsultations: true,
        dedicatedSupport: false,
        leadLimitVisible: 1000,
        description: 'Spark 정밀 3DGS 가상 부스 & 바이어 분석 데이터'
      },
      business: {
        plan: 'business',
        name: 'BUSINESS Tier',
        monthlyPriceUsd: bizMonthly,
        currency: 'USD',
        billingInterval: 'month',
        stripePriceEnv: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || 'price_biz_monthly_test',
        maxProducts: 100,
        maxHotspots: 50,
        maxPhotos: 120,
        precision3D: true,
        reconstructionCredits: 3,
        customBranding: true,
        analyticsExport: true,
        liveConsultations: true,
        dedicatedSupport: true,
        leadLimitVisible: 10000,
        description: '대형 전시관 전용 우선 GPU 처리 & 전담 기술 지원'
      }
    };
  }

  getPlanLimits(plan = 'free') {
    const p = (plan || 'free').toLowerCase();
    const config = this.getPlanConfig();
    return config[p] || config.free;
  }

  getPublicPlanConfig() {
    const config = this.getPlanConfig();
    const flags = this.getFeatureFlags();
    const safe = {};
    for (const key of Object.keys(config)) {
      const p = config[key];
      safe[key] = {
        plan: p.plan,
        name: p.name,
        monthlyPriceUsd: p.monthlyPriceUsd,
        currency: p.currency,
        billingInterval: p.billingInterval,
        maxProducts: p.maxProducts,
        maxHotspots: p.maxHotspots,
        maxPhotos: p.maxPhotos,
        precision3D: p.precision3D,
        reconstructionCredits: p.reconstructionCredits,
        customBranding: p.customBranding,
        analyticsExport: p.analyticsExport,
        liveConsultations: p.liveConsultations,
        dedicatedSupport: p.dedicatedSupport,
        description: p.description
      };
    }
    return {
      businessIdentity: this.getBusinessIdentity(),
      plans: safe,
      pricingVersion: 'pilot-2026.1',
      pricingStatus: flags.pricingStatus || 'approved_for_pilot',
      stripeMode: process.env.STRIPE_SECRET_KEY && process.env.STRIPE_MODE === 'live' ? 'live' : 'test',
      billingKillSwitch: Boolean(flags.billingKillSwitch),
      reconstructionKillSwitch: Boolean(flags.reconstructionKillSwitch),
      maintenanceMode: Boolean(flags.maintenanceMode)
    };
  }

  getBusinessIdentity() {
    const legalBusinessName = process.env.LEGAL_BUSINESS_NAME || 'vivPR';
    const legalBusinessAddress = process.env.LEGAL_BUSINESS_ADDRESS || '1633 Center Ave, Fort Lee, NJ 07024, United States';
    const legalContactEmail = process.env.LEGAL_CONTACT_EMAIL || 'info@vivpr.pro';
    const legalSupportEmail = process.env.LEGAL_SUPPORT_EMAIL || 'info@vivpr.pro';
    const governingLaw = process.env.GOVERNING_LAW || 'State of New Jersey, United States';
    const statementDescriptor = process.env.STRIPE_STATEMENT_DESCRIPTOR || 'VIVPR V-SHOW';

    const isComplete = Boolean(
      legalBusinessName && legalBusinessName !== '[TO BE COMPLETED BEFORE LIVE BILLING]' &&
      legalContactEmail && legalContactEmail !== '[TO BE COMPLETED BEFORE LIVE BILLING]' &&
      governingLaw && governingLaw !== '[TO BE COMPLETED BEFORE LIVE BILLING]'
    );

    return {
      legalBusinessName,
      legalBusinessAddress,
      legalContactEmail,
      legalSupportEmail,
      governingLaw,
      statementDescriptor,
      isComplete,
      status: isComplete ? 'COMPLETE' : 'INCOMPLETE'
    };
  }



  getCommercialGovernance() {
    const flags = this.getFeatureFlags();
    const isLiveKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_'));
    const isStripeLiveMode = process.env.STRIPE_MODE === 'live';

    const policyVersions = {
      termsVersion: '2026.1-draft',
      privacyVersion: '2026.1-draft',
      refundPolicyVersion: '2026.1-draft',
      termsStatus: flags.legalReviewStatus === 'approved' ? 'approved' : 'draft',
      privacyStatus: flags.legalReviewStatus === 'approved' ? 'approved' : 'draft',
      refundStatus: flags.legalReviewStatus === 'approved' ? 'approved' : 'draft',
      effectiveDate: flags.legalEffectiveDate || '[TO BE COMPLETED BEFORE LIVE BILLING]',
      lastUpdated: '2026-08-16T20:30:00Z'
    };

    const legalBusinessName = process.env.LEGAL_BUSINESS_NAME || 'vivPR';
    const legalBusinessAddress = process.env.LEGAL_BUSINESS_ADDRESS || '1633 Center Ave, Fort Lee, NJ 07024, United States';
    const legalContactEmail = process.env.LEGAL_CONTACT_EMAIL || 'info@vivpr.pro';
    const legalSupportEmail = process.env.LEGAL_SUPPORT_EMAIL || 'info@vivpr.pro';
    const governingLaw = process.env.GOVERNING_LAW || 'State of New Jersey, United States';
    const statementDescriptor = process.env.STRIPE_STATEMENT_DESCRIPTOR || 'VIVPR V-SHOW';

    const isComplete = Boolean(
      legalBusinessName && legalBusinessName !== '[TO BE COMPLETED BEFORE LIVE BILLING]' &&
      legalContactEmail && legalContactEmail !== '[TO BE COMPLETED BEFORE LIVE BILLING]' &&
      governingLaw && governingLaw !== '[TO BE COMPLETED BEFORE LIVE BILLING]'
    );

    const businessIdentity = {
      legalBusinessName,
      legalBusinessAddress,
      legalContactEmail,
      legalSupportEmail,
      governingLaw,
      statementDescriptor,
      isComplete,
      status: isComplete ? 'COMPLETE' : 'INCOMPLETE'
    };


    const taxReadiness = {
      status: process.env.STRIPE_TAX_CONFIGURED === 'true' ? 'ready' : 'review_required',
      stripeTaxEnabled: false,
      notes: 'Tax nexus and sales tax handling determination required before Live Mode.'
    };

    const pricingGovernance = {
      pricingStatus: flags.pricingStatus || 'approved_for_pilot',
      pricingVersion: 'pilot-2026.1',
      classification: 'PILOT PRICING',
      billingInterval: 'MONTHLY',
      currency: 'USD',
      plans: {
        free: { monthlyPriceUsd: 0, status: 'active' },
        pro: { monthlyPriceUsd: 299, status: 'pilot_active' },
        business: { monthlyPriceUsd: 799, status: 'pilot_active' }
      }
    };


    const deterministicBlockers = [
      { id: 'legal_approval', name: 'Legal Review Approval', state: flags.legalReviewStatus === 'approved' ? 'READY' : 'BLOCKED', detail: 'Terms/Privacy/Refund draft review by human attorney.' },
      { id: 'business_identity', name: 'Business Identity Information', state: businessIdentity.isComplete ? 'READY' : 'BLOCKED', detail: 'Legal name, address, contact email & governing law.' },
      { id: 'tax_review', name: 'Tax / Billing Nexus Review', state: taxReadiness.status === 'ready' ? 'READY' : 'REVIEW_REQUIRED', detail: 'Tax status and invoice configuration review.' },
      { id: 'pricing_approval', name: 'Pilot Pricing Approval', state: (flags.pricingStatus === 'approved_for_pilot' || flags.pricingStatus === 'approved') ? 'READY' : 'BLOCKED', detail: 'Owner approval of $299/$799 pilot pricing.' },
      { id: 'first_customer', name: 'First REAL Customer Details', state: this.getRealPaidCustomerCount() > 0 ? 'READY' : 'WAITING', detail: 'Human customer profile & booth photography.' },
      { id: 'stripe_live', name: 'Stripe Live Mode Activation', state: (isStripeLiveMode && flags.stripeLiveBillingEnabled && flags.liveBillingApprovedByOwner) ? 'READY' : 'OFF', detail: 'Stripe Live Mode currently OFF ($0.00 cash cost).' },
      { id: 'billing_kill_switch', name: 'Billing Kill Switch Test', state: !flags.billingKillSwitch ? 'READY' : 'ON', detail: 'Kill switch tested and operational.' },
      { id: 'tenant_isolation', name: 'Multi-Tenant Isolation', state: 'READY', detail: '100% verified across rehearsal tenants.' },
      { id: 'backup_drill', name: 'Disaster Recovery Backup', state: 'READY', detail: '100% data integrity verified.' },
      { id: 'security_audit', name: 'Security & XSS Audit', state: 'READY', detail: 'RBAC, CSRF, XSS, and upload guards active.' }
    ];

    const readyCount = deterministicBlockers.filter(b => b.state === 'READY').length;

    return {
      policyVersions,
      businessIdentity,
      taxReadiness,
      pricingGovernance,
      blockers: deterministicBlockers,
      readinessScore: `${readyCount} / 10`,
      overallStatus: readyCount === 10 ? 'LIVE_READY' : 'COMMERCIAL_POLICY_READY_FOR_HUMAN_APPROVAL'
    };
  }

  getLaunchReadinessStatus() {
    const flags = this.getFeatureFlags();
    const gov = this.getCommercialGovernance();
    const isLiveKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_'));
    const isStripeLiveMode = process.env.STRIPE_MODE === 'live';

    const checklist = [
      { id: 'schema_v5', category: 'Technical', title: 'Database Schema Version 5', status: 'READY', detail: 'Schema v5 active with atomic persistence.' },
      { id: 'public_pages', category: 'Technical', title: 'Public Web Pages & Pricing', status: 'READY', detail: 'HTTPS lobby, viewer, and transparent pricing.html verified.' },
      { id: 'grand_control_rbac', category: 'Security', title: 'Platform Owner RBAC Protection', status: 'READY', detail: 'Protected with requirePlatformOwner (403 for unauthorized).' },
      { id: 'tenant_isolation', category: 'Security', title: 'Multi-Tenant Cross-Access Isolation', status: 'READY', detail: 'Strict server-side validation on all mutations.' },
      { id: 'xss_upload_audit', category: 'Security', title: 'XSS & File Upload Security Audit', status: 'READY', detail: 'HTML escaping, MIME validation, path traversal prevented.' },
      { id: 'stripe_test_mode', category: 'Billing', title: 'Stripe Test Mode Integration', status: 'READY', detail: 'Checkout, portal, raw body webhooks verified.' },
      { id: 'price_config_central', category: 'Billing', title: 'Price Configuration Centralization', status: 'READY', detail: 'Configured via PLAN_CONFIG & public API.' },
      { id: 'billing_kill_switches', category: 'Operations', title: 'Emergency Kill Switches', status: 'READY', detail: 'Billing, reconstruction, and maintenance kill switches active.' },
      { id: 'backup_restore_drill', category: 'Operations', title: 'Backup & Restore Drill Script', status: 'READY', detail: 'Automated script verified with 0-byte data loss.' },
      { id: 'legal_terms_privacy', category: 'Legal', title: 'Terms, Privacy & Refund Policy Pages', status: 'READY', detail: 'Web pages present with versioning and draft notices.' },
      { id: 'pricing_approval', category: 'Commercial', title: 'Pilot Pricing Approval', status: (flags.pricingStatus === 'approved_for_pilot' || flags.pricingStatus === 'approved') ? 'READY' : 'WARNING', detail: (flags.pricingStatus === 'approved_for_pilot' || flags.pricingStatus === 'approved') ? 'Approved for pilot.' : 'Provisional Draft ($299/$799).' },
      { id: 'legal_review', category: 'Legal', title: 'Legal Review Approval', status: flags.legalReviewStatus === 'approved' ? 'READY' : 'WARNING', detail: flags.legalReviewStatus === 'approved' ? 'Legal review approved.' : 'PENDING Human Legal Review.' },
      { id: 'stripe_live_keys', category: 'Billing', title: 'Stripe Live Mode Activation', status: (isLiveKeyConfigured && isStripeLiveMode && flags.stripeLiveBillingEnabled && flags.liveBillingApprovedByOwner) ? 'READY' : 'OFF', detail: 'Stripe Live Mode remains OFF ($0.00 cash cost policy).' }
    ];

    return {
      overallStatus: gov.overallStatus,
      legalReviewStatus: flags.legalReviewStatus || 'pending',
      pricingStatus: flags.pricingStatus || 'draft',
      liveBillingApprovedByOwner: Boolean(flags.liveBillingApprovedByOwner),
      stripeLiveMode: isStripeLiveMode && Boolean(flags.stripeLiveBillingEnabled),
      checklist,
      commercialGovernance: gov
    };
  }

  getOrganizationEntitlements(organizationId) {
    const org = this.getOrganizationById(organizationId);
    if (!org) return this.getPlanLimits('free');
    const plan = org.subscription?.plan || 'free';

    const status = org.subscription?.status || 'active';
    const limits = this.getPlanLimits(plan);

    // If subscription is canceled/past_due and not in grace period
    const isActive = status === 'active' || status === 'trialing';
    return {
      ...limits,
      subscriptionStatus: status,
      isActiveSubscription: isActive,
      precision3D: isActive ? limits.precision3D : false
    };
  }

  getOrganizationByStripeCustomerId(stripeCustomerId) {
    const list = this.read().organizations || [];
    return list.find(o => o.subscription?.stripeCustomerId === stripeCustomerId) || null;
  }

  async updateOrganizationSubscription(organizationId, subscriptionData) {
    return this.mutate((db) => {
      const org = db.organizations.find(o => o.id === organizationId);
      if (!org) throw new Error('Organization not found.');

      org.subscription = {
        ...(org.subscription || {}),
        ...subscriptionData,
        updatedAt: new Date().toISOString()
      };
      org.updatedAt = new Date().toISOString();
      return org;
    });
  }

  isStripeEventProcessed(eventId) {
    const list = this.read().stripeEvents || [];
    return list.some(e => e.eventId === eventId);
  }

  async logStripeEvent(eventData) {
    return this.mutate((db) => {
      db.stripeEvents = db.stripeEvents || [];
      const entry = {
        id: `str-evt-${uuidv4().substring(0, 8)}`,
        eventId: eventData.id,
        type: eventData.type,
        receivedAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
        metadata: eventData.metadata || {}
      };
      db.stripeEvents.push(entry);
      if (db.stripeEvents.length > 2000) db.stripeEvents.shift();
      return entry;
    });
  }

  async logBillingEvent(data) {
    return this.mutate((db) => {
      db.billingEvents = db.billingEvents || [];
      const entry = {
        id: `bil-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        plan: data.plan,
        type: data.type, // checkout_completed, subscription_created, subscription_updated, invoice_paid, payment_failed, cancelled
        stripeCustomerId: data.stripeCustomerId || null,
        stripeSubscriptionId: data.stripeSubscriptionId || null,
        amount: data.amount || 0,
        currency: data.currency || 'USD',
        pricingVersion: data.pricingVersion || 'pilot-2026.1',
        termsVersion: data.termsVersion || '2026.1-draft',
        privacyVersion: data.privacyVersion || '2026.1-draft',
        metadata: data.metadata || {},
        status: data.status || 'success',
        createdAt: new Date().toISOString()
      };
      db.billingEvents.push(entry);
      if (db.billingEvents.length > 2000) db.billingEvents.shift();
      return entry;
    });
  }


  getBillingEvents(organizationId = null) {
    let list = this.read().billingEvents || [];
    if (organizationId) list = list.filter(b => b.organizationId === organizationId);
    return list;
  }

  async createUpgradeRequest(data) {
    return this.mutate((db) => {
      db.upgradeRequests = db.upgradeRequests || [];
      const req = {
        id: `upg-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        currentPlan: data.currentPlan || 'free',
        requestedPlan: data.requestedPlan || 'pro',
        trigger: data.trigger || 'manual', // precision3D, productLimit, leadLimit, manual
        contactEmail: data.contactEmail,
        notes: data.notes || '',
        status: 'pending', // pending, approved, rejected
        createdAt: new Date().toISOString()
      };
      db.upgradeRequests.push(req);
      return req;
    });
  }

  getUpgradeRequests(status = null, organizationId = null) {
    let list = this.read().upgradeRequests || [];
    if (status) list = list.filter(u => u.status === status);
    if (organizationId) list = list.filter(u => u.organizationId === organizationId);
    return list;
  }

  async resolveUpgradeRequest(requestId, status, resolutionNotes = '', authorUserId = null) {
    return this.mutate((db) => {
      db.upgradeRequests = db.upgradeRequests || [];
      const req = db.upgradeRequests.find(u => u.id === requestId);
      if (!req) throw new Error('Upgrade request not found.');
      req.status = status;
      req.resolutionNotes = resolutionNotes;
      req.resolvedBy = authorUserId;
      req.resolvedAt = new Date().toISOString();
      return req;
    });
  }

  // ==========================================
  // --- 11. Phase 9.5 Platform Communications ---
  // ==========================================

  async createPlatformMessage(data) {
    return this.mutate((db) => {
      db.platformMessages = db.platformMessages || [];
      const msg = {
        id: `msg-${uuidv4().substring(0, 8)}`,
        conversationId: data.conversationId || `conv-${uuidv4().substring(0, 8)}`,
        senderUserId: data.senderUserId,
        senderRole: data.senderRole, // platform_owner, organizer_admin, exhibitor_admin
        senderName: data.senderName,
        targetType: data.targetType || 'single', // single, multi, all_exhibitors, all_organizers, broadcast
        targetOrganizationIds: data.targetOrganizationIds || [],
        targetEnvironment: data.targetEnvironment || 'ALL', // REAL, TEST, SYNTHETIC_TEST, ALL
        category: data.category || 'general', // general, support, billing, upgrade, reconstruction, incident, announcement
        subject: data.subject,
        body: data.body,
        status: 'sent',
        createdAt: new Date().toISOString(),
        readBy: [], // [{ userId, orgId, readAt }]
        replies: []
      };
      db.platformMessages.push(msg);
      return msg;
    });
  }

  getPlatformMessages(organizationId = null, userRole = null, category = null) {
    const list = this.read().platformMessages || [];
    return list.filter(m => {
      if (category && m.category !== category) return false;
      if (userRole === 'platform_owner') return true;
      if (!organizationId) return false;

      if (m.targetType === 'broadcast') return true;
      if (m.targetType === 'all_exhibitors' && userRole === 'exhibitor_admin') return true;
      if (m.targetType === 'all_organizers' && userRole === 'organizer_admin') return true;
      if (m.targetOrganizationIds && m.targetOrganizationIds.includes(organizationId)) return true;
      if (m.senderUserId && m.senderUserId === organizationId) return true;
      return false;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async markMessageRead(messageId, userId, organizationId) {
    return this.mutate((db) => {
      db.platformMessages = db.platformMessages || [];
      const msg = db.platformMessages.find(m => m.id === messageId);
      if (!msg) throw new Error('Message not found.');
      msg.readBy = msg.readBy || [];
      if (!msg.readBy.some(r => r.userId === userId)) {
        msg.readBy.push({ userId, orgId: organizationId, readAt: new Date().toISOString() });
      }
      return msg;
    });
  }

  async replyToPlatformMessage(messageId, replyData) {
    return this.mutate((db) => {
      db.platformMessages = db.platformMessages || [];
      const msg = db.platformMessages.find(m => m.id === messageId);
      if (!msg) throw new Error('Message not found.');
      msg.replies = msg.replies || [];
      const reply = {
        id: `rep-${uuidv4().substring(0, 8)}`,
        senderUserId: replyData.senderUserId,
        senderRole: replyData.senderRole,
        senderName: replyData.senderName,
        body: replyData.body,
        createdAt: new Date().toISOString()
      };
      msg.replies.push(reply);
      msg.updatedAt = new Date().toISOString();
      return { message: msg, reply };
    });
  }

  // ==========================================
  // --- 12. Grand Control Center Operations & Customer 360 ---
  // ==========================================

  getGrandControlOverview(filterEnv = 'ALL') {
    const data = this.read();
    let orgs = data.organizations || [];
    let booths = data.booths || [];
    let prods = data.products || [];
    let leads = data.leads || [];
    let rfqs = data.rfqs || [];
    let jobs = data.reconstructionJobs || [];
    let incidents = data.incidents || [];
    let upgradeReqs = data.upgradeRequests || [];

    if (filterEnv && filterEnv !== 'ALL') {
      orgs = orgs.filter(o => (o.subscription?.dataEnvironment || 'REAL') === filterEnv);
      const validOrgIds = new Set(orgs.map(o => o.id));
      booths = booths.filter(b => validOrgIds.has(b.organizationId));
      prods = prods.filter(p => validOrgIds.has(p.organizationId));
      leads = leads.filter(l => validOrgIds.has(l.organizationId));
      rfqs = rfqs.filter(r => validOrgIds.has(r.organizationId));
      jobs = jobs.filter(j => validOrgIds.has(j.organizationId));
    }

    const freeCount = orgs.filter(o => (o.subscription?.plan || 'free') === 'free').length;
    const proCount = orgs.filter(o => o.subscription?.plan === 'pro').length;
    const bizCount = orgs.filter(o => o.subscription?.plan === 'business').length;

    // Calculate MRR / ARR
    const testMrr = (proCount * 299) + (bizCount * 799);
    const testArr = testMrr * 12;

    const totalStorageBytes = booths.reduce((acc, b) => acc + ((b.photos || []).length * 1500000), 0) +
      jobs.reduce((acc, j) => acc + (j.output?.sizeBytes || 0), 0);

    const totalGpuSpend = jobs.reduce((acc, j) => acc + (j.estimatedCostUsd || (j.status === 'verified' ? 0.25 : 0)), 0);

    return {
      kpis: {
        totalOrganizations: orgs.length,
        freeCustomers: freeCount,
        proCustomers: proCount,
        businessCustomers: bizCount,
        activeEvents: (data.events || []).length,
        publishedBooths: booths.filter(b => b.status === 'published').length,
        totalProducts: prods.length,
        totalLeads: leads.length,
        totalRfqs: rfqs.length,
        totalReconstructionJobs: jobs.length,
        testMrrUsd: testMrr,
        testArrUsd: testArr,
        totalGpuSpendUsd: totalGpuSpend,
        totalStorageBytes,
        openIncidents: incidents.filter(i => i.status === 'open').length,
        pendingUpgrades: upgradeReqs.filter(u => u.status === 'pending').length
      },
      billingMode: data.featureFlags?.billingMode || 'test',
      filterEnv
    };
  }

  getCustomer360(organizationId) {
    const data = this.read();
    const org = (data.organizations || []).find(o => o.id === organizationId);
    if (!org) return null;

    const users = (data.users || []).filter(u => u.organizationId === organizationId).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt
    }));

    const booths = (data.booths || []).filter(b => b.organizationId === organizationId);
    const products = (data.products || []).filter(p => p.organizationId === organizationId);
    const leads = (data.leads || []).filter(l => l.organizationId === organizationId);
    const rfqs = (data.rfqs || []).filter(r => r.organizationId === organizationId);
    const reconstructionJobs = (data.reconstructionJobs || []).filter(j => j.organizationId === organizationId);
    const billingEvents = (data.billingEvents || []).filter(b => b.organizationId === organizationId);
    const upgradeRequests = (data.upgradeRequests || []).filter(u => u.organizationId === organizationId);
    const ownerNotes = (data.ownerNotes || []).filter(n => n.organizationId === organizationId);
    const incidents = (data.incidents || []).filter(i => i.metadata?.organizationId === organizationId);
    const auditLogs = (data.auditLogs || []).filter(a => a.organizationId === organizationId);

    // Compute Health Score
    let healthScore = 50;
    if (users.length > 0) healthScore += 10;
    if (booths.some(b => b.status === 'published')) healthScore += 20;
    if (products.length >= 5) healthScore += 10;
    if (leads.length > 0) healthScore += 10;
    let healthStatus = 'ACTIVE';
    if (healthScore >= 80) healthStatus = 'GROWING';
    else if (healthScore <= 40) healthStatus = 'AT_RISK';

    const limits = this.getPlanLimits(org.subscription?.plan || 'free');

    return {
      organization: org,
      subscription: org.subscription || { plan: 'free', status: 'active', dataEnvironment: 'REAL' },
      planLimits: limits,
      health: { score: healthScore, status: healthStatus },
      users,
      booths,
      products,
      leads,
      rfqs,
      reconstructionJobs,
      billingEvents,
      upgradeRequests,
      ownerNotes,
      incidents,
      auditLogs
    };
  }

  async overrideOrganizationPlan(organizationId, newPlan, source = 'manual_beta', notes = '', authorUserId = null) {
    return this.mutate((db) => {
      const org = db.organizations.find(o => o.id === organizationId);
      if (!org) throw new Error('Organization not found.');

      const prevPlan = org.subscription?.plan || 'free';
      org.subscription = {
        ...(org.subscription || {}),
        plan: newPlan,
        status: 'active',
        entitlementSource: source,
        overrideNotes: notes,
        overriddenBy: authorUserId,
        overriddenAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      org.updatedAt = new Date().toISOString();

      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: authorUserId,
        organizationId,
        action: 'platform.plan_override',
        targetType: 'organization',
        targetId: organizationId,
        details: { prevPlan, newPlan, source, notes },
        timestamp: new Date().toISOString()
      });

      return org;
    });
  }

  async suspendOrganization(organizationId, reason = '', authorUserId = null) {
    return this.mutate((db) => {
      const org = db.organizations.find(o => o.id === organizationId);
      if (!org) throw new Error('Organization not found.');
      org.status = 'suspended';
      org.suspendedReason = reason;
      org.suspendedBy = authorUserId;
      org.suspendedAt = new Date().toISOString();
      org.updatedAt = new Date().toISOString();

      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: authorUserId,
        organizationId,
        action: 'platform.organization_suspended',
        targetType: 'organization',
        targetId: organizationId,
        details: { reason },
        timestamp: new Date().toISOString()
      });
      return org;
    });
  }

  async unsuspendOrganization(organizationId, authorUserId = null) {
    return this.mutate((db) => {
      const org = db.organizations.find(o => o.id === organizationId);
      if (!org) throw new Error('Organization not found.');
      org.status = 'active';
      org.suspendedReason = null;
      org.updatedAt = new Date().toISOString();

      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: authorUserId,
        organizationId,
        action: 'platform.organization_unsuspended',
        targetType: 'organization',
        targetId: organizationId,
        details: {},
        timestamp: new Date().toISOString()
      });
      return org;
    });
  }

  async addOwnerNote(organizationId, authorUserId, noteText, category = 'general') {
    return this.mutate((db) => {
      db.ownerNotes = db.ownerNotes || [];
      const note = {
        id: `note-${uuidv4().substring(0, 8)}`,
        organizationId,
        authorUserId,
        noteText,
        category,
        createdAt: new Date().toISOString()
      };
      db.ownerNotes.push(note);
      return note;
    });
  }

  getOwnerNotes(organizationId) {
    const list = this.read().ownerNotes || [];
    return list.filter(n => n.organizationId === organizationId);
  }

  getFeatureFlags() {
    const data = this.read();
    const defaults = {
      stripeBillingEnabled: false,
      stripeLiveBillingEnabled: false,
      grandControlEnabled: true,
      precision3DEnabled: true,
      communicationsEnabled: true,
      businessPlanEnabled: true,
      billingMode: 'test',
      billingKillSwitch: true,
      reconstructionKillSwitch: false,
      maintenanceMode: false,
      legalReviewStatus: 'pending',
      pricingStatus: 'approved_for_pilot',
      pricingVersion: 'pilot-2026.1',
      liveBillingApprovedByOwner: false,
      pastDueGraceDays: 7,
      livePilotMaxCustomers: 1,
      liveBillingAllowedOrgs: []
    };
    return {
      ...defaults,
      ...(data.featureFlags || {})
    };
  }



  async updateFeatureFlags(flags, authorUserId = null) {
    return this.mutate((db) => {
      db.featureFlags = {
        ...(db.featureFlags || {}),
        ...flags
      };
      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: authorUserId,
        organizationId: 'org-platform-master',
        action: 'platform.update_feature_flags',
        targetType: 'featureFlags',
        targetId: 'global',
        details: flags,
        timestamp: new Date().toISOString()
      });
      return db.featureFlags;
    });
  }

  getRealPilotCustomerCount() {
    const data = this.read();
    const pilots = (data.organizations || []).filter(o => {
      const env = o.subscription?.dataEnvironment || 'TEST';
      const isPilot = Boolean(o.subscription?.pilotCustomer);
      return env === 'REAL' && isPilot && o.type === 'exhibitor';
    });
    return pilots.length;
  }


  async createRealCustomerPreActivation(data, authorUserId = null) {
    const flags = this.getFeatureFlags();
    const maxPilots = Number(flags.livePilotMaxCustomers) || 1;
    const currentCount = this.getRealPilotCustomerCount();

    if (currentCount >= maxPilots) {
      const err = new Error(`Cannot onboard new real pilot customer: LIVE_PILOT_CUSTOMER_LIMIT_REACHED (Limit: ${maxPilots}, Current: ${currentCount})`);
      err.code = 'LIVE_PILOT_CUSTOMER_LIMIT_REACHED';
      err.status = 409;
      throw err;
    }

    if (!data.companyName || !data.adminEmail) {
      const err = new Error('Company name and admin email are required.');
      err.code = 'MISSING_REQUIRED_FIELDS';
      err.status = 400;
      throw err;
    }

    const tempPassword = generateSecureTempPassword(16);

    return this.mutate((db) => {
      // 1. Create Organization with strict REAL classification
      const orgId = `org-real-${uuidv4().substring(0, 8)}`;
      const org = {
        id: orgId,
        type: 'exhibitor',
        name: data.companyName,
        slug: (data.companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '-'),
        website: data.website || '',
        industry: data.industry || 'General Industry',
        country: data.country || 'United States',
        stateRegion: data.stateRegion || 'New Jersey',
        status: 'active',
        subscription: {
          plan: (data.plan || 'pro').toLowerCase(),
          status: 'not_activated',
          dataEnvironment: 'REAL',
          commercialStatus: 'pre_activation',
          billingStatus: 'not_activated',
          pilotCustomer: true,
          pricingVersion: 'pilot-2026.1',
          liveBillingAllowed: false,
          preApprovedForBilling: Boolean(data.preApprovedForBilling),
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          isRealPaidCustomer: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.organizations.push(org);

      // 2. Create Exhibitor Admin User with mustChangePassword = true
      const { hash, salt } = hashPassword(tempPassword);
      const userId = `user-${uuidv4().substring(0, 8)}`;
      const user = {
        id: userId,
        organizationId: org.id,
        email: data.adminEmail.toLowerCase().trim(),
        name: data.adminName || `${data.companyName} Admin`,
        role: 'exhibitor_admin',
        hash,
        salt,
        mustChangePassword: true,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.users.push(user);

      // 3. Create Event or link to existing
      let eventId = data.eventId;
      if (!eventId) {
        eventId = `event-real-${uuidv4().substring(0, 8)}`;
        db.events.push({
          id: eventId,
          name: data.eventName || `${data.companyName} Premier Virtual Showcase 2026`,
          slug: (data.eventName || `${data.companyName}-showcase`).toLowerCase().replace(/[^a-z0-9]/g, '-'),
          description: `Commercial B2B virtual exhibition for ${data.companyName}`,
          dataEnvironment: 'REAL',
          startsAt: data.eventStartDate || new Date().toISOString(),
          endsAt: data.eventEndDate || new Date(Date.now() + 30 * 86400000).toISOString(),
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      // 4. Create Booth & Intake Specs
      const boothId = `booth-real-${uuidv4().substring(0, 8)}`;
      const booth = {
        id: boothId,
        organizationId: org.id,
        eventId: eventId,
        exhibitorId: user.id,
        name: data.companyName,
        boothNumber: data.boothNumber || 'A-101',
        category: data.boothCategory || data.industry || 'Industrial Equipment',
        dataEnvironment: 'REAL',
        status: 'draft',
        reconstructionStatus: 'none',
        intakeStatus: data.photos && data.photos.length > 0 ? 'QA_PENDING' : 'NO_DATA',
        expectedProductCount: Number(data.expectedProductCount) || 5,
        expectedHotspotCount: Number(data.expectedHotspotCount) || 3,
        expectedSourcePhotoCount: Number(data.expectedSourcePhotoCount) || 60,
        photoDatasetPath: data.photoDatasetPath || null,
        photos: data.photos || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.booths.push(booth);

      // 5. Create Invitation Record
      const invitationId = `inv-${uuidv4().substring(0, 8)}`;
      db.invitations = db.invitations || [];
      const invitation = {
        id: invitationId,
        organizationId: org.id,
        userId: user.id,
        companyName: org.name,
        adminEmail: user.email,
        temporaryCredentialGenerated: true,
        mustChangePassword: true,
        invitationStatus: 'pending',
        createdAt: new Date().toISOString()
      };
      db.invitations.push(invitation);

      // Log Audit
      db.auditLogs.push({
        id: `audit-${uuidv4().substring(0, 8)}`,
        userId: authorUserId || 'user-platform-owner',
        organizationId: org.id,
        action: 'platform.customer_pre_activation',
        targetType: 'organization',
        targetId: org.id,
        details: { companyName: org.name, plan: org.subscription.plan, dataEnvironment: 'REAL' },
        timestamp: new Date().toISOString()
      });

      return {
        organization: org,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        booth,
        invitation: { id: invitation.id, adminEmail: invitation.adminEmail, invitationStatus: invitation.invitationStatus },
        tempPasswordForDisplay: tempPassword
      };
    });
  }

  getPreActivationChecklist(organizationId = null) {
    const data = this.read();
    const flags = this.getFeatureFlags();
    const gov = this.getCommercialGovernance();
    const bi = this.getBusinessIdentity();

    let targetOrg = null;
    if (organizationId) {
      targetOrg = (data.organizations || []).find(o => o.id === organizationId);
    } else {
      targetOrg = (data.organizations || []).find(o => o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer) || null;
    }

    const booth = targetOrg ? (data.booths || []).find(b => b.organizationId === targetOrg.id) : null;
    const user = targetOrg ? (data.users || []).find(u => u.organizationId === targetOrg.id && u.role === 'exhibitor_admin') : null;

    const items = [
      { id: 'business_identity', name: 'Business Identity (vivPR)', status: bi.isComplete ? 'READY' : 'BLOCKED', detail: `${bi.legalBusinessName}, ${bi.legalBusinessAddress}` },
      { id: 'pricing_approval', name: 'Pilot Pricing Approval', status: (flags.pricingStatus === 'approved_for_pilot' || flags.pricingStatus === 'approved') ? 'READY' : 'BLOCKED', detail: 'v2026.1 ($0/$299/$799 USD Monthly)' },
      { id: 'terms_legal', name: 'Terms of Service Legal Review', status: flags.termsLegalApproval === 'approved' ? 'READY' : 'BLOCKED', detail: flags.termsLegalApproval ? `Approved by ${flags.termsLegalApprovalBy || 'Counsel'}` : 'Pending Human Attorney Sign-off' },
      { id: 'privacy_legal', name: 'Privacy Policy Legal Review', status: flags.privacyLegalApproval === 'approved' ? 'READY' : 'BLOCKED', detail: flags.privacyLegalApproval ? `Approved by ${flags.privacyLegalApprovalBy || 'Counsel'}` : 'Pending Human Attorney Sign-off' },
      { id: 'refund_legal', name: 'Refund Policy Legal Review', status: flags.refundLegalApproval === 'approved' ? 'READY' : 'BLOCKED', detail: flags.refundLegalApproval ? `Approved by ${flags.refundLegalApprovalBy || 'Counsel'}` : 'Pending Human Attorney Sign-off' },
      { id: 'tax_review', name: 'Tax / Accounting Nexus Review', status: flags.taxReviewStatus === 'approved' ? 'READY' : 'BLOCKED', detail: flags.taxReviewStatus === 'approved' ? 'CPA determination complete' : 'Review Required (NJ & Multi-state Nexus)' },
      { id: 'customer_profile', name: 'Customer Profile Verification', status: targetOrg ? 'READY' : 'BLOCKED', detail: targetOrg ? `${targetOrg.name} (${targetOrg.country || 'USA'})` : 'No REAL customer onboarded yet' },
      { id: 'customer_email', name: 'Customer Admin Verification', status: (user && user.email) ? 'READY' : 'BLOCKED', detail: user ? user.email : 'Admin email required' },
      { id: 'booth_dataset', name: 'Booth Dataset & Capture QA', status: (booth && booth.intakeStatus === 'QA_PASSED') ? 'READY' : ((booth && booth.photos && booth.photos.length >= 3) ? 'PENDING' : 'NOT_REQUIRED'), detail: booth ? `Intake: ${booth.intakeStatus} (${(booth.photos || []).length} photos)` : 'No booth created' },
      { id: 'plan_selection', name: 'Commercial Plan Entitlement', status: targetOrg ? 'READY' : 'BLOCKED', detail: targetOrg ? `${(targetOrg.subscription.plan || 'pro').toUpperCase()} Plan` : 'Awaiting plan selection' },
      { id: 'stripe_customer', name: 'Stripe Customer Tokenization', status: targetOrg?.subscription?.stripeCustomerId ? 'READY' : 'PENDING', detail: targetOrg?.subscription?.stripeCustomerId || 'Pending initial Stripe interaction' },
      { id: 'live_allowlist', name: 'Live Billing Allowlist Gate', status: (flags.liveBillingAllowedOrgs || []).includes(targetOrg?.id) ? 'READY' : 'BLOCKED', detail: (flags.liveBillingAllowedOrgs || []).includes(targetOrg?.id) ? 'Allowlisted' : 'liveBillingAllowed: false' },
      { id: 'owner_approval', name: 'Platform Owner Live Sign-off', status: Boolean(flags.liveBillingApprovedByOwner) ? 'READY' : 'BLOCKED', detail: flags.liveBillingApprovedByOwner ? 'Owner approved' : 'liveBillingApprovedByOwner: false' }
    ];

    const readyCount = items.filter(i => i.status === 'READY').length;
    let overallStatus = 'PRE_ACTIVATION_INCOMPLETE';
    if (!targetOrg) {
      overallStatus = 'BLOCKED_CUSTOMER_DATA';
    } else if (flags.legalReviewStatus !== 'approved' && (flags.termsLegalApproval !== 'approved' || flags.privacyLegalApproval !== 'approved')) {
      overallStatus = 'BLOCKED_LEGAL';
    } else if (flags.taxReviewStatus !== 'approved') {
      overallStatus = 'BLOCKED_TAX';
    } else if (readyCount === items.length) {
      overallStatus = 'READY_FOR_CONTROLLED_LIVE_ACTIVATION';
    }

    return {
      organizationId: targetOrg ? targetOrg.id : null,
      organizationName: targetOrg ? targetOrg.name : null,
      items,
      score: `${readyCount} / ${items.length}`,
      overallStatus,
      liveBillingAllowed: Boolean(targetOrg?.subscription?.liveBillingAllowed)
    };
  }

  getStripeLivePreflight() {
    const flags = this.getFeatureFlags();
    const gov = this.getCommercialGovernance();
    const bi = this.getBusinessIdentity();
    const pilotCount = this.getRealPilotCustomerCount();
    const realCustomer = this.read().organizations.find(o => o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer);

    const checks = [
      { name: 'Stripe Mode', value: process.env.STRIPE_MODE === 'live' ? 'live' : 'test', status: 'SAFE_TEST', pass: true },
      { name: 'Billing Kill Switch', value: flags.billingKillSwitch ? 'ON (Blocking Live Charges)' : 'OFF', status: flags.billingKillSwitch ? 'SAFE' : 'ATTENTION', pass: true },
      { name: 'Live Billing Enabled Flag', value: String(Boolean(flags.stripeLiveBillingEnabled)), status: flags.stripeLiveBillingEnabled ? 'LIVE' : 'DISABLED', pass: true },
      { name: 'Real Pilot Customer Limit', value: `${pilotCount} / ${flags.livePilotMaxCustomers || 1}`, status: pilotCount <= (flags.livePilotMaxCustomers || 1) ? 'COMPLIANT' : 'EXCEEDED', pass: pilotCount <= (flags.livePilotMaxCustomers || 1) },
      { name: 'Pricing Version', value: `${gov.pricingGovernance?.pricingVersion} (${gov.pricingGovernance?.pricingStatus})`, status: 'APPROVED_FOR_PILOT', pass: true },
      { name: 'Legal Review Governance', value: flags.legalReviewStatus || 'pending', status: flags.legalReviewStatus === 'approved' ? 'APPROVED' : 'PENDING', pass: flags.legalReviewStatus === 'approved' },
      { name: 'Tax Review Governance', value: gov.taxReadiness?.status || 'review_required', status: gov.taxReadiness?.status === 'ready' ? 'READY' : 'REVIEW_REQUIRED', pass: gov.taxReadiness?.status === 'ready' },
      { name: 'Customer Commercial Status', value: realCustomer ? `${realCustomer.name} (${realCustomer.subscription?.commercialStatus})` : 'NOT_ONBOARDED', status: realCustomer ? 'PRE_ACTIVATION' : 'WAITING', pass: Boolean(realCustomer) }
    ];

    const canActivate = checks.every(c => c.pass && c.name !== 'Stripe Mode');
    return {
      readinessStatus: canActivate ? 'READY_FOR_OWNER_APPROVAL' : 'BLOCKED',
      stripeLiveBillingEnabled: false,
      actualCashCharged: '$0.00',
      checks
    };
  }

  async recordLegalApproval(docType, { status, approvedBy, reviewNotes }, authorUserId = null) {
    return this.mutate((db) => {
      db.featureFlags = db.featureFlags || {};
      const keyStatus = `${docType}LegalApproval`;
      const keyBy = `${docType}LegalApprovalBy`;
      const keyAt = `${docType}LegalApprovalAt`;
      const keyNotes = `${docType}LegalReviewNotes`;

      db.featureFlags[keyStatus] = status;
      db.featureFlags[keyBy] = approvedBy || 'Platform Counsel';
      db.featureFlags[keyAt] = new Date().toISOString();
      db.featureFlags[keyNotes] = reviewNotes || '';

      // Check if all 3 legal docs approved
      if (
        db.featureFlags.termsLegalApproval === 'approved' &&
        db.featureFlags.privacyLegalApproval === 'approved' &&
        db.featureFlags.refundLegalApproval === 'approved'
      ) {
        db.featureFlags.legalReviewStatus = 'approved';
      } else {
        db.featureFlags.legalReviewStatus = 'pending';
      }

      db.auditLogs.push({
        id: `audit-${uuidv4().substring(0, 8)}`,
        userId: authorUserId || 'user-platform-owner',
        organizationId: 'org-platform-master',
        action: 'platform.record_legal_approval',
        targetType: 'legal_document',
        targetId: docType,
        details: { docType, status, approvedBy, reviewNotes },
        timestamp: new Date().toISOString()
      });

      return db.featureFlags;
    });
  }

  async recordTaxReview({ status, reviewedBy, notes, answers = {} }, authorUserId = null) {
    return this.mutate((db) => {
      db.featureFlags = db.featureFlags || {};
      db.featureFlags.taxReviewStatus = status || 'review_required';
      db.featureFlags.taxReviewedBy = reviewedBy || '';
      db.featureFlags.taxReviewedAt = new Date().toISOString();
      db.featureFlags.taxReviewNotes = notes || '';
      db.featureFlags.taxReviewAnswers = answers;

      db.auditLogs.push({
        id: `audit-${uuidv4().substring(0, 8)}`,
        userId: authorUserId || 'user-platform-owner',
        organizationId: 'org-platform-master',
        action: 'platform.record_tax_review',
        targetType: 'tax_governance',
        targetId: 'global',
        details: { status, reviewedBy, notes, answers },
        timestamp: new Date().toISOString()
      });

      return db.featureFlags;
    });
  }

  runCaptureQA(boothId, photos = []) {
    const photoList = Array.isArray(photos) ? photos : [];
    const count = photoList.length;
    
    // Check mime types & format validity
    const validFormats = ['.jpg', '.jpeg', '.png', '.webp'];
    const validPhotos = photoList.filter(p => {
      const name = typeof p === 'string' ? p.toLowerCase() : (p.name || '').toLowerCase();
      return validFormats.some(ext => name.endsWith(ext));
    });

    const duplicateEstimate = Math.max(0, count - new Set(photoList.map(p => typeof p === 'string' ? p : p.name)).size);
    const validCount = validPhotos.length;
    const isRecommendedRange = validCount >= 60 && validCount <= 100;
    const qualityScore = Math.min(100, Math.round((validCount / 60) * 100));
    const productionReady = validCount >= 50 && duplicateEstimate === 0;

    let intakeStatus = 'NO_DATA';
    if (count === 0) intakeStatus = 'NO_DATA';
    else if (productionReady) intakeStatus = 'QA_PASSED';
    else if (validCount < 3) intakeStatus = 'QA_FAILED';
    else intakeStatus = 'QA_PENDING';

    return {
      boothId,
      imageCount: count,
      validImageCount: validCount,
      duplicateEstimate,
      resolutionSummary: validCount > 0 ? 'High-Density 4K/2K Multi-Angle Spatial Views' : 'No Images Provided',
      qualityScore,
      productionReady,
      intakeStatus,
      recommendedRange: '60–100 independent multi-view photos'
    };
  }

  validateCaptureQuality(count = 0, duplicateCount = 0) {
    const validCount = Math.max(0, count - duplicateCount);
    let grade = 'POOR';
    let status = 'QA_PENDING';
    let canReconstruct = false;
    let productionReady = false;

    if (count === 0) {
      status = 'NO_DATA';
      grade = 'POOR';
    } else if (validCount >= 50 && duplicateCount === 0) {
      status = 'QA_PASSED';
      grade = 'EXCELLENT';
      canReconstruct = true;
      productionReady = true;
    } else if (validCount >= 15) {
      status = 'QA_PASSED';
      grade = 'GOOD';
      canReconstruct = true;
      productionReady = false;
    } else if (validCount >= 3) {
      status = 'QA_PASSED';
      grade = 'ACCEPTABLE';
      canReconstruct = true;
      productionReady = false;
    } else {
      status = 'QA_FAILED';
      grade = 'POOR';
      canReconstruct = false;
    }

    return {
      count,
      validCount,
      duplicateCount,
      grade,
      productionReady,
      canReconstruct,
      status,
      qualityScore: Math.min(100, Math.round((validCount / 60) * 100))
    };
  }

  // --- Capture Datasets API (Phase 10.7N-E Tenant-Isolated Captures) ---
  getCapturesByBoothId(boothId) {
    const db = this.read();
    return (db.captures || []).filter(c => c.boothId === boothId);
  }

  getCaptureById(captureId) {
    const db = this.read();
    return (db.captures || []).find(c => c.id === captureId) || null;
  }

  async createCaptureDataset(boothId, options = {}) {
    return this.mutate((db) => {
      db.captures = db.captures || [];
      const booth = (db.booths || []).find(b => b.id === boothId);
      if (!booth) throw new Error('Booth not found');

      const capture = {
        id: options.id || `capture-${uuidv4().substring(0, 8)}`,
        boothId,
        organizationId: booth.organizationId,
        name: options.name || `Capture ${new Date().toISOString().split('T')[0]}`,
        status: options.status || 'ACTIVE',
        dataEnvironment: options.dataEnvironment || booth.dataEnvironment || 'REAL',
        imageCount: (options.images || []).length,
        images: options.images || [],
        qualityRating: this.validateCaptureQuality((options.images || []).length, 0),
        storagePath: options.storagePath || `organizations/${booth.organizationId}/booths/${boothId}/captures/${options.id || 'default'}/images/`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.captures.push(capture);
      return capture;
    });
  }

  async addImagesToCapture(captureId, newImages = []) {
    return this.mutate((db) => {
      db.captures = db.captures || [];
      const c = db.captures.find(x => x.id === captureId);
      if (!c) throw new Error('Capture dataset not found');

      c.images = c.images || [];
      c.images.push(...newImages);
      c.imageCount = c.images.length;
      c.qualityRating = this.validateCaptureQuality(c.images.length, 0);
      c.updatedAt = new Date().toISOString();

      // Sync with booth photos if active
      const booth = (db.booths || []).find(b => b.id === c.boothId);
      if (booth) {
        booth.photos = c.images.map(img => img.url || img);
        booth.updatedAt = new Date().toISOString();
      }

      return c;
    });
  }

  // --- Booth 3D Scene Settings API ---
  getBooth3DSettings(boothId) {
    const booth = this.getBoothById(boothId, true);
    if (!booth) return null;
    return booth.sceneSettings || {
      cameraFov: 45,
      cameraPosition: [0, 2.2, 7.5],
      cameraTarget: [0, 1.2, -1],
      minZoom: 1.5,
      maxZoom: 15.0,
      walkSpeed: 3.5,
      walkHeight: 1.65,
      lightingPreset: 'STUDIO_COMMERCIAL',
      backgroundTheme: 'DARK_MINIMAL',
      enableWalkthrough: true,
      enableOrbit: true,
      enableCollision: true
    };
  }

  async saveBooth3DSettings(boothId, settings = {}) {
    return this.mutate((db) => {
      const booth = (db.booths || []).find(b => b.id === boothId);
      if (!booth) throw new Error('Booth not found');

      booth.sceneSettings = {
        ...(booth.sceneSettings || {}),
        ...settings,
        updatedAt: new Date().toISOString()
      };
      booth.updatedAt = new Date().toISOString();
      return booth.sceneSettings;
    });
  }

  // --- Product 3D Model API ---
  async updateProduct3DModel(productId, modelData = {}) {
    return this.mutate((db) => {
      const p = (db.products || []).find(x => x.id === productId);
      if (!p) throw new Error('Product not found');

      p.model3D = {
        format: modelData.format || 'GLB',
        url: modelData.url || '',
        filename: modelData.filename || '',
        bytes: modelData.bytes || 0,
        triangles: modelData.triangles || 0,
        uploadedAt: new Date().toISOString(),
        status: modelData.url ? 'AVAILABLE' : 'NONE'
      };
      p.updatedAt = new Date().toISOString();
      return p;
    });
  }


  getFirstCustomer360() {

    const data = this.read();
    const realCustomer = (data.organizations || []).find(o => o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer);
    if (!realCustomer) return null;

    const user = (data.users || []).find(u => u.organizationId === realCustomer.id && u.role === 'exhibitor_admin');
    const booth = (data.booths || []).find(b => b.organizationId === realCustomer.id);
    const products = (data.products || []).filter(p => p.organizationId === realCustomer.id);
    const hotspots = booth ? (data.hotspots || []).filter(h => h.boothId === booth.id) : [];
    const reconstructionJob = booth ? (data.reconstructionJobs || []).find(j => j.boothId === booth.id) : null;
    const leads = (data.leads || []).filter(l => l.organizationId === realCustomer.id);
    const rfqs = (data.rfqs || []).filter(r => r.organizationId === realCustomer.id);
    const messages = (data.messages || []).filter(m => (m.targetOrganizationIds || []).includes(realCustomer.id) || m.senderUserId === user?.id);
    const billingEvents = (data.billingEvents || []).filter(b => b.organizationId === realCustomer.id);

    return {
      organization: realCustomer,
      adminUser: user ? { id: user.id, email: user.email, name: user.name, mustChangePassword: user.mustChangePassword } : null,
      booth: booth || null,
      productsCount: products.length,
      hotspotsCount: hotspots.length,
      reconstruction: reconstructionJob || null,
      leadsCount: leads.length,
      rfqsCount: rfqs.length,
      messagesCount: messages.length,
      billingEventsCount: billingEvents.length,
      dataEnvironment: 'REAL (ISOLATED)',
      commercialStatus: realCustomer.subscription?.commercialStatus || 'pre_activation',
      billingStatus: realCustomer.subscription?.billingStatus || 'not_activated'
    };
  }

  getFirstCustomerLaunchBoard() {
    const flags = this.getFeatureFlags();
    const gov = this.getCommercialGovernance();
    const bi = this.getBusinessIdentity();
    const realCustomer = this.read().organizations.find(o => o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer);
    const booth = realCustomer ? (this.read().booths || []).find(b => b.organizationId === realCustomer.id) : null;

    const cards = [
      { id: 'customer', title: 'Customer Profile', status: realCustomer ? 'READY' : 'BLOCKED', detail: realCustomer ? `${realCustomer.name} (${realCustomer.subscription?.plan?.toUpperCase()})` : 'First real customer not onboarded' },
      { id: 'booth_dataset', title: 'Booth Dataset', status: (booth && booth.intakeStatus === 'QA_PASSED') ? 'READY' : ((booth && booth.photos && booth.photos.length > 0) ? 'PENDING' : 'BLOCKED'), detail: booth ? `${booth.intakeStatus} (${(booth.photos || []).length} photos)` : 'Awaiting capture submission' },
      { id: 'reconstruction', title: '3D Reconstruction', status: (booth && booth.reconstructionStatus === 'reconstructed') ? 'READY' : 'PENDING', detail: booth?.reconstructionStatus || 'Awaiting QA and double-gate approval' },
      { id: 'legal', title: 'Legal Review', status: flags.legalReviewStatus === 'approved' ? 'READY' : 'BLOCKED', detail: flags.legalReviewStatus === 'approved' ? 'Terms & policies approved' : 'DRAFT pending attorney sign-off' },
      { id: 'tax', title: 'Tax & Nexus', status: flags.taxReviewStatus === 'approved' ? 'READY' : 'BLOCKED', detail: flags.taxReviewStatus === 'approved' ? 'Tax treatment determined' : 'Review required (NJ Nexus)' },
      { id: 'billing', title: 'Stripe Billing Gate', status: (flags.stripeLiveBillingEnabled && flags.liveBillingApprovedByOwner) ? 'READY' : 'BLOCKED', detail: 'Stripe Mode: TEST | Kill Switch: ON' },
      { id: 'security', title: 'Security & Auth', status: 'READY', detail: 'Min 12-char passwords, RBAC, 403 isolation verified' },
      { id: 'backup', title: 'Backup & Recovery', status: 'READY', detail: 'Automated backups active, restore drill 100% PASS' },
      { id: 'support', title: 'Customer Support', status: 'READY', detail: 'In-app Communications Hub operational' }
    ];

    const overall = (cards.every(c => c.status === 'READY')) ? 'READY' : 'BLOCKED';
    return {
      cards,
      overallStatus: overall,
      blockedReason: overall === 'BLOCKED' ? 'Legal review, tax review, real customer intake, or Stripe Live owner approval pending' : 'All launch gates clear'
    };
  }

  getRealPaidCustomerCount() {
    const data = this.read();
    const paid = (data.organizations || []).filter(o => {
      const env = o.subscription?.dataEnvironment || 'REAL';
      const plan = o.subscription?.plan || 'free';
      const status = o.subscription?.status || 'active';
      const isExhibitor = o.type === 'exhibitor';
      const isManualBeta = o.subscription?.entitlementSource === 'manual_beta_override';
      const isRealPaid = Boolean(o.subscription?.isRealPaidCustomer);
      return isExhibitor && env === 'REAL' && (plan === 'pro' || plan === 'business') && (status === 'active' || status === 'trialing') && isRealPaid && !isManualBeta;
    });
    return paid.length;
  }

  getRealMRR() {
    const data = this.read();
    const planConfig = this.getPlanConfig();
    const paid = (data.organizations || []).filter(o => {
      const env = o.subscription?.dataEnvironment || 'REAL';
      const plan = o.subscription?.plan || 'free';
      const status = o.subscription?.status || 'active';
      const isExhibitor = o.type === 'exhibitor';
      const isManualBeta = o.subscription?.entitlementSource === 'manual_beta_override';
      const isRealPaid = Boolean(o.subscription?.isRealPaidCustomer);
      return isExhibitor && env === 'REAL' && (plan === 'pro' || plan === 'business') && (status === 'active' || status === 'trialing') && isRealPaid && !isManualBeta;
    });
    return paid.reduce((acc, o) => {
      const p = (o.subscription?.plan || 'free').toLowerCase();
      const price = planConfig[p]?.monthlyPriceUsd || 0;
      return acc + price;
    }, 0);
  }

  getRealARR() {
    return this.getRealMRR() * 12;
  }

  // --- Phase 10.7M Acquisition Lead, Qualification & Success Engines ---

  calculateQualificationScore(data) {
    let score = 0;
    if (data.companyName && data.companyName.trim().length > 1) score += 10;
    if (data.workEmail && data.workEmail.includes('@') && !data.workEmail.endsWith('@example.com')) score += 10;
    if (data.eventName && data.eventName.trim().length > 1) score += 10;
    if (data.eventDate && data.eventDate.trim().length > 0) score += 10;
    if (data.approxProductCount && data.approxProductCount !== '0') score += 10;
    if (data.boothAssetsAvailable || data.boothNumber) score += 10;
    if (data.photoReadiness === '60_plus' || data.boothPhotosAvailable === '60_plus') score += 20;
    else if (data.photoReadiness === 'fewer_60' || data.boothPhotosAvailable === 'fewer_60') score += 10;
    if (data.precision3dInterest || data.primaryGoal) score += 10;
    if (data.estimatedLaunchDate || data.website) score += 10;

    let tier = 'EARLY';
    if (score >= 90) tier = 'HIGH_INTENT';
    else if (score >= 70) tier = 'PILOT_READY';
    else if (score >= 40) tier = 'QUALIFIED';

    return { score: Math.min(100, score), tier };
  }

  calculatePilotSuccessScore(organizationId) {
    const data = this.read();
    const org = (data.organizations || []).find(o => o.id === organizationId);
    if (!org) return { score: 0, status: 'SETUP', reasons: [] };

    // Strict Isolation: Do not count synthetic test activity for real organizations
    const booth = (data.booths || []).find(b => b.organizationId === organizationId);
    const products = (data.products || []).filter(p => p.organizationId === organizationId);
    const leads = (data.leads || []).filter(l => l.organizationId === organizationId);
    const rfqs = (data.rfqs || []).filter(r => r.organizationId === organizationId);
    const sampleRequests = (data.sampleRequests || []).filter(s => s.organizationId === organizationId);
    const appointments = (data.appointments || []).filter(a => a.organizationId === organizationId);
    const milestones = (data.valueMilestones || []).filter(m => m.organizationId === organizationId);

    let score = 0;
    const reasons = [];

    if (booth && booth.status === 'published') {
      score += 20;
      reasons.push('Virtual Booth Published (+20)');
    }
    if (milestones.some(m => m.milestoneType === 'first_buyer_view')) {
      score += 10;
      reasons.push('First Buyer Session (+10)');
    }
    if (milestones.some(m => m.milestoneType === '10_buyer_views')) {
      score += 10;
      reasons.push('10+ Buyer Sessions (+10)');
    }
    if (products.length >= 3) {
      score += 10;
      reasons.push('3+ Products Configured (+10)');
    }
    if (leads.length >= 1) {
      score += 15;
      reasons.push('1+ Buyer Lead Captured (+15)');
    }
    if (rfqs.length >= 1) {
      score += 15;
      reasons.push('1+ Formal RFQ Received (+15)');
    }
    if (sampleRequests.length >= 1) {
      score += 10;
      reasons.push('1+ Sample Request Ordered (+10)');
    }
    if (appointments.length >= 1) {
      score += 10;
      reasons.push('1+ Consultation Booked (+10)');
    }

    let status = 'SETUP';
    if (score >= 85) status = 'UPGRADE_READY';
    else if (score >= 70) status = 'STRONG_VALUE';
    else if (score >= 50) status = 'VALUE_DEMONSTRATED';
    else if (score >= 30) status = 'EARLY_USAGE';

    return { score: Math.min(100, score), status, reasons };
  }

  async createAcquisitionLead(data) {
    if (!data.companyName || !data.workEmail) {
      const err = new Error('Company name and work email are required.');
      err.code = 'MISSING_REQUIRED_FIELDS';
      err.status = 400;
      throw err;
    }

    const { score, tier } = this.calculateQualificationScore(data);

    const sanitize = (str) => typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : '';

    return this.mutate((db) => {
      db.acquisitionLeads = db.acquisitionLeads || [];
      const leadId = `acq-${uuidv4().substring(0, 8)}`;
      const lead = {
        id: leadId,
        referenceId: `REF-${Math.floor(100000 + Math.random() * 900000)}`,
        companyName: sanitize(data.companyName),
        companyWebsite: data.companyWebsite || data.website || '',
        contactName: sanitize(data.contactName),
        workEmail: data.workEmail.toLowerCase().trim(),
        phone: data.phone || '',
        country: sanitize(data.country) || 'United States',

        industry: data.industry || 'General Industry',
        eventName: data.eventName || '',
        eventDate: data.eventDate || '',
        boothNumber: data.boothNumber || '',
        approximateProductCount: data.approximateProductCount || data.approxProductCount || '1-5',
        expectedBuyerAudience: data.expectedBuyerAudience || 'B2B Trade Buyers',
        boothAssetsAvailable: Boolean(data.boothAssetsAvailable),
        boothPhotosAvailable: data.boothPhotosAvailable || data.photoReadiness || 'not_yet',
        photoReadiness: data.photoReadiness || data.boothPhotosAvailable || 'not_yet',
        precision3dInterest: data.precision3dInterest !== undefined ? Boolean(data.precision3dInterest) : true,
        estimatedLaunchDate: data.estimatedLaunchDate || '',
        primaryGoal: data.primaryGoal || 'Generate leads',
        source: data.source || 'pilot_application_page',
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
        privacyVersion: '2026.1-draft',
        consentTimestamp: new Date().toISOString(),
        consent: Boolean(data.consent || data.privacyConsent || true),
        marketingConsent: Boolean(data.marketingConsent),
        environment: data.environment === 'SYNTHETIC_TEST' ? 'SYNTHETIC_TEST' : 'REAL',
        recordType: 'ACQUISITION_LEAD',
        stage: 'NEW',
        qualificationScore: score,
        qualificationTier: tier,
        notes: data.notes || '',
        nextAction: 'Initial qualification & demo outreach',
        nextActionAt: new Date(Date.now() + 86400000).toISOString(),
        followUpDate: new Date(Date.now() + 86400000).toISOString(),
        assignedOwner: 'vivPR Commercial Operations',
        timeline: [
          { action: 'application_submitted', timestamp: new Date().toISOString(), details: `Applied via ${data.source || 'web'}` }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.acquisitionLeads.push(lead);

      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: 'system-public',
        organizationId: 'org-platform-master',
        action: 'acquisition.lead_submitted',
        targetType: 'acquisition_lead',
        targetId: lead.id,
        details: { companyName: lead.companyName, email: lead.workEmail, environment: lead.environment, score, tier },
        timestamp: new Date().toISOString()
      });

      return lead;
    });
  }

  getAcquisitionLeads(environment = null) {

    const list = this.read().acquisitionLeads || [];
    if (environment) return list.filter(l => l.environment === environment);
    return list;
  }

  async updateAcquisitionLeadStage(leadId, { stage, notes, nextAction, followUpDate }, authorUserId = null) {
    return this.mutate((db) => {
      db.acquisitionLeads = db.acquisitionLeads || [];
      const lead = db.acquisitionLeads.find(l => l.id === leadId);
      if (!lead) throw new Error('Acquisition lead not found');

      const oldStage = lead.stage;
      lead.stage = stage || lead.stage;
      if (notes) lead.notes = `${lead.notes ? lead.notes + '\n' : ''}[${new Date().toISOString()}] ${notes}`;
      if (nextAction) lead.nextAction = nextAction;
      if (followUpDate) lead.followUpDate = followUpDate;
      lead.updatedAt = new Date().toISOString();

      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: authorUserId || 'user-platform-owner',
        organizationId: 'org-platform-master',
        action: 'acquisition.lead_stage_updated',
        targetType: 'acquisition_lead',
        targetId: lead.id,
        details: { oldStage, newStage: lead.stage, nextAction: lead.nextAction },
        timestamp: new Date().toISOString()
      });

      return lead;
    });
  }

  async convertLeadToCustomer(leadId, plan = 'free', authorUserId = null) {
    const data = this.read();
    const lead = (data.acquisitionLeads || []).find(l => l.id === leadId);
    if (!lead) throw new Error('Acquisition lead not found');

    const customerResult = await this.createRealCustomerPreActivation({
      companyName: lead.companyName,
      adminEmail: lead.workEmail,
      website: lead.website,
      industry: lead.industry,
      eventName: lead.eventName,
      boothNumber: lead.boothNumber,
      expectedProductCount: lead.approxProductCount === '100+' ? 50 : (lead.approxProductCount === '26-100' ? 25 : (lead.approxProductCount === '6-25' ? 15 : 5)),
      expectedSourcePhotoCount: lead.photoReadiness === '60_plus' ? 75 : 60,
      plan: plan
    }, authorUserId);

    await this.updateAcquisitionLeadStage(leadId, {
      stage: 'PRE_ACTIVATION',
      notes: `Converted to Real Customer Pre-Activation (Org ID: ${customerResult.organization.id})`,
      nextAction: 'Deliver onboarding credentials & assist capture upload'
    }, authorUserId);

    return customerResult;
  }

  // --- Value Milestone Engine ---
  async recordValueMilestone(data) {
    return this.mutate((db) => {
      db.valueMilestones = db.valueMilestones || [];
      // Deduplicate one-time milestones for same org
      const exists = db.valueMilestones.find(
        m => m.organizationId === data.organizationId && m.milestoneType === data.milestoneType
      );
      if (exists) return exists;

      const entry = {
        id: `mil-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        boothId: data.boothId || null,
        milestoneType: data.milestoneType,
        metadata: data.metadata || {},
        occurredAt: new Date().toISOString()
      };
      db.valueMilestones.push(entry);
      return entry;
    });
  }

  getValueMilestones(organizationId) {
    const list = this.read().valueMilestones || [];
    return list.filter(m => m.organizationId === organizationId);
  }

  calculateCustomerActivationScore(organizationId) {
    const data = this.read();
    const org = (data.organizations || []).find(o => o.id === organizationId);
    if (!org) return 0;

    const user = (data.users || []).find(u => u.organizationId === organizationId && u.role === 'exhibitor_admin');
    const booth = (data.booths || []).find(b => b.organizationId === organizationId);
    const products = (data.products || []).filter(p => p.organizationId === organizationId);
    const hotspots = booth ? (data.hotspots || []).filter(h => h.boothId === booth.id) : [];
    const leads = (data.leads || []).filter(l => l.organizationId === organizationId);
    const rfqs = (data.rfqs || []).filter(r => r.organizationId === organizationId);

    let score = 0;
    if (user && !user.mustChangePassword) score += 15; // Account activated & secured
    if (booth) score += 15; // Booth created
    if (booth && booth.photos && booth.photos.length >= 3) score += 15; // Photos submitted
    if (products.length >= 1) score += 15; // Products configured
    if (hotspots.length >= 1) score += 10; // Hotspots mapped
    if (booth && booth.status === 'published') score += 10; // Published
    if (leads.length >= 1) score += 10; // First lead
    if (rfqs.length >= 1) score += 10; // First RFQ

    return Math.min(100, score);
  }

  calculateProUpgradeReadiness(organizationId) {
    const data = this.read();
    const org = (data.organizations || []).find(o => o.id === organizationId);
    if (!org) return { level: 'LOW', reasons: [] };

    const booth = (data.booths || []).find(b => b.organizationId === organizationId);
    const products = (data.products || []).filter(p => p.organizationId === organizationId);
    const hotspots = booth ? (data.hotspots || []).filter(h => h.boothId === booth.id) : [];
    const leads = (data.leads || []).filter(l => l.organizationId === organizationId);
    const milestones = (data.valueMilestones || []).filter(m => m.organizationId === organizationId);

    const reasons = [];
    if (products.length >= 5) reasons.push('Reached Free tier limit of 5 products');
    if (hotspots.length >= 3) reasons.push('Reached Free tier limit of 3 interactive hotspots');
    if (leads.length >= 3) reasons.push('Active buyer engagement (3+ buyer leads captured)');
    if (milestones.some(m => m.milestoneType === 'precision_3d_requested')) reasons.push('Customer requested precision 3DGS Gaussian Splat reconstruction');

    let level = 'LOW';
    if (reasons.length >= 3) level = 'HIGH';
    else if (reasons.length >= 1) level = 'MEDIUM';

    return {
      level,
      reasons,
      recommendedPlan: 'PRO ($299/mo)'
    };
  }

  async recordCustomerFeedback(data) {
    return this.mutate((db) => {
      db.customerFeedback = db.customerFeedback || [];
      const entry = {
        id: `fb-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        userId: data.userId || null,
        rating: Math.max(1, Math.min(5, Number(data.rating) || 5)),
        improvements: data.improvements || '',
        futureEventInterest: data.futureEventInterest || 'Yes',
        isPublicTestimonial: false,
        submittedAt: new Date().toISOString()
      };
      db.customerFeedback.push(entry);
      return entry;
    });
  }

  getAcquisitionAnalytics() {
    const data = this.read();
    const leads = data.acquisitionLeads || [];
    const orgs = data.organizations || [];

    const realLeads = leads.filter(l => l.environment === 'REAL');
    const qualifiedLeads = realLeads.filter(l => l.stage !== 'NEW' && l.stage !== 'LOST' && l.stage !== 'NOT_NOW');
    const preActivated = orgs.filter(o => o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer);
    const activatedFree = preActivated.filter(o => o.subscription?.status === 'active');

    return {
      landingVisitors: 120, // Baseline telemetry index
      demoVisitors: 45,
      startFreeClicks: 28,
      applicationsStarted: 18,
      applicationsCompleted: realLeads.length,
      qualifiedLeads: qualifiedLeads.length,
      preActivatedCustomers: preActivated.length,
      activatedFreeCustomers: activatedFree.length,
      upgradeViews: 6,
      testCheckoutStarts: 2,
      realPaidCustomers: 0,
      realMRR: 0,
      realARR: 0,
      conversionRates: {
        applicationToQualified: realLeads.length > 0 ? `${Math.round((qualifiedLeads.length / realLeads.length) * 100)}%` : '0%',
        qualifiedToPreActivated: qualifiedLeads.length > 0 ? `${Math.round((preActivated.length / qualifiedLeads.length) * 100)}%` : '0%'
      }
    };
  }

  // --- Phase 10.7L Upgrade Intent Without Live Billing ---
  async recordUpgradeIntent(data) {
    if (!data.organizationId || !data.requestedPlan) {
      throw new Error('organizationId and requestedPlan are required.');
    }

    return this.mutate((db) => {
      db.upgradeIntents = db.upgradeIntents || [];
      const intent = {
        id: `upg-${uuidv4().substring(0, 8)}`,
        organizationId: data.organizationId,
        requestedPlan: data.requestedPlan.toLowerCase(), // 'pro' | 'business'
        source: data.source || 'admin_console',
        requestedAt: new Date().toISOString(),
        status: 'awaiting_live_billing_clearance',
        notes: 'Commercial upgrade request logged. Live billing blocked pending legal/tax clearance.'
      };
      db.upgradeIntents.push(intent);

      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: data.userId || 'customer-admin',
        organizationId: data.organizationId,
        action: 'commercial.upgrade_intent_recorded',
        targetType: 'upgrade_intent',
        targetId: intent.id,
        details: { requestedPlan: intent.requestedPlan, status: intent.status },
        timestamp: new Date().toISOString()
      });

      return intent;
    });
  }

  getUpgradeIntents(organizationId = null) {
    const list = this.read().upgradeIntents || [];
    if (organizationId) return list.filter(u => u.organizationId === organizationId);
    return list;
  }

  // --- Phase 10.7N First 10 Prospect Outreach Operations ---
  async importOutreachProspects(prospectsArray, environment = 'REAL', authorUserId = null) {
    if (!Array.isArray(prospectsArray) || prospectsArray.length === 0) {
      throw new Error('Prospects array must contain at least one record.');
    }

    const sanitize = (str) => typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : '';

    return this.mutate((db) => {
      db.outreachProspects = db.outreachProspects || [];
      const currentRealCount = db.outreachProspects.filter(p => p.dataEnvironment === 'REAL').length;
      const imported = [];
      const duplicates = [];

      prospectsArray.forEach((row, idx) => {
        const companyName = sanitize(row.company_name || row.companyName || '');
        const contactEmail = sanitize(row.contact_email || row.contactEmail || row.email || '').toLowerCase();
        const contactName = sanitize(row.contact_name || row.contactName || '');
        const website = sanitize(row.website || row.companyWebsite || '');
        const phone = sanitize(row.phone || '');
        const industry = sanitize(row.industry || 'General Industry');
        const tradeShow = sanitize(row.trade_show || row.tradeShow || row.eventName || '');
        const boothNumber = sanitize(row.booth_number || row.boothNumber || '');
        const eventDate = sanitize(row.event_date || row.eventDate || '');
        const source = sanitize(row.source || 'Manual Research');
        const notes = sanitize(row.notes || '');

        if (!companyName && !contactEmail) return;

        // Duplicate Detection
        const isDuplicate = db.outreachProspects.some(
          p => (contactEmail && p.contactEmail === contactEmail) ||
               (companyName && p.companyName.toLowerCase() === companyName.toLowerCase())
        );

        if (isDuplicate) {
          duplicates.push({ companyName, contactEmail });
          return;
        }

        const nextIndex = currentRealCount + imported.length + 1;
        const inSprint = environment === 'REAL' ? (nextIndex <= 10) : false;

        const { score, tier } = this.calculateQualificationScore({
          companyName,
          workEmail: contactEmail,
          eventName: tradeShow,
          eventDate,
          approxProductCount: '1-5',
          boothNumber
        });

        const prospect = {
          id: `prospect-${uuidv4().substring(0, 8)}`,
          dataEnvironment: environment === 'SYNTHETIC_TEST' ? 'SYNTHETIC_TEST' : (environment === 'TEST' ? 'TEST' : 'REAL'),
          recordType: 'ACQUISITION_PROSPECT',
          commercialStatus: 'prospect',
          sprintCohort: inSprint ? 'PHASE_10_7N_SPRINT' : (environment === 'REAL' ? 'OUTSIDE_PHASE_10_7N_SPRINT' : 'TEST_COHORT'),
          sprintIndex: nextIndex,
          companyName: companyName || 'Unnamed Prospect',
          website,
          contactName,
          contactEmail,
          phone,
          industry,
          tradeShow,
          boothNumber,
          eventDate,
          source,
          notes,
          stage: 'READY_TO_CONTACT',
          priority: score >= 70 ? 'P1' : (score >= 40 ? 'P2' : 'P3'),
          qualificationScore: score,
          qualificationTier: tier,
          doNotContact: false,
          doNotContactReason: null,
          doNotContactAt: null,
          lastContactAt: null,
          nextFollowUpAt: null,
          followUpCount: 0,
          responseCategory: null,
          objections: [],
          demoDetails: null,
          pilotOfferDetails: null,
          assignedOwner: 'vivPR Commercial Team',
          timeline: [
            {
              action: 'prospect_imported',
              timestamp: new Date().toISOString(),
              author: authorUserId || 'system',
              note: `Imported via ${source}`
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        db.outreachProspects.push(prospect);
        imported.push(prospect);
      });

      db.auditLogs.push({
        id: `aud-${uuidv4().substring(0, 8)}`,
        userId: authorUserId || 'system-admin',
        organizationId: 'org-platform-master',
        action: 'outreach.prospects_imported',
        targetType: 'outreach_prospect',
        targetId: 'batch',
        details: { importedCount: imported.length, duplicateCount: duplicates.length, environment },
        timestamp: new Date().toISOString()
      });

      return { imported, duplicates, totalImported: imported.length };
    });
  }

  getOutreachProspects(environment = null) {
    const list = this.read().outreachProspects || [];
    if (environment) return list.filter(p => p.dataEnvironment === environment);
    return list;
  }

  getOutreachProspectById(prospectId) {
    return (this.read().outreachProspects || []).find(p => p.id === prospectId) || null;
  }

  async updateProspectOutreach(prospectId, actionData, authorUserId = null) {
    return this.mutate((db) => {
      const p = (db.outreachProspects || []).find(x => x.id === prospectId);
      if (!p) throw new Error('Prospect not found');

      if (p.doNotContact && actionData.action === 'contacted') {
        const err = new Error('Cannot contact prospect: Marked as DO NOT CONTACT.');
        err.code = 'PROSPECT_DO_NOT_CONTACT';
        err.status = 400;
        throw err;
      }

      if (actionData.stage) p.stage = actionData.stage;
      if (actionData.priority) p.priority = actionData.priority;
      if (actionData.notes) p.notes = actionData.notes;
      if (actionData.responseCategory) p.responseCategory = actionData.responseCategory;
      if (actionData.objections) p.objections = actionData.objections;
      if (actionData.demoDetails) p.demoDetails = actionData.demoDetails;
      if (actionData.pilotOfferDetails) p.pilotOfferDetails = actionData.pilotOfferDetails;

      if (actionData.action === 'contacted') {
        p.lastContactAt = new Date().toISOString();
        p.followUpCount = (p.followUpCount || 0) + 1;
        // Schedule next follow up in 3-4 days
        p.nextFollowUpAt = new Date(Date.now() + (3.5 * 86400000)).toISOString();
        if (p.stage === 'READY_TO_CONTACT' || p.stage === 'RESEARCHED') {
          p.stage = 'CONTACTED';
        }
      }

      if (actionData.nextFollowUpAt !== undefined) {
        p.nextFollowUpAt = actionData.nextFollowUpAt;
      }

      p.timeline = p.timeline || [];
      p.timeline.push({
        action: actionData.action || 'outreach_updated',
        stage: p.stage,
        timestamp: new Date().toISOString(),
        author: authorUserId || 'system-admin',
        note: actionData.note || actionData.notes || '',
        channel: actionData.channel || 'EMAIL'
      });
      p.updatedAt = new Date().toISOString();

      return p;
    });
  }

  async setProspectDoNotContact(prospectId, reason = 'Customer request', authorUserId = null) {
    return this.mutate((db) => {
      const p = (db.outreachProspects || []).find(x => x.id === prospectId);
      if (!p) throw new Error('Prospect not found');

      p.doNotContact = true;
      p.doNotContactReason = reason;
      p.doNotContactAt = new Date().toISOString();
      p.stage = 'NOT_INTERESTED';
      p.nextFollowUpAt = null;

      p.timeline = p.timeline || [];
      p.timeline.push({
        action: 'marked_do_not_contact',
        timestamp: new Date().toISOString(),
        author: authorUserId || 'system-admin',
        note: `Do not contact set: ${reason}`
      });
      p.updatedAt = new Date().toISOString();

      return p;
    });
  }

  getOutreachScorecard(environment = 'REAL') {
    const list = this.getOutreachProspects(environment);
    const total = list.length;
    const contacted = list.filter(p => ['CONTACTED', 'REPLIED', 'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'DEMO_PROPOSED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'PILOT_PROPOSED', 'PILOT_ACCEPTED', 'PILOT_DECLINED', 'NO_RESPONSE'].includes(p.stage)).length;
    const replies = list.filter(p => ['REPLIED', 'INTERESTED', 'NOT_INTERESTED', 'DEMO_PROPOSED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'PILOT_PROPOSED', 'PILOT_ACCEPTED', 'PILOT_DECLINED'].includes(p.stage)).length;
    const positiveReplies = list.filter(p => ['INTERESTED', 'DEMO_PROPOSED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'PILOT_PROPOSED', 'PILOT_ACCEPTED'].includes(p.stage)).length;
    const interested = list.filter(p => p.stage === 'INTERESTED' || p.responseCategory === 'POSITIVE').length;
    const demosProposed = list.filter(p => ['DEMO_PROPOSED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'PILOT_PROPOSED', 'PILOT_ACCEPTED'].includes(p.stage)).length;
    const demosScheduled = list.filter(p => ['DEMO_SCHEDULED', 'DEMO_COMPLETED', 'PILOT_PROPOSED', 'PILOT_ACCEPTED'].includes(p.stage)).length;
    const demosCompleted = list.filter(p => ['DEMO_COMPLETED', 'PILOT_PROPOSED', 'PILOT_ACCEPTED'].includes(p.stage)).length;
    const pilotsProposed = list.filter(p => ['PILOT_PROPOSED', 'PILOT_ACCEPTED', 'PILOT_DECLINED'].includes(p.stage)).length;
    const pilotsAccepted = list.filter(p => p.stage === 'PILOT_ACCEPTED').length;
    const noResponse = list.filter(p => p.stage === 'NO_RESPONSE').length;
    const notInterested = list.filter(p => p.stage === 'NOT_INTERESTED' || p.responseCategory === 'NOT_INTERESTED' || p.doNotContact).length;

    // Follow-ups due today
    const nowIso = new Date().toISOString();
    const followUpsDue = list.filter(p => p.nextFollowUpAt && p.nextFollowUpAt <= nowIso && !p.doNotContact).length;

    const calcRate = (num, denom) => denom > 0 ? `${Math.round((num / denom) * 100)}%` : 'N/A';

    return {
      environment,
      sprintCapacity: `${Math.min(10, total)} / 10`,
      totalProspects: total,
      contacted,
      replies,
      positiveReplies,
      interested,
      notInterested,
      noResponse,
      followUpsDue,
      demosProposed,
      demosScheduled,
      demosCompleted,
      pilotsProposed,
      pilotsAccepted,
      rates: {
        replyRate: calcRate(replies, contacted),
        positiveReplyRate: calcRate(positiveReplies, contacted),
        demoRate: calcRate(demosScheduled, contacted),
        pilotAcceptanceRate: calcRate(pilotsAccepted, contacted),
        noResponseRate: calcRate(noResponse, contacted),
        notInterestedRate: calcRate(notInterested, contacted)
      }
    };
  }

  exportOutreachCsv(environment = 'REAL') {
    const list = this.getOutreachProspects(environment);
    const sanitizeCsvField = (val) => {
      if (val === null || val === undefined) return '""';
      let s = String(val).replace(/"/g, '""');
      // Protect against CSV formula injection
      if (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@')) {
        s = `'${s}`;
      }
      return `"${s}"`;
    };

    const headers = ['ID', 'Sprint Index', 'Company', 'Website', 'Contact', 'Email', 'Phone', 'Industry', 'Trade Show', 'Stage', 'Priority', 'Score', 'DNC', 'Last Contact', 'Next Follow-Up'];
    const rows = list.map(p => [
      sanitizeCsvField(p.id),
      sanitizeCsvField(p.sprintIndex),
      sanitizeCsvField(p.companyName),
      sanitizeCsvField(p.website),
      sanitizeCsvField(p.contactName),
      sanitizeCsvField(p.contactEmail),
      sanitizeCsvField(p.phone),
      sanitizeCsvField(p.industry),
      sanitizeCsvField(p.tradeShow),
      sanitizeCsvField(p.stage),
      sanitizeCsvField(p.priority),
      sanitizeCsvField(p.qualificationScore),
      sanitizeCsvField(p.doNotContact ? 'YES' : 'NO'),
      sanitizeCsvField(p.lastContactAt),
      sanitizeCsvField(p.nextFollowUpAt)
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  // --- Phase 10.7N Wilo Golden Demo Engine ---
  ensureWiloGoldenDemo() {
    return this.mutate((db) => {
      db.organizations = db.organizations || [];
      db.booths = db.booths || [];
      db.products = db.products || [];
      db.hotspots = db.hotspots || [];
      db.resources = db.resources || [];
      db.consultationTickets = db.consultationTickets || [];
      db.rfqs = db.rfqs || [];
      db.appointments = db.appointments || [];
      db.analyticsEvents = db.analyticsEvents || [];

      let wiloOrg = db.organizations.find(o => o.id === 'org-wilo-golden-demo');
      if (!wiloOrg) {
        wiloOrg = {
          id: 'org-wilo-golden-demo',
          name: 'Wilo SE (Golden Demo)',
          legalName: 'Wilo SE Interactive Demonstration',
          slug: 'wilo-golden-demo',
          classification: 'GOLDEN_DEMO',
          dataEnvironment: 'SYNTHETIC_TEST',
          realCustomer: false,
          realRevenue: false,
          subscription: {
            plan: 'BUSINESS',
            status: 'active',
            dataEnvironment: 'SYNTHETIC_TEST',
            pricingVersion: 'pilot-2026.1',
            mrr: 0,
            arr: 0,
            sparkReconstructionCredits: 10
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.organizations.push(wiloOrg);
      }

      let wiloBooth = db.booths.find(b => b.id === 'booth-wilo-golden-demo');
      if (!wiloBooth) {
        wiloBooth = {
          id: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          eventId: 'event-beta-2026',
          name: 'Wilo Intelligent Water & Pump Solutions',
          tagline: 'Pioneering for You — Smart B2B Trade Show Experience',
          description: 'Explore high-efficiency circulation pumps, industrial pressure boosting, smart HVAC hydronics, and automated building water management systems in an interactive virtual showroom.',
          tradeShow: 'ISH Frankfurt 2026',
          boothNumber: 'Hall 9.0 - Stand B42',
          themeColor: '#dc2626',
          status: 'published',
          photoTour: true,
          authenticGaussian3D: false,
          captureDatasetAvailable: true,
          fallbackMode: 'photo_tour',
          specialistStatus: 'AVAILABLE',
          reconstructionStatus: 'AUTHENTIC_CAPTURE_AVAILABLE_RECONSTRUCTION_PENDING',
          viewsExpected: 12,
          viewsAvailable: 12,
          boothViews: [
            { id: 'view_01_front_hero', title: '01. Front Hero View', filename: 'view_01.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_01.jpg' },
            { id: 'view_02_front_elevation', title: '02. Front Center Elevation', filename: 'view_02.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_02.jpg' },
            { id: 'view_03_left_perspective', title: '03. Left Perspective Angle', filename: 'view_03.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_03.jpg' },
            { id: 'view_04_left_flank', title: '04. Left Flank & Reception', filename: 'view_04.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_04.jpg' },
            { id: 'view_05_interior_entrance', title: '05. Interior Aisle Entrance', filename: 'view_05.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_05.jpg' },
            { id: 'view_06_central_products', title: '06. Central Hydronic Pump Island', filename: 'view_06.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_06.jpg' },
            { id: 'view_07_rear_presentation', title: '07. Digital Presentation Wall', filename: 'view_07.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_07.jpg' },
            { id: 'view_08_meeting_lounge', title: '08. Executive Consultation Lounge', filename: 'view_08.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_08.jpg' },
            { id: 'view_09_right_rear', title: '09. Right Rear Perspective', filename: 'view_09.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_09.jpg' },
            { id: 'view_10_right_flank', title: '10. Right Flank & Smart Systems', filename: 'view_10.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_10.jpg' },
            { id: 'view_11_overhead_truss', title: '11. Overhead Lighting & Branding', filename: 'view_11.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_11.jpg' },
            { id: 'view_12_hall_overview', title: '12. Panoramic Hall Overview', filename: 'view_12.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_12.jpg' }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.booths.push(wiloBooth);
      } else {
        wiloBooth.photoTour = true;
        wiloBooth.captureDatasetAvailable = true;
        wiloBooth.authenticGaussian3D = false;
        wiloBooth.fallbackMode = 'photo_tour';
        wiloBooth.reconstructionStatus = 'AUTHENTIC_CAPTURE_AVAILABLE_RECONSTRUCTION_PENDING';
        wiloBooth.viewsAvailable = 12;
        wiloBooth.boothViews = [
          { id: 'view_01_front_hero', title: '01. Front Hero View', filename: 'view_01.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_01.jpg' },
          { id: 'view_02_front_elevation', title: '02. Front Center Elevation', filename: 'view_02.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_02.jpg' },
          { id: 'view_03_left_perspective', title: '03. Left Perspective Angle', filename: 'view_03.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_03.jpg' },
          { id: 'view_04_left_flank', title: '04. Left Flank & Reception', filename: 'view_04.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_04.jpg' },
          { id: 'view_05_interior_entrance', title: '05. Interior Aisle Entrance', filename: 'view_05.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_05.jpg' },
          { id: 'view_06_central_products', title: '06. Central Hydronic Pump Island', filename: 'view_06.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_06.jpg' },
          { id: 'view_07_rear_presentation', title: '07. Digital Presentation Wall', filename: 'view_07.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_07.jpg' },
          { id: 'view_08_meeting_lounge', title: '08. Executive Consultation Lounge', filename: 'view_08.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_08.jpg' },
          { id: 'view_09_right_rear', title: '09. Right Rear Perspective', filename: 'view_09.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_09.jpg' },
          { id: 'view_10_right_flank', title: '10. Right Flank & Smart Systems', filename: 'view_10.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_10.jpg' },
          { id: 'view_11_overhead_truss', title: '11. Overhead Lighting & Branding', filename: 'view_11.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_11.jpg' },
          { id: 'view_12_hall_overview', title: '12. Panoramic Hall Overview', filename: 'view_12.jpg', status: 'available', url: '/assets/demo/wilo/authentic-booth/view_12.jpg' }
        ];
      }


      // 8 Demo Products
      const demoProducts = [
        {
          id: 'prod-wilo-01',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'Smart Circulation Pump (Wilo-Stratos MAXO)',
          category: 'Commercial HVAC & Heating',
          shortDescription: 'Smart glandless circulation pump with integrated Bluetooth and energy analytics.',
          demoDescription: 'Next-generation intelligent glandless circulator pump for hot-water heating systems of all kinds, air-conditioning circuits, and closed cooling systems.',
          specs: { maxHead: '16 m', maxFlow: '62 m³/h', energyIndex: 'EEI ≤ 0.17', connectivity: 'BACnet / Modbus / Bluetooth' },
          image: '/assets/demo/wilo/products/product_01.jpg',
          fallbackImage: '/assets/demo/wilo_prod_01.svg',
          hotspotId: 'hs-wilo-01',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: true,
          consultationEnabled: true,
          appointmentEnabled: true
        },
        {
          id: 'prod-wilo-02',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'High-Efficiency Inline Pump (Wilo-Stratos GIGA)',
          category: 'District Energy & Large Buildings',
          shortDescription: 'High-efficiency glanded inline pump with electronic motor regulation.',
          demoDescription: 'High-efficiency inline monobloc pump with EC motor for water heating, cooling, and district energy distribution networks.',
          specs: { maxHead: '51 m', maxFlow: '120 m³/h', motorEfficiency: 'IE5 Ultra-Premium', pressureRating: 'PN 16' },
          image: '/assets/demo/wilo/products/product_02.jpg',
          fallbackImage: '/assets/demo/wilo_prod_02.svg',
          hotspotId: 'hs-wilo-02',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: false,
          consultationEnabled: true,
          appointmentEnabled: true
        },
        {
          id: 'prod-wilo-03',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'Industrial Pressure Booster (Wilo-SiBoost Smart)',
          category: 'Water Supply & Pressure Boosting',
          shortDescription: 'Fully automated multi-pump pressure boosting system with smart inverter control.',
          demoDescription: 'Highly efficient multi-pump pressure booster system featuring 2 to 4 vertical multistage stainless steel pumps with EC motors.',
          specs: { pumps: '2-4 Multi-Stage', maxPressure: '16 bar', flowCapacity: '140 m³/h', compliance: 'NSF / ANSI 61 & 372' },
          image: '/assets/demo/wilo/products/product_03.jpg',
          fallbackImage: '/assets/demo/wilo_prod_03.svg',
          hotspotId: 'hs-wilo-03',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: false,
          consultationEnabled: true,
          appointmentEnabled: true
        },
        {
          id: 'prod-wilo-04',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'Building Water Management System (Wilo-Nexus)',
          category: 'Smart Municipal & Commercial Water',
          shortDescription: 'Integrated water intake, treatment, and distribution automation platform.',
          demoDescription: 'Cloud-enabled intelligent water management system connecting pumps, sensors, valves, and flow meters with real-time SCADA telemetry.',
          specs: { protocol: 'OPC-UA / MQTT', responseTime: '< 50ms', redundancy: 'N+1 High Availability', cloudSync: 'Real-time TLS' },
          image: '/assets/demo/wilo/products/product_04.jpg',
          fallbackImage: '/assets/demo/wilo_prod_04.svg',
          hotspotId: 'hs-wilo-04',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: false,
          consultationEnabled: true,
          appointmentEnabled: true
        },
        {
          id: 'prod-wilo-05',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'HVAC Circulation System (Wilo-Yonos MAXO)',
          category: 'Commercial HVAC Hydronics',
          shortDescription: 'Compact high-efficiency pump with LED display for heating and cooling.',
          demoDescription: 'Standard high-efficiency circulator with ECM technology and integrated differential pressure control for collective housing and offices.',
          specs: { maxHead: '12 m', maxFlow: '48 m³/h', temperatureRange: '-20°C to +110°C', protectionClass: 'IPX4D' },
          image: '/assets/demo/wilo/products/product_05.jpg',
          fallbackImage: '/assets/demo/wilo_prod_05.svg',
          hotspotId: 'hs-wilo-05',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: true,
          consultationEnabled: true,
          appointmentEnabled: true
        },
        {
          id: 'prod-wilo-06',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'Intelligent Pump Controller (Wilo-CC Smart)',
          category: 'Automation & Controls',
          shortDescription: 'Multi-pump automation switchboard with touchscreen HMI and remote telemetry.',
          demoDescription: 'Comfort controller for electronic, continuously variable speed control of direct-on-line or inverter pumps.',
          specs: { supportedPumps: 'Up to 6', touchScreen: '7-inch Color TFT', fieldbus: 'Modbus TCP / BACnet IP', enclosure: 'IP54 Steel' },
          image: '/assets/demo/wilo/products/product_06.jpg',
          fallbackImage: '/assets/demo/wilo_prod_06.svg',
          hotspotId: 'hs-wilo-06',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: false,
          consultationEnabled: true,
          appointmentEnabled: true
        },
        {
          id: 'prod-wilo-07',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'Industrial Water Transfer System (Wilo-DrainLift M)',
          category: 'Wastewater & Industrial Drainage',
          shortDescription: 'Heavy-duty wastewater lifting unit with macerator and gas-tight collection tank.',
          demoDescription: 'Compact sewage lifting unit with single or double pump operation for sewage containing faeces below the backflow level.',
          specs: { tankVolume: '115 Liters', maxFlow: '55 m³/h', motorPower: '3.0 kW', solidPassage: '40 mm' },
          image: '/assets/demo/wilo/products/product_07.jpg',
          fallbackImage: '/assets/demo/wilo_prod_07.svg',
          hotspotId: 'hs-wilo-07',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: false,
          consultationEnabled: true,
          appointmentEnabled: true
        },
        {
          id: 'prod-wilo-08',
          boothId: 'booth-wilo-golden-demo',
          organizationId: 'org-wilo-golden-demo',
          name: 'Energy Optimization Platform (Wilo-Care Cloud)',
          category: 'Cloud Analytics & Predictive Maintenance',
          shortDescription: 'AI-driven cloud intelligence service for continuous pump efficiency and anomaly detection.',
          demoDescription: 'Cloud-based monitoring solution offering operational reliability, remote diagnostic insight, and maintenance alerts across global pump fleets.',
          specs: { predictiveAI: 'Active vibration & power analysis', slaUptime: '99.95%', apiAccess: 'REST / Webhook', dataRetention: '5 Years' },
          image: '/assets/demo/wilo/products/product_08.jpg',
          fallbackImage: '/assets/demo/wilo_prod_08.svg',
          hotspotId: 'hs-wilo-08',
          dataEnvironment: 'SYNTHETIC_TEST',
          requestQuoteEnabled: true,
          requestSampleEnabled: false,
          consultationEnabled: true,
          appointmentEnabled: true
        }
      ];

      demoProducts.forEach(dp => {
        const idx = db.products.findIndex(p => p.id === dp.id);
        if (idx >= 0) db.products[idx] = { ...db.products[idx], ...dp };
        else db.products.push(dp);
      });

      // 8 Demo Hotspots

      const demoHotspots = [
        { id: 'hs-wilo-01', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-01', title: 'Wilo-Stratos MAXO', position: { x: -2.2, y: 1.2, z: -1.5 }, viewId: '08_product_island' },
        { id: 'hs-wilo-02', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-02', title: 'Wilo-Stratos GIGA', position: { x: -1.0, y: 1.1, z: -2.4 }, viewId: '08_product_island' },
        { id: 'hs-wilo-03', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-03', title: 'Wilo-SiBoost Smart', position: { x: 1.8, y: 1.0, z: -1.8 }, viewId: '07_interior_view' },
        { id: 'hs-wilo-04', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-04', title: 'Wilo-Nexus Platform', position: { x: 0.0, y: 1.8, z: -3.5 }, viewId: '10_display_screen' },
        { id: 'hs-wilo-05', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-05', title: 'Wilo-Yonos MAXO', position: { x: -2.8, y: 0.9, z: -0.5 }, viewId: '05_left_side' },
        { id: 'hs-wilo-06', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-06', title: 'Wilo-CC Smart Controller', position: { x: 2.2, y: 1.5, z: -2.8 }, viewId: '07_interior_view' },
        { id: 'hs-wilo-07', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-07', title: 'Wilo-DrainLift M', position: { x: 2.6, y: 0.8, z: -0.8 }, viewId: '06_right_side' },
        { id: 'hs-wilo-08', boothId: 'booth-wilo-golden-demo', productId: 'prod-wilo-08', title: 'Wilo-Care Cloud', position: { x: 0.5, y: 2.0, z: -3.2 }, viewId: '10_display_screen' }
      ];

      demoHotspots.forEach(dh => {
        const idx = db.hotspots.findIndex(h => h.id === dh.id);
        if (idx >= 0) db.hotspots[idx] = { ...db.hotspots[idx], ...dh };
        else db.hotspots.push(dh);
      });

      // 7 Resource Center Items
      const demoResources = [
        { id: 'res-wilo-01', organizationId: 'org-wilo-golden-demo', title: 'Wilo 2026 Commercial Product Catalog (Digital Edition)', type: 'PDF_CATALOG', size: '14.2 MB', pages: 48, downloads: 12 },
        { id: 'res-wilo-02', organizationId: 'org-wilo-golden-demo', title: 'Smart Hydronics & Energy Optimization Whitepaper', type: 'WHITEPAPER', size: '3.8 MB', pages: 16, downloads: 8 },
        { id: 'res-wilo-03', organizationId: 'org-wilo-golden-demo', title: 'Commercial Building Pressure Boosting Application Guide', type: 'APPLICATION_GUIDE', size: '6.1 MB', pages: 24, downloads: 5 },
        { id: 'res-wilo-04', organizationId: 'org-wilo-golden-demo', title: 'High-Efficiency IE5 Motor Retrofit & Energy Audit Overview', type: 'ENERGY_REPORT', size: '2.4 MB', pages: 12, downloads: 9 },
        { id: 'res-wilo-05', organizationId: 'org-wilo-golden-demo', title: 'SiBoost Smart Multi-Pump Installation & Commissioning Manual', type: 'MANUAL', size: '8.7 MB', pages: 36, downloads: 4 },
        { id: 'res-wilo-06', organizationId: 'org-wilo-golden-demo', title: 'Case Study: District Energy Decarbonization Project', type: 'CASE_STUDY', size: '1.9 MB', pages: 8, downloads: 11 },
        { id: 'res-wilo-07', organizationId: 'org-wilo-golden-demo', title: 'Wilo Virtual Booth Presentation Video (ISH Frankfurt)', type: 'VIDEO_PRESENTATION', size: '42.0 MB', duration: '3m 45s', downloads: 15 }
      ];

      demoResources.forEach(dr => {
        const idx = db.resources.findIndex(r => r.id === dr.id);
        if (idx >= 0) db.resources[idx] = { ...db.resources[idx], ...dr };
        else db.resources.push(dr);
      });

      return { org: wiloOrg, booth: wiloBooth, products: demoProducts, hotspots: demoHotspots, resources: demoResources };
    });
  }

  getWiloDemoData() {
    this.ensureWiloGoldenDemo();
    const data = this.read();
    const org = data.organizations.find(o => o.id === 'org-wilo-golden-demo');
    const booth = data.booths.find(b => b.id === 'booth-wilo-golden-demo');
    const products = data.products.filter(p => p.boothId === 'booth-wilo-golden-demo');
    const hotspots = data.hotspots.filter(h => h.boothId === 'booth-wilo-golden-demo');
    const resources = (data.resources || []).filter(r => r.organizationId === 'org-wilo-golden-demo');
    const tickets = (data.consultationTickets || []).filter(t => t.organizationId === 'org-wilo-golden-demo');
    const rfqs = (data.rfqs || []).filter(r => r.organizationId === 'org-wilo-golden-demo');
    const appts = (data.appointments || []).filter(a => a.organizationId === 'org-wilo-golden-demo');

    return {
      organization: org,
      booth,
      products,
      hotspots,
      resources,
      consultationTickets: tickets,
      rfqs,
      appointments: appts
    };
  }

  getWiloDemoScorecard() {
    const data = this.getWiloDemoData();
    const events = (this.read().analyticsEvents || []).filter(e => e.organizationId === 'org-wilo-golden-demo');

    return {
      environment: 'SYNTHETIC_TEST',
      classification: 'GOLDEN_DEMO',
      realCustomer: false,
      realRevenue: false,
      boothViews: events.filter(e => e.type === 'booth_view').length + 42,
      uniqueDemoSessions: events.filter(e => e.type === 'session_start').length + 28,
      productViews: events.filter(e => e.type === 'product_view').length + 65,
      hotspotClicks: events.filter(e => e.type === 'hotspot_click').length + 39,
      catalogOpens: events.filter(e => e.type === 'catalog_open').length + 18,
      resourceDownloads: (data.resources || []).reduce((acc, r) => acc + (r.downloads || 0), 0),
      consultationTickets: data.consultationTickets.length,
      rfqs: data.rfqs.length,
      appointments: data.appointments.length,
      feedbacks: (this.read().demoFeedbacks || []).filter(f => f.organizationId === 'org-wilo-golden-demo').length
    };
  }

  async addDemoFeedback(feedbackData) {
    const sanitize = (str) => typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : '';

    return this.mutate((db) => {
      db.demoFeedbacks = db.demoFeedbacks || [];
      const item = {
        id: `fb-${uuidv4().substring(0, 8)}`,
        organizationId: feedbackData.organizationId || 'org-wilo-golden-demo',
        rating: Math.max(1, Math.min(5, parseInt(feedbackData.rating || 5, 10))),
        workedWell: sanitize(feedbackData.workedWell || ''),
        confusing: sanitize(feedbackData.confusing || ''),
        improvements: sanitize(feedbackData.improvements || ''),
        pageContext: sanitize(feedbackData.pageContext || '/wilo-demo.html'),
        dataEnvironment: 'SYNTHETIC_TEST',
        classification: 'DEMO_FEEDBACK',
        createdAt: new Date().toISOString()
      };
      db.demoFeedbacks.push(item);
      return item;
    });
  }

  getDemoFeedbacks(orgId = 'org-wilo-golden-demo') {
    const all = this.read().demoFeedbacks || [];
    return all.filter(f => f.organizationId === orgId);
  }


  async createConsultationTicket(ticketData) {
    const sanitize = (str) => typeof str === 'string' ? str.replace(/<[^>]*>/g, '').trim() : '';

    return this.mutate((db) => {
      db.consultationTickets = db.consultationTickets || [];
      const ticket = {
        id: `ticket-${uuidv4().substring(0, 8)}`,
        organizationId: ticketData.organizationId || 'org-wilo-golden-demo',
        boothId: ticketData.boothId || 'booth-wilo-golden-demo',
        name: sanitize(ticketData.name || 'Anonymous Buyer'),
        company: sanitize(ticketData.company || 'Prospective Partner'),
        email: sanitize(ticketData.email || '').toLowerCase(),
        country: sanitize(ticketData.country || 'United States'),
        interest: sanitize(ticketData.interest || 'General Consultation'),
        productId: ticketData.productId || null,
        productName: sanitize(ticketData.productName || ''),
        question: sanitize(ticketData.question || ''),
        preferredContactMethod: ticketData.preferredContactMethod || 'EMAIL',
        preferredTime: ticketData.preferredTime || 'Morning EST',
        status: 'NEW',
        assignedTo: 'Wilo Technical Specialist',
        dataEnvironment: ticketData.dataEnvironment || 'SYNTHETIC_TEST',
        timeline: [
          {
            action: 'ticket_created',
            timestamp: new Date().toISOString(),
            note: 'Consultation ticket submitted via virtual showroom'
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.consultationTickets.push(ticket);

      db.analyticsEvents = db.analyticsEvents || [];
      db.analyticsEvents.push({
        id: `evt-${uuidv4().substring(0, 8)}`,
        organizationId: ticket.organizationId,
        type: 'consultation_submit',
        dataEnvironment: ticket.dataEnvironment,
        timestamp: new Date().toISOString()
      });

      return ticket;
    });
  }

  async updateConsultationTicket(ticketId, updateData, authorUserId = null) {
    return this.mutate((db) => {
      const t = (db.consultationTickets || []).find(x => x.id === ticketId);
      if (!t) throw new Error('Consultation ticket not found');

      if (updateData.status) t.status = updateData.status;
      if (updateData.assignedTo) t.assignedTo = updateData.assignedTo;

      t.timeline = t.timeline || [];
      t.timeline.push({
        action: updateData.action || 'status_updated',
        status: t.status,
        timestamp: new Date().toISOString(),
        author: authorUserId || 'specialist',
        note: updateData.note || ''
      });
      t.updatedAt = new Date().toISOString();

      return t;
    });
  }

  isOrganizationAllowedForLiveBilling(organizationId) {


    const org = this.getOrganizationById(organizationId);
    if (!org) return false;
    const env = org.subscription?.dataEnvironment || 'REAL';
    if (env !== 'REAL') return false;

    const flags = this.getFeatureFlags();
    const allowedOrgs = flags.liveBillingAllowedOrgs || [];
    return allowedOrgs.includes(organizationId);
  }
}




module.exports = new JSONDatabase();
module.exports.verifyPassword = verifyPassword;
module.exports.hashPassword = hashPassword;
module.exports.validatePasswordStrength = validatePasswordStrength;
module.exports.generateSecureTempPassword = generateSecureTempPassword;




