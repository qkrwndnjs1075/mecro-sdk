const element = id => document.getElementById(id);
const openingFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short",
});
const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
let pending = false;

async function update(action) {
  if (pending) return;
  pending = true;
  element("start").disabled = true;
  element("cancel").disabled = true;
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {action}, {frameId: 0});
    element("selection").textContent = result.label || "일반예매 일정을 찾지 못했습니다.";
    element("round").hidden = !result.round?.date;
    element("round").textContent = result.round?.date ? result.round.date + " · " + result.round.time : "";
    element("opening").textContent = result.opening ? openingFormat.format(result.opening) + " (한국시간)" : "";
    element("status").textContent = result.message || "";
    element("start").disabled = !result.canStart || result.active;
    element("cancel").hidden = !result.active;
  } catch {
    element("selection").textContent = "NOL 인터파크 상품 또는 예매 대기 페이지에서 열어 주세요.";
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
await update("inspect");
