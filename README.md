# Projectory Resource Planner (Docker + Tailwind + PostgreSQL)

Browser-based resource planning tool with three management views:
- **People View**
- **Client View**
- **Project View**

## What v1 includes

### Entities
- **Person**: first name, last name, trade, level
- **Client**: name, location, since month (`yyyy-mm`), priority
- **Project**: belongs to exactly one client, start/end month (`yyyy-mm`), budget entered in **euros** (stored as cents internally)
- **Challenge**: belongs to a project
- **Assignment**: links person + project + challenge with optional `isOwner` or `isLeader`

### Business rules implemented
- Footer actions export/import operational data as JSON (clients, projects, people, challenges, assignments). Static lists (priorities, trades, levels) are excluded and cannot be changed via import/export. Import performs strict schema/reference validation and rejects malformed files.
- Static lists are pre-seeded on DB startup:
  - Priorities: Prio 1..4
  - Trades: UX, UI, FE-DEV, BE-DEV, PM, TPM, COPY, CREATIVE, CONSULTANT, OTHER
  - Levels: JUNIOR, MIDWEIGHT, SENIOR, DIRECTOR, C-LEVEL
- A project must belong to one client.
- An assignment cannot be both owner and leader at once.
- The same person cannot be assigned to the same challenge more than once.
- Multiple owners/leaders per project are allowed.
- Deleting records is blocked if dependencies exist (FK restrict behavior).
- Assignment `quantity` is auto-split equally across a person's assigned projects and always sums to 100%.

## Run locally with Docker Desktop (recommended)

```bash
docker compose up --build
```

Open: <http://localhost:3000>

## No-clone run from GitHub (your repo)

```bash
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.richard.yml \
| docker compose -f - up --build
```

If raw GitHub file is missing, use this fallback:

```bash
cat <<'YAML' | docker compose -f - up --build
services:
  web:
    build:
      context: https://github.com/RichardPietsch/projectory.git#main
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: helloapp
      DB_USER: hello
      DB_PASSWORD: hello
    depends_on:
      db:
        condition: service_healthy

  db:
    build:
      context: https://github.com/RichardPietsch/projectory.git#main:db
    environment:
      POSTGRES_DB: helloapp
      POSTGRES_USER: hello
      POSTGRES_PASSWORD: hello
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hello -d helloapp"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
YAML
```

## Useful commands

```bash
# Start in background
docker compose up -d --build

# Logs
docker compose logs -f

# Stop
docker compose down

# Stop + wipe database volume
docker compose down -v
```
