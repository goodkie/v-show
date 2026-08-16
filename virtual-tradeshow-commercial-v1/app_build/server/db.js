const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TEMP_DB_FILE = path.join(DATA_DIR, 'db.temp.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB state (Schema Version 2)
const initialData = {
  schemaVersion: 2,
  booths: [
    {
      id: 'booth-demo-01',
      exhibitorId: 'user-admin-1',
      name: 'Apex Robotics Global Innovation',
      description: 'Next-generation industrial automation, smart robotics, and precision logistics solutions for modern manufacturing.',
      themeColor: '#0f766e',
      status: 'published',
      reconstructionStatus: 'photo_preview',
      photos: [
        'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80'
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
      specifications: {
        'Payload': '15 kg',
        'Reach': '1300 mm',
        'Repeatability': '±0.02 mm',
        'Power Rating': '48V DC / 600W',
        'Safety Certs': 'ISO 10218-1, CE'
      },
      sampleAvailable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'prod-02',
      boothId: 'booth-demo-01',
      name: 'OmniVision 3D Spatial LiDAR Scanner',
      sku: 'LDR-3D-SP1',
      category: 'Sensors',
      moq: 5,
      price: 3200,
      contactForPrice: false,
      currency: 'USD',
      description: 'Ultra-wide angle real-time 3D point cloud scanner for autonomous factory navigation and AGV fleet management.',
      images: [
        'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80'
      ],
      specifications: {
        'Range': '0.1m ~ 120m',
        'Field of View': '360° Horiz / 90° Vert',
        'Sampling Rate': '1.2M points/sec',
        'Protection': 'IP67 Waterproof'
      },
      sampleAvailable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'prod-03',
      boothId: 'booth-demo-01',
      name: 'CyberGrid Edge AI Control Hub',
      sku: 'EDG-HUB-PRO',
      category: 'Control Systems',
      moq: 1,
      price: null,
      contactForPrice: true,
      currency: 'USD',
      description: 'Ruggedized DIN-rail industrial edge computing node powered by 275 TOPS AI neural processing unit.',
      images: [
        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80'
      ],
      specifications: {
        'Compute': '275 TOPS NPU + 16-Core ARM',
        'Connectivity': 'Quad 10GbE + Dual 5G Redundant',
        'Operating Temp': '-40°C ~ +85°C'
      },
      sampleAvailable: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  hotspots: [
    {
      id: 'hs-01',
      boothId: 'booth-demo-01',
      productId: 'prod-01',
      position: { x: -2.8, y: 0.2, z: -3.5 },
      label: 'Cobot Arm X9',
      type: 'product',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'hs-02',
      boothId: 'booth-demo-01',
      productId: 'prod-02',
      position: { x: 2.6, y: -0.1, z: -3.2 },
      label: 'LiDAR Scanner',
      type: 'product',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'hs-03',
      boothId: 'booth-demo-01',
      productId: 'prod-03',
      position: { x: 0.1, y: 1.1, z: -4.8 },
      label: 'Edge Control Hub',
      type: 'product',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  events: [],
  leads: [],
  rfqs: [],
  samples: [],
  appointments: []
};

class JSONDatabaseAdapter {
  constructor() {
    this.writeQueue = Promise.resolve();
    this.init();
  }

  init() {
    if (!fs.existsSync(DB_FILE)) {
      this.saveSync(initialData);
    } else {
      // Migrate older versions if needed
      const current = this.read();
      if (!current.schemaVersion || current.schemaVersion < 2) {
        current.schemaVersion = 2;
        current.events = current.events || [];
        (current.hotspots || []).forEach(h => {
          if (!h.updatedAt) h.updatedAt = h.createdAt || new Date().toISOString();
        });
        this.saveSync(current);
      }
    }
  }

  read() {
    try {
      if (!fs.existsSync(DB_FILE)) {
        return initialData;
      }
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error reading JSON DB, falling back to initial data:', e);
      return initialData;
    }
  }

  // Atomic write using temp file + atomic rename
  saveSync(data) {
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      fs.writeFileSync(TEMP_DB_FILE, jsonStr, 'utf8');
      fs.renameSync(TEMP_DB_FILE, DB_FILE);
      return true;
    } catch (e) {
      console.error('Error in atomic saveSync:', e);
      return false;
    }
  }

  // In-process serialized write queue for concurrency safety
  async mutate(callback) {
    return new Promise((resolve, reject) => {
      this.writeQueue = this.writeQueue.then(async () => {
        try {
          const db = this.read();
          const result = await callback(db);
          this.saveSync(db);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }).catch(err => {
        console.error('Mutation queue error:', err);
        reject(err);
      });
    });
  }

  // --- Booth Operations ---
  getBooths(includeDrafts = true) {
    const booths = this.read().booths || [];
    if (includeDrafts) return booths;
    return booths.filter(b => b.status === 'published');
  }

  getBoothById(id, includeDrafts = true) {
    const booth = (this.read().booths || []).find(b => b.id === id);
    if (!booth) return null;
    if (!includeDrafts && booth.status !== 'published') return null;
    return booth;
  }

  async createBooth(boothData) {
    return this.mutate((db) => {
      const newBooth = {
        id: `booth-${uuidv4().substring(0, 8)}`,
        exhibitorId: boothData.exhibitorId || 'user-admin-1',
        name: boothData.name || 'Untitled Booth',
        description: boothData.description || '',
        themeColor: boothData.themeColor || '#0284c7',
        status: boothData.status || 'draft',
        reconstructionStatus: boothData.reconstructionStatus || 'photo_preview',
        photos: boothData.photos || [],
        spatialModel: boothData.spatialModel || { type: 'photo_preview', environmentLayout: 'hexagon_booth' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.booths = db.booths || [];
      db.booths.push(newBooth);
      return newBooth;
    });
  }

  async updateBooth(id, updateData) {
    return this.mutate((db) => {
      const index = (db.booths || []).findIndex(b => b.id === id);
      if (index === -1) return null;
      db.booths[index] = {
        ...db.booths[index],
        ...updateData,
        updatedAt: new Date().toISOString()
      };
      return db.booths[index];
    });
  }

  // --- Product Operations ---
  getProductsByBoothId(boothId) {
    return (this.read().products || []).filter(p => p.boothId === boothId);
  }

  getProductById(id) {
    return (this.read().products || []).find(p => p.id === id) || null;
  }

  async createProduct(productData) {
    return this.mutate((db) => {
      const boothExists = (db.booths || []).some(b => b.id === productData.boothId);
      if (!boothExists) {
        throw new Error('Associated booth not found');
      }

      const newProduct = {
        id: `prod-${uuidv4().substring(0, 8)}`,
        boothId: productData.boothId,
        name: productData.name || 'Untitled Product',
        sku: productData.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
        category: productData.category || 'General',
        moq: Number(productData.moq) || 1,
        price: productData.contactForPrice ? null : (Number(productData.price) || 0),
        contactForPrice: Boolean(productData.contactForPrice),
        currency: productData.currency || 'USD',
        description: productData.description || '',
        images: productData.images || [],
        specifications: productData.specifications || {},
        sampleAvailable: Boolean(productData.sampleAvailable),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.products = db.products || [];
      db.products.push(newProduct);
      return newProduct;
    });
  }

  async updateProduct(id, updateData) {
    return this.mutate((db) => {
      const index = (db.products || []).findIndex(p => p.id === id);
      if (index === -1) return null;
      db.products[index] = {
        ...db.products[index],
        ...updateData,
        updatedAt: new Date().toISOString()
      };
      return db.products[index];
    });
  }

  async deleteProduct(id) {
    return this.mutate((db) => {
      const initialLen = (db.products || []).length;
      db.products = (db.products || []).filter(p => p.id !== id);
      // Clean up linked hotspots
      db.hotspots = (db.hotspots || []).filter(h => h.productId !== id);
      return db.products.length < initialLen;
    });
  }

  // --- Hotspot Operations ---
  getHotspotsByBoothId(boothId) {
    return (this.read().hotspots || []).filter(h => h.boothId === boothId);
  }

  getHotspotById(id) {
    return (this.read().hotspots || []).find(h => h.id === id) || null;
  }

  async createHotspot(hotspotData) {
    return this.mutate((db) => {
      // Validate booth
      const booth = (db.booths || []).find(b => b.id === hotspotData.boothId);
      if (!booth) throw new Error('Booth does not exist');

      // Validate product and product-booth association
      const product = (db.products || []).find(p => p.id === hotspotData.productId);
      if (!product) throw new Error('Product does not exist');
      if (product.boothId !== hotspotData.boothId) {
        throw new Error('Product does not belong to this booth');
      }

      const newHotspot = {
        id: `hs-${uuidv4().substring(0, 8)}`,
        boothId: hotspotData.boothId,
        productId: hotspotData.productId,
        position: {
          x: Number(Number(hotspotData.position.x).toFixed(3)) || 0,
          y: Number(Number(hotspotData.position.y).toFixed(3)) || 0,
          z: Number(Number(hotspotData.position.z).toFixed(3)) || 0
        },
        label: hotspotData.label || product.name,
        type: hotspotData.type || 'product', // supports: product | video | catalog | information
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.hotspots = db.hotspots || [];
      db.hotspots.push(newHotspot);
      return newHotspot;
    });
  }

  async updateHotspot(id, updateData) {
    return this.mutate((db) => {
      const index = (db.hotspots || []).findIndex(h => h.id === id);
      if (index === -1) return null;

      if (updateData.productId) {
        const product = (db.products || []).find(p => p.id === updateData.productId);
        if (!product || product.boothId !== db.hotspots[index].boothId) {
          throw new Error('Invalid product association for hotspot');
        }
      }

      const updatedPosition = updateData.position ? {
        x: Number(Number(updateData.position.x).toFixed(3)) || 0,
        y: Number(Number(updateData.position.y).toFixed(3)) || 0,
        z: Number(Number(updateData.position.z).toFixed(3)) || 0
      } : db.hotspots[index].position;

      db.hotspots[index] = {
        ...db.hotspots[index],
        ...updateData,
        position: updatedPosition,
        updatedAt: new Date().toISOString()
      };
      return db.hotspots[index];
    });
  }

  async deleteHotspot(id) {
    return this.mutate((db) => {
      const initialLen = (db.hotspots || []).length;
      db.hotspots = (db.hotspots || []).filter(h => h.id !== id);
      return db.hotspots.length < initialLen;
    });
  }

  // --- Real Analytics & Events Operations ---
  async recordEvent(eventData) {
    return this.mutate((db) => {
      const event = {
        id: `evt-${uuidv4().substring(0, 8)}`,
        boothId: eventData.boothId,
        productId: eventData.productId || null,
        sessionId: eventData.sessionId || null,
        type: eventData.type,
        metadata: eventData.metadata || {},
        createdAt: new Date().toISOString()
      };
      db.events = db.events || [];
      db.events.push(event);
      return event;
    });
  }

  // --- Engagement Operations ---
  async createLead(leadData) {
    return this.mutate((db) => {
      const lead = {
        id: `lead-${uuidv4().substring(0, 8)}`,
        ...leadData,
        createdAt: new Date().toISOString()
      };
      db.leads = db.leads || [];
      db.leads.push(lead);
      // Record server-side event
      db.events = db.events || [];
      db.events.push({
        id: `evt-${uuidv4().substring(0, 8)}`,
        boothId: lead.boothId,
        productId: lead.productId || null,
        type: 'lead_capture',
        metadata: { leadId: lead.id, company: lead.company },
        createdAt: new Date().toISOString()
      });
      return lead;
    });
  }

  async createRFQ(rfqData) {
    return this.mutate((db) => {
      const rfq = {
        id: `rfq-${uuidv4().substring(0, 8)}`,
        status: 'new',
        ...rfqData,
        createdAt: new Date().toISOString()
      };
      db.rfqs = db.rfqs || [];
      db.rfqs.push(rfq);
      // Record server-side event
      db.events = db.events || [];
      db.events.push({
        id: `evt-${uuidv4().substring(0, 8)}`,
        boothId: rfq.boothId,
        productId: rfq.productId,
        type: 'rfq_submit',
        metadata: { rfqId: rfq.id, quantity: rfq.quantity },
        createdAt: new Date().toISOString()
      });
      return rfq;
    });
  }

  async createSampleRequest(sampleData) {
    return this.mutate((db) => {
      const sample = {
        id: `sample-${uuidv4().substring(0, 8)}`,
        ...sampleData,
        createdAt: new Date().toISOString()
      };
      db.samples = db.samples || [];
      db.samples.push(sample);
      // Record server-side event
      db.events = db.events || [];
      db.events.push({
        id: `evt-${uuidv4().substring(0, 8)}`,
        boothId: sample.boothId,
        productId: sample.productId,
        type: 'sample_request',
        metadata: { sampleId: sample.id, quantity: sample.quantity },
        createdAt: new Date().toISOString()
      });
      return sample;
    });
  }

  async createAppointment(aptData) {
    return this.mutate((db) => {
      const apt = {
        id: `apt-${uuidv4().substring(0, 8)}`,
        status: 'pending',
        ...aptData,
        createdAt: new Date().toISOString()
      };
      db.appointments = db.appointments || [];
      db.appointments.push(apt);
      // Record server-side event
      db.events = db.events || [];
      db.events.push({
        id: `evt-${uuidv4().substring(0, 8)}`,
        boothId: apt.boothId,
        type: 'appointment_request',
        metadata: { appointmentId: apt.id, requestedTime: apt.requestedTime },
        createdAt: new Date().toISOString()
      });
      return apt;
    });
  }

  getBoothAnalytics(boothId) {
    const db = this.read();
    const events = (db.events || []).filter(e => e.boothId === boothId);
    const leads = (db.leads || []).filter(l => l.boothId === boothId);
    const rfqs = (db.rfqs || []).filter(r => r.boothId === boothId);
    const samples = (db.samples || []).filter(s => s.boothId === boothId);
    const appointments = (db.appointments || []).filter(a => a.boothId === boothId);

    // Compute REAL counts without simulated baseline
    const boothViews = events.filter(e => e.type === 'booth_view').length;
    const productViews = events.filter(e => e.type === 'product_view' || e.type === 'product_click').length;
    const hotspotClicks = events.filter(e => e.type === 'hotspot_click').length;

    return {
      boothViews,
      productViews,
      hotspotClicks,
      leadsCount: leads.length,
      rfqsCount: rfqs.length,
      samplesCount: samples.length,
      appointmentsCount: appointments.length,
      leads,
      rfqs,
      samples,
      appointments,
      recentEvents: events.slice(-20).reverse()
    };
  }
}

module.exports = new JSONDatabaseAdapter();
