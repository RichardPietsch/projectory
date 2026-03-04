CREATE TABLE IF NOT EXISTS onboarding_profiles (
  id SERIAL PRIMARY KEY,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  start_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'paused', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES onboarding_profiles(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT onboarding_profile_step_unique UNIQUE (profile_id, step_key)
);
