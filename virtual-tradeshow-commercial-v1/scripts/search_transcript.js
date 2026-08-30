const fs = require('fs');
const readline = require('readline');

const p = "C:\\Users\\oPus\\.gemini\\antigravity\\brain\\6cb2d68e-c042-42a8-aee2-b8a40fa9f737\\.system_generated\\logs\\transcript.jsonl";
if (!fs.existsSync(p)) { console.log('No transcript file'); process.exit(0); }

const rl = readline.createInterface({ input: fs.createReadStream(p) });
let matches = [];

rl.on('line', (line) => {
  if (line.includes('Railway') || line.includes('railway')) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.tool_calls) {
        parsed.tool_calls.forEach(tc => {
          if (tc.name === 'run_command' && tc.args && tc.args.CommandLine) {
            matches.push(tc.args.CommandLine);
          }
        });
      }
    } catch(e) {}
  }
});

rl.on('close', () => {
  console.log('Unique commands mentioning railway:\n', [...new Set(matches)].slice(-10).join('\n---\n'));
});