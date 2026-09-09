#!/usr/bin/env node
import { createStore, statuses } from './store.mjs';
import { resolve } from 'node:path';
import { createRequestStore } from './requests.mjs';
import { readFile } from 'node:fs/promises';
import { classifyRequest } from './accounting.mjs';
import { runTaskCommand, taskHelp } from './task-cli.mjs';

const help = `Project Observatory — works even when the dashboard is closed.

  node observatory/cli.mjs list
  node observatory/cli.mjs locations
  node observatory/cli.mjs get <id>
  node observatory/cli.mjs add '<title>' '<description>' ['<model>'] ['<effort>'] ['<chat name>'] ['<category>']
  node observatory/cli.mjs update <id> '<status>' '<progress or verification note>' ['<model>'] ['<effort>'] ['<chat name>'] ['<category>']
  node observatory/cli.mjs section <id> '<page / section>'
  node observatory/cli.mjs location <id> '<screen>' '<section>' ['<anchor URL>']
  node observatory/cli.mjs inbox ['<chat name>']
  node observatory/cli.mjs requests ['<conversation id>']
  node observatory/cli.mjs requests --all ['<conversation id>']
  node observatory/cli.mjs classify-request <receipt id> <decision JSON file>
  node observatory/cli.mjs start-request <task id> <receipt id>
  node observatory/cli.mjs report-request <task id> <receipt id> '<status>' '<note>'
  node observatory/cli.mjs resolve-request <receipt id> <task id> [<task id>...]
  node observatory/cli.mjs resolve-conversation <receipt id>
  node observatory/cli.mjs claim <task id> <message id>
  node observatory/cli.mjs ack <task id> <message id>
  node observatory/cli.mjs start <task id> <message id> ['<note>']
  node observatory/cli.mjs report <task id> <message id> '<status>' '<note>' ['<model>'] ['<effort>'] ['<chat name>'] ['<category>']
  node observatory/cli.mjs retry <task id> <message id>
  node observatory/cli.mjs bind <task id> <project id> <provider> <conversation id>

Statuses: ${statuses.join(' | ')}
Known screen/section links come from observatory/locations.json when the anchor is omitted.
Output: JSON. Optional TASKS_FILE selects a shared absolute data-file path.

${taskHelp}`;

try {
  const [command, ...args] = process.argv.slice(2);
  const store = createStore();
  let result;
  if (!command || command === '--help') { console.log(help); process.exit(0); }
  if (command === 'task') result = await runTaskCommand(store, args);
  else if (command === 'list' && args.length === 0) result = await store.list();
  else if (command === 'locations' && args.length === 0) result = await store.locations();
  else if (command === 'get' && args.length === 1) {
    result = (await store.list()).find(task => task.id === args[0]);
    if (!result) throw new Error('Task not found.');
  } else if (command === 'add' && args.length >= 1 && args.length <= 6) {
    const conversationId = process.env.CODEX_THREAD_ID;
    const binding = conversationId && /^[0-9a-f-]{36}$/i.test(conversationId)
      ? { provider: 'codex', projectId: resolve(process.cwd()), conversationId } : undefined;
    result = await store.add({ title: args[0], description: args[1] || '', model: args[2] || '', effort: args[3] || '', agent: args[4] || '', category: args[5] || '' }, binding);
  } else if (command === 'update' && args.length >= 3 && args.length <= 7) {
    result = await store.update(args[0], { status: args[1], note: args[2], ...(args[3] === undefined ? {} : { model: args[3] }), ...(args[4] === undefined ? {} : { effort: args[4] }), ...(args[5] === undefined ? {} : { agent: args[5] }), ...(args[6] === undefined ? {} : { category: args[6] }) });
  } else if (command === 'section' && args.length === 2) {
    result = await store.update(args[0], { section: args[1] });
  } else if (command === 'location' && args.length >= 3 && args.length <= 4) {
    result = await store.update(args[0], { page: args[1], section: args[2], ...(args[3] === undefined ? {} : { anchor: args[3] }) });
  } else if (command === 'inbox' && args.length <= 1) {
    result = await store.inbox(args[0] || '');
  } else if (command === 'requests' && (args.length <= 1 || args.length === 2 && args[0] === '--all')) {
    const all = args[0] === '--all';
    const conversationId = (all ? args[1] : args[0]) || process.env.CODEX_THREAD_ID;
    result = (await createRequestStore().list()).filter(receipt => (all || receipt.state === 'unassigned') && (!conversationId || receipt.conversationId === conversationId));
  } else if ((command === 'start-request' && args.length === 2) || (command === 'report-request' && args.length === 4)) {
    const receipt = (await createRequestStore().list()).find(record => record.id === args[1]);
    if (!receipt) throw new Error('Request receipt not found.');
    if (process.env.CODEX_THREAD_ID && receipt.conversationId !== process.env.CODEX_THREAD_ID) throw new Error('Report requests from their owning Codex conversation.');
    result = command === 'start-request'
      ? await store.startRequest(args[0], receipt)
      : await store.reportRequest(args[0], receipt.id, { status: args[2], note: args[3] });
  } else if (command === 'classify-request' && args.length === 2) {
    const receipts = createRequestStore();
    const receipt = (await receipts.list()).find(record => record.id === args[0]);
    if (!receipt) throw new Error('Request receipt not found.');
    if (process.env.CODEX_THREAD_ID && receipt.conversationId !== process.env.CODEX_THREAD_ID) throw new Error('Classify requests from their owning Codex conversation.');
    const decision = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
    result = await classifyRequest({ tasks: store, receipts }, args[0], decision);
  } else if (command === 'resolve-request' && args.length >= 2) {
    const receipts = createRequestStore();
    const receipt = (await receipts.list()).find(receipt => receipt.id === args[0]);
    if (!receipt) throw new Error('Request receipt not found.');
    const tasks = await store.list();
    if (args.slice(1).some(id => !tasks.some(task => task.id === id))) throw new Error('Every linked task must exist in this Observatory store.');
    if (process.env.CODEX_THREAD_ID && receipt.conversationId !== process.env.CODEX_THREAD_ID) throw new Error('Resolve requests from their owning Codex conversation.');
    result = await receipts.resolve(args[0], { state: 'linked', taskIds: args.slice(1) });
  } else if (command === 'resolve-conversation' && args.length === 1) {
    const receipts = createRequestStore();
    const receipt = (await receipts.list()).find(receipt => receipt.id === args[0]);
    if (process.env.CODEX_THREAD_ID && receipt?.conversationId !== process.env.CODEX_THREAD_ID) throw new Error('Resolve requests from their owning Codex conversation.');
    result = await receipts.resolve(args[0], { state: 'conversation', taskIds: [] });
  } else if (command === 'claim' && args.length === 2) {
    result = await store.claimMessage(args[0], args[1]);
  } else if (command === 'ack' && args.length === 2) {
    result = await store.acknowledgeMessage(args[0], args[1]);
  } else if (command === 'start' && args.length >= 2 && args.length <= 3) {
    result = await store.startMessage(args[0], args[1], args[2] || '');
  } else if (command === 'report' && args.length >= 4 && args.length <= 8) {
    result = await store.reportMessage(args[0], args[1], { status: args[2], note: args[3], ...(args[4] === undefined ? {} : { model: args[4] }), ...(args[5] === undefined ? {} : { effort: args[5] }), ...(args[6] === undefined ? {} : { agent: args[6] }), ...(args[7] === undefined ? {} : { category: args[7] }) });
  } else if (command === 'retry' && args.length === 2) {
    result = await store.retryMessage(args[0], args[1]);
  } else if (command === 'bind' && args.length === 4) {
    result = await store.bind(args[0], { projectId: args[1], provider: args[2], conversationId: args[3] });
  } else throw new Error(help);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
