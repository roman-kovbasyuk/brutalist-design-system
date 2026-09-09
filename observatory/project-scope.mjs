import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

const exec = promisify(execFile);
export async function discoverProjectRoots(project) {
  const requested = resolve(project);
  let output;
  try { output = (await exec('git', ['-C', requested, 'worktree', 'list', '--porcelain', '-z'], { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout; }
  catch (error) { if (error.code === 128 || error.code === 'ENOENT') return [requested]; throw error; }
  const roots = [];
  for (const field of output.split('\0')) {
    if (!field.startsWith('worktree ')) continue;
    try { roots.push(await realpath(field.slice(9))); } catch { /* Prunable registrations are not destinations. */ }
  }
  // Include the supplied spelling (e.g. a symlink) only for this known checkout.
  return [...new Set([...roots, requested])];
}
