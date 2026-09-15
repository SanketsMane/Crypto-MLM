# Compensation plan — what the document says, and what the platform does

Source: `FortuneX.pdf` (corporate deck, 17 slides). Written after applying it to
production on 2026-09-15, so the next person does not have to re-derive any of
this from the slides or the database.

Production held **zero investments, commissions, ROI accruals and rank
achievements** when these values were applied. Nothing had been earned against
the previous figures, which is why the whole set could be corrected at once
rather than grandfathered. That will not be true a second time.

## Where the numbers live

Almost none of this is in code. Rates and thresholds are runtime settings; plans,
ranks and commission bands are database rows edited through the admin console.
Everything below was applied through the audited admin API — `PUT /admin/settings/:key`,
`POST /admin/packages`, `PUT /admin/commission-rules/batch`, `PATCH /admin/ranks/:id`
— so each change carries an audit row naming the operator and the before/after.

The public website reads the same config, so correcting the data corrects the
marketing pages, the FAQ and the legal pages with no deploy.

## Applied values

| Rule | Value | Where |
|---|---|---|
| Daily trade bonus | 0.43% | `DAILY_ROI_PERCENT` + per-package rate |
| Trading days | Mon–Fri | `TRADING_DAYS` = `1,2,3,4,5` |
| Passive ceiling | 200% | `CAP_PASSIVE_PERCENT`, package `capPercent` |
| Active ceiling | 300% | `CAP_ACTIVE_PERCENT` |
| Withdrawal fee | 5% | `WITHDRAW_FEE_PERCENT` |
| Withdrawal min / max | $10 / $5,000 | `WITHDRAW_MIN`, `WITHDRAW_MAX` |
| Payout dates | 15th and 30th | `WITHDRAWAL_PAYOUT_DAYS` |
| Processing SLA | 48h from the payout date | `WITHDRAW_SLA_HOURS` |
| Minimum investment | $50 | `MIN_INVESTMENT` |
| Rank reward vesting | 9 equal monthly parts | `REWARD_VESTING_MONTHS` |

Plans: Bronze $100, Silver $300, Gold $500, Platinum $1,000, Diamond $2,500,
Titanium $5,000, Elite $10,500, Prime $26,000, Wealth $52,000, Capital $104,500.

Direct sponsor: L1 0.4%, L2 0.5%, L3 0.5%.

Generation: L1 13%; L2 8% (2 directs, $2,000 team); L3–5 5% (6, $10,000);
L6–10 2% (8, $20,000); L11–20 1% (15, $50,000); L21–30 0.5% (18, $100,000).

Ranks, `self / team / reward`: Starter 300/5k/100 · Silver 500/25k/500 ·
Bronze 1k/75k/1k · Gold 1.5k/120k/2.5k · Platinum 2k/200k/4k · Diamond
2.5k/400k/8k · Elite 3k/650k/16k · Master 5k/1M/40k · Champion 7.5k/3M/120k ·
Legend 10k/5M/200k.

## Three places the document contradicts itself

Each of these moves real money, so none was decided quietly. The first two were
put to the operator; the third was reconciled.

**Direct sponsor level 1.** Slide 11 prints "Level 1 — 0.4%" under a heading
reading "5% structure", and slide 9 advertises "Direct Sponsor Bonus: Up to 5%".
0.4 + 0.5 + 0.5 = 1.4%, not 5%; 4 + 0.5 + 0.5 = exactly 5%. Production had been
running 4%. **The operator chose the literal 0.4%.** If the "5% structure"
heading is the true intent, this is the row to change, and it is a single batch
call.

**The earnings ceiling.** Three figures: p8 "2× income", p10 "payout released up
to 250% of invested capital", p16 "passive 200% / active 300%". **200/300 was
chosen** — it is on the Terms & Conditions slide, and p8's "2×" agrees with it.
Only p10 dissents.

The engine composes these as `package.capPercent + (active − passive)`, so the
coherent encoding is package ceiling 200 with the uplift supplying the other
100 for ACTIVE affiliates. Setting a package to 250 would give ACTIVE members
350%.

**Withdrawal timing.** p16 says both "placed 24/7 and processed within 48 hours"
and "all withdrawals every fortnight (15th and 30th)". These describe different
events and are not in conflict: the member requests at any hour, the platform
settles on the calendar, and 48 hours is the operator's window to clear a batch.
See `backend/src/core/payout-calendar.ts`.

## What already worked, unchanged

- **50:50 rank qualification** (half the team requirement from the strongest
  leg, half from the rest) — `modules/rank/rank.service.ts`.
- **Cap stops every stream, not just ROI.** Each income path routes through
  `core/capping.ts`; once the ceiling is reached `allowance` returns zero for
  all of them, which is what "re-top-up is mandatory or all revenues will be
  stopped" requires. A new purchase raises the limit and restores headroom.
- **Rank rewards vest** — `REWARD_VESTING_MONTHS` already existed and only
  needed setting to 9. A schedule already running is never re-cut.
- USDT BEP-20 only, for both activation and withdrawal.

## Not implemented

**The affiliate offers (slide 15)** — $26,600 → Lakshadweep 4D3N; $42,550 →
$1,565 car fund or new ID top-up; $79,800 → $3,200 house purchase; valid
10.09.2026–10.10.2026. Left alone deliberately:

- It is a one-month promotion, not a standing rule, and the existing
  `roaming_club_tiers` have no date window — modelling it there would make the
  promotion permanent.
- Those tiers currently hold a different, live structure (Thailand → Europe,
  split self/team). Overwriting them would silently move the goalposts for any
  member already progressing toward one.
- Two of the three rewards are cash funds, not travel, so they are not the same
  kind of thing the roaming club models.

Implementing it properly needs a dated promotion with a single qualifying
figure and a mixed cash/benefit reward. Worth doing before the window opens;
worth deciding first whether it replaces the roaming club or runs beside it.

**"$50 multiples" (slide 8)** is not enforced, and deliberately so — see the
note in `investment.service.ts`. Purchases are of published packages, none of
which is a multiple of 50 ($100 is, $10,500 is not), so a step rule would make
most of the ladder unbuyable. The $50 floor is enforced where amounts are
actually entered, on package create/edit.

**Welcome gifts per package** (slide 15) — no mechanism, and none specified.
