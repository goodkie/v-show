'use strict';
/**
 * XPIDER V7.1 Legitimate Automatic Deliverability & Spam-Risk Optimizer.
 *
 * Strictly compliance-first best-practice hygiene (ZERO deceptive filter evasion):
 * - Eliminates technical spam-filter misconfigurations automatically before send:
 *   1. Foreign-domain spoofing in From displayName (e.g. "vivpr.pro" on @gmail.com).
 *   2. Cross-domain Reply-To alignment mismatch on consumer @gmail.com accounts.
 *   3. Broken/default placeholder images (e.g. vivpr.pro/images/news.jpg) & unsafe HTML tags.
 *   4. Heavy promotional HTML templates -> lightweight conversational natural HTML for personal Gmail
 *      with 1:1 text/plain parity (preserving visible unsubscribe link & physical address intact!).
 *   5. Subject punctuation/shouting cleanup (excessive !!!, ???).
 * - Transparent 0-100 risk scoring (LOW_RISK / MEDIUM_RISK / HIGH_RISK) with optional pre-send block.
 * - NEVER hides/removes RFC 8058 List-Unsubscribe, visible opt-out link, or physical address.
 * - NEVER uses zero-width characters, homoglyphs, hidden text, cloaking, or false Re:/Fwd: prefixes.
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
  { code: 'SPAM_PHRASE_FREE_MONEY', re: /\b(free\s+money|guaranteed\s+income|act\s+now|click\s+here\s+now|100%\s+free|winner|claim\s+your\s+prize|urgent\s+response)\b/i, label: '고위험 영문 스팸 유도 표현' },
  { code: 'SPAM_PHRASE_KR_PROMO', re: /(100%\s*보장|무료\s*증정|긴급\s*클릭|지금\s*당장|초특가|한정\s*특가|당첨\s*안내|최저가\s*보장|수익\s*보장|선착순\s*마감)/u, label: '고위험 국문 광고·긴급 유도 표현' },
  { code: 'FAKE_REPLY_PREFIX', re: /^\s*(re|fwd|fw)\s*:/i, label: '실제 회신이 아닌 Re:/Fwd: 접두어' }
];

const DOMAIN_LIKE_RE = /\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|io|co|kr|pro|plus|ai|app|dev|biz|info|shop|store|xyz|me|us|uk))\b/gi;

const HONEST_OPTIMIZER_DISCLAIMER =
  '자동 스팸 방지 최적화는 스팸 오탐의 기술적 원인(도메인 불일치·깨진 이미지·과도한 마케팅 HTML 등)을 줄이는 정당한 위생 기능이며, 100% 받은편지함(Primary) 배치나 계정 정지 면제를 보장하지 않습니다.';

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
  for (const raw of matches) {
    try {
      const u = new URL(raw);
      const h = u.hostname.toLowerCase().replace(/^www\./, '');
      hosts.add(h);
      if (URL_SHORTENER_HOSTS.has(h)) shorteners.add(h);
    } catch (_) {}
  }
  return { count: matches.length, urls: matches, hosts: Array.from(hosts), shorteners: Array.from(shorteners) };
}

function deriveSafeDisplayName(rawDisplayName, fromEmail) {
  const senderDom = emailDomain(fromEmail);
  const trimmed = String(rawDisplayName || '').trim();
  const isConsumer = senderDom === 'gmail.com' || senderDom === 'googlemail.com';

  // Extract domain-like tokens inside displayName
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
    // If the entire display name was just the default Resend domain "vivpr.pro" on a consumer gmail account,
    // use the Gmail account's clean local-part label instead of impersonating vivpr.pro
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
    const local = String(fromEmail || '').split('@')[0] || 'Sender';
    const niceLocal = local.replace(/[._-]+/g, ' ').trim();
    cleaned = niceLocal ? niceLocal.charAt(0).toUpperCase() + niceLocal.slice(1) : 'Sender';
  }
  return { value: cleaned, fixed: cleaned !== trimmed, foreignDomains: isBareGmailDomainName ? [trimmed] : foreignDomains };
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
      // Linkify explicit https:// URLs cleanly as normal text links (no heavy promotional CTA buttons)
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
  const orig = String(subject || '').trim();
  if (!orig) return { value: orig, fixed: false, reasons: [] };
  let s = orig;
  const reasons = [];

  // Collapse excessive punctuation (!!! -> !, ??? -> ?, $$$ -> $)
  const noBurst = s.replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?').replace(/\${2,}/g, '$');
  if (noBurst !== s) {
    s = noBurst;
    reasons.push('COLLAPSED_EXCESSIVE_PUNCTUATION');
  }

  // Collapse excessive whitespace
  const normWs = s.replace(/\s{2,}/g, ' ').trim();
  if (normWs !== s) {
    s = normWs;
    reasons.push('NORMALIZED_WHITESPACE');
  }

  // Convert ALL-CAPS ASCII shouting subjects (>= 12 letters, >= 85% uppercase) to natural sentence case
  const asciiLetters = s.replace(/[^A-Za-z]/g, '');
  const upperLetters = s.replace(/[^A-Z]/g, '');
  if (asciiLetters.length >= 12 && (upperLetters.length / asciiLetters.length) >= 0.85) {
    s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    reasons.push('DE_SHOUTED_ALL_CAPS_SUBJECT');
  }

  return { value: s, fixed: s !== orig, reasons };
}

function optimizeAndScoreGmailMessage({
  from = '',
  displayName = '',
  replyTo = '',
  subject = '',
  html = '',
  text = '',
  physicalAddress = '',
  historicalBounceRatePct = 0,
  autoOptimize = true,
  autoAlignReplyTo = true,
  preferLightweightHtml = true
} = {}) {
  const normFrom = normalizeEmail(from) || '';
  const senderDom = emailDomain(normFrom);
  const isConsumerGmail = senderDom === 'gmail.com' || senderDom === 'googlemail.com';

  let outDisplayName = String(displayName || '').trim();
  let outReplyTo = String(replyTo || '').trim();
  let outSubject = String(subject || '').trim();
  let outHtml = String(html || '');
  let outText = String(text || '');

  const autoFixesApplied = [];
  const signals = [];
  const recommendations = [];

  // 1. Display-Name Foreign-Domain Spoofing Check & Auto-Fix
  const dnCheck = deriveSafeDisplayName(outDisplayName, normFrom);
  if (dnCheck.foreignDomains.length > 0) {
    if (autoOptimize) {
      autoFixesApplied.push({
        code: 'AUTO_FIX_DISPLAY_NAME_DOMAIN_MISMATCH',
        detail: `발신 표시 이름의 타 도메인("${outDisplayName}")을 스팸 오탐 방지용 안전 표시 이름("${dnCheck.value}")으로 자동 보정했습니다.`
      });
      outDisplayName = dnCheck.value;
    } else {
      signals.push({
        code: 'DISPLAY_NAME_FOREIGN_DOMAIN_SPOOF_RISK',
        points: 25,
        severity: 'HIGH',
        message: `발신 표시 이름("${outDisplayName}")에 발신 도메인(${senderDom})과 다른 도메인(${dnCheck.foreignDomains.join(', ')})이 포함되어 Gmail 사칭/스팸 필터 위험이 매우 높습니다.`
      });
    }
  }

  // 2. Reply-To Alignment Check & Auto-Alignment
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
      } else {
        signals.push({
          code: 'REPLY_TO_DOMAIN_MISMATCH',
          points: 20,
          severity: 'MEDIUM',
          message: `Reply-To 도메인(${rtDom})이 발신 도메인(${senderDom})과 달라 스팸 점수가 상승합니다.`
        });
      }
    }
  }

  // 3. Subject Hygiene Cleanup
  const subjCheck = cleanSubjectHygiene(outSubject);
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

  // 4. Unsafe HTML Tags & Default Dead Placeholder Image Cleanup
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
  outHtml = htmlCleaned;

  // Also strip boilerplate default placeholder link "https://vivpr.pro" on consumer Gmail when converting to lightweight HTML
  const plainFromHtml = stripHtmlToPlain(outHtml, { dropDefaultVivprCta: isConsumerGmail && autoOptimize });
  let effectivePlain = outText.trim() || plainFromHtml;

  // 5. Lightweight Personal-Style Natural HTML Mode (especially impactful for consumer @gmail.com!)
  const isHeavyTemplateHtml = /<table\b|background-color\s*:|border-radius\s*:/i.test(outHtml) || outHtml.length > Math.max(1200, effectivePlain.length * 4);
  if (autoOptimize && preferLightweightHtml && isConsumerGmail && isHeavyTemplateHtml && effectivePlain.length > 0) {
    // Strip dead default sample CTA line pointing to vivpr.pro if user didn't customize brand to vivpr.pro
    outHtml = buildLightweightNaturalHtml(effectivePlain);
    outText = effectivePlain;
    autoFixesApplied.push({
      code: 'AUTO_CONVERTED_LIGHTWEIGHT_NATURAL_HTML',
      detail: '개인 @gmail.com 계정의 프로모션/스팸 분류를 줄이기 위해 무거운 마케팅 템플릿 HTML을 자연형 경량 HTML(텍스트·HTML 1:1 일치)로 자동 변환했습니다.'
    });
  } else if (isConsumerGmail && isHeavyTemplateHtml) {
    signals.push({
      code: 'HEAVY_PROMOTIONAL_HTML_ON_PERSONAL_GMAIL',
      points: 15,
      severity: 'MEDIUM',
      message: '개인 @gmail.com 계정에서 무거운 마케팅 버튼/박스 HTML을 전송하면 스팸·프로모션 분류 확률이 높아집니다.'
    });
  }

  // Ensure text/plain and text/html stay aligned (Gmail penalizes severely mismatched multipart/alternative)
  const finalVisibleHtmlText = stripHtmlToPlain(outHtml);
  if (autoOptimize && outText.trim() && finalVisibleHtmlText.length > 0) {
    const lenRatio = Math.min(outText.trim().length, finalVisibleHtmlText.length) / Math.max(outText.trim().length, finalVisibleHtmlText.length);
    if (lenRatio < 0.45) {
      outText = finalVisibleHtmlText;
      autoFixesApplied.push({
        code: 'AUTO_SYNCED_PLAIN_TEXT_PARITY',
        detail: 'HTML 본문과 일반 텍스트(text/plain)의 불일치를 해소하기 위해 1:1 동기화했습니다.'
      });
    }
  }

  // 6. Score Remaining Objective Deliverability Risks (Post-Optimization)
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

  // Check spam trigger patterns in Subject + visible body
  const combinedText = `${outSubject}\n${outText || finalVisibleHtmlText}`;
  let phrasePoints = 0;
  for (const pat of SPAM_TRIGGER_PATTERNS) {
    if (pat.re.test(pat.code === 'FAKE_REPLY_PREFIX' ? outSubject : combinedText)) {
      const pts = pat.code === 'FAKE_REPLY_PREFIX' ? 20 : 12;
      phrasePoints = Math.min(30, phrasePoints + pts);
      signals.push({ code: pat.code, points: pts, severity: 'MEDIUM', message: `${pat.label}이(가) 감지되었습니다.` });
    }
  }

  // Check links & URL shorteners
  const urlInfo = extractUrls(`${outHtml}\n${outText}`);
  if (urlInfo.shorteners.length > 0) {
    signals.push({
      code: 'URL_SHORTENER_DETECTED',
      points: 30,
      severity: 'HIGH',
      message: `단축 URL 도메인(${urlInfo.shorteners.join(', ')})이 포함되어 있습니다. 단축 URL은 Gmail 스팸 필터의 최우선 차단 대상입니다.`
    });
    recommendations.push('단축 URL 대신 실제 최종 HTTPS 주소를 직접 기재하세요.');
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
  if (isConsumerGmail && nonUnsubHosts.includes('vivpr.pro')) {
    signals.push({
      code: 'DEFAULT_CROSS_DOMAIN_LINK_ON_GMAIL',
      points: 10,
      severity: 'LOW',
      message: '개인 @gmail.com 발송 본문에 별도 도메인 링크(vivpr.pro)가 포함되어 있습니다. 테스트 시 실제 본인 서비스 내용·링크로 변경하는 것이 좋습니다.'
    });
  }

  // Check body length / boilerplate
  const visibleLen = (outText || finalVisibleHtmlText).trim().length;
  if (visibleLen < 45) {
    signals.push({
      code: 'VERY_SHORT_BOILERPLATE_BODY',
      points: 15,
      severity: 'MEDIUM',
      message: `본문 텍스트가 너무 짧습니다(${visibleLen}자). 최소 2~3문장(60자 이상)의 구체적이고 자연스러운 안내문을 작성하세요.`
    });
  }

  // Physical address check
  if (String(physicalAddress || '').trim().length < 6) {
    signals.push({
      code: 'PHYSICAL_ADDRESS_MISSING',
      points: 10,
      severity: 'LOW',
      message: '푸터 법적 물리적 주소가 비어 있습니다. 실제 사업장 주소를 기재하세요.'
    });
  }

  // Historical bounce rate signal
  if (Number(historicalBounceRatePct) >= 5.0) {
    signals.push({
      code: 'ELEVATED_HISTORICAL_BOUNCE_SIGNAL',
      points: 10,
      severity: 'LOW',
      message: `교차 과거 반송률(${historicalBounceRatePct}%)이 높습니다. 교차 차단 원장이 반송/수신거부 주소를 자동 제외합니다.`
    });
  }

  const riskScore = Math.min(100, signals.reduce((acc, s) => acc + (Number(s.points) || 0), 0));
  const grade = riskScore >= 55 ? 'HIGH_RISK' : (riskScore >= 25 ? 'MEDIUM_RISK' : 'LOW_RISK');

  return {
    ok: true,
    riskScore,
    grade,
    autoOptimizeApplied: Boolean(autoOptimize),
    autoFixesApplied,
    signals,
    recommendations,
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

module.exports = {
  optimizeAndScoreGmailMessage,
  deriveSafeDisplayName,
  buildLightweightNaturalHtml,
  cleanSubjectHygiene,
  stripHtmlToPlain,
  HONEST_OPTIMIZER_DISCLAIMER
};
