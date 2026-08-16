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
          alert(`로그인 실패: ${data.error || '계정 정보를 확인해 주세요.'}`);
        }
      } catch (err) {
        alert('로그인 통신 중 오류가 발생했습니다.');
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
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
        // Render any pending jobs
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
        ? '<span class="badge badge-verified">공개됨 (Published)</span>'
        : '<span class="badge" style="background: rgba(148, 163, 184, 0.2);">임시저장 (Draft)</span>';

      const reconBadge = isVerified
        ? '<span class="badge badge-verified">✨ 3D Gaussian Splat</span>'
        : '<span class="badge badge-preview">Photo Preview</span>';

      tr.innerHTML = `
        <td><strong>${b.name}</strong></td>
        <td>${b.category || '산업 자동화 / 테크'}</td>
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
          const isAwaiting = b.reconstructionStatus === 'reconstruction_pending';

          tr.innerHTML = `
            <td><code>${b.reconstructionJobId || 'recon-job-pending'}</code></td>
            <td><strong>${b.name}</strong></td>
            <td>${(b.photos && b.photos.length) || 0}장</td>
            <td>Ultra Precision (Splatfacto)</td>
            <td><span class="badge badge-pending">${b.reconstructionStatus}</span></td>
            <td>$0.00 (Modal Starter)</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="approveJob('${b.reconstructionJobId || b.id}')">승인 및 GPU 큐잉</button>
            </td>
          `;
          reconTbody.appendChild(tr);
        }
      }

      if (activeJobCount === 0) {
        reconTbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px;">
              현재 승인 대기 중인 3D 재구성 작업이 없습니다.
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
        alert('3D 재구성 작업이 승인되어 GPU 워커 큐에 등록되었습니다.');
        await loadDashboard();
      } else {
        const d = await res.json();
        alert(`승인 처리 안내: ${d.message || d.error || '완료'}`);
      }
    } catch (err) {
      alert('승인 요청 중 오류가 발생했습니다.');
    }
  };

  if (authToken) {
    loadDashboard();
  }
});
