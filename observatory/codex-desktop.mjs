import net from 'node:net';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Versioned desktop IPC, observed in the installed app. It is not the public
// App Server transport. Unknown versions fail closed; never claim ownership.
// Long desktop histories can exceed 32 MiB. Bound each frame at 128 MiB and
// collect chunks once, avoiding quadratic copies as a large snapshot arrives.
const MAX_FRAME = 128 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export class DeliveryNotSentError extends Error {
  constructor(message, retryable = true) { super(message); this.retryable = retryable; }
}
export function applyDesktopPatches(state, patches) {
  let next = structuredClone(state);
  for (const patch of patches) {
    if (!['add', 'replace', 'remove'].includes(patch.op) || !Array.isArray(patch.path) || patch.path.some(key => forbidden.has(String(key)))) throw new Error('Unsupported desktop patch');
    if (!patch.path.length) { if (patch.op === 'remove') throw new Error('Invalid root removal'); next = structuredClone(patch.value); continue; }
    let target = next;
    for (const key of patch.path.slice(0, -1)) {
      if (target == null || !Object.hasOwn(target, key)) throw new Error('Desktop patch path missing');
      target = target[key];
    }
    const key = patch.path.at(-1);
    if (target == null || typeof target !== 'object') throw new Error('Invalid desktop patch target');
    if (Array.isArray(target)) {
      if (!Number.isInteger(key) || key < 0 || key > target.length) throw new Error('Invalid desktop array index');
      if (patch.op === 'remove') target.splice(key, 1);
      else if (patch.op === 'add') target.splice(key, 0, structuredClone(patch.value));
      else target[key] = structuredClone(patch.value);
    } else if (patch.op === 'remove') delete target[key];
    else target[key] = structuredClone(patch.value);
  }
  return next;
}

export class DesktopClient extends EventEmitter {
  constructor({ project, socketPath = join(homedir(), '.codex/ipc/ipc.sock'), timeoutMs = 10000 } = {}) {
    super();
    this.project = resolve(project || process.cwd());
    this.projectRoots = new Set([this.project]);
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.owners = new Map();
    this.states = new Map();
    this.revisions = new Map();
    this.following = new Map();
    this.historyLoaded = new Set();
  }
  async connect() {
    if (this.closed) throw new Error('Desktop client is closed');
    if (this.clientId && this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  setProjectRoots(roots) { this.projectRoots = new Set([this.project, ...roots.map(root => resolve(root))]); }
  async open() {
    const [directory, socketInfo] = await Promise.all([lstat(dirname(this.socketPath)), lstat(this.socketPath)]);
    const uid = process.getuid?.();
    if (uid == null || directory.uid !== uid || socketInfo.uid !== uid || !directory.isDirectory() || !socketInfo.isSocket() || directory.mode & 0o022) throw new Error('Desktop socket ownership check failed');
    const header = Buffer.alloc(4);
    let headerBytes = 0, expected = 0, received = 0, chunks = [];
    const socket = this.socket = net.createConnection(this.socketPath);
    socket.on('data', chunk => {
      try {
        let offset = 0;
        while (offset < chunk.length) {
          if (headerBytes < 4) {
            const count = Math.min(4 - headerBytes, chunk.length - offset);
            chunk.copy(header, headerBytes, offset, offset + count);
            headerBytes += count; offset += count;
            if (headerBytes < 4) break;
            expected = header.readUInt32LE(0);
            if (!expected || expected > MAX_FRAME) throw new Error(`Desktop frame exceeds limit (${expected} bytes)`);
          }
          const count = Math.min(expected - received, chunk.length - offset);
          if (count) chunks.push(chunk.subarray(offset, offset + count));
          received += count; offset += count;
          if (received === expected) {
            const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, expected);
            headerBytes = 0; expected = 0; received = 0; chunks = [];
            this.receive(JSON.parse(body));
          }
        }
      } catch (error) {
        // Report only our fixed diagnostics, never malformed payload content.
        const detail = /^(Desktop |Invalid desktop|Unknown desktop|Unsupported desktop)/.test(error.message) ? error.message : 'Invalid protocol payload';
        this.emit('fault', 'desktop_protocol_error', detail); socket.destroy();
      }
    });
    socket.on('error', () => this.emit('fault', 'desktop_connection_error'));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.clientId = undefined;
      this.states.clear(); this.revisions.clear(); this.owners.clear(); this.historyLoaded.clear();
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Desktop connection closed; delivery may be uncertain')); }
      this.pending.clear();
      this.emit('disconnected');
    });
    await new Promise((yes, no) => {
      const timer = setTimeout(() => { socket.destroy(); no(new Error('Desktop connection timed out')); }, this.timeoutMs);
      socket.once('connect', () => { clearTimeout(timer); yes(); });
      socket.once('error', error => { clearTimeout(timer); no(error); });
    });
    try {
      const response = await this.request('initialize', { clientType: 'observatory' }, 0);
      if (typeof response.result?.clientId !== 'string') throw new Error('Invalid desktop initialization');
      this.clientId = response.result.clientId;
    } catch (error) { socket.destroy(); throw error; }
  }
  write(message) {
    if (!this.socket || this.socket.destroyed) throw new Error('Desktop disconnected');
    const body = Buffer.from(JSON.stringify(message));
    if (body.length > MAX_FRAME) throw new Error('Desktop request too large');
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    this.socket.write(Buffer.concat([header, body]));
  }
  request(method, params, version, targetClientId) {
    return new Promise((yes, no) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(requestId); no(new Error('Desktop request timed out; delivery may be uncertain')); }, this.timeoutMs);
      this.pending.set(requestId, { resolve: yes, reject: no, timer });
      try { this.write({ type: 'request', requestId, sourceClientId: this.clientId, method, params, version, targetClientId, timeoutMs: this.timeoutMs }); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); no(error); }
    });
  }
  receive(message) {
    if (message.type === 'client-discovery-request') {
      this.write({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } });
    } else if (message.type === 'response') {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.requestId);
      if (message.resultType === 'success') pending.resolve(message);
      else pending.reject(new Error(`Desktop rejected request: ${message.error}`));
    } else if (message.type === 'broadcast' && message.method === 'thread-stream-state-changed') {
      const { conversationId: id, hostId, change } = message.params || {};
      if (hostId !== 'local' || this.owners.get(id) !== message.sourceClientId) return;
      if (message.version !== 11) { this.emit('fault', 'desktop_version_unsupported'); return; }
      if (!Number.isSafeInteger(change?.revision) || change.revision < 0) throw new Error('Invalid desktop revision');
      if (change.revision < (this.revisions.get(id) ?? -1)) return;
      let state;
      if (change.type === 'snapshot') state = change.conversationState;
      else if (change.type === 'patches') {
        if (change.revision === this.revisions.get(id)) return;
        if (!this.states.has(id) || this.revisions.get(id) !== change.baseRevision) { this.states.delete(id); this.subscribe(id); return; }
        state = applyDesktopPatches(this.states.get(id), change.patches);
      } else throw new Error('Unknown desktop change');
      if (!state || typeof state !== 'object' || state.id && state.id !== id) throw new Error('Invalid desktop conversation');
      this.states.set(id, state); this.revisions.set(id, change.revision);
      this.emit('state', id, state);
    }
  }
  subscribe(id) {
    this.write({ type: 'broadcast', method: 'thread-stream-following-changed', version: 1, sourceClientId: this.clientId, targetClientIds: [this.owners.get(id)], params: { hostId: 'local', conversationId: id, following: true } });
  }
  follow(id) {
    if (!this.following.has(id)) this.following.set(id, this.followOnce(id).finally(() => this.following.delete(id)));
    return this.following.get(id);
  }
  async followOnce(id) {
    await this.connect();
    const owner = await this.request('thread-owner-discovery', { hostId: 'local', conversationId: id }, 1);
    if (typeof owner.handledByClientId !== 'string') throw new Error('Desktop owner is unavailable');
    if (this.owners.get(id) !== owner.handledByClientId) {
      this.states.delete(id); this.revisions.delete(id); this.historyLoaded.delete(id);
    }
    this.owners.set(id, owner.handledByClientId);
    return new Promise((yes, no) => {
      const done = (error, state) => { clearTimeout(timer); this.off('state', onState); this.off('disconnected', onDisconnect); error ? no(error) : yes(state); };
      const onState = (threadId, state) => { if (threadId === id) done(null, state); };
      const onDisconnect = () => done(new Error('Desktop disconnected'));
      const timer = setTimeout(() => done(new Error('Desktop state timed out')), this.timeoutMs);
      this.on('state', onState); this.once('disconnected', onDisconnect);
      try { this.subscribe(id); } catch (error) { done(error); }
    });
  }
  async send(id, text, messageId) {
    let state;
    try { state = await this.follow(id); }
    catch { throw new DeliveryNotSentError('Codex owner is unavailable; no comment was submitted.'); }
    if (!state.cwd || !this.projectRoots.has(resolve(state.cwd))) throw new DeliveryNotSentError('Desktop task project does not match Observatory', false);
    if (!['active', 'idle'].includes(state.threadRuntimeStatus?.type)) throw new DeliveryNotSentError('Codex is not ready to receive work; no comment was submitted.');
    const input = [{ type: 'text', text, text_elements: [] }];
    let response;
    if (state.threadRuntimeStatus?.type === 'active') {
      response = await this.request('thread-follower-steer-turn', {
        conversationId: id, input, clientUserMessageId: messageId, attachments: [],
        restoreMessage: { id: messageId, text, cwd: state.cwd, createdAt: Date.now(), context: { prompt: text, addedFiles: [], fileAttachments: [], imageAttachments: [], commentAttachments: [], ideContext: null, workspaceRoots: [state.cwd] } }
      }, 1, this.owners.get(id));
    } else if (state.threadRuntimeStatus?.type === 'idle') {
      response = await this.request('thread-follower-start-turn', { conversationId: id, turnStart: { request: { threadId: id, input, clientUserMessageId: messageId }, context: { inheritThreadSettings: true } } }, 2, this.owners.get(id));
    } else throw new Error('Desktop task is not ready to receive work');
    return { ...(response.result?.result ?? response.result), deliveryMode: state.threadRuntimeStatus.type === 'active' ? 'steer' : 'start' };
  }
  async loadCompleteHistory(id) {
    if (!this.states.has(id)) await this.follow(id);
    if (this.states.get(id)?.turnHistory?.history?.isComplete === true) this.historyLoaded.add(id);
    if (this.historyLoaded.has(id)) return this.states.get(id);
    const owner = this.owners.get(id);
    const response = await this.request('thread-follower-load-complete-history', { conversationId: id }, 1, owner);
    const revision = response.result?.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid desktop history receipt');
    const current = () => this.owners.get(id) === owner && this.states.has(id) && this.revisions.get(id) >= revision;
    if (!current()) await new Promise((yes, no) => {
      const done = error => { clearTimeout(timer); this.off('state', onState); this.off('disconnected', onDisconnect); error ? no(error) : yes(); };
      const onState = threadId => {
        if (threadId !== id) return;
        if (this.owners.get(id) !== owner) done(new Error('Desktop history owner changed'));
        else if (current()) done();
      };
      const onDisconnect = () => done(new Error('Desktop disconnected during history reconciliation'));
      const timer = setTimeout(() => done(new Error('Desktop history reconciliation timed out')), this.timeoutMs);
      this.on('state', onState); this.once('disconnected', onDisconnect);
    });
    if (this.states.get(id)?.turnHistory?.history?.isComplete !== true) throw new Error('Desktop history is not complete');
    this.historyLoaded.add(id);
    return this.states.get(id);
  }
  close() { this.closed = true; this.socket?.destroy(); }
}

export function desktopObservation(snapshot, mappedTurnId) {
  const turns = snapshot.turnHistory?.kind === 'canonical'
    ? Object.values(snapshot.turnHistory.history?.entitiesByKey || {}) : snapshot.turns || [];
  const latest = turns.filter(turn => turn.turnId && Number.isFinite(turn.turnStartedAtMs)).sort((a, b) => b.turnStartedAtMs - a.turnStartedAtMs)[0];
  const runtime = snapshot.threadRuntimeStatus;
  const selected = mappedTurnId ? turns.find(turn => turn.turnId === mappedTurnId) : runtime?.type === 'active' && latest?.status !== 'inProgress' ? null : latest;
  const terminal = mappedTurnId && ['completed', 'failed', 'interrupted'].includes(selected?.status);
  const flags = terminal ? [] : runtime?.activeFlags || [];
  let state = runtime?.type || 'unknown', reason = '';
  if (terminal) state = 'idle';
  else if (mappedTurnId && (!selected || selected.turnId !== latest?.turnId)) state = 'unknown';
  if (state === 'active' && flags.includes('waitingOnApproval')) { state = 'waiting'; reason = 'Codex is waiting for approval.'; }
  else if (state === 'active' && flags.includes('waitingOnUserInput')) { state = 'waiting'; reason = 'Codex is waiting for your input.'; }
  else if (state === 'systemError') reason = 'Codex reported a runtime error.';
  else if (state === 'idle' && selected?.status === 'interrupted') reason = 'Codex execution was interrupted.';
  else if (state === 'idle' && selected?.status === 'failed') reason = 'Codex execution failed.';
  else if (state === 'idle') reason = 'Codex stopped without a verified task outcome.';
  const current = selected?.turnId === latest?.turnId;
  return { state, reason, turnId: selected?.turnId || null, turnStatus: selected?.status || null, observedAt: new Date().toISOString(), model: current ? snapshot.latestModel || '' : '', effort: current ? snapshot.latestReasoningEffort || '' : '', chat: snapshot.title || '', cwd: snapshot.cwd || '' };
}
