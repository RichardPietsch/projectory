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
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'people_status_allowed'
  ) THEN
    ALTER TABLE people
    ADD CONSTRAINT people_status_allowed CHECK (status IN ('active', 'paused', 'leaver'));
  END IF;
END $$;
