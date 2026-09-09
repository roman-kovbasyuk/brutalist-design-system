import net from 'node:net';
import { lstat, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { TaskError } from './store.mjs';

// The desktop's bundled app-tools bridge, not the model API. The server inherits
// its calling task identity and pipe from a Codex terminal. No credentials stored.
export function createLauncher({ pipe = process.env.CODEX_APP_TOOLS_PIPE_PATH, threadId = process.env.CODEX_THREAD_ID, timeoutMs = 45000, rpc = pipeRequest } = {}) {
  async function call(tool, args, callId = randomUUID()) {
    if (!pipe || !threadId) throw Object.assign(new TaskError('Start Observatory from a Codex task terminal to enable task creation.', 503), { notSent: true });
    const result = await rpc(pipe, { id: callId, jsonrpc: '2.0', method: 'tools/call', params: {
      namespace: 'codex_app', tool, arguments: args, threadId,
      callId, turnId: `observatory-${callId}`
    } }, timeoutMs);
    const text = result?.contentItems?.find(item => item.type === 'inputText')?.text;
    if (!result?.success) throw new Error(text || 'Codex did not confirm the operation.');
    try { return JSON.parse(text); } catch { throw new Error('Codex returned an unsupported receipt.'); }
  }
  return {
    configured: Boolean(pipe && threadId),
    async prepare(project) {
      let catalog;
      try { catalog = await call('list_projects', {}); }
      catch { throw new TaskError('Codex task creation is unavailable. Open Codex and run npm start from its task terminal so Observatory uses the bundled runtime.', 503); }
      const root = await realpath(project);
      const matches = [];
      for (const candidate of catalog.projects || []) {
        if (candidate.projectKind !== 'local' || candidate.hostId !== 'local' || !candidate.path) continue;
        if (await realpath(candidate.path).catch(() => null) === root) matches.push(candidate);
      }
      if (matches.length !== 1) throw new TaskError('Open this exact project in Codex before starting a card.', 503);
      return matches[0].projectId;
    },
    async launch({ projectId, title, prompt, launchId }) {
      // The board operates on the current checkout, including its local context.
      const result = await call('create_thread', { title, prompt, target: { type: 'project', projectId, environment: { type: 'local' } } }, launchId);
      const id = result.threadId || result.conversationId;
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Codex creation is unconfirmed. Check Codex before linking this card.');
      return { threadId: id };
    }
  };
}


export async function pipeRequest(pipe, request, timeoutMs) {
  let info;
  try { info = await lstat(pipe); }
  catch { throw Object.assign(new Error('Codex app tools are unavailable.'), { notSent: true }); }
  if (!info.isSocket() || info.uid !== process.getuid?.() || (info.mode & 0o077)) throw Object.assign(new Error('Codex app tools socket ownership check failed.'), { notSent: true });
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipe);
    let buffer = Buffer.alloc(0), settled = false, submitted = false;
    const done = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      if (error && !submitted) error.notSent = true;
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => done(new Error('Codex request timed out; creation may be unconfirmed.')), timeoutMs);
    socket.once('connect', () => {
      const body = Buffer.from(JSON.stringify(request));
      const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
      submitted = true;
      socket.write(Buffer.concat([header, body]));
    });
    socket.on('error', () => done(new Error('Codex app tools are unavailable.')));
    socket.on('close', () => done(new Error('Codex disconnected before confirming the operation.')));
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const size = buffer.readUInt32LE(0);
      if (!size || size > 8 * 1024 * 1024) return done(new Error('Unsupported Codex response.'));
      if (buffer.length < size + 4) return;
      try {
        const response = JSON.parse(buffer.subarray(4, size + 4));
        if (response.id !== request.id) return done(new Error('Codex did not confirm the operation.'));
        if (response.error) return done(Object.assign(new Error('Codex rejected the operation.'), { notSent: response.error.code === -32602 }));
        done(null, response.result);
      } catch { done(new Error('Unsupported Codex response.')); }
    });
  });
}
