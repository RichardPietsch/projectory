-- Step 2 foundation: admin-managed accounts and SMTP configuration storage.
-- A single row in smtp_settings (id=1) is used by the admin settings UI.

CREATE TABLE IF NOT EXISTS smtp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  host TEXT,
  port INTEGER,
  username TEXT,
  password TEXT,
  from_email TEXT,
  secure BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO smtp_settings (id, enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;
