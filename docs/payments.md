# Payments

## Provider choice (Cameroon, XAF)

| Option | Status | Notes |
|---|---|---|
| **Notch Pay** | **Implemented** (`NotchPayProvider`) | Cameroon MTN MoMo (`cm.mtn`) and Orange Money (`cm.orange`) via *direct charge*: our server asks Notch Pay to push a USSD prompt to the customer's phone. Public docs, sandbox and HMAC-signed webhooks. https://developer.notchpay.co |
| Campay | Not implemented | Popular Cameroonian aggregator with a similar collect/USSD flow. Its API reference is a JavaScript-only Postman page that couldn't be verified for this build, so it was not coded blind. Add it as a new `PaymentProviderAdapter` |
| MTN MoMo / Orange Money direct APIs | Not implemented | Need separate merchant agreements per operator; an aggregator is simpler at this scale |

Confirm fees, settlement times, and merchant requirements directly with the provider before launch. They change, and they depend on your business registration (RCCM, taxpayer number) and your settlement account.

## How a payment works

1. `POST /api/checkout` creates `Payment(PENDING)` with a unique `reference` (`SW-YYYYMMDD-XXXXXXXXXX`) and the client's `idempotencyKey`. Retries and double taps return the same payment.
2. `NotchPayProvider.initiate`: `POST /payments` with `{amount, currency: "XAF", reference, description, customer: {phone}}`, then `POST /payments/{trx-reference}` with `{channel, data: {phone}}`. Notch Pay's reference is stored as `providerReference`.
3. The customer approves on their phone.
4. Any of these triggers `verifyPayment`:
   * the status page polling `GET /api/payments/:id` (at most every 4 s);
   * a webhook `POST /api/webhooks/notchpay`;
   * the worker's reconciliation every ~20 s (missing or delayed webhooks).
5. `verifyPayment` calls `GET /payments/{reference}`. Activation needs **all** of: status `complete`, amount exactly equal, currency `XAF`, and our reference echoed back when present. A mismatch is flagged for review and grants nothing.
6. `failed`, `canceled` and `expired` mark the payment accordingly. If it is still pending after the approval window (10 min by default), it becomes `EXPIRED`, but it keeps being re-checked for 24 h, so a late success is still honoured.

A browser redirect, a client message, or a webhook body alone **never** activates anything.

## Webhook setup

1. Notch Pay Business Suite → Settings → Webhooks: URL `https://<APP_URL host>/api/webhooks/notchpay`, events `payment.complete`, `payment.failed`, `payment.canceled`, `payment.expired`.
2. Copy the webhook **hash key** into `NOTCHPAY_WEBHOOK_HASH`. Verification: `hex(HMAC-SHA256(rawBody, key)) == x-notch-signature`, compared in constant time. Notch Pay's docs are inconsistent about whether the account "Hash Key" or a per-webhook secret is used. Use the dashboard's *Send test event* and check that it shows `processedAt` (not `Invalid signature`) in the `WebhookEvent` table.
3. Events are stored with a unique `(provider, eventKey)`, so duplicates are acknowledged and ignored. Invalid signatures get HTTP 401 and are recorded.

## Configuration

```
PAYMENT_PROVIDER=notchpay
NOTCHPAY_PUBLIC_KEY=pk_test_…      # pk_live_… in production
NOTCHPAY_WEBHOOK_HASH=hsk_test_…
ALLOW_SIMULATED_PAYMENTS=false
```

## Testing

* Automated: `tests/integration/payment-lifecycle.test.ts` covers forged webhooks, webhook re-verification, duplicate deliveries, amount mismatch, failed/pending/expired payments, idempotency, and crash recovery.
* Notch Pay sandbox (`pk_test_…`) test numbers: `+237670000000` succeeds, `…001` insufficient funds, `…002` failure, `…003` timeout, `…004` cancelled (MTN; Orange uses `+23769…`). Don't reuse the same number too often; the sandbox may flag it.
* Verify that XAF amounts are sent as whole francs (Notch Pay documents "smallest currency unit", and XAF has none). Do one live 100 XAF payment before launch and confirm the dashboard shows 100 XAF.

## Reconciliation and operations

* The admin *Payments* page shows every attempt with status and failure reason, and *Re-check* runs `verifyPayment` now. There is deliberately **no "mark as paid" button**.
* *Paid, no pass yet*: the worker repairs these automatically. If one persists, check the logs and dead jobs.
* Refunds: issue them in the Notch Pay dashboard. Record the reason, and revoke the access from the customer page if needed. Automated refunds aren't implemented.

## Adding a provider

Implement `PaymentProviderAdapter` (`initiate`, `fetchStatus`, `parseWebhook`) in `src/server/payments/providers/`, add the enum value to `PaymentProvider` in the schema, wire it into `registry.ts`, and add a `/api/webhooks/<provider>` route. The subscription logic needs no change.
