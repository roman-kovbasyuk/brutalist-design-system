import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, readFile, rename, rm, open, lstat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { transact } from './storage-transaction.mjs';
import { TaskError } from './store.mjs';

const uuid = /^[a-f0-9-]{36}$/i;
const validateId = id => { if (typeof id !== 'string' || !uuid.test(id)) throw new TaskError('Invalid attachment or task ID.'); };
async function noSymlink(path) {
  try { if ((await lstat(path)).isSymbolicLink()) throw new TaskError('Attachment paths cannot contain symlinks.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function createAttachmentStore(root, { maxBytes = 20 * 1024 * 1024, maxCount = 10, maxTotalBytes = 100 * 1024 * 1024 } = {}) {
  root = resolve(root);
  const metadataFile = join(root, 'metadata.json'), blobRoot = join(root, 'blobs');
  const pathFor = file => join(blobRoot, file.taskId, file.id);
  const exposed = file => ({ ...file, path: pathFor(file) });
  async function safePath(taskId, fileId) {
    for (const path of [root, blobRoot, join(blobRoot, taskId), ...(fileId ? [join(blobRoot, taskId, fileId)] : [])]) await noSymlink(path);
  }
  async function readMetadata() {
    await noSymlink(root); await noSymlink(metadataFile);
    try {
      const value = JSON.parse(await readFile(metadataFile, 'utf8'));
      if (!Array.isArray(value) || value.length !== 1 || !Array.isArray(value[0]?.files) ||
          value[0].files.some(file => !file || !uuid.test(file.id) || !uuid.test(file.taskId) || typeof file.name !== 'string' || typeof file.mediaType !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256) || file.availability !== 'available' || !Number.isInteger(file.size) || file.size < 0 || file.size > maxBytes) ||
          new Set(value[0].files.map(file => file.id)).size !== value[0].files.length) throw new TaskError('Invalid attachment metadata. Restore it before writing.', 500);
      return value[0];
    } catch (error) { if (error.code === 'ENOENT') return { files: [] }; throw error; }
  }
  return {
    async publish(taskId, input, source) {
      validateId(taskId);
      if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || basename(input.name) !== input.name || input.name.includes('\\') || /[\x00-\x1f\x7f]/.test(input.name) || ['.', '..'].includes(input.name)) throw new TaskError('Attachment name must be a single safe filename.');
      if (typeof input.mediaType !== 'string' || input.mediaType.length > 200 || /[\r\n\x00]/.test(input.mediaType)) throw new TaskError('Attachment media type is invalid.');
      await readMetadata(); await safePath(taskId);
      const id = randomUUID(), directory = join(blobRoot, taskId);
      await mkdir(directory, { recursive: true }); await safePath(taskId);
      const finalPath = join(directory, id), temporary = finalPath + '.tmp-' + randomUUID();
      const output = await open(temporary, 'wx', 0o600);
      const hash = createHash('sha256'); let size = 0;
      try {
        const chunks = Buffer.isBuffer(source) || source instanceof Uint8Array ? [source] : source;
        for await (const chunk of chunks) {
          const bytes = Buffer.from(chunk); size += bytes.length;
          if (size > maxBytes) throw new TaskError('Attachment is too large (maximum 20 MiB).', 413);
          hash.update(bytes); await output.writeFile(bytes);
        }
        await output.sync(); await output.close();
        const record = { id, taskId, name: input.name.trim(), mediaType: input.mediaType.trim() || 'application/octet-stream', size, sha256: hash.digest('hex'), createdAt: new Date().toISOString(), availability: 'available' };
        const published = await transact(metadataFile, async () => {
          const state = await readMetadata(), existing = state.files.filter(file => file.taskId === taskId);
          const duplicate = existing.find(file => file.name === record.name && file.mediaType === record.mediaType && file.sha256 === record.sha256 && file.size === record.size);
          if (!duplicate && (existing.length >= maxCount || existing.reduce((sum, file) => sum + file.size, 0) + size > maxTotalBytes)) throw new TaskError('Task attachment limit reached.', 413);
          await safePath(taskId, duplicate?.id);
          // Re-publish the verified identical bytes, repairing a missing/corrupt original.
          await rename(temporary, duplicate ? pathFor(duplicate) : finalPath);
          const directoryHandle = await open(directory, 'r');
          try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
          if (!duplicate) state.files.push(record);
          return { data: [state], result: duplicate || record };
        });
        return exposed(published);
      } finally {
        await output.close().catch(() => {});
        await rm(temporary, { force: true });
        // Never delete the final blob on an ambiguous metadata acknowledgement.
        // A crash can leave an unreferenced blob, but never remove a committed original.
      }
    },
    async read(taskId, fileId) {
      validateId(taskId); validateId(fileId);
      const record = (await readMetadata()).files.find(file => file.taskId === taskId && file.id === fileId);
      if (!record) throw new TaskError('Attachment not found.', 404);
      await safePath(taskId, fileId);
      try {
        const file = await open(pathFor(record), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          if ((await file.stat()).size !== record.size) throw new TaskError('Attachment original failed its integrity check.', 410);
          const bytes = await file.readFile();
          if (bytes.length !== record.size || createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new TaskError('Attachment original failed its integrity check.', 410);
          return bytes;
        } finally { await file.close(); }
      } catch (error) { if (error.code === 'ENOENT') throw new TaskError('Attachment original is unavailable.', 410); throw error; }
    },
    async metadata(taskId) {
      validateId(taskId); await safePath(taskId);
      return (await readMetadata()).files.filter(file => file.taskId === taskId).map(exposed);
    }
  };
}
