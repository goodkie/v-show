/**
 * stop-lab.js
 * 
 * Part of XPIDER Software Digital-Twin Lab (Directive #6116387233).
 * Stops running lab nodes and cleans up.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.resolve(__dirname, 'logs/lab-state.json');

async function stopLab() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('No active lab state found.');
    return;
  }

  try {
    const labState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (labState.pid && labState.pid !== process.pid) {
      try {
        process.kill(labState.pid, 'SIGTERM');
        console.log(`Terminated lab process PID: ${labState.pid}`);
      } catch (e) {
        // Already stopped
      }
    }
    fs.unlinkSync(STATE_FILE);
    console.log('Lab stopped successfully.');
  } catch (err) {
    console.error('Error stopping lab:', err.message);
  }
}

if (require.main === module) {
  stopLab();
}

module.exports = { stopLab };
