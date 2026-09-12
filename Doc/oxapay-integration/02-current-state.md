# What already exists

Read before planning, because the headline finding changes the size of the job.

## The OxaPay client is already written, and it is correct

`backend/src/core/gateway/oxapay.ts` was built during the original gateway work
and checks out line by line against the documentation I just read:

| Doc says | Code does | |
|---|---|---|
| `https://api.oxapay.com/v1` | `const BASE = 'https://api.oxapay.com/v1'` | ✅ |
| `POST /payment/invoice` | `call('/payment/invoice', 'merchant_api_key', …)` | ✅ |
| Header `merchant_api_key` | same | ✅ |
| HMAC-SHA512 over raw body | `createHmac('sha512', key).update(raw)` | ✅ |
| Paid = `paid`, `manual_accept` | `PAID = new Set(['paid','manual_accept'])` | ✅ |
| Reply `200` body `ok` | controller sends `.send('ok')` | ✅ |
| Separate payout key | `payout_api_key` path kept distinct | ✅ |
| `timingSafeEqual` comparison | present, with a length check first | ✅ |

It also already keeps the exact request bytes for signing — `keepRaw` in
`app.ts` stashes `req.rawBody` — which is precisely what OxaPay's scheme needs
and what NOWPayments' scheme must not use.

Callback route already mounted: `POST /api/v1/gateway/oxapay/payment` (and
`/payout`), declared ahead of `requireAuth` so no token is demanded of the
gateway.

**One small deviation I noticed.** The code files `refunding` under "dead",
whereas the docs class it as in-progress. Both outcomes decline to credit, so
nothing is at risk — the difference is only whether the event is recorded as
settled or pending. Not worth changing.

## So what is actually missing

Two things, neither of them the client.

### 1. The selection model forbids exactly what is being asked for

`gateway.service.ts` → `depositGateway()` resolves **one** provider for the
whole deployment:

```
only NOWPayments configured  → nowpayments
only OxaPay configured       → oxapay
DEPOSIT_GATEWAY names one    → that one
BOTH configured, none named  → REFUSE: "…and DEPOSIT_GATEWAY does not say
                               which to use."
```

That guard was right for its original purpose — an operator should not be able
to leave it ambiguous. But the request now is for the **member** to choose per
deposit, which the current shape cannot express: there is one answer per
deployment, not one per request.

### 2. No OxaPay credentials anywhere

Production `.env.production` contains no `OXAPAY_*` lines at all. The whole
subsystem is off and there is nothing to turn on.

```
NOWPAYMENTS_ENABLED=true
DEPOSIT_GATEWAY=<set>
(no OXAPAY_MERCHANT_KEY, no OXAPAY_PAYOUT_KEY, no OXAPAY_CALLBACK_BASE)
```

This is the one blocker I cannot clear myself.

## Where deposits are raised today

| Surface | State |
|---|---|
| Web `/deposit` | Checkout button → `POST /gateway/deposit`, no provider choice |
| Android `DepositScreen` | Same, no provider choice |
| `POST /gateway/deposit` | Takes `{ amount }` only |
| `GET /gateway/status` | Returns `{ canCharge, provider, canPay, sandbox }` — one provider |

So both surfaces and both endpoints assume a single gateway. All four need to
learn about a choice.
