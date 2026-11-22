'use strict';
/**
 * XPIDER V7.1 Unified Legitimate Deliverability & Anti-Spam Optimizer (Gmail + Resend).
 *
 * Strictly compliance-first best-practice hygiene (ZERO deceptive filter evasion):
 * - Works for BOTH Gmail API (consumer @gmail.com / Google Workspace) AND Resend (vivpr.pro).
 * - Automatically fixes technical spam-filter misconfigurations before send:
 *   1. Foreign-domain spoofing in From displayName (e.g. "vivpr.pro" or "gmail.com" on @gmail.com; foreign TLD on Resend).
 *   2. Cross-domain Reply-To alignment mismatch (optional auto-omission for domain alignment).
 *   3. Broken/default placeholder images (vivpr.pro/images/news.jpg), missing alt attributes, & unsafe HTML tags.
 *   4. Heavy promotional HTML templates -> lightweight conversational natural HTML (default on personal @gmail.com,
 *      opt-in on Resend) with 1:1 text/plain parity, preserving user links, visible unsubscribe footer & physical address.
 *   5. Subject punctuation/shouting cleanup (!!!, ???, $$$, ALL-CAPS) + length hygiene.
 * - Produces a structured AUTO / SEMI_AUTO / MANUAL_GUIDE checklist so Email Studio can apply AUTO fixes in 1 click,
 *   launch SEMI_AUTO diff proposals or preflight checks, and track MANUAL operational best practices.
 * - Transparent 0-100 risk scoring (LOW_RISK / MEDIUM_RISK / HIGH_RISK) with optional pre-send fail-closed block.
 * - NEVER hides/removes RFC 8058 List-Unsubscribe, visible opt-out link, or physical address.
 * - NEVER uses zero-width characters, homoglyphs, hidden text, cloaking, or deceptive Re:/Fwd: prefixes.
 * - NEVER claims guaranteed Primary Inbox placement or account suspension immunity.
 */
const { emailDomain, normalizeEmail } = require('./gmail-account-vault');

const URL_SHORTENER_HOSTS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc', 'rebrand.ly', 'me2.do', 'han.gl'
]);

const DEFAULT_PLACEHOLDER_IMAGES = [
  'https://vivpr.pro/images/news.jpg',
  'http://vivpr.pro/images/news.jpg'
];

const SPAM_TRIGGER_PATTERNS = [
  { code: 'SPAM_PHRASE_FREE_MONEY', re: /\b(free\s+money|guaranteed\s+income|guaranteed\s+profit|act\s+now|click\s+here\s+now|100%\s+free|winner|claim\s+your\s+prize|urgent\s+response)\b/i, label: '고위험 영문 스팸 유도 표현' },
  { code: 'SPAM_PHRASE_KR_PROMO', re: /(100%\s*(?:보장|확정)|무조건\s*무료|무료\s*증정|긴급\s*클릭|지금\s*당장|초특가|한정\s*특가|당첨\s*(?:안내|보장)|최저가\s*보장|수익\s*보장|확정\s*수익|선착순\s*마감)/u, label: '고위험 국문 광고·긴급 유도 표현' },
  { code: 'FAKE_REPLY_PREFIX', re: /^\s*(re|fwd|fw|회신|전달)\s*:/i, label: '실제 회신이 아닌 Re:/Fwd: 접두어' }
];

const DOMAIN_LIKE_RE = /\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|io|co|kr|pro|plus|ai|app|dev|biz|info|shop|store|xyz|me|us|uk))\b/gi;

const DEFAULT_BOILERPLATE_SUBJECTS = new Set([
  'vivpr.pro 서비스 안내',
  '[xpider gmail self-test]'
]);

const HONEST_OPTIMIZER_DISCLAIMER =
  '자동·반자동 스팸 방지 최적화는 스팸 오탐의 기술적 원인(도메인 불일치·깨진 이미지·과도한 마케팅 HTML·스팸 문구 등)을 줄이는 정당한 위생 기능이며, 100% 받은편지함(Primary) 배치나 계정 정지 면제를 보장하지 않습니다.';

function stripHtmlToPlain(html, { dropDefaultVivprCta = false } = {}) {
  let s = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  // Preserve real explicit links as "label (url)" unless it's the default placeholder vivpr.pro CTA
  s = s.replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const label = String(inner || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanHref = String(href || '').trim();
    if (dropDefaultVivprCta && /^https?:\/\/(?:www\.)?vivpr\.pro(?:\/.*)?$/i.test(cleanHref)) {
      return label;
    }
    if (!label || label.toLowerCase() === cleanHref.toLowerCase()) return cleanHref;
    return `${label} (${cleanHref})`;
  });
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractUrls(str) {
  const matches = String(str || '').match(/https?:\/\/[^\s"'<>()]+/gi) || [];
  const hosts = new Set();
  const shorteners = new Set();
  const insecureHttp = new Set();
  for (const raw of matches) {
    try {
      const u = new URL(raw);
      const h = u.hostname.toLowerCase().replace(/^www\./, '');
      hosts.add(h);
      if (URL_SHORTENER_HOSTS.has(h)) shorteners.add(h);
      if (u.protocol === 'http:' && h !== '127.0.0.1' && h !== 'localhost') insecureHttp.add(raw);
    } catch (_) {}
  }
  return {
    count: matches.length,
    urls: matches,
    hosts: Array.from(hosts),
    shorteners: Array.from(shorteners),
    insecureHttp: Array.from(insecureHttp)
  };
}

function deriveSafeDisplayName(rawDisplayName, fromEmail, provider = 'GMAIL') {
  const senderDom = emailDomain(fromEmail);
  const trimmed = String(rawDisplayName || '').replace(/[\r\n\0]+/g, ' ').trim();
  const isConsumer = senderDom === 'gmail.com' || senderDom === 'googlemail.com';
  const isResend = String(provider || 'GMAIL').toUpperCase() === 'RESEND';

  const domMatches = trimmed.match(DOMAIN_LIKE_RE) || [];
  const foreignDomains = domMatches.filter(d => d.toLowerCase() !== senderDom);
  const isBareGmailDomainName = isConsumer && /^(gmail|googlemail)\.com$/i.test(trimmed);

  if (foreignDomains.length === 0 && trimmed && !isBareGmailDomainName) {
    return { value: trimmed, fixed: false, foreignDomains: [] };
  }

  // Strip foreign domain TLD suffixes cleanly (e.g. "vivpr.pro" -> "Vivpr", "ACME-BRAND.COM" -> "ACME-BRAND")
  let cleaned = isBareGmailDomainName ? '' : trimmed;
  for (const fd of foreignDomains) {
    const base = fd.split('.')[0];
    // On consumer Gmail, never impersonate default Resend domain "vivpr.pro"
    if (isConsumer && fd.toLowerCase() === 'vivpr.pro' && trimmed.toLowerCase() === 'vivpr.pro') {
      const local = String(fromEmail || '').split('@')[0] || 'Sender';
      const niceLocal = local.replace(/[._-]+/g, ' ').trim();
      cleaned = niceLocal ? niceLocal.charAt(0).toUpperCase() + niceLocal.slice(1) : 'Sender';
      break;
    }
    cleaned = cleaned.replace(new RegExp(fd.replace(/\./g, '\\.'), 'gi'), base);
  }
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  if (!cleaned) {
    if (isResend && senderDom) {
      cleaned = senderDom;
    } else {
      const local = String(fromEmail || '').split('@')[0] || 'Sender';
      const niceLocal = local.replace(/[._-]+/g, ' ').trim();
      cleaned = niceLocal ? niceLocal.charAt(0).toUpperCase() + niceLocal.slice(1) : 'Sender';
    }
  }
  return {
    value: cleaned,
    fixed: cleaned !== trimmed,
    foreignDomains: isBareGmailDomainName ? [trimmed] : foreignDomains
  };
}

function buildLightweightNaturalHtml(plainText) {
  const lines = String(plainText || '').replace(/\r\n/g, '\n').split('\n');
  const paras = [];
  let buf = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (buf.length) {
        paras.push(buf.join('<br>'));
        buf = [];
      }
    } else {
      const linked = escapeHtml(line.trim()).replace(
        /(https?:\/\/[^\s<]+)/gi,
        '<a href="$1" style="color:#1a73e8;text-decoration:underline;">$1</a>'
      );
      buf.push(linked);
    }
  }
  if (buf.length) paras.push(buf.join('<br>'));
  const inner = paras.map(p => `<p style="margin:0 0 12px 0;">${p}</p>`).join('\n');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.65;color:#202124;">\n${inner}\n</div>`;
}

function cleanSubjectHygiene(subject) {
  const orig = String(subject || '').replace(/[\r\n\0]+/g, ' ').trim();
  if (!orig) return { value: orig, fixed: false, reasons: [] };
  let s = orig;
  const reasons = [];

  const noBurst = s.replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?').replace(/\${2,}/g, '$');
  if (noBurst !== s) {
    s = noBurst;
    reasons.push('COLLAPSED_EXCESSIVE_PUNCTUATION');
  }

  const normWs = s.replace(/\s{2,}/g, ' ').trim();
  if (normWs !== s) {
    s = normWs;
    reasons.push('NORMALIZED_WHITESPACE');
  }

  const asciiLetters = s.replace(/[^A-Za-z]/g, '');
  const upperLetters = s.replace(/[^A-Z]/g, '');
  if (asciiLetters.length >= 12 && (upperLetters.length / asciiLetters.length) >= 0.85) {
    s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    reasons.push('DE_SHOUTED_ALL_CAPS_SUBJECT');
  }

  return { value: s, fixed: s !== orig, reasons };
}

function softenSpamPhrasesInCopy(str, isSubject = false) {
  let s = String(str || '');
  if (isSubject) {
    s = s.replace(/^(?:\s*(?:re|fwd|fw|회신|전달)\s*:\s*)+/i, '');
  }
  return s
    .replace(/!{2,}/g, '.')
    .replace(/\?{2,}/g, '?')
    .replace(/\${2,}/g, '$')
    .replace(/100%\s*(보장|확정)/gi, '안내')
    .replace(/무조건\s*무료/gi, '무료 안내')
    .replace(/무료\s*증정/gi, '혜택 안내')
    .replace(/긴급\s*클릭/gi, '내용 확인')
    .replace(/지금\s*당장/gi, '편하신 시간에')
    .replace(/초특가|한정\s*특가/gi, '프로모션 안내')
    .replace(/당첨\s*(안내|보장)/gi, '이벤트 안내')
    .replace(/최저가\s*보장/gi, '가격 안내')
    .replace(/(수익|확정)\s*(보장|수익)/gi, '서비스 안내')
    .replace(/선착순\s*마감/gi, '일정 안내')
    .replace(/\bfree\s+money\b/gi, 'special offer')
    .replace(/\bguaranteed\s+(income|profit)\b/gi, 'service update')
    .replace(/\bact\s+now\b/gi, 'learn more')
    .replace(/\bclick\s+here\s+now\b/gi, 'view details')
    .replace(/\b100%\s+free\b/gi, 'complimentary')
    .replace(/\bclaim\s+your\s+prize\b/gi, 'view event details')
    .replace(/\burgent\s+response\b/gi, 'follow-up')
    .replace(/안\s+녕하세요/g, '안녕하세요')
    .replace(/되요/g, '돼요')
    .replace(/할께요/g, '할게요')
    .replace(/뵙겠읍니다/g, '뵙겠습니다')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function optimizeAndScoreEmailMessage({
  provider = 'GMAIL',
  from = '',
  displayName = '',
  replyTo = '',
  subject = '',
  preheader = '',
  html = '',
  text = '',
  link = '',
  physicalAddress = '',
  publicUnsubBase = 'https://unsubscribe.vivpr.pro',
  historicalBounceRatePct = 0,
  suppressedCount = 0,
  hygieneChecked = false,
  autoOptimize = true,
  autoAlignReplyTo = true,
  preferLightweightHtml = undefined
} = {}) {
  const normProvider = String(provider || 'GMAIL').toUpperCase() === 'RESEND' ? 'RESEND' : 'GMAIL';
  const defaultFrom = normProvider === 'RESEND' ? 'noreply@vivpr.pro' : '';
  const normFrom = normalizeEmail(from || defaultFrom) || defaultFrom;
  const senderDom = emailDomain(normFrom) || (normProvider === 'RESEND' ? 'vivpr.pro' : '');
  const isConsumerGmail = normProvider === 'GMAIL' && (senderDom === 'gmail.com' || senderDom === 'googlemail.com');
  const effectiveLightweight = preferLightweightHtml !== undefined
    ? Boolean(preferLightweightHtml)
    : (normProvider === 'GMAIL');

  let outDisplayName = String(displayName || '').trim();
  let outReplyTo = String(replyTo || '').trim();
  let outSubject = String(subject || '').trim();
  let outHtml = String(html || '');
  let outText = String(text || '');
  const cleanPreheader = String(preheader || '').trim();
  const cleanLink = String(link || '').trim();

  const autoFixesApplied = [];
  const signals = [];
  const recommendations = [];
  const checklist = [];

  // 1. [AUTO] Display-Name Foreign-Domain Spoofing Check & Auto-Fix
  const dnCheck = deriveSafeDisplayName(outDisplayName, normFrom, normProvider);
  if (dnCheck.foreignDomains.length > 0) {
    if (autoOptimize) {
      autoFixesApplied.push({
        code: 'AUTO_FIX_DISPLAY_NAME_DOMAIN_MISMATCH',
        detail: `발신 표시 이름의 타 도메인("${outDisplayName}")을 스팸 오탐 방지용 안전 표시 이름("${dnCheck.value}")으로 자동 보정했습니다.`
      });
      outDisplayName = dnCheck.value;
      checklist.push({
        id: 'DISPLAY_NAME_ALIGNMENT',
        category: 'HEADER_AUTH',
        mode: 'AUTO',
        status: 'AUTO_FIXED',
        title: '발신자 표시 이름 도메인 정합성',
        detail: `발신 도메인(${senderDom || normProvider})과 충돌하는 타 도메인 표시 이름을 "${outDisplayName}"(으)로 자동 보정합니다.`,
        providers: ['GMAIL', 'RESEND'],
        autoFixCode: 'AUTO_FIX_DISPLAY_NAME_DOMAIN_MISMATCH'
      });
    } else {
      signals.push({
        code: 'DISPLAY_NAME_FOREIGN_DOMAIN_SPOOF_RISK',
        points: 25,
        severity: 'HIGH',
        message: `발신 표시 이름("${outDisplayName}")에 발신 도메인(${senderDom})과 다른 도메인(${dnCheck.foreignDomains.join(', ')})이 포함되어 사칭/스팸 필터 위험이 매우 높습니다.`
      });
      checklist.push({
        id: 'DISPLAY_NAME_ALIGNMENT',
        category: 'HEADER_AUTH',
        mode: 'AUTO',
        status: 'ACTION_REQUIRED',
        title: '발신자 표시 이름 도메인 정합성',
        detail: `표시 이름("${outDisplayName}")에 타 도메인(${dnCheck.foreignDomains.join(', ')}) 포함 — 자동 보정 활성화를 권장합니다.`,
        providers: ['GMAIL', 'RESEND'],
        semiAutoAction: 'APPLY_AUTO_FIXES'
      });
    }
  } else {
    checklist.push({
      id: 'DISPLAY_NAME_ALIGNMENT',
      category: 'HEADER_AUTH',
      mode: 'AUTO',
      status: 'PASS',
      title: '발신자 표시 이름 도메인 정합성',
      detail: `표시 이름("${outDisplayName || senderDom || '기본값'}")이 발신 도메인(${senderDom || normProvider})과 충돌하지 않습니다.`,
      providers: ['GMAIL', 'RESEND']
    });
  }

  // 2. [AUTO] Reply-To Alignment Check & Auto-Alignment
  let replyToStatus = 'PASS';
  let replyToDetail = outReplyTo ? `Reply-To(${outReplyTo})가 발신 도메인(${senderDom})과 정렬되어 있습니다.` : '외부 도메인 Reply-To 불일치가 없습니다.';
  if (outReplyTo) {
    const rtNorm = normalizeEmail(outReplyTo);
    const rtDom = rtNorm ? emailDomain(rtNorm) : '';
    if (rtDom && senderDom && rtDom !== senderDom) {
      if (autoOptimize && autoAlignReplyTo) {
        autoFixesApplied.push({
          code: 'AUTO_ALIGN_REPLY_TO_OMITTED_MISMATCH',
          detail: `발신 도메인(${senderDom})과 불일치하는 외부 Reply-To(${rtDom}) 헤더를 자동 생략하여 발신자 정렬을 맞췄습니다.`
        });
        outReplyTo = '';
        replyToStatus = 'AUTO_FIXED';
        replyToDetail = `발신 도메인(${senderDom})과 다른 외부 Reply-To(${rtDom})를 발송 시 자동 생략하여 정렬합니다.`;
      } else {
        signals.push({
          code: 'REPLY_TO_DOMAIN_MISMATCH',
          points: normProvider === 'GMAIL' ? 20 : 12,
          severity: 'MEDIUM',
          message: `Reply-To 도메인(${rtDom})이 발신 도메인(${senderDom})과 달라 스팸 점수가 상승합니다.`
        });
        replyToStatus = 'WARN';
        replyToDetail = `외부 Reply-To(${rtDom})와 발신 도메인(${senderDom}) 불일치 — 자동 정렬 옵션을 켜거나 동일 도메인 주소를 권장합니다.`;
      }
    }
  }
  checklist.push({
    id: 'REPLY_TO_ALIGNMENT',
    category: 'HEADER_AUTH',
    mode: 'AUTO',
    status: replyToStatus,
    title: 'Reply-To 발신 도메인 정렬',
    detail: replyToDetail,
    providers: ['GMAIL', 'RESEND']
  });

  // 3. [AUTO] Subject Hygiene Cleanup & Length Check
  const subjCheck = cleanSubjectHygiene(outSubject);
  const subjTooLong = outSubject.length > 65;
  if (subjCheck.fixed && autoOptimize) {
    autoFixesApplied.push({
      code: 'AUTO_FIX_SUBJECT_HYGIENE',
      detail: `제목의 과도한 문장부호/대문자(${subjCheck.reasons.join(', ')})를 자동 정리했습니다.`
    });
    outSubject = subjCheck.value;
  } else if (subjCheck.fixed) {
    signals.push({
      code: 'SUBJECT_PUNCTUATION_OR_SHOUTING',
      points: 10,
      severity: 'LOW',
      message: '제목에 과도한 느낌표/물음표 또는 전체 대문자 표기가 있습니다.'
    });
  }
  if (subjTooLong) {
    signals.push({
      code: 'SUBJECT_TOO_LONG',
      points: 5,
      severity: 'LOW',
      message: `제목 길이가 ${outSubject.length}자입니다. 60자 이내의 간결한 제목이 수신함 표시 및 스팸 방지에 유리합니다.`
    });
  }
  checklist.push({
    id: 'SUBJECT_HYGIENE',
    category: 'COPY_HYGIENE',
    mode: 'AUTO',
    status: subjCheck.fixed ? (autoOptimize ? 'AUTO_FIXED' : 'ACTION_REQUIRED') : (subjTooLong ? 'WARN' : 'PASS'),
    title: '제목 문장부호 · 대문자 · 길이(65자 이내) 위생',
    detail: subjCheck.fixed
      ? (autoOptimize ? `과도한 문장부호/대문자를 "${outSubject}"(으)로 자동 정리합니다.` : '과도한 느낌표/물음표/대문자가 감지되었습니다.')
      : (subjTooLong ? `제목이 ${outSubject.length}자로 깁니다. 60자 이내로 줄이기를 권장합니다.` : `제목 위생 양호 (${outSubject.length}자).`),
    providers: ['GMAIL', 'RESEND']
  });

  // 4. [AUTO] Unsafe HTML Tags, Missing Img Alt & Default Dead Placeholder Image Cleanup
  let htmlCleaned = outHtml;
  const hadUnsafeTags = /<(script|iframe|object|embed|form)\b/i.test(htmlCleaned);
  if (hadUnsafeTags) {
    if (autoOptimize) {
      htmlCleaned = htmlCleaned
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/<object[\s\S]*?<\/object>/gi, '')
        .replace(/<form[\s\S]*?<\/form>/gi, '')
        .replace(/<embed\b[^>]*>/gi, '');
      autoFixesApplied.push({
        code: 'AUTO_REMOVED_UNSAFE_HTML_TAGS',
        detail: '스팸 차단 원인이 되는 <script>/<iframe>/<form> 태그를 자동 제거했습니다.'
      });
    } else {
      signals.push({
        code: 'UNSAFE_HTML_TAGS_PRESENT',
        points: 30,
        severity: 'HIGH',
        message: '이메일 HTML에 <script>/<iframe>/<form> 등 스팸 필터 차단 태그가 포함되어 있습니다.'
      });
    }
  }

  let removedPlaceholderImg = false;
  for (const ph of DEFAULT_PLACEHOLDER_IMAGES) {
    if (htmlCleaned.toLowerCase().includes(ph)) {
      if (autoOptimize) {
        htmlCleaned = htmlCleaned.replace(new RegExp(`<img\\b[^>]*${ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>`, 'gi'), '');
        removedPlaceholderImg = true;
      } else {
        signals.push({
          code: 'DEAD_PLACEHOLDER_IMAGE_URL',
          points: 15,
          severity: 'MEDIUM',
          message: `기본 샘플 이미지 URL(${ph})이 남아 있어 깨진 이미지 스팸 감점 위험이 있습니다.`
        });
      }
    }
  }
  if (removedPlaceholderImg) {
    autoFixesApplied.push({
      code: 'AUTO_REMOVED_PLACEHOLDER_IMAGE',
      detail: '존재하지 않는 기본 샘플 이미지 태그(vivpr.pro/images/news.jpg)를 자동 제거했습니다.'
    });
  }

  // Add safe empty alt attribute to any remaining <img> missing alt=
  let fixedMissingAlt = false;
  if (autoOptimize && /<img\b(?![^>]*\balt=)[^>]*>/i.test(htmlCleaned)) {
    htmlCleaned = htmlCleaned.replace(/<img\b(?![^>]*\balt=)([^>]*)>/gi, '<img alt=""$1>');
    fixedMissingAlt = true;
    autoFixesApplied.push({
      code: 'AUTO_ADDED_MISSING_IMG_ALT',
      detail: 'alt 속성이 누락된 이미지 태그에 접근성·스팸 위생용 alt 속성을 자동 보완했습니다.'
    });
  }
  outHtml = htmlCleaned;

  checklist.push({
    id: 'UNSAFE_HTML_AND_PLACEHOLDER_IMG',
    category: 'CONTENT_HTML',
    mode: 'AUTO',
    status: (hadUnsafeTags || removedPlaceholderImg || fixedMissingAlt)
      ? (autoOptimize ? 'AUTO_FIXED' : 'ACTION_REQUIRED')
      : 'PASS',
    title: '위험 HTML 태그 · 깨진 샘플 이미지 · alt 속성 위생',
    detail: (hadUnsafeTags || removedPlaceholderImg || fixedMissingAlt)
      ? (autoOptimize ? '위험 태그/깨진 기본 샘플 이미지/누락 alt를 발송 전 자동 정리합니다.' : '위험 태그 또는 깨진 샘플 이미지가 남아 있습니다.')
      : '위험 HTML 태그 및 깨진 기본 샘플 이미지 없음.',
    providers: ['GMAIL', 'RESEND']
  });

  // 5. [AUTO] Lightweight Natural HTML Conversion & 102KB Gmail Clipping Guard
  const plainFromHtml = stripHtmlToPlain(outHtml, { dropDefaultVivprCta: isConsumerGmail && autoOptimize });
  let effectivePlain = outText.trim() || plainFromHtml;
  const isHeavyTemplateHtml = /<table\b|background-color\s*:|border-radius\s*:/i.test(outHtml) || outHtml.length > Math.max(1200, effectivePlain.length * 4);
  let convertedLightweight = false;
  if (autoOptimize && effectiveLightweight && (isConsumerGmail || normProvider === 'RESEND') && isHeavyTemplateHtml && effectivePlain.length > 0) {
    outHtml = buildLightweightNaturalHtml(effectivePlain);
    outText = effectivePlain;
    convertedLightweight = true;
    autoFixesApplied.push({
      code: 'AUTO_CONVERTED_LIGHTWEIGHT_NATURAL_HTML',
      detail: normProvider === 'GMAIL'
        ? '개인 @gmail.com 계정의 프로모션/스팸 분류를 줄이기 위해 무거운 마케팅 템플릿 HTML을 자연형 경량 HTML(텍스트·HTML 1:1 일치)로 자동 변환했습니다.'
        : 'Resend 발송용 무거운 템플릿 HTML을 자연형 경량 HTML(텍스트·HTML 1:1 일치)로 자동 변환했습니다.'
    });
  } else if (isConsumerGmail && isHeavyTemplateHtml) {
    signals.push({
      code: 'HEAVY_PROMOTIONAL_HTML_ON_PERSONAL_GMAIL',
      points: 15,
      severity: 'MEDIUM',
      message: '개인 @gmail.com 계정에서 무거운 마케팅 버튼/박스 HTML을 전송하면 스팸·프로모션 분류 확률이 높아집니다.'
    });
  }

  const htmlByteSize = Buffer.byteLength(outHtml, 'utf8');
  const htmlClipRisk = htmlByteSize > 95000;
  if (htmlClipRisk) {
    signals.push({
      code: 'HTML_SIZE_GMAIL_CLIPPING_RISK',
      points: 10,
      severity: 'MEDIUM',
      message: `HTML 크기가 ${Math.round(htmlByteSize / 1024)}KB로 Gmail 102KB 잘림(Clipping) 한도에 근접/초과했습니다.`
    });
    recommendations.push('HTML 용량을 95KB 이하로 줄여 Gmail 수신함 잘림과 수신거부 링크 숨김을 방지하세요.');
  }
  checklist.push({
    id: 'LIGHTWEIGHT_HTML_AND_SIZE',
    category: 'CONTENT_HTML',
    mode: 'AUTO',
    status: convertedLightweight ? 'AUTO_FIXED' : ((isConsumerGmail && isHeavyTemplateHtml) || htmlClipRisk ? 'WARN' : 'PASS'),
    title: '경량 자연형 HTML 및 102KB 용량 보호',
    detail: convertedLightweight
      ? `자연형 경량 HTML로 자동 변환 적용 (${Math.round(htmlByteSize / 1024 * 10) / 10}KB).`
      : (htmlClipRisk
        ? `HTML 용량 ${Math.round(htmlByteSize / 1024)}KB — 95KB 이하 권장.`
        : (isConsumerGmail && isHeavyTemplateHtml
          ? '개인 @gmail.com에서는 자연형 경량 HTML 옵션 활성화를 권장합니다.'
          : `HTML 구조 및 용량(${Math.round(htmlByteSize / 1024 * 10) / 10}KB) 양호.`)),
    providers: ['GMAIL', 'RESEND']
  });

  // 6. [AUTO] Ensure text/plain and text/html stay aligned
  const finalVisibleHtmlText = stripHtmlToPlain(outHtml);
  let syncedPlain = false;
  if (autoOptimize && finalVisibleHtmlText.length > 0) {
    if (!outText.trim()) {
      outText = finalVisibleHtmlText;
      syncedPlain = true;
    } else {
      const lenRatio = Math.min(outText.trim().length, finalVisibleHtmlText.length) / Math.max(outText.trim().length, finalVisibleHtmlText.length);
      if (lenRatio < 0.45) {
        outText = finalVisibleHtmlText;
        syncedPlain = true;
        autoFixesApplied.push({
          code: 'AUTO_SYNCED_PLAIN_TEXT_PARITY',
          detail: 'HTML 본문과 일반 텍스트(text/plain)의 불일치를 해소하기 위해 1:1 동기화했습니다.'
        });
      }
    }
  }
  checklist.push({
    id: 'TEXT_PLAIN_PARITY',
    category: 'CONTENT_HTML',
    mode: 'AUTO',
    status: syncedPlain ? 'AUTO_FIXED' : 'PASS',
    title: 'HTML ↔ 일반 텍스트(text/plain) 1:1 일치',
    detail: syncedPlain ? 'HTML 본문과 일반 텍스트를 1:1로 자동 동기화했습니다.' : '멀티파트 HTML/텍스트 정합성 양호.',
    providers: ['GMAIL', 'RESEND']
  });

  // 7. [AUTO] RFC 2047 UTF-8 Folding + RFC 5322 Date Header
  checklist.push({
    id: 'RFC2047_AND_DATE_HEADER',
    category: 'HEADER_AUTH',
    mode: 'AUTO',
    status: 'PASS',
    title: normProvider === 'GMAIL' ? 'RFC 2047 한글 제목 멀티라인 인코딩 & Date 헤더' : 'Resend 표준 UTF-8 헤더 & 멱등성 키',
    detail: normProvider === 'GMAIL'
      ? '긴 한글 제목 42바이트 RFC 2047 자동 분할 및 RFC 5322 Date 헤더가 MIME 생성 시 자동 적용됩니다.'
      : 'Resend API 표준 UTF-8 헤더, Idempotency-Key 및 인증된 noreply@vivpr.pro 발신 주소가 자동 적용됩니다.',
    providers: ['GMAIL', 'RESEND']
  });

  // 8. [AUTO] RFC 8058 One-Click Unsubscribe & Cross-Provider Suppression
  const hasPublicHttpsUnsub = /^https:\/\/(?!127\.0\.0\.1|localhost\b)[a-z0-9.-]+\.[a-z]{2,}/i.test(String(publicUnsubBase || ''));
  checklist.push({
    id: 'RFC8058_UNSUBSCRIBE_AND_SUPPRESSION',
    category: 'COMPLIANCE',
    mode: 'AUTO',
    status: hasPublicHttpsUnsub ? 'PASS' : 'ACTION_REQUIRED',
    title: 'RFC 8058 원클릭 수신거부 + 교차 차단 자동 제외',
    detail: hasPublicHttpsUnsub
      ? `List-Unsubscribe-Post 원클릭 헤더 및 가시적 푸터 자동 삽입 활성 (교차 차단 ${Number(suppressedCount || 0)}건 자동 제외).`
      : '공개 HTTPS 수신거부 기본 URL이 설정되지 않았습니다.',
    providers: ['GMAIL', 'RESEND']
  });

  // 9. [SEMI_AUTO] Spam Trigger Phrases & Fake Re:/Fwd:
  const combinedText = `${outSubject}\n${outText || finalVisibleHtmlText}`;
  const matchedPhrases = [];
  for (const pat of SPAM_TRIGGER_PATTERNS) {
    if (pat.re.test(pat.code === 'FAKE_REPLY_PREFIX' ? outSubject : combinedText)) {
      const pts = pat.code === 'FAKE_REPLY_PREFIX' ? 20 : 12;
      matchedPhrases.push(pat.label);
      signals.push({ code: pat.code, points: pts, severity: 'MEDIUM', message: `${pat.label}이(가) 감지되었습니다.` });
    }
  }
  checklist.push({
    id: 'SPAM_PHRASE_COPY_CLEANUP',
    category: 'COPY_HYGIENE',
    mode: 'SEMI_AUTO',
    status: matchedPhrases.length > 0 ? 'ACTION_REQUIRED' : 'PASS',
    title: '스팸 유도 문구 · 거짓 Re:/Fwd: 문구 교정',
    detail: matchedPhrases.length > 0
      ? `${matchedPhrases.join(', ')} 감지 — [반자동 문구 교정] 버튼으로 원문 대비 완화 제안을 확인 후 수락할 수 있습니다.`
      : '고위험 스팸 유도 문구 및 거짓 회신 접두어가 감지되지 않았습니다.',
    providers: ['GMAIL', 'RESEND'],
    semiAutoAction: 'OPEN_COPY_DIFF'
  });

  // 10. [SEMI_AUTO] Body Length, Default Boilerplate & Preheader Naturalness
  const visibleLen = (outText || finalVisibleHtmlText).trim().length;
  const isDefaultSubject = DEFAULT_BOILERPLATE_SUBJECTS.has(outSubject.toLowerCase());
  const isDefaultBody = /요청하신 서비스에 대한 안내입니다\.\s*자세한 내용은 아래 링크에서 확인하실 수 있습니다\./.test(outText || finalVisibleHtmlText);
  const missingPreheader = !cleanPreheader;
  if (visibleLen < 45) {
    signals.push({
      code: 'VERY_SHORT_BOILERPLATE_BODY',
      points: 15,
      severity: 'MEDIUM',
      message: `본문 텍스트가 너무 짧습니다(${visibleLen}자). 최소 2~3문장(60자 이상)의 구체적이고 자연스러운 안내문을 작성하세요.`
    });
  }
  if (isConsumerGmail && (isDefaultSubject || isDefaultBody)) {
    signals.push({
      code: 'DEFAULT_SAMPLE_BOILERPLATE_DETECTED',
      points: 10,
      severity: 'LOW',
      message: '기본 샘플 제목/본문("vivpr.pro 서비스 안내")이 그대로 남아 있습니다. 실제 본인 안내 문장으로 수정하면 스팸 오탐이 크게 줄어듭니다.'
    });
  }
  const naturalNeedsAction = visibleLen < 45 || (isConsumerGmail && (isDefaultSubject || isDefaultBody)) || missingPreheader;
  checklist.push({
    id: 'BODY_AND_PREHEADER_NATURALNESS',
    category: 'COPY_HYGIENE',
    mode: 'SEMI_AUTO',
    status: naturalNeedsAction ? 'ACTION_REQUIRED' : 'PASS',
    title: '자연스러운 본문 길이(45자+) · 기본 샘플 교체 · 미리보기 문구',
    detail: naturalNeedsAction
      ? `개선 권장 (본문 ${visibleLen}자${isDefaultSubject || isDefaultBody ? ' · 기본 샘플 문구 포함' : ''}${missingPreheader ? ' · 미리보기 문구 비어있음' : ''}) — [자연스러운 초안 제안]으로 1클릭 비교·적용할 수 있습니다.`
      : `본문 길이(${visibleLen}자)와 미리보기 문구가 자연스럽습니다.`,
    providers: ['GMAIL', 'RESEND'],
    semiAutoAction: 'OPEN_NATURAL_DRAFT_DIFF'
  });

  // 11. [SEMI_AUTO] Links, URL Shorteners, Insecure HTTP & Default Cross-Domain Link
  const urlInfo = extractUrls(`${outHtml}\n${outText}\n${cleanLink}`);
  if (urlInfo.shorteners.length > 0) {
    signals.push({
      code: 'URL_SHORTENER_DETECTED',
      points: 30,
      severity: 'HIGH',
      message: `단축 URL 도메인(${urlInfo.shorteners.join(', ')})이 포함되어 있습니다. 단축 URL은 Gmail 스팸 필터의 최우선 차단 대상입니다.`
    });
    recommendations.push('단축 URL 대신 실제 최종 HTTPS 주소를 직접 기재하세요.');
  }
  if (urlInfo.insecureHttp.length > 0) {
    signals.push({
      code: 'INSECURE_HTTP_LINKS_DETECTED',
      points: 12,
      severity: 'MEDIUM',
      message: `비보안 http:// 링크(${urlInfo.insecureHttp.length}건)가 포함되어 있습니다. 모든 링크를 https://로 변경하세요.`
    });
    recommendations.push('http:// 링크를 https://로 교체하세요.');
  }
  const nonUnsubHosts = urlInfo.hosts.filter(h => h !== 'unsubscribe.vivpr.pro');
  if (nonUnsubHosts.length >= 3) {
    const pts = nonUnsubHosts.length >= 5 ? 25 : 15;
    signals.push({
      code: 'EXCESSIVE_EXTERNAL_LINK_DOMAINS',
      points: pts,
      severity: 'MEDIUM',
      message: `본문에 서로 다른 외부 도메인 링크가 ${nonUnsubHosts.length}개(${nonUnsubHosts.slice(0, 5).join(', ')}) 포함되어 있습니다.`
    });
    recommendations.push('외부 링크 도메인을 1~2개 이내로 최소화하세요.');
  }
  const hasDefaultVivprOnGmail = isConsumerGmail && nonUnsubHosts.includes('vivpr.pro');
  if (hasDefaultVivprOnGmail) {
    signals.push({
      code: 'DEFAULT_CROSS_DOMAIN_LINK_ON_GMAIL',
      points: 10,
      severity: 'LOW',
      message: '개인 @gmail.com 발송 본문에 별도 도메인 링크(vivpr.pro)가 포함되어 있습니다. 테스트 시 실제 본인 서비스 내용·링크로 변경하거나 비우는 것이 좋습니다.'
    });
  }
  const linkNeedsAction = urlInfo.shorteners.length > 0 || urlInfo.insecureHttp.length > 0 || nonUnsubHosts.length >= 3 || hasDefaultVivprOnGmail;
  checklist.push({
    id: 'LINK_HYGIENE_AND_SHORTENER',
    category: 'CONTENT_HTML',
    mode: 'SEMI_AUTO',
    status: linkNeedsAction ? 'ACTION_REQUIRED' : 'PASS',
    title: '링크 위생 (단축 URL 금지 · HTTPS 전용 · 외부 도메인 2개 이하)',
    detail: linkNeedsAction
      ? [
        urlInfo.shorteners.length ? `단축 URL(${urlInfo.shorteners.join(', ')})` : '',
        urlInfo.insecureHttp.length ? `비보안 http:// ${urlInfo.insecureHttp.length}건` : '',
        nonUnsubHosts.length >= 3 ? `외부 도메인 ${nonUnsubHosts.length}개` : '',
        hasDefaultVivprOnGmail ? '개인 Gmail에 기본 vivpr.pro 링크 잔존' : ''
      ].filter(Boolean).join(' · ')
      : `링크 위생 양호 (외부 도메인 ${nonUnsubHosts.length}개 · 단축 URL 0건).`,
    providers: ['GMAIL', 'RESEND'],
    semiAutoAction: 'CLEAN_DEFAULT_LINK_OR_FOCUS'
  });

  // 12. [SEMI_AUTO] Physical Address Footer
  const hasPhysicalAddr = String(physicalAddress || '').trim().length >= 6;
  if (!hasPhysicalAddr) {
    signals.push({
      code: 'PHYSICAL_ADDRESS_MISSING',
      points: 10,
      severity: 'LOW',
      message: '푸터 법적 물리적 주소가 비어 있습니다. 실제 사업장 주소를 기재하세요.'
    });
  }
  checklist.push({
    id: 'PHYSICAL_ADDRESS_FOOTER',
    category: 'COMPLIANCE',
    mode: 'SEMI_AUTO',
    status: hasPhysicalAddr ? 'PASS' : 'ACTION_REQUIRED',
    title: '법적 물리적 사업장 주소 기재 (Resend ↔ Gmail 동기화)',
    detail: hasPhysicalAddr
      ? '물리적 주소가 입력되어 발송 푸터에 포함됩니다.'
      : '물리적 주소가 비어 있습니다 — [주소 동기화/입력 이동] 버튼으로 즉시 입력·동기화하세요.',
    providers: ['GMAIL', 'RESEND'],
    semiAutoAction: 'SYNC_OR_FOCUS_ADDRESS'
  });

  // 13. [SEMI_AUTO] Provider Domain Auth & Structural Notes
  if (isConsumerGmail) {
    signals.push({
      code: 'CONSUMER_GMAIL_STRUCTURAL_LIMIT',
      points: 15,
      severity: 'LOW',
      message: '개인 @gmail.com 계정은 맞춤 도메인 SPF/DKIM/DMARC 정렬이 불가하며, RFC 8058 수신거부 호스트(unsubscribe.vivpr.pro)와 도메인이 달라 초기 스팸 오탐 가능성이 남습니다.'
    });
    recommendations.push('가장 높은 받은편지함 도달률을 위해서는 Google Workspace 맞춤 도메인 계정(SPF/DKIM/DMARC 일치) 또는 이미 인증된 Resend(vivpr.pro) 사용을 권장합니다.');
    recommendations.push('최초 본인 테스트 메일이 스팸함에 들어간 경우, 수신함에서 [스팸 아님(Not spam)]을 한 번 표시하면 Google 평판 학습에 도움이 됩니다.');
  }
  if (Number(historicalBounceRatePct) >= 5.0) {
    signals.push({
      code: 'ELEVATED_HISTORICAL_BOUNCE_SIGNAL',
      points: 10,
      severity: 'LOW',
      message: `교차 과거 반송률(${historicalBounceRatePct}%)이 높습니다. 교차 차단 원장이 반송/수신거부 주소를 자동 제외합니다.`
    });
  }
  checklist.push({
    id: 'PROVIDER_AUTH_AND_HYGIENE',
    category: 'HEADER_AUTH',
    mode: 'SEMI_AUTO',
    status: hygieneChecked ? 'PASS' : 'WARN',
    title: normProvider === 'GMAIL' ? 'Gmail 발신 위생 · SPF/DMARC · Reply-To 점검' : 'Resend(vivpr.pro) DNS · SPF/DKIM/DMARC · 웹훅 점검',
    detail: normProvider === 'GMAIL'
      ? (isConsumerGmail
        ? '개인 @gmail.com은 공급자 관리 SPF/DKIM 사용 — [발신 위생 점검 실행]으로 도메인·차단 목록 상태를 최신 확인하세요.'
        : 'Workspace 맞춤 도메인 SPF/DKIM/DMARC 정렬 여부를 [발신 위생 점검 실행]으로 확인하세요.')
      : '인증 도메인 vivpr.pro의 SPF/DKIM/DMARC 및 웹훅 상태를 [운영 DNS·수신거부 점검 실행]으로 확인하세요.',
    providers: ['GMAIL', 'RESEND'],
    semiAutoAction: 'RUN_PROVIDER_HYGIENE'
  });

  // 14. [MANUAL_GUIDE] Operational Best-Practice Checklist (4 user-checkable items; Not-Spam includes 1-click official Gmail Spam deep-link helper)
  const spamReviewHelper = buildGmailSpamSearchHelper({
    provider: normProvider,
    from: normFrom,
    subject: outSubject
  });
  checklist.push(
    {
      id: 'MANUAL_NOT_SPAM_TRAIN',
      category: 'OPERATIONAL',
      mode: 'MANUAL_GUIDE',
      status: 'MANUAL_PENDING',
      title: '[반자동 안내] 스팸함에 들어간 직전 테스트 메일 바로 열기 → [스팸 아님(Not spam)] 1회 클릭',
      detail: '버튼을 누르면 방금 보낸 테스트 메일이 검색된 공식 Gmail 스팸함이 바로 열립니다. Google 정책 준수(최소 권한 gmail.send 유지 · 자동 클릭 봇 미사용)를 위해 열린 메일에서 본인이 직접 [스팸 아님]을 1회 클릭하세요.',
      providers: ['GMAIL', 'RESEND'],
      semiAutoAction: 'OPEN_GMAIL_SPAM_NOT_SPAM_HELPER',
      helper: spamReviewHelper
    },
    {
      id: 'MANUAL_WORKSPACE_OR_RESEND',
      category: 'OPERATIONAL',
      mode: 'MANUAL_GUIDE',
      status: 'MANUAL_PENDING',
      title: '[수동] 대량/공지 발송 시 Google Workspace 맞춤 도메인 또는 인증된 Resend(vivpr.pro) 우선 사용',
      detail: '개인 @gmail.com은 소량·사전 승인 수신자 전용으로 보수적 상한 내에서만 운영하세요.',
      providers: ['GMAIL', 'RESEND']
    },
    {
      id: 'MANUAL_UNSUB_ROUNDTRIP',
      category: 'OPERATIONAL',
      mode: 'MANUAL_GUIDE',
      status: 'MANUAL_PENDING',
      title: '[수동] 수신거부 링크 1회 클릭 → 동일 주소 재발송 차단(교차 차단) 확인',
      detail: '본인 테스트 수신함에서 하단 수신거부를 클릭한 뒤 재발송 시 자동 차단되는지 검증합니다.',
      providers: ['GMAIL', 'RESEND']
    },
    {
      id: 'MANUAL_ROTATE_EXPOSED_CREDS',
      category: 'OPERATIONAL',
      mode: 'MANUAL_GUIDE',
      status: 'MANUAL_PENDING',
      title: '[수동] 스크린샷·외부에 노출된 API 키 / Google OAuth Client Secret 교체 확인',
      detail: '테스트 완료 후 노출 이력이 있는 시크릿은 공급자 콘솔에서 재발급해 로컬 보안 저장소에 갱신하세요.',
      providers: ['GMAIL', 'RESEND']
    }
  );

  const riskScore = Math.min(100, signals.reduce((acc, s) => acc + (Number(s.points) || 0), 0));
  const grade = riskScore >= 55 ? 'HIGH_RISK' : (riskScore >= 25 ? 'MEDIUM_RISK' : 'LOW_RISK');

  const checklistSummary = {
    total: checklist.length,
    autoTotal: checklist.filter(c => c.mode === 'AUTO').length,
    autoPassed: checklist.filter(c => c.mode === 'AUTO' && c.status === 'PASS').length,
    autoFixed: checklist.filter(c => c.mode === 'AUTO' && c.status === 'AUTO_FIXED').length,
    semiAutoTotal: checklist.filter(c => c.mode === 'SEMI_AUTO').length,
    semiAutoActionNeeded: checklist.filter(c => c.mode === 'SEMI_AUTO' && (c.status === 'ACTION_REQUIRED' || c.status === 'WARN')).length,
    manualTotal: checklist.filter(c => c.mode === 'MANUAL_GUIDE').length
  };

  return {
    ok: true,
    provider: normProvider,
    senderDomain: senderDom,
    riskScore,
    grade,
    autoOptimizeApplied: Boolean(autoOptimize),
    autoFixesApplied,
    signals,
    recommendations,
    checklist,
    checklistSummary,
    spamReviewHelper,
    optimized: {
      displayName: outDisplayName,
      replyTo: outReplyTo,
      subject: outSubject,
      html: outHtml,
      text: outText
    },
    honestDisclaimer: HONEST_OPTIMIZER_DISCLAIMER
  };
}

function buildGmailSpamSearchHelper({ recipient = '', from = '', subject = '', provider = 'GMAIL' } = {}) {
  const normProvider = String(provider || 'GMAIL').toUpperCase() === 'RESEND' ? 'RESEND' : 'GMAIL';
  const cleanRecipient = normalizeEmail(String(recipient || '').replace(/[\r\n\0]+/g, '').trim()) || '';
  const cleanFromRaw = String(from || '').replace(/[\r\n\0]+/g, '').trim();
  const cleanFrom = (!cleanFromRaw.includes('*') && normalizeEmail(cleanFromRaw)) || '';
  const cleanSubject = String(subject || '').replace(/[\r\n\0"]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 80);

  const terms = ['in:spam'];
  if (normProvider === 'RESEND') {
    terms.push('from:vivpr.pro');
  } else if (cleanFrom) {
    terms.push(`from:${cleanFrom}`);
  }
  if (cleanSubject) {
    terms.push(`subject:"${cleanSubject}"`);
  }
  const query = terms.join(' ');
  const basePath = cleanRecipient
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(cleanRecipient)}`
    : 'https://mail.google.com/mail/u/0/';
  const searchUrl = `${basePath}#search/${encodeURIComponent(query)}`;
  const spamFolderUrl = `${basePath}#spam`;

  return {
    ok: true,
    provider: normProvider,
    query,
    searchUrl,
    spamFolderUrl,
    authUserBound: Boolean(cleanRecipient),
    policyNote: 'Google 정책 준수 및 최소 권한(gmail.send) 유지: XPIDER는 Gmail 받은편지함 DOM을 자동 클릭하거나 gmail.modify 권한을 요구하지 않습니다. 공식 Gmail 스팸함 검색 결과로 바로 이동해 본인이 직접 [스팸 아님(Not spam)]을 1회 클릭하도록 지원합니다.'
  };
}

function optimizeAndScoreGmailMessage(opts = {}) {
  return optimizeAndScoreEmailMessage({ provider: 'GMAIL', ...opts });
}

module.exports = {
  optimizeAndScoreEmailMessage,
  optimizeAndScoreGmailMessage,
  buildGmailSpamSearchHelper,
  softenSpamPhrasesInCopy,
  deriveSafeDisplayName,
  buildLightweightNaturalHtml,
  cleanSubjectHygiene,
  stripHtmlToPlain,
  HONEST_OPTIMIZER_DISCLAIMER
};
