import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transact } from './storage-transaction.mjs';
import { defaultFile, TaskError } from './store.mjs';

export function reportedTaskIds(turn, tasks, project) {
  const known = new Set(tasks.map(task => task.id));
  const found = new Set();
  for (const item of turn.items || []) {
    if (item.type !== 'commandExecution' || item.exitCode !== 0 || item.cwd !== project || typeof item.command !== 'string' || item.command.includes('TASKS_FILE')) continue;
    // Only an executed CLI mutation with its actual JSON result is evidence.
    // Titles, prose references and list/get output never establish a task link.
    const command = item.command.replace(/^\/bin\/(?:zsh|bash) -l?c ["']/, '');
    if (!/^node\s+["']?(?:[^\s"']*\/)?observatory\/cli\.mjs["']?\s+(?:add|update|report|start|location|bind)\s/.test(command)) continue;
    try {
      const output = JSON.parse(item.aggregatedOutput);
      const task = output.task || output;
      if (known.has(task.id) && typeof task.title === 'string' && typeof task.status === 'string') found.add(task.id);
    } catch { /* Incomplete or mixed output is not reliable attribution. */ }
  }
  return [...found];
}

export function captureRequests(snapshot, tasks, { project = snapshot.cwd } = {}) {
  const turns = snapshot.turnHistory?.kind === 'canonical' ? Object.values(snapshot.turnHistory.history?.entitiesByKey || {}) : snapshot.turns || [];
  const receipts = new Map();
  for (const turn of turns) {
    if (!turn.turnId) continue;
    const sourceMessages = (turn.items || []).filter(item => item.type === 'userMessage' || item.type === 'steeringUserMessage' && item.status === 'accepted');
    // A turn may process several unrelated follow-ups. Turn-wide CLI evidence
    // cannot tell which of those requests a task update belongs to.
    const reportedIds = sourceMessages.length === 1 ? reportedTaskIds(turn, tasks, snapshot.cwd) : [];
    for (const item of sourceMessages) {
      const clientId = item.clientId || item.clientUserMessageId;
      const messageId = item.serverUserMessageId || item.id;
      if (!clientId && !messageId) continue;
      const id = createHash('sha256').update(JSON.stringify(['local', project, snapshot.id, clientId || messageId])).digest('hex');
      const direct = tasks.filter(task => task.binding?.provider === 'codex' && task.binding.conversationId === snapshot.id && ((clientId && task.messages?.some(message => message.id === clientId)) || task.sourceRequestIds?.includes(id)));
      const linked = direct.length ? direct : tasks.filter(task => reportedIds.includes(task.id));
      receipts.set(id, { id, conversationId: snapshot.id, turnId: turn.turnId, messageId, clientId: clientId || null, project, sourceCwd: snapshot.cwd, chat: snapshot.title || 'Codex task', createdAt: new Date(turn.turnStartedAtMs || snapshot.createdAt || 0).toISOString(), state: linked.length ? 'linked' : 'unassigned', taskIds: linked.map(task => task.id) });
    }
  }
  return [...receipts.values()];
}

export function createRequestStore(file = `${defaultFile}.requests.json`) {
  async function list() {
    try { const records = JSON.parse(await readFile(file, 'utf8')); if (!Array.isArray(records)) throw new Error('Invalid request ledger'); return records; }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function mutate(change) {
    return transact(file, async () => {
      const records = await list();
      return { data: records, result: await change(records) };
    });
  }
  return {
    list,
    async capture(receipts) {
      if (!receipts.length) return;
      return mutate(records => {
        const index = new Map(records.map(record => [record.id, record]));
        for (const receipt of receipts) {
          const previous = index.get(receipt.id);
          if (!previous) { records.push(receipt); index.set(receipt.id, receipt); }
          else {
            previous.chat = receipt.chat;
            previous.sourceCwd = receipt.sourceCwd;
            if (!previous.resolvedAt && previous.state !== 'conversation') { previous.state = receipt.state; previous.taskIds = receipt.taskIds; }
          }
        }
      });
    },
    async resolve(id, { state, taskIds }) {
      if (!['linked', 'conversation'].includes(state) || !Array.isArray(taskIds) || taskIds.some(id => typeof id !== 'string') || (state === 'linked' && !taskIds.length) || (state === 'conversation' && taskIds.length)) throw new TaskError('Resolve a request to task IDs or ordinary conversation.');
      return mutate(records => {
        const receipt = records.find(record => record.id === id);
        if (!receipt) throw new TaskError('Request receipt not found.', 404);
        receipt.state = state; receipt.taskIds = [...new Set(taskIds)]; receipt.resolvedAt = new Date().toISOString();
        delete receipt.classificationKey; delete receipt.classificationState;
        delete receipt.classificationDecision;
        return receipt;
      });
    },
    async prepareClassification(id, key, decision) {
      if (!/^[a-f0-9]{64}$/.test(key)) throw new TaskError('Invalid classification key.');
      return mutate(records => {
        const receipt = records.find(record => record.id === id);
        if (!receipt) throw new TaskError('Request receipt not found.', 404);
        if (receipt.classificationKey && receipt.classificationKey !== key || receipt.resolvedAt && !receipt.classificationKey) throw new TaskError('This request already has a different resolution.', 409);
        receipt.classificationKey = key;
        if (decision) receipt.classificationDecision = decision;
        receipt.classificationState ||= 'applying';
        return receipt;
      });
    },
    async classify(id, key, { state, taskIds }) {
      return mutate(records => {
        const receipt = records.find(record => record.id === id);
        if (!receipt || receipt.classificationKey !== key) throw new TaskError('Classification is no longer current.', 409);
        receipt.state = state; receipt.taskIds = taskIds;
        receipt.classificationState = 'applied'; receipt.resolvedAt = new Date().toISOString();
        return receipt;
      });
    }
  };
}
