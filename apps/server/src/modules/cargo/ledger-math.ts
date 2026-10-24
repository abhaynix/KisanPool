export interface CargoQuantityState {
  receivedKg: number;
  soldKg: number;
  rejectedKg: number;
  returnedKg: number;
  deliveredKg: number;
  inTransitKg: number;
  remainingAvailableKg: number;
  documentedVarianceKg: number;
}

export type CargoQuantityEvent = 'SALE' | 'REJECTED' | 'RETURNED' | 'FINAL_DELIVERY' | 'REROUTE_DISPATCHED' | 'REROUTE_RECEIVED' | 'VARIANCE';

export function cargoEventMatches(existing: { type: string; quantityKg: number; decisionPlanVersion?: number | null; priceINRPerKg?: number | null }, incoming: { type: string; quantityKg: number; decisionPlanVersion?: number | null; priceINRPerKg?: number | null }): boolean {
  return existing.type === incoming.type && existing.quantityKg === incoming.quantityKg &&
    existing.decisionPlanVersion === incoming.decisionPlanVersion && existing.priceINRPerKg === incoming.priceINRPerKg;
}

export function hasSameOptionApprovals(plan: {
  version: number; option: string;
  farmerApproval?: { version?: number; option?: string } | null;
  transporterApproval?: { version?: number; option?: string; accepted?: boolean } | null;
}): boolean {
  return plan.farmerApproval?.version === plan.version && plan.farmerApproval.option === plan.option &&
    plan.transporterApproval?.version === plan.version && plan.transporterApproval.option === plan.option &&
    plan.transporterApproval.accepted === true;
}

export function cargoBalanceIsValid(state: CargoQuantityState, toleranceKg = 0.000001): boolean {
  const accounted = state.soldKg + state.rejectedKg + state.returnedKg + state.deliveredKg + state.inTransitKg + state.remainingAvailableKg + state.documentedVarianceKg;
  return Math.abs(state.receivedKg - accounted) <= toleranceKg;
}

/** Return the next balanced state, or null when the event would over-allocate quantity. */
export function applyCargoQuantityEvent(state: CargoQuantityState, type: CargoQuantityEvent, quantityKg: number): CargoQuantityState | null {
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) return null;
  if (type === 'REROUTE_RECEIVED') {
    if (quantityKg > state.inTransitKg) return null;
    const next = { ...state, inTransitKg: state.inTransitKg - quantityKg, remainingAvailableKg: state.remainingAvailableKg + quantityKg };
    return cargoBalanceIsValid(next) ? next : null;
  }
  if (quantityKg > state.remainingAvailableKg) return null;
  const next = { ...state, remainingAvailableKg: state.remainingAvailableKg - quantityKg };
  switch (type) {
    case 'SALE': next.soldKg += quantityKg; break;
    case 'REJECTED': next.rejectedKg += quantityKg; break;
    case 'RETURNED': next.returnedKg += quantityKg; break;
    case 'FINAL_DELIVERY': next.deliveredKg += quantityKg; break;
    case 'REROUTE_DISPATCHED': next.inTransitKg += quantityKg; break;
    case 'VARIANCE': next.documentedVarianceKg += quantityKg; break;
  }
  return cargoBalanceIsValid(next) ? next : null;
}
