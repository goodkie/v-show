/**
 * scripts/ingest_issue_comments.js
 *
 * Official robust GitHub Issue comment ingestion pipeline for XPIDER AutoForm Sender Pro.
 * Protocol: OCA-DEV-1.4
 * Authority Source: goodkie/v-show Issue #6
 *
 * Capabilities:
 * 1. Multi-page traversal with Link header / page 7+ calculation (per_page=100)
 * 2. Direct ID comment fetching (e.g. #6370008697, #6370119038)
 * 3. Author & directive parsing ([CHATGPT, [OWNER, [ANTIGRAVITY)
 * 4. Cursor persistence to .oca/SESSION_CAPSULE.md and CURRENT_STATE.md
 * 5. Prevents false "no new instructions" by checking total count and page >= 7
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'goodkie/v-show';
const ISSUE_NUMBER = 6;
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const SESSION_CAPSULE_PATH = path.join(WORKSPACE_ROOT, '.oca', 'SESSION_CAPSULE.md');
const CURRENT_STATE_PATH = path.join(WORKSPACE_ROOT, 'CURRENT_STATE.md');

function runGh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', cwd: WORKSPACE_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`gh error: ${err.stderr || err.message}`);
  }
}

function fetchCommentById(commentId) {
  const raw = runGh(['api', `repos/${REPO}/issues/comments/${commentId}`]);
  return JSON.parse(raw);
}

function getIssueMetadata() {
  const raw = runGh(['api', `repos/${REPO}/issues/${ISSUE_NUMBER}`]);
  return JSON.parse(raw);
}

function fetchCommentsPage(page, perPage = 100) {
  const raw = runGh(['api', `repos/${REPO}/issues/${ISSUE_NUMBER}/comments?per_page=${perPage}&page=${page}`]);
  return JSON.parse(raw);
}

function readCurrentCursor() {
  if (fs.existsSync(SESSION_CAPSULE_PATH)) {
    const content = fs.readFileSync(SESSION_CAPSULE_PATH, 'utf8');
    const match = content.match(/AUTHORITY_CURSOR:\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function updateCursorInFiles(newCursor, lastDirectiveSummary) {
  let updatedCapsule = false;
  if (fs.existsSync(SESSION_CAPSULE_PATH)) {
    let content = fs.readFileSync(SESSION_CAPSULE_PATH, 'utf8');
    content = content.replace(/AUTHORITY_CURSOR:\s*\d+/, `AUTHORITY_CURSOR: ${newCursor}`);
    if (lastDirectiveSummary) {
      content = content.replace(/LAST_DIRECTIVE:[^\r\n]*/, `LAST_DIRECTIVE: ${lastDirectiveSummary}`);
    }
    fs.writeFileSync(SESSION_CAPSULE_PATH, content, 'utf8');
    updatedCapsule = true;
  }

  let updatedCurrentState = false;
  if (fs.existsSync(CURRENT_STATE_PATH)) {
    let content = fs.readFileSync(CURRENT_STATE_PATH, 'utf8');
    content = content.replace(/AUTHORITY_CURSOR:\s*`?\d+`?/, `AUTHORITY_CURSOR: \`${newCursor}\``);
    fs.writeFileSync(CURRENT_STATE_PATH, content, 'utf8');
    updatedCurrentState = true;
  }

  return { updatedCapsule, updatedCurrentState };
}

function parseDirectiveType(body) {
  const firstLine = (body || '').trim().split('\n')[0].trim();
  const isChatGPT = /\[CHATGPT/i.test(firstLine);
  const isOwner = /\[OWNER/i.test(firstLine);
  const isAntigravity = /\[ANTIGRAVITY/i.test(firstLine);
  return { firstLine, isChatGPT, isOwner, isAntigravity };
}

function ingestAllNewDirectives(options = {}) {
  const currentCursor = options.overrideCursor !== undefined ? options.overrideCursor : readCurrentCursor();
  const issue = getIssueMetadata();
  const totalComments = issue.comments;
  const perPage = 100;
  const totalPages = Math.ceil(totalComments / perPage);

  // Scan from at least page 7 or max(1, totalPages - 1) to ensure full coverage
  const startPage = Math.max(1, Math.min(7, totalPages - 1));
  const allComments = [];

  for (let p = startPage; p <= totalPages; p++) {
    const pageComments = fetchCommentsPage(p, perPage);
    allComments.push(...pageComments);
  }

  // De-duplicate by ID and sort ascending by ID
  const map = new Map();
  for (const c of allComments) {
    map.set(c.id, c);
  }
  const uniqueComments = Array.from(map.values()).sort((a, b) => a.id - b.id);

  // Filter newer than currentCursor
  const newComments = uniqueComments.filter(c => c.id > currentCursor);
  const newDirectives = [];

  for (const c of newComments) {
    const parsed = parseDirectiveType(c.body);
    if (parsed.isChatGPT || parsed.isOwner) {
      newDirectives.push({
        id: c.id,
        user: c.user.login,
        created_at: c.created_at,
        title: parsed.firstLine,
        isChatGPT: parsed.isChatGPT,
        isOwner: parsed.isOwner,
        body: c.body
      });
    }
  }

  let latestNewCursor = currentCursor;
  let latestDirective = null;

  if (newDirectives.length > 0) {
    latestDirective = newDirectives[newDirectives.length - 1];
    latestNewCursor = latestDirective.id;
  }

  return {
    totalComments,
    totalPages,
    startPageScanned: startPage,
    previousCursor: currentCursor,
    latestNewCursor,
    newCommentsCount: newComments.length,
    newDirectivesCount: newDirectives.length,
    newDirectives,
    latestDirective
  };
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch-id')) {
    const idIdx = args.indexOf('--fetch-id') + 1;
    const targetId = args[idIdx];
    console.log(`Direct fetching comment ${targetId}...`);
    const c = fetchCommentById(targetId);
    console.log(JSON.stringify({
      id: c.id,
      user: c.user.login,
      created_at: c.created_at,
      title: c.body.split('\n')[0],
      body: c.body
    }, null, 2));
    process.exit(0);
  }

  const shouldCommitCursor = args.includes('--commit-cursor');
  console.log(`[INGEST] Checking comments newer than current cursor...`);
  const result = ingestAllNewDirectives();

  console.log(`Total Comments in Issue #6: ${result.totalComments} (Pages: ${result.totalPages}, Scanned from page ${result.startPageScanned})`);
  console.log(`Previous Cursor: ${result.previousCursor}`);
  console.log(`New Comments found: ${result.newCommentsCount}`);
  console.log(`New Authoritative Directives found: ${result.newDirectivesCount}`);

  for (const d of result.newDirectives) {
    console.log(` -> [ID ${d.id}] ${d.user} @ ${d.created_at} | ${d.title}`);
  }

  if (result.latestDirective) {
    console.log(`\nLatest Authoritative Directive: [ID ${result.latestDirective.id}] ${result.latestDirective.title}`);
    if (shouldCommitCursor) {
      const summary = `${result.latestDirective.title} (Comment #${result.latestDirective.id})`;
      const updateResult = updateCursorInFiles(result.latestDirective.id, summary);
      console.log(`Cursor committed to files: ${JSON.stringify(updateResult)} -> New Cursor: ${result.latestDirective.id}`);
    } else {
      console.log(`(Run with --commit-cursor to persist cursor update to .oca/SESSION_CAPSULE.md & CURRENT_STATE.md)`);
    }
  } else {
    console.log('No new directives found beyond cursor.');
  }
}

module.exports = {
  fetchCommentById,
  getIssueMetadata,
  fetchCommentsPage,
  readCurrentCursor,
  updateCursorInFiles,
  parseDirectiveType,
  ingestAllNewDirectives
};
