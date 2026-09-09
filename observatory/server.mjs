import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createStore, TaskError } from './store.mjs';
import { createDispatcher } from './connector.mjs';
import { createBoard } from './board.mjs';
import { DesktopClient } from './codex-desktop.mjs';
import { createTaskAccess } from './task-access.mjs';

export function createApp(store = createStore(), dispatcher, board = createBoard(store)) {
  const access = createTaskAccess({ store, board });
  const wake = () => { if (dispatcher) void dispatcher.drain().catch(() => console.error('Codex delivery scan failed; queued messages remain persisted.')); };
  const server = createServer(async (req, res) => {
    function json(code, value) {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    }
    try {
      const allowedHosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
      if (!allowedHosts.includes(req.headers.host)) throw new TaskError('Invalid host.', 403);
      if (req.headers.origin && !allowedHosts.map(host => `http://${host}`).includes(req.headers.origin)) throw new TaskError('Cross-origin requests are not allowed.', 403);
      const url = new URL(req.url, 'http://localhost'), path = url.pathname;
      if (req.method === 'GET' && path === '/api/board') {
        const view = await board.get();
        const tasks = await access.list();
        for (const card of view.cards) card.files = tasks.find(task => task.id === card.id)?.attachments.map(({ content, path, ...file }) => file) || [];
        return json(200, view);
      }
      const attachmentPath = path.match(/^\/api\/board\/cards\/([a-f0-9-]+)\/attachments(?:\/([a-f0-9-]+|legacy-\d+))?$/);
      if (attachmentPath) {
        const [, taskId, fileId] = attachmentPath;
        if (req.method === 'POST' && !fileId) {
          if (Number(req.headers['content-length']) > 20 * 1024 * 1024) throw new TaskError('Attachment is too large (maximum 20 MiB).', 413);
          const file = await access.attach(taskId, { name: url.searchParams.get('name'), mediaType: req.headers['content-type'] || 'application/octet-stream' }, req.iterator({ destroyOnReturn: false }));
          const { path: localPath, ...metadata } = file;
          return json(201, metadata);
        }
        if (req.method === 'GET' && fileId) {
          const bytes = await access.file(taskId, fileId);
          const file = (await access.get(taskId)).attachments.find(file => file.id === fileId);
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length, 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.name), 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'no-store' });
          return res.end(bytes);
        }
        throw new TaskError('Invalid attachment action.', 404);
      }
      const boardPath = path.match(/^\/api\/board(?:\/(lanes|cards)(?:\/([a-f0-9-]+)(?:\/(start|link))?)?)?$/);
      if (req.method === 'GET' && path === '/api/connector') return json(200, dispatcher?.health?.() || { connected: false, error: 'Desktop connector is not configured.' });
      if (req.method === 'GET' && path === '/api/requests') return json(200, (await dispatcher?.requests?.() || []).filter(receipt => receipt.state === 'unassigned'));
      if (req.method === 'GET' && path === '/api/locations') return json(200, await store.locations());
      if (req.method === 'GET' && path === '/api/tasks') return json(200, (await store.list()).map(({ messages, ...task }) => task));
      const messagePath = path.match(/^\/api\/tasks\/([^/]+)\/messages$/);
      if (req.method === 'GET' && messagePath) return json(200, await store.messages(messagePath[1]));
      const messageActionPath = path.match(/^\/api\/tasks\/([^/]+)\/messages\/([^/]+)\/(claim|ack|start|retry|report)$/);
      const bindingPath = path.match(/^\/api\/tasks\/([^/]+)\/binding$/);
      if (boardPath && ['POST', 'PATCH', 'DELETE'].includes(req.method) || req.method === 'POST' && messageActionPath || req.method === 'POST' && messagePath || req.method === 'POST' && bindingPath || req.method === 'POST' && path === '/api/tasks' || req.method === 'PATCH' && /^\/api\/tasks\/[^/]+$/.test(path)) {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new TaskError('Use application/json.', 415);
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 600000) throw new TaskError('Request too large.', 413);
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new TaskError('Invalid JSON.'); }
        if (boardPath) {
          const [, collection, id, action] = boardPath;
          if (!collection && req.method === 'PATCH') return json(200, await board.settings(input));
          if (collection === 'lanes' && id && !action && req.method === 'DELETE') return json(200, await board.removeLane(id, input));
          if (collection === 'cards' && id && !action && req.method === 'DELETE') return json(200, await board.removeCard(id));
          if (collection === 'cards' && action === 'start' && req.method === 'POST') { const card = await board.start(id); json(200, card); wake(); return; }
          if (collection === 'cards' && action === 'link' && req.method === 'POST') {
            const card = await board.link(id, input, async (threadId, project) => {
              const client = new DesktopClient({ project });
              try {
                const state = await client.follow(threadId);
                if (state.cwd !== project) throw new TaskError('That Codex task belongs to a different checkout.');
              } finally { client.close(); }
            });
            json(200, card); wake(); return;
          }
          if (!action && ((req.method === 'POST' && !id) || (req.method === 'PATCH' && id))) {
            if (collection === 'lanes') return json(id ? 200 : 201, await board.lane(input, id));
            if (collection === 'cards') return json(id ? 200 : 201, await board.card(input, id));
          }
          throw new TaskError('Invalid board action.', 404);
        }
        if (messageActionPath) {
          const [, taskId, messageId, action] = messageActionPath;
          if (action === 'claim') return json(200, await store.claimMessage(taskId, messageId));
          if (action === 'ack') return json(200, await store.acknowledgeMessage(taskId, messageId));
          if (action === 'retry') { json(200, await store.retryMessage(taskId, messageId)); wake(); return; }
          if (action === 'report') return json(200, await store.reportMessage(taskId, messageId, input));
          return json(200, await store.startMessage(taskId, messageId, input.note || ''));
        }
        if (bindingPath) return json(200, await store.bind(bindingPath[1], input));
        if (messagePath) {
          const message = await store.sendMessage(messagePath[1], input);
          json(201, message);
          wake();
          return;
        }
        return req.method === 'POST' ? json(201, await store.add(input)) : json(200, await store.update(path.split('/').pop(), input));
      }
      const assets = {
        '/': [new URL('./public/index.html', import.meta.url), 'text/html'],
        '/app.js': [new URL('./public/app.js', import.meta.url), 'text/javascript'],
        '/board.js': [new URL('./public/board.js', import.meta.url), 'text/javascript'],
        '/board.css': [new URL('./public/board.css', import.meta.url), 'text/css'],
        '/style.css': [new URL('./public/style.css', import.meta.url), 'text/css'],
        '/vendor/inter-latin.woff2': [new URL('./node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', import.meta.url), 'font/woff2'],
        '/vendor/lucide.min.js': [new URL('./node_modules/lucide/dist/umd/lucide.min.js', import.meta.url), 'text/javascript']
      };
      if (req.method === 'GET' && assets[path]) {
        const [file, type] = assets[path];
        const body = await readFile(file);
        // Codex's browser comment overlay injects inline styles into its shadow root.
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
        return res.end(body);
      }
      json(404, { error: 'Not found.' });
    } catch (error) {
      if (!(error instanceof TaskError)) console.error(error);
      json(error.status || 500, { error: error.status ? error.message : 'Unable to read or save tasks. Check the server log.' });
    }
  });
  let timer;
  server.on('listening', () => { if (dispatcher) { wake(); timer = setInterval(wake, 5000); timer.unref(); } });
  server.on('close', () => { clearInterval(timer); dispatcher?.close?.(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = createStore();
  const server = createApp(store, createDispatcher(store));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(Number(process.env.PORT || 6001), '127.0.0.1', () => console.log(`Observatory is running at http://127.0.0.1:${server.address().port}`));
}
