const $ = selector => document.querySelector(selector);
const dialog = $('#editor');
const searchInput = $('#task-search');
let tasks = [];
let loaded = false;
let renderedDay = '';
let editing = null;
let filter = 'all';
const resizeStorageKey = 'observatory-column-widths';
const minimumColumnWidths = { status: 125, task: 180, agent: 150, section: 140, model: 180, updated: 130 };
const defaultColumnWidths = { status: 125, task: 412, agent: 150, section: 226, model: 180, updated: 170 };
const modelNames = {
  'gpt-5.6-terra': 'Terra',
  'gpt-5.6-luna': 'Luna',
  'gpt-5.6-sol': 'Sol',
  'gpt-6-astra': 'Astra',
  'gpt-5.3-codex-spark': 'Codex Spark',
  'gpt-5.5': '5.5',
  'gpt-5.4-mini': '5.4 Mini'
};
const effortNames = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High', max: 'Max', ultra: 'Ultra' };
const categoryIcons = {
  bug: { icon: 'bug', label: 'Bug' },
  'ui polishing': { icon: 'wand-sparkles', label: 'UI polishing' },
  specification: { icon: 'clipboard-list', label: 'Specification' }
};
function date(value, now = new Date()) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '—';
  const time = `${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;
  if (timestamp.toDateString() === now.toDateString()) return time;
  const month = timestamp.toLocaleString('en-US', { month: 'short' });
  return `${timestamp.getDate()} ${month} ${time}`;
}
function formatModel(model, effort) {
  const cleanModel = (model || '').trim();
  const label = modelNames[cleanModel.toLowerCase()];
  if (!label) return '—';
  const cleanEffort = (effort || '').trim();
  if (!cleanEffort) return label;
  return `${label} · ${effortNames[cleanEffort.toLowerCase()] || cleanEffort}`;
}
function formatCategory(category) {
  return categoryIcons[category]?.label || '—';
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function statusTooltip(task, modelLabel) {
  const tooltip = element('span', undefined, 'status-tooltip');
  tooltip.id = `status-tooltip-${task.id}`;
  tooltip.setAttribute('role', 'tooltip');
  const heading = task.status === 'needs attention' ? 'Needs your input' : task.status === 'in progress' ? 'In progress' : 'Ready';
  const updateLabel = task.status === 'needs attention' ? 'Next' : 'Latest update';
  const update = task.runtime?.statusManaged && task.runtime.reason ? task.runtime.reason : task.note || task.description || 'No update recorded.';
  tooltip.append(
    element('strong', heading, 'status-tooltip-heading'),
    element('span', task.title, 'status-tooltip-task'),
    element('span', `Chat: ${task.agent || 'Not recorded'}`, 'status-tooltip-agent'),
    element('span', `Model: ${modelLabel === '—' ? 'Not recorded' : modelLabel}`, 'status-tooltip-agent'),
    element('span', `${updateLabel}: ${update}`, 'status-tooltip-update')
  );
  return tooltip;
}

function setColumnWidth(column, width, persist = true) {
  const value = Math.max(minimumColumnWidths[column.dataset.column], Math.round(width));
  column.style.width = `${value}px`;
  if (persist) {
    const saved = JSON.parse(localStorage.getItem(resizeStorageKey) || '{}');
    saved[column.dataset.column] = value;
    localStorage.setItem(resizeStorageKey, JSON.stringify(saved));
  }
}

function setupColumnResizers() {
  const table = document.querySelector('table');
  const columns = [...table.querySelectorAll('col[data-column]')];
  const headers = [...table.querySelectorAll('th[data-column]')];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(resizeStorageKey) || '{}'); } catch { localStorage.removeItem(resizeStorageKey); }
  for (const column of columns) {
    setColumnWidth(column, Number.isFinite(saved[column.dataset.column]) ? saved[column.dataset.column] : defaultColumnWidths[column.dataset.column], false);
  }
  headers.forEach((header, index) => {
    const column = columns[index];
    if (column.dataset.column === 'category') return;
    const handle = element('button', undefined, 'column-resizer');
    handle.type = 'button';
    handle.setAttribute('aria-label', `Resize ${header.textContent} column`);
    handle.addEventListener('pointerdown', event => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = header.getBoundingClientRect().width;
      document.body.classList.add('is-resizing');
      const move = moveEvent => setColumnWidth(column, startWidth + moveEvent.clientX - startX);
      const stop = () => {
        document.body.classList.remove('is-resizing');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop, { once: true });
    });
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const current = header.getBoundingClientRect().width;
      setColumnWidth(column, current + (event.key === 'ArrowRight' ? 16 : -16));
    });
    header.append(handle);
  });
}

async function api(path = '', method = 'GET', body) {
  const response = await fetch(`/api/tasks${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function render() {
  const now = new Date();
  renderedDay = now.toDateString();
  const query = searchInput.value.trim();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = tasks.filter(task => {
    const text = [task.title, task.description, task.note, task.page, task.section, task.status, task.agent, task.category, formatCategory(task.category), task.model, formatModel(task.model, task.effort)].join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  });
  const visible = matching.filter(task => filter === 'all' || task.status === filter);
  visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $('#tasks').replaceChildren();
  for (const task of visible) {
    const row = element('tr');
    const taskCell = element('td');
    const taskContent = element('div', undefined, 'task-cell-content');
    const category = categoryIcons[task.category];
    if (category) {
      const categoryGroup = element('span', undefined, `task-category category-${task.category.replace(/\s+/g, '-')}`);
      categoryGroup.title = category.label;
      const icon = element('i', undefined, 'category-icon');
      icon.setAttribute('data-lucide', category.icon);
      icon.setAttribute('aria-hidden', 'true');
      const label = element('span', category.label, 'sr-only');
      categoryGroup.append(icon, label);
      taskContent.append(categoryGroup);
    }
    const title = element('button', undefined, 'task-title');
    title.setAttribute('aria-label', task.title);
    title.classList.toggle('has-description', Boolean(task.description));
    title.append(element('span', task.title, 'task-label'));
    title.addEventListener('click', () => openEditor(task));
    const description = element('span', undefined, 'description');
    description.append(element('span', task.description, 'description-copy'));
    description.id = `description-${task.id}`;
    description.setAttribute('aria-hidden', 'true');
    if (task.description) title.setAttribute('aria-describedby', description.id);
    title.append(description);
    taskContent.append(title);
    taskCell.append(taskContent);
    const statusCell = element('td', undefined, 'status');
    statusCell.dataset.status = task.status;
    const modelLabel = formatModel(task.model, task.effort);
    const statusTrigger = element('span', undefined, 'status-trigger');
    statusTrigger.tabIndex = 0;
    const dot = element('span', undefined, 'status-dot');
    dot.setAttribute('aria-hidden', 'true');
    statusTrigger.append(dot, document.createTextNode(task.status[0].toUpperCase() + task.status.slice(1)));
    const tooltip = statusTooltip(task, modelLabel);
    statusTrigger.setAttribute('aria-describedby', tooltip.id);
    statusCell.append(statusTrigger, tooltip);
    const dateCell = element('td', date(task.updatedAt, now), 'date');
    dateCell.title = `Created: ${new Date(task.createdAt).toLocaleString()}\nUpdated: ${new Date(task.updatedAt).toLocaleString()}`;
    const modelCell = element('td', modelLabel, 'model');
    modelCell.title = modelLabel === '—' ? 'Precise model not recorded' : modelLabel;
    const chatCell = element('td', task.agent || '—', 'agent');
    chatCell.title = task.agent || 'Project chat not recorded';
    const sectionCell = element('td', undefined, 'section');
    sectionCell.title = task.section || 'No section specified';
    const anchor = safeAnchor(task.anchor);
    if (anchor && task.section) {
      const sectionLabel = task.page ? `${task.section} (${task.page})` : task.section;
      const link = element('a', sectionLabel, 'section-link');
      link.href = anchor;
      const destination = new URL(anchor);
      const sameDocument = destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search;
      link.title = `Open ${task.page ? `${task.page} / ` : ''}${task.section}`;
      if (!sameDocument) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      const indicator = element('span', ' ↗', 'link-indicator');
      indicator.setAttribute('aria-hidden', 'true');
      link.append(indicator);
      sectionCell.append(link);
    } else sectionCell.textContent = task.section || '—';
    row.append(statusCell, taskCell, chatCell, sectionCell, modelCell, dateCell);
    $('#tasks').append(row);
  }
  $('#empty').hidden = visible.length !== 0;
  $('#empty').textContent = query
    ? `No tasks match “${query}”${filter === 'all' ? '' : ` with status: ${filter}`}.`
    : filter === 'all' ? 'No tasks yet.' : `No tasks with status: ${filter}.`;
  $('#clear-search').hidden = searchInput.value.length === 0;
  for (const button of document.querySelectorAll('[data-filter]')) {
    const value = button.dataset.filter;
    button.setAttribute('aria-pressed', String(value === filter));
    button.querySelector('.count').textContent = matching.filter(task => value === 'all' || task.status === value).length;
  }
  window.lucide?.createIcons({ attrs: { width: 14, height: 14, 'stroke-width': 1.7 } });
  if (dialog.open && editing) {
    setDetail('detail-created', date(editing.createdAt, now));
    setDetail('detail-updated', date(editing.updatedAt, now));
  }
}

function safeAnchor(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {}
  return null;
}

function setDetail(id, value, fallback = '—') {
  const node = $(`#${id}`);
  node.textContent = value || fallback;
  return node;
}

function renderDetails(task) {
  setDetail('title-display', task.title);
  setDetail('detail-description', task.description);
  setDetail('detail-category', formatCategory(task.category));
  setDetail('detail-page', task.page);
  setDetail('detail-section', task.section);
  setDetail('detail-agent', task.agent);
  setDetail('detail-model', formatModel(task.model, task.effort));
  setDetail('detail-effort', task.effort ? (effortNames[task.effort.toLowerCase()] || task.effort) : '—');
  setDetail('detail-note', task.runtime?.statusManaged && task.runtime.reason ? task.runtime.reason : task.note);
  setDetail('detail-created', date(task.createdAt));
  setDetail('detail-updated', date(task.updatedAt));
  const anchorNode = $('#detail-anchor');
  const anchor = safeAnchor(task.anchor);
  anchorNode.replaceChildren();
  if (anchor) {
    const link = element('a', task.anchor, 'detail-link');
    link.href = anchor;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    anchorNode.append(link);
  } else anchorNode.textContent = '—';
  const statusNode = $('#detail-status');
  statusNode.dataset.status = task.status;
  statusNode.replaceChildren();
  const dot = element('span', undefined, 'status-dot');
  dot.setAttribute('aria-hidden', 'true');
  statusNode.append(dot, document.createTextNode(task.status[0].toUpperCase() + task.status.slice(1)));
  if (task.status === 'needs attention') {
    const reason = task.runtime?.reason || task.note || 'Needs review.';
    statusNode.append(element('span', reason, 'status-reason'));
  }
  renderMessageHistory(task.messages || []);
  $('#message-input').value = '';
  $('#message-send').disabled = false;
  $('#message-state').textContent = '';
}

function renderMessageHistory(messages) {
  const history = $('#message-history');
  history.replaceChildren();
  if (!messages.length) { history.hidden = true; return; }
  history.hidden = false;
  for (const message of messages.slice(-5)) {
    const row = element('div', undefined, 'message-item');
    const delivery = ['codex_daemon_unavailable', 'codex_desktop_unavailable'].includes(message.errorCode) ? 'Waiting for Codex connection' : message.errorCode === 'codex_owner_unavailable' ? 'Waiting for the Codex task; retrying automatically' : message.errorCode === 'destination_mismatch' ? 'Not sent: task destination does not match this project' : message.errorCode === 'delivery_uncertain' ? 'Delivery unconfirmed — checking the Codex receipt' : message.deliveryState;
    row.append(element('span', message.text, 'message-text'), element('span', `${delivery} · ${date(message.createdAt)}`, 'message-meta'));
    if (message.deliveryState === 'failed') {
      const retry = element('button', 'Retry', 'inline-action');
      retry.type = 'button';
      retry.addEventListener('click', async () => {
        const taskId = editing?.id;
        if (!taskId) return;
        retry.disabled = true;
        try {
          await api(`/${taskId}/messages/${message.id}/retry`, 'POST', {});
          const history = await api(`/${taskId}/messages`);
          if (editing?.id === taskId) { renderMessageHistory(history); $('#message-state').textContent = 'Retry queued'; }
        } catch (error) {
          if (editing?.id === taskId) $('#message-state').textContent = error.message;
        } finally { retry.disabled = false; }
      });
      row.append(retry);
    }
    history.append(row);
  }
}

const pendingMessages = new Map();
async function sendMessage(event) {
  event.preventDefault();
  const input = $('#message-input');
  const text = input.value.trim();
  if (!text || !editing) return;
  const taskId = editing.id;
  let submission = pendingMessages.get(taskId);
  if (!submission || submission.text !== text) {
    submission = { text, idempotencyKey: crypto.randomUUID() };
    pendingMessages.set(taskId, submission);
  }
  $('#message-send').disabled = true;
  $('#save-error').hidden = true;
  $('#message-state').textContent = 'Sending…';
  try {
    const message = await api(`/${taskId}/messages`, 'POST', submission);
    pendingMessages.delete(taskId);
    if (editing?.id !== taskId) return;
    tasks = await api();
    editing = tasks.find(task => task.id === editing.id) || editing;
    editing = { ...editing, messages: await api(`/${editing.id}/messages`) };
    render();
    renderDetails(editing);
    $('#message-state').textContent = message.deliveryState === 'queued' ? 'Message queued' : 'Message sent';
  } catch (error) {
    $('#save-error').textContent = error.message;
    $('#save-error').hidden = false;
    $('#message-state').textContent = 'Could not send';
    $('#message-send').disabled = false;
  }
}

function cancelTitleEdit() {
  $('#title-editor').hidden = true;
  $('#title-display').hidden = false;
}

function beginTitleEdit() {
  const input = $('#title-input');
  input.value = editing.title;
  $('#title-display').hidden = true;
  $('#title-editor').hidden = false;
  input.focus();
  input.select();
}

async function saveTitleEdit() {
  const input = $('#title-input');
  const title = input.value.trim();
  if (!title) {
    $('#save-error').textContent = 'Task name is required.';
    $('#save-error').hidden = false;
    input.focus();
    return;
  }
  if (title === editing.title) { cancelTitleEdit(); return; }
  $('#title-save').disabled = true;
  $('#save-error').hidden = true;
  try {
    const updated = await api(`/${editing.id}`, 'PATCH', { title, expectedUpdatedAt: editing.updatedAt });
    editing = updated;
    tasks = tasks.map(task => task.id === updated.id ? updated : task);
    render();
    renderDetails(updated);
    cancelTitleEdit();
  } catch (error) {
    $('#save-error').textContent = error.message;
    $('#save-error').hidden = false;
  } finally { $('#title-save').disabled = false; }
}

async function refresh() {
  try {
    const latest = await api();
    if (JSON.stringify(latest) !== JSON.stringify(tasks) || !loaded || renderedDay !== new Date().toDateString()) {
      tasks = latest;
      render();
      loaded = true;
    }
    $('#error').hidden = true;
    if (dialog.open && editing) {
      const id = editing.id;
      const messages = await api(`/${id}/messages`);
      if (dialog.open && editing?.id === id) {
        editing = { ...editing, messages };
        renderMessageHistory(messages);
      }
    }
  } catch (error) {
    $('#error').textContent = `Could not refresh. Showing the last loaded tasks. ${error.message}`;
    $('#error').hidden = false;
  }
}

function openEditor(task) {
  editing = task;
  renderDetails(task);
  cancelTitleEdit();
  $('#save-error').hidden = true;
  dialog.showModal();
  api(`/${task.id}/messages`).then(messages => {
    if (editing?.id !== task.id) return;
    editing = { ...editing, messages };
    renderMessageHistory(messages);
  }).catch(() => {});
}

$('#title-display').addEventListener('dblclick', beginTitleEdit);
$('#title-display').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); beginTitleEdit(); }
});
$('#title-save').addEventListener('click', saveTitleEdit);
$('#title-cancel').addEventListener('click', cancelTitleEdit);
$('#title-input').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); saveTitleEdit(); }
  if (event.key === 'Escape') { event.preventDefault(); cancelTitleEdit(); }
});
$('#message-form').addEventListener('submit', sendMessage);
$('#message-input').addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); $('#message-form').requestSubmit(); }
});
$('#close').addEventListener('click', () => { cancelTitleEdit(); dialog.close(); });
function clearSearch() {
  searchInput.value = '';
  render();
  searchInput.focus();
}
searchInput.addEventListener('input', render);
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape' && searchInput.value) {
    event.preventDefault();
    clearSearch();
  }
});
$('#clear-search').addEventListener('click', clearSearch);
$('#status-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  render();
});
setupColumnResizers();
async function refreshConnector() {
  const status = $('#connector-status');
  try {
    const response = await fetch('/api/connector', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Connection check failed');
    const connection = await response.json();
    const fresh = connection.lastCheckedAt && Date.now() - Date.parse(connection.lastCheckedAt) < 20000;
    status.dataset.connected = String(Boolean(connection.connected && fresh));
    status.textContent = connection.error || (connection.connected ? fresh ? `Codex connected · ${connection.followedThreads}/${connection.discoveredThreads} tasks reachable · Checked ${date(connection.lastCheckedAt)}` : 'Codex connection is being checked…' : 'Codex disconnected · Comments will wait for reconnection');
  } catch {
    status.dataset.connected = 'false';
    status.textContent = 'Connection status unavailable · Displayed task status may be out of date';
  }
}
async function poll() { await Promise.all([refresh(), refreshConnector()]); setTimeout(poll, 5000); }
poll();
