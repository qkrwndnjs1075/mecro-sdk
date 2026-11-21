globalThis.mecroPrepareClick = async function mecroPrepareClick() {
  try {
    return Boolean((await chrome.runtime.sendMessage({op: "prepare"}))?.prepared);
  } catch {
    return false;
  }
};

globalThis.mecroReleaseClick = function mecroReleaseClick() {
  chrome.runtime.sendMessage({op: "release"}).catch(() => {});
};

globalThis.mecroTrustedClick = async function mecroTrustedClick(element) {
  if (!element || typeof element.click !== "function") return false;
  element.scrollIntoView?.({block: "center", inline: "center", behavior: "instant"});
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (rect.width > 0 && rect.height > 0 && Number.isFinite(x) && Number.isFinite(y)) {
    try {
      const reply = await chrome.runtime.sendMessage({op: "click", x, y});
      if (reply?.clicked) return true;
      console.warn("신뢰 클릭 실패:", reply?.error ?? "페이지에서 클릭을 보내지 못했습니다.");
    } catch (error) {
      console.warn("신뢰 클릭 요청 실패:", error instanceof Error ? error.message : String(error));
    }
  }
  // 사이트가 합성 클릭을 허용하는 경우를 위해 기존 동작을 유지한다.
  element.click();
  return false;
};
