# KisanPool Fresh + Recovery Demo Acceptance (T20)

## Data boundary

The test fixtures use **synthetic demo values**. They do not represent current mandi prices, confirmed live buyers, vehicle availability, food safety, measured savings, or field outcomes. Never present the figures below as real-world results.

## Reproducible demo checks

Run the deterministic scenario checks:

```sh
node --import tsx --test tests/kisanpool-demo.test.ts tests/cargo-ledger.test.ts tests/fresh-engine.test.ts
```

The scenario compares a nearer lower-price destination with a farther higher-price destination and checks the separate balanced, price-only, fastest, and closest outputs. It also models 100 kg received, 60 kg sold, and the remaining 40 kg moving through a replacement/reroute leg. It does not write a payment: actual payment and payout continue through the ordinary existing payment records and settlement services.

## Operator walkthrough

1. Open the isolated Fresh prototype at `http://localhost:8765/prototypes/kisanpool-fresh-t00a.html`. Treat every displayed item as mock-only. Review the crop form and market comparison labels.
2. Review the vehicle recovery and handover steps. Confirm the screen shows custody, party acknowledgement, and operations escalation states.
3. Review partial sale: record 60 kg against the 100 kg parent quantity, then confirm only 40 kg is eligible for a next-leg choice. Both farmer and transporter approvals must refer to the same option and version.
4. In the operator console, open **Fresh & cargo data quality**. The API requires an admin-claim token. The queue displays recorded stale/invalid observations, open incidents, no-replacement cases, receipt discrepancies, pending decisions, unsold cargo, and no-feasible-market recommendations.
5. Confirm the API reports price-import monitoring as **not configured**. Do not infer there were zero failed imports: the repository has no price-import job or failure log to query.
6. Payment settlement is verified by the existing billing and payment flows; this demo fixture does not create, capture, refund, or transfer money.

## Acceptance limitations

The deterministic tests cover ranking outputs, quantity balance, reroute allocation, and same-version bilateral consent. The UI prototype is isolated mock data and does not call production APIs. Full recovery, booking, Razorpay settlement, and MongoDB concurrency acceptance requires a separately seeded local integration environment; this document does not claim those live workflows were run.
