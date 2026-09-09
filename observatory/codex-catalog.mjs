import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
export async function readCodexCatalog(project, { database = join(homedir(), '.codex/state_5.sqlite'), python = 'python3', roots = [project], includeArchived = false } = {}) {
  const allowed = [...new Set(roots.map(root => resolve(root)))];
  const { stdout } = await exec(python, [fileURLToPath(new URL('./codex-catalog.py', import.meta.url)), database, JSON.stringify(allowed), includeArchived ? 'all' : 'active'], { timeout: 5000, maxBuffer: 1024 * 1024 });
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows) || rows.some(row => typeof row.id !== 'string' || !allowed.includes(row.cwd))) throw new Error('Unsupported Codex catalog');
  return rows;
}
