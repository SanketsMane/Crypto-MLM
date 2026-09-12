# OxaPay API — reading notes

Source: `https://docs.oxapay.com` (v1, current). Read via the documentation's own
`llms.txt` index, which lists every page — the HTML reference pages are
JavaScript-rendered and return only their titles to a plain fetch.

Pages read:

- `/api-reference/payment` (section index)
- `/api-reference/payment/generate-invoice`
- `/api-reference/payment/payment-information`
- `/api-reference/payment/payment-status-table`
- `/api-reference/payment/accepted-currencies`
- `/api-reference/error.md`
- `/webhook`

---

## Transport

| | |
|---|---|
| Base URL | `https://api.oxapay.com/v1` |
| Auth header (payments) | `merchant_api_key: <key>` |
| Auth header (payouts) | `payout_api_key: <key>` |
| Content type | `application/json` |

The two keys are **not interchangeable**. The merchant key authorises money
coming IN, the payout key money going OUT. A compromise of one must not grant
the other.

## Envelope

Every response, success or failure, uses one shape:

```json
{
  "data": { },
  "message": "string",
  "error": { "type": "...", "key": "...", "message": "..." },
  "status": 200,
  "version": "1.0"
}
```

`error` may be `null` or `{}` when nothing went wrong. HTTP codes: 200 ok,
400 malformed, 401 bad key, 404 wrong path, 500 server, 503 down.

## Create an invoice

`POST /v1/payment/invoice`

Request fields that matter to us:

| Field | Notes |
|---|---|
| `amount` | number, required. Dollars unless `currency` says otherwise |
| `currency` | optional; we send `USD` |
| `lifetime` | minutes, **15–2880**, default 60 |
| `fee_paid_by_payer` | `1` = payer pays the gateway fee, `0` = we absorb it |
| `under_paid_coverage` | 0–60%; how much short still counts as paid |
| `callback_url` | webhook target |
| `return_url` | where the browser lands afterwards |
| `order_id` | **our** deposit id — how the callback finds our record |
| `email`, `description` | reporting only |
| `sandbox` | `true` raises test invoices that move no real funds |

Response: `data.track_id`, `data.payment_url`, `data.expired_at` (UNIX seconds),
`data.date`.

`track_id` is the handle for status queries and reconciliation.

## Statuses (verbatim from the status table)

| Status | Meaning |
|---|---|
| `new` | Newly created. Payer has not chosen a currency yet |
| `waiting` | Currency chosen. Awaiting payment |
| `paying` | Payer is attempting to complete payment |
| `paid` | Fully paid |
| `manual_accept` | Manually accepted by us; amount charged to our balance |
| `underpaid` | Partial payment; invoice not fully paid |
| `refunding` | Refund initiated, in progress |
| `refunded` | Refunded to the payer |
| `expired` | Not paid within the lifetime |

**Only `paid` and `manual_accept` mean the money is ours.** `paying` in
particular reads as encouraging and is not — crediting on it would pay out
against a transfer that can still fail.

## Webhook — the part that differs between gateways

- Header: **`HMAC`**
- Algorithm: **HMAC-SHA512**, hex
- Hashed over: **the RAW request body**, byte for byte. *Not* re-serialised JSON.
- Key: `merchant_api_key` for payment callbacks, `payout_api_key` for payout
  callbacks — so a leaked merchant key cannot forge a payout confirmation.
- Must answer **HTTP 200 with the body `ok`**.
- Retries on any other answer: 5 attempts, roughly 1 min → 3 min → 30 min → 3 h.

Payload fields: `track_id`, `status`, `type`, `module_name`, `amount`, `value`,
`sent_value`, `currency`, `order_id`, `email`, `note`, `fee_paid_by_payer`,
`under_paid_coverage`, `description`, `date`, and a `txs[]` array with hash,
confirmations, network and addresses.

### Contrast with NOWPayments — this is the trap

| | OxaPay | NOWPayments |
|---|---|---|
| Header | `HMAC` | `x-nowpayments-sig` |
| Algorithm | HMAC-SHA512 | HMAC-SHA512 |
| Signed over | **raw bytes** | **JSON re-serialised with keys sorted** |
| Key | merchant / payout key | separate IPN secret |
| Expected reply | `200` body `ok` | `200` |

The two verifiers are therefore shaped differently and must stay separate. Using
one for the other never matches, and the tempting "fix" for a verifier that
always fails is to stop verifying — which is exactly how a forged callback
credits a wallet.

## Reconciliation

`GET /v1/payment/{track_id}` with the merchant key returns the full payment
object. This is the escape hatch for a callback that never arrived — worth
wiring into the ops watch later, but not needed for the first cut.

## Accepted currencies

`GET /v1/payment/accepted-currencies` returns only **symbols**, with no
network breakdown. So it cannot tell us whether USDT-on-BSC specifically is
accepted; the invoice flow lets the payer choose from whatever the merchant
account has enabled, which is configured in the OxaPay dashboard rather than
over the API.
