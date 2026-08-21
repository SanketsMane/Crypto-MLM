# Deploying FortuneX

Everything here has been run and verified. Where something has *not* been
proved in production, it says so rather than implying otherwise.

---

## What you need

- A server with Docker and the Compose plugin. 2 vCPU / 4 GB is comfortable for
  the first few thousand members; Postgres is the part that wants headroom.
- A domain already pointing at it. Caddy requests a certificate on first start,
  and it cannot do that before DNS resolves.
- Somewhere off this machine to keep backups. A backup on the same disk as the
  database is not a backup.

---

## First deploy

```bash
git clone <your-repo> fortunex && cd fortunex

cp .env.production.example .env.production
$EDITOR .env.production          # fill in every REQUIRED value

docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

The `migrate` service runs to completion before `api` and `worker` start, so
the schema is always current before anything serves.

Watch it come up:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
```

You are up when this returns `ready`:

```bash
curl -s https://your-domain/api/v1/ready | jq .status
```

### Generating the secrets

Three separate values, each of them different:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 48   # ENCRYPTION_KEY
```

The API refuses to start on a placeholder or on anything under 32 characters.
That is deliberate — a checked-in default is public knowledge, and the failure
is silent right up until someone signs in as an admin they invented.

**`ENCRYPTION_KEY` is effectively permanent.** It encrypts TOTP seeds and the
hot wallet key. Rotating it locks out every member with two-factor enabled and
makes the payout key unreadable. Plan the re-encryption before you change it.

### The first operator account

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api node dist/../scripts/create-admin.js
```

Or create it directly against the database. There is no default admin, and no
signup path to the console — both on purpose.

---

## Day two

### Backups

Automated, verified by restoring, and pruned:

```bash
# crontab -e   — 03:00 UTC daily
0 3 * * * cd /srv/fortunex && ./ops/backup.sh >> /var/log/fortunex-backup.log 2>&1
```

Every run restores the dump into a scratch database and counts the ledger rows.
A dump that cannot be restored fails the run rather than sitting there looking
like a backup.

**Copy them off this machine.** `rclone`, `aws s3 sync`, anything — the script
writes to `BACKUP_DIR` and stops there.

Restoring:

```bash
./ops/backup.sh --verify-only /var/backups/fortunex/fortunex-<stamp>.sql.gz
gunzip -c <file> | docker compose -f docker-compose.prod.yml \
  --env-file .env.production exec -T postgres psql -U fortunex fortunex
```

### Monitoring

`/api/v1/metrics` serves Prometheus text. It is blocked at the proxy — it
reports member counts and platform liability, which is nobody else's business.
Scrape it from inside the network, on `api:4000`.

The gauges worth alerting on:

| Metric | Alert when | Because |
|---|---|---|
| `fortunex_last_roi_accrual_timestamp` | older than ~26h on a trading day | members are not being paid and nothing else would tell you |
| `fortunex_withdrawals_overdue` | `> 0` | members are debited and waiting past your SLA |
| `fortunex_payouts_stuck` | `> 0` | approved payouts that could not be sent |
| `fortunex_deposits_pending` | rising and not falling | nobody is working the confirmation queue |

The platform also raises these to operators in-app through the ops watch job, so
you are not dependent on having set monitoring up.

### Logs

JSON on stdout, with a correlation id on every line. `docker compose logs`, or
ship them anywhere that reads JSON. Every error response carries the same
`requestId`, so a member quoting it in a ticket is enough to find the request.

---

## Things that will bite you

**Email is not optional.** With `SMTP_HOST` unset, every password reset and
withdrawal code is written to the log instead of delivered — the account
recovery path simply does not work. Use a transactional provider with SPF, DKIM
and DMARC on a warmed domain. A fintech sending from a fresh domain lands in
spam, and a member who never gets their code has no way back in.

**`TRUST_PROXY_HOPS` must match reality.** With the bundled Caddy it is `1`. Set
it too low and every request appears to come from the proxy: the rate limiter
throttles all members together, the audit log records one address, and the admin
IP allowlist collapses to allow-all or deny-all. Set it too high and a client can
forge `X-Forwarded-For` and choose the address the allowlist checks.

**On-chain settlement is off until you configure it**, and it has never touched
a real network. It is tested against a local node, not mainnet. Before enabling:

- the deposit xpub and the payout wallet **must be different accounts**, or the
  hot wallet's own transfers look like member deposits
- a hot wallet key in an environment variable is adequate for a float and
  inadequate above it — move signing to a KMS or hardware signer past a balance
  you would mind losing
- start on testnet, with small amounts, and watch `/admin/chain`

**Migrations are the one irreversible step.** The deploy workflow takes a
verified backup before running them, and rolls the *images* back on failure but
deliberately not the database — a migration that has run may already have been
written against, and restoring over it loses whatever happened since. That call
is yours to make, not the pipeline's.

---

## What has not been proved

Being straight about this, because the gap between "works" and "runs in
production" is where the surprises live:

- **No production traffic yet.** 225 tests pass, both images boot and serve, the
  ledger holds under concurrent load in test. None of that is a month of real
  members.
- **No load testing at scale.** The concurrency tests prove correctness under
  contention, not throughput at ten thousand members.
- **No mainnet chain activity.** Zero real transactions, ever.
- **No error-tracking service.** Logs are structured and correlated, which is
  most of the value, but there is no Sentry-equivalent collecting exceptions.
- **Single host.** This compose file runs everything on one machine. That is a
  reasonable start and a single point of failure; the API is stateless and
  scales horizontally when you need it to, but Postgres would need a plan.
