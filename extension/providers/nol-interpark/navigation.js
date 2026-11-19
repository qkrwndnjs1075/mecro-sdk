export function matchesBookingWindow(source, target) {
  const from = new URL(source);
  return target.origin === "https://tickets.interpark.com" && target.pathname === "/onestop/seat" &&
    ((from.origin === target.origin && /^\/(?:goods|gates\/ticket)\/[A-Za-z0-9]+\/?$/.test(from.pathname)) ||
     (from.origin === "https://nol.yanolja.com" && /^\/ticket\/products\/[A-Za-z0-9]+\/?$/.test(from.pathname)));
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
