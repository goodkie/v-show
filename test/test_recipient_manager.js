'use strict';
const assert = require('node:assert/strict');
const RM = require('../extension/email-studio/recipient-manager');

let pass = 0;
async function t(name, fn) { await fn(); pass++; console.log('PASS ' + name); }

(async () => {
  await t('CSV_IMPORT_HEADER_DEDUPE_INVALID_ROLE', async () => {
    const csv = 'email,name\r\nA@Example.com,"Kim, A"\r\na@example.com,Dup\r\nbad@,X\r\nnoreply@x.com,R\r\nb@example.org,B\r\n';
    const r = RM.importRecipients(csv);
    assert.equal(r.valid.length, 2);
    assert.equal(r.valid[0].email, 'a@example.com');
    assert.equal(r.valid[0].name, 'Kim, A');
    assert.equal(r.duplicates.length, 1);
    assert.equal(r.invalid.length, 2);
    assert.deepEqual(r.invalid.map(i => i.reason).sort(), ['INVALID_FORMAT', 'ROLE_ADDRESS']);
  });

  await t('CSV_NO_HEADER_AND_BOM_AND_SEMICOLON', async () => {
    const r = RM.importRecipients('\uFEFFx@a.com;Xx\ny@b.com;Yy');
    assert.equal(r.valid.length, 2);
  });

  await t('SUPPRESSION_EMAIL_AND_DOMAIN_OPT_OUT', async () => {
    const sup = RM.parseSuppression('blocked@a.com, @bad.org\nnotanemail');
    assert.equal(RM.isSuppressed('blocked@a.com', sup), true);
    assert.equal(RM.isSuppressed('x@bad.org', sup), true);
    assert.equal(RM.isSuppressed('ok@a.com', sup), false);
  });

  await t('MARKETING_REQUIRES_CONSENT_ATTESTATION', async () => {
    const recips = [{ email: 'a@a.com' }, { email: 'b@b.com' }, { email: 'c@bad.org' }];
    const sup = RM.parseSuppression('@bad.org');
    const noAtt = RM.buildReview(recips, sup, { messageKind: 'marketing', consentAttestation: false });
    assert.deepEqual(noAtt.summary, { total: 3, ready: 0, suppressed: 1, noConsent: 2 });
    const att = RM.buildReview(recips, sup, { messageKind: 'marketing', consentAttestation: true });
    assert.deepEqual(att.summary, { total: 3, ready: 2, suppressed: 1, noConsent: 0 });
    const svc = RM.buildReview(recips, sup, { messageKind: 'service', consentAttestation: false });
    assert.equal(svc.summary.ready, 2);
  });

  await t('QUEUE_RUN_IDEMPOTENT_NO_DUPLICATE_SEND_AND_RETRY_LIMIT', async () => {
    const rv = RM.buildReview([{ email: 'a@a.com' }, { email: 'b@b.com' }, { email: 'c@c.com' }], new Set(), { messageKind: 'service' });
    const q = RM.createQueue(rv.entries);
    const calls = {};
    const sender = async (e) => {
      calls[e.email] = (calls[e.email] || 0) + 1;
      if (e.email === 'b@b.com') return { ok: false, error: 'PROVIDER_ERROR' };
      return { ok: true, providerMessageId: 'm_' + e.email };
    };
    let s = await RM.runQueue(q, sender, { maxAttempts: 2 });
    assert.equal(s.ACCEPTED, 2);
    assert.equal(s.FAILED, 1);
    s = await RM.runQueue(q, sender, { maxAttempts: 2 });   // retries only failed
    assert.equal(calls['a@a.com'], 1);
    assert.equal(calls['c@c.com'], 1);
    assert.equal(calls['b@b.com'], 2);
    s = await RM.runQueue(q, sender, { maxAttempts: 2 });   // attempts exhausted -> no more calls
    assert.equal(calls['b@b.com'], 2);
    assert.ok(q.finishedAt);
  });

  await t('STOP_RESUME_NO_DUPLICATE_AND_INTERRUPTED_SENDING_RESET', async () => {
    const rv = RM.buildReview([{ email: 'a@a.com' }, { email: 'b@b.com' }, { email: 'c@c.com' }], new Set(), { messageKind: 'service' });
    const q = RM.createQueue(rv.entries);
    const calls = [];
    const sender = async (e) => { calls.push(e.email); if (calls.length === 1) RM.stopQueue(q); return { ok: true, providerMessageId: 'x' }; };
    await RM.runQueue(q, sender);
    assert.deepEqual(calls, ['a@a.com']);
    q.entries[1].status = 'SENDING'; // simulate crash mid-send
    RM.resumeNormalize(q);
    assert.equal(q.entries[1].status, 'PENDING');
    await RM.runQueue(q, async (e) => { calls.push(e.email); return { ok: true }; });
    assert.deepEqual(calls, ['a@a.com', 'b@b.com', 'c@c.com']);
  });

  await t('DRY_RUN_NEVER_MARKS_ACCEPTED_AND_SKIPPED_NEVER_SENT', async () => {
    const rv = RM.buildReview([{ email: 'a@a.com' }, { email: 'z@bad.org' }], RM.parseSuppression('@bad.org'), { messageKind: 'service' });
    const q = RM.createQueue(rv.entries);
    let sent = 0;
    const s = await RM.runQueue(q, async () => { sent++; return { ok: true, dryRun: true }; });
    assert.equal(sent, 1);
    assert.equal(s.ACCEPTED, 0);
    assert.equal(s.DRY_RUN_READY, 1);
    assert.equal(s.SKIPPED_SUPPRESSED, 1);
  });

  await t('CSV_EXPORT_ESCAPES_QUOTES', async () => {
    const q = RM.createQueue([{ email: 'a@a.com', name: 'Q"uote', status: 'PENDING', reason: null, attempts: 0 }]);
    assert.ok(RM.queueToCsv(q).includes('"Q""uote"'));
  });

  await t('IDN_PUNYCODE_DISPOSABLE_AND_CONFIGURABLE_ROLE_POLICY', async () => {
    const csv = [
      'email,name',
      'ceo@스타트업.kr,한글도메인기업',
      'temp@mailinator.com,일회용',
      'noreply@sme-biz.co.kr,발신전용',
      'valid@sme-biz.co.kr,중소기업담당자'
    ].join('\n');
    const r1 = RM.importRecipients(csv);
    assert.equal(r1.valid.length, 2);
    assert.ok(r1.valid[0].email.startsWith('ceo@xn--'));
    assert.deepEqual(r1.invalid.map(i => i.reason).sort(), ['DISPOSABLE_DOMAIN', 'ROLE_ADDRESS']);

    const rAllow = RM.importRecipients(csv, { allowDisposable: true, allowRoleAddresses: true });
    assert.equal(rAllow.valid.length, 4);
  });

  await t('SME_CATEGORY_FILTERING_EXCLUSIONS_AMBIGUOUS_REVIEW_AND_OVERRIDES', async () => {
    const sample = [
      { email: 'owner@naver.com', name: '개인네이버' },
      { email: 'user@gmail.com', name: '개인지메일' },
      { email: 'officer@seoul.go.kr', name: '서울시청' },
      { email: 'prof@snu.ac.kr', name: '서울대학교' },
      { email: 'seller@coupang.com', name: '쿠팡마켓' },
      { email: 'pm@navercorp.com', name: '네이버플랫폼' },
      { email: 'exec@samsung.com', name: '삼성전자' },
      { email: 'help@my-flower-shop.co.kr', name: '자체쇼핑몰의심' },
      { email: 'ir@alpha-holdings.co.kr', name: '알파홀딩스계열사의심' },
      { email: 'ceo@vivid-design-studio.co.kr', name: '비비드디자인스튜디오' },
      { email: 'partner@hanbit-precision.kr', name: '한빛정밀기계' }
    ];

    const res = RM.filterAndCategorizeRecipients(sample, { smeOnlyMode: true });
    assert.equal(res.retained.length, 2);
    assert.deepEqual(res.retained.map(r => r.email), [
      'ceo@vivid-design-studio.co.kr',
      'partner@hanbit-precision.kr'
    ]);
    assert.equal(res.excluded.length, 7);
    assert.equal(res.review.length, 2);
    assert.deepEqual(res.review.map(r => r.email), [
      'help@my-flower-shop.co.kr',
      'ir@alpha-holdings.co.kr'
    ]);
    assert.equal(res.categoryCounts.PERSONAL_FREE_EMAIL, 2);
    assert.equal(res.categoryCounts.GOV_PUBLIC_SECTOR, 2);
    assert.equal(res.categoryCounts.ECOMMERCE_MARKETPLACE, 1);
    assert.equal(res.categoryCounts.PORTAL_PLATFORM, 1);
    assert.equal(res.categoryCounts.LARGE_ENTERPRISE, 1);
    assert.equal(res.categoryCounts.UNKNOWN_REVIEW, 2);
    assert.equal(res.categoryCounts.SMALL_PRIVATE_BUSINESS, 2);
    assert.ok(res.retained[0].confidenceNote.includes('기업 규모 100% 확정 불가'));

    // Test manual override & custom SME include domain
    const resOverride = RM.filterAndCategorizeRecipients(sample, {
      smeOnlyMode: true,
      customSmeIncludeDomains: 'my-flower-shop.co.kr',
      customExcludeDomains: 'hanbit-precision.kr'
    });
    assert.deepEqual(resOverride.retained.map(r => r.email), [
      'help@my-flower-shop.co.kr',
      'ceo@vivid-design-studio.co.kr'
    ]);
  });

  await t('DETERMINISTIC_AB_VARIANT_SPLIT_NON_DUPLICATE_IDS_AND_SEPARATE_CSV_EXPORTS', async () => {
    const recips = [];
    for (let i = 1; i <= 20; i++) {
      recips.push({ email: `b2b_${i}@sme-${i}.co.kr`, name: `SME ${i}` });
    }
    const rv1 = RM.buildReview(recips, new Set(), {
      messageKind: 'marketing',
      consentAttestation: true,
      abEnabled: true,
      campaignId: 'camp_det_1',
      splitPercentA: 50
    });
    const rv2 = RM.buildReview(recips, new Set(), {
      messageKind: 'marketing',
      consentAttestation: true,
      abEnabled: true,
      campaignId: 'camp_det_1',
      splitPercentA: 50
    });
    // Deterministic across runs
    assert.deepEqual(rv1.entries.map(e => e.abVariant), rv2.entries.map(e => e.abVariant));
    // Non-duplicate recipientIds
    const idSet = new Set(rv1.entries.map(e => e.recipientId));
    assert.equal(idSet.size, 20);

    const q = RM.createQueue(rv1.entries);
    await RM.runQueue(q, async () => ({ ok: true, dryRun: true }));
    const abSum = RM.summarizeAbQueue(q, { campaignId: 'camp_det_1', splitPercentA: 50 });
    assert.equal(abSum.uniqueRecipientsCount, 20);
    assert.equal(abSum.duplicateRecipientIds, 0);
    assert.equal(abSum.variants.A.assigned + abSum.variants.B.assigned, 20);
    assert.ok(abSum.variants.A.assigned > 0 && abSum.variants.B.assigned > 0);
    assert.equal(abSum.variants.A.DRY_RUN_READY + abSum.variants.B.DRY_RUN_READY, 20);
    assert.equal(abSum.variants.A.ACCEPTED + abSum.variants.B.ACCEPTED, 0);

    const csvText = RM.recipientsToCsv(rv1.entries);
    assert.ok(csvText.includes('validityStatus,dnsProvenance,category'));
  });

  await t('KOREAN_MULTICOLUMN_QUOTED_MULTILINE_AND_MULTI_EMAIL_CSV', () => {
    const koreanCsv = [
      '\uFEFF상호명,웹사이트 URL,웹사이트 유형,URL 출처,업종 검토,연결 리드 수,Lead IDs,이메일,전화번호,영업 상태',
      '"한빛정밀, (주)",https://hanbit-precision.kr,자사몰,"Google\nSearch",제조,1,L-101,sales@hanbit-precision.kr,02-111-2222,신규',
      '"비비드\n스튜디오",https://vivid-design.co.kr,블로그,Naver,"디자인, 브랜딩",2,"L-102, L-103","ceo@vivid-design.co.kr, hello@vivid-design.co.kr",02-333-4444,접촉중',
      '"빈이메일업체",https://empty.co.kr,자사몰,Naver,유통,1,L-104,,02-555-6666,대기',
      '"잘못된형식",https://bad.co.kr,자사몰,Naver,유통,1,L-105,not-an-email,02-777-8888,대기'
    ].join('\n');

    const res = RM.importRecipients(koreanCsv);
    assert.equal(res.headerDetected, true);
    assert.equal(res.emailColumnName, '이메일');
    assert.equal(res.sourceRowCount, 4);
    assert.equal(res.discoveredEmailCount, 4);
    assert.equal(res.valid.length, 3);
    assert.equal(res.valid[0].name, '한빛정밀, (주)');
    assert.equal(res.valid[1].email, 'ceo@vivid-design.co.kr');
    assert.equal(res.valid[2].email, 'hello@vivid-design.co.kr');
    assert.equal(res.emptyEmailCount, 1);
    assert.equal(res.badEmailCount, 1);
    assert.equal(res.invalid.some(i => i.reason === 'EMPTY_EMAIL'), true);
    assert.equal(res.invalid.some(i => i.reason === 'INVALID_FORMAT'), true);
  });

  console.log(`\nALL RECIPIENT MANAGER TESTS PASSED (${pass}/${pass})`);
})().catch(e => { console.error(e); process.exit(1); });
