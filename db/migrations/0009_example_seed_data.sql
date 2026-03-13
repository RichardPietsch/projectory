-- Seed a small example dataset for first-run evaluation.
-- Idempotent by natural keys (names/emails) so repeated migration runs are safe.

DO $$
DECLARE
  v_priority_id INTEGER;
  v_trade_id INTEGER;
  v_level_id INTEGER;

  v_client_id INTEGER;
  v_project_id INTEGER;

  v_owner_person_id INTEGER;
  v_lead_person_id INTEGER;
  v_contributor_person_id INTEGER;

  v_owner_challenge_id INTEGER;
  v_lead_challenge_id INTEGER;
  v_contributor_challenge_id INTEGER;
BEGIN
  SELECT id INTO v_priority_id FROM priorities WHERE name = '⭐️ Hero' LIMIT 1;
  IF v_priority_id IS NULL THEN
    INSERT INTO priorities (name) VALUES ('⭐️ Hero') RETURNING id INTO v_priority_id;
  END IF;

  SELECT id INTO v_trade_id FROM trades WHERE name = 'DEV-FULLSTACK' LIMIT 1;
  IF v_trade_id IS NULL THEN
    INSERT INTO trades (name) VALUES ('DEV-FULLSTACK') RETURNING id INTO v_trade_id;
  END IF;

  SELECT id INTO v_level_id FROM levels WHERE name = 'SENIOR' LIMIT 1;
  IF v_level_id IS NULL THEN
    INSERT INTO levels (name) VALUES ('SENIOR') RETURNING id INTO v_level_id;
  END IF;

  SELECT id INTO v_client_id FROM clients WHERE name = 'Example Client GmbH' LIMIT 1;
  IF v_client_id IS NULL THEN
    INSERT INTO clients (name, location, since_month, priority_id)
    VALUES ('Example Client GmbH', 'Berlin', '2026-01', v_priority_id)
    RETURNING id INTO v_client_id;
  END IF;

  SELECT id INTO v_project_id FROM projects WHERE client_id = v_client_id AND name = 'Example Website Relaunch' LIMIT 1;
  IF v_project_id IS NULL THEN
    INSERT INTO projects (client_id, name, status, start_month, end_month, budget_cents)
    VALUES (v_client_id, 'Example Website Relaunch', 'blue', '2026-02', '2026-12', 24000000)
    RETURNING id INTO v_project_id;
  END IF;

  SELECT id INTO v_owner_person_id FROM people WHERE first_name = 'Olivia' AND last_name = 'Owner' LIMIT 1;
  IF v_owner_person_id IS NULL THEN
    INSERT INTO people (first_name, last_name, trade_id, level_id, status, working_hours)
    VALUES ('Olivia', 'Owner', v_trade_id, v_level_id, 'active', 40)
    RETURNING id INTO v_owner_person_id;
  END IF;

  SELECT id INTO v_lead_person_id FROM people WHERE first_name = 'Liam' AND last_name = 'Lead' LIMIT 1;
  IF v_lead_person_id IS NULL THEN
    INSERT INTO people (first_name, last_name, trade_id, level_id, status, working_hours)
    VALUES ('Liam', 'Lead', v_trade_id, v_level_id, 'active', 40)
    RETURNING id INTO v_lead_person_id;
  END IF;

  SELECT id INTO v_contributor_person_id FROM people WHERE first_name = 'Casey' AND last_name = 'Contributor' LIMIT 1;
  IF v_contributor_person_id IS NULL THEN
    INSERT INTO people (first_name, last_name, trade_id, level_id, status, working_hours)
    VALUES ('Casey', 'Contributor', v_trade_id, v_level_id, 'active', 40)
    RETURNING id INTO v_contributor_person_id;
  END IF;

  -- Intentionally do not seed user accounts for demo people.
  -- The three sample people are planning examples only.

  SELECT id INTO v_owner_challenge_id
  FROM challenges
  WHERE project_id = v_project_id AND title = 'Define product scope'
  LIMIT 1;
  IF v_owner_challenge_id IS NULL THEN
    INSERT INTO challenges (project_id, title, description)
    VALUES (v_project_id, 'Define product scope', 'Frame release goals and acceptance criteria with the client.')
    RETURNING id INTO v_owner_challenge_id;
  END IF;

  SELECT id INTO v_lead_challenge_id
  FROM challenges
  WHERE project_id = v_project_id AND title = 'Lead technical implementation'
  LIMIT 1;
  IF v_lead_challenge_id IS NULL THEN
    INSERT INTO challenges (project_id, title, description)
    VALUES (v_project_id, 'Lead technical implementation', 'Coordinate architecture and delivery milestones.')
    RETURNING id INTO v_lead_challenge_id;
  END IF;

  SELECT id INTO v_contributor_challenge_id
  FROM challenges
  WHERE project_id = v_project_id AND title = 'Implement UI components'
  LIMIT 1;
  IF v_contributor_challenge_id IS NULL THEN
    INSERT INTO challenges (project_id, title, description)
    VALUES (v_project_id, 'Implement UI components', 'Build and refine reusable interface components.')
    RETURNING id INTO v_contributor_challenge_id;
  END IF;

  INSERT INTO assignments (project_id, challenge_id, person_id, is_owner, is_leader, quantity)
  VALUES (v_project_id, v_owner_challenge_id, v_owner_person_id, TRUE, FALSE, 40)
  ON CONFLICT (challenge_id, person_id) DO NOTHING;

  INSERT INTO assignments (project_id, challenge_id, person_id, is_owner, is_leader, quantity)
  VALUES (v_project_id, v_lead_challenge_id, v_lead_person_id, FALSE, TRUE, 35)
  ON CONFLICT (challenge_id, person_id) DO NOTHING;

  INSERT INTO assignments (project_id, challenge_id, person_id, is_owner, is_leader, quantity)
  VALUES (v_project_id, v_contributor_challenge_id, v_contributor_person_id, FALSE, FALSE, 25)
  ON CONFLICT (challenge_id, person_id) DO NOTHING;
END $$;
