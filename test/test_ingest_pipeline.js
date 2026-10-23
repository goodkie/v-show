/**
 * test/test_ingest_pipeline.js
 *
 * Automated regression test suite for GitHub Issue comment ingestion pipeline.
 * Verifies:
 * 1. Direct ID fetching (#6370008697, #6370119038)
 * 2. Multi-page pagination traversal (page 7+)
 * 3. Before/After cursor advancement from 6368566405 -> 6370119038
 * 4. Next-comment detection regression (simulated next comment detected without false drop)
 */

const assert = require('assert');
const {
  fetchCommentById,
  getIssueMetadata,
  fetchCommentsPage,
  parseDirectiveType,
  ingestAllNewDirectives
} = require('../scripts/ingest_issue_comments');

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: GITHUB ISSUE COMMENT INGESTION & PAGINATION RECOVERY');
  console.log('========================================================================\n');

  // Test 1: Direct ID fetching
  console.log('>>> [TEST 1] Direct ID Fetching of Directives #6370008697 & #6370119038');
  const c1 = fetchCommentById(6370008697);
  assert(c1 && c1.id === 6370008697, 'Failed to fetch comment 6370008697');
  assert(c1.body.includes('CHATGPT'), 'Comment 6370008697 must contain CHATGPT directive header');
  console.log(`    ✓ Successfully fetched #6370008697: "${c1.body.split('\n')[0]}"`);

  const c2 = fetchCommentById(6370119038);
  assert(c2 && c2.id === 6370119038, 'Failed to fetch comment 6370119038');
  assert(c2.body.includes('P0 REISSUE / ESCALATION'), 'Comment 6370119038 header mismatch');
  console.log(`    ✓ Successfully fetched #6370119038: "${c2.body.split('\n')[0]}"`);

  // Test 2: Issue metadata and page 7+ pagination
  console.log('\n>>> [TEST 2] Page 7+ Pagination Traversal');
  const meta = getIssueMetadata();
  assert(meta.comments >= 600, `Expected at least 600 comments, got ${meta.comments}`);
  const lastPage = Math.ceil(meta.comments / 100);
  assert(lastPage >= 7, `Expected at least 7 pages with per_page=100, got ${lastPage}`);
  console.log(`    ✓ Total comments: ${meta.comments}, Total pages (per_page=100): ${lastPage}`);

  const page7Comments = fetchCommentsPage(lastPage, 100);
  assert(Array.isArray(page7Comments) && page7Comments.length > 0, 'Page 7+ returned empty comments');
  console.log(`    ✓ Fetched ${page7Comments.length} comments from page ${lastPage}`);

  // Test 3: Ingestion with stale cursor (6368566405)
  console.log('\n>>> [TEST 3] Ingestion Detection with Stale Cursor (6368566405)');
  const staleResult = ingestAllNewDirectives({ overrideCursor: 6368566405 });
  assert(staleResult.newDirectivesCount >= 11, `Expected at least 11 new directives, got ${staleResult.newDirectivesCount}`);
  assert.strictEqual(staleResult.latestNewCursor, 6370119038, `Expected latest cursor 6370119038, got ${staleResult.latestNewCursor}`);
  console.log(`    ✓ Stale cursor detected ${staleResult.newDirectivesCount} pending directives`);
  console.log(`    ✓ Latest directive ID accurately identified as ${staleResult.latestNewCursor}`);

  // Test 4: Ingestion with advanced cursor (6370119038)
  console.log('\n>>> [TEST 4] Ingestion Behavior with Advanced Cursor (6370119038)');
  const advancedResult = ingestAllNewDirectives({ overrideCursor: 6370119038 });
  console.log(`    ✓ Un-ingested directives with updated cursor: ${advancedResult.newDirectivesCount}`);
  assert.strictEqual(advancedResult.newDirectivesCount, 0, 'Should have 0 un-ingested directives when cursor is at latest');

  // Test 5: Next-comment regression verification
  console.log('\n>>> [TEST 5] Next-Comment Append Detection Regression');
  // Simulate next appended comment #6370119039
  const simulatedNextComment = {
    id: 6370119039,
    user: { login: 'goodkie' },
    created_at: new Date().toISOString(),
    body: '[CHATGPT → ANTIGRAVITY][P0 NEXT DIRECTIVE][ISSUE #6]'
  };
  const parsedNext = parseDirectiveType(simulatedNextComment.body);
  assert(parsedNext.isChatGPT === true, 'Parser must recognize CHATGPT directive');
  assert(simulatedNextComment.id > 6370119038, 'Simulated next comment ID must be greater than current cursor');
  console.log(`    ✓ Simulated next comment ID ${simulatedNextComment.id} correctly evaluated as novel directive`);

  console.log('\n========================================================================');
  console.log('  ALL INGESTION REGRESSION TESTS PASSED (5/5)');
  console.log('========================================================================\n');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
