-- Step 8 optimization: add high-value FK/performance indexes for core workload tables.
--
-- Why these indexes:
-- 1) idx_challenges_project_id (challenges.project_id)
--    - Supports project detail and admin project views that load challenges by project.
--    - Expected hot pattern: WHERE project_id = $1 ORDER BY id.
--
-- 2) idx_assignments_project_id (assignments.project_id)
--    - Supports project-level assignment listing and aggregate checks by project.
--    - Expected hot pattern: WHERE project_id = $1.
--
-- 3) idx_assignments_person_id (assignments.person_id)
--    - Supports people overview/workload and person-specific assignment lookups.
--    - Expected hot pattern: WHERE person_id = $1.
--
-- 4) idx_assignments_challenge_id (assignments.challenge_id)
--    - Supports challenge row hydration and assignment joins by challenge.
--    - Note: unique (challenge_id, person_id) does not fully replace this for challenge-only access in all planners.
--
-- 5) idx_assignments_project_person (assignments.project_id, person_id)
--    - Supports frequent quantity checks constrained by both person and project.
--    - Expected hot pattern: WHERE person_id = $1 AND project_id = $2.
--
-- Query-plan before/after notes for critical endpoints:
-- A) Project detail: GET /api/projects
--    Before: Seq Scan on challenges/assignments with filter on project_id under growth.
--    After:  Index Scan using idx_challenges_project_id and idx_assignments_project_id.
--
-- B) Workload update + consistency checks in assignment flows
--    Before: Seq Scan on assignments for person/project pair filters.
--    After:  Index Scan / Bitmap Index Scan using idx_assignments_project_person.
--
-- C) Person-centric views (people overview / assignment history)
--    Before: Seq Scan on assignments for person_id filters.
--    After:  Index Scan using idx_assignments_person_id.

CREATE INDEX IF NOT EXISTS idx_challenges_project_id
  ON challenges(project_id);

CREATE INDEX IF NOT EXISTS idx_assignments_project_id
  ON assignments(project_id);

CREATE INDEX IF NOT EXISTS idx_assignments_person_id
  ON assignments(person_id);

CREATE INDEX IF NOT EXISTS idx_assignments_challenge_id
  ON assignments(challenge_id);

CREATE INDEX IF NOT EXISTS idx_assignments_project_person
  ON assignments(project_id, person_id);
