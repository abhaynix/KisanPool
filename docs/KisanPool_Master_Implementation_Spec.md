# KisanPool v3 — Master Product & Implementation Specification

**Document type:** Master implementation specification and agent task tracker  
**Product:** KisanPool v3 + KisanPool Fresh  
**Repository:** [`abhaynix/KisanPool`](https://github.com/abhaynix/KisanPool)  
**Branch policy:** Verify the repository's actual default branch and working tree during Task T00; do not switch to the legacy `master` branch by assumption. The original Fresh plan was prepared against `v3`.  
**Prepared:** 24 October 2026; consolidated specification updated after product decisions in this conversation  
**Primary prototype crop:** Tomato; other crops require explicitly configured crop profiles.  
**Primary outcome:** Recommend a feasible destination using a configurable, explainable balance of expected net proceeds and delivery suitability, while preserving price/data uncertainty. Also support incident recovery with replacement vehicles and partial-sale/remaining-cargo rerouting.

---

## How to use this master specification

This file preserves the original Fresh implementation plan and adds the approved platform-wide incident-recovery and partial-sale/rerouting requirements, the balanced-ranking rule, the UI prototype-first workflow, and the coding-agent workflow. Where an older section conflicts with a newer rule in Sections 25–29, the newer rule takes precedence. Do not delete existing KisanPool functionality to implement this plan.

**Repository instructions are mandatory:** Before inspecting or changing code, the coding agent must discover and read all applicable repository instruction files. This explicitly includes root files named `agent.md`, `AGENT.md`, `AGENTS.md` (case-insensitive where the filesystem permits), and relevant nested instruction files in directories it touches; also inspect applicable tool-specific instruction files such as `CLAUDE.md`, `.github/copilot-instructions.md`, and Cursor/Codex instruction files if present. Follow them in addition to this master spec. Do not edit or bypass instruction files as part of this work. During T00, list the instruction files that were found and read. If an instruction materially conflicts with this spec or the requested product behaviour, stop and report the exact conflict instead of silently ignoring either source.

**Implementation discipline:** Codex must implement only one Task ID per run, update this file's progress tracker, report files changed and tests run, then stop at `IMPLEMENTED_NEEDS_REVIEW`. The user alone can mark the task `APPROVED`; the next task must not start before explicit user approval. The initial order is T00 repository audit → T00A theme audit and focused UI prototype → T01 contracts and compatibility plan. Later UI implementation tasks must follow the user-approved prototype and existing app theme.

### First message to Codex (copy/paste)

> Read `KisanPool_Master_Implementation_Spec.md` completely before acting. Before any code work, discover and read all applicable repository agent instructions, especially root `agent.md`/`AGENT.md`/`AGENTS.md` and relevant nested or tool-specific files. Follow them; do not edit or bypass them. Work only on **Task T00 — Repository baseline audit**. Verify the actual repository default branch, git status, scripts, current API/model/service contracts, transport pricing, payment/payout behaviour, recovery capabilities, current UI theme/components and tests. Do not implement features or modify production code during T00. Update the task tracker and report the baseline map, instruction files found/read, code paths, tests/commands actually checked, conflicts and blockers. Mark T00 `IMPLEMENTED_NEEDS_REVIEW`, then stop and wait for my explicit approval. Do not begin T00A.

## 1. Executive Decision

Build **KisanPool Fresh as a freshness-aware market and transport recommendation layer inside KisanPool v3**. Do not build a separate marketplace, a standalone chatbot, or a second transport-booking system.

When a farmer opens Fresh Produce, the system collects crop and harvest details, finds markets that can accept that crop, estimates driving distance and arrival time, obtains a transport cost quote using KisanPool's existing pricing/matching logic, estimates freshness-related commercial risk, and compares the expected net proceeds at each destination.

The primary recommendation is **Best Balanced Fresh Option**, selected from feasible options by giving equal weight to expected net proceeds and delivery suitability (time, and supported freshness risk when comparable data exists). It is not automatically the nearest market or the market with the highest listed price. Also show these alternatives separately: **Highest Net Proceeds**, **Fastest Feasible**, and **Closest Suitable**. They may point to the same market; do not force distinct winners. The algorithm and its limitations are specified in Section 25.

KisanPool Fresh is a recommendation layer, not a second booking/payment platform. Reuse existing KisanPool transport, booking, tracking, payment and payout services. A read-only quote/recommendation must never reserve a vehicle, create a booking or collect payment.

The backend owns calculations and decision rules. AI may help interpret farmer language and explain the computed result, but it must not invent market prices, vehicle availability, travel times, remaining shelf life, or profit figures.

## 2. Scope and Explicit Product Rules

### 2.1 In scope

1. A farmer-facing **Fresh Produce** entry point.
2. A crop and harvest-condition form.
3. Crop-specific freshness-risk estimation with explicit model version and limitations.
4. Nearby market discovery with crop compatibility, opening hours, market price, price date, source, and data confidence.
5. Actual route distance and estimated journey time to candidate markets.
6. Feasible vehicle lookup using KisanPool's verified-vehicle and available-capacity rules.
7. Market-by-market financial comparison and recommendation.
8. A read-only recommendation preview that creates no booking and collects no payment.
9. A selection action that continues into the existing KisanPool transport request, vehicle matching, payment, trip tracking, and proof-of-delivery flow.
10. Price-source, freshness-model, calculation, and recommendation audit records.
11. Unit, integration, end-to-end, and simulated-scenario tests.
12. Platform-wide vehicle incident reporting, replacement vehicle recovery, verified cargo handover, and per-leg settlement.
13. Partial sale recording and remaining-cargo comparison between selling at the current market and rerouting to another market. Farmer and transporter must both confirm a reroute before it is executed.
14. Explicit Codex task-by-task implementation, review and user-approval gates.

### 2.2 Not in scope for the first prototype

- Building a new payment gateway, wallet, transporter role, or booking lifecycle.
- Claiming that an AI result proves food safety or guarantees crop quality.
- Requiring IoT temperature sensors in every vehicle.
- Predicting a guaranteed future market price.
- Treating an indicative wholesale mandi price as a confirmed buyer offer.
- Applying a universal “tomato shelf life is 3–4 days” rule to every variety, ripeness stage, and storage condition.
- Claiming actual post-harvest loss reductions from synthetic data alone.
- Automatically committing a transport booking before the farmer approves the destination, quote, and vehicle option.

### 2.3 Non-negotiable product rules

1. Never show demo prices as live market prices.
2. Never rank an option as “Best Profit” from an expired price observation.
3. Never compare prices unless their units have been normalized.
4. Never claim a vehicle is available unless the existing backend reports a feasible vehicle or explicitly marks the result as an estimate.
5. Never create payments, bookings, or capacity reservations while calculating comparison cards.
6. Never let an LLM determine the final numeric price, ETA, transport quote, freshness score, saleable quantity, or net-proceeds value.
7. Never count the same quality loss twice in the financial formula.
8. If essential data is missing, show the missing field and lower confidence or decline to name a definitive winner.

---

## 3. Audit of the Existing KisanPool v3 Baseline

This specification is designed around the repository's existing documentation and the relevant v3 mandi screens. Review the full source file before changing its implementation; this section records the relevant findings used to design the extension.

### 3.1 Existing components to reuse

| Existing component | Evidence in v3 | Implementation decision |
|---|---|---|
| Expo mobile application with farmer and transporter roles | `README.md`, `docs/ARCHITECTURE.md`, `docs/PRD.md` | Add Fresh Produce to the existing farmer navigation; do not create a second app. |
| Mandi discovery and detail screens | `apps/mobile/app/(farmer)/mandis/index.tsx` and `apps/mobile/app/(farmer)/mandis/[id].tsx` | Reuse screen patterns, map/list components, destination selection, and navigation. |
| Mandi reference data | `apps/mobile/lib/mandis.ts` | Treat its values as demo/reference data unless each record is independently verified. Move market and price authority to the backend. |
| Transport request creation | `POST /transport/requests`, documented in `docs/API_CONTRACTS.md` | Use the existing flow after the farmer selects a recommendation. |
| Vehicle matching and cost calculation | `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/DATA_MODEL.md` | Reuse the existing server-side matching/pricing service; do not duplicate its pricing rules in mobile code. |
| Map and route display | `TripMap` and the existing maps/directions service documented by the repository | Reuse it to display route, distance, and ETA. Use route-provider outputs when available. |
| Existing payment and tracking lifecycle | `docs/API_CONTRACTS.md`, `docs/ARCHITECTURE.md` | Leave payment capture, booking confirmation, live tracking, delivery, and payout logic in their existing modules. |
| Backend AI integration | `docs/ARCHITECTURE.md` and the repository's AI rules | Use AI only for interpretation and explanations backed by structured server results. |

### 3.2 Current mandi-data limitation that must be fixed

`apps/mobile/lib/mandis.ts` describes its Maharashtra APMC market records and commodity price bands as demo/reference data. Its `CommodityPrice` structure contains crop, minimum, maximum, modal price, and trend, but does not itself carry a source URL, observation date, fetch time, source type, or explicit price unit.

Therefore, the existing values are useful for UI prototyping but **must not be used as confirmed current prices** in the Fresh recommendation engine. The first implementation task is to make source, unit, observation time, and demo/live status mandatory parts of the server-side price record.

The existing mandi UI can continue to display seeded examples in demo mode only when the card visibly labels them as **Simulated demo data**.

### 3.3 Architecture rule

The current repository's intended separation is: AI understands input; backend services decide; matching/pricing calculates; payment services settle; the database records the result; the frontend presents it. Fresh must preserve that separation.

---

## 4. Product Objective and Success Definition

### 4.1 User problem

A farmer may see two markets for the same crop. One is closer but offers a lower price. Another is farther away and offers a higher price. A distance-only or price-only recommendation can destroy value by ignoring transport expense, time, crop deterioration, market availability, and additional selling costs.

### 4.2 Product objective

For a given crop batch and pickup location, find feasible market-and-vehicle combinations, calculate estimated net proceeds for each, and recommend the option that provides the best expected economic outcome without hiding freshness or data uncertainty.

### 4.3 Primary success metric

**Balanced recommendation quality:** the percentage of test scenarios where Fresh selects the highest-scoring feasible option under the declared balanced profit/time policy and correctly respects hard deadlines, data eligibility and no-feasible-result rules. Evaluate economic regret and time trade-offs separately; do not evaluate correctness using net proceeds alone.

### 4.4 Product metrics

- Time from completed crop form to displayed recommendations.
- Percentage of recommendations with at least one feasible market and vehicle.
- Percentage of displayed market prices with source and observation timestamp.
- Percentage of recommended routes with an actual route-provider distance and ETA.
- Difference between recommended expected net proceeds and the best alternative in the test oracle.
- Percentage of completed trips with actual price, delivery time, quantity accepted, and reported quality outcome recorded.
- Percentage of recommendations that remain economically positive after actual costs are entered.
- Number of invalid recommendations caused by stale data, unit mismatch, missing buyer acceptance, or unavailable vehicles.

Do not claim crop-loss reduction until a field pilot compares a defined baseline with actual observed outcomes.

---

## 5. Farmer Journey and Required Screens

### Step 1 — Open Fresh Produce

The farmer taps **Fresh Produce** from the KisanPool farmer home or navigation.

The first screen shows:

- A short explanation: “Compare markets by expected money received after transport and selling costs.”
- The farmer's saved pickup location, editable before search.
- A crop selection action.
- Market preview cards only when their price/source status is clear. A preview card must not imply a final recommendation before crop quantity, harvest details, and transport requirements are known.

### Step 2 — Enter crop and harvest details

Required fields:

| Field | Type/unit | Validation |
|---|---|---|
| Crop | Selected crop key | Must be in the configured crop catalogue. First prototype supports tomato. |
| Quantity | Kilograms | Must be greater than zero. Convert entered tonnes/quintals to kg before calculation. |
| Harvest date and time | Local date-time | Must not be in the future. |
| Ripeness stage | Crop-specific enum | Required for crops whose freshness profile depends on maturity. Tomato stages must be defined in the crop profile, not free-text guessed by AI. |
| Storage since harvest | Enum: shaded/ambient/cool storage/unknown | Required. “Unknown” is valid but lowers freshness confidence. |
| Storage temperature | °C or “unknown” | Optional in MVP unless farmer can provide it; validate numeric range and record source as farmer-reported. |
| Pickup location | Latitude/longitude + display name | Required. Must be resolved to a real location. |
| Earliest pickup time | Local date-time | Required. Must not be before current time. |
| Desired selling/delivery deadline | Today / within 12 hours / within 24 hours / within 48 hours / custom deadline / flexible | Farmer preference used to filter or score delivery options. This is not a shelf-life estimate or food-safety guarantee. Convert selections into a precise deadline from the server's current time and market receiving hours. |
| Crop grade/variety | Selected option or “unknown” | Optional at first; improves price comparability when reliable data exists. |
| Packaging/handling state | Configured options | Optional in MVP; do not infer from a photo unless the result is explicitly labelled as a machine estimate. |

The system calculates elapsed time since harvest. Do not ask the farmer for the same value in both hours and date-time fields.

### Step 3 — Validate the crop and estimate freshness risk

The backend loads the crop profile matching crop, ripeness stage, and storage information. It returns:

- Freshness risk score and risk band, if the configured model has enough supported inputs.
- Estimated remaining commercial-quality window only if a reviewed, crop-specific profile supports that estimate.
- Primary risk factors, such as elapsed time since harvest, reported storage conditions, estimated route duration, or unknown handling history.
- Confidence and missing data.

The app must not return a fixed shelf-life number just because the crop is tomato. If the model cannot estimate a number reliably, show: **“Remaining shelf life cannot be estimated from the available information. Compare delivery time and freshness risk instead.”**

### Step 4 — Discover and filter markets

The backend obtains candidate markets within the configured search radius and filters them by:

- Crop acceptance/compatibility.
- Active operating status.
- Estimated arrival time relative to the market's receiving/operating hours, where those hours are verified.
- Availability of an applicable price observation.
- Feasible route and transport option.
- Any known buyer, grade, minimum quantity, or receiving restriction.

Initial search configuration: **100 km driving-distance radius**. If fewer than three suitable candidate markets are found, extend once to **200 km**. Keep both values in server configuration so the prototype can adjust them without code edits. The distance is route distance, not straight-line distance.

If the radius expansion is used, display that fact in the result metadata. A market is never considered suitable only because it is nearby.

### Step 5 — Estimate the route and vehicle cost

For each candidate market:

1. Request pickup-to-market route distance and estimated duration from the existing server-side maps/directions integration.
2. Find verified, available vehicles with sufficient spare capacity through the existing KisanPool matching rules.
3. Obtain a read-only transport-cost quote using the same server-side pricing service as the booking flow.
4. Record the quote source, quote time, route provider, route estimate type, vehicle capacity, and whether vehicle availability is live or simulated.

If the existing matching flow can only calculate costs after a request is created, refactor the domain logic into a reusable **side-effect-free quote/preview function**. It must not create a booking, claim capacity, create a payment order, or reserve a vehicle.

### Step 6 — Compare returns

Display a comparison table or cards including:

- Market name and distance.
- Estimated driving time and arrival time.
- Market's crop-specific modal/indicative price and its unit.
- Price date, source, and data-status badge.
- Available vehicle option(s), if found, and estimated farmer transport payment.
- Estimated saleable quantity or quality-loss scenario, when supported.
- Expected gross sale revenue.
- Transport, handling, market, packaging, and other applicable costs.
- **Expected net proceeds** and a range/scenario where inputs are uncertain.
- Freshness risk and confidence.
- A short explanation tied to the computed inputs.

The primary card is **Best Balanced Fresh Option**. Show **Highest Net Proceeds**, **Fastest Feasible**, and **Closest Suitable** separately. Cards may point to the same market. The primary card must show its profit score, delivery-suitability score, final balanced score, deadline status, and data warnings in concise farmer-friendly language.

### Step 7 — Choose a destination and confirm the transport option

The farmer can inspect the route on the map, select a market, choose a feasible vehicle quote, and continue to the existing KisanPool request flow. The app must disclose that market prices are indicative unless a buyer's offer has been explicitly confirmed.

The selection step is the first point at which Fresh creates or updates a real transport request. Payment happens through the existing flow and only according to its existing server-side payment confirmation rules.

### Step 8 — Track delivery and record actual outcome

During and after delivery, reuse existing trip tracking and proof-of-delivery flow. Add outcome fields or a related record for:

- Actual quantity dispatched.
- Quantity accepted/sold, where the farmer can provide it.
- Actual realized price per unit and price unit.
- Actual transport payment and additional fees.
- Pickup time and delivery time.
- Reported bruising, spoilage, downgrade, rejection, or unsold quantity.
- Whether the reported quality result was farmer-reported, buyer-confirmed, or operator-entered.

Use these observations to evaluate the model. Do not automatically retrain a model from unverified farmer entries without quality checks.

---

## 6. Financial Definitions and Required Formulas

Use the label **Expected net proceeds** in the farmer interface. It is the estimated money remaining from the sale after the expenses associated with selling and delivering this batch. It is not full farm-business profit because already-incurred cultivation costs are not necessarily included.

All internal calculations use:

- Currency: INR.
- Weight: kg.
- Unit price: INR/kg.
- Distance: km.
- Duration: minutes or hours, stored in a normalized representation.
- Money storage: integer paise where the existing payment/price architecture requires exact monetary values; do not use binary floating-point for payment amounts.

### 6.1 Normalize price units

The source record must preserve its original unit and the system must normalize prices to INR/kg before comparing markets.

| Source unit | Conversion to INR/kg |
|---|---|
| INR/kg | `pricePerKg = sourcePrice` |
| INR/quintal | `pricePerKg = sourcePrice / 100` |
| INR/tonne (metric tonne) | `pricePerKg = sourcePrice / 1000` |

Reject a market-price record when its unit is absent or unknown. Do not infer its unit from the magnitude of the number.

### 6.2 Estimate saleable quantity

When a reviewed crop profile or labelled scenario provides an expected rejected/unsaleable fraction:

`expectedSaleableKg = inputQuantityKg × (1 − expectedRejectFraction)`

`expectedRejectFraction` must be between `0` and `1`.

This formula covers only expected rejected/unsaleable quantity. If produce is sold at a lower grade/price rather than rejected, represent that with grade-specific expected prices or a price mixture. Do not also count the downgraded quantity as fully lost.

If no reviewed value exists, do not invent a loss fraction. Use a neutral baseline of zero *modelled loss* only for the financial comparison, label the freshness-loss estimate as unavailable, and do not claim the baseline means no real crop loss will occur. Synthetic demo scenarios may use explicit simulated loss rates marked as simulated.

### 6.3 Calculate gross sale revenue

`expectedGrossRevenueINR = expectedSaleableKg × expectedRealizedPriceINRPerKg`

For an official indicative market record with minimum, modal, and maximum prices:

- Base case: use modal price.
- Conservative scenario: use minimum price.
- Upper scenario: use maximum price.

Do not use the maximum price as the base case. The price range is a scenario range, not a statistical confidence interval unless the source defines it as such.

### 6.4 Total selling and delivery expenses

`totalOptionCostsINR = farmerTransportPayableINR + loadingINR + unloadingINR + packagingINR + marketFeesINR + commissionINR + incrementalCoolingINR + otherExplicitCostsINR`

Every item must have a source or explicit user/operator-entered value. If a fee is not known, record it as unknown; do not silently set it to zero in a high-confidence recommendation.

### 6.5 Expected net proceeds

`expectedNetProceedsINR = expectedGrossRevenueINR − totalOptionCostsINR`

Use this figure to compare markets for the same crop batch. Do not subtract costs that are identical and already incurred for every option unless the product explicitly presents full crop profit separately.

### 6.6 Incremental value of the farther market

For a farther market `F` compared with a nearer market `N`:

`incrementalBenefitINR = expectedNetProceedsF − expectedNetProceedsN`

If `incrementalBenefitINR > 0`, the farther market is estimated to leave the farmer with more proceeds. If it is below zero, the nearer alternative is estimated to be better under the modelled inputs.

### 6.7 Break-even price for a candidate market

For candidate market `F`, the minimum price at which it ties the current best alternative is:

`breakEvenPriceF = (bestAlternativeNetProceeds + candidateFNonPriceCosts) / candidateFExpectedSaleableKg`

This calculation is valid only when `candidateFExpectedSaleableKg > 0` and costs are defined consistently. Display it as an advisory value, not as a guaranteed price.

### 6.8 KisanPool transport quote

The booking flow's server-side pricing/matching service remains authoritative for the actual quote. The current v3 documentation describes cost based on route distance and vehicle rate, along with a 60/40 split in that flow. The Fresh implementation must call the **actual v3 service implementation** and use its returned farmer-payable amount; it must not reimplement or assume the split in the mobile client. If the service's current logic has evolved, the service response is the source of truth.

---

## 7. Fully Worked Example — 100 kg of Tomatoes

**All numbers in this example are illustrative assumptions for testing the calculator. They are not current market prices, transport quotes, or a prediction of actual tomato deterioration.**

Farmer input: 100 kg of tomatoes available at pickup.

| Input/result | Market A | Market B |
|---|---:|---:|
| Driving distance | 10 km | 60 km |
| Indicative selling price | ₹40/kg | ₹60/kg |
| Expected saleable quantity | 100 kg | 95 kg |
| Gross sale revenue | ₹4,000 | ₹5,700 |
| Farmer's transport cost | ₹300 | ₹900 |
| Handling and market fees | ₹100 | ₹150 |
| Total option costs | ₹400 | ₹1,050 |
| **Expected net proceeds** | **₹3,600** | **₹4,650** |

Calculation:

- Market A: `(100 × ₹40) − ₹300 − ₹100 = ₹3,600`.
- Market B: `(95 × ₹60) − ₹900 − ₹150 = ₹4,650`.
- Market B advantage: `₹4,650 − ₹3,600 = ₹1,050`.

**Decision:** Under these assumptions, recommend Market B as Best expected net proceeds, provided it accepts the crop, the journey is feasible within the configured freshness policy, and the price/transport inputs meet the recommendation's data-confidence requirements.

Do not make the same recommendation if the actual market price has expired, no suitable vehicle is available, the market cannot accept the batch, or the journey exceeds a validated quality constraint.

### 7.1 How to decide when the price premium is not enough

A higher price does not win automatically. The ranking uses net proceeds. A farther market loses when the additional revenue is smaller than its additional delivery/selling costs and modelled quality-related reduction.

Example: if Market B's price fell, its transport cost increased, or its expected saleable quantity decreased enough that its net proceeds fell below ₹3,600, Market A would be the better recommendation for this example.

---

## 8. Market Price and Market-Availability Data Strategy

### 8.1 Approved data-source hierarchy

1. **Confirmed buyer quote**, when the buyer, quantity, grade, quote time, and acceptance conditions are recorded and verifiable.
2. **Official mandi price observation** from a configured government source, with market, crop, date, min/modal/max values, and unit preserved.
3. **Operator-maintained indicative price**, with an explicit source, valid date, operator identity, and indicative status.
4. **Demo/synthetic data**, which is permitted only in demo mode and must be visibly labelled.

A source with a higher rank is not automatically usable if it is too old or does not match the crop grade/unit/market. Source-specific freshness and compatibility rules still apply.

### 8.2 Candidate official sources

- [Open Government Data Platform — Current daily prices of commodities in various mandis](https://data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi). The catalogue attributes the dataset to AGMARKNET and describes daily wholesale minimum, maximum, and modal prices.
- [eNAM — Mandi trade details](https://www.enam.gov.in/web/dashboard/trade-data). The dashboard exposes state, APMC, commodity, date range, min/modal/max price, arrivals, quantity traded, unit, and date fields.
- [eNAM — Historical trade data](https://www.enam.gov.in/web/dashboard/Historical). Use for historical inspection where accessible.

These are candidate sources, not a claim that a stable public API is already integrated into KisanPool v3. During implementation, verify current access method, credentials, field schema, redistribution/reuse terms, refresh limits, and error behaviour. Encapsulate each source behind an adapter so a provider change does not change the recommendation algorithm.

### 8.3 Price update and status policy

Implement the following initial policy as server configuration and log it with each recommendation:

- **Recent:** observation age is at most 24 hours.
- **Stale:** age is over 24 hours and at most 72 hours. It may be shown as contextual information, but the option must carry a stale-data warning and lower confidence.
- **Expired for Best-Profit ranking:** age is over 72 hours. Do not use this price alone to name a definitive Best expected net proceeds market. Show it as historical information only or ask for a confirmed quote.
- **Unknown timestamp/unit/source:** do not use it as a current-price input.

This is a product policy for the prototype, not an official definition of price freshness. Make thresholds configurable. Record both `observedAt` (when the underlying market observation applies) and `fetchedAt` (when KisanPool retrieved it); these are not interchangeable.

### 8.4 Demand and market acceptance

A demand label is not the same as a confirmed buyer. Keep the following concepts separate:

- `marketAcceptsCrop`: market or buyer's configured commodity compatibility.
- `marketOpenAtArrival`: arrival time is within verified receiving hours.
- `buyerOfferStatus`: unknown, indicative, or confirmed.
- `demandSignal`: source-backed arrivals/quantity-traded trend, or explicitly labelled operator assessment.
- `quantityLimitKg`: configured limit, if supplied by the market or buyer.

Do not infer “will purchase 100 kg” from a high demand label.

### 8.5 Data adapter contract

Each price-source adapter returns a normalized observation with:

- `marketId` or a verified market identity mapping.
- `sourceMarketName`.
- `cropKey`, commodity name as received, and grade/variety if available.
- `sourceMinPrice`, `sourceModalPrice`, `sourceMaxPrice`.
- `sourcePriceUnit`.
- `minPriceINRPerKg`, `modalPriceINRPerKg`, `maxPriceINRPerKg`.
- `observedAt`, `fetchedAt`.
- `sourceName`, `sourceUrl`, `sourceType`, `sourceRecordId` if available.
- `dataStatus` and validation errors.

Do not discard original source values during normalization; they are required for audit and debugging.

---

## 9. Freshness and Shelf-Life Model

### 9.1 Evidence rule

The National Horticulture Board's post-harvest manual describes tomato handling and storage requirements that vary by maturity stage and conditions and notes susceptibility to bruising. This is sufficient reason **not** to use one universal shelf-life number for all tomatoes. Storage recommendations in a manual are not, by themselves, a validated prediction of remaining transport shelf life for a specific farmer's batch.

Source: [NHB — Post-Harvest Handling of Fruits and Vegetables (storage manual)](https://nhb.gov.in/documents/storage-manual.pdf).

### 9.2 First prototype behaviour

Start with an explainable, crop-specific **freshness-risk estimate** rather than a generative AI claim about exact days remaining.

For tomato, the model should take these inputs when available:

- Harvest timestamp and elapsed time.
- Ripeness/maturity stage.
- Reported storage condition and temperature, including whether temperature is unknown.
- Planned route duration and the gap between pickup time and predicted arrival.
- Packaging/handling condition, including reported bruising or rough handling.
- Crop profile/model version and the quality of each input.

The backend returns a numeric risk score only when the crop profile and required inputs are available. Otherwise, it returns a risk state of `INSUFFICIENT_DATA`, lists the missing inputs, and avoids a fabricated score.

### 9.3 Configurable score

For the first simulated prototype, use the following documented design weights. They are **initial engineering assumptions**, not scientifically validated weights; store them in a versioned crop profile and replace them after reviewing horticultural guidance and field observations.

`freshnessRiskScore = 0.30 × ripenessRisk + 0.25 × elapsedTimeRisk + 0.25 × temperatureExposureRisk + 0.15 × routeDurationRisk + 0.05 × handlingRisk`

Each component must be normalized to a number from 0 to 100 by a versioned crop-specific rules table. If a required component is unavailable, do not silently assign it zero; mark the score `INSUFFICIENT_DATA` or apply an explicitly documented missing-input policy and lower confidence.

Initial interface bands (product-design thresholds that require pilot validation):

- `0–34`: Lower estimated risk.
- `35–64`: Moderate estimated risk.
- `65–100`: Higher estimated risk.

These bands describe the model output, not a guaranteed percentage of spoilage.

### 9.4 Remaining-quality window

A numeric `estimatedLatestArrivalAt` may be returned only if a crop-specific time-window table has been reviewed and approved for the relevant maturity and storage conditions. The table must include source, unit, applicability, review date, and model version.

If the configured profile does not support a reliable time-window estimate, return `null` for the numeric window and show the risk factors. Never default all tomatoes to “3–4 days” remaining.

### 9.5 No sensors required for MVP

Do not make the first release dependent on vehicle temperature sensors. The farmer-reported storage category is sufficient to run the initial form and demonstration, but the UI must distinguish reported information from sensor-measured information. If live weather or temperature feeds are added later, store provider and timestamp and do not equate weather-station air temperature with the temperature inside the crop packaging.

### 9.6 AI responsibility

AI may:

- Convert a farmer's Marathi/Hindi/English utterance into structured crop-form fields for user confirmation.
- Explain the backend's ranked options in simple language.
- Summarize why a route or market received higher risk.

AI must not:

- Produce price values without a returned market-price record.
- Estimate market acceptance without a matching record.
- choose its own transport price or vehicle availability.
- Invent shelf-life values or reject percentages.
- Override backend feasibility filters.
- Write a booking or payment directly.

---

## 10. Recommendation Algorithm

### 10.1 Input object

```ts
type FreshRecommendationInput = {
  cropKey: string;
  quantityKg: number;
  harvestedAt: string;          // ISO 8601 date-time
  ripenessStage: string;
  storageCondition: 'SHADE' | 'AMBIENT' | 'COOL_STORAGE' | 'UNKNOWN';
  storageTemperatureC?: number;
  cropGrade?: string;
  cropVariety?: string;
  pickup: { name: string; lat: number; lng: number };
  earliestPickupAt: string;     // ISO 8601 date-time
  desiredArrivalBy?: string;    // ISO 8601 date-time
  searchRadiusKm?: number;      // server default: 100
};
```

Validate date-time zones and normalize to UTC for storage. Preserve the farmer's local display zone. Validate coordinates and reject non-finite values. Crop name aliases must resolve to one canonical `cropKey`.

### 10.2 Stage A — Normalize and validate

1. Normalize quantity to kg.
2. Resolve the crop to a canonical profile.
3. Calculate `elapsedSinceHarvestHours` from server time and `harvestedAt`.
4. Validate `harvestedAt <= now`, `earliestPickupAt >= now`, and `quantityKg > 0`.
5. Load freshness-model profile and model version.
6. Determine which inputs are farmer-reported, source-provided, calculated, or missing.

If invalid, return a field-level validation error. Do not run recommendations on an invalid crop quantity, unknown crop, or invalid coordinate.

### 10.3 Stage B — Generate market candidates

1. Load active market records within the configured radius from the farmer's pickup location.
2. Match canonical crop key and grade/variety requirements where known.
3. If fewer than three candidate markets remain within 100 km, repeat once with 200 km.
4. Compute actual driving route distance and estimated duration for each candidate.
5. Estimate arrival time as `earliestPickupAt + routeDuration + configured pickup/loading buffer + configured market unloading buffer`.
6. Exclude a market if verified receiving hours make arrival impossible, or if the crop is not accepted.
7. Keep a candidate with an unverified acceptance or stale price only as a cautionary/alternative card; do not rank it as definitive Best Profit.

Buffers must be server-configurable and shown as estimates; do not hide them inside an unexplained ETA.

### 10.4 Stage C — Get a transport quote without creating a booking

For each surviving market:

1. Call the existing matching/vehicle domain service in preview mode.
2. Require a verified vehicle, `AVAILABLE` status, sufficient spare capacity, and required booking time compatibility according to the actual v3 service rules.
3. Get route distance and vehicle price from the existing source of truth.
4. If shared transport is involved, request the computed farmer-payable allocation for this farmer's load; do not infer a cost split in the app.
5. If no feasible vehicle exists, mark the option `NO_VEHICLE_AVAILABLE`. Do not show it as a bookable recommendation.
6. Do not reserve the vehicle or decrement capacity at preview time.

### 10.5 Stage D — Determine price and confidence

For each market candidate:

1. Select a price record for the same crop and compatible unit/grade.
2. Normalize the source minimum/modal/maximum price to INR/kg.
3. Apply the configured 24-hour and 72-hour price-age rules.
4. Store the selected price record ID in the recommendation snapshot.
5. Mark the option's price as `CONFIRMED_BUYER_OFFER`, `OFFICIAL_INDICATIVE`, `OPERATOR_INDICATIVE`, or `SIMULATED`.
6. If the observation has expired or has no explicit unit, it cannot be the basis for a definitive Best-Profit recommendation.

### 10.6 Stage E — Estimate crop outcome and financial results

For each feasible market-and-transport combination:

1. Compute freshness risk from the versioned crop profile, if supported.
2. Compute expected saleable quantity only when the profile or demo scenario supplies a defensible reject-rate assumption.
3. Calculate conservative, base, and upper revenue scenarios from minimum, modal, and maximum prices.
4. Add farmer-payable transport and all known incremental handling/selling expenses.
5. Calculate expected net proceeds and scenario values.
6. Preserve an `unknownCostItems` list. Unknown material costs lower confidence; they must not be silently treated as zero for a high-confidence decision.
7. Record the exact source and version for every input used by the calculation.

### 10.7 Stage F — Feasibility and balanced ranking

A market option is **fully feasible** only when the crop is accepted (or a clearly labelled, non-definitive alternative is being shown), the receiving-time check passes when verified hours exist, a valid road-route estimate exists, the existing matching service returns a feasible vehicle quote, price units/source/date pass the configured policy for definitive ranking, and any configured crop-specific hard constraints are satisfied. A missing freshness score is not automatically a failed route; it means freshness risk is unknown and must be disclosed. Do not invent a numeric score or shelf-life.

First apply **hard constraints** (market/crop compatibility, strict delivery deadline, route availability, feasible vehicle/capacity, valid price eligibility for the definitive ranking). Only then apply scores. Do not let a high score override infeasibility.

#### Profit score

Let `N_i` be the estimated net proceeds for feasible option `i` under the same price scenario and cost definitions. If the highest eligible `N_i` is positive:

`profitScore_i = clamp(100 * max(0, N_i) / maxPositiveNetProceeds, 0, 100)`

If every option has `N_i <= 0`, return a clear `NO_POSITIVE_RETURN_ESTIMATE` warning. Do not describe any option as profitable; display alternatives with their loss/negative proceeds and let the farmer decide whether transport is still necessary. If all options have the same positive value, their profit scores are equal. Monetary values used for payment/settlement must use the repository's exact-money conventions, not binary floating-point.

#### Delivery-time score

`T_i` is end-to-end estimated time from the current pickup/decision location, including configured and disclosed loading/unloading/market buffers. `W` is time available until the farmer's selected delivery deadline, calculated by the backend.

For a strict deadline, options with `T_i > W` are ineligible for the primary recommendation. For eligible options:

`timeScore_i = clamp(100 * (1 - T_i / W), 0, 100)`

For a flexible/no-deadline input, use the configured relative-time rule `timeScore_i = 100 * (T_min / T_i)` across feasible options, with explicit handling for zero/invalid duration and one-option cases. Store the ranking policy version. Do not silently change formulas between candidates in one result.

#### Freshness component and final balanced score

If every candidate being compared has a supported, comparable freshness-risk score from the same reviewed crop-profile/model version, calculate:

`deliverySuitabilityScore_i = 0.7 * timeScore_i + 0.3 * (100 - freshnessRiskScore_i)`

If one or more candidates lack a comparable valid risk score, use `deliverySuitabilityScore_i = timeScore_i` for all candidates in that comparison and return a warning that freshness risk could not be consistently scored. Never give an unknown risk a fake zero-risk score.

`balancedScore_i = 0.5 * profitScore_i + 0.5 * deliverySuitabilityScore_i`

The 50/50 profit-vs-delivery balance and the optional 70/30 time-vs-supported-freshness blend are initial, configurable product choices—not scientifically validated weights. Record the policy version and evaluate the choices through deterministic test scenarios and, later, field outcomes. Explain the score in the UI without implying guaranteed earnings or crop survival.

#### Recommendation types

1. `BEST_BALANCED`: highest balanced score among fully eligible candidates.
2. `HIGHEST_NET_PROCEEDS`: greatest estimated net proceeds among price-eligible, transport-feasible alternatives, separately labelled and with uncertainty visible.
3. `FASTEST_FEASIBLE`: lowest end-to-end ETA among feasible candidates.
4. `CLOSEST_SUITABLE`: shortest actual road distance among suitable candidates.

The same market may occupy multiple slots. Do not force four different markets. Keep the earlier financial near-tie indicator (within the larger of ₹100 or 3% of the higher estimate) as a separate explanation; it does not replace the balanced ranking. If the score difference is within a configurable near-tie threshold, show the options as close alternatives and explain the numeric differences. If missing/stale prices, material unknown costs, or uncertainty prevent a defensible comparison, state that the winner is uncertain instead of claiming confidence. If no market is fully feasible, return `NO_FEASIBLE_MARKET`; if no positive option exists, also include `NO_POSITIVE_RETURN_ESTIMATE`.

### 10.8 Pseudocode

```text
function recommendFreshOptions(input):
    validated = validateAndNormalize(input)
    cropProfile = getVersionedCropProfile(validated.cropKey)

    candidates = findMarkets(validated.pickup, radius=100 km)
    candidates = filterByCropCompatibility(candidates, validated.cropKey, validated.cropGrade)

    if count(candidates) < 3:
        candidates = mergeDistinct(candidates,
            findMarkets(validated.pickup, radius=200 km))
        candidates = filterByCropCompatibility(candidates, validated.cropKey, validated.cropGrade)

    options = []
    for market in candidates:
        route = getDrivingRoute(validated.pickup, market.location)
        if route unavailable:
            addNonBookableOptionReason(market, ROUTE_UNAVAILABLE)
            continue

        arrival = estimateArrival(validated.earliestPickupAt, route.duration,
                                  configuredLoadingBuffer, configuredUnloadingBuffer)
        if not cropAccepted(market, validated.cropKey):
            continue
        if knownReceivingHoursConflict(market, arrival):
            continue

        quote = matchingService.previewQuote(validated, market, route)
        if quote has no feasible verified vehicle:
            addNonBookableOptionReason(market, NO_VEHICLE_AVAILABLE)
            continue

        price = getCompatiblePriceObservation(market, validated.cropKey,
                                              validated.cropGrade)
        priceStatus = validatePriceAgeUnitAndSource(price)

        freshness = freshnessService.estimate(validated, route, cropProfile)
        saleableKg = estimateSaleableKgOrMarkUnavailable(validated.quantityKg,
                                                         freshness, cropProfile)

        financials = calculateScenarioNetProceeds(
            saleableKg, price, quote.farmerPayableAmount, knownOptionCosts)

        options.append(makeAuditableOption(
            market, route, arrival, quote, price, freshness, financials, priceStatus))

    definitive = filterFullyFeasibleAndPriceEligible(options)
    scored = scoreProfitAndDeliverySuitability(definitive, validated.deliveryPreference,
                                               configuredRankingPolicy)
    rankedBalanced = sortByBalancedScoreDescending(scored)
    rankedNet = sortByExpectedNetProceedsDescending(definitive)
    return buildFourRecommendationTypes(rankedBalanced, rankedNet, options,
                                        explicitWarningsAndNoPositiveReturnState)
```

Pseudocode describes intended behaviour. Implement it in the existing server module structure and adapt service names to the actual v3 source files.

---

## 11. Backend Architecture and Integration

### 11.1 Proposed responsibility boundaries

| Module/service | Responsibility |
|---|---|
| `fresh` or `recommendations` module | Input validation, candidate generation orchestration, recommendation snapshot, result explanation data. |
| `markets` data service | Canonical market records, crop compatibility, hours, market status, source provenance. |
| `marketPrices` adapters/service | Fetch/import official data, normalize source units, store observations, apply age/source policy. |
| `cropProfiles` service | Versioned crop/variety/maturity profiles and reviewed configuration. |
| `freshness` service | Deterministic risk/window calculation and missing-input handling. |
| Existing maps/directions service | Driving distance, travel duration, route polyline where available. |
| Existing matching/pricing service | Read-only feasible-vehicle preview and farmer-payable quote. |
| Existing transport module | Create the real request only after the farmer selects an option. |
| Existing payments module | Existing checkout, webhook, booking confirmation, refund and payout rules. |
| Existing realtime/tracking module | Existing trip location/status updates after booking. |

### 11.2 Request flow

```text
Expo Fresh Form
    -> POST /fresh/recommendations
        -> validate inputs and resolve crop profile
        -> get candidate markets and market-price observations
        -> get driving routes and arrival estimates
        -> call matching/pricing preview (read-only)
        -> calculate freshness risk and net proceeds
        -> rank feasible options
        -> save auditable recommendation snapshot
    <- ranked options + data status + reasons + scenario values

Farmer selects option
    -> POST /fresh/recommendations/:id/select
        -> validate recommendation ownership and expiry
        -> revalidate market price / route / vehicle quote as required
        -> create or prefill existing TransportRequest flow
        -> return existing transport request ID
    -> existing vehicle match / checkout / confirmed booking / live tracking
```

### 11.3 Maps and route calculation

Use the existing maps service where possible. Google Routes API documentation describes `computeRoutes` for route details and `computeRouteMatrix` for multiple origin-destination pairs; route responses can supply driving distance and duration. Source: [Google Routes API documentation](https://developers.google.com/maps/documentation/routes/compute_route_directions).

Do not use straight-line distance as the final travel distance in the net-proceeds recommendation. If the production route provider is unavailable, the interface may show a separately labelled rough distance estimate, but that option must not be presented as a verified route-based Best-Profit result.

### 11.4 Price-cache behaviour

- Cache source observations so repeated farmer searches do not refetch the same commodity-market observation unnecessarily.
- Refresh market data according to the source's permitted update rate and observed dataset cadence.
- Store provider errors and `fetchedAt` so a stale cache is distinguishable from a successful fresh fetch.
- The response must report cache/source age.
- A source outage must not convert a stale price into a “current” price.

### 11.5 Do not duplicate transport pricing

Create or expose a pure service function that accepts a route, vehicle, and request attributes and returns the same quote structure used by booking. The preview path must be side-effect free. The selection path may invoke the existing request-creation and reservation lifecycle only after farmer confirmation.

---

## 12. API Contract Proposal

Follow the repository's response envelope and authentication conventions. The following route names are proposed for the implementation; check the actual v3 router registration before adding them.

### 12.1 `GET /fresh/crops`

Purpose: return supported crop profiles and the valid form enums.

Response fields:

- `cropKey`, `displayName`, `aliases`.
- Supported ripeness stages and storage-condition options.
- Whether shelf-window estimation is supported for the current profile.
- `profileVersion`, `updatedAt`.

### 12.2 `POST /fresh/recommendations`

Purpose: calculate and save an auditable recommendation snapshot without booking or reserving a vehicle.

Request example:

```json
{
  "cropKey": "tomato",
  "quantityKg": 100,
  "harvestedAt": "2026-10-24T04:30:00+05:30",
  "ripenessStage": "TURNING",
  "storageCondition": "SHADE",
  "pickup": {
    "name": "Farmer pickup point",
    "lat": 19.90,
    "lng": 74.50
  },
  "earliestPickupAt": "2026-10-24T16:30:00+05:30",
  "desiredArrivalBy": "2026-10-24T21:00:00+05:30",
  "searchRadiusKm": 100
}
```

The example coordinates and times are test values only. Production callers must submit resolved coordinates and the farmer's actual crop data.

Response fields:

- `recommendationId`, `generatedAt`, `expiresAt`.
- `inputSummary`, `cropProfileVersion`, `freshnessModelVersion`.
- `pricePolicyVersion`, `rankingPolicyVersion`.
- `recommendations.bestBalanced`, `recommendations.highestNetProceeds`, `recommendations.fastestFeasible`, `recommendations.closestSuitable`.
- `options[]` with market, price/source/date/unit, route distance/ETA, arrival time, transport quote, freshness risk/window if supported, expected saleable quantity if supported, revenue/cost breakdown, net-proceeds scenarios, confidence, eligibility, and reasons.
- `warnings[]` and `missingData[]`.

### 12.3 `GET /fresh/recommendations/:id`

Purpose: retrieve the saved snapshot for the owner, including exactly which inputs and price observations produced it. Do not silently recompute historical values when reading a saved recommendation.

### 12.4 `POST /fresh/recommendations/:id/select`

Purpose: select one option and continue into the existing transport flow.

Request:

```json
{
  "optionId": "option_market_b_vehicle_1",
  "acknowledgedWarnings": ["INDICATIVE_PRICE_NOT_BUYER_GUARANTEE"]
}
```

Before creating the request, verify that the recommendation belongs to the authenticated farmer, has not expired, and the option can still be booked. Recompute or refresh volatile route/vehicle quotes and clearly return changed values for user confirmation when materially different. Do not debit money from this endpoint.

### 12.5 Proposed error codes

Use the project's existing error envelope and error registry conventions. Add equivalent codes only if matching existing v3 codes is not appropriate.

- `FRESH_INVALID_INPUT`
- `FRESH_UNKNOWN_CROP`
- `FRESH_NO_MARKET_CANDIDATES`
- `FRESH_NO_FEASIBLE_MARKET`
- `FRESH_PRICE_DATA_UNAVAILABLE`
- `FRESH_PRICE_UNIT_UNKNOWN`
- `FRESH_PRICE_EXPIRED`
- `FRESH_ROUTE_UNAVAILABLE`
- `FRESH_NO_VEHICLE_AVAILABLE`
- `FRESHNESS_MODEL_INSUFFICIENT_DATA`
- `FRESH_RECOMMENDATION_EXPIRED`
- `FRESH_OPTION_UNAVAILABLE`
- `FRESH_SELECTION_REQUIRES_RECONFIRMATION`

Do not return success-shaped fake values after a provider failure. Return a clear error or a clearly labelled partial result.

---

## 13. Data Model Proposal

Use Mongoose models in the existing server. Confirm the current model naming and enums before coding; these are logical fields, not a command to duplicate existing models.

### 13.1 Market

| Field | Purpose |
|---|---|
| `marketKey` | Stable internal identifier. |
| `name`, `district`, `state` | Display and geographic grouping. |
| `location.lat`, `location.lng` | Map position. |
| `marketType` | `APMC`, `BUYER`, or `COLLECTION_CENTER`. |
| `acceptedCropKeys[]` | Known supported crops. |
| `acceptedGrades[]` | Optional grade restrictions. |
| `openingHours` / `receivingWindows` | Structured local-time schedule with timezone. |
| `active` | Whether included in search. |
| `quantityConstraints` | Minimum/maximum accepted quantity where verified. |
| `dataSourceType`, `dataSourceUrl`, `lastVerifiedAt` | Provenance. |
| `createdAt`, `updatedAt` | Audit timestamps. |

### 13.2 MarketPriceObservation

| Field | Purpose |
|---|---|
| `marketId` | Canonical market reference. |
| `cropKey`, `sourceCommodityName` | Crop identity and original name. |
| `grade`, `variety` | Optional price-comparison scope. |
| `sourceMinPrice`, `sourceModalPrice`, `sourceMaxPrice` | Original source values. |
| `sourcePriceUnit` | Explicit source unit; required. |
| `minPriceINRPerKg`, `modalPriceINRPerKg`, `maxPriceINRPerKg` | Normalized values. |
| `currency` | `INR` for supported Indian-market records. |
| `observedAt` | Date/time the quote or observation applies to. |
| `fetchedAt` | Date/time KisanPool retrieved it. |
| `sourceType` | `OFFICIAL`, `CONFIRMED_BUYER`, `OPERATOR_INDICATIVE`, or `SIMULATED`. |
| `sourceName`, `sourceUrl`, `sourceRecordId` | Provenance. |
| `dataStatus` | `VALID`, `STALE`, `EXPIRED`, or `INVALID`. |
| `validationErrors[]` | Unit, identity, date, or range validation issues. |

Validation: minimum must not exceed modal; modal must not exceed maximum, unless a source-specific documented exception exists. Values must be non-negative and have explicit units. Preserve the raw source fields.

### 13.3 CropProfile

| Field | Purpose |
|---|---|
| `cropKey`, `displayName`, `aliases[]` | Canonical crop identity. |
| `supportedRipenessStages[]` | Valid form choices. |
| `storageGuidance` | Source-linked, maturity-specific storage information where supported. |
| `riskComponentRules` | Versioned normalization rules for freshness-risk components. |
| `riskWeights` | Initial weighting configuration and version. |
| `qualityWindowRules` | Reviewed time-window parameters where evidence supports them. |
| `rejectRateRules` | Reviewed scenario values, if evidence supports a quantitative estimate. |
| `sourceReferences[]` | Sources and scope of applicability. |
| `reviewStatus`, `reviewedBy`, `reviewedAt` | Prevent unreviewed configuration from being treated as validated. |
| `version`, `active` | Model/config version. |

For the first prototype, include tomato. Do not invent values for other crops. A crop may be selectable only if the supported fields and rules are implemented.

### 13.4 FreshRecommendation snapshot

Store:

- `farmerId` and a recommendation ID.
- Normalized farmer input and reported-data provenance.
- `generatedAt`, `expiresAt`, and status.
- Referenced market-price observation IDs and copied displayed values.
- Route provider, distance, duration, route estimate type, and fetch time.
- Transport quote ID or snapshot, including farmer-payable amount and quote time.
- Crop-profile, freshness-model, pricing-policy, and ranking-policy versions.
- All candidate options, calculations, confidence, warnings, and reasons.
- Selected option and link to the resulting existing transport request, if selected.

The snapshot is immutable for audit. A later fetch of the same recommendation must not replace the old market price with a new one.

### 13.5 Delivery outcome record

Link to the existing transport request/trip and record observed pickup/delivery times, actual selling price/unit, quantities accepted/rejected, reported quality outcome, additional actual costs, and evidence source. Keep farmer-reported and buyer/operator-confirmed values distinguishable.

### 13.6 Indexes

Add indexes appropriate to query patterns:

- Market geospatial index on location.
- Market compound lookup on `marketId`, `cropKey`, `observedAt`.
- Recommendation ownership lookup on `farmerId`, `generatedAt`.
- Unique provider record IDs where the provider offers a stable identifier.
- Outcome lookup by transport request/trip ID.

Create indexes only after checking existing index names and data. Do not duplicate indexes already declared in current schemas.

---

## 14. Mobile UI Requirements

### 14.1 Recommendation card layout

Each card must show, in this order:

1. Recommendation type badge: Best Balanced Fresh Option, Highest Net Proceeds, Fastest Feasible, or Closest Suitable.
2. Market name.
3. Expected net proceeds in INR, with “estimated” language where applicable.
4. Gross sale revenue and a concise cost breakdown.
5. Price per kg and its original source unit if useful for transparency.
6. Price observation date and source/status.
7. Driving distance and estimated time to arrival.
8. Vehicle/transport quote status.
9. Freshness-risk band, or “insufficient data to estimate.”
10. One or two reasons tied to computed fields.
11. Warnings for stale price, unconfirmed buyer, or missing cost data.
12. A destination-selection action.

### 14.2 Comparison display

Provide a table/list view and a map view. Map proximity alone must not visually imply profitability. Keep financial ranking visible in the list, even when the user opens the map.

### 14.3 Low-literacy and multilingual support

- Keep labels short and use consistent farmer-facing terms.
- Support the app's existing language preferences.
- Present rupees, kilograms, kilometres, and hours/minutes with explicit units.
- Explain “expected net proceeds” as “estimated money remaining after transport and selling costs.”
- Allow optional voice entry, but read the parsed values back to the farmer for confirmation before recommendations are calculated.

### 14.4 Accessibility and error states

- Do not encode status by colour alone; add text/icon.
- Add skeleton/loading states while market and route data load.
- Distinguish “no market found,” “no vehicle found,” “price unavailable,” and “service unavailable.”
- If the map fails, retain the comparison list and numeric route summary when available.
- Keep the last saved form data so a transient provider error does not force the farmer to re-enter everything.

---

## 15. Implementation Plan by Phase

The following phases are ordered so the team can test the business logic before wiring every external integration.

### Phase 0 — Baseline audit and interface contract

- Read the current v3 versions of `README.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/DATA_MODEL.md`, `apps/mobile/lib/mandis.ts`, and the existing mandi screens.
- Locate the actual v3 router registrations, model definitions, matching service, pricing service, maps service, seed data, and test harness.
- Record which of the mandi, market-price, routes, and matching functions are real integrations versus seeded/demo data.
- Write the API and schema change list before implementation.
- Confirm the current transport quote service and do not change its payment semantics.

**Exit criterion:** every proposed code change has an identified existing integration point or a documented new module.

### Phase 1 — Typed crop and market data contracts

- Add a canonical crop key and tomato ripeness-stage enum.
- Add `MarketPriceObservation` with explicit unit, source, observed time, fetched time, and simulated/live state.
- Move market data used for authoritative calculations out of mobile-only literals and into backend seed/configuration or a provider-backed service.
- Mark all existing static price values as `SIMULATED` or `REFERENCE`, unless independently verified.
- Add a price-normalization utility with unit tests.

**Exit criterion:** no calculation can consume a market price without an explicit unit and source status.

### Phase 2 — Read-only market and transport preview services

- Implement market candidate discovery.
- Integrate route distance and time through the existing maps service.
- Refactor/expose a side-effect-free transport quote preview using the existing server-side matching/pricing calculation.
- Validate vehicle KYC, status, capacity, and timing constraints in the backend.
- Ensure preview requests create no bookings, payments, capacity claims, or notifications that imply a confirmed trip.

**Exit criterion:** one API/service test can compare two markets and return route and transport quote data without changing booking-related database state.

### Phase 3 — Freshness-risk and financial engine

- Implement versioned tomato profile and risk rules.
- Keep unknown or unreviewed freshness parameters unavailable rather than inventing a shelf-life duration.
- Implement saleable quantity, gross revenue, cost breakdown, net proceeds, and scenario ranges.
- Implement feasibility filtering, ranking, tie handling, confidence, and explanation reasons.
- Save immutable recommendation snapshots with source/model versions.

**Exit criterion:** deterministic tests prove the same input snapshot returns the same calculations and ordering.

### Phase 4 — Farmer Fresh screens

- Add Fresh Produce entry point.
- Add crop form with validation and local-language labels.
- Add recommendation cards, comparison list, route/map preview, market detail, and warning states.
- Render current/indicative/simulated price states distinctly.
- Keep the interface functional when the map or market data provider is unavailable.

**Exit criterion:** farmer can enter a batch and see market options with costs, net proceeds, source timestamps, warnings, and a reason for the ranking.

### Phase 5 — Selection and existing booking integration

- Add option selection and price/quote revalidation.
- Require user reconfirmation if volatile values change materially since recommendations were generated.
- Create the real transport request using the existing destination, crop, quantity, pickup, timing, and selected quote flow.
- Continue into existing match, payment, booking, tracking, and delivery lifecycle.
- Record the selected recommendation ID on the resulting request or link through the recommendation snapshot.

**Exit criterion:** the selected option creates one normal KisanPool transport flow, with no duplicate booking or payment path.

### Phase 6 — Market data importer and data-quality controls

- Implement an adapter for one approved price source after access and terms are verified.
- Store raw source records and normalized records.
- Handle schema changes, missing values, duplicate imports, source downtime, and out-of-order observations.
- Provide an operator-maintained fallback for demo markets and clearly label it as indicative or simulated.
- Add a data-quality status view or operational report for failed imports and expired prices.

**Exit criterion:** a provider outage cannot make old prices appear current, and imported prices preserve original unit/source/date.

### Phase 7 — Evaluation, hardening, and demo preparation

- Run unit, integration, concurrency, API contract, and mobile end-to-end tests.
- Execute the 100 kg tomato two-market scenario below, plus negative and edge cases.
- Compare Fresh against closest-market-only and highest-listed-price-only baselines using the same data, then evaluate net-proceeds regret and delivery-time trade-offs.
- Record the exact dataset, random seed (for synthetic data), assumptions, and calculation results.
- Verify that the app never displays simulated prices as real, never invents a remaining shelf-life value, and never books during preview.

**Exit criterion:** all release acceptance criteria in Section 18 pass and the demo's actual data/status is visible on screen.

---

## 16. Repository Change Map

These are proposed change areas, not confirmed existing filenames for every new service. Check each v3 path before creating or editing files.

| Area | Intended work |
|---|---|
| `apps/mobile/app/(farmer)/...` | Add Fresh Produce entry/form/recommendation flow; reuse the existing mandi list/detail UI patterns. |
| `apps/mobile/lib/mandis.ts` | Keep it only as demo/reference seed data or replace mobile authority with backend API responses; do not use local constants as live market prices. |
| `apps/mobile/components/TripMap.tsx` | Reuse existing map component; extend only if the recommendation comparison requires an additional route-preview state. |
| `apps/server/src/modules/...` | Add market-price, crop-profile, freshness, and recommendation service(s), following existing module/router conventions. |
| `apps/server/src/models/...` | Add or extend models for market-price observations, recommendation snapshots, crop profiles, and delivery outcomes as required. |
| Existing maps/directions module | Reuse route provider and route cache. Do not create a second maps client with duplicate keys. |
| Existing matching/pricing module | Expose deterministic read-only preview; preserve the authoritative booking quote and its monetary invariants. |
| `apps/server/src/seed.ts` or existing seed mechanism | Seed markets/prices/profile as explicitly simulated demo records. Never seed demo records into a live-status category. |
| `docs/API_CONTRACTS.md` | Document new endpoints and errors. |
| `docs/DATA_MODEL.md` | Document new schemas, enums, provenance, and indexes. |
| `docs/ARCHITECTURE.md` | Add the Fresh recommendation flow and service responsibilities. |
| `docs/PRD.md` / `docs/ROADMAP.md` | Add scope, exclusions, milestones, acceptance criteria, and success metrics. |
| `tests/` | Add deterministic algorithm, provider adapter, API, authorization, no-side-effect preview, and full-flow tests. |
| Admin/data operations | Add a data-quality view or documented operator process for stale data, import failures, and market/profile corrections. |

Do not rewrite unrelated modules or remove existing KisanPool features to implement Fresh.

---

## 17. Test and Evaluation Plan

### 17.1 Unit tests

Test at minimum:

- INR/kg, INR/quintal, and INR/tonne conversions.
- Rejection of missing/unknown price units.
- Rejection of invalid min/modal/max orderings.
- Price age classification at 24-hour and 72-hour boundaries.
- Harvest time validation and elapsed-time calculation.
- Risk calculation component normalization and version selection.
- Handling of missing temperature/storage/ripeness inputs.
- Saleable quantity cannot be negative or greater than input quantity.
- Correct gross revenue and net-proceeds arithmetic.
- Correct cost-category aggregation and no double-counting of quality loss.
- Correct `BEST_BALANCED`, `HIGHEST_NET_PROCEEDS`, `FASTEST_FEASIBLE`, and `CLOSEST_SUITABLE` assignment, including strict deadlines and no-positive-return cases.
- Tie handling at and around the configured ₹100/3% tolerance.
- No definitive recommendation when the price is expired or essential data is unavailable.

### 17.2 Integration tests

- Official-source adapter preserves raw and normalized price fields.
- Provider timeout returns a clear degraded status and does not refresh `fetchedAt` as if a fetch succeeded.
- Route service returns road distance and ETA and handles per-route errors.
- Preview service calls existing matching/pricing logic without changing vehicle capacity, request status, payment records, or trip records.
- Price observation snapshot remains unchanged after a new observation is imported.
- User can only retrieve and select their own recommendation.
- Selection revalidates the option and returns a reconfirmation response if transport price/availability materially changes.

### 17.3 End-to-end scenarios

1. Farmer enters 100 kg tomatoes; two candidate markets and at least one feasible vehicle are returned.
2. A farther market has higher gross price but lower net proceeds after costs; the nearer market wins.
3. A farther market remains more profitable after route, transport, and a labelled quality-loss assumption; the farther market wins.
4. Price at one market is expired; it cannot become the definitive Best-Profit recommendation.
5. One market is closed at estimated arrival; it is excluded from the fully feasible list.
6. No available verified vehicle can carry the batch; the destination is not shown as bookable.
7. Price unit is missing; the record is rejected and the error is logged.
8. Route provider is unavailable; the UI shows an error/rough estimate status and does not falsely mark the option verified.
9. Freshness parameters do not support an exact remaining-life estimate; the app shows insufficient data rather than a fabricated number of days.
10. Farmer selects a market; one normal KisanPool request proceeds into the existing booking/payment flow.
11. Preview is run repeatedly; no bookings, payment records, reservations, or capacity changes are created.
12. Synthetic demonstration data is labelled on every card, comparison, chart, and exported evaluation.

### 17.4 Synthetic dataset protocol

When real observed outcome data is unavailable, generate a labelled synthetic dataset with at least these fields:

- `scenarioId`, `randomSeed`, `isSynthetic`.
- Crop key, quantity, harvest timestamp, ripeness stage, storage condition.
- Market, price range, unit, market-price age.
- Route distance, route time, vehicle capacity, transport cost.
- Simulated quality/reject-rate assumption and its reason.
- Handling fees and other explicit costs.
- Baseline decision and Fresh recommendation.
- Net-proceeds calculation at each market.

Document the generator version and assumptions. Split scenarios into development and held-out test sets. Do not tune and report accuracy on the same set alone. Synthetic tests verify logic; they do not prove real-world loss prevention.

### 17.5 Baseline comparison

Compare three approaches using identical scenario inputs:

1. Closest-market-only baseline.
2. Highest-listed-price-only baseline.
3. KisanPool Fresh feasibility + net-proceeds recommendation.

Report net proceeds under the simulated ground-truth assumptions, selection regret, infeasible recommendations, expired-price mistakes, and cases where confidence was incorrectly high. Do not report a positive impact percentage without a clearly identified data basis.

---

## 18. Acceptance Criteria / Definition of Done

Fresh is ready for a judged prototype only when all items below pass.

### Data correctness

- [ ] Every market-price record has explicit currency, unit, observation time, fetch time, source type, and source provenance.
- [ ] All comparison prices are converted to INR/kg before arithmetic.
- [ ] Seed/demo market prices are visibly labelled simulated/reference.
- [ ] Expired prices cannot be used as the sole basis for a definitive Best-Profit result.
- [ ] Market crop acceptance and receiving hours are not represented as verified unless their source/status is recorded.

### Financial correctness

- [ ] Revenue is calculated from expected saleable quantity and the selected price scenario.
- [ ] Costs include farmer-payable transport and all known incremental selling/delivery expenses.
- [ ] The same financial cost categories are applied consistently across alternatives.
- [ ] Quality loss is represented once and not double-counted.
- [ ] The app calls the authoritative server transport quote service.
- [ ] The 100 kg example returns ₹3,600 for Market A and ₹4,650 for Market B given the stated illustrative inputs.

### Logistics/freshness correctness

- [ ] Distance/ETA comes from the route provider or is explicitly labelled approximate.
- [ ] Only feasible vehicle quotes are bookable.
- [ ] No universal tomato shelf-life duration is shown.
- [ ] Unknown or unvalidated freshness inputs lower confidence or yield `INSUFFICIENT_DATA`.
- [ ] The recommendation explains the relevant risk factors and timing.

### Workflow correctness

- [ ] Market comparison is read-only.
- [ ] Preview creates no booking, payment, or capacity reservation.
- [ ] Selecting an option continues through the existing transport flow.
- [ ] User ownership is checked for recommendation retrieval and selection.
- [ ] Changed volatile values are shown to the farmer before confirmation.

### Presentation and honesty

- [ ] The primary winner uses the documented balanced score: 50% expected net-proceeds score and 50% delivery-suitability score, after hard feasibility filtering.
- [ ] Highest Net Proceeds, Fastest Feasible, and Closest Suitable are clearly shown as independent alternatives; options need not be different markets.
- [ ] If no candidate has positive estimated net proceeds, the system does not label any option profitable and clearly states the condition.
- [ ] All prices, ETA, vehicle availability, freshness estimates, and scenario data show the correct verified/indicative/simulated status.
- [ ] The app presents an uncertainty/missing-data message instead of inventing values.
- [ ] No simulated result is reported as a real farmer saving.

---

## 19. Operational Management and Monitoring

### Daily data checks

- Record the latest successful price import per provider.
- Count market-price records by status: recent, stale, expired, invalid, and simulated.
- Report missing unit, missing date, unrecognized crop, unrecognized market, and impossible price ranges.
- Keep a record of provider outages, retries, and schema changes.
- Do not convert import failures into new observations or update `fetchedAt` on failed fetches.

### Recommendation audit

For each recommendation, retain enough data to reproduce the displayed result:

- Normalized user input and timestamp.
- Selected markets and rejection reasons for excluded markets.
- Exact price observation IDs and price values.
- Route distance/time and provider timestamps.
- Transport quote and quote timestamp.
- Crop profile/model and policy versions.
- Saleable quantity and price/cost scenario values.
- Ranking order, tie status, confidence, warnings, and explanation reasons.
- Farmer's selected option and eventual actual outcome when recorded.

### Model/configuration changes

- Version every freshness profile, weighting table, rejection-rate table, price policy, and ranking policy.
- Require a named reviewer and review date for agronomy-related numeric parameters.
- Keep previous versions so an old recommendation can be reconstructed.
- Test all saved scenarios before activating a new profile.

### Security and privacy

- Require normal KisanPool authentication for farmer-specific endpoints.
- Enforce recommendation ownership in the backend.
- Keep provider credentials server-side; never ship secrets in the Expo bundle.
- Validate all coordinates, timestamps, quantity, and text inputs.
- Rate-limit recommendation/source-fetch endpoints according to the existing backend pattern.
- Avoid storing more personal/location history than the product requires.
- Log source/provider errors without exposing credentials or sensitive personal details.

---

## 20. Failure Handling Rules

| Failure | Required behaviour |
|---|---|
| No current price record | Show price unavailable or historical context. Do not invent a price. |
| Price older than 72 hours | Exclude from definitive Best-Profit ranking; display as historical with timestamp if useful. |
| Unknown price unit | Reject the observation. Do not compare it. |
| No route result | Mark route unavailable; do not call it a verified ETA. |
| No available vehicle | Mark the market option non-bookable. |
| Market not confirmed to accept crop | Show as unverified only if policy allows; do not recommend as confirmed. |
| Unknown handling fees | Include an unknown-cost warning and lower confidence. |
| Crop profile not reviewed | Do not return an exact shelf-life window or unsupported loss percentage. |
| Missing freshness data | Return an explicit insufficient-data state. |
| Market-price provider down | Use a valid cached record only within its status policy; otherwise show the provider failure. |
| Transport quote changes before selection | Recalculate and ask for confirmation before creating the request. |
| Recommendation expired | Re-run calculation and return updated options; do not use the old quote as bookable. |
| No feasible market | Explain failed constraints and allow the farmer to adjust the pickup time or search radius. Do not force a winner. |

---

## 21. Demo Script for the Hackathon

Use a region with seeded example markets and vehicles, and label every generated value as simulated.

1. Open KisanPool Fresh.
2. Enter tomato, 100 kg, harvest date/time, ripeness stage, storage condition, and pickup location.
3. Show two market options: Market A at 10 km for ₹40/kg and Market B at 60 km for ₹60/kg.
4. Show the source status and observation date for both prices. Because the demonstration prices are fabricated for the demo, show **SIMULATED — NOT LIVE MARKET DATA**.
5. Show the route ETA, selected vehicle/capacity, transport quote, handling fees, and any explicitly simulated saleable-quantity assumption.
6. Show the calculation: Market A expected net proceeds ₹3,600; Market B expected net proceeds ₹4,650; Market B advantage ₹1,050.
7. Explain that the farther market wins because the expected return after costs is higher under the displayed assumptions.
8. Show Fastest feasible and Closest suitable separately.
9. Select Market B and continue into the existing KisanPool request/transport flow.
10. Show the freshness warnings and explain that the estimate is not a shelf-life guarantee.

Do not represent the values in this script as actual market offers, actual transport rates, or measured farmer savings.

---

## 22. Engineering Decisions That Must Remain Explicit

1. **Prices are observations, not guarantees.** A wholesale modal price is not a confirmed sale to the farmer.
2. **Net proceeds are an estimate.** The final amount depends on the buyer, grade, quantity accepted, actual transport quote, fees, and crop condition.
3. **Freshness is crop- and condition-dependent.** No universal 3–4 day tomato shelf-life assertion is allowed.
4. **Existing service logic is the source of truth.** Use the current v3 transport pricing, matching, maps, booking, and payment rules. Do not reimplement them independently in the frontend.
5. **AI is not the calculator.** Use deterministic backend formulas for all displayed prices, costs, ranking, and risk scoring.
6. **Data provenance is mandatory.** Every displayed price and important estimate must be traceable to a source or a labelled simulation.
7. **Unknown is a valid result.** If the system cannot support a number, return an explicit unavailable/insufficient-data state.
8. **Prototype evidence must be labelled.** Synthetic scenarios test logic; real-world benefit requires observed field outcomes.

---

## 23. External References

1. **Open Government Data Platform (India), AGMARKNET-derived daily mandi prices:** [Current daily price of various commodities in various markets (Mandi)](https://data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi). Use as a candidate source for daily minimum, modal, and maximum market prices; verify current API access and terms during integration.
2. **eNAM, market trade information:** [Mandi Trade Details](https://www.enam.gov.in/web/dashboard/trade-data). Useful for market, commodity, date, prices, arrivals, and quantities traded where data is available.
3. **eNAM, historical trade data:** [Historical Trade Data](https://www.enam.gov.in/web/dashboard/Historical). Use for historical context when data is accessible.
4. **National Horticulture Board:** [Post-Harvest Handling of Fruits and Vegetables — storage manual](https://nhb.gov.in/documents/storage-manual.pdf). Use as a starting reference for handling and crop-specific storage guidance; have the tomato parameters reviewed before turning guidance into a numeric remaining-life model.
5. **Google Maps Platform:** [Compute a route using Routes API](https://developers.google.com/maps/documentation/routes/compute_route_directions) and [Compute a route matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix). Use route distance and duration from the configured provider; keep API keys on the server where required.
6. **KisanPool source of truth:** [Repository branch v3](https://github.com/abhaynix/KisanPool/tree/v3), including `README.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/DATA_MODEL.md`, `apps/mobile/lib/mandis.ts`, and the existing farmer mandi screens.

---

## 24. Final Implementation Checklist

Before coding:

- [ ] Confirm the current v3 matching/pricing/map service paths and the exact quote response.
- [ ] Confirm which v3 market values are static demo data and label them.
- [ ] Verify the official market-price source access method, schema, units, refresh policy, and reuse terms.
- [ ] Define reviewed tomato ripeness and storage enums; do not hardcode an unverified shelf-life promise.
- [ ] Freeze API contracts and model fields before building the UI.

Before demo:

- [ ] Run the complete example and unit-conversion tests.
- [ ] Confirm the illustrative example reports Market B as Highest Net Proceeds (₹4,650 vs ₹3,600). Determine the primary balanced winner only after a specified farmer deadline and consistent time scores are supplied.
- [ ] Test a case where the nearer market wins.
- [ ] Test expired price, missing unit, no route, no vehicle, and insufficient freshness data.
- [ ] Verify preview has no database side effects on bookings/payments/capacity.
- [ ] Verify selection uses the existing KisanPool booking and payment flow.
- [ ] Label synthetic price, quantity-loss assumptions, and simulated results on every relevant screen.
- [ ] Confirm the final UI never promises an exact remaining shelf-life duration unless the configured crop profile supports it.

**Completion condition:** KisanPool Fresh can reproduce a balanced recommendation from a saved input/source snapshot; explain profit/time trade-offs and uncertainty; transfer a selected option into the existing booking flow; and support safe incident recovery and consented remaining-cargo rerouting without duplicating booking, payment, or payout logic.

---

# 25. Master Amendment — Balanced Profit/Time Recommendation

This section is authoritative wherever older sections still say the primary winner is simply the highest-net-proceeds market.

## 25.1 Farmer delivery preference

The farmer chooses a delivery deadline/preference, not an exact shelf-life claim:

- `TODAY` (must resolve against current time and verified receiving hours)
- `WITHIN_12_HOURS`
- `WITHIN_24_HOURS`
- `WITHIN_48_HOURS`
- `CUSTOM_DEADLINE` (explicit local date/time converted and stored consistently)
- `FLEXIBLE` (no strict deadline; delivery time still affects ranking)

The app must explain that this is a requested delivery window, not a prediction that the produce remains safe/saleable for that duration. Keep the original `harvestedAt` and elapsed time during any vehicle change or market reroute. Never reset freshness age when a new route leg starts.

## 25.2 Result labels

The main result is `BEST_BALANCED`. Also expose `HIGHEST_NET_PROCEEDS`, `FASTEST_FEASIBLE`, and `CLOSEST_SUITABLE`. Each card shows estimated money remaining after known selling/transport costs, driving distance, ETA/arrival time, source and age of price, feasibility/vehicle status, deadline status, confidence/missing data, and short computed reasons. Show data uncertainty prominently. A price observation is not a guaranteed buyer offer.

## 25.3 Required algorithm tests

- Near market has less profit but faster delivery: verify the balanced result from the documented score, not a hard-coded “nearest wins” rule.
- Farther market has higher net proceeds but slower delivery: verify deadline filtering and balanced score.
- A candidate violates strict deadline: it is excluded from primary recommendation even if its listed price is high.
- Flexible deadline still scores time using the configured relative rule.
- Comparable freshness model available: use the defined delivery-suitability blend; one or more missing/incomparable freshness scores: use time-only score for every candidate and show the warning.
- All net proceeds are zero/negative: no “profitable” badge; return `NO_POSITIVE_RETURN_ESTIMATE`.
- Expired price, invalid unit, unavailable route or vehicle: no definitive/bookable recommendation.
- Repeated run from the same immutable input and source snapshot yields identical scores/ranking.

---

# 26. Platform Feature — Shared Shipment Continuity and Incident Recovery

This capability belongs to the main KisanPool transport domain and must also work for KisanPool Fresh. Fresh may add crop/deadline-aware urgency, but must not implement a separate recovery or payment system.

## 26.1 Goal and scope

Allow a transporter or authorized operations user to report a breakdown, accident, vehicle defect, road blockage or similar disruption. If safe and feasible, KisanPool finds a replacement vehicle, arranges a documented handover, and continues the same cargo journey. A replacement vehicle must not create a duplicate farmer booking or lose the original shipment history.

First release supports one replacement vehicle and sequential legs. If the cargo cannot be safely moved, one replacement is unavailable, multiple trucks are required, or safety is unclear, escalate to operations/admin rather than pretending automation succeeded. Multi-truck split is an explicit future enhancement.

## 26.2 Incident workflow and state expectations

The exact enums and model placement must follow the existing v3 conventions after Task T00, but the workflow must represent equivalent states:

`REPORTED -> TRIAGE/SAFETY_CHECK -> RECOVERY_REQUIRED -> SEARCHING_REPLACEMENT -> AWAITING_CONFIRMATION -> HANDOVER_IN_PROGRESS -> RECOVERED -> DELIVERED`

Failure paths must include `ESCALATED_TO_OPERATIONS`, `NO_REPLACEMENT_AVAILABLE`, and a documented cancellation/return path where appropriate. Do not treat a failed incident or handover as successful delivery.

Incident report fields, when available:

- Incident ID; parent trip/shipment IDs affected; reporter and role.
- Incident category, description, timestamp, GPS/current location and source.
- Optional photos/evidence and notes.
- Cargo quantity and condition at incident time.
- Safety status and whether cargo movement is safe/authorized.
- Current vehicle/driver and replacement vehicle/driver references.
- Status, assigned operator, messages/notifications, timestamps and audit events.

For a pooled trip, record which individual shipments and quantities are affected. Inform each affected farmer and the transporter through existing notification conventions. Do not expose one farmer's private shipment/financial details to another farmer.

## 26.3 Safety, vehicle matching and replacement

1. Safety first: an unsafe roadside or accident scenario may require emergency services/roadside assistance and operations review before cargo transfer.
2. Search vehicles from the breakdown location—not the original pickup—using verified identity/KYC, availability, driver/vehicle status, remaining payload capacity, cargo/handling constraints, operating time, route ETA and quote.
3. Preserve the original destination unless the farmer authorizes a destination change through the correct workflow.
4. The candidate replacement quote covers only the remaining leg and uses existing server-side pricing/matching rules. Do not calculate prices in the mobile client.
5. Show revised ETA, quote, any difference from the original quote and any operational warnings before final confirmation.
6. Do not charge the farmer an additional amount without explicit approval or a pre-agreed, legally/policy-reviewed contingency rule recorded in the original booking terms.
7. If no suitable replacement is available, offer operations escalation and a safe, documented resolution; do not mark the shipment delivered.

## 26.4 Cargo custody handover

Create an append-only or otherwise auditable custody event using the existing model patterns. Record:

- Incident/trip/shipment and both vehicle/driver identifiers.
- Actual handover location, timestamp and evidence source.
- Weight/quantity and package/unit count handed over; distinguish verified from reported values.
- Condition observations, damage/spoilage discrepancies and optional photos.
- Outgoing transporter acknowledgement and incoming transporter acknowledgement.
- Farmer/operations acknowledgement if the policy requires it.
- Handover status and any discrepancy/dispute.

A recipient must not acknowledge quantity not actually received. If values mismatch, pause normal completion and escalate the discrepancy. Do not delete or overwrite the previous leg/history; append the new leg and custody events.

## 26.5 Journey and data model direction

The agent must inspect the current `Trip`, `TripShipment`, request, tracking, payment and payout models before selecting the least-invasive design. The domain must support one parent cargo journey with sequential `TransportLeg`-equivalent records and custody events, even if the implementation reuses/extends existing models instead of creating new named models.

Conceptual records (names are not mandatory): `TransportIncident`, `TransportLeg`, `CargoCustodyEvent`, and `RecoverySettlement`. Each leg should preserve carrier/vehicle, start/end location, route/distance, quoted amount, verified completion, status and timestamps. Link original shipment(s) to the continuous parent journey and current active leg. Avoid breaking existing APIs or legacy records; plan any migration/backward-compatibility path and tests. If an existing field such as a final shipment price is frozen after delivery, do not overwrite it as a shortcut to represent several legs; preserve the old contract and add explicit, linked settlement/leg records with a safe compatibility strategy.

## 26.6 Per-leg compensation and settlement

The first transporter should be considered for compensation for a verified completed leg up to the transfer point; the replacement transporter receives a separately calculated quote/compensation for the remaining leg. This is not a rule to pay a simple percentage of the original total based only on straight-line distance.

- Use route-provider road distance/time and existing server-side pricing rules, plus the existing contract's fixed/variable charges where applicable.
- Where current code only quotes a whole trip, extract or reuse a pure, testable pricing function for leg quotes; do not duplicate pricing logic in another module.
- Allocate shared/pooled-trip charges transparently and avoid charging every farmer the entire replacement leg.
- Keep original quote, each leg quote, actual incurred costs, approved farmer charge, earned transporter compensation, any adjustment and reason in an auditable ledger/reconciliation record.
- A completed leg's compensation and a later dispute/liability determination are separate concerns. Do not automatically forfeit earned compensation just because a vehicle failed; use a documented incident/liability review policy.
- Use the existing payment provider and payout/reconciliation mechanisms. Never silently edit an already settled payout or issue a second payout. Apply idempotency and ledger references.
- If the payment provider cannot support the needed adjustment safely, pause settlement and escalate to operations rather than faking a successful status.

## 26.7 Fresh-specific recovery behaviour

For Fresh cargo, rerun route/delivery-time suitability using the incident's current location and remaining cargo condition, while preserving original harvest time. If every replacement route appears to violate the farmer's deadline or supported crop constraints, show warnings and alternatives and escalate; never fabricate an acceptable shelf-life window.

---

# 27. Platform Feature — Partial Sale and Remaining-Cargo Rerouting

## 27.1 Required business behaviour

Selling some cargo at Market A is a market-sale event, not automatic completion of the whole shipment. If 60 kg out of 100 kg is sold, record the sale for 60 kg and make only the verified remaining 40 kg eligible for storage, continued local sale, or rerouting. The solution must work for Fresh first and must not make the base shipment model inconsistent for any other supported cargo type.

## 27.2 Quantity ledger and invariants

Use append-only quantity events or an equivalent auditable transaction design. The model/implementation must define the supported categories (for example dispatched, received, sold/accepted, rejected/damaged, remaining available, returned, in transit to next market, finally delivered) with validated transitions.

At every reconciliation checkpoint, enforce a balance equivalent to:

`receivedKg = soldOrAcceptedKg + rejectedOrDamagedKg + remainingAvailableKg + documentedVarianceKg`

Each component must be non-negative and use one canonical unit internally (kg for produce, with source/input unit preserved). Discrepancies must be recorded and escalated; they must not be silently rounded away. Prevent the same physical quantity from being sold, returned, and rerouted twice due to retries or concurrent actions.

A parent shipment/request remains open while any tracked quantity remains in transit or awaiting a documented final disposition. Partial sale does not mark the whole request `DELIVERED` or release all linked logistics states prematurely. Do not overwrite existing final-price/final-status fields as a shortcut; preserve legacy semantics and represent partial-sale and multi-leg financial history through linked events/settlement records or an explicitly reviewed schema evolution.

## 27.3 Compare “sell here” versus “reroute”

When unsold quantity remains at a market, calculate the available choices from the current physical cargo location and current time:

1. `SELL_HERE`: farmer can accept an actual buyer offer if present, or see clearly labelled indicative price information. Include any known extra market handling, waiting/storage and transaction costs.
2. `REROUTE_TO_MARKET`: compare suitable destinations for the remaining quantity only. Recalculate route, ETA, crop/condition constraints, market receiving hours, price source/age, available vehicle/capacity, remaining-leg quote, fees and estimated net proceeds. Keep the original harvest time/elapsed time.
3. `HOLD_OR_ESCALATE`: when the price/market/vehicle/condition information is insufficient or neither choice is feasible, preserve custody and ask operations/farmer to resolve; do not force a destination.

For the decision from the present location, use incremental future economics: compare the money now obtainable by selling here with the expected money obtainable at the next market **minus only the additional future costs incurred by choosing that route**. Do not subtract the already incurred first-leg transport cost again in this incremental comparison. Keep that sunk cost in the overall journey/accounting history so end-to-end actual proceeds are still correct. Show incremental advantage separately from whole-journey total.

Do not rely on a wholesale indicative modal price as a guaranteed sale. Clearly distinguish confirmed buyer offer, indicative market price, operator estimate and simulated value. A route is not eligible merely because its price is higher.

## 27.4 Farmer and transporter decision (required simple consent flow)

Both the farmer and the current transporter must be involved. Keep this simple for the first release:

1. The system presents the same decision summary to the farmer and transporter: sell remaining cargo at the current market, propose a specific new market, or request operations assistance. Include quantity, buyer/price status, added route, ETA, incremental costs, expected return and uncertainty.
2. The farmer records the commercial preference/approval (sell here vs proposed new destination and any applicable price/charge acceptance).
3. The transporter confirms whether they can safely continue/hand over the cargo and accepts the operational plan and revised transport quote. They may decline and state a reason; the system must not assume availability.
4. A reroute proceeds only when both required approvals match the same option/version and the quote is still valid. If they disagree, either declines, or a deadline/quote expires, do not reroute automatically—keep custody state intact and escalate to operations or present updated options.
5. Before executing a new leg, revalidate market acceptance/receiving hours, route, vehicle/capacity, price/offer status and charges. If the plan materially changes after either party approves, request fresh approvals.

Farmer controls the commercial decision on selling their produce. Transporter confirms logistics and their own proposed service/quote; the transporter does not silently accept a sale price on the farmer's behalf. If the goods are to be handed to a market/buyer, record an evidence-backed custody/sale receipt and who took possession. Keep roles and acknowledgements explicit.

## 27.5 Reroute execution and completion

- Create a new linked transport leg for the unsold quantity while retaining the original parent shipment/journey and all prior market-sale/transport events.
- Use the existing route, matching, quote, booking, notification, payment and tracking services wherever applicable; do not create a second independent payment gateway or unrelated booking lifecycle.
- Quote the new leg at the current physical location for the current remaining quantity. Revalidate vehicle availability/capacity at commitment time; a preview must not reserve capacity.
- Store the farmer-approved commercial option, transporter acceptance, quote version, approvals, decision time, selected market, quantities and confirmation/audit IDs.
- At the next market, repeat quantity reconciliation. The process can continue sequentially until all quantity has a documented final disposition or the allowed reroute-attempt threshold is reached.
- Set a configurable reroute/attempt limit and minimum economic-benefit rule as initial product controls, and provide operations override with audit; values must be configuration, not hard-coded assumptions.

## 27.6 Partial-sale / rerouting acceptance tests

- 100 kg received; 60 kg sold; 40 kg remain; only 40 kg can be rerouted.
- Market A sell-now buyer offer is better than incremental Market B return; recommend selling here under the same scenario inputs.
- Market B is better after its additional cost and time are considered; present reroute as an option, not an automatic action.
- Market B has a high indicative price but no confirmed buyer; uncertainty is prominent and no guarantee is shown.
- Farmer approves reroute but transporter declines; no new leg is committed.
- Transporter approves but farmer declines; no new leg is committed.
- Both approve, but quote/capacity expires or changes materially; require reconfirmation.
- Duplicate API retry/concurrent clicks cannot duplicate a sale, allocate more quantity than remains, book the same cargo twice or duplicate payment/payout.
- Prior leg cost remains in the full journey ledger but is not subtracted twice when deciding between future choices.
- Fresh reroute uses original harvest time and updated current condition/route ETA.
- The shipment is not finally delivered until remaining cargo receives a documented final disposition.

---

# 28. Approved Enhancements and Deferred Ideas

These were approved as directions in the product discussion. Codex must check whether each can reuse existing repository features before adding a new subsystem.

1. **Buyer quote confirmation:** preferred over relying only on indicative prices. Record buyer identity/offer time, quantity, grade, price/unit, expiry/conditions and acceptance status when supported. Do not fabricate buyer offers; if external buyer integrations are out of scope, provide an explicit operator/manual confirmation workflow.
2. **Shareable recommendation summary:** a simple share/export-friendly summary of market options, source status, estimated costs and delivery time. Avoid leaking another farmer's personal or commercial information.
3. **Fresh batch pooling:** use the existing KisanPool pooling/matching engine to consider compatible nearby produce loads. Preserve per-farmer quantity, destination consent, allocation and cost. No parallel pricing logic.
4. **Confidence-aware recommendation:** if data is missing, stale, noisy or too close to decide confidently, show uncertainty and alternatives rather than forcing a winner.
5. **Estimated vs actual outcome:** after sale/delivery, compare predicted price, quantity, delivery time and cost against verified/farmer-reported actuals; distinguish evidence source. Do not automatically retrain from unverified user entries.
6. **Admin/data-quality visibility:** monitor stale/invalid prices, failed imports, broken routes, recovery incidents, handover discrepancies, unsold cargo and unresolved disputes using existing admin conventions.
7. **Cold-chain sensors/temperature feeds:** future-only enhancement, not a first-release dependency. Add only after an actual device/data source and operational need are confirmed; clearly distinguish sensor-measured values from farmer-reported values.

## 28.1 UI direction — existing theme plus focused prototype first

### Decision

Use a **hybrid workflow**: preserve the existing KisanPool visual language and reusable components, while creating and reviewing a small prototype for the new Fresh/recovery flows before full UI implementation. Do not prototype the entire app and do not let an agent redesign the product from scratch without a user-approved direction.

### Audit the current design first

Before prototyping, inspect and follow all applicable repository instruction files (especially `agent.md` and any nested UI/mobile instructions), then audit the actual app theme, colour/tokens, typography, spacing, shared components, navigation, responsive behaviour, accessibility conventions, language patterns, and existing farmer mandi screens. Use the real code as the source of truth; this specification does not prescribe a new palette or replace the current theme.

Prefer existing components and the smallest coherent extension. Any proposed visual change beyond the existing design language must be justified in the prototype summary and left for the user to approve. Do not redesign unrelated screens.

### Focused prototype scope

Prototype only the flows that carry new or high-risk decisions, using clearly labelled mock/simulated data:

1. **Fresh crop form:** crop/quantity/harvest/storage/pickup fields and the farmer-selected delivery window.
2. **Fresh market comparison:** Best Balanced Fresh Option, Highest Net Proceeds, Fastest Feasible and Closest Suitable, with price/source status, expected net proceeds, time, cost and uncertainty visible.
3. **Vehicle breakdown/recovery:** transporter incident report and replacement/handover state, plus the affected farmer's recovery status and revised ETA/quote view.
4. **Partial sale and rerouting:** remaining quantity, `SELL_HERE` vs `REROUTE_TO_MARKET` vs `HOLD_OR_ESCALATE`, with separate farmer commercial approval and transporter operational/quote confirmation. Show that the action only proceeds when both approve the same current option/quote version.

### Prototype constraints and review gate

- Use the existing application and design system where practical. Keep the prototype in a clearly isolated, non-production/demo-only route or preview; it must not be exposed as a live production workflow.
- Use mock data only. Mark all mock prices, quotes, vehicle availability, quantities and results as simulated. Do not connect the prototype to real booking/payment APIs or mutate production/business data.
- T00A is design/prototype only: no database schema, business-rule, payment, booking or production API changes. Reuse or extract prototype UI pieces later only if they fit the approved design and actual architecture.
- Render the prototype in the available local browser/device preview where possible. Provide screenshots or exact preview steps and explain how to inspect each flow. If the environment cannot run it, report the blocker honestly and provide the closest reviewable artifact; never claim a preview/test happened when it did not.
- The coding agent must finish T00A with a short summary of the design audit, prototype entry point, screenshots/preview instructions, mock-data boundaries, accessibility/responsive checks performed, and any open choices. Set `T00A` to `IMPLEMENTED_NEEDS_REVIEW` and stop for user approval.
- Do not begin T01 or full UI tasks until the user explicitly approves T00A. If changes are requested, revise T00A only and wait for approval again.
- UI implementation tasks T07/T08 must implement the approved prototype in the current theme, using real API/service contracts only where those tasks require it. The approved prototype is the reference, not permission to bypass repo instructions.

---

# 29. Codex Execution Protocol, Task Plan and Approval Tracker

## 29.1 Non-negotiable agent instructions

The coding agent must follow these instructions on every run:

1. **One Task ID per run.** Implement only the task explicitly named in the user's current prompt. Do not start the next task in the same run, even if it appears easy.
2. **Task T00 first.** First discover and read all applicable repository agent instructions, including root `agent.md`, `AGENT.md`, `AGENTS.md` and relevant nested/tool-specific instruction files if present. Then inspect the actual default branch, git status, repository scripts, existing models/services/API contracts, current UI theme/components and test harness. Record which instruction files were found/read. T00 is audit/documentation only; no feature implementation.
3. **Follow repository agent instructions.** The instruction files found in the repo are mandatory in addition to this spec. Do not edit, bypass or silently override them. If a real conflict with product scope or task sequencing appears, stop and report it for user resolution.
4. **Protect repository state.** Do not switch to `master` by assumption, overwrite user changes, force-push, commit/push, or create a second application. Do not modify unrelated files. Do not assume the remote default branch without checking it.
5. **Inspect before creating.** Search for an existing service/model/component before creating a new one. Use actual code, not only this document's proposed paths. Adapt design if code evidence justifies a better implementation; document the rationale and ask for user review rather than silently changing product behaviour.
6. **Respect service ownership.** Existing matching/pricing/routes/bookings/payments/payouts remain authoritative. No separate payment gateway or frontend calculation of authoritative prices/quotes.
7. **Preserve source truth.** Do not label seed/demo data as live, invent current price data, fabricate vehicle availability, claim scientific shelf-life certainty, or report simulated savings as measured impact.
8. **Test the whole task.** Run the smallest relevant tests first, then related tests/lint/type checks/build if practical. Record exact commands and actual results. Never claim a test ran if it did not; explain environment blockers.
9. **Update this file.** Update the Task Tracker status, implementation notes, files changed, test results, decisions, and unresolved issues for the current task only.
10. **Stop after reporting.** Set the task to `IMPLEMENTED_NEEDS_REVIEW`, provide the concise user-facing summary and verification evidence, then stop. Do not set `APPROVED` yourself and do not begin the next task until the user explicitly approves this one.
11. **Context-reset safe.** Every task has its own goal, prerequisites, scope, acceptance criteria, and test checklist in this file. On account/session switching, the next agent must read this spec and git diff/status before continuing; do not rely on chat memory.

## 29.2 Status meanings

- `PENDING` — not started.
- `IN_PROGRESS` — currently the one authorized task for this run.
- `IMPLEMENTED_NEEDS_REVIEW` — task code is complete to the extent possible and tests/results are reported; waiting for user approval.
- `APPROVED` — user explicitly accepted the task after reviewing its summary.
- `BLOCKED` — cannot proceed without a dependency, user decision or environment fix; report what is blocked.
- `DEFERRED` — deliberately postponed by product decision.

Only the user can change `IMPLEMENTED_NEEDS_REVIEW` to `APPROVED` by explicit approval. A later task may be started only after all its dependencies are `APPROVED`.

## 29.3 Task execution response template

At the end of each task, the agent must return:

- **Task ID and status**
- **What changed** (short plain-language summary)
- **Files touched** (with brief reasons)
- **Tests/commands run** (exact command and actual pass/fail/result)
- **Manual review steps** (how the user can validate the feature)
- **Known gaps/risks**
- **Next task suggestion** (one line only; do not execute it)
- **Approval request** asking the user to review the current task before continuing

## 29.4 Task list

Tasks should be cohesive implementation units, not arbitrary micro-steps. One task is expected to be completed in one focused agent run; if a task proves materially larger than estimated, the agent must stop, mark it `BLOCKED`, explain why and propose a revised task boundary for user approval. Do not split an in-progress task silently across unrelated sessions.

| Task ID | Task | Dependencies | Initial status | Scope and exit criteria |
|---|---|---|---|---|
| T00 | Repository and agent-instruction baseline audit | None | `PENDING` | Discover/read root and relevant nested agent instructions (including `agent.md`/`AGENT.md`/`AGENTS.md` and applicable tool-specific files), verify actual default branch, clean/dirty worktree, scripts, current API/model/service paths, pricing/matching/map/payment/payout flows, existing incident/resilience capabilities, current UI theme/components and test commands. No feature code changes. Publish a concise baseline map, list instruction files found/read, and identify conflicts between this spec and actual code/instructions. |
| T00A | Existing-theme audit and focused UI prototype | T00 approved | `PENDING` | Before full feature implementation, prototype the four key flow groups in Section 28.1 using the current KisanPool theme and labelled mock data: Fresh form, market comparison, vehicle recovery/handover, and partial-sale sell-vs-reroute with farmer + transporter decisions. Keep it isolated from production navigation, APIs, booking/payment and persistent business data. Provide screenshots or local preview instructions and accessibility/responsive review notes. No backend/schema/production business logic changes. Exit: user can review the prototype; mark `IMPLEMENTED_NEEDS_REVIEW` and stop for explicit approval. |
| T01 | Freeze contracts and compatibility plan | T00 and T00A approved | `PENDING` | Propose and document exact states, API/event contracts, compatibility/migration approach and module ownership for Fresh, transport legs, incidents, custody, partial sales and reroutes. Confirm existing API response/error conventions and apply the user-approved UI prototype as the interface reference. Do not implement all modules here. Exit: reviewed contract/change map with no duplicate booking/payment system. |
| T02 | Market price provenance and normalization | T01 approved | `PENDING` | Implement explicit source/unit/observedAt/fetchedAt/status and INR/kg normalization with validation/tests; mark seed values simulated/reference unless verified. A missing unit or failed fetch cannot become a live valid price. |
| T03 | Side-effect-free market/route/transport preview | T01 approved | `PENDING` | Reuse server map and matching/pricing services to return route/ETA and quote previews with no booking/payment/capacity mutation. Test no side effects and existing price invariants. |
| T04 | Crop profile and freshness-risk engine | T01 approved | `PENDING` | Version crop profile/risk rules; initially tomato only. Never invent shelf life/reject rate; return explicit insufficient-data state. Test component normalization, missing input and version selection. |
| T05 | Financial calculator and balanced recommendation engine | T02–T04 approved | `PENDING` | Implement units, saleable-quantity assumptions only when supported, costs/net proceeds, strict/flexible deadline scoring, 50/50 balanced score, optional comparable freshness component, four result types, near-ties, confidence and no-positive-return handling. Deterministic unit tests required. |
| T06 | Fresh API snapshots and authorization | T05 approved | `PENDING` | Implement recommendation endpoints using existing conventions, immutable reproducible snapshots, ownership enforcement, expiry/version fields, warnings and selection revalidation contract. Read operations do not recompute historical snapshots. |
| T07 | Farmer form and delivery preference UI | T06 and T00A approved | `PENDING` | Implement the user-approved prototype for Fresh entry and crop/harvest/storage/pickup form plus today/12h/24h/48h/custom/flexible preference, using the existing theme and applicable repo instructions. Preserve inputs on recoverable errors; reuse accessibility and multilingual patterns. Do not redesign beyond the approved scope without review. |
| T08 | Recommendation comparison UI | T06–T07 and T00A approved | `PENDING` | Implement the approved prototype for Best Balanced, Highest Net Proceeds, Fastest Feasible, Closest Suitable, map/list, cost/source/status/time/risk/confidence. Reuse the current design system; do not force distinct winners; clearly distinguish demo data. |
| T09 | Booking handoff and actual-outcome capture | T08 approved | `PENDING` | User selects a recommendation; revalidate volatile values and continue through existing booking/payment/tracking flow. Record expected-versus-actual price/quantity/time/cost with evidence source, no duplicate lifecycle. |
| T10 | Buyer confirmation and shareable summary | T08 approved | `PENDING` | Add real/manual buyer offer status/validity when supported and share/export-safe recommendation summary. No fake confirmed offers and no privacy leaks. |
| T11 | Fresh batch pooling integration | T03, T09 approved | `PENDING` | Integrate compatible produce batches with existing pooling engine; preserve per-farmer quantity, acceptance, destination and price/cost allocation. No parallel matching/pricing subsystem. |
| T12 | Incident reporting and recovery state machine | T01, T03 approved | `PENDING` | Add incident reporting, safety/triage/escalation and trip/shipment-aware recovery states for all KisanPool deliveries, including Fresh. Notify affected parties through existing patterns. Test failure paths and authorization. |
| T13 | Replacement vehicle discovery and cargo handover | T12 approved | `PENDING` | Match replacement from incident location using verified availability/capacity, compute remaining leg quote, capture bilateral driver acknowledgements, quantity/condition/evidence and continue one linked journey. If unsafe/unavailable/mismatch, escalate. |
| T14 | Per-leg transporter compensation and settlement | T03, T13 approved | `PENDING` | Compute verified completed-leg compensation and remaining-leg quote from authoritative pricing rules; keep charges and payouts auditable/idempotent. Handle already-settled cases safely; no arbitrary distance-percentage payout or direct payment-state edits. |
| T15 | Partial sale and quantity ledger | T01 approved | `PENDING` | Record market sale/accepted/rejected/remaining quantities as events; enforce quantity balance and partial states. Sale of some cargo cannot complete the whole shipment or permit duplicate allocation. |
| T16 | Sell-here vs reroute decision and bilateral consent | T03, T05, T13, T15 approved | `PENDING` | Compare current-market buyer offer with reroute economics from current location for remaining quantity only. Farmer chooses commercial preference; transporter confirms operational feasibility/quote. Require both to approve the same current option/version before reroute. Disagreement goes to operations. |
| T17 | Execute remaining-cargo reroute | T14–T16 approved | `PENDING` | Revalidate price/offer, route, delivery window, market acceptance, remaining quantity and capacity; create linked next leg only after both approvals; keep sunk cost in total ledger but exclude it from incremental choice comparison. Test idempotency and quote changes. |
| T18 | Admin operations and data-quality handling | T02, T12, T15 approved | `PENDING` | Reuse admin patterns to expose stale/invalid prices, failed imports, open incidents, custody discrepancies, no replacement, unsold cargo and pending consent/disputes. |
| T19 | End-to-end security, concurrency and resilience tests | T06, T09, T14, T17 approved | `PENDING` | Test duplicate retries, race conditions, ownership, one-time sale/leg/settlement, provider outage, replacement unavailable, consent mismatch, network interruption, pooled farmers and payment idempotency. |
| T20 | Final demo and acceptance validation | T19 approved | `PENDING` | Run the complete demo with explicitly simulated data, balanced score explanation, vehicle recovery, partial sale/reroute and payment ledger. Compare baseline approaches. No unsupported real-world savings claims. |
| T21 | Sensor-assisted cold-chain monitoring | T20 approved | `DEFERRED` | Future only; implement only when real sensor/provider source and operational use case are approved. Not required for first hackathon prototype. |

## 29.5 Persistent progress tracker

Update this table after each task; do not reset completed/approved work when continuing after context/account switching.

| Task ID | Status | Summary / PR or commit reference | Test result | User approval note |
|---|---|---|---|---|
| T00 | `APPROVED` | Baseline audit complete: active/default branch is `v3` (`origin/HEAD`); pre-existing untracked master spec preserved. Read root `AGENT.md`; no nested or tool-specific instruction files found. Baseline paths and theme/instruction discrepancy reported in the T00 review summary. No production code changed. | Audit only; no tests run. Checked `git status --short --branch`, `git branch -vv`, `git remote show origin`, package manifests, architecture/API/data-model docs, services/models, theme/mandi screens and `tests/` inventory. | User approved T00 in chat |
| T00A | `APPROVED` | Added an isolated Fresh prototype route and standalone review page covering crop form, market comparison, vehicle incident/recovery/handover, and partial sale with same-option bilateral consent. Mock-only; not linked in production navigation and has no API calls. Used current runtime theme tokens; legacy `AGENT.md`/`DESIGN.md` palette and font guidance still conflicts with `theme.ts`. | `npm run typecheck --workspace @kisanpool/mobile` — passed. `python3 -m http.server 8765 --directory docs` — preview served; manually reviewed all four flows and verified changing the partial-sale option clears both approvals. Expo web route could not render: existing `react-native-maps` imports call unavailable `codegenNativeComponent` on web. | User said “next” after prototype review request; treated as approval to proceed |
| T01 | `APPROVED` | Added `docs/KisanPool_T01_Contract_Compatibility_Plan.md`: current v3 baseline, proposed API/events, state machines, module ownership, idempotency, migration and compatibility strategy. No production behavior changed. | Documentation-only review against shared pooling/error/resilience contracts, realtime authorization/rooms, model/payment conventions, and master spec §§12–13, 26–27. No tests run. | User approved T01 in chat |
| T02 | `APPROVED` | Added shared price provenance/unit/status contracts and INR/kg normalization; added server `MarketPriceObservation` schema with derived status/normalized values and validation; labelled bundled mandi reference rates as simulated with explicit INR/quintal source units and no invented timestamps. | Shared/server/mobile typechecks passed; `node --import tsx --test tests/market-prices.test.ts` — 4 passed; `git diff --check` passed. | User approved T02 in chat |
| T03 | `APPROVED` | Added read-only Fresh market route/transport preview using existing Maps directions and pooling price allocation. Requires verified AVAILABLE vehicles with sufficient capacity/location; reports vehicle-to-pickup ETA, farmer quote, route source and explicit buffers. No booking, offer, trip, or capacity mutation. | Server typecheck passed; focused preview test passed as part of `tests/fresh-engine.test.ts`; shared/mobile typechecks passed; `git diff --check` passed. | User approved T03–T05 together in chat |
| T04 | `APPROVED` | Added versioned tomato profile and deterministic, assumption-labelled freshness risk estimate. Missing inputs return `INSUFFICIENT_DATA`; latest-arrival window remains null; unsupported crops do not receive a fabricated score. | Server typecheck passed; tomato profile/risk tests passed in `tests/fresh-engine.test.ts`; shared/mobile typechecks passed. | User approved T03–T05 together in chat |
| T05 | `APPROVED` | Added deterministic financial scenarios, hard feasibility filters, strict/flexible deadline scores, optional comparable freshness weighting, 50/50 balanced score, four independent recommendation labels, confidence, near-ties and non-positive-return warnings. Unknown saleable quantity/costs cannot produce a definitive balanced result. | Server typecheck passed; ranking scenario tests passed in `tests/fresh-engine.test.ts`; shared/mobile typechecks passed; combined focused suite — 10 passed; `git diff --check` passed. | User approved T03–T05 together in chat |
| T06 | `APPROVED` | Added authenticated farmer crop catalogue, recommendation create/read endpoints, immutable owner-scoped snapshots, version/expiry/warning fields, and saved reads that do not recompute. Candidate mandi locations are reference-only; missing crop acceptance, prices, saleable quantity and costs deliberately prevent a live winner. | `npm run typecheck --workspace @kisanpool/server` — passed; mobile typecheck passed; `git diff --check` passed. No tests run. | User approved T06–T08 together in chat |
| T07 | `APPROVED` | Added Fresh form and farmer-home entry with tomato harvest quantity/time, ripeness, storage/temperature, handling, editable pickup, and Today/12h/24h/48h/custom/flexible arrival preference. Recoverable API errors keep entered values in the form. | `npm run typecheck --workspace @kisanpool/mobile` — passed; `git diff --check` passed. No tests run. | User approved T06–T08 together in chat |
| T08 | `APPROVED` | Added saved-snapshot comparison screen with four distinct result categories, map/list view, route and transport preview details, freshness/data warnings, and explicit unavailable states. It reloads the same snapshot and does not calculate on GET. | Server/mobile typechecks passed; `git diff --check` passed. No tests run. | User approved T06–T08 together in chat |
| T09 | `APPROVED` | Added fail-closed recommendation selection with expiry/eligibility checks, fresh transport-quote revalidation, material-change reconfirmation, deterministic one-request idempotency and handoff to existing transporter offers. Added delivered-shipment farmer outcome capture linked to request/trip/shipment and copied expected values where the snapshot supports them. The current source data produces no bookable recommendation, so selection is safely unavailable until verified market data exists. | Server/mobile typechecks passed; `node --import tsx --test tests/fresh-engine.test.ts` — 6 passed; `git diff --check` passed. No live Mongo/API integration test run. | User approved T09–T11 together in chat |
| T10 | `APPROVED` | Added owner-scoped manual buyer quote records with validity and permanent `FARMER_REPORTED_UNVERIFIED` status, plus a share-safe summary that excludes pickup/contact details. | Server/mobile typechecks passed; `git diff --check` passed. No live Mongo/API integration test run. | User approved T09–T11 together in chat |
| T11 | `APPROVED` | Fresh selection creates the existing transport request type and enters the current transporter matching, booking, pricing and payment lifecycle. Fresh-involved shared trips require the same crop and existing same-destination compatibility; quantity and cost stay per farmer in `TripShipment` and the existing pricing allocator. | Server/mobile typechecks passed; `node --import tsx --test tests/fresh-engine.test.ts` — 6 passed; `git diff --check` passed. No live Mongo/API integration test run. | User approved T09–T11 together in chat |
| T12 | `APPROVED` | Added trip-bound incident reporting with onboard-cargo snapshot, affected-party push, safety triage, safe recovery state and unsafe escalation; active-trip ownership is enforced. Files: `apps/server/src/models/RecoveryIncident.ts`, `apps/server/src/modules/recovery/routes.ts`, `apps/server/src/modules/notifications/service.ts`, `apps/server/src/app.ts`. | `npm run typecheck --workspace @kisanpool/server` — passed; `git diff --check` — passed. No integration tests run. | User approved T12–T14 in chat |
| T13 | `APPROVED` | Added verified/capacity-filtered replacement discovery, remaining-leg quote via existing pricing engine, atomic vehicle/open-trip reservation with rollback on conflict, bilateral driver consent, sequential custody acknowledgements with quantity/condition/evidence/distance, mismatch escalation and linked active replacement leg. Existing shipment state transitions authorize the active replacement transporter. Files: recovery model/routes and `apps/server/src/modules/pooling/service.ts`. | `npm run typecheck --workspace @kisanpool/server` — passed; `git diff --check` — passed. No integration tests run. | User approved T12–T14 in chat |
| T14 | `APPROVED` | Added completed-leg cost/commission from bilateral actual-distance acknowledgements and remaining-leg quote from existing pricing functions; the uncompleted leg has no earned compensation recorded yet. Farmer-charge adjustment stays zero, with an admin-visible payout hold. Existing payment/payout rows are never changed and no second transfer is created because the current payment model supports one transporter recipient per shipment. Files: recovery model/routes, pooling state service, `docs/API_CONTRACTS.md`, `docs/DECISIONS.md` (ADR-047). | `npm run typecheck --workspace @kisanpool/server` — passed; `git diff --check` — passed. No integration tests run. | User approved T12–T14 in chat |
| T15 | `IMPLEMENTED_NEEDS_REVIEW` | Added one owner-scoped CargoLedger per TripShipment with append-only idempotent receipt/sale/rejection/return/final-delivery/variance events, optimistic concurrency, kg balance reconciliation, dispatch/receipt mismatch hold, farmer-reported sale evidence, and parent shipment completion guard. | `npm run typecheck --workspace @kisanpool/server` — passed; `git diff --check` — passed. No integration tests run. | Awaiting user review |
| T16 | `IMPLEMENTED_NEEDS_REVIEW` | Added a shared sell-here/reroute options summary and versioned farmer choice plus current-transporter acceptance. Current buyer quotes remain `FARMER_REPORTED_UNVERIFIED`; current-cargo freshness uses original harvest time plus latest reported storage/ripeness/handling. Sunk cost is separated from incremental choice math; unknown values do not produce a recommendation. | `npm run typecheck --workspace @kisanpool/server` — passed; `git diff --check` — passed. No integration tests run. | Awaiting user review |
| T17 | `IMPLEMENTED_NEEDS_REVIEW` | Added operator market evidence records, minimum-benefit and attempt-limit config, expiry/reapproval when market/quote facts change, quote/market/capacity revalidation, idempotent linked TransportRequest creation, transporter/vehicle/price restriction at selection, and parent ledger transitions at child pickup/delivery. Existing booking/payment/tracking paths handle the new leg. | `npm run typecheck --workspace @kisanpool/server` — passed; `git diff --check` — passed. No integration tests run. | Awaiting user review |
| T18 | `IMPLEMENTED_NEEDS_REVIEW` | Added admin-claim-protected, read-only `/admin/fresh-ops` and console panel for stale/invalid prices, open/no-replacement recovery incidents, custody/receipt discrepancies, unsold cargo, pending decisions, no-feasible-market recommendations, and explicit unconfigured import monitoring. | Server/admin typechecks passed; `git diff --check` passed. No live API/database check (MongoDB is not running). | Awaiting user review |
| T19 | `IMPLEMENTED_NEEDS_REVIEW` | Added deterministic tests for exact same-version consent, idempotency payload matching, quantity conservation, partial sale, reroute dispatch/receipt, and over-allocation. Added concurrent reroute duplicate-key recovery to return the existing linked request. | Focused Node test suite — 13 passed; server/admin typechecks passed; `git diff --check` passed. Full API security/concurrency/resilience suites not run: no server or MongoDB integration environment is running. | Awaiting user review |
| T20 | `IMPLEMENTED_NEEDS_REVIEW` | Added a synthetic-only balanced-vs-price/nearest demo acceptance scenario and operator walkthrough. Scenario checks include Fresh ranking, 60 kg partial sale, and the remaining 40 kg moving to a next leg. The demo explicitly separates the ordinary payment ledger and does not claim live recovery, Razorpay settlement, real prices, or measured savings. | `tests/kisanpool-demo.test.ts` — passed as part of the 13-test focused suite; `git diff --check` passed. Full live end-to-end walkthrough was not possible without MongoDB/server; limitations and steps are recorded in `docs/KisanPool_T20_Demo_Acceptance.md`. | Awaiting user review |
| T21 | `DEFERRED` | Future-only | Not run | Deferred by current scope |

## 29.6 Global definition of done

- [ ] T00 confirms actual default branch and implementation paths, lists all applicable agent instruction files found/read, and preserves user changes.
- [ ] T00A prototype uses the current KisanPool theme, contains the four approved flow groups with simulated data clearly labelled, remains isolated from production APIs/business data, and was reviewed/approved by the user before UI implementation tasks.
- [ ] Implemented UI follows applicable repository agent instructions and the approved prototype; unrelated screens are not redesigned without approval.
- [ ] Fresh recommendation uses feasibility filtering and the approved balanced score, with data provenance and explicit uncertainty.
- [ ] No universal crop shelf-life or unsupported crop-loss estimate is presented as fact.
- [ ] Every preview is read-only; selected options use the existing booking/payment lifecycle.
- [ ] A reported vehicle incident can be resolved through safe replacement handover or explicit operations escalation.
- [ ] Original completed-leg compensation and replacement-leg cost are separately auditable and payment-provider-safe.
- [ ] Partial sale updates only the sold quantity; only validated remaining quantity may be rerouted.
- [ ] Sell-here vs reroute requires farmer commercial approval and transporter operational/quote approval; mismatch stops automatic execution.
- [ ] Sunk costs remain in full journey accounting but are not double-subtracted from an incremental future choice.
- [ ] Duplicate requests cannot duplicate sale, shipment quantity, booking, charge or payout.
- [ ] Existing KisanPool features and legacy records continue to work.
- [ ] Relevant unit/integration/e2e/security tests pass, and demo/synthetic data is labelled.
- [ ] Agent task tracker and decision notes are up to date; each next task is blocked pending explicit user approval.
