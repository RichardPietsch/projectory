ALTER TABLE levels
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

WITH ordered_levels AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name, id) AS next_sort_order
  FROM levels
)
UPDATE levels l
SET sort_order = ordered_levels.next_sort_order
FROM ordered_levels
WHERE l.id = ordered_levels.id
  AND (l.sort_order IS NULL OR l.sort_order <= 0);

ALTER TABLE levels
  ALTER COLUMN sort_order SET DEFAULT 1;

UPDATE levels
SET sort_order = 1
WHERE sort_order IS NULL OR sort_order <= 0;

ALTER TABLE levels
  ALTER COLUMN sort_order SET NOT NULL;
