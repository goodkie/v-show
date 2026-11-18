(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.XpiderStudioStorage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LEGACY_DRAFT_KEY = 'xpider_email_studio_draft_v1';
  const DRAFTS_STORE_KEY = 'xpider_email_studio_drafts_v2';
  const TEMPLATES_STORE_KEY = 'xpider_email_studio_templates_v2';
  const DRAFT_FIELDS = Object.freeze([
    'kind', 'subject', 'preheader', 'brand', 'heading', 'body',
    'image', 'alt', 'cta', 'link', 'reply', 'company', 'address', 'unsubscribe'
  ]);
  const SECRET_RE = /AIza[0-9A-Za-z_-]{12,}|re_[0-9A-Za-z_-]{12,}|Bearer\s+[A-Za-z0-9._-]{16,}/i;
  const UNSAFE_HTML_RE = /<script\b|javascript:|on(?:load|error|click|mouseover)\s*=/i;

  function sanitizeDraftFields(raw) {
    const out = {};
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    for (const f of DRAFT_FIELDS) {
      const val = typeof src[f] === 'string' ? src[f] : '';
      if (SECRET_RE.test(val)) {
        throw new Error(`SECRET_PATTERN_REJECTED:${f}`);
      }
      if (UNSAFE_HTML_RE.test(val)) {
        throw new Error(`UNSAFE_HTML_REJECTED:${f}`);
      }
      out[f] = val;
    }
    return out;
  }

  function draftsEqual(a, b) {
    if (!a || !b) return false;
    for (const f of DRAFT_FIELDS) {
      if (String(a[f] || '') !== String(b[f] || '')) return false;
    }
    return true;
  }

  function createStorageAdapter(opts = {}) {
    const chromeStorage = opts.chromeStorage !== undefined
      ? opts.chromeStorage
      : (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : null);
    const webStorage = opts.webStorage !== undefined
      ? opts.webStorage
      : (typeof localStorage !== 'undefined' ? localStorage : null);

    async function getRaw(key) {
      if (chromeStorage && typeof chromeStorage.get === 'function') {
        const res = await new Promise((resolve, reject) => {
          try {
            chromeStorage.get([key], (items) => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              resolve(items ? items[key] : undefined);
            });
          } catch (err) {
            reject(err);
          }
        });
        if (res !== undefined) return res;
      }
      if (webStorage && typeof webStorage.getItem === 'function') {
        const raw = webStorage.getItem(key);
        if (raw === null || raw === undefined) return undefined;
        return raw;
      }
      return undefined;
    }

    async function setRaw(key, value) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (chromeStorage && typeof chromeStorage.set === 'function') {
        await new Promise((resolve, reject) => {
          try {
            chromeStorage.set({ [key]: serialized }, () => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              resolve();
            });
          } catch (err) {
            reject(err);
          }
        });
      }
      if (webStorage && typeof webStorage.setItem === 'function') {
        webStorage.setItem(key, serialized);
      }
    }

    return {
      backendName: chromeStorage ? 'chrome.storage.local' : (webStorage ? 'localStorage' : 'memory'),
      getRaw,
      setRaw
    };
  }

  function parseStore(raw, expectedKey) {
    if (raw === undefined || raw === null || raw === '') {
      return { ok: true, store: { version: 2, activeId: null, items: [] }, recovered: false };
    }
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.items)) {
        return { ok: false, store: { version: 2, activeId: null, items: [] }, recovered: true, error: `CORRUPT_STORE_SCHEMA:${expectedKey}` };
      }
      const cleanItems = [];
      for (const item of parsed.items) {
        if (!item || typeof item !== 'object' || !item.id || !item.data) continue;
        cleanItems.push({
          id: String(item.id),
          name: String(item.name || item.id).slice(0, 120),
          savedAt: String(item.savedAt || ''),
          data: sanitizeDraftFields(item.data)
        });
      }
      return {
        ok: true,
        store: {
          version: 2,
          activeId: parsed.activeId ? String(parsed.activeId) : (cleanItems[0]?.id || null),
          items: cleanItems
        },
        recovered: false
      };
    } catch (err) {
      return { ok: false, store: { version: 2, activeId: null, items: [] }, recovered: true, error: `CORRUPT_JSON:${err.message}` };
    }
  }

  async function loadDraftsStore(adapterOpts = {}) {
    const adapter = createStorageAdapter(adapterOpts);
    const raw = await adapter.getRaw(DRAFTS_STORE_KEY);
    const parsed = parseStore(raw, DRAFTS_STORE_KEY);
    if (!parsed.ok) {
      return { ok: false, recovered: true, error: parsed.error, store: parsed.store, backend: adapter.backendName };
    }
    if (parsed.store.items.length === 0) {
      const legacyRaw = await adapter.getRaw(LEGACY_DRAFT_KEY);
      if (legacyRaw) {
        try {
          const leg = typeof legacyRaw === 'string' ? JSON.parse(legacyRaw) : legacyRaw;
          const data = sanitizeDraftFields(leg && leg.draft ? leg.draft : leg);
          const migrated = {
            id: 'migrated_v1',
            name: (data.subject ? data.subject.slice(0, 40) : '기존 초안 (자동 마이그레이션)'),
            savedAt: String(leg.savedAt || new Date().toISOString()),
            data
          };
          const nextStore = { version: 2, activeId: migrated.id, items: [migrated] };
          await adapter.setRaw(DRAFTS_STORE_KEY, nextStore);
          return { ok: true, migrated: true, store: nextStore, backend: adapter.backendName };
        } catch (_) {
          // Ignore corrupt legacy draft safely
        }
      }
    }
    return { ok: true, migrated: false, store: parsed.store, backend: adapter.backendName };
  }

  async function saveDraft(draftInput, adapterOpts = {}) {
    const adapter = createStorageAdapter(adapterOpts);
    const loaded = await loadDraftsStore(adapterOpts);
    const store = loaded.store;
    const cleanData = sanitizeDraftFields(draftInput.data);
    const id = String(draftInput.id || `draft_${Date.now()}`).trim();
    const name = String(draftInput.name || cleanData.subject || '이름 없는 초안').trim().slice(0, 120) || '이름 없는 초안';
    const savedAt = new Date().toISOString();
    const entry = { id, name, savedAt, data: cleanData };
    const idx = store.items.findIndex(x => x.id === id);
    if (idx >= 0) store.items[idx] = entry;
    else store.items.unshift(entry);
    store.activeId = id;
    await adapter.setRaw(DRAFTS_STORE_KEY, store);

    // Read-after-write verification
    const verifyRaw = await adapter.getRaw(DRAFTS_STORE_KEY);
    const verified = parseStore(verifyRaw, DRAFTS_STORE_KEY);
    const found = verified.ok ? verified.store.items.find(x => x.id === id) : null;
    if (!found || !draftsEqual(found.data, cleanData)) {
      throw new Error('DRAFT_READBACK_MISMATCH');
    }
    return { ok: true, draft: found, store: verified.store, backend: adapter.backendName };
  }

  async function deleteDraft(id, adapterOpts = {}) {
    const adapter = createStorageAdapter(adapterOpts);
    const loaded = await loadDraftsStore(adapterOpts);
    const store = loaded.store;
    store.items = store.items.filter(x => x.id !== String(id));
    if (store.activeId === String(id)) {
      store.activeId = store.items[0]?.id || null;
    }
    await adapter.setRaw(DRAFTS_STORE_KEY, store);
    return { ok: true, store, backend: adapter.backendName };
  }

  function hasDangerousPrototypeKeys(rawText) {
    return /"(?:__proto__|constructor|prototype)"\s*:/i.test(rawText);
  }

  function validateAndSanitizeImportedTemplate(rawText, opts = {}) {
    const maxBytes = Number(opts.maxBytes || 262144);
    if (typeof rawText !== 'string' || !rawText.trim()) {
      throw new Error('EMPTY_TEMPLATE_FILE');
    }
    if (rawText.length > maxBytes) {
      throw new Error('TEMPLATE_FILE_TOO_LARGE');
    }
    if (hasDangerousPrototypeKeys(rawText)) {
      throw new Error('UNSAFE_TEMPLATE_KEYS');
    }
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      throw new Error(`INVALID_TEMPLATE_JSON:${err.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('INVALID_TEMPLATE_OBJECT');
    }
    const ver = Number(parsed.version);
    if (!Number.isInteger(ver) || ver < 1 || ver > 2) {
      throw new Error('UNSUPPORTED_TEMPLATE_VERSION');
    }
    const tplObj = parsed.template && typeof parsed.template === 'object' && !Array.isArray(parsed.template)
      ? parsed.template
      : null;
    if (!tplObj) {
      throw new Error('MISSING_TEMPLATE_PAYLOAD');
    }
    const cleanTemplate = sanitizeDraftFields(tplObj);
    return {
      ok: true,
      version: ver,
      template: cleanTemplate,
      note: typeof parsed.note === 'string' ? parsed.note.slice(0, 200) : ''
    };
  }

  async function loadTemplatesLibrary(adapterOpts = {}) {
    const adapter = createStorageAdapter(adapterOpts);
    const raw = await adapter.getRaw(TEMPLATES_STORE_KEY);
    const parsed = parseStore(raw, TEMPLATES_STORE_KEY);
    return { ok: parsed.ok, recovered: parsed.recovered, error: parsed.error || null, store: parsed.store, backend: adapter.backendName };
  }

  async function saveTemplateToLibrary(tplInput, adapterOpts = {}) {
    const adapter = createStorageAdapter(adapterOpts);
    const loaded = await loadTemplatesLibrary(adapterOpts);
    const store = loaded.store;
    const cleanData = sanitizeDraftFields(tplInput.data);
    const id = String(tplInput.id || `tpl_${Date.now()}`).trim();
    const name = String(tplInput.name || cleanData.subject || '저장된 템플릿').trim().slice(0, 120) || '저장된 템플릿';
    const savedAt = new Date().toISOString();
    const entry = { id, name, savedAt, data: cleanData };
    const idx = store.items.findIndex(x => x.id === id);
    if (idx >= 0) store.items[idx] = entry;
    else store.items.unshift(entry);
    store.activeId = id;
    await adapter.setRaw(TEMPLATES_STORE_KEY, store);

    const verifyRaw = await adapter.getRaw(TEMPLATES_STORE_KEY);
    const verified = parseStore(verifyRaw, TEMPLATES_STORE_KEY);
    const found = verified.ok ? verified.store.items.find(x => x.id === id) : null;
    if (!found || !draftsEqual(found.data, cleanData)) {
      throw new Error('TEMPLATE_READBACK_MISMATCH');
    }
    return { ok: true, template: found, store: verified.store, backend: adapter.backendName };
  }

  async function deleteTemplateFromLibrary(id, adapterOpts = {}) {
    const adapter = createStorageAdapter(adapterOpts);
    const loaded = await loadTemplatesLibrary(adapterOpts);
    const store = loaded.store;
    store.items = store.items.filter(x => x.id !== String(id));
    if (store.activeId === String(id)) store.activeId = store.items[0]?.id || null;
    await adapter.setRaw(TEMPLATES_STORE_KEY, store);
    return { ok: true, store, backend: adapter.backendName };
  }

  return {
    LEGACY_DRAFT_KEY,
    DRAFTS_STORE_KEY,
    TEMPLATES_STORE_KEY,
    DRAFT_FIELDS,
    sanitizeDraftFields,
    draftsEqual,
    loadDraftsStore,
    saveDraft,
    deleteDraft,
    validateAndSanitizeImportedTemplate,
    loadTemplatesLibrary,
    saveTemplateToLibrary,
    deleteTemplateFromLibrary
  };
});
