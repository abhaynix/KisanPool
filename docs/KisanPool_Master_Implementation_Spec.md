# KisanPool v3 — Master Product & Implementation Specification

> [!NOTE]
> Legacy KisanPool Fresh sections (1–25) removed.

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
| T18 | `APPROVED` | Added admin-claim-protected, read-only `/admin/fresh-ops` and console panel for stale/invalid prices, open/no-replacement recovery incidents, custody/receipt discrepancies, unsold cargo, pending decisions, no-feasible-market recommendations, and explicit unconfigured import monitoring. | Server/admin typechecks passed; `git diff --check` passed. No live API/database check (MongoDB is not running). | User approved by asking to continue with the remaining work |
| T19 | `APPROVED` | Added deterministic tests for exact same-version consent, idempotency payload matching, quantity conservation, partial sale, reroute dispatch/receipt, and over-allocation. Added concurrent reroute duplicate-key recovery to return the existing linked request. | Focused Node test suite — 13 passed; server/admin typechecks passed; `git diff --check` passed. Full API security/concurrency/resilience suites not run: no server or MongoDB integration environment is running. | User approved by asking to continue with the remaining work |
| T20 | `IMPLEMENTED_NEEDS_REVIEW` | Deterministic local synthetic market comparison and 100→60→40 kg helper scenario. This status reflects the offline synthetic portion only; no live market or full API acceptance is claimed. | Current offline suite has 21 passing tests including four distinct demo views, calculations, model registration, price aging and cargo math. Live MongoDB/API/device acceptance remains unrun. | Full end-to-end review pending |

### Prior revalidation note (2026-10-25, before continuation)

At the prior run, confirmed gaps were: no market-price/acceptance read path, a reference-only seeded demo, no canonical `Market` model, and a replacement settlement entry with zero earned compensation. The continuation below addresses the demo and market catalogue/read-path gaps and adds expected-versus-earned settlement records with admin verification of completed-leg distance. Live MongoDB integration was not available.

Revalidation commands from the previous run: `npm test` (17 passed); `npm run build:shared && npm run typecheck` (passed); server and admin builds (passed); `git diff --check` (passed). Mobile production build is not available because the package has no `build` script; mobile typecheck passed. Docker CLI is installed but its daemon is unavailable in this environment.

### Continuation note (2026-10-25)

Implemented the deterministic in-memory four-market scenario behind the local feature flag, with distinct winners for balanced/highest-net/fastest/closest, detailed synthetic provenance and non-bookable output. Added canonical Market and acceptance-observation models, current market evidence read path, admin evidence-entry endpoints, dynamic stale price handling, and admin visibility plus idempotent completion-fact reconciliation for recovery per-leg earnings. Recovery trips now skip order-attached single-recipient payouts and remain pending until per-leg provider reconciliation. The demo endpoint needs only normal farmer login and `FRESH_DEMO_DATA=true`; it does not need `seed:fresh`. Official AGMARKNET/OGD source capability was reviewed, but no API key, commodity mapping or verified ingestion pipeline is configured. No recovery transfer is asserted complete.

Continuation checks: `npm test` (21 passed); workspace typechecks, shared build, server build, admin build and `git diff --check` passed. The Docker CLI exists, but the Docker daemon did not start/connect; no MongoDB API integration or device walk-through ran. Mobile has typecheck only because it defines no production build script.
| T21 | `DEFERRED` | Checked repository source, configuration and documentation: no real sensor/device provider or approved operational use case is present. No sensor data or integration has been fabricated. | Not implemented, per the T21 prerequisite. | Remains deferred until a real source and use case are provided/approved |

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
