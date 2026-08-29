const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const indexHtmlPath = path.join(baseDir, 'app_build', 'client', 'index.html');
let html = fs.readFileSync(indexHtmlPath, 'utf8');

// 1. planModal 버튼에 handlePlanSelection(..., this) 전달
html = html.replace(`onclick="handlePlanSelection('pro')"`, `onclick="handlePlanSelection('pro', this)"`);
html = html.replace(`onclick="handlePlanSelection('business')"`, `onclick="handlePlanSelection('business', this)"`);
html = html.replace(`onclick="handlePlanSelection('custom')"`, `onclick="handlePlanSelection('custom', this)"`);

// 2. handlePlanSelection 함수를 다이렉트 결제 파이프라인으로 완전 교체
const newHandlePlanSelection = `
    async function handlePlanSelection(plan, btnEl) {
      logAnalyticsEvent('plan_selected', { plan });

      if (plan === 'custom') {
        closePlanModal();
        if (typeof window.openConsultationModal === 'function') {
          window.openConsultationModal('Custom Enterprise 3D Solution');
        } else {
          window.location.href = '/pricing.html#custom-quote';
        }
        return;
      }

      const originalText = btnEl ? btnEl.innerHTML : '';
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-bolt fa-spin" style="margin-right: 6px;"></i> Entering Payment Pipeline...';
      }

      try {
        const token = localStorage.getItem('token');
        const emailEl = document.getElementById('email') || document.getElementById('save-email-input') || document.getElementById('verifyTargetEmailTxt');
        const email = emailEl ? (emailEl.value || emailEl.textContent || '').trim() : '';
        const bizEl = document.getElementById('businessName');
        const businessName = bizEl ? bizEl.value.trim() : '';

        // Convert project on backend preserving all data (Zero Data Re-entry)
        if (activeProjectId) {
          await fetch(\`/api/free-funnel/projects/\${activeProjectId}/convert-plan\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan })
          });
        }

        logAnalyticsEvent('stripe_checkout_started', { plan, projectId: activeProjectId });

        let checkoutUrl = null;

        if (token) {
          const checkRes = await fetch('/api/billing/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
            body: JSON.stringify({ requestedPlan: plan, consentTerms: true, consentRecurring: true, projectId: activeProjectId })
          });
          const checkData = await checkRes.json();
          if (checkData.checkoutUrl) {
            checkoutUrl = checkData.checkoutUrl;
          }
        } else {
          // Direct Guest Checkout Session
          const guestRes = await fetch('/api/billing/guest-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestedPlan: plan,
              projectId: activeProjectId,
              email: email,
              businessName: businessName
            })
          });
          const guestData = await guestRes.json();
          if (guestData.checkoutUrl) {
            checkoutUrl = guestData.checkoutUrl;
          } else if (guestData.redirectUrl) {
            checkoutUrl = guestData.redirectUrl;
          }
        }

        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }

        // Direct fallback to pricing payment gateway
        window.location.href = \`/pricing.html?plan=\${plan}&projectId=\${activeProjectId || ''}&direct_checkout=1\`;
      } catch (err) {
        console.error('Payment pipeline error:', err);
        window.location.href = \`/pricing.html?plan=\${plan}&projectId=\${activeProjectId || ''}&direct_checkout=1\`;
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = originalText;
        }
      }
    }
`;

html = html.replace(/async function handlePlanSelection\(plan\)[\s\S]*?}\n\s*}/, newHandlePlanSelection.trim());

// 3. 파일 저장
fs.writeFileSync(indexHtmlPath, html, 'utf8');
fs.writeFileSync(path.join(baseDir, '_clean_deploy', 'client', 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(baseDir, '_railway_deploy', 'client', 'index.html'), html, 'utf8');

// server/index.js 동기화
fs.copyFileSync(
  path.join(baseDir, 'app_build', 'server', 'index.js'),
  path.join(baseDir, '_clean_deploy', 'server', 'index.js')
);
fs.copyFileSync(
  path.join(baseDir, 'app_build', 'server', 'index.js'),
  path.join(baseDir, '_railway_deploy', 'server', 'index.js')
);

console.log('✅ Successfully applied Instant Payment Pipeline to index.html and server/index.js!');
