CREATE TABLE IF NOT EXISTS priorities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS levels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  since_month CHAR(7) NOT NULL CHECK (since_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  priority_id INTEGER NOT NULL REFERENCES priorities(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  start_month CHAR(7) NOT NULL CHECK (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  end_month CHAR(7) CHECK (end_month IS NULL OR end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE RESTRICT,
  level_id INTEGER NOT NULL REFERENCES levels(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenges (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE RESTRICT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  is_leader BOOLEAN NOT NULL DEFAULT FALSE,
  quantity NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (quantity >= 0 AND quantity <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT owner_leader_not_both CHECK (NOT (is_owner AND is_leader)),
  CONSTRAINT assignment_unique_challenge_person UNIQUE (challenge_id, person_id)
);

INSERT INTO priorities (name)
VALUES ('Prio 1'), ('Prio 2'), ('Prio 3'), ('Prio 4')
ON CONFLICT (name) DO NOTHING;

INSERT INTO trades (name)
VALUES
  ('UX'),
  ('UI'),
  ('FE-DEV'),
  ('BE-DEV'),
  ('PM'),
  ('TPM'),
  ('COPY'),
  ('CREATIVE'),
  ('CONSULTANT'),
  ('OTHER')
ON CONFLICT (name) DO NOTHING;

INSERT INTO levels (name)
VALUES
  ('JUNIOR'),
  ('MIDWEIGHT'),
  ('SENIOR'),
  ('DIRECTOR'),
  ('C-LEVEL')
ON CONFLICT (name) DO NOTHING;
