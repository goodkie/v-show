/**
 * V-Show Grand Control Center - Platform Operations & Revenue Engine
 */

class GrandControlApp {
  constructor() {
    this.token = localStorage.getItem('vshow_gc_token') || null;
    this.user = null;
    this.currentEnv = 'REAL';
    this.activeTab = 'overview';
    this.customers = [];
    this.selectedMessageId = null;

    this.init();
  }

  async init() {
    this.setupAuthForm();
    if (this.token) {
      await this.verifySession();
    } else {
      this.showAuthModal();
    }
  }

  setupAuthForm() {
    const form = document.getElementById('gc-login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('gc-email').value;
      const password = document.getElementById('gc-password').value;
      const errorBanner = document.getElementById('gc-auth-error');

      try {
        errorBanner.style.display = 'none';
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Authentication failed.');

        if (data.user.role !== 'platform_owner') {
          throw new Error('Access Denied: Platform Owner privileges required.');
        }

        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('vshow_gc_token', this.token);
        this.showDashboard();
      } catch (err) {
        errorBanner.textContent = err.message;
        errorBanner.style.display = 'block';
      }
    });
  }

  async verifySession() {
    try {
      const res = await fetch('/api/platform/overview', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) throw new Error('Session invalid');
      this.showDashboard();
    } catch (e) {
      this.logout();
    }
  }

  showAuthModal() {
    document.getElementById('auth-modal').style.display = 'flex';
    document.getElementById('gc-app').style.display = 'none';
  }

  showDashboard() {
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('gc-app').style.display = 'flex';
    this.refreshAll();
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('vshow_gc_token');
    this.showAuthModal();
  }

  changeEnvironment(env) {
    this.currentEnv = env;
    this.refreshAll();
  }

  setTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.gc-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabName);
    });
    document.querySelectorAll('.gc-tab-pane').forEach(el => {
      el.classList.toggle('active', el.id === `tab-${tabName}`);
    });
    this.loadCurrentTabData();
  }

  async refreshAll() {
    await this.loadOverview();
    this.loadCurrentTabData();
  }

  loadCurrentTabData() {
    switch (this.activeTab) {
      case 'overview':
        this.loadOverview();
        this.loadActivity();
        break;
      case 'customers':
        this.loadCustomers();
        break;
      case 'subscriptions':
        this.loadSubscriptions();
        break;
      case 'outreach':
        this.loadOutreachOperations();
        break;
      case 'pipeline':
        this.loadSalesPipeline();
        break;
      case 'acquisition':
        this.loadAcquisitionAnalytics();
        break;
      case 'visitors':
        this.loadVisitors();

        break;
      case 'reconstructions':
        this.loadReconstructions();
        break;
      case 'communications':
        this.loadCommunications();
        break;
      case 'incidents':
        this.loadIncidentsAndAudit();
        break;
      case 'readiness':
        this.loadLaunchReadiness();
        break;
      case 'settings':
        this.loadSettings();
        break;
    }
  }



  // --- 1. Overview ---
  async loadOverview() {
    try {
      const res = await fetch(`/api/platform/overview?env=${this.currentEnv}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      if (!res.ok) return;

      const k = data.kpis;
      document.getElementById('kpi-total-orgs').textContent = k.totalOrganizations;
      document.getElementById('kpi-sub-breakdown').textContent = `Free: ${k.freeCustomers} | Pro: ${k.proCustomers} | Biz: ${k.businessCustomers}`;
      document.getElementById('kpi-test-mrr').textContent = `$${k.testMrrUsd.toLocaleString()}`;
      document.getElementById('kpi-test-arr').textContent = `Test ARR: $${k.testArrUsd.toLocaleString()}`;
      document.getElementById('kpi-events-booths').textContent = `${k.activeEvents} / ${k.publishedBooths}`;
      document.getElementById('kpi-total-prods').textContent = `${k.totalProducts} Products Registered`;
      document.getElementById('kpi-leads-rfqs').textContent = `${k.totalLeads} / ${k.totalRfqs}`;
      document.getElementById('kpi-recon-count').textContent = `${k.totalReconstructionJobs} Jobs`;
      document.getElementById('kpi-gpu-spend').textContent = `GPU Spend: $${k.totalGpuSpendUsd.toFixed(2)}`;
      document.getElementById('kpi-incidents-count').textContent = `${k.openIncidents} Incidents`;
      document.getElementById('kpi-pending-upgrades').textContent = `${k.pendingUpgrades} Pending Upgrades`;

      // Funnel
      document.getElementById('fn-free').textContent = k.freeCustomers;
      document.getElementById('fn-published').textContent = k.publishedBooths;
      document.getElementById('fn-lead').textContent = k.totalLeads;
      document.getElementById('fn-pro').textContent = k.proCustomers;
      document.getElementById('fn-biz').textContent = k.businessCustomers;

      this.loadWiloDemoTelemetry();
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  }

  async loadWiloDemoTelemetry() {
    try {
      const res = await fetch('/api/platform/wilo-demo/scorecard', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const s = data.scorecard;
      if (!s) return;

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setVal('wilo-stat-views', s.boothViews || 42);
      setVal('wilo-stat-sessions', s.uniqueDemoSessions || 28);
      setVal('wilo-stat-products', s.productViews || 65);
      setVal('wilo-stat-hotspots', s.hotspotClicks || 39);
      setVal('wilo-stat-catalog', s.catalogOpens || 18);
      setVal('wilo-stat-resources', s.resourceDownloads || 68);
      setVal('wilo-stat-tickets', s.consultationTickets || 0);
      setVal('wilo-stat-rfqs', s.rfqs || 0);
    } catch (err) {
      console.error('Failed to load Wilo demo telemetry:', err);
    }
  }


  drawTrafficChart() {
    const canvas = document.getElementById('gc-traffic-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 30; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Generate smooth sine + trend line
    const points = [
      { x: 30, y: 150 },
      { x: 120, y: 120 },
      { x: 210, y: 140 },
      { x: 300, y: 80 },
      { x: 390, y: 95 },
      { x: 480, y: 50 },
      { x: 570, y: 65 },
      { x: 670, y: 35 }
    ];

    // Fill Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.lineTo(points[0].x, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw point dots
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    });
  }

  async loadActivity() {
    try {
      const res = await fetch(`/api/platform/activity?env=${this.currentEnv}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      const feed = document.getElementById('gc-activity-feed');
      if (!feed) return;

      if (!data || data.length === 0) {
        feed.innerHTML = '<div class="gc-text-muted" style="padding: 12px;">No recent activity in selected environment.</div>';
        return;
      }

      feed.innerHTML = data.map(item => `
        <div class="gc-activity-item">
          <div><strong>${escapeHtml(item.action)}</strong> • <span class="gc-text-muted">${escapeHtml(item.targetType || 'item')}</span></div>
          <span class="gc-activity-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
        </div>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  // --- 2. Customers Directory ---
  async loadCustomers() {
    try {
      const res = await fetch(`/api/platform/customers?env=${this.currentEnv}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.customers = await res.json();
      this.renderCustomersTable(this.customers);
    } catch (e) {
      console.error(e);
    }
  }

  renderCustomersTable(list) {
    const tbody = document.getElementById('customers-table-body');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="gc-text-muted" style="text-align: center; padding: 24px;">No customer organizations found.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(c => `
      <tr>
        <td>
          <strong>${escapeHtml(c.name)}</strong><br>
          <small class="gc-text-muted">${escapeHtml(c.slug || c.id)}</small>
        </td>
        <td><span class="gc-kpi-badge">${escapeHtml(c.dataEnvironment)}</span></td>
        <td><span class="gc-kpi-badge ${c.plan === 'pro' ? 'gc-fill-pro' : (c.plan === 'business' ? 'gc-fill-biz' : '')}">${escapeHtml(c.plan.toUpperCase())}</span></td>
        <td>${escapeHtml(c.primaryAdmin)}</td>
        <td>${c.publishedBooths} / ${c.boothsCount}</td>
        <td>${c.productsCount}</td>
        <td>${c.leadsCount} / ${c.rfqsCount}</td>
        <td><span class="gc-status-pill"><span class="gc-dot ${c.status === 'active' ? 'gc-dot-success' : 'gc-dot-warning'}"></span> ${c.status}</span></td>
        <td>
          <button class="gc-btn-sm" onclick="window.gcApp.openCustomer360('${c.id}')">Customer 360</button>
        </td>
      </tr>
    `).join('');
  }

  filterCustomers(query) {
    const q = (query || '').toLowerCase();
    const filtered = this.customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.slug && c.slug.toLowerCase().includes(q)) ||
      c.primaryAdmin.toLowerCase().includes(q)
    );
    this.renderCustomersTable(filtered);
  }

  // --- Customer 360 View ---
  async openCustomer360(orgId) {
    try {
      const res = await fetch(`/api/platform/customers/${orgId}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      if (!res.ok) return;

      const modal = document.getElementById('customer-360-modal');
      document.getElementById('c360-org-name').textContent = data.organization.name;
      document.getElementById('c360-org-slug').textContent = `Org ID: ${data.organization.id} • Environment: ${data.subscription.dataEnvironment}`;

      const body = document.getElementById('c360-modal-body');
      body.innerHTML = `
        <div class="gc-kpi-grid gc-kpi-compact" style="margin-bottom: 20px;">
          <div class="gc-kpi-card">
            <div class="gc-kpi-title">Current Plan</div>
            <div class="gc-kpi-value">${data.subscription.plan.toUpperCase()}</div>
            <div class="gc-kpi-sub">Status: ${data.subscription.status}</div>
          </div>
          <div class="gc-kpi-card">
            <div class="gc-kpi-title">Health Score</div>
            <div class="gc-kpi-value">${data.health.score} / 100</div>
            <div class="gc-kpi-sub">Status: ${data.health.status}</div>
          </div>
          <div class="gc-kpi-card">
            <div class="gc-kpi-title">Products & Hotspots</div>
            <div class="gc-kpi-value">${data.products.length} / ${data.planLimits.maxProducts}</div>
            <div class="gc-kpi-sub">3D Hotspots: Max ${data.planLimits.maxHotspots}</div>
          </div>
          <div class="gc-kpi-card">
            <div class="gc-kpi-title">Precision 3D</div>
            <div class="gc-kpi-value">${data.planLimits.precision3D ? 'ELIGIBLE' : 'LOCKED'}</div>
            <div class="gc-kpi-sub">${data.reconstructionJobs.length} Jobs Total</div>
          </div>
        </div>

        <div class="gc-dashboard-row" style="margin-bottom: 20px;">
          <div class="gc-panel gc-panel-flex1">
            <h4>Plan Override & Entitlements</h4>
            <div class="gc-form">
              <div class="gc-input-group">
                <label>Set Plan Tier</label>
                <select id="c360-override-plan">
                  <option value="free" ${data.subscription.plan === 'free' ? 'selected' : ''}>FREE Tier (5 Products, No 3D)</option>
                  <option value="pro" ${data.subscription.plan === 'pro' ? 'selected' : ''}>PRO Beta Access ($299/mo, Precision 3D)</option>
                  <option value="business" ${data.subscription.plan === 'business' ? 'selected' : ''}>BUSINESS Tier ($799/mo, 100 Products)</option>
                </select>
              </div>
              <button class="gc-btn-primary" onclick="window.gcApp.submitPlanOverride('${data.organization.id}')">Apply Plan Override</button>
            </div>
          </div>

          <div class="gc-panel gc-panel-flex1">
            <h4>Internal Owner Notes</h4>
            <div class="gc-form">
              <textarea id="c360-note-input" rows="3" placeholder="Add confidential internal note..."></textarea>
              <button class="gc-btn-secondary" onclick="window.gcApp.submitOwnerNote('${data.organization.id}')">Save Note</button>
            </div>
          </div>
        </div>

        <div class="gc-panel">
          <h4>Booths & Reconstructions</h4>
          <table class="gc-table">
            <thead><tr><th>Booth</th><th>Status</th><th>Photos</th><th>3D Mode</th></tr></thead>
            <tbody>
              ${data.booths.map(b => `
                <tr>
                  <td><strong>${escapeHtml(b.name)}</strong></td>
                  <td>${b.status}</td>
                  <td>${(b.photos || []).length} photos</td>
                  <td>${b.reconstructionStatus}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      modal.style.display = 'flex';
    } catch (e) {
      console.error(e);
    }
  }

  closeCustomer360() {
    document.getElementById('customer-360-modal').style.display = 'none';
  }

  async submitPlanOverride(orgId) {
    const plan = document.getElementById('c360-override-plan').value;
    try {
      const res = await fetch(`/api/platform/customers/${orgId}/override-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ plan, source: 'manual_beta_override', notes: 'Overridden from Grand Control' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      alert(`Plan successfully updated to ${plan.toUpperCase()}`);
      this.openCustomer360(orgId);
      this.loadCustomers();
    } catch (err) {
      alert(err.message);
    }
  }

  async submitOwnerNote(orgId) {
    const noteText = document.getElementById('c360-note-input').value;
    if (!noteText) return;
    try {
      await fetch(`/api/platform/customers/${orgId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ noteText, category: 'general' })
      });
      alert('Internal note saved.');
      document.getElementById('c360-note-input').value = '';
    } catch (e) {
      console.error(e);
    }
  }

  // --- 3. Subscriptions ---
  async loadSubscriptions() {
    try {
      const res = await fetch(`/api/platform/customers?env=${this.currentEnv}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      const tbody = document.getElementById('subscriptions-table-body');
      if (!tbody) return;

      let activeCount = 0;
      let proCount = 0;
      let bizCount = 0;

      tbody.innerHTML = data.map(c => {
        if (c.plan === 'pro') proCount++;
        if (c.plan === 'business') bizCount++;
        if (c.plan !== 'free') activeCount++;

        return `
          <tr>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td><span class="gc-kpi-badge ${c.plan === 'pro' ? 'gc-fill-pro' : (c.plan === 'business' ? 'gc-fill-biz' : '')}">${escapeHtml(c.plan.toUpperCase())}</span></td>
            <td><span class="gc-status-pill"><span class="gc-dot gc-dot-success"></span> ${c.subscriptionStatus}</span></td>
            <td><code>${escapeHtml(c.id)}</code></td>
            <td><code>sub_test_live_ready</code></td>
            <td><span class="gc-kpi-badge">${escapeHtml(c.dataEnvironment)}</span></td>
            <td>${new Date(c.updatedAt || c.createdAt).toLocaleDateString()}</td>
            <td><button class="gc-btn-sm" onclick="window.gcApp.openCustomer360('${c.id}')">Manage</button></td>
          </tr>
        `;
      }).join('');

      document.getElementById('sub-kpi-active').textContent = activeCount;
      document.getElementById('sub-kpi-pro').textContent = proCount;
      document.getElementById('sub-kpi-biz').textContent = bizCount;
      document.getElementById('sub-kpi-mrr').textContent = `$${((proCount * 299) + (bizCount * 799)).toLocaleString()}`;
    } catch (e) {
      console.error(e);
    }
  }

  // --- 4. Visitors ---
  async loadVisitors() {
    try {
      const res = await fetch(`/api/platform/visitors?env=${this.currentEnv}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      const tbody = document.getElementById('visitors-table-body');
      if (!tbody) return;

      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="gc-text-muted" style="text-align: center; padding: 20px;">No active visitor events recorded.</td></tr>';
        return;
      }

      tbody.innerHTML = data.map(v => `
        <tr>
          <td><code>${escapeHtml(v.sessionId.substring(0, 16))}...</code></td>
          <td><strong>${escapeHtml(v.eventType)}</strong></td>
          <td><span class="gc-kpi-badge">${escapeHtml(v.sourceType)}</span></td>
          <td>${escapeHtml(v.boothId || v.organizationId || 'Lobby')}</td>
          <td><span class="gc-status-pill">${escapeHtml(v.viewerMode)}</span></td>
          <td>${new Date(v.timestamp).toLocaleTimeString()}</td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  // --- 5. Reconstructions ---
  async loadReconstructions() {
    try {
      const res = await fetch(`/api/platform/reconstructions?env=${this.currentEnv}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      const tbody = document.getElementById('reconstructions-table-body');
      if (!tbody) return;

      if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="gc-text-muted" style="text-align: center; padding: 20px;">No reconstruction jobs in queue.</td></tr>';
        return;
      }

      tbody.innerHTML = data.map(j => `
        <tr>
          <td><code>${escapeHtml(j.id)}</code></td>
          <td>${escapeHtml(j.organizationId)}</td>
          <td>${escapeHtml(j.boothId)}</td>
          <td><span class="gc-kpi-badge">${escapeHtml(j.status)}</span></td>
          <td><span class="gc-status-pill"><span class="gc-dot ${j.approvalStatus === 'approved' ? 'gc-dot-success' : 'gc-dot-warning'}"></span> ${j.approvalStatus}</span></td>
          <td>${j.output?.sizeBytes ? `${(j.output.sizeBytes / 1024 / 1024).toFixed(1)} MB` : 'Pending'}</td>
          <td>$${(j.estimatedCostUsd || 0.25).toFixed(2)}</td>
          <td>
            ${j.approvalStatus === 'pending' ? `<button class="gc-btn-sm gc-btn-primary" onclick="window.gcApp.approveJob('${j.id}')">Approve GPU Job</button>` : `<span class="gc-text-muted">Verified</span>`}
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  async approveJob(jobId) {
    try {
      const res = await fetch(`/api/platform/reconstructions/${jobId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        alert('Reconstruction job approved for GPU compute.');
        this.loadReconstructions();
      }
    } catch (e) {
      console.error(e);
    }
  }

  // --- 6. Communications ---
  async loadCommunications() {
    try {
      const res = await fetch('/api/communications/messages', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const messages = await res.json();
      const list = document.getElementById('gc-message-threads');
      if (!list) return;

      if (!messages || messages.length === 0) {
        list.innerHTML = '<div class="gc-text-muted" style="padding: 16px;">No message threads.</div>';
        return;
      }

      list.innerHTML = messages.map(m => `
        <div class="gc-activity-item" style="cursor: pointer;" onclick="window.gcApp.selectMessage('${m.id}')">
          <div>
            <strong>${escapeHtml(m.subject)}</strong><br>
            <small class="gc-text-muted">From: ${escapeHtml(m.senderName)} (${escapeHtml(m.senderRole)})</small>
          </div>
          <span class="gc-kpi-badge">${escapeHtml(m.category)}</span>
        </div>
      `).join('');
    } catch (e) {
      console.error(e);
    }
  }

  async selectMessage(messageId) {
    this.selectedMessageId = messageId;
    try {
      const res = await fetch('/api/communications/messages', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const messages = await res.json();
      const msg = messages.find(m => m.id === messageId);
      if (!msg) return;

      document.getElementById('gc-msg-view-subject').textContent = msg.subject;
      document.getElementById('gc-msg-view-meta').textContent = `From ${msg.senderName} • ${new Date(msg.createdAt).toLocaleString()}`;

      const bodyContainer = document.getElementById('gc-msg-view-body');
      let html = `<div style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: 8px; margin-bottom: 14px;">${escapeHtml(msg.body)}</div>`;

      if (msg.replies && msg.replies.length > 0) {
        html += msg.replies.map(r => `
          <div style="background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; padding: 10px 14px; border-radius: 4px; margin-bottom: 10px;">
            <strong style="font-size: 12px; color: #60a5fa;">${escapeHtml(r.senderName)} (${escapeHtml(r.senderRole)})</strong>
            <p style="margin: 4px 0 0 0; font-size: 13px;">${escapeHtml(r.body)}</p>
          </div>
        `).join('');
      }

      bodyContainer.innerHTML = html;
      document.getElementById('gc-reply-box').style.display = 'flex';
    } catch (e) {
      console.error(e);
    }
  }

  async sendReply() {
    if (!this.selectedMessageId) return;
    const body = document.getElementById('gc-reply-input').value;
    if (!body) return;

    try {
      const res = await fetch(`/api/communications/messages/${this.selectedMessageId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ body })
      });
      if (res.ok) {
        document.getElementById('gc-reply-input').value = '';
        this.selectMessage(this.selectedMessageId);
      }
    } catch (e) {
      console.error(e);
    }
  }

  openBroadcastModal() {
    document.getElementById('broadcast-modal').style.display = 'flex';
  }

  closeBroadcastModal() {
    document.getElementById('broadcast-modal').style.display = 'none';
  }

  async submitBroadcast() {
    const targetType = document.getElementById('bc-target-type').value;
    const targetEnvironment = document.getElementById('bc-target-env').value;
    const category = document.getElementById('bc-category').value;
    const subject = document.getElementById('bc-subject').value;
    const body = document.getElementById('bc-body').value;

    if (!subject || !body) {
      alert('Subject and body are required.');
      return;
    }

    try {
      const res = await fetch('/api/communications/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          targetType,
          targetEnvironment,
          category,
          subject,
          body
        })
      });
      if (res.ok) {
        alert('Broadcast message dispatched successfully.');
        this.closeBroadcastModal();
        this.loadCommunications();
      }
    } catch (e) {
      alert('Failed to send broadcast');
    }
  }

  // --- 7. Incidents & Audit Log ---
  async loadIncidentsAndAudit() {
    try {
      const [resInc, resAud] = await Promise.all([
        fetch('/api/platform/incidents', { headers: { 'Authorization': `Bearer ${this.token}` } }),
        fetch('/api/platform/audit-logs', { headers: { 'Authorization': `Bearer ${this.token}` } })
      ]);

      const incidents = await resInc.json();
      const audits = await resAud.json();

      const incTbody = document.getElementById('incidents-table-body');
      if (incTbody) {
        incTbody.innerHTML = incidents.length === 0
          ? '<tr><td colspan="4" class="gc-text-muted" style="text-align: center;">Zero incidents recorded.</td></tr>'
          : incidents.map(i => `
            <tr>
              <td><span class="gc-kpi-badge ${i.severity === 'high' ? 'gc-dot-warning' : ''}">${escapeHtml(i.severity)}</span></td>
              <td>${escapeHtml(i.category)}</td>
              <td>${escapeHtml(i.message)}</td>
              <td>${new Date(i.timestamp).toLocaleTimeString()}</td>
            </tr>
          `).join('');
      }

      const audTbody = document.getElementById('audit-table-body');
      if (audTbody) {
        audTbody.innerHTML = audits.length === 0
          ? '<tr><td colspan="4" class="gc-text-muted" style="text-align: center;">No audit logs.</td></tr>'
          : audits.map(a => `
            <tr>
              <td><strong>${escapeHtml(a.action)}</strong></td>
              <td>${escapeHtml(a.targetType || 'item')}</td>
              <td>${escapeHtml(a.userId || 'system')}</td>
              <td>${new Date(a.timestamp).toLocaleTimeString()}</td>
            </tr>
          `).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }

  // --- 8. Live Launch Readiness Checklist ---
  async loadLaunchReadiness() {
    try {
      const res = await fetch('/api/platform/launch-readiness', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      if (!res.ok) return;

      const badge = document.getElementById('readiness-overall-badge');
      if (badge) {
        badge.textContent = data.overallStatus === 'LIVE_READY'
          ? '🎉 LIVE LAUNCH READY'
          : `⚠️ COMMERCIAL GOVERNANCE (${data.commercialGovernance?.readinessScore || '7/10'} READY)`;
        badge.className = data.overallStatus === 'LIVE_READY' ? 'gc-badge gc-badge-active' : 'gc-badge gc-badge-warning';
      }

      document.getElementById('readiness-live-mode').textContent = data.stripeLiveMode ? 'LIVE MODE (Active)' : 'OFF (Test Mode)';
      document.getElementById('readiness-pricing-status').textContent = data.pricingStatus.toUpperCase();
      document.getElementById('readiness-legal-status').textContent = data.legalReviewStatus.toUpperCase();
      document.getElementById('readiness-owner-auth').textContent = data.liveBillingApprovedByOwner ? 'APPROVED' : 'BLOCKED (Pending Owner Action)';

      // Commercial Governance KPIs
      const gov = data.commercialGovernance;
      if (gov) {
        const polEl = document.getElementById('gov-policy-versions');
        if (polEl) polEl.textContent = gov.policyVersions?.termsVersion || 'v2026.1-draft';

        const prEl = document.getElementById('gov-pricing-class');
        if (prEl) prEl.textContent = `${gov.pricingGovernance?.classification || 'PILOT'} ($299/$799)`;

        const idEl = document.getElementById('gov-business-identity');
        if (idEl) {
          idEl.textContent = gov.businessIdentity?.isComplete ? 'COMPLETE' : 'INCOMPLETE';
          idEl.style.color = gov.businessIdentity?.isComplete ? '#34d399' : '#f87171';
        }


        const taxEl = document.getElementById('gov-tax-readiness');
        if (taxEl) {
          taxEl.textContent = gov.taxReadiness?.status.toUpperCase() || 'REVIEW_REQUIRED';
          taxEl.style.color = gov.taxReadiness?.status === 'ready' ? '#34d399' : '#fbbf24';
        }

        // Blockers Table
        const blockTbody = document.getElementById('blockers-table-body');
        if (blockTbody && gov.blockers) {
          blockTbody.innerHTML = gov.blockers.map(b => `
            <tr>
              <td><strong>${escapeHtml(b.name)}</strong></td>
              <td>
                <span class="gc-status-pill ${b.state === 'READY' ? 'gc-dot-online' : (b.state === 'OFF' ? 'gc-text-muted' : 'gc-dot-warning')}">
                  ${escapeHtml(b.state)}
                </span>
              </td>
              <td class="gc-text-muted">${escapeHtml(b.detail)}</td>
            </tr>
          `).join('');
        }
      }

      const tbody = document.getElementById('readiness-table-body');
      if (tbody && data.checklist) {
        tbody.innerHTML = data.checklist.map(item => `
          <tr>
            <td><span class="gc-badge">${escapeHtml(item.category)}</span></td>
            <td><strong>${escapeHtml(item.item)}</strong></td>
            <td><span class="gc-badge ${item.status === 'READY' ? 'gc-badge-verified' : 'gc-badge-test'}">${escapeHtml(item.status)}</span></td>
            <td class="gc-text-muted">${escapeHtml(item.detail)}</td>
          </tr>
        `).join('');
      }

      await this.loadPreActivationGovernance();
    } catch (e) {
      console.error(e);
    }
  }


  // --- 9. Settings & Export ---
  async loadSettings() {
    try {
      const res = await fetch('/api/platform/feature-flags', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const flags = await res.json();
      document.getElementById('flag-billingKillSwitch').checked = Boolean(flags.billingKillSwitch);
      document.getElementById('flag-reconstructionKillSwitch').checked = Boolean(flags.reconstructionKillSwitch);
      document.getElementById('flag-maintenanceMode').checked = Boolean(flags.maintenanceMode);

      document.getElementById('flag-stripeBillingEnabled').checked = Boolean(flags.stripeBillingEnabled);
      document.getElementById('flag-precision3DEnabled').checked = Boolean(flags.precision3DEnabled);
      document.getElementById('flag-communicationsEnabled').checked = Boolean(flags.communicationsEnabled);
      document.getElementById('flag-businessPlanEnabled').checked = Boolean(flags.businessPlanEnabled);
    } catch (e) {
      console.error(e);
    }
  }

  async saveFeatureFlags() {
    const flags = {
      billingKillSwitch: document.getElementById('flag-billingKillSwitch').checked,
      reconstructionKillSwitch: document.getElementById('flag-reconstructionKillSwitch').checked,
      maintenanceMode: document.getElementById('flag-maintenanceMode').checked,
      stripeBillingEnabled: document.getElementById('flag-stripeBillingEnabled').checked,
      precision3DEnabled: document.getElementById('flag-precision3DEnabled').checked,
      communicationsEnabled: document.getElementById('flag-communicationsEnabled').checked,
      businessPlanEnabled: document.getElementById('flag-businessPlanEnabled').checked
    };

    try {
      const res = await fetch('/api/platform/feature-flags', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(flags)
      });
      if (res.ok) alert('Feature flags and emergency kill switches updated successfully.');
    } catch (e) {
      alert('Failed to save feature flags');
    }
  }


  downloadCsv(type) {
    window.open(`/api/platform/export?type=${type}&env=${this.currentEnv}`, '_blank');
  }

  // --- Phase 10.7 First Real Customer Wizard & Governance ---
  openFirstCustomerWizard() {
    const modal = document.getElementById('first-customer-wizard-modal');
    if (modal) {
      modal.style.display = 'flex';
      this.setWizardStep(1);
    }
  }

  closeFirstCustomerWizard() {
    const modal = document.getElementById('first-customer-wizard-modal');
    if (modal) modal.style.display = 'none';
  }

  setWizardStep(step) {
    for (let i = 1; i <= 5; i++) {
      const pane = document.getElementById(`wiz-step-${i}`);
      const pill = document.getElementById(`wiz-step-pill-${i}`);
      if (pane) pane.style.display = i === step ? 'block' : 'none';
      if (pill) {
        if (i === step) pill.className = 'gc-badge gc-badge-active';
        else if (i < step) pill.className = 'gc-badge gc-badge-verified';
        else pill.className = 'gc-badge';
      }
    }
  }

  async submitFirstCustomerPreActivation() {
    const errDiv = document.getElementById('wiz-submit-error');
    const submitBtn = document.getElementById('wiz-submit-btn');
    if (errDiv) errDiv.style.display = 'none';

    const payload = {
      companyName: document.getElementById('wiz-company-name').value.trim(),
      adminEmail: document.getElementById('wiz-admin-email').value.trim(),
      website: document.getElementById('wiz-website').value.trim(),
      industry: document.getElementById('wiz-industry').value.trim(),
      country: document.getElementById('wiz-country-state').value.trim(),
      eventName: document.getElementById('wiz-event-name').value.trim(),
      eventStartDate: document.getElementById('wiz-event-start').value,
      eventEndDate: document.getElementById('wiz-event-end').value,
      boothNumber: document.getElementById('wiz-booth-number').value.trim(),
      boothCategory: document.getElementById('wiz-booth-category').value.trim(),
      expectedProductCount: Number(document.getElementById('wiz-expected-products').value) || 5,
      expectedHotspotCount: Number(document.getElementById('wiz-expected-hotspots').value) || 3,
      expectedSourcePhotoCount: Number(document.getElementById('wiz-expected-photos').value) || 60,
      photoDatasetPath: document.getElementById('wiz-photo-path').value.trim(),
      plan: document.getElementById('wiz-plan-select').value
    };

    if (!payload.companyName || !payload.adminEmail) {
      if (errDiv) {
        errDiv.textContent = 'Company Name and Admin Email are required.';
        errDiv.style.display = 'block';
      }
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating REAL Customer...';

      const res = await fetch('/api/platform/first-customer/pre-activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Pre-activation failed');
      }

      alert(`✅ First REAL Customer Pre-Activated Successfully!\n\nCompany: ${data.organization.name}\nAdmin Email: ${data.user.email}\nTemporary Password: ${data.tempPasswordForDisplay}\n\nPlease provide these credentials securely to the customer admin.`);
      this.closeFirstCustomerWizard();
      this.loadOverview();
      this.loadOrganizations();
      this.loadReadiness();
    } catch (err) {
      if (errDiv) {
        errDiv.textContent = `❌ ${err.message}`;
        errDiv.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Create REAL Customer';
    }
  }

  async loadPreActivationGovernance() {
    try {
      // 1. Launch Board
      const lbRes = await fetch('/api/platform/first-customer/launch-board', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (lbRes.ok) {
        const lb = await lbRes.json();
        const grid = document.getElementById('launch-board-grid');
        if (grid && lb.cards) {
          grid.innerHTML = lb.cards.map(c => `
            <div class="gc-kpi-card" style="border-top: 3px solid ${c.status === 'READY' ? '#10b981' : (c.status === 'PENDING' ? '#f59e0b' : '#ef4444')};">
              <div class="gc-kpi-label">${escapeHtml(c.title)}</div>
              <div class="gc-kpi-value" style="font-size: 15px; color: ${c.status === 'READY' ? '#10b981' : (c.status === 'PENDING' ? '#f59e0b' : '#ef4444')};">${escapeHtml(c.status)}</div>
              <div class="gc-kpi-sub">${escapeHtml(c.detail)}</div>
            </div>
          `).join('');
        }
      }

      // 2. Pre-Activation Checklist (13 items)
      const clRes = await fetch('/api/platform/first-customer/checklist', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (clRes.ok) {
        const cl = await clRes.json();
        const tbody = document.getElementById('preactivation-checklist-body');
        if (tbody && cl.items) {
          tbody.innerHTML = cl.items.map(i => `
            <tr>
              <td><strong>${escapeHtml(i.name)}</strong></td>
              <td><span class="gc-badge">${escapeHtml(i.id)}</span></td>
              <td><span class="gc-badge ${i.status === 'READY' ? 'gc-badge-verified' : (i.status === 'PENDING' ? 'gc-badge-test' : 'gc-badge-error')}">${escapeHtml(i.status)}</span></td>
              <td class="gc-text-muted">${escapeHtml(i.detail)}</td>
            </tr>
          `).join('');
        }
      }

      // 3. Stripe Live Pre-Flight
      const pfRes = await fetch('/api/platform/first-customer/preflight', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (pfRes.ok) {
        const pf = await pfRes.json();
        const badge = document.getElementById('preflight-readiness-badge');
        const list = document.getElementById('preflight-checks-list');
        if (badge) {
          badge.textContent = pf.readinessStatus;
          badge.className = pf.readinessStatus === 'READY_FOR_OWNER_APPROVAL' ? 'gc-badge gc-badge-active' : 'gc-badge gc-badge-error';
        }
        if (list && pf.checks) {
          list.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">
              ${pf.checks.map(c => `
                <div style="background:#1e293b; padding:8px 12px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                  <span>${escapeHtml(c.name)}:</span>
                  <span style="font-weight:600; color:${c.pass ? '#10b981' : '#f59e0b'};">${escapeHtml(c.value)}</span>
                </div>
              `).join('')}
            </div>
          `;
        }
      }
    } catch (e) {
      console.error('Failed to load pre-activation governance:', e);
    }
  }

  // --- Phase 10.7R Sales Pipeline & Acquisition Funnel ---
  async loadSalesPipeline() {
    try {
      const res = await fetch('/api/platform/acquisition/leads', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await res.json();
      const tbody = document.getElementById('pipeline-leads-tbody');
      if (!tbody) return;

      if (!data.leads || data.leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="gc-text-muted" style="text-align:center; padding:24px;">No acquisition leads submitted yet.</td></tr>';
        return;
      }

      tbody.innerHTML = data.leads.map(l => `
        <tr>
          <td>
            <strong>${escapeHtml(l.companyName)}</strong><br>
            <small class="gc-text-muted">${escapeHtml(l.workEmail)}</small><br>
            <span style="font-size:10px; color:#38bdf8; font-family:monospace;">${escapeHtml(l.referenceId || l.id)}</span>
          </td>
          <td>
            ${escapeHtml(l.eventName || 'N/A')}<br>
            <small class="gc-text-muted">Booth: ${escapeHtml(l.boothNumber || 'N/A')}</small>
          </td>
          <td>
            ${escapeHtml(l.approximateProductCount || l.approxProductCount || '1-5')} Prods<br>
            <small class="gc-text-muted">Photos: ${escapeHtml(l.photoReadiness || 'not_yet')}</small><br>
            <span class="gc-badge ${l.qualificationScore >= 70 ? 'gc-badge-verified' : (l.qualificationScore >= 40 ? 'gc-badge-test' : 'gc-badge')}">
              Score: ${l.qualificationScore || 0}/100 (${escapeHtml(l.qualificationTier || 'EARLY')})
            </span>
          </td>
          <td>
            <select class="gc-select-sm" onchange="window.gcApp.updateLeadStage('${l.id}', this.value)" style="background:#1e293b; color:#fff; border:1px solid #334155; padding:4px 8px; border-radius:4px;">
              ${['NEW', 'CONTACTED', 'QUALIFIED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'PILOT_OFFERED', 'PRE_ACTIVATION', 'ACTIVATED', 'NOT_NOW', 'LOST'].map(s => `
                <option value="${s}" ${l.stage === s ? 'selected' : ''}>${s}</option>
              `).join('')}
            </select>
          </td>
          <td class="gc-text-muted" style="font-size:12px;">
            ${escapeHtml(l.nextAction || 'Follow-up pending')}
          </td>
          <td>
            ${l.stage !== 'PRE_ACTIVATION' && l.stage !== 'ACTIVATED' ? `
              <button class="gc-btn-sm gc-btn-primary" onclick="window.gcApp.convertLeadToPreActivation('${l.id}')">Convert to Pilot</button>
            ` : `<span class="gc-badge gc-badge-verified">Converted</span>`}
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Failed to load sales pipeline:', e);
    }
  }


  async updateLeadStage(leadId, stage) {
    try {
      const res = await fetch(`/api/platform/acquisition/leads/${leadId}/stage`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ stage })
      });
      if (res.ok) {
        this.loadSalesPipeline();
      }
    } catch (e) {
      console.error('Failed to update lead stage:', e);
    }
  }

  async convertLeadToPreActivation(leadId) {
    if (!confirm('Convert this qualified lead to Real Customer Pre-Activation? (Quota: 1 Customer)')) return;

    try {
      const res = await fetch(`/api/platform/acquisition/leads/${leadId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ plan: 'pro' })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`❌ Conversion Failed: ${data.error}`);
        return;
      }

      alert(`🎉 Customer Pre-Activated Successfully!\n\nCompany: ${data.organization.name}\nAdmin: ${data.user.email}\nTemporary Password: ${data.tempPasswordForDisplay}`);
      this.loadSalesPipeline();
      this.loadOverview();
      this.loadOrganizations();
      this.loadReadiness();
    } catch (e) {
      alert('Error converting lead to customer');
    }
  }

  async loadAcquisitionAnalytics() {
    try {
      const res = await fetch('/api/platform/acquisition/analytics', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('acq-landing-visitors').textContent = data.landingVisitors;
      document.getElementById('acq-apps-completed').textContent = data.applicationsCompleted;
      document.getElementById('acq-conv-app').textContent = `${data.conversionRates?.applicationToQualified || '0%'} to qualified`;
      document.getElementById('acq-qualified-leads').textContent = data.qualifiedLeads;
      document.getElementById('acq-preactivated').textContent = `${data.preActivatedCustomers} / 1`;

      const playbook = document.getElementById('playbook-checklist');
      if (playbook) {
        const steps = [
          { name: '1. Public Landing Page Traffic', done: data.landingVisitors > 0 },
          { name: '2. Demo Booth Exploration', done: data.demoVisitors > 0 },
          { name: '3. Start Free Application Submitted', done: data.applicationsCompleted > 0 },
          { name: '4. Commercial Lead Qualified', done: data.qualifiedLeads > 0 },
          { name: '5. Real Customer Pre-Activation Created', done: data.preActivatedCustomers > 0 },
          { name: '6. Onboarding Credentials Delivered', done: data.preActivatedCustomers > 0 },
          { name: '7. Booth Setup & Products Configured', done: false },
          { name: '8. 60–100 Booth Photos Uploaded', done: false },
          { name: '9. Pre-flight Capture QA Approved', done: false },
          { name: '10. GPU 3DGS Reconstruction Executed', done: false },
          { name: '11. Customer Reviews 3D Booth', done: false },
          { name: '12. Virtual Booth Published to Lobby', done: false },
          { name: '13. First Buyer Lead / RFQ Engagement', done: false },
          { name: '14. Value Milestone Recorded', done: false },
          { name: '15. Contextual PRO Recommendation', done: false },
          { name: '16. Stripe Test Checkout Rehearsal Completed', done: false }
        ];

        playbook.innerHTML = `
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:13px;">
            ${steps.map(s => `
              <div style="display:flex; align-items:center; gap:8px; color: ${s.done ? '#34d399' : '#94a3b8'};">
                <span>${s.done ? '✅' : '⏳'}</span>
                <span>${escapeHtml(s.name)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (e) {
      console.error('Failed to load acquisition analytics:', e);
    }
  // --- Phase 10.7N First 10 Prospect Outreach Operations ---
  async loadOutreachOperations() {
    try {
      const [prospectsRes, scorecardRes] = await Promise.all([
        fetch('/api/platform/outreach/prospects?environment=REAL', { headers: { 'Authorization': `Bearer ${this.token}` } }),
        fetch('/api/platform/outreach/scorecard?environment=REAL', { headers: { 'Authorization': `Bearer ${this.token}` } })
      ]);

      const pData = await prospectsRes.json();
      const sData = await scorecardRes.json();
      const sc = sData.scorecard || {};

      // Update KPIs
      const capEl = document.getElementById('outreach-sprint-capacity');
      if (capEl) capEl.textContent = sc.sprintCapacity || '0 / 10';
      const conEl = document.getElementById('outreach-contacted-count');
      if (conEl) conEl.textContent = sc.contacted || 0;
      const repEl = document.getElementById('outreach-replies-count');
      if (repEl) repEl.textContent = sc.replies || 0;
      const repRateEl = document.getElementById('outreach-reply-rate');
      if (repRateEl) repRateEl.textContent = `${sc.rates?.replyRate || 'N/A'} reply rate`;
      const demEl = document.getElementById('outreach-demos-count');
      if (demEl) demEl.textContent = sc.demosScheduled || 0;
      const demRateEl = document.getElementById('outreach-demo-rate');
      if (demRateEl) demRateEl.textContent = `${sc.rates?.demoRate || 'N/A'} demo rate`;
      const pilEl = document.getElementById('outreach-pilots-count');
      if (pilEl) pilEl.textContent = sc.pilotsAccepted || 0;
      const pilRateEl = document.getElementById('outreach-pilot-rate');
      if (pilRateEl) pilRateEl.textContent = `${sc.rates?.pilotAcceptanceRate || 'N/A'} acceptance`;
      const fuEl = document.getElementById('outreach-followups-due');
      if (fuEl) fuEl.textContent = sc.followUpsDue || 0;

      // Render Table
      const tbody = document.getElementById('outreach-prospects-tbody');
      if (!tbody) return;

      const list = pData.prospects || [];
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="gc-text-muted" style="text-align:center; padding:24px;">No REAL outreach prospects loaded yet. Click "Import Prospects" or use CSV template.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map((p, idx) => `
        <tr style="${p.doNotContact ? 'opacity:0.6;' : ''}">
          <td>
            <span style="font-family:monospace; color:#38bdf8; font-size:11px;">#${p.sprintIndex || (idx + 1)}</span>
            <strong>${escapeHtml(p.companyName)}</strong><br>
            <small class="gc-text-muted">${escapeHtml(p.website || 'No website')}</small>
            ${p.sprintCohort === 'OUTSIDE_PHASE_10_7N_SPRINT' ? '<span class="gc-badge">Outside Sprint</span>' : ''}
          </td>
          <td>
            <strong>${escapeHtml(p.contactName || 'Trade Show Team')}</strong><br>
            <small class="gc-text-muted">${escapeHtml(p.contactEmail)}</small><br>
            <span style="font-size:11px; color:#cbd5e1;">${escapeHtml(p.tradeShow || 'Industry Event')} (Booth: ${escapeHtml(p.boothNumber || 'N/A')})</span>
          </td>
          <td>
            <span class="gc-badge ${p.qualificationScore >= 70 ? 'gc-badge-verified' : 'gc-badge'}">Score: ${p.qualificationScore || 0}/100</span>
            <span class="gc-badge gc-badge-${p.priority === 'P1' ? 'error' : (p.priority === 'P2' ? 'warning' : 'info')}">${escapeHtml(p.priority || 'P2')}</span>
            ${p.doNotContact ? '<span class="gc-badge gc-badge-error">DNC</span>' : ''}
          </td>
          <td>
            <select class="gc-select-sm" onchange="window.gcApp.updateProspectStage('${p.id}', this.value)" style="background:#1e293b; color:#fff; border:1px solid #334155; padding:4px 8px; border-radius:4px;">
              ${['READY_TO_CONTACT', 'CONTACTED', 'REPLIED', 'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'DEMO_PROPOSED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'PILOT_PROPOSED', 'PILOT_ACCEPTED', 'PILOT_DECLINED', 'NO_RESPONSE'].map(s => `
                <option value="${s}" ${p.stage === s ? 'selected' : ''}>${s}</option>
              `).join('')}
            </select>
          </td>
          <td class="gc-text-muted" style="font-size:12px;">
            Last: ${p.lastContactAt ? new Date(p.lastContactAt).toLocaleDateString() : 'Never'}<br>
            Next: ${p.nextFollowUpAt ? new Date(p.nextFollowUpAt).toLocaleDateString() : 'None'}
          </td>
          <td>
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              <button class="gc-btn-sm gc-btn-primary" onclick="window.gcApp.openEmailAssistant('${p.id}', 'initial')">✉ Copy Email</button>
              <button class="gc-btn-sm gc-btn-secondary" onclick="window.gcApp.markProspectContacted('${p.id}')">✓ Mark Sent</button>
              ${!p.doNotContact ? `
                <button class="gc-btn-sm" style="background:#7f1d1d; color:#fca5a5; border:none;" onclick="window.gcApp.markProspectDnc('${p.id}')">DNC</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Failed to load outreach operations:', e);
    }
  }

  async updateProspectStage(prospectId, stage) {
    try {
      const res = await fetch(`/api/platform/outreach/prospects/${prospectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ stage, action: 'stage_updated', note: `Stage changed to ${stage}` })
      });
      if (res.ok) this.loadOutreachOperations();
    } catch (e) {
      console.error('Failed to update prospect stage:', e);
    }
  }

  async markProspectContacted(prospectId) {
    try {
      const res = await fetch(`/api/platform/outreach/prospects/${prospectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ action: 'contacted', note: 'Initial outreach or follow-up email sent via manual client' })
      });
      if (res.ok) {
        alert('Marked as contacted. Next follow-up automatically scheduled in 3-4 days.');
        this.loadOutreachOperations();
      }
    } catch (e) {
      alert('Error updating prospect');
    }
  }

  async markProspectDnc(prospectId) {
    if (!confirm('Mark prospect as DO NOT CONTACT? All future outreach will be blocked.')) return;
    try {
      const res = await fetch(`/api/platform/outreach/prospects/${prospectId}/dnc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ reason: 'Manual operator mark' })
      });
      if (res.ok) {
        alert('Prospect marked as DO NOT CONTACT.');
        this.loadOutreachOperations();
      }
    } catch (e) {
      alert('Error marking DNC');
    }
  }

  exportProspectsCsv() {
    window.open(`/api/platform/outreach/export?token=${encodeURIComponent(this.token)}`, '_blank');
  }

  openEmailAssistant(prospectId, templateType) {
    // Copies outreach copy to clipboard
    const subject = "Free Virtual Booth Pilot for Your Next Trade Show";
    const body = `Hi,\n\nI'm reaching out from vivPR.\n\nWe've built V-Show, a platform that turns a physical trade-show booth into an interactive online showroom.\n\nBuyers can revisit the booth after the event, explore products, request quotes, request samples, schedule meetings, and contact your team.\n\nWe're currently inviting a small number of exhibitors to try a free virtual booth pilot.\n\nNo credit card is required.\n\nIf you have an upcoming or recently completed trade show, we'd be happy to show you a demo and explain how the pilot works.\n\nWould you be open to a short walkthrough?\n\nBest,\nvivPR\ninfo@vivpr.pro`;

    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    alert('Outreach subject and body copied to clipboard! You can paste into Gmail/Outlook.');
  }

}



function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  window.gcApp = new GrandControlApp();
});
