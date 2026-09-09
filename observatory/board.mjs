import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { transact } from './storage-transaction.mjs';
import { TaskError } from './store.mjs';
import { createLauncher } from './codex-launcher.mjs';

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const defaultProject = fileURLToPath(new URL('../', import.meta.url));
const maxAttachmentBytes = 100000;
const maxAttachmentCount = 5;
export const taskDescription = card => [card.specification || '', card.context ? `Additional context\n${card.context}` : ''].filter(Boolean).join('\n\n');
const touch = card => { card.updatedAt = new Date(Math.max(Date.now(), Date.parse(card.updatedAt || 0) + 1)).toISOString(); };
function normalizeAttachments(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxAttachmentCount) throw new TaskError(`Attach up to ${maxAttachmentCount} files.`);
  let total = 0;
  return value.map(file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new TaskError('Invalid attachment.');
    const { name, type, size, content } = file;
    if (typeof name !== 'string' || !name.trim() || name.length > 200 || typeof type !== 'string' || type.length > 100 || !Number.isInteger(size) || size < 0 || size > maxAttachmentBytes || typeof content !== 'string' || content.length > maxAttachmentBytes) throw new TaskError('Invalid attachment.');
    total += content.length;
    if (total > maxAttachmentBytes * 4) throw new TaskError('Attachments are too large.');
    return { name: name.trim(), type: type.trim(), size, content };
  });
}
function validate(input, fields, required = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TaskError('Expected an object.');
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(fields, key)) throw new TaskError(`Unknown field: ${key}`);
    if (typeof value !== 'string' || value.length > fields[key]) throw new TaskError(`Invalid ${key}.`);
  }
  for (const key of required) if (!input[key]?.trim()) throw new TaskError(`${key} is required.`);
}

export function buildBrief(card, lane, board, { project, tasksFile }) {
  const cli = `TASKS_FILE=${quote(resolve(tasksFile))} node ${quote(resolve(project, 'observatory/cli.mjs'))}`;
  return [
    `Implement this Observatory backlog task in ${project}.`,
    `Task: ${card.title}`, `Project part: ${lane.name}`,
    `Description\n${taskDescription(card)}`,
    `Attached files\n${card.attachments?.length ? card.attachments.map(file => `${file.name} (${file.type || 'unknown'}, ${file.size} bytes)\n${file.content || '[Binary file was attached but not inlined.]'}`).join('\n\n') : 'None provided.'}`,
    `Project-part context\n${lane.context || 'None provided.'}`, `Shared project context\n${board.context || 'None provided.'}`,
    'Inspect the repository, README.md, and applicable AGENTS.md instructions for the current implementation and constraints. Read any referenced files before making changes. Work only on this card.',
    `This request already has Observatory record ${card.id}. Reuse it; do not create another record. Run ${cli} task brief ${quote(card.id)} before working. This reads the current description, shared context, and original attachment paths without a server. Read each attached file; missing legacy originals are explicitly marked unavailable.`,
    `Bind the record to this Codex task: ${cli} bind ${quote(card.id)} ${quote(project)} codex "$CODEX_THREAD_ID".`,
    `Report progress with ${cli} update ${quote(card.id)} 'in progress' 'Your concise progress note'.`,
    `After implementing AND verifying the requested outcome, run ${cli} update ${quote(card.id)} ready 'Your verification results'. This moves the card to Done.`,
    `If blocked or awaiting input, use ${cli} update ${quote(card.id)} 'needs attention' 'Exact blocker and next step'. Do not mark ready just because the turn ended.`,
    'Use sanitized summaries in tracking records; keep credentials and sensitive content out of them.'
  ].join('\n\n');
}

export function createBoard(store, { file = `${store.file}.board.json`, project = defaultProject, launcher = createLauncher() } = {}) {
  project = resolve(project);
  const active = new Set();
  const fresh = () => ({ context: '', lanes: [], cards: [] });
  async function read() {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(data) || data.length !== 1 || !Array.isArray(data[0].lanes) || !Array.isArray(data[0].cards)) throw new Error('Invalid board data.');
      const board = data[0];
      // Retire only untouched, formerly seeded lanes; retain every task and customization.
      const defaults = { 'part-1': 'Frontend', 'part-2': 'Backend', 'part-3': 'Infrastructure' };
      const retired = new Set(board.lanes.filter(lane => defaults[lane.id] === lane.name && !lane.context).map(lane => lane.id));
      board.lanes = board.lanes.filter(lane => !retired.has(lane.id));
      for (const card of board.cards) if (retired.has(card.laneId)) card.laneId = '';
      return board;
    } catch (error) { if (error.code === 'ENOENT') return fresh(); throw error; }
  }
  const change = operation => transact(file, async () => {
    const board = await read(); const result = await operation(board);
    return { data: [board], result };
  });
  const find = (items, id) => {
    const item = items.find(item => item.id === id);
    if (!item) throw new TaskError('Board item not found.', 404);
    return item;
  };
  return {
    async get(tasks) {
      const board = await read();
      tasks ??= await store.list();
      return { ...board, project: basename(project), projectPath: project, canLaunch: launcher.configured,
        cards: board.cards.map(card => {
          const task = tasks.find(task => task.id === card.id);
          const state = card.launch?.state;
          const trackedContent = state && state !== 'failed' && !(state === 'local' && !card.launch.complete) && task;
          return { ...card, ...(trackedContent ? { title: task.title, specification: task.description === card.specification ? taskDescription(card) : task.description, context: '' } : {}), status: task?.status || null, note: task?.note || '', agent: task?.agent || '',
            launch: state === 'launching' && !active.has(card.id) ? { ...card.launch, state: 'unconfirmed', error: 'Creation was interrupted. Link the existing Codex task to recover.' } : card.launch,
            stage: state && state !== 'failed' ? task?.status === 'ready' ? 'done' : 'started' : 'backlog' };
        }) };
    },
    async settings(input) {
      validate(input, { context: 10000 });
      return change(board => { if ('context' in input) board.context = input.context.trim(); return board; });
    },
    async lane(input, id) {
      validate(input, { name: 100, context: 10000, ...(!id ? { afterLaneId: 100 } : {}) }, ['name']);
      return change(board => {
        if (board.lanes.some(lane => lane.id !== id && lane.name.toLowerCase() === input.name.trim().toLowerCase())) throw new TaskError('A lane with this name already exists.');
        const lane = id ? find(board.lanes, id) : { id: randomUUID(), context: '' };
        Object.assign(lane, { name: input.name.trim(), context: input.context?.trim() ?? lane.context });
        if (!id) {
          const after = input.afterLaneId === undefined ? board.lanes.length - 1 : input.afterLaneId === '' ? -1 : board.lanes.indexOf(find(board.lanes, input.afterLaneId));
          board.lanes.splice(after + 1, 0, lane);
        }
        return lane;
      });
    },
    async removeLane(id, input) {
      validate(input, { targetLaneId: 100 });
      return change(board => {
        find(board.lanes, id);
        if (board.lanes.length > 1 && input.targetLaneId === undefined) throw new TaskError('Choose a destination lane before deleting this lane.', 409);
        const targetLaneId = input.targetLaneId ?? '';
        if (targetLaneId === id) throw new TaskError('Choose a different destination lane.');
        if (targetLaneId) find(board.lanes, targetLaneId);
        let movedCards = 0;
        for (const card of board.cards) {
          if (card.laneId !== id) continue;
          card.laneId = targetLaneId;
          card.updatedAt = new Date(Math.max(Date.now(), Date.parse(card.updatedAt || 0) + 1)).toISOString();
          movedCards++;
        }
        board.lanes = board.lanes.filter(lane => lane.id !== id);
        return { id, targetLaneId, movedCards };
      });
    },
    async card(input, id) {
      const attachments = normalizeAttachments(input?.attachments);
      const { attachments: ignoredAttachments, ...cardInput } = input || {};
      validate(cardInput, { title: 200, specification: 100000, context: 10000, laneId: 100, expectedUpdatedAt: 100 }, ['title', 'specification']);
      return change(board => {
        if (input.laneId?.trim()) find(board.lanes, input.laneId.trim());
        const card = id ? find(board.cards, id) : { id: randomUUID(), createdAt: new Date().toISOString() };
        if (card.launch && card.launch.state !== 'failed') throw new TaskError('This card has started. Send further instructions through its Codex task.', 409);
        if (input.expectedUpdatedAt && input.expectedUpdatedAt !== card.updatedAt) throw new TaskError('This card changed. Reopen it before saving.', 409);
        for (const key of ['title', 'specification', 'context', 'laneId']) card[key] = input[key]?.trim() || '';
        if (attachments !== undefined) card.attachments = attachments;
        else if (!Array.isArray(card.attachments)) card.attachments = [];
        card.updatedAt = new Date(Math.max(Date.now(), Date.parse(card.updatedAt || 0) + 1)).toISOString();
        if (!id) board.cards.push(card);
        return card;
      });
    },
    async updateCard(input, id) {
      validate(input, { title: 200, specification: 100000, expectedUpdatedAt: 100 });
      return change(board => {
        const card = find(board.cards, id);
        if (card.launch && card.launch.state !== 'failed') throw new TaskError('This card has started. Re-read the task before editing.', 409);
        if (input.expectedUpdatedAt && input.expectedUpdatedAt !== card.updatedAt) throw new TaskError('This card changed. Reopen it before saving.', 409);
        for (const key of ['title', 'specification']) if (key in input) {
          if (!input[key].trim()) throw new TaskError(`${key} is required.`);
          card[key] = input[key].trim();
        }
        if ('specification' in input) card.context = '';
        touch(card);
        return card;
      });
    },
    async move(id, laneId, expectedUpdatedAt, tracked) {
      validate({ laneId }, { laneId: 100 });
      return change(board => {
        if (laneId) find(board.lanes, laneId);
        let card = board.cards.find(card => card.id === id);
        if ((card?.updatedAt || null) !== expectedUpdatedAt) throw new TaskError('This task changed. Re-read it before moving.', 409);
        if (!card) {
          if (!tracked || tracked.id !== id) throw new TaskError('Task not found.', 404);
          card = { id, title: tracked.title, specification: tracked.description, context: '', createdAt: tracked.createdAt, attachments: [], launch: { state: 'local', agent: tracked.agent || '', complete: true } };
          board.cards.push(card);
        }
        card.laneId = laneId; touch(card);
        return card;
      });
    },
    async begin(id, agent, expectedUpdatedAt) {
      validate({ agent }, { agent: 200 }, ['agent']);
      await change(board => {
        const card = find(board.cards, id);
        if (card.updatedAt !== expectedUpdatedAt) throw new TaskError('This task changed. Re-read it before beginning.', 409);
        if (card.launch && card.launch.state !== 'failed') {
          if (card.launch.state !== 'local' || card.launch.agent !== agent) throw new TaskError('Task has already started in another agent.', 409);
          return card;
        }
        card.launch = { state: 'local', agent, complete: false }; touch(card);
        return card;
      });
      // The durable reservation excludes desktop launches even if setup is interrupted.
      return change(async board => {
        const card = find(board.cards, id);
        if (card.launch.complete) return card;
        let tracked = (await store.list()).find(task => task.id === id);
        if (!tracked) tracked = await store.ensureBoardTask(id, { title: card.title, description: taskDescription(card) });
        if (tracked.binding?.provider !== 'cli') throw new TaskError('Task is already bound to an agent. Use its existing report workflow.', 409);
        if (tracked.title !== card.title || tracked.description !== taskDescription(card)) tracked = await store.update(id, { title: card.title, description: taskDescription(card), expectedUpdatedAt: tracked.updatedAt });
        if (!tracked.note && tracked.status === 'needs attention') await store.update(id, { status: 'in progress', agent, note: 'Started in the local agent.', expectedUpdatedAt: tracked.updatedAt });
        card.launch.complete = true; touch(card);
        return card;
      });
    },
    async removeCard(id) {
      return change(board => {
        const card = find(board.cards, id);
        if (card.launch) throw new TaskError('Started or linked tasks cannot be deleted.', 409);
        board.cards = board.cards.filter(item => item.id !== id);
        return card;
      });
    },
    async start(id) {
      const snapshot = await read(), initial = find(snapshot.cards, id);
      if (initial.launch && initial.launch.state !== 'failed') return initial;
      // Read-only preflight happens before reserving a launch. Failures here can retry.
      const projectId = await launcher.prepare(project);
      const launchId = randomUUID();
      const reserved = await change(board => {
        const card = find(board.cards, id);
        if (card.launch && card.launch.state !== 'failed') return null;
        card.launch = { id: launchId, state: 'launching' };
        return { card: structuredClone(card), lane: card.laneId ? find(board.lanes, card.laneId) : { name: 'No lane', context: '' }, context: board.context };
      });
      if (!reserved) return find((await read()).cards, id);
      active.add(id);
      let submitted = false;
      try {
        await store.ensureBoardTask(id, { title: reserved.card.title, description: taskDescription(reserved.card), category: 'specification' });
        const prompt = buildBrief(reserved.card, reserved.lane, reserved, { project, tasksFile: store.file });
        submitted = true;
        const receipt = await launcher.launch({ projectId, title: reserved.card.title, prompt, launchId });
        // Save the receipt before binding, so a storage failure cannot lose identity.
        await change(board => { find(board.cards, id).launch = { id: launchId, state: 'started', threadId: receipt.threadId }; });
        await store.bind(id, { projectId: project, provider: 'codex', conversationId: receipt.threadId });
        return find((await read()).cards, id);
      } catch (error) {
        const uncertain = submitted && !error.notSent;
        await change(board => {
          const card = find(board.cards, id);
          if (card.launch.threadId) return;
          card.launch = { id: launchId, state: uncertain ? 'unconfirmed' : 'failed', error: uncertain ? 'Codex creation is unconfirmed. Check Codex and link the existing task before continuing.' : 'The task was not submitted. Reconnect Codex and start it again.' };
        });
        throw new TaskError(uncertain ? 'Codex creation is unconfirmed. Check Codex and link the existing task; starting again is disabled to avoid duplicates.' : 'The task was not submitted. Reconnect Codex and start it again.', 503);
      } finally { active.delete(id); }
    },
    async link(id, input, verify) {
      validate(input, { threadId: 100 }, ['threadId']);
      if (!/^[a-f0-9-]{36}$/.test(input.threadId)) throw new TaskError('Enter a Codex task ID.');
      const card = find((await read()).cards, id);
      if (!card.launch || card.launch.state === 'failed') throw new TaskError('Start this card before linking a task.');
      if (active.has(id)) throw new TaskError('Task creation is still running.', 409);
      await verify(input.threadId, project);
      await store.bind(id, { projectId: project, provider: 'codex', conversationId: input.threadId });
      return change(board => { const card = find(board.cards, id); card.launch = { ...card.launch, state: 'started', threadId: input.threadId }; delete card.launch.error; return card; });
    }
  };
}
