import {bookingStage, matchesGateTransfer as nolTransfer} from "./nol-interpark/navigation.js";

const gateTransfers = [nolTransfer];

export function matchesBookingTransfer(state, target) {
  return state?.phase === "handoff" && gateTransfers.some(matches => matches(state.product, target));
}

export function observedEntry(state, target) {
  if (state?.phase !== "handoff" && state?.phase !== "refreshing" && state?.entryStage !== "queue") return null;
  const entryStage = bookingStage(state.product, target);
  if (!entryStage) return null;
  const messages = {queue: "예매 대기열에 진입했습니다.", schedule: "일정 선택 화면이 열렸습니다.", seat: "좌석 선택 화면이 열렸습니다."};
  return {...state, phase: "done", entryStage, message: messages[entryStage]};
}
