export function bookingStage(source, target) {
  const from = new URL(source);
  if (target.origin !== "https://tickets.interpark.com") return null;
  const supported = (from.origin === target.origin && (from.pathname === "/waiting" || /^\/(?:goods|gates\/ticket)\/[A-Za-z0-9]+\/?$/.test(from.pathname))) ||
    (from.origin === "https://nol.yanolja.com" && /^\/ticket\/products\/[A-Za-z0-9]+\/?$/.test(from.pathname));
  if (!supported) return null;
  if (target.pathname === "/waiting") return "queue";
  if (target.pathname === "/onestop/schedule") return "schedule";
  if (target.pathname === "/onestop/seat") return "seat";
  return null;
}

export function matchesGateTransfer(source, target) {
  if (target.origin !== "https://tickets.interpark.com") return false;
  const gateId = /^\/gates\/ticket\/([A-Za-z0-9]+)\/?$/.exec(target.pathname)?.[1];
  if (!gateId) return false;
  const from = new URL(source);
  if (from.origin === "https://nol.yanolja.com") {
    return /^\/ticket\/products\/([A-Za-z0-9]+)\/?$/.exec(from.pathname)?.[1] === gateId;
  }
  return from.origin === target.origin &&
    /^\/(?:goods|gates\/ticket)\/([A-Za-z0-9]+)\/?$/.exec(from.pathname)?.[1] === gateId;
}
