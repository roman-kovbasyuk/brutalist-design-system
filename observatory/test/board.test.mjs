import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.mjs';
import { createBoard, buildBrief } from '../board.mjs';
import { createLauncher, pipeRequest } from '../codex-launcher.mjs';
import { createApp } from '../server.mjs';
import { runInNewContext } from 'node:vm';

async function clipboardFixture(writeText) {
  const elements = new Map();
  const context = {
    document: { querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, { setAttribute() {}, hidden: false });
      return elements.get(selector);
    } },
    window: { addEventListener() {} }, location: { hash: '' },
    navigator: { clipboard: { writeText } },
    fetch: () => new Promise(() => {}), setInterval() {},
    setTimeout: callback => { context.reset = callback; }
  };
  runInNewContext(await readFile(new URL('../public/board.js', import.meta.url), 'utf8'), context);
  const control = { textContent: 'ID 12345678', disabled: false };
  return { context, control, elements };
}

test('copying a card ID writes the full ID and confirms only after success', async () => {
  const writes = [];
  let complete;
  const { context, control } = await clipboardFixture(id => { writes.push(id); return new Promise(resolve => { complete = resolve; }); });
  assert.equal(typeof context.copyCardId, 'function');
  const pending = context.copyCardId('12345678-1234-1234-1234-123456789abc', control);
  assert.deepEqual(writes, ['12345678-1234-1234-1234-123456789abc']);
  assert.notEqual(control.textContent, 'Copied');
  assert.equal(control.disabled, true);
  complete(); await pending;
  assert.equal(control.textContent, 'Copied');
  context.reset();
  assert.equal(control.textContent, 'ID 12345678');
  assert.equal(control.disabled, false);
});

test('description textarea sizing follows its content without a textarea scrollbar', async () => {
  const { context } = await clipboardFixture(() => Promise.resolve());
  const textarea = { style: {}, scrollHeight: 184 };
  context.autoSizeTextarea(textarea);
  assert.equal(textarea.style.height, '184px');
  assert.equal(textarea.style.overflowY, 'hidden');
});

test('a denied clipboard write exposes the ID without claiming success', async () => {
  const { context, control, elements } = await clipboardFixture(async () => { throw new Error('Denied'); });
  assert.equal(typeof context.copyCardId, 'function');
  await context.copyCardId('12345678-1234-1234-1234-123456789abc', control);
  assert.notEqual(control.textContent, 'Copied');
  assert.match(elements.get('#board-error').textContent, /12345678-1234-1234-1234-123456789abc/);
  context.reset();
  assert.equal(control.disabled, false);
});

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-board-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createStore(join(directory, 'tasks.json'));
  const calls = [];
  const launcher = { configured: true, prepare: async () => 'project', launch: async input => { calls.push(input); return { threadId: '00000000-0000-0000-0000-000000000001' }; }, ...overrides };
  const options = { project: directory, launcher };
  const board = createBoard(store, options);
  const card = () => board.card({ title: 'Synthetic task', specification: 'Implement a synthetic feature and verify it.', context: 'See src/example.js' });
  return { directory, store, board, calls, card, options };
}

test('attachment upload retries only pending files after a partial failure', async () => {
  const { context } = await clipboardFixture(() => Promise.resolve());
  const files = [{ name: 'first.png', type: 'image/png' }, { name: 'second.pdf', type: 'application/pdf' }];
  const state = { pendingFiles: [...files], uploadedFiles: [] }, sent = [];
  context.fetch = async (url, input) => {
    sent.push(input.body);
    return { ok: sent.length !== 2, json: async () => sent.length === 2 ? { error: 'Upload failed' } : { id: 'saved', name: input.body.name } };
  };
  await assert.rejects(context.uploadPending('task-id', state), /Upload failed/);
  assert.equal(state.pendingFiles.length, 1);
  await context.uploadPending('task-id', state);
  assert.equal(state.pendingFiles.length, 0);
  assert.deepEqual(sent.map(file => file.name), ['first.png', 'second.pdf', 'second.pdf']);
});

test('Inter is served locally as a valid WOFF2 font', async t => {
  const { store, board } = await fixture(t);
  const server = createApp(store, undefined, board);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/vendor/inter-latin.woff2`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^font\/woff2/);
  const font = Buffer.from(await response.arrayBuffer());
  assert.equal(font.subarray(0, 4).toString(), 'wOF2');
});

test('planning starts without lanes and preserves user-added lanes and ungrouped cards', async t => {
  const { store, board, options, calls, card } = await fixture(t);
  assert.deepEqual((await board.get()).lanes, []);
  const design = await board.lane({ name: 'Design', context: 'Use the established style.' });
  await board.lane({ name: 'Product', context: 'Updated lane context' }, design.id);
  const extra = await board.lane({ name: 'Docs', context: 'User documentation' });
  await board.settings({ context: 'Local developer tool.' });
  const created = await card();
  const saved = await createBoard(store, options).get();
  assert.equal(saved.lanes.length, 2);
  assert.equal(saved.lanes[0].name, 'Product');
  assert.equal(saved.cards[0].laneId, '');
  assert.equal(saved.cards[0].stage, 'backlog');
  assert.equal(saved.context, 'Local developer tool.');
  assert.equal((await store.list()).length, 0);
  assert.equal(calls.length, 0);
  await board.card({ title: 'Moved', specification: 'Updated brief', laneId: extra.id, expectedUpdatedAt: created.updatedAt }, created.id);
  await assert.rejects(board.card({ title: 'Stale', specification: 'Stale brief', laneId: extra.id, expectedUpdatedAt: created.updatedAt }, created.id), /changed/);
  await assert.rejects(board.lane({ name: 'docs' }), /already exists/);
  await assert.rejects(board.card({ title: 'Bad', specification: 'x', laneId: 'missing' }), /not found/);
});

test('cards preserve attached file metadata and include text attachments in the Codex brief', async t => {
  const { board } = await fixture(t);
  const created = await board.card({
    title: 'Attached task', specification: 'Use the attached notes.',
    attachments: [{ name: 'notes.md', type: 'text/markdown', size: 18, content: '# Notes\nShip it.' }]
  });
  assert.deepEqual((await board.get()).cards[0].attachments, [{ name: 'notes.md', type: 'text/markdown', size: 18, content: '# Notes\nShip it.' }]);
  const brief = buildBrief(created, { name: 'No lane', context: '' }, { context: '' }, { project: '/tmp/project', tasksFile: '/tmp/tasks.json' });
  assert.match(brief, /Description\nUse the attached notes\./);
  assert.match(brief, /Attached files/);
  assert.match(brief, /notes\.md/);
  assert.match(brief, /# Notes/);
  await assert.rejects(board.card({ title: 'Too big', specification: 'x', attachments: [{ name: 'too-big.txt', type: 'text/plain', size: 999999, content: 'x' }] }), /attachment/i);
});

test('moving a backlog card between lanes keeps its description and attachments before launch', async t => {
  const { board } = await fixture(t);
  const source = await board.lane({ name: 'Source' });
  const target = await board.lane({ name: 'Target' });
  const created = await board.card({ title: 'Move me', specification: 'Keep this description.', context: 'Preserve this context.', laneId: source.id, attachments: [{ name: 'notes.txt', type: 'text/plain', size: 4, content: 'Keep' }] });
  const moved = await board.card({ title: created.title, specification: created.specification, context: created.context, laneId: target.id, attachments: created.attachments, expectedUpdatedAt: created.updatedAt }, created.id);
  assert.equal(moved.laneId, target.id);
  assert.equal(moved.stage, undefined);
  assert.deepEqual(moved.attachments, created.attachments);
  assert.equal((await board.get()).cards[0].laneId, target.id);
});

test('deleting a backlog card removes it while started cards remain protected', async t => {
  const { board, store } = await fixture(t);
  const card = await board.card({ title: 'Delete me', specification: 'No longer needed.' });
  await board.removeCard(card.id);
  assert.deepEqual((await board.get()).cards, []);
  const started = await board.card({ title: 'Keep running', specification: 'Do not remove active work.' });
  await board.start(started.id);
  await assert.rejects(board.removeCard(started.id), /started|Codex/i);
  assert.equal((await store.list()).length, 1);
});

test('lanes insert beneath the selected row and retain their order after reload', async t => {
  const { board, store, options } = await fixture(t);
  const first = await board.lane({ name: 'First', afterLaneId: '' });
  await board.lane({ name: 'Last' });
  await board.lane({ name: 'Middle', afterLaneId: first.id });
  await board.lane({ name: 'Before first', afterLaneId: '' });
  await assert.rejects(board.lane({ name: 'Invalid', afterLaneId: 'missing' }), /not found/);
  await board.lane({ name: 'Renamed' }, first.id);
  assert.deepEqual((await createBoard(store, options).get()).lanes.map(lane => lane.name), ['Before first', 'Renamed', 'Middle', 'Last']);
});

test('card metadata keeps its creation date and reflects the recorded agent name', async t => {
  const { board, store, card } = await fixture(t);
  const created = await card();
  assert.equal((await board.get()).cards[0].agent, '');
  await board.start(created.id);
  await store.update(created.id, { agent: 'Backend implementation' });
  let saved = (await board.get()).cards[0];
  assert.equal(saved.agent, 'Backend implementation');
  assert.equal(saved.createdAt, created.createdAt);
  await store.update(created.id, { agent: 'API follow-up', status: 'ready', note: 'Verified.' });
  saved = (await board.get()).cards[0];
  assert.equal(saved.agent, 'API follow-up');
  assert.equal(saved.createdAt, created.createdAt);
});

test('simultaneous starts create one Codex task with full context; ready moves it to Done', async t => {
  const { board, store, calls, card } = await fixture(t);
  await board.settings({ context: 'Shared context' });
  const lane = await board.lane({ name: 'Frontend', context: 'Lane context' });
  const created = await card();
  await board.card({ title: created.title, specification: created.specification, context: created.context, laneId: lane.id }, created.id);
  await Promise.all([board.start(created.id), board.start(created.id)]);
  assert.equal(calls.length, 1);
  for (const text of ['Shared context', 'Lane context', 'src/example.js', 'AGENTS.md', created.id, 'TASKS_FILE=']) assert.ok(calls[0].prompt.includes(text));
  assert.equal((await store.list()).length, 1);
  assert.equal((await board.get()).cards[0].stage, 'started');
  await store.update(created.id, { status: 'needs attention', note: 'A decision is needed.' });
  assert.equal((await board.get()).cards[0].stage, 'started');
  await store.update(created.id, { status: 'ready', note: 'Feature implemented and tested.' });
  assert.equal((await board.get()).cards[0].stage, 'done');
  await board.start(created.id);
  assert.equal(calls.length, 1);
  await assert.rejects(board.card({ title: 'Change active task', specification: 'x', laneId: lane.id }, created.id), /has started/);
});

test('removing the only named lane moves its cards to default and invalidates stale edits', async t => {
  const { board, store, options } = await fixture(t);
  const lane = await board.lane({ name: 'Design' });
  const card = await board.card({ title: 'Keep me', specification: 'Preserve this task', context: 'Task context', laneId: lane.id });
  await board.removeLane(lane.id, {});
  const saved = await createBoard(store, options).get();
  assert.deepEqual(saved.lanes, []);
  assert.equal(saved.cards[0].id, card.id);
  assert.equal(saved.cards[0].laneId, '');
  assert.equal(saved.cards[0].context, 'Task context');
  assert.equal(saved.cards[0].stage, 'backlog');
  await assert.rejects(board.card({ title: card.title, specification: card.specification, expectedUpdatedAt: card.updatedAt }, card.id), /changed/);
});

test('removing one of multiple lanes requires a valid destination and preserves launched task state', async t => {
  const { board, store, options } = await fixture(t);
  const source = await board.lane({ name: 'Source' });
  const target = await board.lane({ name: 'Target' });
  const card = await board.card({ title: 'Running task', specification: 'Keep execution state', laneId: source.id });
  await board.start(card.id);
  await store.update(card.id, { status: 'ready', note: 'Verified.' });
  const before = await board.get();
  await assert.rejects(board.removeLane(source.id, {}), /Choose/);
  await assert.rejects(board.removeLane(source.id, { targetLaneId: source.id }), /different/);
  await assert.rejects(board.removeLane(source.id, { targetLaneId: 'missing' }), /not found/);
  assert.deepEqual(await board.get(), before);
  await board.removeLane(source.id, { targetLaneId: target.id });
  const after = await createBoard(store, options).get();
  assert.deepEqual(after.lanes.map(lane => lane.id), [target.id]);
  assert.equal(after.cards[0].laneId, target.id);
  assert.equal(after.cards[0].stage, 'done');
  assert.deepEqual(after.cards[0].launch, before.cards[0].launch);
  assert.equal((await store.list()).length, 1);
  await assert.rejects(board.removeLane('', {}), /not found/);
});

test('multiple lanes can explicitly move cards to default without deleting other lanes', async t => {
  const { board } = await fixture(t);
  const source = await board.lane({ name: 'Source' });
  const other = await board.lane({ name: 'Other' });
  await board.card({ title: 'Keep me', specification: 'Keep me', laneId: source.id });
  await board.removeLane(source.id, { targetLaneId: '' });
  const saved = await board.get();
  assert.equal(saved.cards[0].laneId, '');
  assert.deepEqual(saved.lanes.map(lane => lane.id), [other.id]);
});

test('unavailable desktop leaves card in Backlog and uncertain creation cannot retry after restart', async t => {
  let offline = true, attempts = 0;
  const { board, store, options, card } = await fixture(t, {
    prepare: async () => { if (offline) throw new Error('Offline'); return 'project'; },
    launch: async () => { attempts++; throw new Error('Lost receipt'); }
  });
  const created = await card();
  await assert.rejects(board.start(created.id), /Offline/);
  assert.equal((await board.get()).cards[0].stage, 'backlog');
  offline = false;
  await assert.rejects(board.start(created.id), /unconfirmed/);
  const restarted = createBoard(store, options);
  await restarted.start(created.id);
  assert.equal(attempts, 1);
  assert.equal((await restarted.get()).cards[0].launch.state, 'unconfirmed');
  const threadId = '00000000-0000-0000-0000-000000000002';
  await restarted.link(created.id, { threadId }, async (id, project) => { assert.equal(id, threadId); assert.equal(project, options.project); });
  assert.equal((await store.list())[0].binding.conversationId, threadId);
});

test('malformed board storage is not overwritten', async t => {
  const { board, store } = await fixture(t);
  const file = `${store.file}.board.json`;
  await writeFile(file, '{broken');
  await assert.rejects(board.settings({ context: 'new' }));
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('legacy default lanes disappear without losing cards or customized lanes', async t => {
  const { board, store } = await fixture(t);
  await writeFile(`${store.file}.board.json`, JSON.stringify([{ context: '', lanes: [
    { id: 'part-1', name: 'Frontend', context: '' },
    { id: 'part-2', name: 'API', context: '' },
    { id: 'part-3', name: 'Infrastructure', context: 'Keep this context' }
  ], cards: [{ id: 'saved-card', title: 'Saved work', laneId: 'part-1' }] }]));
  const saved = await board.get();
  assert.deepEqual(saved.lanes.map(lane => lane.name), ['API', 'Infrastructure']);
  assert.equal(saved.cards[0].title, 'Saved work');
  assert.equal(saved.cards[0].laneId, '');
  await board.settings({ context: 'Persist migration' });
  assert.equal((await board.get()).cards.length, 1);
});

test('a definite failure before submission can retry without duplicating its tracking record', async t => {
  let attempts = 0;
  const { board, store, card } = await fixture(t, { launch: async () => {
    if (++attempts === 1) throw Object.assign(new Error('Socket unavailable before sending'), { notSent: true });
    return { threadId: '00000000-0000-0000-0000-000000000001' };
  } });
  const created = await card();
  await assert.rejects(board.start(created.id), /not submitted/);
  assert.equal((await board.get()).cards[0].stage, 'backlog');
  await board.card({ title: 'Revised task', specification: 'Revised specification', laneId: '' }, created.id);
  await board.start(created.id);
  assert.equal(attempts, 2);
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.list())[0].description, 'Revised specification');
  assert.equal((await board.get()).cards[0].stage, 'started');
});

test('a missing desktop pipe reports definite non-submission', async t => {
  const { directory } = await fixture(t);
  await assert.rejects(pipeRequest(join(directory, 'missing.sock'), { id: 'test' }, 100), error => error.notSent === true);
});

test('brief shell quotes special project paths and preserves the entire specification', () => {
  const brief = buildBrief({ id: 'id', title: 'Title', specification: 'Exact\nmultiline brief', context: '' }, { name: 'Part', context: '' }, { context: '' }, { project: "/tmp/user's project", tasksFile: "/tmp/user's project/tasks.json" });
  assert.ok(brief.includes("TASKS_FILE='/tmp/user'\\''s project/tasks.json'"));
  assert.ok(brief.includes('Exact\nmultiline brief'));
});

test('launcher resolves exact local saved project, inherits settings, and validates creation receipt', async t => {
  const { directory } = await fixture(t);
  const calls = [];
  const rpc = async (_pipe, request) => {
    calls.push(request);
    const value = request.params.tool === 'list_projects' ? { projects: [{ projectId: 'correct', projectKind: 'local', hostId: 'local', path: directory }] } : { threadId: '00000000-0000-0000-0000-000000000001' };
    return { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(value) }] };
  };
  const launcher = createLauncher({ pipe: '/synthetic', threadId: 'parent', rpc });
  const projectId = await launcher.prepare(directory);
  await launcher.launch({ projectId, title: 'Task', prompt: 'Brief', launchId: 'stable-id' });
  assert.equal(calls[1].params.callId, 'stable-id');
  assert.equal(calls[1].params.arguments.target.projectId, 'correct');
  assert.equal(calls[1].params.arguments.model, undefined);
  await assert.rejects(launcher.prepare(tmpdir()), /exact project/);
});

test('board HTTP supports creation and launch and rejects cross-origin writes', async t => {
  const { store, board } = await fixture(t);
  const server = createApp(store, undefined, board);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const lane = await board.lane({ name: 'HTTP lane' });
  const input = { title: 'HTTP card', specification: 'Check endpoint', laneId: lane.id };
  let response = await fetch(`${url}/api/board/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: JSON.stringify(input) });
  assert.equal(response.status, 403);
  response = await fetch(`${url}/api/board/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(response.status, 201);
  const card = await response.json();
  response = await fetch(`${url}/api/board/cards/${card.id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.equal((await (await fetch(`${url}/api/board`)).json()).cards[0].stage, 'started');
  response = await fetch(`${url}/api/board/lanes/${lane.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: '{}' });
  assert.equal(response.status, 403);
  response = await fetch(`${url}/api/board/lanes/${lane.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  const saved = await (await fetch(`${url}/api/board`)).json();
  assert.equal(saved.cards[0].laneId, '');
  assert.equal(saved.cards[0].stage, 'started');
  assert.deepEqual(saved.lanes, []);
});

test('board HTTP deletes an unstarted card through the card route', async t => {
  const { store, board } = await fixture(t);
  const server = createApp(store, undefined, board);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const card = await board.card({ title: 'Delete over HTTP', specification: 'Remove me.' });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/board/cards/${card.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.deepEqual((await board.get()).cards, []);
});
