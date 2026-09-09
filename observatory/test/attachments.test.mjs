import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAttachmentStore } from '../attachments.mjs';

test('attachment store publishes exact original bytes with immutable metadata', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-attachments-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const attachments = createAttachmentStore(directory);
  const saved = await attachments.publish('11111111-1111-1111-1111-111111111111', { name: 'reference.bin', mediaType: 'application/octet-stream' }, Buffer.from([0, 1, 2, 255]));
  assert.match(saved.id, /^[a-f0-9-]{36}$/);
  assert.equal(saved.size, 4);
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  assert.equal(saved.availability, 'available');
  assert.deepEqual(await attachments.read(saved.taskId, saved.id), Buffer.from([0, 1, 2, 255]));
  assert.deepEqual(await readFile(saved.path), Buffer.from([0, 1, 2, 255]));
  assert.deepEqual((await attachments.metadata(saved.taskId))[0], saved);
});

test('concurrent uploads cannot exceed the per-task count', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-quota-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const attachments = createAttachmentStore(directory, { maxCount: 1 });
  const results = await Promise.allSettled([1, 2].map(index => attachments.publish('11111111-1111-1111-1111-111111111111', { name: index + '.txt', mediaType: 'text/plain' }, Buffer.from('x'))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('retrying an identical upload returns the same original even at the quota', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-upload-retry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const attachments = createAttachmentStore(directory, { maxCount: 1 });
  const id = '11111111-1111-1111-1111-111111111111', input = { name: 'same.txt', mediaType: 'text/plain' };
  const first = await attachments.publish(id, input, Buffer.from('same'));
  const second = await attachments.publish(id, input, Buffer.from('same'));
  assert.equal(second.id, first.id);
  assert.equal((await attachments.metadata(id)).length, 1);
  await rm(first.path);
  const repaired = await attachments.publish(id, input, Buffer.from('same'));
  assert.deepEqual(await attachments.read(id, repaired.id), Buffer.from('same'));
});

test('corrupt metadata fails closed and attachment paths cannot follow symlinks', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-bad-files-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const attachments = createAttachmentStore(directory);
  const id = '11111111-1111-1111-1111-111111111111';
  await writeFile(join(directory, 'metadata.json'), '[{}]');
  await assert.rejects(attachments.publish(id, { name: 'safe.txt', mediaType: 'text/plain' }, Buffer.from('x')), /metadata|invalid/i);
  assert.equal(await readFile(join(directory, 'metadata.json'), 'utf8'), '[{}]');
  await rm(join(directory, 'metadata.json'));
  const saved = await attachments.publish(id, { name: 'safe.txt', mediaType: 'text/plain' }, Buffer.from('safe'));
  const outside = join(directory, 'outside.txt'); await writeFile(outside, 'outside');
  await rm(saved.path); await symlink(outside, saved.path);
  await assert.rejects(attachments.read(id, saved.id), /symlink|symbolic/i);
});

test('streamed attachments enforce bytes and aggregate quota', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-stream-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const attachments = createAttachmentStore(directory, { maxBytes: 4, maxTotalBytes: 5 });
  const id = '11111111-1111-1111-1111-111111111111';
  const chunks = async function* () { yield Buffer.from('ab'); yield Buffer.from('cd'); };
  const saved = await attachments.publish(id, { name: 'a.txt', mediaType: 'text/plain' }, chunks());
  assert.deepEqual(await attachments.read(id, saved.id), Buffer.from('abcd'));
  await assert.rejects(attachments.publish(id, { name: 'b.txt', mediaType: 'text/plain' }, chunks()), /limit/i);
  await assert.rejects(attachments.publish(id, { name: 'newline\n.txt', mediaType: 'text/plain' }, Buffer.from('x')), /name/i);
});

test('attachment store rejects traversal, oversized files, and unknown task files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'observatory-attachments-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const attachments = createAttachmentStore(directory, { maxBytes: 4 });
  await assert.rejects(attachments.publish('11111111-1111-1111-1111-111111111111', { name: '../secret', mediaType: 'text/plain' }, Buffer.from('x')), /name|path/i);
  await assert.rejects(attachments.publish('11111111-1111-1111-1111-111111111111', { name: 'large.txt', mediaType: 'text/plain' }, Buffer.from('12345')), /large|size/i);
  await assert.rejects(attachments.read('11111111-1111-1111-1111-111111111111', '../escape'), /not found|invalid/i);
});
