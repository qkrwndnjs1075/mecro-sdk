import {matchesBookingWindow, matchesGateTransfer as nolTransfer} from "./nol-interpark/navigation.js";

const gateTransfers = [nolTransfer];

export function matchesBookingTransfer(state, target) {
  return state?.phase === "handoff" && gateTransfers.some(matches => matches(state.product, target));
}

export function reachedBookingWindow(state, target) {
  return state?.phase === "handoff" && matchesBookingWindow(state.product, target);
}
