# Outcome — what shipped, and what is still unproven

Written after the integration went live on production (fortunex.cx), so the
next person does not have to re-derive any of it from the code.

## What is live

Both gateways take money. `GET /gateway/status` returns

```json
{"providers":[{"id":"nowpayments","label":"NOWPayments","sandbox":false},
              {"id":"oxapay","label":"OxaPay","sandbox":false}],
 "pinned":null,"chooseable":true,"canCharge":true,"provider":null}
```

`canCharge` and `provider` are kept beside the new fields on purpose: an
Android build already installed on someone's phone reads those two, and it
must not break because the server learned about a second gateway.

The member chooses. Nothing is pre-selected while both are open — the two
providers do not carry the same coins, so a default would send some people to
a checkout that cannot take what they hold. Where there is no choice (one
enabled gateway, or `DEPOSIT_GATEWAY` pinned) the selector is not rendered at
all.

Verified against production, not locally:

- deposit with no `provider` while both are enabled → `400`, body carries
  `{"available":["nowpayments","oxapay"]}`
- `provider=stripe` → `422` at the zod enum, before any gateway is touched
- both providers return a live checkout URL and record `gatewayProvider` on the
  deposit row
- `pay.oxapay.com` checkout returns `200` to a browser user-agent. It returns
  `403` to curl's default UA — that is bot protection on their side, not a dead
  invoice, and it cost an hour to work that out once already

## Two bugs worth remembering

**`"error": {}` means success.** OxaPay sends an empty error object on a
perfectly good response, and `{}` is truthy in JavaScript, so the original
guard fired on every successful call and reported the failure as
`Operation completed successfully!` — the string OxaPay puts in `message` when
nothing is wrong. Only an error carrying actual detail counts as one.

**The callback row match needed tightening.** A track id is unique only within
the gateway that issued it, so matching on it alone could land an OxaPay
callback on a NOWPayments deposit and credit the wrong member.

The plan in `03-plan.md` said the callback should treat a NULL provider as
"match on track_id alone", to protect deposits raised before the migration.
**That was wrong and has been removed.** It cannot protect anything: the
migration backfilled every row holding a track id, and a row receives its
track id and its provider in a single write, so no row can hold one without
the other. Production confirms it — every row with a track id has a provider,
and the one NULL row has no track id, so no callback can reach it. All the
clause could ever have matched is a legacy row whose id happened to collide
across providers, which is exactly the mismatch the check exists to prevent.

## Signature verification is proven in production

Forged payloads posted to all three callback endpoints were recorded
`verified=f, applied=f`. A genuine NOWPayments IPN verified `t` and was
correctly not credited, because its status was `waiting` and only `finished`
credits.

All three endpoints answer `200` by design — a gateway that receives an error
retries, and retrying a forged callback achieves nothing but noise. Do not read
the `200` as acceptance; read `gateway_events`.

**The OxaPay HMAC path has not yet seen a genuine callback**, because nobody has
paid an OxaPay invoice yet. It is covered by unit tests and the scheme is
confirmed against the docs (HMAC-SHA512 over the RAW body, keyed by the
merchant key for payments and the payout key for payouts — the opposite of
NOWPayments, which signs re-serialised key-sorted JSON). Treat the first real
OxaPay payment as the test, and check `gateway_events` for
`verified=t, applied=t` when it lands.

## Admin treasury

`GET /admin/treasury` backs the wallet console. It puts liability beside live
gateway holdings, because the ledger answers "what do the books say we owe" and
says nothing about whether the money is there.

Gateway balances are listed per coin and never summed — adding BTC to USDT
needs a price, that page has no price, and a total invented there would be the
one figure nobody should trust. A provider that cannot be read is reported as
unreadable, never as zero: a zero is indistinguishable from an empty account
and would make a shortfall look like a balanced book.

Which matters right now, because **NOWPayments refuses balance reads from this
server**: `Access denied | Invalid IP - 187.53.136.82`. Add that address to the
IP whitelist in the NOWPayments dashboard. Deposits are unaffected — only the
balance read is blocked.

## Still outstanding

- Whitelist `187.53.136.82` in the NOWPayments dashboard (above).
- `PAYOUT_RAIL=manual`, so approved withdrawals are paid by hand. OxaPay payouts
  are configured and `canPay` is true, but nothing sends automatically until
  that variable changes.
- Check `under_paid_coverage` is 0 in the OxaPay dashboard. Our `underpaid`
  path deliberately does not credit and routes to an operator; a generous
  coverage setting there would change that behaviour with no code change.
- Invoice lifetime differs between providers — OxaPay expires in 60 minutes,
  NOWPayments comes back with no expiry. Not a correctness problem, but members
  will see it.
- Test members with unpaid deposits are still in the database:
  `npaytest@example.com`, `webdeptest@example.com`, `oxatest@example.com`.
