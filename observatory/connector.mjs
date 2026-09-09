import { DesktopClient, desktopObservation, DeliveryNotSentError } from './codex-desktop.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultFile } from './store.mjs';
import { readCodexCatalog } from './codex-catalog.mjs';
import { readCodexTerminals } from './codex-terminal.mjs';
import { createRequestStore, captureRequests } from './requests.mjs';
import { discoverProjectRoots } from './project-scope.mjs';
import { accountSnapshot } from './accounting.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

// Deliver through the existing desktop task owner; never spawn another agent.
export function createCodexAdapter({ tasksFile = defaultFile, client = new DesktopClient({ project }), catalog = readCodexCatalog, scope = discoverProjectRoots, requestStore = createRequestStore(`${tasksFile}.requests.json`), classify, terminals = readCodexTerminals } = {}) {
  let store, tracked = [], updates = Promise.resolve();
  const accountingQueue = new Map();
  const accountingShutdown = new AbortController();
  let accountingRunning = false, closed = false;
  async function drainAccounting() {
    if (accountingRunning || closed) return;
    accountingRunning = true;
    try {
      while (accountingQueue.size && !closed) {
        const [id, snapshot] = accountingQueue.entries().next().value;
        accountingQueue.delete(id);
        try {
          const result = await accountSnapshot({ tasks: store, receipts: requestStore, classify, signal: accountingShutdown.signal }, snapshot);
          if (result.unresolved) seen.delete(id);
        } catch { seen.delete(id); }
      }
    } finally { accountingRunning = false; }
  }
  let roots = new Set([resolve(project)]), canonicalProject = resolve(project);
  async function refreshScope() {
    const verified = await scope(project);
    if (!Array.isArray(verified) || !verified.length || verified.some(root => typeof root !== 'string')) throw new Error('Invalid project scope');
    roots = new Set(verified.map(root => resolve(root)));
    roots.add(resolve(project));
    canonicalProject = resolve(verified[0]);
    client.setProjectRoots?.([...roots]);
  }
  const seen = new Map();
  const health = { connected: false, lastCheckedAt: null, error: null, discoveredThreads: 0, followedThreads: 0, unassignedRequests: 0 };
  client.on('state', (id, snapshot) => {
    if (!store || !roots.has(resolve(snapshot.cwd || '/'))) return;
    const observation = desktopObservation(snapshot);
    const receipts = captureRequests(snapshot, tracked, { project: canonicalProject });
    const signature = JSON.stringify({ ...observation, observedAt: undefined, receipts: receipts.map(receipt => [receipt.id, receipt.state, receipt.taskIds]) });
    const targets = tracked.filter(task => task.binding?.provider === 'codex' && task.binding.conversationId === id && roots.has(resolve(task.binding.projectId)));
    const taskObservations = new Map(targets.map(task => {
      const acceptedTurn = receipts.find(receipt => receipt.clientId === task.workMessageId)?.turnId;
      return [task.id, desktopObservation(snapshot, acceptedTurn || task.pendingResult?.turnId || task.runtime?.turnId)];
    }));
    const targetSignature = signature + JSON.stringify(targets.map(task => [task.id, task.status, task.workGeneration, task.pendingResult?.generation, task.runtime?.turnId, task.messages?.map(message => [message.id, message.deliveryState, message.turnId]), { ...taskObservations.get(task.id), observedAt: undefined }]).sort());
    if (seen.get(id) === targetSignature) return;
    seen.set(id, targetSignature);
    updates = updates.then(async () => {
      await requestStore.capture(receipts);
      for (const task of targets) {
        for (const message of task.messages || []) {
          if (!['sending', 'unconfirmed', 'delivered', 'started'].includes(message.deliveryState)) continue;
          if (message.turnId && ['delivered', 'started'].includes(message.deliveryState)) continue;
          const receipt = receipts.find(receipt => receipt.clientId === message.id && receipt.conversationId === message.binding.conversationId);
          if (receipt?.turnId) await store.acknowledgeMessage(task.id, message.id, receipt.turnId);
        }
        await store.observeRuntime(task.id, taskObservations.get(task.id));
      }
      if (classify) {
        accountingQueue.set(id, snapshot);
        void drainAccounting();
      }
    }).catch(() => { seen.delete(id); health.error = 'Unable to save Codex observations.'; });
  });
  client.on('disconnected', () => { seen.clear(); health.connected = false; health.error = 'Codex disconnected.'; });
  client.on('fault', code => { health.error = code === 'desktop_version_unsupported' ? 'This Codex version requires adapter validation.' : 'Codex connection interrupted.'; });
  return {
    client,
    health: () => ({ ...health }),
    requests: () => requestStore.list(),
    async probe() {
      try { await client.connect(); health.connected = true; return true; } catch { health.connected = false; health.error = 'Codex desktop is unavailable.'; return false; }
    },
    async sync(taskStore, tasks) {
      store = taskStore; tracked = tasks;
      let discovered = [];
      let discoveryError = null;
      try { await refreshScope(); } catch {
        roots = new Set([resolve(project)]); client.setProjectRoots?.([...roots]);
        discoveryError = 'Worktree discovery is unavailable; only this checkout is monitored.';
      }
      try { discovered = await catalog(project, { roots: [...roots], includeArchived: true }); } catch { discoveryError = 'Codex task discovery is unavailable; linked tasks remain monitored.'; }
      const archived = new Set(discovered.filter(task => task.archived === 1).map(task => task.id));
      const needsMonitoring = task => !archived.has(task.binding.conversationId) || task.status !== 'ready' || task.pendingResult || task.messages?.some(message => ['queued', 'sending', 'delivered', 'unconfirmed', 'failed'].includes(message.deliveryState));
      const ids = [...new Set([...discovered.filter(task => task.archived !== 1).map(task => task.id), ...tasks.filter(task => task.binding?.provider === 'codex' && roots.has(resolve(task.binding.projectId)) && needsMonitoring(task)).map(task => task.binding.conversationId)])];
      health.discoveredThreads = ids.length;
      let followed = 0, historyFailures = 0;
      for (let start = 0; start < ids.length; start += 4) {
        await Promise.all(ids.slice(start, start + 4).map(async id => {
          try {
            await client.follow(id); followed++;
            try { await client.loadCompleteHistory?.(id); } catch { historyFailures++; }
          } catch { seen.delete(id); }
        }));
      }
      health.followedThreads = followed;
      const failures = [discoveryError];
      if (followed < ids.length) failures.push(`${ids.length - followed} Codex task(s) are unreachable; their status cannot be reconciled.`);
      if (historyFailures) failures.push(`Request history reconciliation is incomplete for ${historyFailures} Codex task(s).`);
      health.error = failures.filter(Boolean).join(' ') || null;
      health.lastCheckedAt = new Date().toISOString();
      await updates;
      // Desktop snapshots can retain inProgress on older completed turns.
      // Recover only explicit terminal events for pending verified results.
      const pending = (store.list ? await store.list() : tasks).filter(task => (task.pendingResult?.turnId || (task.status === 'ready' && task.runtime?.state === 'unknown' && task.runtime?.turnId)) && task.binding?.provider === 'codex' && roots.has(resolve(task.binding.projectId)));
      const terminalTargets = {};
      for (const task of pending) (terminalTargets[task.binding.conversationId] ||= []).push(task.pendingResult?.turnId || task.runtime.turnId);
      try {
        const events = await terminals(terminalTargets, { roots: [...roots] });
        for (const task of pending) {
          const event = events.find(event => event.conversationId === task.binding.conversationId && event.turnId === (task.pendingResult?.turnId || task.runtime.turnId));
          if (event) await store.observeRuntime(task.id, { ...event, state: 'idle', observedAt: new Date().toISOString(), reason: event.turnStatus === 'completed' ? 'Exact Codex turn completion recovered from local event log.' : 'Codex execution was interrupted.', expectedWorkGeneration: task.workGeneration, expectedConversationId: task.binding.conversationId });
        }
      } catch { health.error = [health.error, 'Pending result terminal reconciliation is unavailable.'].filter(Boolean).join(' '); }
      health.unassignedRequests = (await requestStore.list()).filter(receipt => receipt.state === 'unassigned').length;
    },
    async send(task, message) {
      try { await refreshScope(); } catch { throw new DeliveryNotSentError('Project scope is unavailable; no comment was submitted.'); }
      if (!roots.has(resolve(message.binding.projectId))) throw new DeliveryNotSentError('Task project does not match connector', false);
      const cli = `TASKS_FILE=${quote(resolve(tasksFile))} node ${quote(resolve(project, 'observatory/cli.mjs'))}`;
      const prompt = `Observatory follow-up ${message.id} for task ${task.id}.\nBefore doing this work, run:\n${cli} ack ${task.id} ${message.id}\n${cli} start ${task.id} ${message.id}\nThen carry out the user's comment below. Report this message at milestones using: ${cli} report ${task.id} ${message.id} '<status>' '<progress or verification note>'. Use ready only after verification, or needs attention with the blocker before ending incomplete. Always use this message-scoped report command so an older reply cannot finish newer work. A ready report is finalized after the matching Codex run completes.\n\nUser comment:\n${message.text}`;
      return client.send(message.binding.conversationId, prompt, message.id);
    },
    close() { closed = true; accountingShutdown.abort(); accountingQueue.clear(); client.close(); }
  };
}

export function createDispatcher(store, adapter = createCodexAdapter()) {
  let running, synchronizing, requested = false, online = false, closed = false;
  async function dispatch() {
    const tasks = await store.list();
    online = await adapter.probe();
    const blocked = new Set();
    const messages = tasks.flatMap(task => (task.messages || []).map(message => ({ task, message })))
      .sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt));
    for (const { task, message } of messages) {
      if (message.binding?.provider !== 'codex') continue;
      const conversation = message.binding.conversationId;
      if (blocked.has(conversation)) continue;
      if (message.deliveryState === 'sending' && Date.parse(message.leaseUntil) <= Date.now()) {
        await store.deliveryIssue(task.id, message.id, 'unconfirmed', 'delivery_uncertain');
        blocked.add(conversation);
        continue;
      }
      if (['sending', 'unconfirmed'].includes(message.deliveryState)) { blocked.add(conversation); continue; }
      if (message.deliveryState !== 'queued') continue;
      if (!online) {
        if (message.errorCode !== 'codex_desktop_unavailable') await store.deliveryIssue(task.id, message.id, 'queued', 'codex_desktop_unavailable');
        continue;
      }
      try { await store.claimMessage(task.id, message.id, 30000); }
      catch (error) { if (error.status === 409) { blocked.add(conversation); continue; } throw error; }
      try {
        const receipt = await adapter.send(task, message);
        await store.acknowledgeMessage(task.id, message.id, receipt?.turnId || receipt?.turn?.id);
      } catch (error) {
        if (error instanceof DeliveryNotSentError) {
          await store.deliveryIssue(task.id, message.id, error.retryable ? 'queued' : 'failed', error.retryable ? 'codex_owner_unavailable' : 'destination_mismatch');
        } else {
          // Submission may have been accepted. Reconcile the exact receipt
          // before allowing any retry of an uncertain delivery.
          await store.deliveryIssue(task.id, message.id, 'unconfirmed', 'delivery_uncertain');
        }
        blocked.add(conversation);
      }
    }
  }
  function synchronize() {
    if (closed || !online || !adapter.sync) return;
    return synchronizing ||= (async () => {
      await adapter.sync(store, await store.list());
    })().finally(() => { synchronizing = undefined; });
  }
  return {
    drain() {
      if (closed) return Promise.resolve();
      requested = true;
      const delivery = running ||= (async () => {
        do { requested = false; await dispatch(); } while (requested && !closed);
      })().finally(() => { running = undefined; });
      // Release the delivery queue before observing other conversations. A new
      // HTTP comment can dispatch while the exclusive status scan is pending.
      return delivery.then(synchronize);
    },
    health() { return adapter.health?.() || { connected: false, error: 'No desktop adapter configured.' }; },
    requests() { return adapter.requests?.() || Promise.resolve([]); },
    close() { closed = true; adapter.close?.(); }
  };
}
