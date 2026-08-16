/* ============================================================
   Virtual Trade Show Commercial V1 — Public Event Lobby Logic
   Commercial Beta Multi-Exhibitor Discovery & Navigation
============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const eventSlug = urlParams.get('event') || 'global-tech-2026';

  const eventTitle = document.getElementById('event-title');
  const eventDesc = document.getElementById('event-description');
  const metaExhibitorCount = document.getElementById('meta-exhibitor-count');
  const boothGrid = document.getElementById('booth-grid-container');
  const inputSearch = document.getElementById('input-search');
  const catButtons = document.querySelectorAll('.cat-pill');

  let allBooths = [];
  let currentCategory = 'all';

  async function loadEventData() {
    try {
      const res = await fetch(`/api/events/${eventSlug}`);
      if (!res.ok) {
        throw new Error('Event not found');
      }
      const data = await res.json();
      const event = data.event;
      allBooths = data.booths || [];

      if (eventTitle) eventTitle.textContent = event.name;
      if (eventDesc) eventDesc.textContent = event.description;
      if (metaExhibitorCount) metaExhibitorCount.textContent = allBooths.length;

      renderBooths(allBooths);
    } catch (err) {
      console.error('Failed to load event data:', err);
      // Fallback: Fetch published booths directly
      const bRes = await fetch('/api/booths');
      allBooths = await bRes.json();
      renderBooths(allBooths);
    }
  }

  function renderBooths(booths) {
    if (!boothGrid) return;
    boothGrid.innerHTML = '';

    if (booths.length === 0) {
      boothGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <h3>🔍 No exhibitor booths match your search criteria.</h3>
          <p style="margin-top: 8px;">Try selecting another category or keyword.</p>
        </div>
      `;
      return;
    }

    booths.forEach(booth => {
      const card = document.createElement('a');
      card.className = 'booth-card';
      card.href = `viewer.html?boothId=${booth.id}`;

      const coverImg = (booth.photos && booth.photos[0]) || 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80';
      const isPrecision = booth.reconstructionStatus === 'verified';
      const badgeHtml = isPrecision
        ? `<span class="badge badge-verified" style="box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);">✨ 3D Gaussian Splat</span>`
        : `<span class="badge badge-preview">Photo Preview</span>`;

      card.innerHTML = `
        <div class="booth-cover" style="background-image: url('${coverImg}');">
          <div class="booth-badge-pos">${badgeHtml}</div>
        </div>
        <div class="booth-content">
          <div class="booth-name">${escapeHtml(booth.name)}</div>
          <div class="booth-desc">${escapeHtml(booth.description || 'Explore the 3D virtual booth space and innovative product lineup.')}</div>
          <div class="booth-footer">
            <span>🚪 Enter 3D Booth</span>
            <span style="color: var(--brand-accent); font-weight: 600;">Visit &rarr;</span>
          </div>
        </div>
      `;

      boothGrid.appendChild(card);
    });
  }

  function filterBooths() {
    const query = (inputSearch ? inputSearch.value : '').toLowerCase().trim();

    const filtered = allBooths.filter(booth => {
      const matchesSearch = !query || 
        booth.name.toLowerCase().includes(query) || 
        (booth.description && booth.description.toLowerCase().includes(query));

      const matchesCat = currentCategory === 'all' || 
        (booth.category && booth.category.toLowerCase().includes(currentCategory.toLowerCase())) ||
        (booth.name && booth.name.toLowerCase().includes(currentCategory.toLowerCase()));

      return matchesSearch && matchesCat;
    });

    renderBooths(filtered);
  }

  if (inputSearch) {
    inputSearch.addEventListener('input', filterBooths);
  }

  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      filterBooths();
    });
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  await loadEventData();
});
