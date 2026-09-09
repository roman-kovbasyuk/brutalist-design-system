"""Read only the current project's user-task catalog; never read message bodies."""
import json
import pathlib
import sqlite3
import sys

database = pathlib.Path(sys.argv[1]).resolve()
projects = json.loads(sys.argv[2])
if not isinstance(projects, list) or not projects or any(not isinstance(p, str) for p in projects):
    raise ValueError('Expected verified project roots')
connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=1)
connection.row_factory = sqlite3.Row
placeholders = ','.join('?' for _ in projects)
rows = connection.execute('''SELECT id, cwd, COALESCE(name, title) AS title,
    updated_at_ms, model, reasoning_effort, archived
    FROM threads WHERE cwd IN (''' + placeholders + ''') AND (archived = 0 OR ? = 1) AND thread_source = 'user'
    ORDER BY updated_at DESC''', projects + [int(len(sys.argv) > 3 and sys.argv[3] == 'all')])
print(json.dumps([dict(row) for row in rows]))
