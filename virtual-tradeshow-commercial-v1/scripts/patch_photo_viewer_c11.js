const fs = require('fs');
const viewerPath = 'app_build/client/photo-viewer.html';
let html = fs.readFileSync(viewerPath, 'utf8');

// 1. RFQ Buyer Modal 추가
const rfqModalHtml = `
  <!-- RFQ Buyer Tool Modal -->
  <div id="rfq-buyer-modal" class="modal-overlay" style="display: none;">
    <div class="modal-card" style="max-width: 440px; background: #0b1329; border: 1px solid rgba(56,189,248,0.3); border-radius: 16px; padding: 24px; color: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 18px; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-file-invoice-dollar"></i> Request Wholesale Quote
        </h3>
        <button style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;" onclick="closeRfqModal()">&times;</button>
      </div>
      <p style="font-size: 13px; color: #94a3b8; margin-bottom: 18px;">Submit your inquiry directly to the exhibitor. Fast response guaranteed.</p>
      <form onsubmit="handleRfqSubmit(event)">
        <div style="margin-bottom: 12px;">
          <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:4px;">Your Full Name *</label>
          <input type="text" id="rfq-name" required placeholder="e.g. Alex Morgan" style="width:100%; height:40px; background:#070e1b; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:4px;">Company Name *</label>
          <input type="text" id="rfq-company" required placeholder="e.g. Pacific Retail Global" style="width:100%; height:40px; background:#070e1b; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:4px;">Work Email *</label>
          <input type="email" id="rfq-email" required placeholder="e.g. alex@pacificretail.com" style="width:100%; height:40px; background:#070e1b; border:1px solid #1e293b; border-radius:8px; padding:0 12px; color:#fff; font-size:14px; box-sizing: border-box;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display:block; font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:4px;">Message / Inquiry Details</label>
          <textarea id="rfq-message" rows="3" placeholder="Target order quantity, delivery timeline, or spec requests..." style="width:100%; background:#070e1b; border:1px solid #1e293b; border-radius:8px; padding:8px 12px; color:#fff; font-size:13px; box-sizing: border-box;"></textarea>
        </div>
        <div id="rfq-status-msg" style="display:none; font-size:12px; margin-bottom:12px; font-weight:700;"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn-ui" onclick="closeRfqModal()">Cancel</button>
          <button type="submit" class="btn-ui" id="btn-submit-rfq" style="background: linear-gradient(135deg, #0284c7, #0369a1); color:#fff; font-weight:800; border-color:#38bdf8;">
            <i class="fa-solid fa-paper-plane"></i> Send Request
          </button>
        </div>
      </form>
    </div>
  </div>
`;

if (!html.includes('id="rfq-buyer-modal"')) {
  html = html.replace('</body>', `${rfqModalHtml}\n</body>`);
}

// 2. C11 Upgrade Modal 업데이트 (PRO & BUSINESS 선택)
const upgradeModalHtml = `
  <div id="upgrade-experience-modal" class="modal-overlay" style="display: none;">
    <div class="modal-card" style="max-width: 520px; background: #0b1329; border: 1px solid rgba(245,158,11,0.4); border-radius: 16px; padding: 26px; color: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h3 style="font-size: 20px; font-weight: 800; color: #f59e0b; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-bolt"></i> Make This Booth Live
        </h3>
        <button style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;" onclick="closeUpgradeModal()">&times;</button>
      </div>
      <p style="font-size: 13.5px; color: #94a3b8; margin-bottom: 20px; line-height: 1.5;">
        Activate commercial publishing, uncap product slots, and enable real buyer lead capture.
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
        <div id="plan-card-pro" onclick="selectPlan('PRO')" style="border: 2px solid #38bdf8; background: rgba(56,189,248,0.08); border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 4px;">PRO</div>
          <div style="font-size: 22px; font-weight: 900; color: #38bdf8; margin-bottom: 8px;">$299<span style="font-size: 12px; color: #94a3b8; font-weight: 500;">/mo</span></div>
          <ul style="font-size: 11.5px; color: #cbd5e1; padding-left: 16px; margin: 0; line-height: 1.6;">
            <li>1 Commercial Booth</li>
            <li>10 Product Pinpoints</li>
            <li>Real RFQ Lead Capture</li>
            <li>Standard Analytics</li>
          </ul>
        </div>

        <div id="plan-card-biz" onclick="selectPlan('BUSINESS')" style="border: 2px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 4px;">BUSINESS</div>
          <div style="font-size: 22px; font-weight: 900; color: #f59e0b; margin-bottom: 8px;">$799<span style="font-size: 12px; color: #94a3b8; font-weight: 500;">/mo</span></div>
          <ul style="font-size: 11.5px; color: #cbd5e1; padding-left: 16px; margin: 0; line-height: 1.6;">
            <li>3 Commercial Booths</li>
            <li>Unlimited Products</li>
            <li>Custom Domain URL</li>
            <li>Priority CRM Export</li>
          </ul>
        </div>
      </div>

      <div id="upgrade-status-msg" style="display:none; font-size:12px; margin-bottom:14px; font-weight:700;"></div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="btn-ui" onclick="closeUpgradeModal()">Cancel</button>
        <button type="button" class="btn-ui upgrade" id="btn-confirm-checkout" onclick="startStripeCheckout()" style="background: linear-gradient(135deg, #d97706, #b45309); font-weight: 800; border-color: #f59e0b;">
          <i class="fa-solid fa-lock"></i> Proceed to Secure Checkout →
        </button>
      </div>
    </div>
  </div>
`;

html = html.replace(/<div id="upgrade-experience-modal"[\s\S]*?<\/div>\s*<\/div>/m, upgradeModalHtml);

// 3. Client JS: RFQ & Stripe Checkout Functions
const c11ClientJs = `
let selectedUpgradePlan = 'PRO';

function selectPlan(plan) {
  selectedUpgradePlan = plan;
  const proCard = document.getElementById('plan-card-pro');
  const bizCard = document.getElementById('plan-card-biz');
  if (plan === 'PRO') {
    proCard.style.borderColor = '#38bdf8';
    proCard.style.background = 'rgba(56,189,248,0.08)';
    bizCard.style.borderColor = 'rgba(255,255,255,0.1)';
    bizCard.style.background = 'rgba(255,255,255,0.03)';
  } else {
    bizCard.style.borderColor = '#f59e0b';
    bizCard.style.background = 'rgba(245,158,11,0.08)';
    proCard.style.borderColor = 'rgba(255,255,255,0.1)';
    proCard.style.background = 'rgba(255,255,255,0.03)';
  }
}

async function startStripeCheckout() {
  const btn = document.getElementById('btn-confirm-checkout');
  const msg = document.getElementById('upgrade-status-msg');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing Checkout...';

  try {
    const res = await fetch(\`/api/free-funnel/projects/\${CURRENT_PROJECT_ID}/create-checkout-session\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedPlan: selectedUpgradePlan })
    });
    const data = await res.json();
    if (data.success && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      msg.style.display = 'block';
      msg.style.color = '#f87171';
      msg.textContent = data.error || 'Unable to start checkout. Please try again.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-lock"></i> Proceed to Secure Checkout →';
    }
  } catch (e) {
    msg.style.display = 'block';
    msg.style.color = '#f87171';
    msg.textContent = e.message;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Proceed to Secure Checkout →';
  }
}

function openRfqModal() {
  const modal = document.getElementById('rfq-buyer-modal');
  if (modal) modal.style.display = 'flex';
}

function closeRfqModal() {
  const modal = document.getElementById('rfq-buyer-modal');
  if (modal) modal.style.display = 'none';
}

async function handleRfqSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-rfq');
  const msg = document.getElementById('rfq-status-msg');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

  const body = {
    name: document.getElementById('rfq-name').value,
    company: document.getElementById('rfq-company').value,
    email: document.getElementById('rfq-email').value,
    message: document.getElementById('rfq-message').value,
    productId: 'PROD-01',
    productName: 'Featured Product'
  };

  try {
    const res = await fetch(\`/api/public/booths/\${CURRENT_PROJECT_ID}/rfq\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      msg.style.display = 'block';
      msg.style.color = '#4ade80';
      msg.textContent = '✅ Quote request submitted successfully!';
      setTimeout(() => { closeRfqModal(); }, 2000);
    } else {
      msg.style.display = 'block';
      msg.style.color = '#f87171';
      msg.textContent = data.error || 'Failed to submit quote request.';
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Request';
    }
  } catch (err) {
    msg.style.display = 'block';
    msg.style.color = '#f87171';
    msg.textContent = err.message;
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Request';
  }
}
`;

if (!html.includes('startStripeCheckout')) {
  html = html.replace('</script>', `${c11ClientJs}\n</script>`);
}

fs.writeFileSync(viewerPath, html, 'utf8');
console.log('✅ photo-viewer.html updated with RFQ Buyer Modal and C11 Checkout flow');
