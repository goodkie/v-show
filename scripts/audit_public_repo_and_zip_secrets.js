/**
 * Deep content-level secret, credential, and private-artifact audit across:
 *   1) All git-tracked files on the branch (git ls-files)
 *   2) All 50 extracted files of dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip
 * Produces dist/report_public_repo_secret_audit.json (Directive #6699947182 Item 5).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ZIP = path.join(ROOT, 'dist', 'XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip');
const UNPACKED = path.join(ROOT, 'dist', 'clean_room_unpacked_v7');
const REPORT = path.join(ROOT, 'dist', 'report_public_repo_secret_audit.json');

const TEXT_EXT = new Set(['.js', '.json', '.html', '.css', '.md', '.txt', '.yml', '.yaml', '.ps1', '.sh']);
const FORBIDDEN_TRACKED_NAMES = [/\.private_egress_transaction\.json$/i, /\.xpider-enc$/i, /Local Extension Settings/i, /(^|\/)LOCK$/, /\.ldb$/i, /owner_debug_bundle\.json$/i];
const SECRET_PATTERNS = [
    { id: 'PEM_PRIVATE_KEY_WITH_BODY', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32,}/ },
    { id: 'GITHUB_TOKEN', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
    { id: 'AWS_ACCESS_KEY', re: /\bAKIA[0-9A-Z]{16}\b/ },
    { id: 'GOOGLE_API_KEY', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
    { id: 'OPENAI_OR_SK_KEY', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
    { id: 'SLACK_TOKEN', re: /\bxox[baprs]-[0-9A-Za-z\-]{20,}\b/ },
    { id: 'LIVE_PROXY_CREDENTIAL_URI', re: /\b(?:https?|socks5):\/\/(?!(?:user|username|proxyuser|admin:supersecret|admin_user:SuperSecretPassword123|test|mock|example)[^@]*@)[A-Za-z0-9._%-]{3,}:[A-Za-z0-9._%-]{6,}@(?!127\.0\.0\.1|localhost)[A-Za-z0-9.-]+\.[a-z]{2,}/i },
    { id: 'DECODO_OR_SMARTPROXY_LIVE_CRED', re: /\b(?:gate\.smartproxy\.com|gate\.decodo\.com):[0-9]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+/i }
];

function scanTextFile(relPath, content, findings) {
    for (const p of SECRET_PATTERNS) {
        const m = content.match(p.re);
        if (m) findings.push({ file: relPath, rule: p.id, matchPreview: m[0].slice(0, 12) + '***REDACTED***' });
    }
}

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const forbiddenTracked = [];
const contentFindingsTracked = [];
let scannedTrackedText = 0;

for (const rel of tracked) {
    if (FORBIDDEN_TRACKED_NAMES.some(r => r.test(rel))) forbiddenTracked.push(rel);
    const ext = path.extname(rel).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full) || fs.statSync(full).size > 5 * 1024 * 1024) continue;
    scannedTrackedText++;
    scanTextFile(rel, fs.readFileSync(full, 'utf8'), contentFindingsTracked);
}

// Scan all 50 files in unpacked candidate
const contentFindingsCandidate = [];
let scannedCandidateFiles = 0;
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else {
            scannedCandidateFiles++;
            const ext = path.extname(e.name).toLowerCase();
            if (TEXT_EXT.has(ext)) scanTextFile('candidate/' + path.relative(UNPACKED, full).replace(/\\/g, '/'), fs.readFileSync(full, 'utf8'), contentFindingsCandidate);
        }
    }
})(UNPACKED);

// Check untracked sensitive files in workspace root are NOT staged/tracked
const untrackedPrivateIgnoredOrUnstaged = !tracked.includes('.private_egress_transaction.json');

const zipBytes = fs.readFileSync(ZIP);
const zipSha256 = crypto.createHash('sha256').update(zipBytes).digest('hex');

const out = {
    suite: 'XPIDER_PUBLIC_REPO_AND_ZIP_DEEP_SECRET_AUDIT',
    auditedAt: new Date().toISOString(),
    archiveFile: path.basename(ZIP),
    archiveByteSize: zipBytes.length,
    archiveSha256: zipSha256,
    trackedFilesTotal: tracked.length,
    scannedTrackedTextFiles: scannedTrackedText,
    scannedCandidatePackageFiles: scannedCandidateFiles,
    forbiddenTrackedArtifacts: forbiddenTracked,
    untrackedPrivateTransactionExcludedFromGit: untrackedPrivateIgnoredOrUnstaged,
    contentFindingsInTrackedFiles: contentFindingsTracked,
    contentFindingsInCandidatePackage: contentFindingsCandidate,
    status: (forbiddenTracked.length === 0 && contentFindingsTracked.length === 0 && contentFindingsCandidate.length === 0 && untrackedPrivateIgnoredOrUnstaged) ? 'ALL_CLEAN' : 'VIOLATIONS_FOUND'
};

fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ status: out.status, trackedFilesTotal: out.trackedFilesTotal, scannedTrackedTextFiles: out.scannedTrackedTextFiles, scannedCandidatePackageFiles: out.scannedCandidatePackageFiles, violations: forbiddenTracked.length + contentFindingsTracked.length + contentFindingsCandidate.length }));
process.exit(out.status === 'ALL_CLEAN' ? 0 : 1);
