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

      this.drawTrafficChart();
    } catch (e) {
      console.error('Failed to load overview:', e);
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
            <td><span class="gc-kpi-badge">${escapeHtml(item.category)}</span></td>
            <td><strong>${escapeHtml(item.title)}</strong></td>
            <td>
              <span class="gc-status-pill ${item.status === 'READY' ? 'gc-dot-online' : (item.status === 'OFF' ? 'gc-text-muted' : 'gc-dot-warning')}">
                ${escapeHtml(item.status)}
              </span>
            </td>
            <td class="gc-text-muted">${escapeHtml(item.detail)}</td>
          </tr>
        `).join('');
      }
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
