'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EmailProductionPipeline, extractAndValidateAiCopyJson } = require('../companion/email-production-pipeline');

(async () => {
  // 1. Valid JSON
  const valid = extractAndValidateAiCopyJson(
    JSON.stringify({ subject: '제목', preheader: '미리보기', heading: '헤더', body: '본문 내용' }),
    { safeSubject: '제목', safeBody: '본문 내용' }
  );
  assert.strictEqual(valid.subject, '제목');
  assert.strictEqual(valid.body, '본문 내용');
  console.log('PASS 1: valid JSON');

  // 2. Markdown-fenced JSON
  const fenced = extractAndValidateAiCopyJson(
    '```json\n{"subject":"수정 제목","preheader":"미리보기","heading":"헤더","body":"수정 본문"}\n```',
    { safeSubject: '제목', safeBody: '본문' }
  );
  assert.strictEqual(fenced.subject, '수정 제목');
  console.log('PASS 2: markdown-fenced JSON');

  // 3. Leading/trailing prose around JSON
  const prose = extractAndValidateAiCopyJson(
    'Here is the polished copy:\n{"subject":"교정 제목","preheader":"요약","heading":"제목","body":"교정 본문"}\nHope this helps!',
    { safeSubject: '제목', safeBody: '본문' }
  );
  assert.strictEqual(prose.body, '교정 본문');
  console.log('PASS 3: leading/trailing prose extraction');

  // 4. Unescaped control characters inside JSON string
  const ctrl = extractAndValidateAiCopyJson(
    '{"subject":"제목","preheader":"요약","heading":"헤더","body":"첫째 줄\n둘째\t줄"}',
    { safeSubject: '제목', safeBody: '본문' }
  );
  assert.ok(ctrl.body.includes('첫째 줄\n둘째\t줄'));
  console.log('PASS 4: control char repair inside JSON strings');

  // 5. Truncated JSON (MAX_TOKENS) fails closed
  assert.throws(
    () => extractAndValidateAiCopyJson('{"subject":"제목","preheader":"요약","heading":"헤더","body":"잘림', { finishReason: 'MAX_TOKENS' }),
    (err) => err.code === 'INVALID_AI_RESPONSE' && /MALFORMED_AI_JSON/.test(err.message) && /MAX_TOKENS/.test(err.message)
  );
  console.log('PASS 5: truncated JSON fail-closed with finishReason');

  // 6. Non-JSON & schema mismatch fail closed
  assert.throws(
    () => extractAndValidateAiCopyJson('죄송하지만 요청을 처리할 수 없습니다.'),
    (err) => err.code === 'INVALID_AI_RESPONSE'
  );
  assert.throws(
    () => extractAndValidateAiCopyJson(JSON.stringify({ subject: '제목', preheader: '요약', heading: '헤더' })),
    (err) => err.code === 'INVALID_AI_RESPONSE'
  );
  console.log('PASS 6: non-JSON & schema mismatch fail-closed');

  // 7. Unsafe HTML / XSS blocked
  assert.throws(
    () => extractAndValidateAiCopyJson(JSON.stringify({
      subject: '제목',
      preheader: '요약',
      heading: '헤더',
      body: '안녕하세요 <script>alert(1)</script>'
    })),
    (err) => err.code === 'UNSAFE_AI_HTML_BLOCKED'
  );
  console.log('PASS 7: unsafe HTML/script blocked');

  // 8. Controlled retry (1st malformed -> 2nd valid) & double failure + rules-only fallback
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-gemini-repair-'));
  try {
    let calls = 0;
    const p = new EmailProductionPipeline({
      stateDir: tmpDir,
      trustedTestMode: true,
      geminiHttpRequest: async () => {
        calls++;
        if (calls === 1) {
          return {
            statusCode: 200,
            body: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"subject":"잘림' }] } }] }
          };
        }
        return {
          statusCode: 200,
          body: {
            candidates: [{
              finishReason: 'STOP',
              content: {
                parts: [
                  { thought: true, text: 'internal reasoning' },
                  { text: '```json\n{"subject":"재시도 성공 제목","preheader":"미리보기","heading":"헤더","body":"재시도 성공 본문"}\n```' }
                ]
              }
            }]
          }
        };
      }
    });

    const retried = await p.invokeGeminiGenerateContent({
      apiKey: 'AIzaTestFakeKeyForUnitTest123456',
      model: 'gemini-2.5-flash',
      draft: { subject: '원본 제목', preheader: '요약', heading: '헤더', body: '원본 본문' }
    });
    assert.strictEqual(calls, 2);
    assert.strictEqual(retried.subject, '재시도 성공 제목');
    console.log('PASS 8: controlled retry & non-thought part extraction');

    // Double failure preserves original template and rules-only mode works
    const pFail = new EmailProductionPipeline({
      stateDir: tmpDir,
      trustedTestMode: true,
      geminiHttpRequest: async () => ({
        statusCode: 200,
        body: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"broken' }] } }] }
      })
    });
    pFail.resolveGeminiFlashModel = async () => 'gemini-2.5-flash';
    pFail.saveAiCopyApiKey({ apiKey: 'AIzaTestFakeKeyForUnitTest123456', userConsentConfirmed: true });
    const qaFail = await pFail.evaluateContentQaAndSuggestCopy({
      mode: 'AI',
      draft: {
        subject: '원본 제목!!!',
        preheader: '원본 미리보기',
        heading: '원본 헤더',
        body: '원본 본문입니다.'
      },
      optInConsent: true
    });
    assert.strictEqual(qaFail.ok, false);
    assert.strictEqual(qaFail.reason, 'INVALID_AI_RESPONSE');

    const rulesOnly = await pFail.evaluateContentQaAndSuggestCopy({
      mode: 'RULE_BASED',
      draft: {
        subject: '원본 제목!!!',
        preheader: '원본 미리보기',
        heading: '원본 헤더',
        body: '원본 본문입니다.'
      }
    });
    assert.strictEqual(rulesOnly.ok, true);
    assert.ok(Array.isArray(rulesOnly.diffs) && rulesOnly.diffs.length > 0);
    console.log('PASS 9: double failure fail-closed & rules-only fallback');
    console.log('ALL GEMINI JSON REPAIR TESTS PASSED (9/9)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();
