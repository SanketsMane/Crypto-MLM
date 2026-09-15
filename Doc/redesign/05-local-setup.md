# Local setup on this machine

The README's `docker compose up -d` path is still correct wherever Docker
exists. This machine has none, so the stack runs natively. Written down because
the constraints are not obvious and the next person will hit all of them.

## What this machine does not have

| | |
| --- | --- |
| Docker / Docker Desktop | not installed, and installing it needs admin |
| WSL distro | `wsl.exe` exists, no distro; `wsl --install` needs admin |
| winget / choco / scoop | none |
| Administrator rights | no |
| Visual C++ redistributable | **not installed** — this is the one that bites |

Everything below therefore installs per-user under `%LOCALAPPDATA%\Programs`
and runs as ordinary user processes. Nothing is registered as a service.

## Installed

| Component | Version | Location |
| --- | --- | --- |
| Node | 22.23.2 LTS | `%LOCALAPPDATA%\Programs\nodejs` (on user PATH) |
| PostgreSQL | 17.6 | `%LOCALAPPDATA%\Programs\pgsql` |
| Redis | 8.10.1 | `%LOCALAPPDATA%\Programs\redis` |

Data and logs live outside the program directories:

```
%LOCALAPPDATA%\fortunex-pgdata      Postgres cluster
%LOCALAPPDATA%\fortunex-redisdata   Redis dump
%LOCALAPPDATA%\fortunex-logs        postgres.log, redis.log
```

Ports match `docker-compose.yml` exactly — Postgres 5440, Redis 6390 — so
`.env` is identical either way and moving back to Docker changes nothing but
the start command.

## The three things that were not obvious

**1. Postgres needs the MSVC runtime, and installing it needs admin.**
Every Windows Postgres build is MSVC-built. With no redistributable present,
`initdb.exe` exits `0xC0000135` (STATUS_DLL_NOT_FOUND) and says nothing else.
The fix is app-local CRT deployment — a supported Microsoft model — putting
`vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll`, `concrt140.dll` and
`vccorlib140.dll` next to the Postgres binaries in `pgsql\bin`. Deleting those
five files breaks Postgres and the error will not mention them.

**2. The server log must not live inside the data directory.**
It was put at `fortunex-pgdata\server.log` first. Postgres walks its own data
directory during crash recovery, reaches the log file that `pg_ctl` is holding
open, and stalls on `could not open file "./server.log": sharing violation`,
retrying for thirty seconds before giving up. Logs go to `fortunex-logs`.

**3. `pg_ctl start` must be launched detached.**
Run in the foreground it holds the console, and killing the caller takes the
whole cluster down with it. `ops\dev-stack.ps1` uses `Start-Process
-WindowStyle Hidden` so the server outlives the shell that started it.

## Running it

```powershell
powershell -ExecutionPolicy Bypass -File ops\dev-stack.ps1 start    # or stop | status | logs
```

Then, in separate terminals:

```bash
cd backend  && npm run dev       # API    → http://localhost:4000/api/v1
cd backend  && npm run worker    # scheduler (daily ROI)
cd frontend && npm run dev       # web    → http://localhost:3010
```

## Databases

`fortunex` (app), `fortunex_shadow` (Prisma drift checks), `fortunex_test`
(vitest). Role `fortunex` / `fortunex`, `trust` auth for local connections.

`.env` and `.env.test` are generated and gitignored. `.env` carries three
freshly generated 64-character secrets — `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` and `ENCRYPTION_KEY`, all distinct, as the boot check
requires. **`ENCRYPTION_KEY` encrypts TOTP seeds and the hot wallet key at
rest; rotating it invalidates every enrolled authenticator.** Treat this local
one as disposable and never reuse it anywhere real.

## Verified on this machine

| Check | Result |
| --- | --- |
| `backend: npm run typecheck` | clean |
| `frontend: npm run typecheck` | clean |
| `backend: npm test` | 566 passed, 11 skipped, 0 failed |
| `frontend: npm test` | 37 passed |
| `frontend: npm run build` | succeeds |
| `frontend: npm run budget` | 719.8 KB / 760 KB — within budget |
| `prisma migrate deploy` | all migrations applied, `branding_assets` created |
| `db:seed` | 40 permissions, 4 roles, 3 admins, 10 packages, 33 rules |
| Branding end-to-end | 35/35 checks (see below) |

The branding check drove the live API: admin login, upload, asset serving,
every guard, the settings validators and cache invalidation — then confirmed
the rendered HTML at `localhost:3010` carried the operator's title, favicon,
accent colour and `og:site_name`. Script kept out of the repo; it lives in the
session scratchpad and is easy to regenerate.

## Not set up

- **Docker.** Needs admin. The compose files are untouched and remain the
  documented production path.
- **The worker** (`npm run worker`) has not been run. Redis is up and BullMQ's
  requirement is met, but the daily-ROI scheduler has not been exercised here.
- **Playwright e2e** (`npm run test:e2e`). Browsers are not downloaded;
  `npx playwright install` fetches a few hundred MB.
- **SMTP.** Unset by design — mail is written to the log and recorded in
  `email_logs`, so every flow works end to end without a mail server.
