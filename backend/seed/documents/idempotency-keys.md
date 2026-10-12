# Idempotency Keys for Payment APIs

A customer taps "Pay". The request reaches our server, the card is charged, and the response is lost when their train enters a tunnel. Their app retries. Without idempotency, they are charged twice. This note is how we implemented idempotency keys on the payments service, and the four bugs we shipped before getting it right.

## The contract

The client generates a unique key for each *logical* operation, usually a UUID, and sends it with every attempt:

```http
POST /v1/charges
Idempotency-Key: 6c1f9d2e-6a7b-4c39-9f0e-2b8a51d7e0c4
Content-Type: application/json

{"amount": 4200, "currency": "gbp", "source": "card_1Nx..."}
```

The server promises:

- The first request with a given key is executed normally.
- Any later request with the same key returns the *same response* as the first, without executing anything again.
- A request with the same key but a *different body* is an error (we return `422`), because it almost certainly means a client bug.

## The table

```sql
CREATE TABLE idempotency_keys (
    key           text        NOT NULL,
    account_id    bigint      NOT NULL,
    request_hash  bytea       NOT NULL,
    status        text        NOT NULL,   -- 'started' | 'completed'
    response_code int,
    response_body jsonb,
    locked_until  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, key)
);
```

Keys are scoped per account. A global key space lets one customer's badly chosen keys collide with another's, which is both a bug and a small information leak.

## The flow

1. Hash the request body (we hash the canonicalised JSON, not the raw bytes, so whitespace changes don't count as a different request).
2. `INSERT ... ON CONFLICT DO NOTHING` a row with status `started` and a lock expiry a few seconds ahead.
3. If the insert succeeded, we own the operation: do the work, then update the row to `completed` with the response.
4. If the row already existed:
   - hash differs → `422`;
   - status `completed` → return the stored response;
   - status `started` and lock still valid → `409 Conflict`, telling the client another attempt is in flight;
   - status `started` and lock expired → the previous attempt died midway. This is the hard case.

## The four bugs

**1. Storing the response after the commit.** Our first version charged the card, committed, and *then* wrote the response to the idempotency row in a separate transaction. A crash between the two left a completed charge and a `started` key. The retry, seeing an expired lock, charged again. The fix: write the domain change and the idempotency record in the same database transaction wherever possible.

**2. External calls can't join your transaction.** The card network is not in our database. For the step that calls the processor we use *recovery points*: the row records which step has completed (`created_charge_record`, `called_processor`, `finished`), and a retry resumes from the last recorded step. The call to the processor carries its own idempotency key derived from ours, so even a repeated call is safe on their side.

**3. Caching errors forever.** We stored every response, including `500`s. A customer who hit a transient database failover got the same `500` back for 24 hours, no matter how often they retried. Now we only store responses that represent a *decision*: success, or a definitive client error such as a declined card. Server errors release the key.

**4. Keys that never expire.** The table grew by a few million rows a day. Keys now expire after 24 hours, which matches the window in which clients are allowed to retry, and a nightly job deletes them in batches small enough not to bloat the WAL.

## What the client must do

- Generate the key *once* per user action and persist it before the first attempt, so an app restart retries with the same key.
- Retry only on network errors, timeouts, `409` and `5xx`, with exponential backoff and jitter.
- Never reuse a key for a different payment, even a "same amount, same card" one.

## Testing it

The tests that caught real bugs were not unit tests of the happy path. They were:

- killing the worker process at each recovery point and checking that a retry completes exactly once;
- firing the same request concurrently from fifty threads and asserting a single charge;
- replaying a week of production traffic with every request duplicated, and diffing the ledger.

Idempotency is not a header. It is a promise about the whole request path, and every component between the client and the ledger has to keep it.
