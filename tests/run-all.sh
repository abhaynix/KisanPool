#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo '########## Offline Fresh, market-price, cargo, and demo tests ##########'
node --import tsx --test \
  tests/fresh-engine.test.ts \
  tests/fresh-demo-scenario.test.ts \
  tests/fresh-live-eligibility.test.ts \
  tests/market-prices.test.ts \
  tests/market-data.test.ts \
  tests/cargo-ledger.test.ts \
  tests/kisanpool-demo.test.ts

if [[ "${KISANPOOL_RUN_INTEGRATION:-}" == "1" ]]; then
  : "${MONGODB_URI:?Set MONGODB_URI to an isolated replica-set test database before integration runs}"
  echo '########## Integration suites (caller-managed isolated database; no reseed/reset) ##########'
  for suite in tests/05_pooled_flow.py tests/06_pooled_pricing.py tests/07_farm_machinery.py tests/08_backhaul.py tests/09_predictions.py tests/10_v2_features.py tests/11_payments_route.py tests/12_resilience.py; do
    echo "Running $suite"
    python3 "$suite"
  done
  echo 'Legacy pre-pooling suites 01, 02, and 04 are skipped: they target removed routes.'
  echo 'Realtime suite 03 is skipped: it requires its own current-contract setup.'
else
  echo 'Integration suites skipped: set KISANPOOL_RUN_INTEGRATION=1 and MONGODB_URI to an isolated replica-set database.'
fi
