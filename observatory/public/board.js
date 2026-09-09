const $ = selector => document.querySelector(selector);
const dialog = $('#board-editor'), fields = $('#board-fields'), grid = $('#board-grid'), confirmDialog = $('#board-confirm');
let board, editing, signature = '', dragging = null, loading = false;
const starting = new Set(), moving = new Set(), removing = new Set(), deleting = new Set();
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
function button(text, action, className) {
  const el = node('button', text, className); el.type = 'button'; el.addEventListener('click', action); return el;
}
async function api(path, method = 'GET', input) {
  const response = await fetch(`/api/board${path}`, { method, ...(input === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to save the board.');
  return result;
}
function error(message, target = $('#board-error')) { target.textContent = message; target.hidden = !message; }
function confirmAction(title, message, label = 'Delete') {
  return new Promise(resolve => {
    const form = $('#board-confirm-form'), accept = $('#board-confirm-accept'), cancel = $('#board-confirm-cancel');
    $('#board-confirm-title').textContent = title; $('#board-confirm-copy').textContent = message; accept.textContent = label;
    let settled = false;
    const finish = value => { if (settled) return; settled = true; confirmDialog.close(); resolve(value); };
    form.onsubmit = event => { event.preventDefault(); finish(true); };
    cancel.onclick = () => finish(false);
    confirmDialog.oncancel = () => finish(false);
    confirmDialog.showModal(); accept.focus();
  });
}
function view(table) {
  $('#table-view-content').hidden = !table; $('#kanban-board').hidden = table;
  $('#board-view').setAttribute('aria-pressed', String(!table)); $('#table-view').setAttribute('aria-pressed', String(table));
}
$('#board-view').onclick = () => { view(false); location.hash = 'kanban-board'; };
$('#table-view').onclick = () => { view(true); location.hash = 'task-table'; };
function followHash() {
  if (location.hash === '#kanban-board') view(false);
  else if (location.hash && document.getElementById(location.hash.slice(1))?.closest('#table-view-content')) view(true);
}
window.addEventListener('hashchange', followHash); followHash();

async function refresh(force = false) {
  if (loading || dragging) return;
  loading = true;
  try {
    const next = await api(''), key = JSON.stringify(next);
    board = next;
    $('.project-name').textContent = `: ${board.project}`;
    if (key !== signature || force) { signature = key; render(); }
    if (!board.canLaunch) $('#board-notice').textContent = 'Planning is available. Start Observatory from a Codex task terminal to enable launching.';
    else $('#board-notice').textContent = 'New Codex tasks run in this project checkout. Done follows verified ready reports.';
  } catch (cause) { error(cause.message); }
  finally { loading = false; }
}
async function copyCardId(id, control) {
  if (control.disabled) return;
  const original = control.textContent;
  control.disabled = true;
  try {
    await navigator.clipboard.writeText(id);
    control.textContent = 'Copied';
  } catch {
    control.textContent = 'Copy failed';
    error(`Clipboard access was blocked. Copy this task ID manually: ${id}`);
  } finally {
    setTimeout(() => { control.textContent = original; control.disabled = false; }, 1600);
  }
}
function cardNode(card) {
  const el = node('article', undefined, 'board-card'); el.dataset.cardId = card.id;
  let dragCompletedAt = 0;
  el.addEventListener('click', event => {
    if (Date.now() - dragCompletedAt < 300 || event.target.closest('button, a')) return;
    editCard(card);
  });
  el.append(button(card.title, () => editCard(card), 'board-card-title'), node('p', card.specification, 'board-card-copy'));
  const footer = node('div', undefined, 'board-card-footer');
  const metadata = node('span', undefined, 'board-card-meta');
  const created = new Date(card.createdAt);
  if (Number.isFinite(created.getTime())) {
    const date = node('time', created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    date.dateTime = card.createdAt; date.title = `Created: ${created.toLocaleString()}`;
    date.setAttribute('aria-label', date.title); metadata.append(date);
  }
  if (card.agent) {
    const agent = node('span', `${metadata.childNodes.length ? ' → ' : ''}${card.agent}`, 'board-card-agent');
    agent.title = `Agent / chat: ${card.agent}`; metadata.append(agent);
  }
  footer.append(metadata);
  const id = button(`ID ${card.id.slice(0, 8)}`, () => void copyCardId(card.id, id), 'board-card-id');
  id.title = `Copy full task ID: ${card.id}`; id.setAttribute('aria-live', 'polite');
  footer.append(id);
  let label = card.status === 'needs attention' ? 'Needs attention' : '';
  if (card.launch?.state === 'unconfirmed') label = 'Check Codex';
  if (starting.has(card.id) || card.launch?.state === 'launching') label = 'Starting…';
  if (label) {
    const state = node('span', label, 'board-card-state'); state.dataset.state = card.launch?.state === 'unconfirmed' ? 'unconfirmed' : card.status || '';
    footer.append(state);
  }
  if (card.stage === 'backlog') {
    el.draggable = !starting.has(card.id) && !moving.has(card.id);
    el.addEventListener('dragstart', event => { dragging = card.id; event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => { dragCompletedAt = Date.now(); dragging = null; el.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target')); });
  } else if (card.launch?.threadId) {
    const link = node('a', 'Open in Codex'); link.href = `codex://threads/${encodeURIComponent(card.launch.threadId)}`; footer.append(link);
  } else if (card.launch?.state === 'unconfirmed') footer.append(button('Link task', () => editLink(card)));
  el.append(footer); return el;
}
function render() {
  const focusId = document.activeElement?.closest('[data-card-id]')?.dataset.cardId;
  grid.replaceChildren();
  const headings = node('div', undefined, 'board-columns');
  for (const [stage, label, dot] of [['backlog', 'Backlog', ''], ['started', 'Started', 'progress'], ['done', 'Done', 'ready']]) {
    const heading = node('div', undefined, 'board-column-heading');
    if (dot) heading.append(node('span', '', `filter-dot ${dot}`));
    heading.append(node('span', label), node('span', String(board.cards.filter(card => card.stage === stage).length), 'count')); headings.append(heading);
  }
  grid.append(headings);
  const lanes = [{ id: '', name: 'Ungrouped', context: '' }, ...board.lanes];
  for (const lane of lanes) {
    const section = node('section', undefined, 'board-lane'); section.setAttribute('aria-label', lane.name);
    const heading = node('div', undefined, 'board-lane-heading');
    const edit = button(lane.name, () => editLane(lane), 'board-lane-edit'); edit.setAttribute('aria-label', `Edit ${lane.name} lane`);
    heading.append(edit);
    if (lane.id) {
      const close = button('×', () => removeLane(lane), 'board-lane-remove');
      close.setAttribute('aria-label', `Delete ${lane.name} lane`); close.title = `Delete ${lane.name} lane`;
      close.disabled = removing.has(lane.id); heading.append(close);
    }
    const cells = node('div', undefined, 'board-lane-cells');
    for (const stage of ['backlog', 'started', 'done']) {
      const cell = node('div', undefined, 'board-cell'); cell.dataset.stage = stage; cell.dataset.laneId = lane.id;
      cell.setAttribute('aria-label', `${lane.name} ${stage}`);
      const cards = board.cards.filter(card => card.laneId === lane.id && card.stage === stage);
      for (const card of cards) cell.append(cardNode(card));
      if (!cards.length) cell.append(node('p', stage === 'backlog' ? 'No tasks planned' : stage === 'started' ? 'Drop a backlog task here' : 'Completed tasks appear here', 'board-empty'));
      if (stage === 'backlog') cell.append(button('+ Add task', () => editCard(null, lane.id), 'board-add'));
      if (stage === 'backlog' || stage === 'started') enableDrop(cell, stage, lane.id);
      cells.append(cell);
    }
    if (lane.id) section.append(heading);
    section.append(cells); grid.append(section);
  }
  const laneActions = node('div', undefined, 'board-lane-actions');
  laneActions.append(button('+ Add lane', () => editLane(null), 'board-add'));
  grid.append(laneActions);
  if (focusId) grid.querySelector(`[data-card-id="${focusId}"] button`)?.focus({ preventScroll: true });
}
function enableDrop(cell, stage, laneId) {
  cell.addEventListener('dragover', event => {
    const card = board.cards.find(card => card.id === dragging);
    const valid = card?.stage === 'backlog' && (stage === 'backlog' ? card.laneId !== laneId : board.canLaunch);
    if (valid) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; cell.classList.add('drop-target'); }
  });
  cell.addEventListener('dragleave', event => { if (!cell.contains(event.relatedTarget)) cell.classList.remove('drop-target'); });
  cell.addEventListener('drop', event => {
    event.preventDefault(); cell.classList.remove('drop-target');
    const card = board.cards.find(card => card.id === event.dataTransfer.getData('text/plain'));
    dragging = null;
    if (card?.stage === 'backlog' && (stage === 'started' || card.laneId !== laneId)) void moveCardToLane(card, laneId, stage === 'started');
  });
}
async function startCard(id) {
  if (starting.has(id)) return;
  starting.add(id); render(); error('');
  try { await api(`/cards/${id}/start`, 'POST', {}); }
  catch (cause) { error(cause.message); }
  finally { starting.delete(id); await refresh(true); }
}
async function moveCardToLane(card, laneId, launch) {
  if (moving.has(card.id)) return;
  moving.add(card.id); render(); error('');
  try {
    if (card.laneId !== laneId) await api(`/cards/${card.id}`, 'PATCH', {
      title: card.title, specification: card.specification, context: card.context || '', laneId,
      attachments: card.attachments || [], expectedUpdatedAt: card.updatedAt
    });
    if (launch) await api(`/cards/${card.id}/start`, 'POST', {});
  } catch (cause) { error(cause.message); }
  finally { moving.delete(card.id); await refresh(true); }
}
function field(name, label, value = '', type = 'input', required = false, maxLength = 10000) {
  const wrapper = node('label', undefined, 'board-field'); wrapper.append(node('span', label, 'sr-only'));
  const input = node(type); input.name = name; input.id = `board-field-${name}`; input.value = value; input.required = required; input.maxLength = maxLength;
  if (type !== 'select') input.placeholder = label.split(' · ')[0];
  if (type === 'textarea') { input.rows = name === 'specification' ? 5 : 3; input.addEventListener('input', () => autoSizeTextarea(input)); }
  wrapper.append(input); fields.append(wrapper); return input;
}
function autoSizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
  textarea.style.overflowY = 'hidden';
}
function attachmentField(existing = []) {
  const wrapper = node('label', undefined, 'board-field'); wrapper.append(node('span', 'Attachments · optional files included with the Codex task', 'sr-only'));
  const input = node('input'); input.type = 'file'; input.id = 'board-field-attachments'; input.name = 'attachments'; input.multiple = true;
  input.onchange = () => { if (editing) editing.pendingFiles = undefined; };
  input.accept = '.txt,.md,.json,.js,.mjs,.ts,.tsx,.css,.html,.yml,.yaml,.csv,.xml,text/*,image/*,application/pdf';
  wrapper.append(input);
  wrapper.append(node('small', 'Original files · up to 20 MiB each, 10 files / 100 MiB per task', 'board-attachment-list'));
  fields.append(wrapper); return input;
}
function attachmentLinks(card) {
  for (const file of card?.files || []) {
    const row = node('p', undefined, 'board-attachment-list');
    if (file.availability === 'missing-original') row.textContent = `${file.name} · original unavailable; reattach this file`;
    else {
      const link = node('a', file.name, 'board-detail-link');
      link.href = `/api/board/cards/${card.id}/attachments/${file.id}`; link.download = file.name;
      row.append(link);
    }
    fields.append(row);
  }
}
async function uploadPending(id, state) {
  while (state.pendingFiles.length) {
    const file = state.pendingFiles[0];
    const response = await fetch(`/api/board/cards/${id}/attachments?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to upload the file.');
    state.uploadedFiles.push(result); state.pendingFiles.shift();
  }
}
function open(kind, title, submit, item) {
  editing = { kind, item }; fields.replaceChildren(); error('', $('#board-form-error'));
  $('#board-editor-title').textContent = title; $('#board-save').textContent = submit; $('#board-save').hidden = false; $('#board-save').disabled = false;
  $('#board-delete').hidden = true; $('#board-form').classList.remove('is-confirmation'); $('#board-save').classList.remove('destructive');
}
function show() { if (!dialog.open) dialog.showModal(); fields.querySelectorAll('textarea').forEach(autoSizeTextarea); fields.querySelector('input, textarea, select, a')?.focus(); }
function editCard(card, laneId = '') {
  if (card && card.stage !== 'backlog') {
    open('detail', card.title, '', card); $('#board-save').hidden = true;
    for (const [label, text] of [['Description', [card.specification, card.context].filter(Boolean).join('\n\n')], ['Latest update', card.launch?.error || card.note || card.status]]) {
      if (text) fields.append(node('p', label, 'board-detail-label'), node('p', text, 'board-detail-copy'));
    }
    attachmentLinks(card);
    if (card.launch?.threadId) { const link = node('a', 'Open in Codex', 'board-detail-link'); link.href = `codex://threads/${encodeURIComponent(card.launch.threadId)}`; fields.append(link); }
    else if (card.launch?.state === 'unconfirmed') fields.append(button('Link existing Codex task', () => editLink(card)));
    show(); return;
  }
  open('card', card ? 'Edit task' : 'Add task', card ? 'Save task' : 'Add to backlog', card);
  if (card) $('#board-delete').hidden = false;
  field('title', 'Task name', card?.title || '', 'input', true, 200);
  const select = field('laneId', 'Project part (optional)', '', 'select');
  const ungrouped = node('option', 'No lane'); ungrouped.value = ''; select.append(ungrouped);
  for (const lane of board.lanes) { const option = node('option', lane.name); option.value = lane.id; select.append(option); }
  select.value = card?.laneId ?? laneId;
  field('specification', 'Description · what should be implemented and how to check it', [card?.specification || '', card?.context ? `Additional context\n${card.context}` : ''].filter(Boolean).join('\n\n'), 'textarea', true, 100000);
  editing.attachmentInput = attachmentField();
  attachmentLinks(card);
  show();
}
async function removeLane(lane) {
  if (removing.has(lane.id)) return;
  if (board.lanes.length === 1) {
    removing.add(lane.id); render(); error('');
    try { await api(`/lanes/${lane.id}`, 'DELETE', {}); }
    catch (cause) { error(cause.message); }
    finally { removing.delete(lane.id); await refresh(true); }
    return;
  }
  open('delete-lane', `Delete “${lane.name}”?`, 'Move tasks and delete', lane);
  $('#board-form').classList.add('is-confirmation'); $('#board-save').classList.add('destructive');
  fields.append(node('p', 'Where should this lane’s tasks move? All cards keep their status and Codex links. The lane and its shared context will be removed.', 'board-detail-copy'));
  const select = field('targetLaneId', 'Move tasks to', '', 'select');
  for (const target of [{ id: '', name: 'Default (ungrouped)' }, ...board.lanes.filter(item => item.id !== lane.id)]) {
    const option = node('option', target.name); option.value = target.id; select.append(option);
  }
  select.value = ''; show();
}
function editLane(lane) {
  open('lane', lane ? 'Edit lane' : 'Add lane', lane ? 'Save lane' : 'Add lane', lane);
  field('name', 'Project part', lane?.name || '', 'input', true, 100);
  field('context', 'Context shared with every task in this lane', lane?.context || '', 'textarea'); show();
}
function editLink(card) { open('link', 'Link existing Codex task', 'Link task', card); fields.append(node('p', 'Copy the task ID from Codex. Linking will resume tracking without creating another task.', 'board-muted')); field('threadId', 'Codex task ID', '', 'input', true, 100); show(); }
$('#board-delete').onclick = async () => {
  const card = editing?.item;
  if (!card || deleting.has(card.id) || !await confirmAction(`Delete “${card.title}”?`, 'This task will be removed from the board. Original attachment files remain in local storage.')) return;
  if (deleting.has(card.id)) return;
  deleting.add(card.id); $('#board-delete').disabled = true; error('', $('#board-form-error'));
  try { await api(`/cards/${card.id}`, 'DELETE', {}); dialog.close(); await refresh(true); }
  catch (cause) { error(cause.message, $('#board-form-error')); }
  finally { deleting.delete(card.id); $('#board-delete').disabled = false; }
};
$('#project-context').onclick = () => {
  if (!board) return;
  open('settings', 'Project context', 'Save context');
  fields.append(node('p', 'Included with every new Codex task, together with its specification and lane context. Codex also reads the repository instructions.', 'board-muted'));
  field('context', 'Shared context · goals, conventions, references', board.context, 'textarea'); show();
};
$('#board-close').onclick = $('#board-cancel').onclick = () => dialog.close();
$('#board-form').onsubmit = async event => {
  event.preventDefault(); if (editing.kind === 'detail') return;
  const state = editing, { kind, item } = state, data = Object.fromEntries(new FormData(event.target));
  $('#board-save').disabled = true; error('', $('#board-form-error'));
  try {
    if (kind === 'card') {
      delete data.attachments;
      data.context = '';
      state.pendingFiles ??= [...(state.attachmentInput?.files || [])];
      state.uploadedFiles ??= [];
      if (state.pendingFiles.some(file => file.size > 20 * 1024 * 1024)) throw new Error('Each attachment must be under 20 MiB.');
      const originals = [...(item?.files || []).filter(file => file.availability === 'available'), ...state.uploadedFiles];
      if (originals.length + state.pendingFiles.length > 10 || [...originals, ...state.pendingFiles].reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) throw new Error('Attach up to 10 original files and 100 MiB per task.');
    }
    if (kind === 'settings') await api('', 'PATCH', data);
    else if (kind === 'delete-lane') await api(`/lanes/${item.id}`, 'DELETE', data);
    else if (kind === 'link') await api(`/cards/${item.id}/link`, 'POST', data);
    else {
      const path = kind === 'card' ? '/cards' : '/lanes';
      if (kind === 'card' && item) data.expectedUpdatedAt = item.updatedAt;
      const saved = await api(`${path}${item ? `/${item.id}` : ''}`, item ? 'PATCH' : 'POST', data);
      if (kind === 'card') {
        state.item = { ...saved, files: item?.files || [] }; state.saved = true;
        state.attachmentInput.disabled = true;
        await uploadPending(saved.id, state);
      }
    }
    if (editing === state) dialog.close(); await refresh(true);
  } catch (cause) {
    if (editing === state) error(`${state.saved ? 'Task saved. Some attachments are still pending; Save task retries them. ' : ''}${cause.message}`, $('#board-form-error'));
  }
  finally { $('#board-save').disabled = false; }
};
void refresh(); setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
