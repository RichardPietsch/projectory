# Hello World Boilerplate (Docker + Tailwind + PostgreSQL)

A minimal boilerplate project you can push to GitHub and run with Docker Desktop on macOS.

## Stack

- **Backend:** Node.js + Express
- **Frontend:** Static HTML with TailwindCSS (CDN)
- **Database:** PostgreSQL
- **Local deployment:** Docker Compose

## Project structure

```text
.
├── db/
│   ├── Dockerfile
│   └── init.sql
├── public/
│   └── index.html
├── src/
│   └── server.js
├── Dockerfile
├── docker-compose.yml
├── docker-compose.remote.yml
└── README.md
```

## 1) Push to GitHub

From this repository root:

```bash
git add .
git commit -m "Initial hello-world docker boilerplate"
git push origin <your-branch-or-main>
```

## 2) Option A — clone and run (most common)

```bash
git clone <your-repo-url>
cd <your-repo-folder>
docker compose up --build
```

Then open <http://localhost:3000>.


## 3) Option B — run without cloning (directly from GitHub)

Yes — this is possible.

### Quick start for your repo (`RichardPietsch/projectory`)

Use this if the file exists on your default branch:

```bash
curl -fsSL https://raw.githubusercontent.com/RichardPietsch/projectory/main/docker-compose.richard.yml \
| docker compose -f - up --build
```

If you get `404` / `empty compose file`, use this fallback (does **not** depend on downloading a compose file):

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

Why 404 happens:
- the file is not yet pushed to GitHub
- or the branch is not `main` (use your real branch name in the URL)


### Prerequisites
- Docker Desktop running
- `curl` available

### Command

Set your real repo URL (from GitHub "Code" button) in `REPO_GIT_URL`.

Why it was not hardcoded: this environment has no git remote configured for this repo (`git remote -v` returns nothing), so there is no reliable URL to auto-fill.

```bash
REPO_GIT_URL="https://github.com/<owner>/<repo>.git#main" \
COMPOSE_URL="https://raw.githubusercontent.com/<owner>/<repo>/main/docker-compose.remote.yml" \
curl -fsSL "$COMPOSE_URL" | docker compose -f - up --build
```

Accepted `REPO_GIT_URL` formats:
- HTTPS branch: `https://github.com/<owner>/<repo>.git#main`
- HTTPS tag: `https://github.com/<owner>/<repo>.git#v1.0.0`
- SSH branch: `git@github.com:<owner>/<repo>.git#main`

Tip: from your local clone, this prints the correct URL automatically:

```bash
git remote get-url origin
```

What this does:
- downloads `docker-compose.remote.yml` directly from GitHub
- builds both services from your GitHub git context (`REPO_GIT_URL`)
- starts the app with no local clone

Then open <http://localhost:3000>.

## 4) Useful Docker commands

```bash
# Start in background (clone workflow)
docker compose up -d --build

# View logs
docker compose logs -f

# Stop and remove containers
docker compose down

# Stop and remove containers + database volume
docker compose down -v
```

If you started via stdin Compose file (Option B), stop with:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/docker-compose.remote.yml \
| docker compose -f - down
```

## 5) How it works

- `db/init.sql` initializes a `greetings` table and inserts a starter message.
- `src/server.js` exposes:
  - `GET /` (static frontend)
  - `GET /api/hello` (reads greeting from Postgres)
  - `GET /health` (DB health check)

## 6) Deploy on another machine

Use either path:
1. **Clone path:** clone repo, then run `docker compose up --build`.
2. **No-clone path:** use the `curl ... | docker compose -f - up --build` command above.

That's it — no local Node/Postgres install needed.
