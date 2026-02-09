CREATE TABLE IF NOT EXISTS greetings (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL
);

INSERT INTO greetings (message)
VALUES ('Hello World from PostgreSQL running in Docker!')
ON CONFLICT DO NOTHING;
