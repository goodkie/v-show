/**
 * test/run_v7_real_mutant_sensitivity.js
 *
 * Real Implementation-Mutation Sensitivity Verification Harness for XPIDER V7:
 * Proves that the E2E runner strictly fails (exit code 1) on genuine code/DOM/ledger/restart mutations:
 *   Mutant A: Phone-only form classified as FAILURE instead of SKIPPED (content-script.js)
 *   Mutant B: Visible #stop-save-btn hidden at live popup (popup.html)
 *   Mutant C: HistoryStore skipped bucket dropped from 7-bucket reconciliation (history-store.js)
 *   Mutant D: Post-restart queue wiped on SW boot (background.js)
 *
 * Guarantees 100% restoration of candidate source files in try...finally blocks.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EVIDENCE_DIR = path.resolve('owner-extension-test-site/evidence');
const LOG_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_real_mutants.log');
const REPORT_FILE = path.join(EVIDENCE_DIR, 'evidence_v7_real_mutants_report.json');

if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    if (logStream && !logStream.writableEnded) {
        logStream.write(line + '\n');
    }
}

function runHarness(taskFlag, timeoutMs = 180000) {
    return new Promise((resolve) => {
        const args = ['test/run_chromium_v7_task3_and_task4_suite.js'];
        if (taskFlag) args.push(taskFlag);

        const startTime = Date.now();
        const proc = spawn('node', args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve({
                exitCode: -1,
                timedOut: true,
                durationMs: Date.now() - startTime,
                stdout,
                stderr
            });
        }, timeoutMs);

        proc.on('close', code => {
            clearTimeout(timer);
            resolve({
                exitCode: code,
                timedOut: false,
                durationMs: Date.now() - startTime,
                stdout,
                stderr
            });
        });
    });
}

const MUTANTS = [
    {
        id: 'MUTANT_A_PHONE_ONLY_CLASSIFIED_FAILURE',
        name: 'Phone-only form classified as FAILURE instead of SKIPPED',
        file: 'extension/content-script.js',
        taskFlag: '--task=sc03',
        target: "finishCampaign(false, `SKIPPED: ${settleReason}`, settleReason);",
        replacement: "finishCampaign(false, 'FORM_NOT_ACCESSIBLE', 'FORM_NOT_ACCESSIBLE');",
        expectedErrorPattern: /Target 2 must be strictly SKIPPED/
    },
    {
        id: 'MUTANT_B_STOP_SAVE_BTN_HIDDEN',
        name: 'Visible #stop-save-btn hidden at live popup',
        file: 'extension/popup.html',
        taskFlag: '--task=sc04',
        target: '<button id="stop-save-btn" class="secondary-btn" style="background: rgba(255, 165, 0, 0.2); border: 1px solid #ffa500; color: #ffa500;" title="Pause and save checkpoint for resuming later">Stop & Save</button>',
        replacement: '<button id="stop-save-btn" class="secondary-btn" style="display: none; background: rgba(255, 165, 0, 0.2); border: 1px solid #ffa500; color: #ffa500;" title="Pause and save checkpoint for resuming later">Stop & Save</button>',
        expectedErrorPattern: /#stop-save-btn must be visibly rendered/
    },
    {
        id: 'MUTANT_C_LEDGER_BUCKET_DROPPED',
        name: 'Real store run bucket dropped / skipped count omitted from ledger',
        file: 'extension/modules/history-store.js',
        taskFlag: '--task=sc03',
        target: "} else if (s === 'SKIPPED') {\n                    skipped++;",
        altTarget: "} else if (s === 'SKIPPED') {\r\n                    skipped++;",
        replacement: "} else if (s === 'SKIPPED') {\n                    /* MUTANT C: skipped bucket intentionally dropped */",
        expectedErrorPattern: /skipped count must equal 1|7-Bucket ledger math invariant must strictly hold|completed must equal 3/
    },
    {
        id: 'MUTANT_D_POST_RESTART_QUEUE_WIPED',
        name: 'Actual post-restart queue wiped on SW boot',
        file: 'extension/background.js',
        taskFlag: '--task=sc04',
        target: 'campaignState.queue = [...data.xpider_paused_checkpoint.remainingQueue];',
        replacement: 'campaignState.queue = []; /* MUTANT D: actual post-restart queue wiped */',
        expectedErrorPattern: /Restored remaining queue must be >= 2 across true SW restart/
    }
];

async function main() {
    log('================================================================================');
    log('🧬 XPIDER V7 REAL MUTATION SENSITIVITY HARNESS (CHATGPT AUDIT ITEM 1)');
    log('================================================================================\n');

    const results = [];
    const startTimeUtc = new Date().toISOString();

    for (const m of MUTANTS) {
        log(`\n------------------------------------------------------------------------`);
        log(`🧪 Testing ${m.id}: "${m.name}"`);
        log(`   Target file: ${m.file} | Task flag: ${m.taskFlag}`);

        const filePath = path.resolve(m.file);
        assert(fs.existsSync(filePath), `File ${filePath} must exist`);
        const originalContent = fs.readFileSync(filePath, 'utf8');

        let activeTarget = m.target;
        if (!originalContent.includes(activeTarget) && m.altTarget && originalContent.includes(m.altTarget)) {
            activeTarget = m.altTarget;
        }

        assert(originalContent.includes(activeTarget), `Target string for ${m.id} must be present in ${m.file}`);

        let runnerResult = null;
        try {
            // Apply mutation
            const mutatedContent = originalContent.replace(activeTarget, m.replacement);
            fs.writeFileSync(filePath, mutatedContent, 'utf8');
            log(`   Applied mutation to ${m.file} (${activeTarget.length} chars replaced)`);

            // Run real E2E runner against mutated extension
            log(`   Executing Chromium E2E runner with flag ${m.taskFlag}...`);
            runnerResult = await runHarness(m.taskFlag);

        } finally {
            // GUARANTEED RESTORATION
            fs.writeFileSync(filePath, originalContent, 'utf8');
            const restoredCheck = fs.readFileSync(filePath, 'utf8');
            assert.strictEqual(restoredCheck, originalContent, `File ${m.file} MUST be 100% byte-for-byte restored`);
            log(`   Restored ${m.file} to pristine candidate baseline (verified byte-identical)`);
        }

        const combinedOutput = (runnerResult.stdout || '') + '\n' + (runnerResult.stderr || '');
        const matchedError = m.expectedErrorPattern.test(combinedOutput);
        const exitCodePass = runnerResult.exitCode === 1;

        log(`   Result: exitCode=${runnerResult.exitCode} (expected 1) | errorPatternMatched=${matchedError} | duration=${(runnerResult.durationMs / 1000).toFixed(1)}s`);

        // Extract key failure line for evidence
        const lines = combinedOutput.split('\n');
        const errLine = lines.find(l => l.includes('AssertionError') || m.expectedErrorPattern.test(l)) || 'Unknown assertion failure';
        log(`   Captured assertion evidence: "${errLine.trim()}"`);

        assert.strictEqual(runnerResult.exitCode, 1, `${m.id} MUST cause runner to exit with code 1`);
        assert(matchedError, `${m.id} MUST trigger expected assertion error pattern: ${m.expectedErrorPattern}`);

        results.push({
            id: m.id,
            name: m.name,
            file: m.file,
            taskFlag: m.taskFlag,
            exitCode: runnerResult.exitCode,
            exitCodePass,
            matchedError,
            capturedErrorExcerpt: errLine.trim(),
            durationSeconds: (runnerResult.durationMs / 1000).toFixed(1),
            restoredByteIdentical: true,
            status: 'PASS_MUTANT_REJECTED'
        });

        log(`   ✅ ${m.id} PASSED: Genuine mutation caused expected runner failure (exit code 1).`);
    }

    const endTimeUtc = new Date().toISOString();
    const finalReport = {
        suiteName: 'XPIDER V7 Real Implementation Mutation Sensitivity Report',
        startTimeUtc,
        endTimeUtc,
        totalMutantsTested: MUTANTS.length,
        allMutantsRejectedWithExitCode1: results.every(r => r.exitCode === 1 && r.matchedError),
        mutantResults: results,
        summary: 'All 4 real implementation mutations strictly triggered exit code 1 with exact assertion failure matches. All modified files restored byte-identically.'
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(finalReport, null, 2), 'utf8');
    log(`\n📄 Generated machine-readable mutation report: ${REPORT_FILE}`);

    log('\n================================================================================');
    log('🎉 ALL 4 REAL CODE MUTATIONS CONFIRMED SENSITIVE (EXIT CODE 1 VERIFIED)');
    log('================================================================================');
    logStream.end();
}

main().catch(err => {
    console.error('\n❌ Fatal Mutation Harness Error:', err);
    logStream.write(`\n❌ Fatal Mutation Harness Error: ${err.stack || err}\n`);
    logStream.end();
    process.exit(1);
});
