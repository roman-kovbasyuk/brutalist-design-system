"""Return terminal metadata only, from exact catalog-owned local rollouts."""
import json
import pathlib
import sqlite3
import sys

connection = sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri() + '?mode=ro', uri=True, timeout=1)
roots = {str(pathlib.Path(root).resolve()) for root in json.loads(sys.argv[2])}
targets = json.loads(sys.argv[3])
results = []
for conversation, turn_ids in targets.items():
    row = connection.execute('SELECT cwd, rollout_path FROM threads WHERE id=? AND thread_source=?', (conversation, 'user')).fetchone()
    if not row or str(pathlib.Path(row[0]).resolve()) not in roots:
        continue
    found = {}
    with open(row[1], encoding='utf-8') as stream:
        first = json.loads(next(stream))
        meta = first.get('payload', {})
        if first.get('type') != 'session_meta' or meta.get('id') != conversation or str(pathlib.Path(meta.get('cwd', '/')).resolve()) not in roots:
            continue
        for line in stream:
            # A writer may be appending its final line. Never infer a terminal event.
            if not line.endswith('\n'):
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            event = entry.get('payload', {})
            if entry.get('type') != 'event_msg' or event.get('turn_id') not in turn_ids:
                continue
            kind = event.get('type')
            turn = event['turn_id']
            if kind == 'task_started':
                found.pop(turn, None)
            elif kind in ('task_complete', 'turn_aborted'):
                found[turn] = 'completed' if kind == 'task_complete' else 'interrupted'
    results.extend({'conversationId': conversation, 'turnId': turn, 'turnStatus': status} for turn, status in found.items())
print(json.dumps(results))
