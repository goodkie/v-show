const fs = require('fs');
const srvPath = 'app_build/server/index.js';
let srv = fs.readFileSync(srvPath, 'utf8');

const consultationApis = `
// =====================================================================
// ³DNa-C11.1 Virtual Fitting Room Consultation Intake & Sales Queue API
// =====================================================================
app.post('/api/consultation-requests', async (req, res) => {
  try {
    const { businessName, contactName, email, serviceType, website, productCount, timeline, message } = req.body;

    if (!businessName || !contactName || !email) {
      return res.status(400).json({ success: false, error: 'Business name, contact name, and work email are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Please enter a valid work email address.' });
    }

    const normEmail = email.toLowerCase().trim();
    const cleanBiz = businessName.trim();
    const cleanContact = contactName.trim();
    const cleanService = serviceType || 'AI Virtual Fitting Room';

    const dbData = db.read();
    dbData.consultationRequests = dbData.consultationRequests || [];

    // Duplicate submission suppression (5 second window)
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    const duplicate = dbData.consultationRequests.find(c => 
      c.email === normEmail && 
      c.businessName === cleanBiz && 
      c.createdAt > fiveSecondsAgo
    );

    if (duplicate) {
      return res.status(201).json({
        success: true,
        consultationId: duplicate.consultationId,
        status: duplicate.status,
        message: 'Your consultation request has already been recorded.'
      });
    }

    const consultationId = '3DNA-VFR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const ipHash = db.hashIpAddress ? db.hashIpAddress(req.ip) : 'anon_ip_hash';

    const record = {
      consultationId,
      serviceType: cleanService,
      businessName: cleanBiz,
      contactName: cleanContact,
      email: normEmail,
      website: (website || '').trim(),
      productCount: (productCount || '1 - 10 items').trim(),
      timeline: (timeline || 'Immediate (1-2 weeks)').trim(),
      message: (message || '').trim(),
      source: 'LANDING_VIRTUAL_FITTING_ROOM',
      status: 'NEW',
      ipHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      internalNotes: []
    };

    dbData.consultationRequests.push(record);
    db.write(dbData);

    // Resend Internal Notification
    if (mailer && typeof mailer.sendMail === 'function') {
      const recipient = process.env.DNA_CONSULTATION_EMAIL || 'support@vshow.com';
      try {
        await mailer.sendMail({
          to: recipient,
          subject: \`New ³DNa Virtual Fitting Room Consultation — \${cleanBiz}\`,
          text: \`Consultation ID: \${consultationId}\\nBusiness: \${cleanBiz}\\nContact: \${cleanContact}\\nEmail: \${normEmail}\\nService: \${cleanService}\\nProducts: \${record.productCount}\\nTimeline: \${record.timeline}\\nMessage: \${record.message}\\nSubmitted: \${record.createdAt}\`
        });
      } catch (mailErr) {
        console.warn('Consultation email notification deferred:', mailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      consultationId,
      status: 'NEW',
      message: 'Consultation request recorded successfully.'
    });
  } catch (err) {
    console.error('Error recording consultation:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Internal Sales Queue APIs
app.get('/api/internal/consultations', (req, res) => {
  try {
    const dbData = db.read();
    const consultations = (dbData.consultationRequests || []).slice().reverse();
    res.json({ success: true, count: consultations.length, consultations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/internal/consultations/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, changedBy } = req.body;
    const dbData = db.read();
    const item = (dbData.consultationRequests || []).find(c => c.consultationId === id);

    if (!item) {
      return res.status(404).json({ success: false, error: 'Consultation record not found.' });
    }

    if (status) item.status = status;
    item.updatedAt = new Date().toISOString();

    if (note) {
      item.internalNotes = item.internalNotes || [];
      item.internalNotes.push({
        note: note.trim(),
        author: changedBy || 'Operations Lead',
        createdAt: new Date().toISOString()
      });
    }

    db.write(dbData);
    res.json({ success: true, consultation: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
`;

if (!srv.includes('/api/consultation-requests')) {
  srv = srv.replace('// --- START OF BOOTSTRAP LOGIC ---', `${consultationApis}\n\n// --- START OF BOOTSTRAP LOGIC ---`);
  fs.writeFileSync(srvPath, srv, 'utf8');
  console.log('✅ Consultation routes injected into server/index.js');
}
