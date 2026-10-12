# Postmortem: The Cache Stampede of 3 March

**Status:** Resolved · **Severity:** SEV-2 · **Duration:** 47 minutes of degraded checkout, 9 minutes of full outage · **Author:** Wojciech Kowalski, with input from the payments and platform teams

This postmortem is blameless. Where a decision turned out to be wrong, it is described with the information the person had at the time.

## Summary

At 14:02 UTC a routine deploy of the pricing service cleared its in-memory cache on every instance at once. Every request then missed the cache and went to the pricing database. The database saturated within forty seconds, request latency climbed past client timeouts, and clients retried, which doubled the load. Checkout requests that depended on pricing failed for 9 minutes and were degraded for a further 38.

No data was lost. About 2,300 checkout attempts failed; most customers retried successfully once the service recovered.

## Timeline (UTC)

| Time | Event |
|---|---|
| 14:01 | Deploy of pricing v2.41 begins. Rolling restart, 4 instances at a time out of 24. |
| 14:02 | First batch restarts with empty caches. Database CPU rises from 30% to 70%. |
| 14:03 | Second batch restarts. Database CPU at 100%. p99 latency of pricing reaches 8 s. |
| 14:04 | Checkout's 2 s timeout to pricing starts firing. Checkout clients retry with no backoff. |
| 14:05 | Pager fires for checkout error rate. Incident declared. |
| 14:08 | Deploy paused. The remaining 8 instances still have warm caches but receive too little traffic to help. |
| 14:11 | On-call attempts to roll back. Rollback restarts the instances again, emptying the caches that had begun to warm. Full outage begins. |
| 14:15 | Database connection pool raised from 200 to 400. Makes things worse: more concurrent queries, longer queue. Reverted at 14:17. |
| 14:20 | Checkout retries disabled via feature flag. Load on pricing falls by about half. |
| 14:20 | Full outage ends; service degraded but responding. |
| 14:24–14:49 | Caches warm up gradually. Latency returns to normal by 14:49. |

## What happened, in more detail

The pricing service caches computed prices for 10 minutes. The cache is local to each instance and is populated on demand: on a miss, the instance queries the database and stores the result.

This design has a known weak point. When a popular entry expires or is missing, every concurrent request for it misses at the same moment and goes to the database. This is a **cache stampede**, also called the thundering herd. Under normal operation it is invisible, because entries expire at scattered times. A restart is the opposite of normal: every entry on the instance is missing at once.

A rolling restart would usually spread this out. Two things defeated it. First, the batch size had been raised from 1 to 4 a month earlier to speed deploys up, so one sixth of capacity went cold at a time. Second, the most expensive queries, for bundle prices, are shared across almost every product page, so even a few cold instances generated a lot of identical expensive queries at once.

## Why recovery took so long

Three of the four actions we took made things worse before they made them better, and each was reasonable at the time.

- **The rollback** restarted the instances again, emptying caches that had been warming. Rolling back is our default for any incident that starts during a deploy, and usually the right call; here the problem was the restart, not the new code.
- **Raising the connection pool** let more queries run concurrently on a database that was already CPU-bound, so each query took longer.
- **Retries** in checkout had no backoff or jitter, so every failed request was immediately followed by another.

The action that helped was turning off retries, which cut the load enough for caches to warm.

## What we're changing

| Action | Owner | Status |
|---|---|---|
| Request coalescing in the pricing cache: concurrent misses for the same key wait on a single database query | Platform | Done |
| Warm caches before an instance receives traffic, using the previous hour's most requested keys | Platform | In progress |
| Jitter cache expiry times (±20%) so entries don't expire together | Platform | Done |
| Exponential backoff with jitter on all checkout → pricing retries, and a retry budget | Checkout | Done |
| Deploy batch size back to 1 for pricing, with an alert if anyone changes it | Release eng | Done |
| Runbook: "incident during deploy" now asks whether a restart is part of the problem before rolling back | SRE | Done |
| Load test that restarts a quarter of instances at peak traffic, run before every major release | SRE | Planned |

## What went well

- The pager fired within three minutes of the first errors.
- The checkout team had a feature flag for retries already in place, from a previous incident. Without it, recovery would have taken much longer.
- Customer support was told within ten minutes, which kept duplicate tickets down.

## Lessons

The general lesson is an old one: **systems are most fragile while they are changing.** A cache that protects the database in steady state can become the thing that overloads it during a restart, and every restart is a small cold start. The specific lesson is that our incident instincts — roll back, add capacity, keep retrying — all assume the system recovers when the load is spread out. When the problem *is* the load, the first move should be to shed it.
