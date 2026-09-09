#!/usr/bin/env node
// Local integration harness. Copies only named source files, never live task data.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, copyFile, writeFile, readFile, chmod, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const source = dirname(fileURLToPath(import.meta.url));
const root = dirname(source);
const runs = join(source, 'data', 'harness');
const files = ['cli.mjs', 'store.mjs', 'storage-transaction.mjs', 'storage-transaction.py', 'server.mjs', 'connector.mjs', 'codex-desktop.mjs', 'codex-catalog.mjs', 'codex-catalog.py', 'codex-terminal.mjs', 'codex-terminal.py', 'project-scope.mjs', 'requests.mjs', 'accounting.mjs', 'locations.json', 'README.md', 'HARNESS.md', 'harness.mjs', 'package.json', '.gitignore', 'test/tasks.test.mjs', 'public/index.html', 'public/app.js', 'public/style.css'];
files.push('board.mjs', 'codex-launcher.mjs', 'start.sh', 'public/board.js', 'public/board.css', 'test/board.test.mjs');
files.push('task-access.mjs', 'task-cli.mjs', 'attachments.mjs', 'test/task-access.test.mjs', 'test/attachments.test.mjs');

async function prepare() {
  await mkdir(runs, { recursive: true, mode: 0o700 });
  await chmod(runs, 0o700);
  const directory = await mkdtemp(join(runs, 'run-'));
  for (const name of files) {
    const target = join(directory, 'observatory', name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, name), target);
  }
  await copyFile(join(root, 'AGENTS.md'), join(directory, 'AGENTS.md'));
  await copyFile(join(directory, 'observatory/cli.mjs'), join(directory, 'observatory/cli-runtime.mjs'));
  // Trace command names and workflow metadata only: no titles, notes, prompts or credentials.
  await writeFile(join(directory, 'observatory/cli.mjs'), `import { appendFile } from 'node:fs/promises';
const [command, ...args] = process.argv.slice(2);
const event = { command, at: new Date().toISOString() };
if (['get', 'update', 'location'].includes(command)) event.id = args[0];
if (command === 'update') event.status = args[1];
await appendFile(new URL('./data/trace.jsonl', import.meta.url), JSON.stringify(event) + '\\n', { mode: 0o600 });
await import('./cli-runtime.mjs');
`);
  await mkdir(join(directory, 'observatory/data'), { mode: 0o700 });
  await writeFile(join(directory, '.harness.json'), JSON.stringify({ version: 1, synthetic: true }) + '\n', { mode: 0o600 });
  await writeFile(join(directory, 'ASSIGNMENT.md'), `# Fresh-agent exercise

Work only in this disposable project. Read its project guidance first. Do not use a TASKS_FILE override, access the parent project, read environment files, install dependencies, or contact external services. Use only synthetic, non-sensitive text. Do not modify application source or the project guidance.

Inspect the local startup documentation and executable entry points. Determine how a developer starts this dashboard, whether a build or provider API key is needed, and how task data persists. Verify the answer with a bounded local check. Report findings and any instruction-discovery issues.

The dashboard is a local fixture; use a random available loopback port if you need to start it. Do not use the live dashboard on port 6001.
`);
  return directory;
}

async function checkedDirectory(input) {
  if (!input) throw new Error('Provide the run directory printed by prepare.');
  const directory = await realpath(resolve(input));
  const allowed = await realpath(runs);
  if (dirname(directory) !== allowed || !directory.split('/').pop().startsWith('run-')) throw new Error('Expected a harness-created run directory.');
  assert.deepEqual(JSON.parse(await readFile(join(directory, '.harness.json'), 'utf8')), { version: 1, synthetic: true });
  return directory;
}

async function verify(directory, handoff = false) {
  const tasks = JSON.parse(await readFile(join(directory, 'observatory/data/tasks.json'), 'utf8'));
  const trace = (await readFile(join(directory, 'observatory/data/trace.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(trace[0]?.command, 'list', 'Fresh agent must pull tasks first');
  assert.equal(tasks.length, 1, 'The exercise and its follow-up should share one task');
  assert.equal(trace.filter(event => event.command === 'add').length, 1, 'No duplicate record on handoff');
  assert.equal(tasks[0].status, 'ready', 'Exercise must finish with a verified result');
  assert.ok(tasks[0].note?.trim(), 'Verification note required');
  assert.equal(tasks[0].page, '', 'Startup audit is non-UI work');
  assert.equal(tasks[0].section, '', 'Do not invent a UI location');
  const statuses = trace.filter(event => event.command === 'update' && event.id === tasks[0].id).map(event => event.status);
  assert.ok(statuses.includes('ready'), 'Record completion through the CLI');
  if (handoff) {
    const firstReady = statuses.indexOf('ready');
    const resumed = statuses.indexOf('in progress', firstReady + 1);
    assert.ok(resumed > firstReady, 'Handoff must resume the existing task after its first completion');
    assert.ok(statuses.indexOf('ready', resumed + 1) > resumed, 'Handoff must finish with another verified completion');
  }
  const report = { passed: true, handoff, taskCount: tasks.length, commands: trace.map(event => event.command), statuses, scope: 'Observed CLI workflow; review agent findings separately. Does not prove all IDEs auto-load instructions.' };
  await writeFile(join(directory, 'verification.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  return report;
}

async function check() {
  const directory = await prepare();
  const file = join(directory, 'observatory/data/tasks.json');
  const env = { ...process.env, TASKS_FILE: file };
  const cli = async (...args) => JSON.parse((await exec(process.execPath, [join(directory, 'observatory/cli.mjs'), ...args], { cwd: directory, env, timeout: 10000 })).stdout);
  const passed = [];
  const check = async (name, operation) => { await operation(); passed.push(name); console.log(`PASS ${name}`); };
  const { createStore } = await import(pathToFileURL(join(directory, 'observatory/store.mjs')));
  const { createApp } = await import(pathToFileURL(join(directory, 'observatory/server.mjs')));
  const store = createStore(file);
  const server = createApp(store);
  let task;
  try {
    await check('CLI works without a dashboard process', async () => {
      assert.deepEqual(await cli('list'), []);
      task = await cli('add', 'Synthetic startup audit', 'Verify local setup', 'gpt-5.6-terra', 'medium');
      assert.equal(task.status, 'in progress');
    });
    await check('New processes reuse tasks and preserve reporting metadata', async () => {
      assert.equal((await cli('get', task.id)).id, task.id);
      await cli('update', task.id, 'needs attention', 'Synthetic missing decision');
      await cli('update', task.id, 'in progress', 'Synthetic decision resolved');
      assert.equal((await cli('get', task.id)).effort, 'medium');
      await cli('update', task.id, 'ready', 'Checked CLI startup and persistence', 'gpt-6-astra', 'xhigh');
      assert.equal((await cli('list')).length, 1);
    });
    await check('Location discovery resolves real static section IDs', async () => {
      const locations = await cli('locations');
      const html = await readFile(join(directory, 'observatory/public/index.html'), 'utf8');
      for (const location of locations) {
        const url = new URL(location.anchor, 'http://127.0.0.1');
        if (url.origin === 'http://127.0.0.1' && url.pathname === '/') assert.ok(html.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`));
      }
      const location = locations.find(item => item.page === 'Observatory' && item.section === 'Task table');
      assert.ok(location);
      const updated = await cli('location', task.id, location.page, location.section);
      assert.equal(updated.anchor, location.anchor);
      await cli('location', task.id, '', '', '');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    await check('Dashboard API and CLI share one store', async () => {
      const apiTasks = await (await fetch(base + '/api/tasks')).json();
      const cliTasks = (await cli('list')).map(({ messages, ...task }) => task);
      assert.deepEqual(apiTasks, cliTasks);
      const response = await fetch(base + '/api/tasks/' + task.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Synthetic API handoff verified' }) });
      assert.equal(response.status, 200);
      assert.equal((await cli('get', task.id)).note, 'Synthetic API handoff verified');
      assert.equal((await fetch(base)).status, 200);
    });
    await check('Browser-origin protection and unknown fields reject writes', async () => {
      const before = await readFile(file, 'utf8');
      assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Synthetic request' }) })).status, 403);
      await assert.rejects(store.add({ title: 'Synthetic request', apiKey: 'SYNTHETIC_NOT_A_SECRET' }), /Unknown field/);
      assert.equal(await readFile(file, 'utf8'), before);
    });
    await check('Runtime data is ignored by Git', async () => {
      const { stdout } = await exec('git', ['check-ignore', '--no-index', file], { cwd: root });
      assert.ok(stdout.trim());
      const tracked = await exec('git', ['ls-files', '--', 'observatory/data'], { cwd: root });
      assert.equal(tracked.stdout.trim(), '');
    });
    // Deliberately synthetic probe: document the gap, never test using an actual secret.
    const probe = await store.add({ title: 'Synthetic privacy probe', description: 'api_key=SYNTHETIC_NOT_A_SECRET' });
    const gaps = [];
    if ((await store.list()).some(item => item.id === probe.id)) gaps.push('Free-text fields accept credential-shaped content; no guarantee of sensitive-data exclusion.');
    gaps.push('CLI arguments may be retained by shell history; agents must use sanitized summaries.');
    const report = { passed, gaps, synthetic: true, directory };
    await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    for (const gap of gaps) console.log(`GAP ${gap}`);
    console.log(`Report: ${join(directory, 'report.json')}`);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}

try {
  const [command = 'check', input] = process.argv.slice(2);
  if (command === 'prepare') console.log(await prepare());
  else if (command === 'verify' || command === 'verify-handoff') console.log(JSON.stringify(await verify(await checkedDirectory(input), command === 'verify-handoff'), null, 2));
  else if (command === 'check') await check();
  else throw new Error('Usage: node observatory/harness.mjs [check | prepare | verify <run-directory> | verify-handoff <run-directory>]');
} catch (error) { console.error(error.message); process.exitCode = 1; }
