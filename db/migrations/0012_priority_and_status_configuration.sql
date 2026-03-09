-- Configurable client priorities and project statuses.

ALTER TABLE priorities
  ADD COLUMN IF NOT EXISTS color_hex TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

UPDATE priorities SET color_hex = '#FFD700' WHERE color_hex IS NULL;
UPDATE priorities SET sort_order = id WHERE sort_order IS NULL;

ALTER TABLE priorities
  ALTER COLUMN color_hex SET NOT NULL,
  ALTER COLUMN sort_order SET NOT NULL;

ALTER TABLE priorities
  ALTER COLUMN color_hex SET DEFAULT '#FFD700',
  ALTER COLUMN sort_order SET DEFAULT 100;

CREATE TABLE IF NOT EXISTS project_statuses (
  status_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (label)
);

INSERT INTO project_statuses (status_key, label, color_hex, sort_order)
VALUES
  ('done', 'Done', '#22C55E', 1),
  ('in_progress', 'In Progress', '#EAB308', 2),
  ('rework_needed', 'Rework needed', '#EF4444', 3)
ON CONFLICT (status_key)
DO UPDATE SET
  label = EXCLUDED.label,
  color_hex = EXCLUDED.color_hex,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

UPDATE projects
SET status = CASE
  WHEN lower(status) IN ('green', 'done') THEN 'done'
  WHEN lower(status) IN ('red', 'rework_needed') THEN 'rework_needed'
  ELSE 'in_progress'
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_status_check'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT projects_status_check;
  END IF;
END $$;

ALTER TABLE projects
  ALTER COLUMN status SET DEFAULT 'in_progress';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_status_fk'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_status_fk
      FOREIGN KEY (status)
      REFERENCES project_statuses(status_key)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Priority presets with metallic-style colors.
INSERT INTO priorities (name, color_hex, sort_order)
VALUES
  ('High Priority', '#FFD700', 1),
  ('Medium Priority', '#C0C0C0', 2),
  ('Low Priority', '#CD7F32', 3),
  ('No Priority', '#111111', 4)
ON CONFLICT (name)
DO UPDATE SET
  color_hex = EXCLUDED.color_hex,
  sort_order = EXCLUDED.sort_order;

-- Legacy-name remapping if older names still exist.
DO $$
DECLARE
  legacy RECORD;
  target_id INTEGER;
BEGIN
  FOR legacy IN
    SELECT * FROM (VALUES
      ('⭐️ Hero', 'High Priority'),
      ('✨ Rising Star', 'Medium Priority'),
      ('☑️ Solid', 'Low Priority'),
      ('🛠️ Maintenance', 'No Priority'),
      ('🔬 Small Client', 'No Priority'),
      ('❌ Outphasing', 'No Priority'),
      ('Prio 1', 'High Priority'),
      ('Prio 2', 'Medium Priority'),
      ('Prio 3', 'Low Priority'),
      ('Prio 4', 'No Priority')
    ) AS m(legacy_name, target_name)
  LOOP
    SELECT id INTO target_id FROM priorities WHERE name = legacy.target_name LIMIT 1;
    IF target_id IS NOT NULL THEN
      UPDATE clients
      SET priority_id = target_id
      WHERE priority_id IN (SELECT id FROM priorities WHERE name = legacy.legacy_name)
        AND priority_id <> target_id;

      DELETE FROM priorities p
      WHERE p.name = legacy.legacy_name
        AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.priority_id = p.id);
    END IF;
  END LOOP;
END $$;
