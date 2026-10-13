-- Queries over docs/map.sqlite (built by scripts/project-map.py). Run:
--   sqlite3 docs/map.sqlite < docs/map-queries.sql      or paste one into `sqlite3 docs/map.sqlite`.
-- `last` is the newest build. In query 1 put the file you ask about in place of depth/core/client.ts.

-- 1. Everything that depends on a file, directly and through others: what a change may break.
WITH RECURSIVE last(id) AS (SELECT max(id) FROM builds),
  up(f, depth) AS (
    SELECT src, 1 FROM edges, last WHERE build = last.id AND dst = 'depth/core/client.ts'
    UNION
    SELECT e.src, up.depth + 1 FROM edges e, up, last WHERE e.build = last.id AND e.dst = up.f AND up.depth < 20)
SELECT min(depth) AS hops, f FROM up GROUP BY f ORDER BY hops, f;

-- 2. Code files nobody imports (entry points and orphans).
WITH last(id) AS (SELECT max(id) FROM builds)
SELECT DISTINCT src FROM edges, last WHERE build = last.id
  AND (src LIKE '%.ts' OR src LIKE '%.tsx') AND src NOT IN (SELECT dst FROM edges, last WHERE build = last.id)
ORDER BY src;

-- 3. What changed between the two newest builds.
WITH b AS (SELECT id FROM builds ORDER BY id DESC LIMIT 2),
  new AS (SELECT src, dst FROM edges WHERE build = (SELECT max(id) FROM b)),
  old AS (SELECT src, dst FROM edges WHERE build = (SELECT min(id) FROM b))
SELECT '+' AS d, * FROM (SELECT * FROM new EXCEPT SELECT * FROM old)
UNION ALL SELECT '-', * FROM (SELECT * FROM old EXCEPT SELECT * FROM new);
