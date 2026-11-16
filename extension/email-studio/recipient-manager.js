/**
 * XPIDER Email Studio — Recipient Manager, SME Segment Filter & Deterministic A/B Engine
 * (pure, no network, no secrets).
 * CSV import -> RFC/IDN/disposable/role validate -> dedupe -> SME category filter -> opt-out/suppression
 * -> consent gate -> deterministic A/B split -> review -> per-recipient ledger with stop/resume & CSV exports.
 * Production send stays gated elsewhere; this module never sends anything.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecipientManager = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  const HARD_ROLE_LOCALS = new Set(['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster']);
  const GENERIC_ROLE_LOCALS = new Set(['admin', 'administrator', 'webmaster', 'hostmaster', 'abuse', 'security', 'billing', 'privacy', 'noc']);

  const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com',
    'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'maildrop.cc', 'throwawaymail.com'
  ]);

  const PERSONAL_FREE_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com',
    'yahoo.com', 'yahoo.co.kr', 'yahoo.co.jp', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com',
    'mail.com', 'korea.com', 'paran.com', 'empal.com', 'lycos.co.kr', 'dreamwiz.com', 'chollian.net',
    'hanmir.com', 'hitel.net', 'unitel.co.kr', 'freechal.com', 'cyworld.com', 'sayclub.com'
  ]);

  const GOV_PUBLIC_DOMAINS = new Set([
    'korea.kr', 'seoul.go.kr', 'gg.go.kr', 'busan.go.kr', 'incheon.go.kr', 'daegu.go.kr',
    'kotsa.or.kr', 'kotra.or.kr', 'kisa.or.kr', 'nps.or.kr', 'nhis.or.kr', 'kcomwel.or.kr',
    'korail.com', 'kepco.co.kr', 'lh.or.kr', 'kwater.or.kr', 'ex.co.kr', 'ksd.or.kr', 'fss.or.kr', 'bok.or.kr'
  ]);
  const GOV_PUBLIC_TLD_RE = /\.(go\.kr|gov|gov\.[a-z]{2}|mil|or\.kr|ac\.kr|edu|edu\.[a-z]{2}|hs\.kr|ms\.kr|es\.kr|pe\.kr)$/i;

  const ECOMMERCE_DOMAINS = new Set([
    'coupang.com', 'gmarket.co.kr', 'auction.co.kr', '11st.co.kr', 'ssg.com', 'lotteon.com',
    'interpark.com', 'tmon.co.kr', 'wemakeprice.com', 'musinsa.com', '29cm.co.kr', 'ably.team',
    'zigzag.kr', 'kurly.com', 'baemin.com', 'woowahan.com', 'yogiyo.co.kr', 'oliveyoung.co.kr',
    'hmall.com', 'gsshop.com', 'cjonstyle.com', 'nsmall.com', 'homeplus.co.kr', 'emart.com',
    'costco.co.kr', 'amazon.com', 'ebay.com', 'aliexpress.com', 'shopify.com', 'cafe24.com',
    'imweb.me', 'makeshop.co.kr', 'godomall.com', 'sixshop.com', 'smartstore.naver.com'
  ]);

  const PORTAL_PLATFORM_DOMAINS = new Set([
    'navercorp.com', 'kakaocorp.com', 'daumcorp.com', 'skcomms.co.kr', 'google.com', 'apple.com',
    'microsoft.com', 'meta.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'bytedance.com',
    'linecorp.com', 'woowa.in', 'toss.im', 'vivarepublica.com', 'karrotmarket.com', 'daangn.com',
    'yanolja.in', 'yeogi.com', 'zigbang.com', 'dabangapp.com', 'jobkorea.co.kr', 'saramin.co.kr',
    'wantedlab.com', 'rememberapp.co.kr', 'afreecatv.com', 'sooplive.co.kr', 'krafton.com', 'ncsoft.com', 'nexon.co.kr', 'netmarble.com'
  ]);

  const LARGE_ENTERPRISE_DOMAINS = new Set([
    'samsung.com', 'sec.co.kr', 'samsungdisplay.com', 'samsungsdi.com', 'samsungsds.com',
    'lge.com', 'lgchem.com', 'lgcns.com', 'lguplus.co.kr', 'lgensol.com', 'lginnotek.com',
    'sk.com', 'sktelecom.com', 'skhynix.com', 'skinnovation.com', 'sknetworks.co.kr',
    'hyundai.com', 'kia.com', 'mobis.co.kr', 'hyundai-steel.com', 'hyundaieandc.com',
    'lotte.net', 'lotte.co.kr', 'lottechem.com', 'lottechilsung.co.kr',
    'posco.com', 'poscoenc.com', 'poscointl.com', 'hanwha.com', 'hanwhaaerospace.com', 'hanwhasolutions.com',
    'gs.co.kr', 'gscaltex.com', 'gsenc.com', 'gsretail.com',
    'hd.com', 'hhi.co.kr', 'shinsegae.com', 'cj.net', 'cjenm.com', 'cjlogistics.com',
    'doosan.com', 'ls.com', 'kumho.co.kr', 'kolon.com', 'hyosung.com', 'dbgroup.co.kr', 'celltrion.com',
    'kbstar.com', 'shinhan.com', 'wooribank.com', 'hanafn.com', 'nhbank.com', 'ibk.co.kr',
    'koreanair.com', 'flyasiana.com', 'kt.com', 'ktcorp.com',
    'ibm.com', 'oracle.com', 'sap.com', 'salesforce.com', 'adobe.com', 'cisco.com', 'intel.com', 'nvidia.com', 'sony.com', 'toyota.com'
  ]);

  const STATUS = Object.freeze({
    PENDING: 'PENDING',
    SENDING: 'SENDING',
    ACCEPTED: 'ACCEPTED',
    FAILED: 'FAILED',
    SKIPPED_SUPPRESSED: 'SKIPPED_SUPPRESSED',
    SKIPPED_NO_CONSENT: 'SKIPPED_NO_CONSENT',
    DRY_RUN_READY: 'DRY_RUN_READY'
  });

  const VALIDITY_STATUS = Object.freeze({
    VALID_FORMAT: 'VALID_FORMAT',
    DNS_MAIL_READY: 'DNS_MAIL_READY',
    INVALID: 'INVALID',
    UNKNOWN: 'UNKNOWN'
  });

  const CATEGORIES = Object.freeze({
    SMALL_PRIVATE_BUSINESS: 'SMALL_PRIVATE_BUSINESS',
    PERSONAL_FREE_EMAIL: 'PERSONAL_FREE_EMAIL',
    GOV_PUBLIC_SECTOR: 'GOV_PUBLIC_SECTOR',
    ECOMMERCE_MARKETPLACE: 'ECOMMERCE_MARKETPLACE',
    PORTAL_PLATFORM: 'PORTAL_PLATFORM',
    LARGE_ENTERPRISE: 'LARGE_ENTERPRISE',
    UNKNOWN_REVIEW: 'UNKNOWN_REVIEW'
  });

  function normalizeDomainWithIdn(rawDomain) {
    const d = String(rawDomain || '').trim().toLowerCase().replace(/\.$/, '');
    if (!d) return '';
    if (/[^\x00-\x7F]/.test(d)) {
      try {
        const u = new URL('http://' + d);
        if (u.hostname) return u.hostname.toLowerCase();
      } catch (_) {}
    }
    return d;
  }

  function normalizeEmail(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/^<|>$/g, '');
    const atIdx = s.lastIndexOf('@');
    if (atIdx <= 0) return s.toLowerCase();
    const local = s.slice(0, atIdx).trim().toLowerCase();
    const domain = normalizeDomainWithIdn(s.slice(atIdx + 1));
    return `${local}@${domain}`;
  }

  function validateEmail(email, opts) {
    const o = opts || {};
    if (!email) return 'EMPTY';
    if (email.length > 254) return 'TOO_LONG';
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0].length > 64) return 'INVALID_FORMAT';
    if (!EMAIL_RE.test(email)) return 'INVALID_FORMAT';
    const local = parts[0];
    const domain = parts[1];
    if (!o.allowDisposable && DISPOSABLE_DOMAINS.has(domain)) return 'DISPOSABLE_DOMAIN';
    if (!o.allowRoleAddresses && HARD_ROLE_LOCALS.has(local)) return 'ROLE_ADDRESS';
    return null;
  }

  function parseDomainSet(rawText) {
    const set = new Set();
    String(rawText || '').split(/[\s,;]+/).forEach(tok => {
      const clean = normalizeDomainWithIdn(tok.replace(/^@/, ''));
      if (clean && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) set.add(clean);
    });
    return set;
  }

  function matchesDomainOrSubdomain(domain, domainSet) {
    if (!domain || !domainSet || !domainSet.size) return false;
    if (domainSet.has(domain)) return true;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (domainSet.has(parent)) return true;
    }
    return false;
  }

  function classifyRecipient(rec, opts) {
    const o = opts || {};
    const email = normalizeEmail(rec && rec.email ? rec.email : rec);
    const name = String((rec && rec.name) || '').trim();
    const parts = email.split('@');
    const local = parts[0] || '';
    const domain = parts[1] || '';

    const manualOverrides = o.manualOverrides || {};
    if (manualOverrides[email]) {
      const ov = manualOverrides[email];
      if (ov === 'RETAIN_SME' || ov === CATEGORIES.SMALL_PRIVATE_BUSINESS) {
        return {
          category: CATEGORIES.SMALL_PRIVATE_BUSINESS,
          action: 'RETAIN_SME',
          reasonCode: 'MANUAL_OWNER_OVERRIDE_SME',
          provenance: 'OWNER_MANUAL_REVIEW_INCLUDE',
          confidenceNote: '사용자 수동 검토로 중소기업 발송 대상에 포함됨'
        };
      }
      if (ov === 'EXCLUDE') {
        return {
          category: CATEGORIES.LARGE_ENTERPRISE,
          action: 'EXCLUDE',
          reasonCode: 'MANUAL_OWNER_OVERRIDE_EXCLUDE',
          provenance: 'OWNER_MANUAL_REVIEW_EXCLUDE',
          confidenceNote: '사용자 수동 검토로 제외됨'
        };
      }
      if (ov === 'REVIEW' || ov === CATEGORIES.UNKNOWN_REVIEW) {
        return {
          category: CATEGORIES.UNKNOWN_REVIEW,
          action: 'REVIEW',
          reasonCode: 'MANUAL_OWNER_OVERRIDE_REVIEW',
          provenance: 'OWNER_MANUAL_REVIEW_HOLD',
          confidenceNote: '사용자 수동 검토 보류'
        };
      }
    }

    const customExcludeSet = o.customExcludeDomains instanceof Set ? o.customExcludeDomains : parseDomainSet(o.customExcludeDomains);
    const customSmeSet = o.customSmeIncludeDomains instanceof Set ? o.customSmeIncludeDomains : parseDomainSet(o.customSmeIncludeDomains);

    if (matchesDomainOrSubdomain(domain, customExcludeSet)) {
      return {
        category: CATEGORIES.LARGE_ENTERPRISE,
        action: 'EXCLUDE',
        reasonCode: 'CUSTOM_EXCLUDE_DOMAIN_MATCH',
        provenance: `USER_CUSTOM_EXCLUDE_LIST (${domain})`,
        confidenceNote: '사용자 지정 제외 도메인 목록 일치'
      };
    }
    if (matchesDomainOrSubdomain(domain, customSmeSet)) {
      return {
        category: CATEGORIES.SMALL_PRIVATE_BUSINESS,
        action: 'RETAIN_SME',
        reasonCode: 'CUSTOM_SME_DOMAIN_MATCH',
        provenance: `USER_CUSTOM_SME_INCLUDE_LIST (${domain})`,
        confidenceNote: '사용자 지정 중소기업 도메인 목록 일치'
      };
    }

    // 1. Personal / Free Webmail
    if (matchesDomainOrSubdomain(domain, PERSONAL_FREE_DOMAINS)) {
      const exclude = o.excludePersonalFree !== false;
      return {
        category: CATEGORIES.PERSONAL_FREE_EMAIL,
        action: exclude ? 'EXCLUDE' : 'RETAIN_SME',
        reasonCode: 'PERSONAL_OR_FREE_WEBMAIL_DOMAIN',
        provenance: `KNOWN_FREE_MAIL_PROVIDER (${domain})`,
        confidenceNote: '개인/무료 웹메일 도메인 (기업 전용 도메인 아님)'
      };
    }

    // 2. Government / Public Sector / Education / Non-Profit
    if (GOV_PUBLIC_TLD_RE.test(domain) || matchesDomainOrSubdomain(domain, GOV_PUBLIC_DOMAINS) || /시청|구청|군청|도청|부의|원장|공단|공사|진흥원|연구원|대학교|교육청/.test(name)) {
      const exclude = o.excludeGovPublic !== false;
      return {
        category: CATEGORIES.GOV_PUBLIC_SECTOR,
        action: exclude ? 'EXCLUDE' : 'RETAIN_SME',
        reasonCode: 'GOV_PUBLIC_EDU_OR_NONPROFIT_DOMAIN',
        provenance: `GOV_PUBLIC_TLD_OR_LIST (${domain})`,
        confidenceNote: '정부·지자체·공공기관·교육·비영리 도메인'
      };
    }

    // 3. E-commerce / Marketplace
    if (matchesDomainOrSubdomain(domain, ECOMMERCE_DOMAINS)) {
      const exclude = o.excludeEcommerce !== false;
      return {
        category: CATEGORIES.ECOMMERCE_MARKETPLACE,
        action: exclude ? 'EXCLUDE' : 'RETAIN_SME',
        reasonCode: 'KNOWN_ECOMMERCE_OR_MARKETPLACE_DOMAIN',
        provenance: `KNOWN_ECOMMERCE_LIST (${domain})`,
        confidenceNote: '주요 쇼핑몰·오픈마켓·이커머스 플랫폼 도메인'
      };
    }

    // 4. Portal / Platform / Big-Tech
    if (matchesDomainOrSubdomain(domain, PORTAL_PLATFORM_DOMAINS)) {
      const exclude = o.excludePortalPlatform !== false;
      return {
        category: CATEGORIES.PORTAL_PLATFORM,
        action: exclude ? 'EXCLUDE' : 'RETAIN_SME',
        reasonCode: 'KNOWN_PORTAL_OR_PLATFORM_DOMAIN',
        provenance: `KNOWN_PORTAL_PLATFORM_LIST (${domain})`,
        confidenceNote: '포털·플랫폼·빅테크 기업 도메인'
      };
    }

    // 5. Large Enterprise / Conglomerate
    if (matchesDomainOrSubdomain(domain, LARGE_ENTERPRISE_DOMAINS)) {
      const exclude = o.excludeLargeEnterprise !== false;
      return {
        category: CATEGORIES.LARGE_ENTERPRISE,
        action: exclude ? 'EXCLUDE' : 'RETAIN_SME',
        reasonCode: 'KNOWN_LARGE_ENTERPRISE_OR_GROUP_DOMAIN',
        provenance: `KNOWN_LARGE_ENTERPRISE_LIST (${domain})`,
        confidenceNote: '대기업·상장그룹사·글로벌 대기업 도메인'
      };
    }

    // 6. Ambiguous signals -> UNKNOWN_REVIEW (never silently discard or falsely claim 100% SME certainty!)
    const shopSignalRe = /(^|[-_.])(shop|store|mall|market|mart|boutique|outlet)($|[-_.])/i;
    const shopNameRe = /쇼핑몰|스마트스토어|스토어|오픈마켓|백화점|면세점|아울렛/;
    if (shopSignalRe.test(domain) || shopNameRe.test(name)) {
      return {
        category: CATEGORIES.UNKNOWN_REVIEW,
        action: 'REVIEW',
        reasonCode: 'AMBIGUOUS_SHOP_OR_ECOMMERCE_SIGNAL',
        provenance: `HEURISTIC_SHOP_KEYWORD (${domain})`,
        confidenceNote: '자체 도메인 쇼핑몰/커머스 의심 — 중소기업 여부 수동 확인 필요'
      };
    }

    const enterpriseSignalRe = /(^|[-_.])(holdings|group|global|motors|heavy|chemical|financial|bank|insurance|securities|telecom|capital)($|[-_.])/i;
    const enterpriseNameRe = /홀딩스|그룹|계열사|지주|생명|화재|손해보험|증권|은행|자산운용|캐피탈|중공업|제철|석유화학/;
    if (enterpriseSignalRe.test(domain) || enterpriseNameRe.test(name)) {
      return {
        category: CATEGORIES.UNKNOWN_REVIEW,
        action: 'REVIEW',
        reasonCode: 'AMBIGUOUS_ENTERPRISE_OR_SUBSIDIARY_SIGNAL',
        provenance: `HEURISTIC_GROUP_KEYWORD (${domain})`,
        confidenceNote: '대기업 계열사·금융·그룹사 의심 — 수동 확인 필요'
      };
    }

    if (o.reviewGenericRoles && GENERIC_ROLE_LOCALS.has(local)) {
      return {
        category: CATEGORIES.UNKNOWN_REVIEW,
        action: 'REVIEW',
        reasonCode: 'GENERIC_ROLE_ADDRESS_REVIEW',
        provenance: `ROLE_LOCALPART (${local}@${domain})`,
        confidenceNote: '대표/역할 계정(admin/billing 등) — 담당자 수신 동의 여부 확인 필요'
      };
    }

    // 7. Narrow SME / Independent Private Business Candidate
    return {
      category: CATEGORIES.SMALL_PRIVATE_BUSINESS,
      action: 'RETAIN_SME',
      reasonCode: 'PRIVATE_CUSTOM_DOMAIN_SME_CANDIDATE',
      provenance: `CUSTOM_BUSINESS_DOMAIN_HEURISTIC (${domain})`,
      confidenceNote: '자체 도메인 기반 중소/독립기업 후보 추정 (도메인만으로 기업 규모 100% 확정 불가)'
    };
  }

  function filterAndCategorizeRecipients(recipients, filterOpts) {
    const o = filterOpts || {};
    const smeOnly = Boolean(o.smeOnlyMode);
    const includeReviewInRetained = Boolean(o.includeReviewInRetained);
    const retained = [];
    const excluded = [];
    const review = [];
    const categoryCounts = {
      [CATEGORIES.SMALL_PRIVATE_BUSINESS]: 0,
      [CATEGORIES.PERSONAL_FREE_EMAIL]: 0,
      [CATEGORIES.GOV_PUBLIC_SECTOR]: 0,
      [CATEGORIES.ECOMMERCE_MARKETPLACE]: 0,
      [CATEGORIES.PORTAL_PLATFORM]: 0,
      [CATEGORIES.LARGE_ENTERPRISE]: 0,
      [CATEGORIES.UNKNOWN_REVIEW]: 0
    };
    const reasonCounts = {};

    for (const r of (recipients || [])) {
      const cls = classifyRecipient(r, o);
      categoryCounts[cls.category] = (categoryCounts[cls.category] || 0) + 1;
      reasonCounts[cls.reasonCode] = (reasonCounts[cls.reasonCode] || 0) + 1;
      const enriched = {
        ...r,
        validityStatus: r.validityStatus || VALIDITY_STATUS.VALID_FORMAT,
        dnsProvenance: r.dnsProvenance || 'SYNTAX_ONLY_NOT_QUERIED',
        category: cls.category,
        filterAction: cls.action,
        reasonCode: cls.reasonCode,
        provenance: cls.provenance,
        confidenceNote: cls.confidenceNote
      };
      if (!smeOnly) {
        if (cls.action === 'EXCLUDE') excluded.push(enriched);
        else if (cls.action === 'REVIEW') {
          review.push(enriched);
          if (includeReviewInRetained) retained.push(enriched);
        } else {
          retained.push(enriched);
        }
      } else {
        if (cls.category === CATEGORIES.SMALL_PRIVATE_BUSINESS && cls.action === 'RETAIN_SME') {
          retained.push(enriched);
        } else if (cls.action === 'REVIEW' || cls.category === CATEGORIES.UNKNOWN_REVIEW) {
          review.push(enriched);
          if (includeReviewInRetained) retained.push(enriched);
        } else {
          excluded.push(enriched);
        }
      }
    }

    return {
      totalInput: (recipients || []).length,
      retained,
      excluded,
      review,
      categoryCounts,
      reasonCounts
    };
  }

  // Deterministic FNV-1a 32-bit hash for A/B variant assignment (works identically in browser & Node)
  function fnv1aHash(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function assignAbVariant(email, campaignId = 'default', splitPercentA = 50) {
    const norm = normalizeEmail(email);
    const camp = String(campaignId || 'default').trim() || 'default';
    const ratio = Math.max(0, Math.min(100, Number.isFinite(Number(splitPercentA)) ? Number(splitPercentA) : 50));
    if (ratio >= 100) return 'A';
    if (ratio <= 0) return 'B';
    const bucket = fnv1aHash(`${norm}|${camp}`) % 100;
    return bucket < ratio ? 'A' : 'B';
  }

  function summarizeAbQueue(queue, abConfig = {}) {
    const entries = (queue && Array.isArray(queue.entries)) ? queue.entries : [];
    const initBucket = () => ({
      assigned: 0,
      PENDING: 0,
      DRY_RUN_READY: 0,
      ACCEPTED: 0,
      DELIVERED: 0,
      BOUNCED: 0,
      COMPLAINED: 0,
      FAILED: 0,
      SKIPPED_SUPPRESSED: 0,
      SKIPPED_NO_CONSENT: 0,
      openTracked: null,
      clickTracked: null
    });
    const variants = { A: initBucket(), B: initBucket() };
    const seenEmails = new Set();
    let duplicateRecipientIds = 0;

    for (const e of entries) {
      const v = e.abVariant === 'B' ? 'B' : 'A';
      if (seenEmails.has(e.email)) duplicateRecipientIds++;
      seenEmails.add(e.email);
      const b = variants[v];
      b.assigned++;
      if (b[e.status] !== undefined) b[e.status]++;
      if (e.deliveryState === 'DELIVERED') b.DELIVERED++;
      if (e.deliveryState === 'BOUNCED') b.BOUNCED++;
      if (e.deliveryState === 'COMPLAINED') b.COMPLAINED++;
    }

    return {
      campaignId: abConfig.campaignId || 'default',
      splitPercentA: abConfig.splitPercentA !== undefined ? abConfig.splitPercentA : 50,
      uniqueRecipientsCount: seenEmails.size,
      duplicateRecipientIds,
      variants,
      metricsSupportNote: 'ACCEPTED는 발송 서버 접수이며 실제 수신함 도착(DELIVERED)과 다릅니다. 열람(Open)/클릭(Click) 지표는 이미지 프록시(Apple MPP 등) 및 개인정보 보호 설정으로 인해 왜곡될 수 있으며, 현재 STRICT HOLD 모드에서는 추적 픽셀이 비활성화되어 있습니다.'
    };
  }

  // RFC4180-ish line parser (quotes, commas, CRLF)
  function parseCsv(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    const s = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) {
        if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some(v => v.trim() !== '')) rows.push(row);
    return rows;
  }

  function importRecipients(text, opts) {
    const o = opts || {};
    const rows = parseCsv(text);
    const result = {
      originalCsvText: String(text == null ? '' : text),
      importedAt: new Date().toISOString(),
      total: rows.length,
      valid: [],
      invalid: [],
      duplicates: [],
      headerDetected: false
    };
    if (!rows.length) return result;
    let emailIdx = 0, nameIdx = -1, start = 0;
    const head = rows[0].map(v => v.trim().toLowerCase());
    const hi = head.findIndex(h => ['email', 'e-mail', 'mail', '이메일', '메일'].includes(h));
    if (hi >= 0) {
      result.headerDetected = true; emailIdx = hi; start = 1;
      nameIdx = head.findIndex(h => ['name', '이름', 'company', '회사', '업체명', '상호'].includes(h));
    } else if (!rows[0].some(v => /@/.test(v))) {
      start = 1; result.headerDetected = true;
    } else {
      const found = rows[0].findIndex(v => /@/.test(v));
      if (found >= 0) emailIdx = found;
    }
    const seen = new Set();
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const email = normalizeEmail(r[emailIdx]);
      const err = validateEmail(email, o);
      if (err) {
        result.invalid.push({
          line: i + 1,
          raw: String(r[emailIdx] || '').slice(0, 80),
          reason: err,
          validityStatus: VALIDITY_STATUS.INVALID
        });
        continue;
      }
      if (seen.has(email)) {
        result.duplicates.push({ line: i + 1, email });
        continue;
      }
      seen.add(email);
      result.valid.push({
        email,
        name: nameIdx >= 0 ? String(r[nameIdx] || '').trim().slice(0, 80) : '',
        source: o.source || 'csv-import',
        validityStatus: VALIDITY_STATUS.VALID_FORMAT,
        dnsProvenance: 'SYNTAX_ONLY_NOT_QUERIED'
      });
    }
    return result;
  }

  function parseSuppression(text) {
    const set = new Set();
    String(text || '').split(/[\s,;]+/).forEach(t => {
      const e = normalizeEmail(t);
      if (e && !validateEmail(e)) set.add(e);
      else if (e && /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) set.add(e);
    });
    return set;
  }

  function isSuppressed(email, suppression) {
    if (!suppression) return false;
    if (suppression.has(email)) return true;
    const dom = '@' + email.split('@')[1];
    return suppression.has(dom);
  }

  function buildReview(recipients, suppression, opts) {
    const o = opts || {};
    const abEnabled = Boolean(o.abEnabled);
    const campaignId = o.campaignId || 'default';
    const splitPercentA = o.splitPercentA !== undefined ? o.splitPercentA : 50;
    const entries = [];
    let ready = 0, suppressed = 0, noConsent = 0;
    for (const r of recipients) {
      let status = STATUS.PENDING;
      let reason = null;
      if (isSuppressed(r.email, suppression)) { status = STATUS.SKIPPED_SUPPRESSED; reason = 'OPT_OUT_OR_SUPPRESSED'; suppressed++; }
      else if (o.messageKind === 'marketing' && !o.consentAttestation) { status = STATUS.SKIPPED_NO_CONSENT; reason = 'MARKETING_REQUIRES_CONSENT_ATTESTATION'; noConsent++; }
      else ready++;
      const abVariant = abEnabled ? assignAbVariant(r.email, campaignId, splitPercentA) : 'A';
      const recipientId = `rcp_${fnv1aHash(`${campaignId}:${r.email}`).toString(16)}`;
      entries.push({
        recipientId,
        email: r.email,
        name: r.name || '',
        validityStatus: r.validityStatus || VALIDITY_STATUS.VALID_FORMAT,
        dnsProvenance: r.dnsProvenance || 'SYNTAX_ONLY_NOT_QUERIED',
        category: r.category || CATEGORIES.SMALL_PRIVATE_BUSINESS,
        reasonCode: r.reasonCode || 'PRIVATE_CUSTOM_DOMAIN_SME_CANDIDATE',
        provenance: r.provenance || '',
        abVariant,
        status,
        reason,
        attempts: 0,
        providerMessageId: null,
        error: null,
        updatedAt: null
      });
    }
    return { entries, summary: { total: recipients.length, ready, suppressed, noConsent } };
  }

  function createQueue(entries) {
    return { entries: entries.map(e => ({ ...e })), stopped: false, startedAt: null, finishedAt: null };
  }

  async function runQueue(queue, sender, opts) {
    const o = Object.assign({ maxAttempts: 2, delayMs: 0, now: () => new Date().toISOString() }, opts || {});
    queue.stopped = false;
    queue.startedAt = queue.startedAt || o.now();
    for (const e of queue.entries) {
      if (queue.stopped) break;
      if (e.status === STATUS.ACCEPTED || e.status === STATUS.DRY_RUN_READY || String(e.status).startsWith('SKIPPED')) continue;
      if (e.status === STATUS.FAILED && e.attempts >= o.maxAttempts) continue;
      e.status = STATUS.SENDING; e.attempts++; e.updatedAt = o.now();
      let res;
      try { res = await sender(e); } catch (err) { res = { ok: false, error: err && err.message ? err.message : 'SENDER_EXCEPTION' }; }
      e.updatedAt = o.now();
      if (res && res.ok) { e.status = res.dryRun ? STATUS.DRY_RUN_READY : STATUS.ACCEPTED; e.providerMessageId = res.providerMessageId || null; e.error = null; }
      else { e.status = STATUS.FAILED; e.error = (res && res.error) || 'UNKNOWN_ERROR'; }
      if (o.delayMs > 0) await new Promise(r => setTimeout(r, o.delayMs));
    }
    const remaining = queue.entries.filter(e => e.status === STATUS.PENDING || e.status === STATUS.SENDING || (e.status === STATUS.FAILED && e.attempts < o.maxAttempts));
    if (!queue.stopped && !remaining.length) queue.finishedAt = o.now();
    return summarizeQueue(queue);
  }

  function stopQueue(queue) { queue.stopped = true; }

  function resumeNormalize(queue) {
    for (const e of queue.entries) if (e.status === STATUS.SENDING) e.status = STATUS.PENDING;
    queue.stopped = false;
    return queue;
  }

  function summarizeQueue(queue) {
    const s = { total: queue.entries.length };
    for (const k of Object.keys(STATUS)) s[k] = 0;
    for (const e of queue.entries) s[e.status] = (s[e.status] || 0) + 1;
    return s;
  }

  function queueToCsv(queue) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = ['email,name,status,reason,attempts,providerMessageId,error,updatedAt,validityStatus,category,reasonCode,abVariant'];
    for (const e of queue.entries) {
      lines.push([
        e.email, e.name, e.status, e.reason, e.attempts, e.providerMessageId, e.error, e.updatedAt,
        e.validityStatus || 'VALID_FORMAT', e.category || '', e.reasonCode || '', e.abVariant || 'A'
      ].map(q).join(','));
    }
    return lines.join('\r\n');
  }

  function recipientsToCsv(list) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = ['email,name,validityStatus,dnsProvenance,category,filterAction,reasonCode,provenance,confidenceNote'];
    for (const r of (list || [])) {
      lines.push([
        r.email, r.name || '', r.validityStatus || 'VALID_FORMAT', r.dnsProvenance || '',
        r.category || '', r.filterAction || '', r.reasonCode || '', r.provenance || '', r.confidenceNote || ''
      ].map(q).join(','));
    }
    return lines.join('\r\n');
  }

  return {
    STATUS,
    VALIDITY_STATUS,
    CATEGORIES,
    normalizeDomainWithIdn,
    normalizeEmail,
    validateEmail,
    parseDomainSet,
    classifyRecipient,
    filterAndCategorizeRecipients,
    assignAbVariant,
    summarizeAbQueue,
    parseCsv,
    importRecipients,
    parseSuppression,
    isSuppressed,
    buildReview,
    createQueue,
    runQueue,
    stopQueue,
    resumeNormalize,
    summarizeQueue,
    queueToCsv,
    recipientsToCsv
  };
}));
