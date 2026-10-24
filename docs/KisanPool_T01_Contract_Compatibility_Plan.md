# KisanPool T01 — Contract and Compatibility Plan

**Status:** `IMPLEMENTED_NEEDS_REVIEW`  
**Scope:** Contract/change map only. No production API, schema, service, or UI implementation is included in T01.  
**References:** `KisanPool_Master_Implementation_Spec.md` §§12–13, 25–28; approved T00A prototype at `docs/prototypes/kisanpool-fresh-t00a.html` and `apps/mobile/app/(farmer)/fresh-prototype.tsx`.

## 1. Contract decisions

1. Fresh is a recommendation and snapshot layer. It calls the existing transport/map/pricing capabilities; it does not own request matching, booking, capacity, payment, or payout.
2. An existing `Trip` remains the shared outbound journey and `TripShipment` remains the farmer's load on that trip. Recovery legs, incident reports, custody transfers, quantity movements, and leg settlements are linked records; they do not reinterpret existing trip/shipment states.
3. Commercial sale disposition and physical custody are distinct. A sale of some quantity does not deliver or complete the entire `TripShipment`.
4. Realtime events are versioned notifications to authorized parties after the authoritative database write. Clients refetch the resource for the full current state.
5. New transitions that allocate, transfer, sell, or settle cargo must be idempotent and concurrency-safe. A quote or recommendation preview has no booking, capacity, or payment side effects.

## 2. Current v3 compatibility baseline

- REST uses `{ success: true, data, requestId }` / `{ success: false, error: { code, message }, requestId }`; `ApiError`, `ok`, and the central `ErrorCode` registry are the implementation conventions.
- The error registry is closed at 25 values. A new error code requires an ADR in `docs/DECISIONS.md` and an update to `docs/API_CONTRACTS.md` §5 before shared/server/mobile code uses it. Prefer current codes and valid result states; do not add the older proposed `FRESH_*` codes by assumption.
- Pooling lifecycle is already split into `TransportRequest` (`OPEN`, `TRANSPORTER_INTERESTED`, `CONFIRMED`, `CANCELLED`, `EXPIRED`), offer, `Trip` (`FORMING` through `COMPLETED`/`CANCELLED`), and `TripShipment` (from `ASSIGNED` through payment and completion). Selection creates the trip/shipment and reserves capacity. Existing selection routes remain authoritative.
- `Trip.returnLeg` and `ReturnLegState` support homeward backhaul. They are not a model for breakdown recovery or a new outbound market leg.
- `TripShipment.finalPrice` freezes the delivered shipment price for the current payment flow. `Payment` and payout state remain owned by the payments module; recovery settlement must not mutate them or issue a second transfer.
- Socket.IO already uses authenticated user rooms and access-checked request/trip rooms. Existing pooling events include `offer:*`, `trip:pricing_updated`, `trip:capacity`, and `shipment:state`. MongoDB is authoritative; the resilience journal records critical mutation intent and requires stable operation keys.
- Existing source routes are mounted under `/transport`, `/pool`, `/shipments`, `/payments`, `/maps`, etc. The older `docs/API_CONTRACTS.md` request/accept descriptions do not fully match the current pooling routes; later API implementation must update the docs alongside the implementation.

## 3. Proposed API and module ownership

These are proposed contracts, not live endpoints. Keep the shared envelope, JWT role checks, ownership checks, validation, `requestId`, and normal error registry.

| Capability | Proposed contract | Owner and side effects |
|---|---|---|
| Crop catalogue | `GET /fresh/crops` | Fresh read service; returns supported profiles and versions. |
| Recommendation | `POST /fresh/recommendations`; `GET /fresh/recommendations/:id` | Fresh orchestration and immutable snapshot service. POST calculates only; GET returns the saved snapshot without recomputation. Farmer owns snapshot. |
| Recommendation handoff | `POST /fresh/recommendations/:id/select` with option ID/version and warning acknowledgements | Fresh validates ownership/expiry and refreshes volatile facts. Material quote changes return a reconfirmation result. On confirmation call existing transport request creation; normal pool offer selection still creates the booking/trip. No payment debit here. |
| Incident | `POST /transport/incidents`; `GET /transport/incidents/:id`; role-scoped list; `POST /transport/incidents/:id/triage` | Transport recovery service. Reporter must be a trip participant or authorized operations actor. Incident links affected trip and shipment IDs/quantities. |
| Replacement search/choice | `POST /transport/incidents/:id/replacement-options` (preview); `POST /transport/incidents/:id/replacement-selection` | Existing map/matching/pricing services supply route, eligibility, and quote. Preview reserves nothing. Selection requires fresh availability and policy approvals. |
| Custody transfer | `POST /transport/incidents/:id/handovers`; `POST /transport/handovers/:id/acknowledgements` | Recovery service writes immutable transfer facts and party acknowledgements. The active custodian changes only after all required acknowledgements agree. |
| Leg tracking | `GET /transport/journeys/:id`; `GET /transport/journeys/:id/legs`; existing trip/shipment reads remain supported | Transport recovery service presents linked original trip and subsequent legs; existing routes retain current DTO/state meanings. |
| Partial quantity | `POST /shipments/:id/quantity-events`; `GET /shipments/:id/quantity-ledger` | Shipment/quantity-ledger service. Append-only signed events with idempotency key; no direct client mutation of aggregate quantity/status. |
| Sell/reroute choices | `GET /shipments/:id/remaining-cargo/options`; `POST /shipments/:id/decisions` | Fresh recommendation/pricing orchestration for eligible cargo; returns `SELL_HERE`, `REROUTE_TO_MARKET`, or `HOLD_OR_ESCALATE` options with source, quote, expiry and version. No capacity reservation. |
| Consent and execution | `POST /shipments/:id/decisions/:decisionId/approvals`; `POST /shipments/:id/decisions/:decisionId/commit` | Farmer approves commercial choice; current transporter approves logistics/quote. Commit requires both approvals for identical option/version, fresh quote/capacity/market checks, and creates a linked next leg through existing transport services. Declines/expiry preserve custody and route to operations. |
| Settlement | Internal recovery settlement service; expose read-only ledger under authorized journey/operations views | Recovery accounting calculates per-leg earned/approved amounts using existing pricing and payout integrations. It never directly changes payment/payout statuses. |

Use `200` for successful reads/previews and `201` for newly created resources, following existing route patterns. Return insufficient-data/no-feasible outcomes as explicit result status plus warnings when the request itself is valid; reserve errors for invalid/auth/not-found/conflict/provider-failure cases. Any new error vocabulary requires the mandated ADR/API-contract update first.

## 4. State contracts

### Fresh snapshot

`GENERATED -> SELECTED | EXPIRED` (selection is a link to a transport request, not a booking confirmation). Store immutable normalized inputs, source observations, quote and route snapshots, policy/model versions, candidate options, warnings and generated/expiry times. A read never refreshes the saved result. Selection revalidates volatile quote and availability and asks for reconfirmation when material values changed.

### Incident and recovery

Incident: `REPORTED -> TRIAGING -> RECOVERY_REQUIRED -> SEARCHING_REPLACEMENT -> AWAITING_CONFIRMATION -> HANDOVER_IN_PROGRESS -> RECOVERED -> CLOSED`.

Non-success outcomes: `NO_REPLACEMENT_AVAILABLE`, `ESCALATED_TO_OPERATIONS`, `CANCELLED` (only with a documented safe cargo disposition). A safety uncertainty, failed/mismatched handover, or no suitable vehicle never advances to `RECOVERED` or delivered.

Replacement leg: `PROPOSED -> APPROVAL_PENDING -> BOOKED -> IN_PROGRESS -> ARRIVED -> COMPLETED`; also `DECLINED`, `EXPIRED`, `CANCELLED`, `FAILED`. A candidate is not a leg commitment until capacity and approvals are revalidated. Initial scope is one replacement vehicle and sequential legs; multi-truck split is excluded.

Custody handover: `PROPOSED -> ACKNOWLEDGED -> COMPLETED`, with `DISPUTED`/`CANCELLED` branches. Store sender/receiver identities, affected shipment and quantity, location/time, reported and verified weights/package counts, condition, evidence references, and each required acknowledgement. Ownership/custody changes atomically only on matching required acknowledgements; discrepancy freezes normal completion and escalates.

### Quantity and sale ledger

Record append-only events with canonical kg quantities, original reported unit/value, actor, time, event key and evidence/source. Event categories include receipt, accepted/sold, rejected/damaged, reserved for a next leg, released from reservation, returned, delivered/final disposition, and documented variance. Reservation and sale consume available quantity exactly once. At each reconciliation checkpoint:

`receivedKg = soldOrAcceptedKg + rejectedOrDamagedKg + remainingAvailableKg + documentedVarianceKg`

Reserved/in-transit quantities are a substate of remaining quantity, not an extra balance term. Enforce non-negative quantities and prevent duplicate physical allocation under retries or concurrent commits. Shipment completion remains blocked while any quantity is in transit or lacks final disposition.

### Remaining cargo decision and settlement

Decision: `OPTIONS_READY -> FARMER_APPROVED + TRANSPORTER_APPROVED (same option/version) -> REVALIDATING -> COMMITTED`; alternatives are `DECLINED`, `EXPIRED`, `NEEDS_RECONFIRMATION`, `ESCALATED`. Commit repeats market acceptance, vehicle capacity, route/ETA, price or buyer-offer validity, remaining quantity, quote and deadline checks. A changed material fact invalidates approvals.

Compare sell-here proceeds against reroute proceeds less only new future route/handling costs. Keep already incurred costs in end-to-end accounting but exclude them from incremental choice math. Per-leg settlement entries separately record quote, actual cost, approved farmer charge, earned transporter compensation, adjustment/reason, approval, provider transfer reference, and idempotency key. Dispute/liability review does not silently erase earned completed-leg compensation.

## 5. Events and authorization

Add typed shared payloads only with server-owned resource IDs, monotonically increasing resource version, state, `occurredAt`, and a minimal display-safe summary. Candidate names: `incident:state`, `incident:replacement_options`, `cargo:custody`, `shipment:quantity`, `shipment:decision`, and `journey:leg`. Emit only after durable commit. Join trip/request rooms only after existing party checks; user-room events go only to farmer, affected transporter(s), and assigned operations recipients. Do not broadcast one farmer's private shipment/financial fields to other pool participants. Events prompt a refetch; they are not the authoritative ledger.

REST reads enforce farmer ownership or trip participation. Writes enforce role plus resource relationship: farmer decides commercial disposition; current transporter confirms operational feasibility and their quote; replacement transporter acknowledges incoming custody; operations can triage/escalate/override only with audit. Require idempotency keys on sale/quantity, handover completion, leg commit, and settlement mutations. Use optimistic version checks or a transaction/conditional update so two requests cannot consume the same remaining quantity or capacity.

## 6. Compatibility, migration, and implementation sequence

1. Additive models/optional references only: Fresh snapshots/provenance, incident, recovery leg, custody event, quantity event, decision/approval, and recovery settlement. Do not rename or repurpose `Trip`, `TripShipment`, `Trip.returnLeg`, shipment `state`, `finalPrice`, `Payment`, or existing routes.
2. For legacy records, the existing trip/shipment is the original journey/leg by reference; do not fabricate historical leg or custody events. A missing recovery/quantity ledger means “legacy, no recorded recovery/partial sale,” not zero or verified data. Preserve existing DTO output; add optional related-resource links or separate endpoints.
3. Add optional `journeyId`/`activeLegId` references only after ownership and cardinality are settled in schema review. Keep original `tripId` on `TripShipment` as immutable source linkage. New `TransportLeg` references parent trip/journey and exactly the affected shipment IDs/quantities.
4. Design uniqueness/idempotency indexes after checking existing schema/index declarations. Deploy additive indexes and code compatibly; do not assume old data is complete. Backfill only mechanically provable links and report ambiguous records for operations review.
5. Route candidate and leg quotes through current map, matching and pricing modules. If whole-trip pricing needs a leg-specific pure function, extract/reuse it in the pricing task and preserve prior quote versions. Keep per-leg recovery settlement separate from the existing shipment payment/payout lifecycle.
6. Extend the durable journal only for committed critical business mutations (sale/quantity event, handover, leg commit, settlement intent) with stable operation keys and a schema-version/reconciliation plan. A journal intent is never reported as a completed database/payment operation.
7. Update `docs/API_CONTRACTS.md`, `docs/ARCHITECTURE.md`, `packages/shared` DTOs/enums/events, server routes/services/models, authorization, notifications, and mobile screens in their scoped tasks. API docs must describe actual routes, not the historical request/accept API.

## 7. Module ownership map

| Domain | Primary owner | Integrations |
|---|---|---|
| Price provenance/market records | Fresh market data module | Import/operator confirmation and source validation |
| Route and transport preview | Maps + pooling pricing/matching | Fresh calls as read-only preview; recovery uses current incident point |
| Recommendation and immutable snapshot | Fresh service | Crop profile, prices, maps, transport quote; invokes existing request service on explicit handoff |
| Incident, leg, custody, recovery settlement | Transport recovery module | Pooling, maps, pricing, realtime/notifications, payments/payout interfaces |
| Quantity ledger and remaining-cargo decision | Shipment domain with Fresh decision adapter | Market/buyer observations, pricing, recovery leg commit |
| Payment/payout truth | Existing payments module/provider reconciliation | Recovery settlement submits idempotent authorized entries; does not edit payment state |
| Client state/presentation | Existing farmer/transporter app routes and shared components | Approved T00A prototype is the flow reference; preserve runtime theme from `theme.ts` |

## 8. T00A prototype mapping

The approved prototype's crop form maps to Fresh input/snapshot; market comparison maps to option snapshots with visible provenance and confidence; incident/recovery maps to incident status, replacement ETA/quote and custody acknowledgements; partial sale/reroute maps to quantity-ledger summary and same-option bilateral approval. Prototype controls are illustrative only and do not establish business state. Existing app theme tokens remain authoritative where the legacy design notes conflict.

## 9. Scope gates and unresolved decisions for implementation tasks

- Define policy for which handovers require farmer/operations acknowledgement, in addition to outgoing and incoming drivers.
- Define material quote-change threshold, approval expiry, maximum reroute attempts, and minimum incremental benefit as reviewed configuration; do not hard-code speculative values.
- Confirm current route/service ownership and transactional guarantees before selecting one aggregate versus separate records. Keep each quantity event and state transition auditable if Mongo transaction support is unavailable.
- Agree evidence retention/access policy for photos and location. Avoid storing sensitive proof in the resilience journal.
- Reconcile `docs/API_CONTRACTS.md` with actual v3 route inventory during the first API implementation task.

T01 exits with a reviewed contract map. These policy values do not block the design document; they must be resolved before the dependent implementation path commits irreversible behavior.
