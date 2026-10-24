# KisanPool Fresh + Recovery Demo Acceptance (T20)

## Data boundary

The tests use synthetic values. They do not represent current mandi prices, confirmed buyers, vehicle availability, food safety, measured savings, or field outcomes. Seeded API snapshots use reference market locations and an unverified farmer-reported quote; they are not live market evidence and are not bookable.

## Offline checks

```sh
npm test
```

This runs the Fresh ranking, freshness, market-price normalization, cargo-ledger and demo scenario tests without touching MongoDB. The scenario compares a nearer/lower-price destination with a farther/higher-price destination and checks the four ranking views. It also models 100 kg received, 60 kg sold and 40 kg remaining. No payment is created or changed.

## Local seeded snapshot walkthrough

1. Follow the MongoDB and app setup in `README.md`; set `FRESH_DEMO_DATA=true` and `EXPO_PUBLIC_FRESH_DEMO_DATA=true` in `.env`, then restart the server and Expo Metro.
2. Start the server and mobile app. Sign in as farmer `9000000001`; with no OTP provider key, the OTP appears in the server terminal.
3. Open Fresh Produce and choose **Open synthetic comparison demo**. The comparison is computed in memory; no `seed:fresh` command is needed.
4. Verify four different market winners: balanced, highest net, fastest and closest. The page labels all fixture evidence simulated and disables booking.
5. To inspect the separate static mock prototype, run `python3 -m http.server 8765 --directory docs` and open `http://localhost:8765/prototypes/kisanpool-fresh-t00a.html`.

The admin **Fresh & cargo data quality** page is protected by an admin-claim token. Price import monitoring reports **not configured** because there is no import job/failure log; this must not be interpreted as zero failed imports.

## Acceptance limitations

The deterministic tests cover ranking outputs, price unit conversion and staleness, model registration, quantity balance, reroute allocation and same-version bilateral consent. They are not live API/database tests. The local simulation demonstrates numerical trade-offs but does not assert real prices, acceptance, transport availability or savings. Full recovery, booking, Razorpay settlement and MongoDB concurrency acceptance require a separately prepared isolated integration environment.
