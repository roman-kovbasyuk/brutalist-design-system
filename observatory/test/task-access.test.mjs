import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../store.mjs';
import { createBoard } from '../board.mjs';
import { createTaskAccess } from '../task-access.mjs';

async function fixture(t, launcher = { configured: false }) {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-access-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createStore(join(directory, 'tasks.json'));
  const board = createBoard(store, { project: directory, launcher });
  return { directory, store, board, access: createTaskAccess({ store, board }) };
}

test('offline access includes backlog, tracked work, and complete legacy context', async t => {
  const { access, board, store, directory } = await fixture(t);
  await board.settings({ context: 'Shared conventions' });
  const lane = await board.lane({ name: 'Backend', context: 'Lane conventions' });
  const card = await board.card({ title: 'Read brief', specification: 'Implement it.', context: 'Check server.mjs.', laneId: lane.id,
    attachments: [{ name: 'notes.txt', type: 'text/plain', size: 4, content: 'Read' }, { name: 'lost.png', type: 'image/png', size: 10, content: '' }] });
  const tracked = await store.add({ title: 'Existing work', description: 'Keep it.' });
  assert.deepEqual((await access.list()).map(task => task.id), [card.id, tracked.id]);
  const brief = await access.brief(card.id);
  assert.match(brief.task.description, /Implement it\.[\s\S]*Check server.mjs\./);
  assert.equal(brief.context.shared, 'Shared conventions');
  assert.equal(brief.context.lane, 'Lane conventions');
  assert.equal(brief.project.path, directory);
  assert.equal(brief.task.attachments[1].availability, 'missing-original');
  const saved = await access.attach(card.id, { name: 'new.bin', mediaType: 'application/octet-stream' }, Buffer.from([0,255]));
  assert.equal((await access.get(card.id)).attachments.length, 3);
  assert.deepEqual(await access.file(card.id, saved.id), Buffer.from([0,255]));
  assert.deepEqual(await access.file(card.id, 'legacy-1'), Buffer.from('Read'));
  await assert.rejects(access.file(card.id, 'legacy-2'), /original.*unavailable/i);
});

test('partial edits preserve fields and reject concurrent stale saves', async t => {
  const { access, board } = await fixture(t);
  const card = await access.create({ title: 'Initial', description: 'Description' });
  const writes = await Promise.allSettled([
    access.update(card.id, { title: 'First' }, { revision: card.revision }),
    access.update(card.id, { title: 'Second' }, { revision: card.revision })
  ]);
  assert.equal(writes.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await access.get(card.id)).description, 'Description');
  await assert.rejects(access.update(card.id, { title: 'No revision' }), /revision/i);
  await assert.rejects(access.update(card.id, { laneId: 'unknown' }, { revision: (await access.get(card.id)).revision }), /field/i);
  assert.equal((await board.get()).cards.length, 1);
});

test('local begin never launches Codex and updates flow back to the board and Done', async t => {
  const { access, board, store } = await fixture(t, {
    configured: true,
    prepare() { throw new Error('Unexpected Codex launch'); }
  });
  let task = await access.create({ title: 'Build locally', description: 'Verify it.' });
  task = await access.begin(task.id, { revision: task.revision, agent: 'Builder' });
  assert.equal(task.stage, 'started');
  assert.equal(task.agent, 'Builder');
  assert.equal(task.status, 'in progress');
  await board.start(task.id); // persisted local reservation excludes a desktop launch
  await assert.rejects(access.begin(task.id, { revision: task.revision, agent: 'Other' }), /already|agent/i);
  const repeated = await access.begin(task.id, { revision: task.revision, agent: 'Builder' });
  assert.equal(repeated.revision, task.revision);
  task = await access.update(task.id, { title: 'Renamed', description: 'Complete details' }, { revision: task.revision });
  assert.equal((await board.get()).cards[0].specification, 'Complete details');
  assert.equal((await store.list())[0].title, 'Renamed');
  await assert.rejects(access.report(task.id, { status: 'ready' }, { revision: task.revision }), /verification|note/i);
  task = await access.report(task.id, { status: 'ready', note: 'Tests passed.' }, { revision: task.revision });
  assert.equal(task.stage, 'done');
  assert.equal((await board.get()).cards[0].stage, 'done');
});

test('moving active and Pulse-only work preserves status, identity and descriptions', async t => {
  const { access, board, store } = await fixture(t);
  const lane = await board.lane({ name: 'Design' });
  const tracked = await store.add({ title: 'Existing', description: 'Do not lose this.' });
  let task = await access.get(tracked.id);
  task = await access.move(task.id, lane.id, { revision: task.revision });
  assert.equal(task.id, tracked.id);
  assert.equal(task.laneId, lane.id);
  assert.equal(task.status, 'in progress');
  task = await access.move(task.id, '', { revision: task.revision });
  assert.equal(task.laneId, '');
  assert.equal(task.description, 'Do not lose this.');
  assert.equal((await board.get()).cards.length, 1);
});

test('begin races reserve once and do not overwrite a completed result on retry', async t => {
  const { access, store } = await fixture(t);
  const card = await access.create({ title: 'One worker', description: 'No duplicate begin.' });
  const results = await Promise.allSettled([
    access.begin(card.id, { revision: card.revision, agent: 'First' }),
    access.begin(card.id, { revision: card.revision, agent: 'Second' })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await store.list()).length, 1);
  let task = await access.get(card.id);
  task = await access.report(task.id, { status: 'ready', note: 'Verified' }, { revision: task.revision });
  const retried = await access.begin(task.id, { revision: task.revision, agent: task.agent });
  assert.equal(retried.status, 'ready');
});

test('local begin after a failed desktop attempt uses the latest backlog edits', async t => {
  const { access, board } = await fixture(t, { configured: true, prepare: async () => 'project', launch: async () => { throw Object.assign(new Error('Not submitted'), { notSent: true }); } });
  let task = await access.create({ title: 'Old title', description: 'Old details' });
  await assert.rejects(board.start(task.id), /not submitted/i);
  task = await access.get(task.id);
  task = await access.update(task.id, { title: 'New title', description: 'New details' }, { revision: task.revision });
  task = await access.begin(task.id, { revision: task.revision, agent: 'Local worker' });
  assert.equal(task.title, 'New title');
  assert.equal(task.description, 'New details');
});

test('content and revisions use the same tracked snapshot during a concurrent edit', async t => {
  const { store, directory } = await fixture(t);
  const board = createBoard(store, { project: directory, launcher: { configured: false } });
  const access = createTaskAccess({ store, board });
  let task = await access.create({ title: 'Original', description: 'Old content' });
  task = await access.begin(task.id, { revision: task.revision, agent: 'Builder' });
  let changed = false;
  const concurrentStore = { ...store, list: async () => {
    const snapshot = await store.list();
    if (!changed) { changed = true; await store.update(task.id, { description: 'Concurrent new content' }); }
    return snapshot;
  } };
  const concurrent = createTaskAccess({ store: concurrentStore, board: createBoard(concurrentStore, { project: directory, launcher: { configured: false } }) });
  const read = await concurrent.get(task.id);
  if (read.description === 'Old content') await assert.rejects(access.update(task.id, { description: 'Accidental overwrite' }, { revision: read.revision }), /changed/i);
  else assert.equal(read.description, 'Concurrent new content');
});
