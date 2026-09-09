import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const helper = fileURLToPath(new URL('./storage-transaction.py', import.meta.url));
function unavailable(message) { return Object.assign(new Error(message), { status: 503 }); }

// The helper owns both the OS lock and the final replacement. If either process
// dies, another writer can recover without deleting a possibly live lock.
export async function transact(file, change) {
  const child = spawn('python3', ['-u', helper, resolve(file)], { stdio: ['pipe', 'pipe', 'ignore'] });
  child.stdin.on('error', () => {}); // Exit/commit acknowledgement determines success.
  let buffer = '', committed = false, unlockReady, rejectReady;
  const ready = new Promise((yes, no) => { unlockReady = yes; rejectReady = no; });
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (line === 'LOCKED') unlockReady();
      else if (line === 'COMMITTED') committed = true;
    }
  });
  const finished = new Promise((yes, no) => {
    child.once('error', () => no(unavailable('Storage transactions require Python 3 with OS file locking.')));
    child.once('close', code => {
      if (code === 0) yes();
      else no(unavailable(code === 73 ? 'Storage is busy; retry after the current writer finishes.' : code === 74 ? 'A legacy directory lock exists. Stop old Observatory writers and follow README migration instructions.' : 'Storage transaction stopped before acknowledgement. Read the record before retrying.'));
    });
  });
  finished.then(() => rejectReady(unavailable('Storage helper stopped before acquiring the lock.')), rejectReady);
  const timer = setTimeout(() => { rejectReady(unavailable('Storage lock timed out.')); child.kill(); }, 10000);
  try {
    await ready;
    clearTimeout(timer);
    const { data, result } = await change();
    if (!Array.isArray(data)) throw new Error('Storage transaction requires an array.');
    child.stdin.end(JSON.stringify(data, null, 2));
    await finished;
    if (!committed) throw unavailable('Storage transaction was not committed.');
    return result;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
    await finished.catch(() => {});
  }
}
