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
│   └── init.sql
├── public/
│   └── index.html
├── src/
│   └── server.js
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## 1) Push to GitHub

From this repository root:

```bash
git add .
git commit -m "Initial hello-world docker boilerplate"
git push origin <your-branch-or-main>
```

## 2) Run locally with Docker Desktop (Mac)

1. Install and open **Docker Desktop**.
2. In this folder run:

```bash
docker compose up --build
```

3. Open: <http://localhost:3000>

You should see the Hello World page and a greeting loaded from PostgreSQL.

## 3) Useful Docker commands

```bash
# Start in background
docker compose up -d --build

# View logs
docker compose logs -f

# Stop and remove containers
docker compose down

# Stop and remove containers + database volume
docker compose down -v
```

## 4) How it works

- `db/init.sql` initializes a `greetings` table and inserts a starter message.
- `src/server.js` exposes:
  - `GET /` (static frontend)
  - `GET /api/hello` (reads greeting from Postgres)
  - `GET /health` (DB health check)

## 5) Deploy on another machine

1. Clone the GitHub repository.
2. Install Docker Desktop.
3. Run `docker compose up --build`.

That's it — no local Node/Postgres install needed.
