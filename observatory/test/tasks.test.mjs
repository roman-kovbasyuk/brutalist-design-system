import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createStore } from '../store.mjs';
import { createApp } from '../server.mjs';

const exec = promisify(execFile);
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'tasks.json');
  return { file, store: createStore(file) };
}

test('tasks persist across store instances with exactly the requested fields', async t => {
  const { file, store } = await fixture(t);
  assert.deepEqual(await store.list(), []);
  const task = await store.add({ title: '  Navigation  ', description: 'Improve mobile navigation' });
  assert.equal(task.status, 'in progress');
  assert.equal(task.title, 'Navigation');
  assert.ok(Number.isFinite(Date.parse(task.createdAt)));
  assert.deepEqual(Object.keys(task).sort(), ['id', 'title', 'description', 'status', 'note', 'model', 'effort', 'agent', 'category', 'page', 'section', 'anchor', 'binding', 'messages', 'createdAt', 'updatedAt'].sort());
  assert.deepEqual(await createStore(file).list(), [task]);
});

test('only the three supported statuses can be saved', async t => {
  const { store } = await fixture(t);
  const task = await store.add({ title: 'Task' });
  for (const status of ['needs attention', 'ready', 'in progress']) {
    const updated = await store.update(task.id, { status, note: `Now ${status}` });
    assert.equal(updated.status, status);
    assert.equal(updated.note, `Now ${status}`);
    assert.equal(updated.createdAt, task.createdAt);
    assert.ok(updated.updatedAt > task.updatedAt);
  }
  for (const status of ['done', 'review', 'requested', '', 'READY']) {
    await assert.rejects(store.update(task.id, { status }), /Status must be/);
  }
  assert.equal((await store.list())[0].status, 'in progress');
});

test('new tasks infer a category when an agent does not report one', async t => {
  const { store } = await fixture(t);
  assert.equal((await store.add({ title: 'Fix broken search result selection' })).category, 'bug');
  assert.equal((await store.add({ title: 'Refine spacing in the dashboard header' })).category, 'ui polishing');
  assert.equal((await store.add({ title: 'Define notification preferences' })).category, 'specification');
  assert.equal((await store.add({ title: 'Fix broken search result selection', category: 'specification' })).category, 'specification');
});

test('invalid fields and stale edits do not overwrite task data', async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.add({ title: ' ' }), /Title is required/);
  await assert.rejects(store.add({ title: 'Task', priority: 'high' }), /Unknown field/);
  await assert.rejects(store.add({ title: 5 }), /must be text/);
  const task = await store.add({ title: 'Task' });
  const updated = await store.update(task.id, { note: 'Agent finished a step' });
  await assert.rejects(store.update(task.id, { title: 'Stale edit', expectedUpdatedAt: task.updatedAt }), error => error.status === 409);
  assert.deepEqual(await store.list(), [updated]);
  await assert.rejects(store.update('missing', { status: 'ready' }), error => error.status === 404);
});

test('independent CLI processes can write concurrently without losing tasks', async t => {
  const { file, store } = await fixture(t);
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  await Promise.all(Array.from({ length: 12 }, (_, i) => exec(process.execPath, [cli, 'add', `Task ${i}`, 'Concurrent request'], { env: { ...process.env, TASKS_FILE: file } })));
  const tasks = await store.list();
  assert.equal(tasks.length, 12);
  assert.equal(new Set(tasks.map(task => task.id)).size, 12);
  const { stdout } = await exec(process.execPath, [cli, 'update', tasks[0].id, 'ready', 'Verified'], { env: { ...process.env, TASKS_FILE: file } });
  assert.equal(JSON.parse(stdout).note, 'Verified');
  const result = await exec(process.execPath, [cli, 'get', tasks[0].id], { env: { ...process.env, TASKS_FILE: file } });
  assert.equal(JSON.parse(result.stdout).status, 'ready');
});

test('malformed storage is reported without replacing existing bytes', async t => {
  const { file, store } = await fixture(t);
  await writeFile(file, '{broken');
  await assert.rejects(store.add({ title: 'Task' }));
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('model, effort, chat, and category reporting survive CLI updates and support older tasks', async t => {
  const { file, store } = await fixture(t);
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const env = { ...process.env, TASKS_FILE: file };
  const { stdout } = await exec(process.execPath, [cli, 'add', 'Model test', 'Description', 'gpt-5.6-terra', 'medium', 'Orchestrator', 'ui polishing'], { env });
  const task = JSON.parse(stdout);
  assert.equal(task.model, 'gpt-5.6-terra');
  assert.equal(task.effort, 'medium');
  assert.equal(task.agent, 'Orchestrator');
  assert.equal(task.category, 'ui polishing');
  await exec(process.execPath, [cli, 'update', task.id, 'in progress', 'Checking'], { env });
  assert.equal((await store.list())[0].model, 'gpt-5.6-terra');
  assert.equal((await store.list())[0].effort, 'medium');
  assert.equal((await store.list())[0].agent, 'Orchestrator');
  assert.equal((await store.list())[0].category, 'ui polishing');
  await exec(process.execPath, [cli, 'update', task.id, 'ready', 'Verified', 'gpt-6-astra', 'xhigh'], { env });
  assert.equal((await store.list())[0].model, 'gpt-6-astra');
  assert.equal((await store.list())[0].effort, 'xhigh');
  await assert.rejects(store.update(task.id, { model: 42 }), /model must be text/);
  await assert.rejects(store.update(task.id, { model: 'x'.repeat(201) }), /model is too long/);
  await assert.rejects(store.update(task.id, { effort: 42 }), /effort must be text/);
  await assert.rejects(store.update(task.id, { effort: 'x'.repeat(51) }), /effort is too long/);
  await assert.rejects(store.update(task.id, { agent: 42 }), /agent must be text/);
  await assert.rejects(store.update(task.id, { agent: 'x'.repeat(201) }), /agent is too long/);
  await assert.rejects(store.update(task.id, { category: 'feature' }), /Category must be/);
  await assert.rejects(store.update(task.id, { category: 42 }), /category must be text/);
  delete task.model;
  delete task.effort;
  delete task.agent;
  delete task.category;
  await writeFile(file, JSON.stringify([task]));
  assert.equal((await store.list())[0].model, undefined);
  assert.equal((await store.list())[0].effort, undefined);
  assert.equal((await store.list())[0].agent, undefined);
  assert.equal((await store.list())[0].category, undefined);
  assert.equal((await store.update(task.id, { model: 'GPT-6', effort: 'high', agent: 'Update user settings', category: 'bug' })).model, 'GPT-6');
  assert.equal((await store.list())[0].effort, 'high');
  assert.equal((await store.list())[0].agent, 'Update user settings');
  assert.equal((await store.list())[0].category, 'bug');
});

test('section reporting supports legacy records and preserves other task fields', async t => {
  const { file, store } = await fixture(t);
  const task = await store.add({ title: 'Task', model: 'GPT-6', note: 'Original note' });
  delete task.section;
  await writeFile(file, JSON.stringify([task]));
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  await exec(process.execPath, [cli, 'section', task.id, '  Home / Header  '], { env: { ...process.env, TASKS_FILE: file } });
  const saved = (await store.list())[0];
  assert.equal(saved.section, 'Home / Header');
  assert.equal(saved.status, task.status);
  assert.equal(saved.note, task.note);
  assert.equal(saved.model, task.model);
  await assert.rejects(store.update(task.id, { section: 5 }), /section must be text/);
  await assert.rejects(store.update(task.id, { section: 'x'.repeat(201) }), /section is too long/);
  await assert.rejects(store.update(task.id, { page: 'x'.repeat(201) }), /page is too long/);
  await assert.rejects(store.update(task.id, { anchor: 'x'.repeat(2001) }), /anchor is too long/);
  assert.equal((await store.update(task.id, { section: '' })).section, '');
});

test('known screen sections automatically receive their registered anchor', async t => {
  const { file, store } = await fixture(t);
  const task = await store.add({ title: 'Location test', page: 'Observatory', section: 'Task table' });
  assert.equal(task.anchor, '#task-table');
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const env = { ...process.env, TASKS_FILE: file };
  const catalog = JSON.parse((await exec(process.execPath, [cli, 'locations'], { env })).stdout);
  assert.ok(catalog.filter(location => location.page === 'Observatory').every(location => location.anchor.startsWith('#')));
  assert.ok(catalog.some(location => location.page === 'Observatory' && location.section === 'Header' && location.anchor === '#observatory-header'));
  const located = JSON.parse((await exec(process.execPath, [cli, 'location', task.id, 'Observatory', 'Header'], { env })).stdout);
  assert.equal(located.anchor, '#observatory-header');
  assert.equal(located.status, task.status);
  assert.equal((await store.update(task.id, { note: 'Checked heading' })).anchor, '#observatory-header');
});

test('task messages queue, deduplicate, and move work to in progress only on start', async t => {
  const { store } = await fixture(t);
  const task = await store.add({ title: 'Review feedback', agent: 'Orchestrator', status: 'ready' });
  const message = await store.sendMessage(task.id, { text: 'Please revisit the empty state.', idempotencyKey: 'feedback-1' });
  assert.equal(message.deliveryState, 'queued');
  assert.deepEqual(message.binding, { projectId: 'local', provider: 'cli', conversationId: task.id });
  assert.equal(message.attempts, 0);
  assert.equal((await store.list())[0].status, 'ready');
  assert.equal((await store.sendMessage(task.id, { text: 'Please revisit the empty state.', idempotencyKey: 'feedback-1' })).id, message.id);
  assert.equal((await store.inbox('orchestrator')).length, 1);
  await store.claimMessage(task.id, message.id);
  await store.acknowledgeMessage(task.id, message.id);
  const started = await store.startMessage(task.id, message.id);
  assert.equal(started.message.deliveryState, 'started');
  assert.equal(started.task.status, 'in progress');
  assert.equal((await store.inbox('Orchestrator')).length, 0);
  assert.deepEqual((await store.bind(task.id, { projectId: 'project-x', provider: 'test', conversationId: 'chat-1' })).binding, { projectId: 'project-x', provider: 'test', conversationId: 'chat-1' });
  await assert.rejects(store.sendMessage(task.id, { text: '' }), /Message text is required/);
  await assert.rejects(store.sendMessage(task.id, { text: 'Conflict', idempotencyKey: 'feedback-1' }), /Idempotency key was already used/);
});

test('moving a task clears stale anchors and explicit links take precedence', async t => {
  const { store } = await fixture(t);
  const task = await store.add({ title: 'Location test', page: 'Observatory', section: 'Header', anchor: 'https://example.com/#custom' });
  assert.equal(task.anchor, 'https://example.com/#custom');
  assert.equal((await store.update(task.id, { page: 'Observatory', section: 'Header' })).anchor, task.anchor);
  assert.equal((await store.update(task.id, { section: 'Unknown section' })).anchor, '');
  assert.equal((await store.update(task.id, { section: 'Task table' })).anchor, '#task-table');
  assert.equal((await store.update(task.id, { anchor: '' })).anchor, '');
  assert.equal((await store.update(task.id, { section: 'Task table', anchor: 'https://example.com/#actual' })).anchor, 'https://example.com/#actual');
});

test('known locations migrate legacy slash-hash anchors', async t => {
  const { file, store } = await fixture(t);
  const task = await store.add({ title: 'Legacy location', page: 'Observatory', section: 'Task table', anchor: '/#task-table' });
  const migrated = await store.update(task.id, { page: 'Observatory', section: 'Task table' });
  assert.equal(migrated.anchor, '#task-table');
});

test('HTTP API creates, reads, updates, and validates tasks', async t => {
  const { store } = await fixture(t);
  const server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const locations = await (await fetch(base + '/api/locations')).json();
  assert.ok(locations.some(location => location.section === 'Task table' && location.anchor === '#task-table'));
  const send = (path, method, body, headers = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const created = await send('/api/tasks', 'POST', { title: '<script>alert(1)</script>', description: 'Literal text', model: 'gpt-5.6-luna', effort: 'high', agent: 'Orchestrator', category: 'ui polishing', page: 'Home', section: 'Header', anchor: 'https://example.com/#header' });
  assert.equal(created.status, 201);
  const task = await created.json();
  assert.equal(task.status, 'in progress');
  assert.equal(task.model, 'gpt-5.6-luna');
  assert.equal(task.effort, 'high');
  assert.equal(task.agent, 'Orchestrator');
  assert.equal(task.category, 'ui polishing');
  assert.equal(task.page, 'Home');
  assert.equal(task.section, 'Header');
  assert.equal(task.anchor, 'https://example.com/#header');
  const listed = await (await fetch(base + '/api/tasks')).json();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, task.id);
  assert.equal('messages' in listed[0], false);
  const changed = await send(`/api/tasks/${task.id}`, 'PATCH', { status: 'ready', note: 'Checked', model: 'gpt-6-astra', effort: 'xhigh', agent: 'Update user settings', category: 'specification', section: 'Settings / Header' });
  assert.equal(changed.status, 200);
  const updated = await changed.json();
  assert.equal(updated.note, 'Checked');
  assert.equal(updated.model, 'gpt-6-astra');
  assert.equal(updated.effort, 'xhigh');
  assert.equal(updated.agent, 'Update user settings');
  assert.equal(updated.category, 'specification');
  assert.equal(updated.section, 'Settings / Header');
  const messageResponse = await send(`/api/tasks/${task.id}/messages`, 'POST', { text: 'Please continue from the latest result.', idempotencyKey: 'api-message-1' });
  assert.equal(messageResponse.status, 201);
  const message = await messageResponse.json();
  assert.equal(message.deliveryState, 'queued');
  assert.equal(message.attempts, 0);
  assert.equal((await (await fetch(`${base}/api/tasks/${task.id}/messages`)).json()).length, 1);
  const claimed = await send(`/api/tasks/${task.id}/messages/${message.id}/claim`, 'POST', {});
  assert.equal(claimed.status, 200);
  assert.equal((await claimed.json()).deliveryState, 'sending');
  const acknowledged = await send(`/api/tasks/${task.id}/messages/${message.id}/ack`, 'POST', {});
  assert.equal((await acknowledged.json()).deliveryState, 'delivered');
  const started = await send(`/api/tasks/${task.id}/messages/${message.id}/start`, 'POST', { note: 'Resumed from feedback.' });
  assert.equal((await started.json()).task.status, 'in progress');
  const bound = await send(`/api/tasks/${task.id}/binding`, 'POST', { projectId: 'project-x', provider: 'test', conversationId: 'chat-2' });
  assert.equal(bound.status, 200);
  assert.equal((await bound.json()).binding.conversationId, 'chat-2');
  assert.equal((await send(`/api/tasks/${task.id}`, 'PATCH', { status: 'done' })).status, 400);
  assert.equal((await send('/api/tasks/missing', 'PATCH', { status: 'ready' })).status, 404);
  assert.equal((await send('/api/tasks', 'POST', { title: 'Bad origin' }, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await send('/api/tasks', 'POST', { title: 'Bad type' }, { 'Content-Type': 'text/plain' })).status, 415);
  const malformed = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(malformed.status, 400);
  assert.equal((await fetch(base + '/unknown')).status, 404);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(page.headers.get('content-security-policy'), /style-src 'self' 'unsafe-inline'/);
  const pageBody = await page.text();
  assert.match(pageBody, /<h1>🔭 Observatory<\/h1>/);
  assert.match(pageBody, /<h1>🔭 Observatory<\/h1><span class="project-name"><\/span>/);
  assert.match(pageBody, /id="kanban-board"/);
  assert.match(pageBody, /data-column="status"/);
  assert.doesNotMatch(pageBody, /data-column="category"/);
  assert.match(pageBody, /src="\/vendor\/lucide\.min\.js"/);
  assert.match(pageBody, /data-column="agent"/);
  assert.doesNotMatch(pageBody, /data-column="page"/);
  assert.match(pageBody, /id="task-details"/);
  assert.doesNotMatch(pageBody, /id="task-form"/);
  assert.doesNotMatch(pageBody, /name="description"/);
  assert.match(pageBody, /id="title-display"/);
  assert.doesNotMatch(pageBody, /id="title-edit"/);
  assert.match(pageBody, /title="Double-click to edit"/);
  assert.match(pageBody, /class="dialog-heading"><div class="dialog-title-group"><h1 id="title-display"/);
  assert.doesNotMatch(pageBody, /<th scope="row">Task<\/th>/);
  assert.match(pageBody, /aria-labelledby="title-display"/);
  const detailOrder = ['Status', 'Category', 'Screen', 'Section', 'Model', 'Updated'].map(label => pageBody.indexOf(`<th scope="row">${label}</th>`));
  assert.ok(detailOrder.every((position, index) => position >= 0 && (index === 0 || position > detailOrder[index - 1])));
  assert.doesNotMatch(pageBody, /<th scope="row">Description<\/th>/);
  assert.match(pageBody, /id="detail-description" class="detail-copy detail-inline-description"/);
  assert.doesNotMatch(pageBody, /id="message-heading"/);
  assert.doesNotMatch(pageBody, /id="message-help"/);
  assert.doesNotMatch(pageBody, /class="message-hint"/);
  assert.match(pageBody, /id="message-input"[^>]*placeholder="What should the agent do next\?"/);
  assert.match(pageBody, /id="message-send"[^>]*>Send<\/button>/);
  const appSource = await (await fetch(base + '/app.js')).text();
  assert.match(appSource, /setupColumnResizers/);
  assert.match(appSource, /beginTitleEdit/);
  assert.match(appSource, /'gpt-5\.6-terra': 'Terra'/);
  assert.match(appSource, /'gpt-5\.6-luna': 'Luna'/);
  assert.match(appSource, /'gpt-6-astra': 'Astra'/);
  assert.match(appSource, /Extra High/);
  assert.match(appSource, /status-tooltip/);
  assert.match(appSource, /Needs your input/);
  assert.match(appSource, /Chat:/);
  assert.match(appSource, /chatCell/);
  assert.doesNotMatch(appSource, /categoryCell/);
  assert.match(appSource, /categoryIcons/);
  assert.match(appSource, /task-cell-content/);
  assert.match(appSource, /data-lucide/);
  assert.match(appSource, /sectionLabel/);
  assert.doesNotMatch(appSource, /pageCell/);
  assert.match(appSource, /defaultColumnWidths/);
  assert.match(appSource, /task:\s*412/);
  assert.doesNotMatch(appSource, /category:\s*20/);
  assert.match(appSource, /Model:/);
  assert.match(appSource, /Latest update/);
  const styleSource = await (await fetch(base + '/style.css')).text();
  assert.match(styleSource, /\.project-name \{ color: #8992a0; font-size: 16px; font-weight: 600; letter-spacing: -\.4px; margin-left: 6px; \}/);
  assert.match(styleSource, /dialog\s*\{[^}]*margin:\s*auto/);
  assert.match(styleSource, /details-table td\s*\{[^}]*min-width:\s*0/);
  assert.match(styleSource, /details-table td\s*\{[^}]*max-width:\s*0/);
  assert.match(styleSource, /\.dialog-content\s*\{[^}]*overflow-x:\s*hidden/);
  assert.match(styleSource, /\.dialog-shell\s*\{[^}]*width:\s*calc\(100% - 15px\)/);
  assert.match(styleSource, /\.dialog-content::-webkit-scrollbar\s*\{[^}]*width:\s*3px/);
  assert.match(styleSource, /\.detail-title\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(styleSource, /\.status-tooltip/);
  assert.equal((await fetch(base + '/app.js')).status, 200);
  assert.equal((await fetch(base + '/style.css')).status, 200);
  const lucide = await fetch(base + '/vendor/lucide.min.js');
  assert.equal(lucide.status, 200);
  assert.match(await lucide.text(), /createIcons/);
});
