const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB state
const initialData = {
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
      createdAt: new Date().toISOString()
    },
    {
      id: 'hs-02',
      boothId: 'booth-demo-01',
      productId: 'prod-02',
      position: { x: 2.6, y: -0.1, z: -3.2 },
      label: 'LiDAR Scanner',
      type: 'product',
      createdAt: new Date().toISOString()
    },
    {
      id: 'hs-03',
      boothId: 'booth-demo-01',
      productId: 'prod-03',
      position: { x: 0.1, y: 1.1, z: -4.8 },
      label: 'Edge Control Hub',
      type: 'product',
      createdAt: new Date().toISOString()
    }
  ],
  leads: [],
  rfqs: [],
  samples: [],
  appointments: []
};

class JSONDatabaseAdapter {
  constructor() {
    this.init();
  }

  init() {
    if (!fs.existsSync(DB_FILE)) {
      this.save(initialData);
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

  save(data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('Error saving to JSON DB:', e);
      return false;
    }
  }

  // Booth operations
  getBooths() {
    return this.read().booths || [];
  }

  getBoothById(id) {
    return this.getBooths().find(b => b.id === id) || null;
  }

  createBooth(boothData) {
    const db = this.read();
    const newBooth = {
      id: `booth-${uuidv4().substring(0, 8)}`,
      exhibitorId: boothData.exhibitorId || 'user-admin-1',
      name: boothData.name || 'Untitled Booth',
      description: boothData.description || '',
      themeColor: boothData.themeColor || '#2563eb',
      status: boothData.status || 'draft',
      reconstructionStatus: boothData.reconstructionStatus || 'photo_preview',
      photos: boothData.photos || [],
      spatialModel: boothData.spatialModel || { type: 'photo_preview', environmentLayout: 'hexagon_booth' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.booths.push(newBooth);
    this.save(db);
    return newBooth;
  }

  updateBooth(id, updateData) {
    const db = this.read();
    const index = db.booths.findIndex(b => b.id === id);
    if (index === -1) return null;
    db.booths[index] = {
      ...db.booths[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.save(db);
    return db.booths[index];
  }

  // Product operations
  getProductsByBoothId(boothId) {
    return (this.read().products || []).filter(p => p.boothId === boothId);
  }

  getProductById(id) {
    return (this.read().products || []).find(p => p.id === id) || null;
  }

  createProduct(productData) {
    const db = this.read();
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
    db.products.push(newProduct);
    this.save(db);
    return newProduct;
  }

  updateProduct(id, updateData) {
    const db = this.read();
    const index = db.products.findIndex(p => p.id === id);
    if (index === -1) return null;
    db.products[index] = {
      ...db.products[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.save(db);
    return db.products[index];
  }

  deleteProduct(id) {
    const db = this.read();
    const initialLen = db.products.length;
    db.products = db.products.filter(p => p.id !== id);
    // Also remove hotspots linked to this product
    db.hotspots = db.hotspots.filter(h => h.productId !== id);
    this.save(db);
    return db.products.length < initialLen;
  }

  // Hotspot operations
  getHotspotsByBoothId(boothId) {
    return (this.read().hotspots || []).filter(h => h.boothId === boothId);
  }

  createHotspot(hotspotData) {
    const db = this.read();
    const newHotspot = {
      id: `hs-${uuidv4().substring(0, 8)}`,
      boothId: hotspotData.boothId,
      productId: hotspotData.productId,
      position: {
        x: Number(hotspotData.position.x) || 0,
        y: Number(hotspotData.position.y) || 0,
        z: Number(hotspotData.position.z) || 0
      },
      label: hotspotData.label || '',
      type: hotspotData.type || 'product',
      createdAt: new Date().toISOString()
    };
    db.hotspots.push(newHotspot);
    this.save(db);
    return newHotspot;
  }

  deleteHotspot(id) {
    const db = this.read();
    const initialLen = db.hotspots.length;
    db.hotspots = db.hotspots.filter(h => h.id !== id);
    this.save(db);
    return db.hotspots.length < initialLen;
  }

  // Engagement operations
  createLead(leadData) {
    const db = this.read();
    const lead = {
      id: `lead-${uuidv4().substring(0, 8)}`,
      ...leadData,
      createdAt: new Date().toISOString()
    };
    db.leads = db.leads || [];
    db.leads.push(lead);
    this.save(db);
    return lead;
  }

  createRFQ(rfqData) {
    const db = this.read();
    const rfq = {
      id: `rfq-${uuidv4().substring(0, 8)}`,
      status: 'new',
      ...rfqData,
      createdAt: new Date().toISOString()
    };
    db.rfqs = db.rfqs || [];
    db.rfqs.push(rfq);
    this.save(db);
    return rfq;
  }

  createSampleRequest(sampleData) {
    const db = this.read();
    const sample = {
      id: `sample-${uuidv4().substring(0, 8)}`,
      ...sampleData,
      createdAt: new Date().toISOString()
    };
    db.samples = db.samples || [];
    db.samples.push(sample);
    this.save(db);
    return sample;
  }

  createAppointment(aptData) {
    const db = this.read();
    const apt = {
      id: `apt-${uuidv4().substring(0, 8)}`,
      status: 'pending',
      ...aptData,
      createdAt: new Date().toISOString()
    };
    db.appointments = db.appointments || [];
    db.appointments.push(apt);
    this.save(db);
    return apt;
  }

  getBoothAnalytics(boothId) {
    const db = this.read();
    const leads = (db.leads || []).filter(l => l.boothId === boothId);
    const rfqs = (db.rfqs || []).filter(r => r.boothId === boothId);
    const samples = (db.samples || []).filter(s => s.boothId === boothId);
    const appointments = (db.appointments || []).filter(a => a.boothId === boothId);

    return {
      boothViews: 142 + (leads.length * 3), // baseline simulation
      productClicks: 89 + (rfqs.length * 2),
      leadsCount: leads.length,
      rfqsCount: rfqs.length,
      samplesCount: samples.length,
      appointmentsCount: appointments.length,
      leads,
      rfqs,
      samples,
      appointments
    };
  }
}

module.exports = new JSONDatabaseAdapter();
