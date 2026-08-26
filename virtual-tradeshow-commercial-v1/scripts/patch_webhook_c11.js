const fs = require('fs');
const srvPath = 'app_build/server/index.js';
let srv = fs.readFileSync(srvPath, 'utf8');

// webhook의 checkout.session.completed 내에 freePreviewProjects 활성화 로직 추가
const webhookHook = `
          // C11 Free Funnel Project Upgrade Handler
          if (session.metadata && session.metadata.projectId) {
            const pid = session.metadata.projectId;
            const reqPlan = (session.metadata.requestedPlan || 'PRO').toUpperCase();
            const dbData = db.read();
            const proj = (dbData.freePreviewProjects || []).find(p => p.id === pid);
            if (proj) {
              proj.entitlementState = reqPlan === 'BUSINESS' ? 'ACTIVE_BUSINESS' : 'ACTIVE_PRO';
              proj.plan = reqPlan;
              proj.stripeCustomerId = customerId;
              proj.stripeSubscriptionId = subscriptionId;
              proj.stripeSessionId = session.id;
              proj.paymentCorrelationId = session.metadata.paymentCorrelationId || 'pay_corr_webhook';
              proj.activatedAt = new Date().toISOString();
              proj.publishStatus = 'APPROVED';
              db.write(dbData);
              console.log(\`✅ C11 Project \${pid} upgraded to \${proj.entitlementState} via Stripe Webhook\`);
            }
          }
`;

if (!srv.includes('C11 Free Funnel Project Upgrade Handler')) {
  srv = srv.replace("case 'checkout.session.completed': {", `case 'checkout.session.completed': {\n${webhookHook}`);
  fs.writeFileSync(srvPath, srv, 'utf8');
  console.log('✅ Webhook handler updated for C11 project upgrade');
}
