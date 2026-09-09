import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
export async function readCodexTerminals(targets, { roots, database = join(homedir(), '.codex/state_5.sqlite'), python = 'python3' } = {}) {
  if (!Object.keys(targets).length) return [];
  const { stdout } = await exec(python, [fileURLToPath(new URL('./codex-terminal.py', import.meta.url)), database, JSON.stringify(roots.map(root => resolve(root))), JSON.stringify(targets)], { timeout: 5000, maxBuffer: 1024 * 1024 });
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows) || rows.some(row => !targets[row.conversationId]?.includes(row.turnId) || !['completed', 'interrupted'].includes(row.turnStatus))) throw new Error('Unsupported Codex terminal metadata');
  return rows;
}
