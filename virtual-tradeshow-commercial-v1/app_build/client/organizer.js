/* ============================================================
   Virtual Trade Show Commercial V1 — Organizer Console Logic
   Event Operations, Exhibitor Onboarding, and GPU Job Approval
============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  let authToken = localStorage.getItem('vt_organizer_token');

  const loginModal = document.getElementById('org-login-modal');
  const formLogin = document.getElementById('form-org-login');
  const btnLogout = document.getElementById('btn-org-logout');
  const exhibitorTbody = document.getElementById('exhibitor-tbody');
  const reconTbody = document.getElementById('recon-approval-tbody');

  const statExhibitors = document.getElementById('stat-exhibitors');
  const statBooths = document.getElementById('stat-booths');
  const statVerifiedBooths = document.getElementById('stat-verified-booths');
  const statVisits = document.getElementById('stat-visits');

  async function authFetch(url, options = {}) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${authToken}`
    };
    const res = await fetch(url, options);
    if (res.status === 401) {
      authToken = null;
      localStorage.removeItem('vt_organizer_token');
      if (loginModal) loginModal.style.display = 'flex';
      throw new Error('Unauthorized');
    }
    return res;
  }

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('input-org-email').value;
      const password = document.getElementById('input-org-password').value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          authToken = data.token;
          localStorage.setItem('vt_organizer_token', authToken);
          if (loginModal) loginModal.style.display = 'none';
          await loadDashboard();
        } else {
          alert(`Login failed: ${data.error || 'Please check your credentials.'}`);
        }
      } catch (err) {
        alert('Authentication error occurred.');
      }
    });
  }

  const modalInvite = document.getElementById('modal-invite-exhibitor');
  const btnAddExhibitor = document.getElementById('btn-add-exhibitor');
  const btnCancelInvite = document.getElementById('btn-cancel-invite');
  const formInvite = document.getElementById('form-invite-exhibitor');

  if (btnAddExhibitor) {
    btnAddExhibitor.addEventListener('click', () => {
      if (modalInvite) modalInvite.style.display = 'flex';
    });
  }

  if (btnCancelInvite) {
    btnCancelInvite.addEventListener('click', () => {
      if (modalInvite) modalInvite.style.display = 'none';
    });
  }

  if (formInvite) {
    formInvite.addEventListener('submit', async (e) => {
      e.preventDefault();
      const companyName = document.getElementById('invite-company-name').value;
      const adminEmail = document.getElementById('invite-admin-email').value;
      const category = document.getElementById('invite-category').value;
      const boothNumber = document.getElementById('invite-booth-num').value;
      const tempPassword = document.getElementById('invite-temp-pwd').value;

      try {
        const res = await authFetch('/api/events/event-global-tech-2026/invite-exhibitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName, adminEmail, category, boothNumber, tempPassword })
        });
        const data = await res.json();
        if (res.ok) {
          alert(`🎉 Exhibitor account created successfully!\n\nEmail: ${data.user.email}\nTemporary Password: ${data.tempPassword}\n\n* Password change is enforced on first login.`);
          if (modalInvite) modalInvite.style.display = 'none';
          formInvite.reset();
          await loadDashboard();
        } else {
          alert(`Account creation failed: ${data.error || 'Error occurred.'}`);
        }
      } catch (err) {
        alert('Communication error creating exhibitor account.');
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        if (authToken) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
        }
      } catch (e) {}
      authToken = null;
      localStorage.removeItem('vt_organizer_token');
      if (loginModal) loginModal.style.display = 'flex';
    });
  }

  async function loadDashboard() {
    if (!authToken) {
      if (loginModal) loginModal.style.display = 'flex';
      return;
    }
    if (loginModal) loginModal.style.display = 'none';

    try {
      // 1. Load Analytics Summary
      const sumRes = await authFetch('/api/analytics/summary');
      if (sumRes.ok) {
        const sum = await sumRes.json();
        if (statBooths) statBooths.textContent = sum.publishedBooths || 0;
        if (statVerifiedBooths) statVerifiedBooths.textContent = sum.precisionVerifiedBooths || 0;
        if (statVisits) statVisits.textContent = sum.totalVisits || 0;
      }

      // 2. Load Exhibitors & Booths
      const bRes = await authFetch('/api/booths?all=true');
      if (bRes.ok) {
        const booths = await bRes.json();
        if (statExhibitors) statExhibitors.textContent = booths.length;
        renderExhibitors(booths);
      }

      // 3. Load Reconstruction Approvals
      const orgRes = await authFetch('/api/organizations');
      if (orgRes.ok) {
        await loadReconstructionJobs();
      }

    } catch (err) {
      console.error('Failed to load organizer dashboard:', err);
    }
  }

  function renderExhibitors(booths) {
    if (!exhibitorTbody) return;
    exhibitorTbody.innerHTML = '';

    booths.forEach(b => {
      const tr = document.createElement('tr');
      const isVerified = b.reconstructionStatus === 'verified';
      const statusBadge = b.status === 'published' 
        ? '<span class="badge badge-verified">Published</span>'
        : '<span class="badge" style="background: rgba(148, 163, 184, 0.2);">Draft</span>';

      const reconBadge = isVerified
        ? '<span class="badge badge-verified">✨ 3D Gaussian Splat</span>'
        : '<span class="badge badge-preview">Photo Preview</span>';

      tr.innerHTML = `
        <td><strong>${escapeHtml(b.name)}</strong></td>
        <td>${escapeHtml(b.category || 'Industrial Tech')}</td>
        <td>A-${b.id.substring(b.id.length - 3).toUpperCase()}</td>
        <td>${statusBadge}</td>
        <td>${reconBadge}</td>
        <td>${new Date(b.createdAt).toLocaleDateString()}</td>
      `;
      exhibitorTbody.appendChild(tr);
    });
  }

  async function loadReconstructionJobs() {
    if (!reconTbody) return;
    reconTbody.innerHTML = '';

    try {
      const res = await authFetch('/api/booths?all=true');
      const booths = await res.json();

      let activeJobCount = 0;
      for (const b of booths) {
        if (b.reconstructionJobId || b.reconstructionStatus === 'reconstruction_pending') {
          activeJobCount++;
          const tr = document.createElement('tr');

          tr.innerHTML = `
            <td><code>${escapeHtml(b.reconstructionJobId || 'recon-job-pending')}</code></td>
            <td><strong>${escapeHtml(b.name)}</strong></td>
            <td>${(b.photos && b.photos.length) || 0} Photos</td>
            <td>Ultra Precision (Splatfacto)</td>
            <td><span class="badge badge-pending">${escapeHtml(b.reconstructionStatus)}</span></td>
            <td>$0.00 (Modal Starter)</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="approveJob('${b.reconstructionJobId || b.id}')">Authorize GPU Queue</button>
            </td>
          `;
          reconTbody.appendChild(tr);
        }
      }

      if (activeJobCount === 0) {
        reconTbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px;">
              No 3D reconstruction jobs awaiting approval.
            </td>
          </tr>
        `;
      }
    } catch (err) {
      console.error(err);
    }
  }

  window.approveJob = async function(jobId) {
    try {
      const res = await authFetch(`/api/reconstruction/jobs/${jobId}/approve`, { method: 'POST' });
      if (res.ok) {
        alert('3D reconstruction job approved and scheduled in GPU worker queue.');
        await loadDashboard();
      } else {
        const d = await res.json();
        alert(`Approval notification: ${d.message || d.error || 'Completed'}`);
      }
    } catch (err) {
      alert('Error requesting job approval.');
    }
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (authToken) {
    loadDashboard();
  }
});
