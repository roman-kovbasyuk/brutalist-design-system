import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { transact } from './storage-transaction.mjs';

export const statuses = ['in progress', 'needs attention', 'ready'];
const categories = ['bug', 'ui polishing', 'specification'];

function inferCategory(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(bug|fix|broken|error|crash|regression|issue)\b/.test(text)) return 'bug';
  if (/\b(ui|ux|visual|style|layout|typography|spacing|color|hover|animation|responsive|button|table|column|screen|page)\b/.test(text)) return 'ui polishing';
  return 'specification';
}
export const defaultFile = resolve(process.env.TASKS_FILE || fileURLToPath(new URL('./data/tasks.json', import.meta.url)));
const defaultLocationsFile = fileURLToPath(new URL('./locations.json', import.meta.url));
export class TaskError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function createStore(file = defaultFile, locationsFile = defaultLocationsFile, { now = Date.now } = {}) {
  async function locations() {
    let entries;
    try { entries = JSON.parse(await readFile(locationsFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    if (!Array.isArray(entries)) throw new Error('Locations must be an array.');
    const seen = new Set();
    return entries.map(entry => {
      if (!entry || Object.keys(entry).sort().join(',') !== 'anchor,page,section') throw new Error('Each location needs page, section, and anchor.');
      validate(entry, false);
      const location = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value.trim()]));
      const key = JSON.stringify([location.page.toLowerCase(), location.section.toLowerCase()]);
      if (!location.page || !location.section || !location.anchor || seen.has(key)) throw new Error('Locations must be nonempty and unique per screen and section.');
      seen.add(key);
      return location;
    });
  }

  async function resolveAnchor(input, previous = {}) {
    if ('anchor' in input) return input.anchor.trim();
    if (!('page' in input) && !('section' in input)) return previous.anchor || '';
    const page = (input.page ?? previous.page ?? '').trim();
    const section = (input.section ?? previous.section ?? '').trim();
    if (!page || !section) return '';
    const match = (await locations()).find(location => location.page.toLowerCase() === page.toLowerCase() && location.section.toLowerCase() === section.toLowerCase());
    if (page === previous.page && section === previous.section && previous.anchor && !previous.anchor.startsWith('/#')) return previous.anchor;
    return match?.anchor || '';
  }

  async function list() {
    try {
      const tasks = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(tasks)) throw new Error('Task data must be an array.');
      return tasks;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  function findTask(tasks, id) {
    const task = tasks.find(candidate => candidate.id === id);
    if (!task) throw new TaskError('Task not found.', 404);
    return task;
  }

  function validateMessage(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TaskError('Expected a JSON object.');
    for (const key of Object.keys(input)) {
      if (!['text', 'idempotencyKey'].includes(key)) throw new TaskError(`Unknown field: ${key}`);
      if (typeof input[key] !== 'string') throw new TaskError(`${key} must be text.`);
      if (input[key].length > (key === 'text' ? 4000 : 200)) throw new TaskError(`${key} is too long.`);
    }
    if (!input.text?.trim()) throw new TaskError('Message text is required.');
  }

  function validateBinding(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TaskError('Expected a binding object.');
    for (const key of ['projectId', 'provider', 'conversationId']) {
      if (typeof input[key] !== 'string' || !input[key].trim()) throw new TaskError(`Binding ${key} is required.`);
      if (input[key].length > 200) throw new TaskError(`Binding ${key} is too long.`);
    }
    if (Object.keys(input).some(key => !['projectId', 'provider', 'conversationId'].includes(key))) throw new TaskError('Unknown binding field.');
  }

  async function mutate(change) {
    return transact(file, async () => {
      const tasks = await list();
      const result = await change(tasks);
      return { data: tasks, result };
    });
  }

  function validate(input, creating) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TaskError('Expected a JSON object.');
    const fields = ['title', 'description', 'status', 'note', 'model', 'effort', 'agent', 'category', 'page', 'section', 'anchor', 'expectedUpdatedAt'];
    for (const key of Object.keys(input)) {
      if (!fields.includes(key)) throw new TaskError(`Unknown field: ${key}`);
      if (typeof input[key] !== 'string') throw new TaskError(`${key} must be text.`);
      if (input[key].length > (['title', 'model', 'agent', 'page', 'section'].includes(key) ? 200 : ['effort', 'category'].includes(key) ? 50 : key === 'anchor' ? 2000 : key === 'description' ? 100000 : 10000)) throw new TaskError(`${key} is too long.`);
    }
    if ((creating || 'title' in input) && !input.title?.trim()) throw new TaskError('Title is required.');
    if ('status' in input && !statuses.includes(input.status)) throw new TaskError(`Status must be: ${statuses.join(', ')}.`);
    if ('category' in input && input.category && !categories.includes(input.category.trim().toLowerCase())) throw new TaskError('Category must be: bug, ui polishing, specification.');
  }

  function makeTask(input, binding, anchor) {
    const now = new Date().toISOString(), id = randomUUID();
    const title = input.title.trim(), description = input.description || '';
    return { id, title, description, status: input.status || 'in progress', note: input.note || '', model: input.model?.trim() || '', effort: input.effort?.trim() || '', agent: input.agent?.trim() || '', category: input.category?.trim().toLowerCase() || inferCategory(title, description), page: input.page?.trim() || '', section: input.section?.trim() || '', anchor, binding: binding ? { ...binding } : { projectId: 'local', provider: 'cli', conversationId: id }, messages: [], createdAt: now, updatedAt: now };
  }

  function insertTask(tasks, input, binding, anchor, receivedAt = now()) {
    const category = input.category?.trim().toLowerCase() || inferCategory(input.title, input.description);
    const eligible = binding?.provider === 'codex' && ['bug', 'ui polishing'].includes(category);
    const target = eligible && tasks.find(task => task.fixBatch && task.binding?.provider === binding.provider && task.binding.conversationId === binding.conversationId && resolve(task.binding.projectId) === resolve(binding.projectId) && receivedAt >= task.fixBatch.startedAt && receivedAt - task.fixBatch.startedAt <= 60000);
    const item = { title: input.title.trim(), description: input.description || '', receivedAt };
    if (target) {
      const items = [...target.fixBatch.items, item];
      const description = items.map((fix, index) => `${index + 1}. ${fix.title}${fix.description ? `\n${fix.description}` : ''}`).join('\n\n');
      validate({ description }, false);
      target.fixBatch.items = items;
      target.description = description;
      target.title = `${items[0].title.slice(0, 175)} (+${items.length - 1} fixes)`;
      target.status = input.status || 'in progress';
      target.note = 'Additional fixes received in the same one-minute group.';
      target.workGeneration = (target.workGeneration || 0) + 1;
      for (const key of ['pendingResult', 'workMessageId', 'workRequestId', 'requestTurnId', 'runtime']) delete target[key];
      for (const key of ['model', 'effort', 'agent']) if (input[key]) target[key] = input[key].trim();
      if (category === 'bug') target.category = 'bug';
      if (input.page && (input.page !== target.page || input.section !== target.section)) target.page = target.section = target.anchor = '';
      target.updatedAt = new Date(Math.max(now(), Date.parse(target.updatedAt) + 1)).toISOString();
      return target;
    }
    const task = makeTask(input, binding, anchor);
    if (eligible) task.fixBatch = { startedAt: receivedAt, items: [item] };
    tasks.unshift(task);
    return task;
  }

  return {
    file,
    list,
    locations,
    validateNewTask: input => validate(input, true),
    async ensureBoardTask(id, input) {
      validate(input, true);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new TaskError('Invalid board task ID.');
      return mutate(tasks => {
        const existing = tasks.find(task => task.id === id);
        if (existing) {
          // A definite non-submission can return a card to editable Backlog.
          // Refresh its brief on retry, but never rewrite an agent-bound task.
          if (existing.binding?.provider === 'cli') {
            existing.title = input.title.trim();
            existing.description = input.description.trim();
            existing.updatedAt = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
          }
          return existing;
        }
        const task = makeTask({ ...input, status: 'needs attention' }, null, '');
        task.id = id;
        task.binding.conversationId = id;
        tasks.unshift(task);
        return task;
      });
    },
    async add(input, binding) {
      validate(input, true);
      if (binding) validateBinding(binding);
      const anchor = await resolveAnchor(input);
      return mutate(tasks => {
        return insertTask(tasks, input, binding, anchor);
      });
    },
    async createFromRequest(receipt, inputs, classificationKey) {
      if (!/^[a-f0-9]{64}$/.test(receipt.id) || !/^[a-f0-9]{64}$/.test(classificationKey) || !Array.isArray(inputs) || !inputs.length || inputs.length > 10) throw new TaskError('Invalid source classification.');
      const binding = { projectId: receipt.project, provider: 'codex', conversationId: receipt.conversationId };
      validateBinding(binding);
      const anchors = [];
      for (const input of inputs) { validate(input, true); anchors.push(await resolveAnchor(input)); }
      return mutate(tasks => {
        const existing = tasks.filter(task => task.sourceRequestIds?.includes(receipt.id));
        if (existing.length) {
          if (existing.some(task => (task.sourceClassificationKeys?.[receipt.id] || task.sourceClassificationKey) !== classificationKey)) throw new TaskError('This source already created a different task set.', 409);
          return existing;
        }
        const created = inputs.map((input, index) => {
          const timestamp = Date.parse(receipt.createdAt);
          const task = insertTask(tasks, { ...input, status: 'needs attention', agent: receipt.chat || '', note: 'Request captured; processing has not been confirmed.' }, binding, anchors[index], Number.isFinite(timestamp) ? timestamp : now());
          task.sourceRequestIds = [...new Set([...(task.sourceRequestIds || []), receipt.id])];
          task.sourceClassificationKeys = { ...task.sourceClassificationKeys, [receipt.id]: classificationKey };
          return task;
        });
        return [...new Map(created.map(task => [task.id, task])).values()];
      });
    },
    async update(id, input, messageId, requestId) {
      validate(input, false);
      return mutate(async tasks => {
        const task = findTask(tasks, id);
        if ('status' in input && task.workRequestId && requestId !== task.workRequestId) throw new TaskError('Report this work with its current request ID; this result is unscoped or stale.', 409);
        if ('status' in input && task.workMessageId) {
          if (!messageId) throw new TaskError('Report this work with its message ID using the report command.', 409);
          const message = task.messages?.find(message => message.id === messageId);
          if (messageId !== task.workMessageId || message?.workGeneration !== task.workGeneration) throw new TaskError('This result belongs to stale work. A newer message has started.', 409);
        }
        if (input.expectedUpdatedAt && input.expectedUpdatedAt !== task.updatedAt) throw new TaskError('This task changed while you were editing. Close and reopen it to see the latest update.', 409);
        const anchor = await resolveAnchor(input, task);
        for (const key of ['title', 'description', 'status', 'note', 'model', 'effort', 'agent', 'category', 'page', 'section', 'anchor']) {
          if (key in input) task[key] = ['title', 'model', 'effort', 'agent', 'category', 'page', 'section', 'anchor'].includes(key) ? input[key].trim() : input[key];
        }
        if ('category' in input) task.category = task.category.toLowerCase();
        if ('status' in input) {
          if (task.runtime) task.runtime.statusManaged = false;
          if (input.status === 'in progress' && !task.workMessageId && !task.workRequestId && task.runtime) task.runtime.turnId = null;
          delete task.pendingResult;
          const message = task.messages?.find(message => message.id === messageId);
          if (message && input.status === 'ready' && (message.turnId || message.binding?.provider === 'codex') && !(message.turnId && task.runtime?.turnId === message.turnId && task.runtime?.turnStatus === 'completed')) {
            task.pendingResult = { messageId, generation: task.workGeneration, turnId: message.turnId || null, note: input.note };
            task.status = 'in progress';
          }
          if (requestId && input.status === 'ready' && task.runtime?.turnStatus !== 'completed') {
            task.pendingResult = { requestId, generation: task.workGeneration, turnId: task.requestTurnId, note: input.note };
            task.status = 'in progress';
          }
        }
        task.anchor = anchor;
        task.updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
        return task;
      });
    },
    async startRequest(id, receipt) {
      if (!receipt || !/^[a-f0-9]{64}$/.test(receipt.id) || !receipt.turnId || receipt.state !== 'linked' || !receipt.taskIds?.includes(id)) throw new TaskError('A linked source request with a Codex turn is required.');
      return mutate(tasks => {
        const task = findTask(tasks, id);
        if (task.binding?.provider !== 'codex' || task.binding.conversationId !== receipt.conversationId || resolve(task.binding.projectId) !== resolve(receipt.project)) throw new TaskError('Request does not belong to this task binding.', 409);
        if (task.workRequestId === receipt.id) return task;
        if (task.startedRequestIds?.includes(receipt.id)) throw new TaskError('This source request is stale.', 409);
        task.startedRequestIds = [...(task.startedRequestIds || []), receipt.id];
        task.workRequestId = receipt.id;
        task.requestTurnId = receipt.turnId;
        task.workGeneration = (task.workGeneration || 0) + 1;
        delete task.workMessageId;
        delete task.pendingResult;
        task.runtime = { turnId: receipt.turnId, state: 'unknown', statusManaged: false };
        task.status = 'in progress';
        task.note = 'Agent started the linked source request.';
        task.updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
        return task;
      });
    },
    async reportRequest(id, requestId, input) {
      if (!requestId || !input?.status || !input?.note?.trim()) throw new TaskError('A request, status and verification or progress note are required.');
      if (Object.keys(input).some(key => !['status', 'note', 'model', 'effort', 'agent', 'category'].includes(key))) throw new TaskError('Unsupported report field.');
      const task = findTask(await list(), id);
      if (task.workRequestId !== requestId) throw new TaskError('This request is unstarted or stale.', 409);
      return this.update(id, input, undefined, requestId);
    },
    async reportMessage(id, messageId, input) {
      if (!messageId || !input?.status || !input?.note?.trim()) throw new TaskError('A message, status and progress or verification note are required.');
      if (Object.keys(input).some(key => !['status', 'note', 'model', 'effort', 'agent', 'category'].includes(key))) throw new TaskError('Unsupported report field.');
      const task = findTask(await list(), id);
      if (!task.workMessageId) throw new TaskError('Start the message before reporting its outcome.', 409);
      return this.update(id, input, messageId);
    },
    async bind(id, input) {
      validateBinding(input);
      return mutate(tasks => {
        const task = findTask(tasks, id);
        task.messages = Array.isArray(task.messages) ? task.messages : [];
        if (task.messages.some(message => ['queued', 'sending', 'delivered', 'unconfirmed'].includes(message.deliveryState))) throw new TaskError('Resolve pending messages before changing the task binding.', 409);
        const changed = task.binding && (task.binding.provider !== input.provider.trim() || task.binding.conversationId !== input.conversationId.trim() || resolve(task.binding.projectId) !== resolve(input.projectId.trim()));
        if (changed) {
          task.workGeneration = (task.workGeneration || 0) + 1;
          delete task.pendingResult;
          delete task.workMessageId;
          delete task.workRequestId;
          delete task.requestTurnId;
          delete task.runtime;
          if (task.status !== 'ready') {
            task.status = 'needs attention';
            task.note = 'Task reassigned; the new conversation has not confirmed processing.';
          }
        }
        task.binding = { projectId: input.projectId.trim(), provider: input.provider.trim(), conversationId: input.conversationId.trim() };
        task.updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
        return task;
      });
    },
    async messages(id) {
      const task = findTask(await list(), id);
      return Array.isArray(task.messages) ? task.messages : [];
    },
    async observeRuntime(id, observation) {
      return mutate(tasks => {
        const task = findTask(tasks, id);
        if (observation.expectedWorkGeneration !== undefined && (task.workGeneration !== observation.expectedWorkGeneration || task.binding?.conversationId !== observation.expectedConversationId)) return task;
        const previous = task.runtime;
        if (previous?.observedAt > observation.observedAt) return task;
        if (previous?.turnId === observation.turnId && ['completed', 'interrupted', 'failed'].includes(previous?.turnStatus) && !['completed', 'interrupted', 'failed'].includes(observation.turnStatus)) return task;
        const turnId = previous?.turnId || (task.status === 'in progress' ? observation.turnId : null);
        const sameTurn = turnId && turnId === observation.turnId;
        const changed = previous?.state !== observation.state || previous?.turnId !== turnId;
        task.runtime = { turnId, turnStatus: sameTurn ? observation.turnStatus : previous?.turnStatus, state: observation.state, observedAt: observation.observedAt, reason: observation.reason || '', statusManaged: previous?.statusManaged || false };
        if (sameTurn && task.status !== 'ready') {
          if (observation.model) task.model = observation.model;
          if (observation.effort) task.effort = observation.effort;
          if (['waiting', 'idle', 'systemError'].includes(observation.state) && task.status === 'in progress') {
            task.status = 'needs attention';
            task.runtime.statusManaged = true;
          } else if (observation.state === 'active' && task.runtime.statusManaged) {
            task.status = 'in progress';
            task.runtime.statusManaged = false;
          }
        }
        if (sameTurn && observation.state === 'idle' && observation.turnStatus === 'completed' && task.pendingResult?.generation === task.workGeneration && task.pendingResult?.turnId === turnId) {
          task.status = 'ready';
          task.note = task.pendingResult.note;
          task.runtime.statusManaged = false;
          delete task.pendingResult;
        }
        if (changed) task.updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
        return task;
      });
    },
    async deliveryIssue(taskId, messageId, state, code) {
      if (!['queued', 'failed', 'unconfirmed'].includes(state)) throw new TaskError('Invalid delivery outcome.');
      return mutate(tasks => {
        const task = findTask(tasks, taskId);
        const message = task.messages?.find(candidate => candidate.id === messageId);
        if (!message) throw new TaskError('Message not found.', 404);
        if (['started', 'delivered'].includes(message.deliveryState)) return message;
        if (state === 'queued' && !['queued', 'sending'].includes(message.deliveryState)) return message;
        message.deliveryState = state;
        message.errorCode = code;
        delete message.leaseUntil;
        return message;
      });
    },
    async sendMessage(id, input) {
      validateMessage(input);
      return mutate(tasks => {
        const task = findTask(tasks, id);
        task.messages = Array.isArray(task.messages) ? task.messages : [];
        const key = input.idempotencyKey?.trim();
        if (key) {
          const existing = task.messages.find(message => message.idempotencyKey === key);
          if (existing) {
            if (existing.text !== input.text.trim()) throw new TaskError('Idempotency key was already used for different message text.', 409);
            return existing;
          }
        }
        const now = new Date().toISOString();
        const message = { id: randomUUID(), taskId: task.id, binding: task.binding || { projectId: 'local', provider: 'cli', conversationId: task.id }, text: input.text.trim(), agent: task.agent || '', deliveryState: 'queued', attempts: 0, idempotencyKey: key || '', createdAt: now };
        task.messages.push(message);
        task.updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
        return message;
      });
    },
    async inbox(agent = '') {
      const tasks = await list();
      const wanted = agent.trim().toLowerCase();
      return tasks.flatMap(task => (Array.isArray(task.messages) ? task.messages : []).filter(message => ['queued', 'failed'].includes(message.deliveryState) && (!wanted || (message.agent || task.agent || '').toLowerCase() === wanted)).map(message => ({ ...message, task: { id: task.id, title: task.title, status: task.status, agent: task.agent || '' } })));
    },
    async claimMessage(taskId, messageId, leaseMs = 300000) {
      return mutate(tasks => {
        const task = findTask(tasks, taskId);
        task.messages = Array.isArray(task.messages) ? task.messages : [];
        const message = task.messages.find(candidate => candidate.id === messageId);
        if (!message) throw new TaskError('Message not found.', 404);
        if (message.deliveryState === 'sending' && message.leaseUntil && Date.parse(message.leaseUntil) > Date.now()) throw new TaskError('Message is already claimed.', 409);
        if (!['queued', 'failed', 'sending'].includes(message.deliveryState)) throw new TaskError('Message is no longer claimable.', 409);
        message.deliveryState = 'sending';
        message.attempts = (message.attempts || 0) + 1;
        message.leaseUntil = new Date(Date.now() + leaseMs).toISOString();
        message.claimedAt = new Date().toISOString();
        return message;
      });
    },
    async acknowledgeMessage(taskId, messageId, turnId) {
      return mutate(tasks => {
        const task = findTask(tasks, taskId);
        task.messages = Array.isArray(task.messages) ? task.messages : [];
        const message = task.messages.find(candidate => candidate.id === messageId);
        if (!message) throw new TaskError('Message not found.', 404);
        if (turnId && typeof turnId === 'string') {
          message.turnId = turnId;
          if (task.workMessageId === message.id) {
            task.runtime = { ...task.runtime, turnId, statusManaged: false };
            if (task.pendingResult?.messageId === message.id) task.pendingResult.turnId = turnId;
          }
        }
        if (['delivered', 'started'].includes(message.deliveryState)) return message;
        if (!['sending', 'queued', 'unconfirmed'].includes(message.deliveryState)) throw new TaskError('Message cannot be acknowledged in its current state.', 409);
        message.deliveryState = 'delivered';
        message.deliveredAt = new Date().toISOString();
        delete message.leaseUntil;
        delete message.errorCode;
        return message;
      });
    },
    async retryMessage(taskId, messageId) {
      return mutate(tasks => {
        const task = findTask(tasks, taskId);
        task.messages = Array.isArray(task.messages) ? task.messages : [];
        const message = task.messages.find(candidate => candidate.id === messageId);
        if (!message) throw new TaskError('Message not found.', 404);
        if (message.deliveryState !== 'failed') throw new TaskError('Only failed messages can be retried.', 409);
        message.deliveryState = 'queued';
        delete message.errorCode;
        delete message.retryAt;
        return message;
      });
    },
    async startMessage(taskId, messageId, note = 'Agent resumed work from a task message.') {
      return mutate(tasks => {
        const task = findTask(tasks, taskId);
        task.messages = Array.isArray(task.messages) ? task.messages : [];
        const message = task.messages.find(candidate => candidate.id === messageId);
        if (!message) throw new TaskError('Message not found.', 404);
        if (message.deliveryState === 'started') return { task, message };
        if (!['delivered', 'sending'].includes(message.deliveryState)) throw new TaskError('Acknowledge the message before starting it.', 409);
        message.deliveryState = 'started';
        message.startedAt = new Date().toISOString();
        task.workGeneration = (task.workGeneration || 0) + 1;
        task.workMessageId = message.id;
        delete task.workRequestId;
        delete task.requestTurnId;
        message.workGeneration = task.workGeneration;
        delete task.pendingResult;
        delete message.leaseUntil;
        if (message.turnId) task.runtime = { ...task.runtime, turnId: message.turnId, statusManaged: false };
        task.status = 'in progress';
        task.note = note.trim() || 'Agent resumed work from a task message.';
        task.updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
        return { task, message };
      });
    }
  };
}
