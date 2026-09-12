# Plan — let the member choose their gateway

## The design decision

Today the provider is resolved **per deployment**. It needs to be resolved
**per deposit**, chosen by the member, while keeping the operator in control of
which options are offered at all.

So the model becomes:

```
operator decides   → which gateways are ENABLED   (env / keys present)
member decides     → which enabled gateway to USE (per deposit)
server decides     → refuse anything not enabled  (never trust the request)
```

The last line matters. The provider arrives from a client, so it is a request,
not an instruction — `startDeposit` must re-check that the named gateway is
actually configured and refuse otherwise. Otherwise a crafted request could
route a deposit through a provider whose callbacks nothing can verify, and the
member would pay real money into a deposit that can never be credited.

`DEPOSIT_GATEWAY` keeps its meaning as an operator **override/pin**: set it and
that provider is forced and the choice disappears. Unset, members choose from
whatever is available. That preserves every existing single-gateway deployment
without change.

## Backend

**`GET /gateway/status`** — return a list rather than one provider:

```json
{
  "canPay": false,
  "providers": [
    { "id": "nowpayments", "label": "NOWPayments", "sandbox": false },
    { "id": "oxapay",      "label": "OxaPay",      "sandbox": false }
  ],
  "pinned": null
}
```

Keep `canCharge` and `provider` in the response as well, unchanged in meaning,
so the currently deployed web and app builds keep working while the new ones
roll out. An installed APK must not break because the server got smarter.

**`POST /gateway/deposit`** — accept an optional `provider`:

- absent → pinned provider, else the single enabled one, else 400 asking which
- present but not enabled → 400 naming what is available
- present and enabled → use it

**`gateway.service.ts`**
- `enabledGateways(): DepositGateway[]` — replaces the either/or resolver
- `startDeposit(userId, amount, provider?, email?)` — validates and branches
- record the chosen provider on the deposit row so the callback path, the
  operator queue and any later reconciliation all know which gateway owns it

**Schema** — `Deposit` already has `gatewayTrackId`, `gatewayStatus`,
`paymentUrl`. It needs one more column:

```prisma
gatewayProvider String?   // 'nowpayments' | 'oxapay'
```

A migration, plus set it on creation. Without it, a `track_id` collision
between two providers could match the wrong row, and nothing would be able to
tell an operator which checkout a pending deposit belongs to.

**Callbacks** — both routes already exist and stay entirely separate. This is
deliberate and must not be "tidied" into one handler: OxaPay signs raw bytes,
NOWPayments signs sorted-and-re-serialised JSON. One shared verifier cannot do
both, and a verifier that always fails invites someone to disable it.

## Web

On `/deposit`, when more than one gateway is enabled: a provider selector above
the amount field — two clear cards, not a dropdown, since there are two options
and a dropdown hides the second one. With one gateway enabled, no selector
appears at all; nobody should have to make a choice that has one answer.

Carry the choice into `POST /gateway/deposit`. Keep the existing manual
on-chain path where it is.

## Android

Same shape in `DepositScreen`: a segmented control when `providers.length > 1`,
nothing when it is 1. `DepositViewModel` holds the selection and passes it
through `MemberRepository.startDeposit`.

`GatewayStatus` DTO gains `providers` — and because every field in these DTOs is
nullable with a default, an older app build ignores the new field rather than
failing to parse, which is the reason they were written that way.

## Order of work

1. Migration + `gatewayProvider` on the deposit row
2. `enabledGateways()`, status response, `startDeposit(provider)`
3. Verify OxaPay against the live API with real credentials — invoice raised,
   forged callback rejected, signature accepted
4. Web selector
5. App selector
6. Build, deploy, verify end to end on both surfaces

Steps 1–2 and 4–6 I can do now. **Step 3 needs credentials.**

## What I need from you

An **OxaPay merchant API key** — from the OxaPay dashboard, the same place the
NOWPayments keys came from. Optionally a payout key too, though payouts stay
manual either way for now.

Without it I can write and deploy the code, but I cannot verify that OxaPay
actually accepts our invoice requests, and I will not tell you a money path
works on the strength of having read the documentation. With NOWPayments I
raised a live invoice and fired a forged callback at the endpoint before
calling it done; OxaPay deserves the same.

## Risks and notes

- **Sandbox first.** `sandbox: true` on the invoice call raises test invoices
  that move no real funds. Worth one pass through that before live keys.
- **Fee split.** `fee_paid_by_payer` should match the NOWPayments setting
  (`fee_paid_by_payer: 1` there) so a member is not quoted a different net
  depending on which checkout they picked.
- **`under_paid_coverage`** defaults to the merchant account setting. Our
  `underpaid` handling deliberately does not credit and routes to an operator,
  so a generous coverage setting in the OxaPay dashboard would change behaviour
  without any code change. Worth checking it is 0.
- **Lifetime** is capped at 2880 minutes (48 h) and defaults to 60. NOWPayments
  invoices currently come back with no expiry at all, so the two providers will
  behave differently on abandonment. Not a correctness problem, but members
  will see it.
- **Existing rows** have `gatewayProvider = NULL`. The callback path must treat
  NULL as "match on track_id alone", or in-flight deposits raised before the
  migration would stop resolving.
