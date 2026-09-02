# FortuneX

Affiliate trading platform implementing the compensation plan in `Doc/FortuneX.pdf`.

**Stack** — Node 22 · TypeScript · Express 5 · PostgreSQL 17 · Prisma 7 · BullMQ · Redis
· Next.js 16 · React 19 · Tailwind 4 · TanStack Query

```
backend/    Express API, MVC per module
frontend/   Next.js App Router
Doc/        FortuneX.pdf — the source specification
research/   Competitor teardown (screenshots + page content)
```

## Run it

```bash
docker compose up -d              # Postgres :5440, Redis :6390
cd backend && npm install && npx prisma migrate deploy && npm run db:seed
npm run dev                       # API      → http://localhost:4000/api/v1
npm run worker                    # scheduler (daily ROI)

cd ../frontend && npm install && npm run dev   # web → http://localhost:3010
```

### Logins

| Surface | URL | Credentials |
| --- | --- | --- |
| Customer | http://localhost:3010/login | `contactsanket1@gmail.com` / `Sanket@3030` |
| Admin | http://localhost:3010/admin/login | `contactsanket1@gmail.com` / `Sanket@3030` (SUPER_ADMIN) |
| Admin (seed) | | `admin@fortunex.local` / `Admin@12345` |

Customer and admin tokens are not interchangeable: admin tokens carry `typ: "admin"`,
so a customer token replayed against `/admin/*` is rejected with 403.

Create more admins with:

```bash
cd backend && npx tsx scripts/create-admin.ts <email> <password> "<name>" SUPER_ADMIN
```

## Architecture

Each module owns a folder under `backend/src/modules/<name>/` with `*.controller.ts`,
`*.service.ts`, `*.routes.ts` and, where input needs it, `*.validation.ts`. Controllers
stay thin, services hold the rules, and only `core/ledger.ts` may move money.

```
core/ledger.ts     atomic money movement, append-only journal
core/capping.ts    250% / 300% earnings ceiling
core/tree.ts       genealogy — 30-level upline in one query
core/money.ts      Decimal only, never floats
```

### Three rules that are not negotiable

1. **Balances move atomically.** `postEntry` issues `balance = balance + ?` in SQL and
   never reads a balance into JS to write it back. Debits carry their guard in the same
   statement (`AND balance >= ?`), so a race cannot overdraw.
2. **Every payout is idempotent.** Ledger `reference` is unique; a replayed job collides
   on the index instead of paying twice.
3. **Every income stream passes the cap.** Daily ROI, direct bonus, generation bonus and
   rank rewards all clamp against remaining headroom before crediting.

Verify all three:

```bash
cd backend
npx tsx scripts/verify-concurrency.ts   # 240 concurrent credits, expect 0 lost
npx tsx scripts/verify-roi.ts           # weekday gate + replay safety
```

## The plan, as implemented

| Stream | Rule | Source |
| --- | --- | --- |
| Investment tiers | $110 → $104,300, ten plans | p12 |
| Daily trade bonus | 0.5%/day, **Mon–Fri only** | p10, p18 |
| Direct sponsor | L1 4%, L2 0.5%, L3 0.5% | p11 |
| Generation | 30 levels, 13% → 0.5%, gated on directs + team volume | p13 |
| Executive rank | 10 ranks, Starter → Legend, 50:50 power-leg rule | p14, p15 |
| Flyers Club | 2 tracks × 5 destinations | p16, p17 |
| Earnings cap | 250% passive / 300% active | p18 |
| Withdrawals | 5% fee, $10–$5,000, 48h SLA, USDT BEP-20 | p18 |

## FLAG-GEN-BASE — confirm before launch

The deck says "Generation Bonus — Level 1 13%" without stating 13% **of what**.
This build applies it to the downline's **daily ROI**, not their capital, because:

* 13% + 8% + 5%… of capital would exceed the entire 5% sponsor pool many times over
  and is not solvent;
* the live reference platform studied during research names the equivalent stream
  "Level ROI" and pays it on the daily return.

Change `payGenerationBonus` in `modules/commission/commission.service.ts` if the client
confirms otherwise. Two related questions are also still open: whether the sponsor and
generation bonuses both pay on levels 1–3, and whether rank rewards are one-off or daily.

## Admin API

33 endpoints under `/api/v1/admin`, organised as sub-modules:

```
modules/admin/
  auth/       login, me, create admin
  users/      list, detail, status, affiliate mode, manual adjustment, team recalc
  finance/    deposit + withdrawal queues, approve, reject, SLA ageing
  catalog/    packages, 33 commission rules, ranks, roaming tiers — the plan is data
  reports/    overview, top earners, income series, cap utilisation, liability
  settings/   DB-backed runtime config that overrides .env
  audit/      append-only record of every mutating admin action
```

### Roles

| Role | Can |
| --- | --- |
| `SUPER_ADMIN` | everything, including settings and creating admins |
| `ADMIN` | user management, plan catalogue, finance |
| `FINANCE` | approve/reject money movements, manual adjustments |
| `SUPPORT` | read-only |

Enforced by `requireRole` on each route and verified in
`scripts/verify-admin-controls.ts`.

### Two properties worth knowing

**Manual adjustments go through the ledger.** An operator cannot write a balance
directly — `adjustBalance` posts a normal `ADJUSTMENT` entry with a mandatory reason,
so it obeys the same atomicity and idempotency rules as every other movement.

**Nothing an operator does is untraceable.** Every mutation writes an `audit_logs` row
with actor, before/after snapshot, IP and user agent. The table is append-only; there is
no update or delete path.

```bash
npx tsx scripts/verify-admin.ts           # exercises all 25 read/write endpoints
npx tsx scripts/verify-admin-controls.ts  # audit trail + role enforcement
```

## Ports

| Service | Port | Note |
| --- | --- | --- |
| API | 4000 | |
| Web | 3010 | 3000 is taken by another project on this machine |
| Postgres | 5440 | 5433 is taken by BharatOne |
| Redis | 6390 | |
