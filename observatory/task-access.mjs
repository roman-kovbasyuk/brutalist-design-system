import { TaskError } from './store.mjs';
import { taskDescription } from './board.mjs';
import { createAttachmentStore } from './attachments.mjs';

const uuid = /^[a-f0-9-]{36}$/i;
function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) throw new TaskError('Expected a nonempty object.');
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new TaskError(`Unknown field: ${key}`);
}
const revision = (card, task) => Buffer.from(JSON.stringify([card?.updatedAt || null, card?.launch || null, task?.updatedAt || null])).toString('base64url');
const legacyFiles = card => (card?.attachments || []).map((file, index) => ({
  id: `legacy-${index + 1}`, name: file.name, mediaType: file.type || 'application/octet-stream', size: file.size,
  availability: file.content || file.size === 0 ? 'inline' : 'missing-original', content: file.content || ''
}));

export function createTaskAccess({ store, board, attachmentStore = createAttachmentStore(`${store.file}.attachments`) }) {
  async function view() { const tasks = await store.list(); return { board: await board.get(tasks), tasks }; }
  async function snapshot(id, source) {
    if (!uuid.test(id)) throw new TaskError('Invalid task ID.');
    const data = source || await view();
    const card = data.board.cards.find(card => card.id === id), tracked = data.tasks.find(task => task.id === id);
    if (!card && !tracked) throw new TaskError('Task not found.', 404);
    const active = !card || card.stage !== 'backlog';
    const lane = data.board.lanes.find(lane => lane.id === card?.laneId);
    return {
      id, title: active && tracked ? tracked.title : card.title,
      description: card ? taskDescription(card) : tracked.description,
      laneId: card?.laneId || '', lane: lane || null,
      stage: card?.stage || (tracked.status === 'ready' ? 'done' : 'started'),
      status: tracked?.status || null, note: tracked?.note || '', agent: tracked?.agent || '',
      model: tracked?.model || '', effort: tracked?.effort || '', category: tracked?.category || '',
      binding: tracked?.binding || null, launch: card?.launch || null,
      workMessageId: tracked?.workMessageId || null, workRequestId: tracked?.workRequestId || null,
      revision: revision(card, tracked), boardUpdatedAt: card?.updatedAt || null, taskUpdatedAt: tracked?.updatedAt || null,
      createdAt: card?.createdAt || tracked.createdAt,
      updatedAt: [card?.updatedAt, tracked?.updatedAt].filter(Boolean).sort().at(-1),
      attachments: [...legacyFiles(card), ...await attachmentStore.metadata(id)]
    };
  }
  async function current(id, options = {}) {
    const task = await snapshot(id);
    if (!options.revision) throw new TaskError('A task revision is required.', 428);
    if (options.revision !== task.revision) throw new TaskError('This task changed. Re-read it before updating.', 409);
    return task;
  }
  const api = {
    async list() {
      const data = await view();
      return Promise.all([...new Set([...data.board.cards, ...data.tasks].map(task => task.id))].map(id => snapshot(id, data)));
    },
    get: snapshot,
    async brief(id) {
      const data = await view(), task = await snapshot(id, data);
      return { task, context: { shared: data.board.context || '', lane: task.lane?.context || '' }, project: { path: data.board.projectPath } };
    },
    async lanes() { return [{ id: '', name: 'Default', context: '' }, ...(await board.get()).lanes]; },
    async create(input) {
      fields(input, ['title', 'description', 'laneId']);
      const card = await board.card({ title: input.title, specification: input.description, laneId: input.laneId || '' });
      return snapshot(card.id);
    },
    async update(id, input, options) {
      fields(input, ['title', 'description']);
      for (const value of Object.values(input)) if (typeof value !== 'string' || !value.trim()) throw new TaskError('Title and description cannot be empty.');
      const task = await current(id, options);
      if (task.stage !== 'backlog' && (!task.taskUpdatedAt || task.launch?.state === 'local' && !task.launch.complete)) throw new TaskError('Task setup is incomplete. Finish begin before editing.', 409);
      if (task.stage === 'backlog') await board.updateCard({
        ...('title' in input ? { title: input.title } : {}),
        ...('description' in input ? { specification: input.description } : {}),
        expectedUpdatedAt: task.boardUpdatedAt
      }, id);
      else await store.update(id, { ...input, expectedUpdatedAt: task.taskUpdatedAt });
      return snapshot(id);
    },
    async move(id, laneId, options) {
      const task = await current(id, options);
      await board.move(id, laneId, task.boardUpdatedAt, { ...task, description: task.description });
      return snapshot(id);
    },
    async begin(id, options = {}) {
      const task = await current(id, options);
      if (!task.boardUpdatedAt) throw new TaskError('This tracked task has already started. Use task report.', 409);
      await board.begin(id, options.agent, task.boardUpdatedAt);
      return snapshot(id);
    },
    async report(id, input, options) {
      fields(input, ['status', 'note', 'agent', 'model', 'effort', 'category']);
      if (input.status === 'ready' && (typeof input.note !== 'string' || !input.note.trim())) throw new TaskError('A verification note is required for ready.');
      const task = await current(id, options);
      if (task.stage === 'backlog' || !task.taskUpdatedAt || task.launch?.state === 'local' && !task.launch.complete) throw new TaskError('Finish beginning this task before reporting progress.', 409);
      await store.update(id, { ...input, expectedUpdatedAt: task.taskUpdatedAt });
      return snapshot(id);
    },
    async attach(id, input, bytes) {
      await snapshot(id);
      return attachmentStore.publish(id, input, bytes);
    },
    async file(id, fileId) {
      const task = await snapshot(id), file = task.attachments.find(file => file.id === fileId);
      if (!file) throw new TaskError('Attachment not found.', 404);
      if (file.availability === 'missing-original') throw new TaskError('Attachment original is unavailable. Reattach the file.', 410);
      return file.availability === 'inline' ? Buffer.from(file.content, 'utf8') : attachmentStore.read(id, fileId);
    }
  };
  return api;
}
