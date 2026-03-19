DELETE FROM users
WHERE lower(email) IN (
  'olivia.owner@example.local',
  'liam.lead@example.local',
  'casey.contributor@example.local'
);
