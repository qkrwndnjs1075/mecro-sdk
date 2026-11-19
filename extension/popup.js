const element = id => document.getElementById(id);
const openingFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("ko-KR", {timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric"});
const clockFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
let clockTimer;
function displayClock(serverTime) {
  clearTimeout(clockTimer);
  if (!Number.isFinite(serverTime)) {
    element("clock").textContent = "확인 불가";
    return;
  }
  const received = performance.now();
  function tick() {
    const now = serverTime + (performance.now() - received);
    element("clock").textContent = clockFormat.format(now);
    clockTimer = setTimeout(tick, 1000 - now % 1000);
  }
  tick();
}
const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
let pending = false;

async function update(action) {
  if (pending) return;
  pending = true;
  element("start").disabled = true;
  element("cancel").disabled = true;
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {action}, {frameId: 0});
    const prefix = result.siteName ? result.siteName + " " : "";
    element("booking-label").textContent = prefix + "일반예매";
    element("clock-label").textContent = prefix + "서버 시각";
    element("selection").textContent = result.label || "일반예매 일정을 찾지 못했습니다.";
    element("round").hidden = !result.round?.date;
    element("round").textContent = result.round?.date ? result.round.date + " · " + result.round.time : "";
    element("schedule").hidden = false;
    displayClock(result.serverTime);
    element("opening-row").hidden = !result.opening;
    element("opening").textContent = result.opening ? dateFormat.format(result.opening) + " · " + openingFormat.format(result.opening) : "";
    element("start").hidden = result.active;
    element("status").textContent = result.message || "";
    element("start").disabled = !result.canStart || result.active;
    element("cancel").hidden = !result.active;
  } catch {
    clearTimeout(clockTimer);
    element("schedule").hidden = true;
    element("start").hidden = false;
    element("booking-label").textContent = "일반예매";
    element("selection").textContent = "지원하는 예매처의 상품 또는 예매 대기 페이지에서 열어 주세요.";
    element("opening").textContent = "";
    element("round").hidden = true;
    element("cancel").hidden = true;
    element("status").textContent = "확장을 업데이트했다면 페이지를 새로고침해 주세요.";
  } finally {
    pending = false;
    element("cancel").disabled = false;
  }
}
element("start").onclick = () => update("start");
element("cancel").onclick = () => update("cancel");
chrome.storage.session.onChanged.addListener(changes => {
  if (changes[tab.id]?.newValue?.phase === "done") void update("inspect");
});
await update("inspect");
