import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createBoard } from './board.mjs';
import { createTaskAccess } from './task-access.mjs';

export const taskHelp = [
  'Offline task commands (no dashboard server required):',
  '  task list | lanes | get ID | brief ID',
  '  task create --input FILE.json',
  '  task update ID --input FILE.json --revision REV',
  '  task move ID LANE_ID|default --revision REV',
  '  task begin ID --agent NAME --revision REV',
  '  task report ID --input FILE.json --revision REV',
  '  task attach ID FILE [--type MIME]',
  '  task file ID FILE_ID [--output PATH]',
  'Use --input - for JSON on stdin. Read task get to obtain the current revision.',
  'Update accepts title/description; report accepts status/note/agent/model/effort/category.'
].join('\n');

export async function runTaskCommand(store, args) {
  const [command, ...rest] = args;
  const definitions = {
    list: [0, []], lanes: [0, []], get: [1, []], brief: [1, []],
    create: [0, ['input']], update: [1, ['input', 'revision']], move: [2, ['revision']],
    begin: [1, ['agent', 'revision']], report: [1, ['input', 'revision']],
    attach: [2, ['type']], file: [2, ['output']]
  };
  if (!definitions[command]) throw new Error(taskHelp);
  const [count, allowed] = definitions[command], positional = [], options = {};
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const key = value.slice(2), next = rest[++index];
    if (!allowed.includes(key) || key in options || next === undefined || next.startsWith('--')) throw new Error('Invalid or duplicate option: ' + value + '\n' + taskHelp);
    options[key] = next;
  }
  if (positional.length !== count) throw new Error('Invalid arguments.\n' + taskHelp);
  const input = async () => {
    if (!options.input) throw new Error('--input FILE.json or --input - is required.');
    let text;
    if (options.input === '-') {
      let size = 0; const chunks = [];
      for await (const chunk of process.stdin) { size += chunk.length; if (size > 1000000) throw new Error('Input JSON is too large.'); chunks.push(chunk); }
      text = Buffer.concat(chunks).toString('utf8');
    } else {
      if ((await stat(resolve(options.input))).size > 1000000) throw new Error('Input JSON is too large.');
      text = await readFile(resolve(options.input), 'utf8');
    }
    return JSON.parse(text);
  };
  const access = createTaskAccess({ store, board: createBoard(store) });
  const [id, value] = positional;
  if (command === 'list' || command === 'lanes') return access[command]();
  if (command === 'get' || command === 'brief') return access[command](id);
  if (command === 'create') return access.create(await input());
  if (command === 'update' || command === 'report') return access[command](id, await input(), options);
  if (command === 'move') return access.move(id, value === 'default' ? '' : value, options);
  if (command === 'begin') return access.begin(id, options);
  if (command === 'attach') {
    const path = resolve(value), info = await stat(path);
    if (!info.isFile()) throw new Error('Attachment must be a regular file.');
    if (info.size > 20 * 1024 * 1024) throw new Error('Attachment is too large (maximum 20 MiB).');
    const stream = createReadStream(path);
    try { return await access.attach(id, { name: basename(path), mediaType: options.type || 'application/octet-stream' }, stream); }
    finally { stream.destroy(); }
  }
  const file = (await access.get(id)).attachments.find(file => file.id === value);
  if (!file) throw new Error('Attachment not found.');
  const bytes = await access.file(id, value); // Validate availability and integrity even for metadata-only access.
  if (!options.output) return file;
  const output = resolve(options.output);
  await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
  return { ...file, exportedTo: output };
}
