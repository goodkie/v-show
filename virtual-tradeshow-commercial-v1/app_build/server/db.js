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
    return { valid: false, message: 'Password is required.' };
  }
  if (password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter (a-z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number (0-9).' };
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


// Default Seed Data (Schema Version 4 — Commercial Beta)
const initialSeedData = () => {
  const orgOrganizerId = 'org-organizer-01';
  const orgApexId = 'org-exhibitor-apex';
  const orgBioId = 'org-exhibitor-bio';

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
    schemaVersion: 4,
    organizations: [
      {
        id: orgOrganizerId,
        type: 'organizer',
        name: 'Global Trade Show Group',
        slug: 'global-trade-show-group',
        status: 'active',
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
    users: [organizerAdminUser, apexAdminUser, bioAdminUser],
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
    ]
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
      } catch (err) {
        console.error('Failed to read db.json, generating fallback state:', err);
        const fallback = initialSeedData();
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

  // Schema Version 3 -> 4 Non-Destructive Migration & Integrity Assurance
  migrateSchema(current) {
    const isOldVersion = !current.schemaVersion || current.schemaVersion < 4;
    const needsEventMigration = !current.events || !current.events.some(e => e.slug);
    const hasMissingCollections = !current.users || current.users.length < 3 || needsEventMigration;

    if (isOldVersion || hasMissingCollections) {
      console.log(`[DB] Migrating schema to version 4 (Multi-Tenant Commercial Beta)...`);


      const defaultOrgId = 'org-exhibitor-apex';
      const defaultOrganizerOrgId = 'org-organizer-01';
      const defaultEventId = 'event-global-tech-2026';

      current.schemaVersion = 4;


      const seed = initialSeedData();

      // 1. Ensure organizations
      current.organizations = current.organizations || [];
      seed.organizations.forEach(so => {
        if (!current.organizations.find(o => o.id === so.id)) {
          current.organizations.push(so);
        }
      });

      // 2. Ensure users
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

      // Atomic save migrated structure
      fs.writeFileSync(DB_FILE, JSON.stringify(current, null, 2), 'utf-8');
      console.log('[DB] Schema version 4 migration successfully applied.');
    }
    return current;
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

      const job = {
        id: `recon-job-${uuidv4().substring(0, 8)}`,
        organizationId: booth.organizationId,
        eventId: booth.eventId,
        boothId: booth.id,
        status: options.requireApproval ? 'awaiting_approval' : 'pending',
        approvalStatus: options.requireApproval ? 'awaiting_approval' : 'approved',
        progress: 0,
        currentStage: options.requireApproval ? 'awaiting_organizer_approval' : 'queued_for_worker',
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
}

module.exports = new JSONDatabase();
module.exports.verifyPassword = verifyPassword;
module.exports.hashPassword = hashPassword;
module.exports.validatePasswordStrength = validatePasswordStrength;
module.exports.generateSecureTempPassword = generateSecureTempPassword;

