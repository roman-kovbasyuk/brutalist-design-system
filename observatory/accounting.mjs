import { createHash } from 'node:crypto';
import { TaskError } from './store.mjs';

// The caller supplies the semantic classifier. Source content stays transient;
// only the validated decision and source identity reach the stores.
export async function accountSnapshot({ tasks, receipts, classify, timeoutMs = 10000, signal }, snapshot) {
  if (!classify) return { applied: 0, unresolved: 0 };
  const turns = snapshot.turnHistory?.kind === 'canonical' ? Object.values(snapshot.turnHistory.history?.entitiesByKey || {}) : snapshot.turns || [];
  const pending = (await receipts.list()).filter(receipt => receipt.conversationId === snapshot.id && (receipt.state === 'unassigned' || receipt.classificationState === 'applying'));
  let applied = 0, unresolved = 0;
  for (const receipt of pending) {
    if (signal?.aborted) return { applied, unresolved: pending.length - applied };
    const turn = turns.find(turn => turn.turnId === receipt.turnId);
    const source = turn?.items?.find(item => (item.type === 'userMessage' || item.type === 'steeringUserMessage' && item.status === 'accepted') && (receipt.clientId ? (item.clientId || item.clientUserMessageId) === receipt.clientId : (item.serverUserMessageId || item.id) === receipt.messageId));
    if (!source && !receipt.classificationDecision) { unresolved++; continue; }
    try {
      let decision = receipt.classificationDecision;
      if (!decision) {
        const controller = new AbortController();
        let timer, onAbort;
        try {
          const knownTasks = await tasks.list();
          decision = await Promise.race([
            Promise.resolve().then(() => classify({ receipt, source, tasks: knownTasks, signal: controller.signal })),
            new Promise((_, reject) => {
              onAbort = () => { controller.abort(); reject(new Error('Classification cancelled')); };
              signal?.addEventListener('abort', onAbort, { once: true });
              if (signal?.aborted) onAbort();
              timer = setTimeout(() => { controller.abort(); reject(new Error('Classification timed out')); }, timeoutMs);
            })
          ]);
        } finally { clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort', onAbort); }
      }
      if (!decision) { unresolved++; continue; }
      if (signal?.aborted) return { applied, unresolved: pending.length - applied };
      await classifyRequest({ tasks, receipts }, receipt.id, decision);
      applied++;
    } catch { unresolved++; }
  }
  return { applied, unresolved };
}

// This consumes a semantic decision. It never guesses intent from a task title
// and never executes the request being classified.
export async function classifyRequest({ tasks, receipts }, receiptId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TaskError('Expected a classification object.');
  let decision;
  if (input.kind === 'conversation' && Object.keys(input).length === 1) decision = { kind: 'conversation' };
  else if (input.kind === 'work' && Object.keys(input).every(key => ['kind', 'taskIds', 'newTasks'].includes(key))) {
    if (!Array.isArray(input.taskIds) || input.taskIds.some(id => typeof id !== 'string' || !id) || !Array.isArray(input.newTasks) || !input.taskIds.length && !input.newTasks.length || input.taskIds.length + input.newTasks.length > 10) throw new TaskError('Classify work into one to ten existing or new tasks.');
    const newTasks = input.newTasks.map(task => {
      if (!task || typeof task !== 'object' || Array.isArray(task) || Object.keys(task).some(key => !['title', 'description', 'category', 'page', 'section', 'anchor'].includes(key))) throw new TaskError('New tasks accept only sanitized titles, descriptions, categories and locations.');
      tasks.validateNewTask(task);
      return Object.fromEntries(Object.keys(task).sort().map(key => [key, task[key].trim()]));
    });
    decision = { kind: 'work', taskIds: [...new Set(input.taskIds)].sort(), newTasks };
  } else throw new TaskError('Classification must be ordinary conversation or work.');
  const receipt = (await receipts.list()).find(record => record.id === receiptId);
  if (!receipt) throw new TaskError('Request receipt not found.', 404);
  const known = await tasks.list();
  if (decision.taskIds?.some(id => !known.some(task => task.id === id))) throw new TaskError('Every referenced task must exist in this store.');
  const key = createHash('sha256').update(JSON.stringify(decision)).digest('hex');
  const reserved = await receipts.prepareClassification(receiptId, key, decision);
  if (reserved.classificationState === 'applied') return reserved;
  const created = decision.newTasks?.length ? await tasks.createFromRequest(receipt, decision.newTasks, key) : [];
  return receipts.classify(receiptId, key, {
    state: decision.kind === 'conversation' ? 'conversation' : 'linked',
    taskIds: [...new Set([...(decision.taskIds || []), ...created.map(task => task.id)])]
  });
}
