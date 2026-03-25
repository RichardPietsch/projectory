-- Move historical startup schema/catalog bootstrap into explicit migration-only flow.
-- This migration is idempotent and preserves behavior for existing deployments.

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'white'
CHECK (status IN ('green', 'blue', 'yellow', 'red', 'white'));

ALTER TABLE people
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN;

ALTER TABLE people
ADD COLUMN IF NOT EXISTS is_leaver BOOLEAN;

ALTER TABLE people
ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE people
SET status = CASE
  WHEN COALESCE(is_leaver, FALSE) THEN 'leaver'
  ELSE 'active'
END
WHERE status IS NULL;

ALTER TABLE people
ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE people
ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_status_allowed'
  ) THEN
    ALTER TABLE people
    ADD CONSTRAINT people_status_allowed CHECK (status IN ('active', 'paused', 'leaver'));
  END IF;
END $$;

ALTER TABLE people
ADD COLUMN IF NOT EXISTS working_hours INTEGER NOT NULL DEFAULT 40;

UPDATE people
SET working_hours = 40
WHERE working_hours IS NULL;

DO $$
DECLARE
  target_priorities TEXT[] := ARRAY[
    '⭐️ Hero',
    '✨ Rising Star',
    '☑️ Solid',
    '🛠️ Maintenance',
    '🔬 Small Client',
    '❌ Outphasing'
  ];
BEGIN
  UPDATE priorities
  SET name = '⭐️ Hero'
  WHERE name = 'Prio 1'
    AND NOT EXISTS (SELECT 1 FROM priorities p2 WHERE p2.name = '⭐️ Hero');

  UPDATE priorities
  SET name = '✨ Rising Star'
  WHERE name = 'Prio 2'
    AND NOT EXISTS (SELECT 1 FROM priorities p2 WHERE p2.name = '✨ Rising Star');

  UPDATE priorities
  SET name = '☑️ Solid'
  WHERE name = 'Prio 3'
    AND NOT EXISTS (SELECT 1 FROM priorities p2 WHERE p2.name = '☑️ Solid');

  UPDATE priorities
  SET name = '🛠️ Maintenance'
  WHERE name = 'Prio 4'
    AND NOT EXISTS (SELECT 1 FROM priorities p2 WHERE p2.name = '🛠️ Maintenance');

  INSERT INTO priorities (name)
  SELECT value
  FROM unnest(target_priorities) AS value
  ON CONFLICT (name) DO NOTHING;

  WITH id_map AS (
    SELECT id, name
    FROM priorities
    WHERE name IN ('Prio 1', 'Prio 2', 'Prio 3', 'Prio 4', '⭐️ Hero', '✨ Rising Star', '☑️ Solid', '🛠️ Maintenance')
  )
  UPDATE clients
  SET priority_id = target.id
  FROM id_map legacy
  JOIN id_map target ON (
    (legacy.name = 'Prio 1' AND target.name = '⭐️ Hero') OR
    (legacy.name = 'Prio 2' AND target.name = '✨ Rising Star') OR
    (legacy.name = 'Prio 3' AND target.name = '☑️ Solid') OR
    (legacy.name = 'Prio 4' AND target.name = '🛠️ Maintenance')
  )
  WHERE clients.priority_id = legacy.id
    AND legacy.id <> target.id;

  DELETE FROM priorities p
  WHERE p.name IN ('Prio 1', 'Prio 2', 'Prio 3', 'Prio 4')
    AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.priority_id = p.id);
END $$;

INSERT INTO trades (name)
SELECT value
FROM unnest(ARRAY[
  'UX', 'UI', 'DATA', 'STRATEGY', 'CONSULTING', 'DEV-FE', 'DEV-BE', 'DEV-FULLSTACK', 'DEV-OPS',
  'ART', 'COPY', 'CREATIVE', 'IT', 'HR', 'ACCOUNT', 'PO', 'TPM', 'MANAGEMENT', 'ADMIN', 'CONTROLLING',
  'TEMP', 'STUDENT'
]::text[]) AS value
ON CONFLICT (name) DO NOTHING;

INSERT INTO levels (name)
SELECT value
FROM unnest(ARRAY['—', 'JUNIOR', 'MIDWEIGHT', 'SENIOR', 'DIRECTOR', 'C-LEVEL']::text[]) AS value
ON CONFLICT (name) DO NOTHING;
