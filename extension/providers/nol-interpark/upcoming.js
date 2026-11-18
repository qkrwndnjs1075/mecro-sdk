(() => {
  const visible = element => element.getClientRects().length > 0
    && getComputedStyle(element).visibility === "visible";

  function inspect(nowMs) {
    const gate = location.pathname.startsWith("/gates/ticket/");
    const calendar = [...document.querySelectorAll(".react-calendar")].some(visible);
    const kind = gate ? "gate" : calendar ? "calendar" : "detail";
    const label = document.querySelector("h1")?.textContent.trim() || document.title;
    const failure = message => ({opening: null, label, kind, message});
    if (!Number.isFinite(nowMs)) return failure("사이트 시각을 확인해 주세요.");

    let opening;
    if (gate) {
      const buttons = [...document.querySelectorAll("button")].filter(visible);
      const countdowns = buttons.filter(button => /^남은시간\s+\d{2}:\d{2}$/.test(button.textContent.trim()));
      if (countdowns.length === 1 && countdowns[0].disabled) {
        const [, minutes, seconds] = /^남은시간\s+(\d{2}):(\d{2})$/.exec(countdowns[0].textContent.trim());
        if (Number(minutes) < 60 && Number(seconds) < 60) {
          return {
            opening: nowMs + (Number(minutes) * 60 + Number(seconds)) * 1000,
            label, kind, countdown: true,
          };
        }
      }
      const general = buttons.filter(button => /^(\d{2}\/\d{2} \d{2}:\d{2} )?(일반\s*)?예매하기$/.test(button.textContent.trim()));
      if (general.length !== 1) return failure("일반예매 오픈 일시가 표시된 상품 상세 페이지에서 시작해 주세요.");
      const text = general[0].textContent.trim();
      const date = /^(\d{2})\/(\d{2}) (\d{2}):(\d{2}) /.exec(text);
      if (!general[0].disabled) return failure("이미 열린 일반예매는 대기 대상에서 제외됩니다.");
      if (!date) return failure("일반예매 오픈 일시가 표시된 상품 상세 페이지에서 시작해 주세요.");
      const now = new Date(nowMs + 9 * 3600000);
      const month = Number(date[1]);
      let year = now.getUTCFullYear();
      if (now.getUTCMonth() === 11 && month === 1) year++;
      opening = Date.UTC(year, month - 1, Number(date[2]), Number(date[3]) - 9, Number(date[4]));
      const parsed = new Date(opening + 9 * 3600000);
      if (parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== Number(date[2])
        || parsed.getUTCHours() !== Number(date[3]) || parsed.getUTCMinutes() !== Number(date[4])) {
        return failure("일반예매 오픈 일시 형식을 확인할 수 없습니다.");
      }
    } else {
      const cards = [...document.querySelectorAll("li")].filter(element =>
        visible(element) && [...element.children].some(child => child.textContent.trim() === "일반 예매"));
      const dates = [...new Set(cards.flatMap(card =>
        [...card.querySelectorAll("time[datetime]")].map(time => time.getAttribute("datetime"))))];
      if (dates.length !== 1 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(dates[0])) {
        return failure("일반예매 오픈 일시를 확인할 수 없습니다.");
      }
      opening = Date.parse(dates[0]);
      if (calendar) {
        const extra = cards.some(card => [...card.querySelectorAll("span[title]")].some(span => !/^D-\d+$/.test(span.title)));
        if (extra || !/선예매\s*(기간|오픈)/.test(document.body.innerText)) {
          return failure("선택한 회차가 이번 일반예매 대상인지 확인할 수 없습니다.");
        }
        const selection = globalThis.mecroSelection?.read();
        if (!selection?.date || !selection?.time) return failure("날짜와 회차를 선택해 주세요.");
      } else if (!document.body.innerText.includes("공지된 일정에 맞춰 예매를 시작할 수 있어요.")) {
        return failure("일반예매 오픈 예정 화면에서 시작해 주세요.");
      }
    }
    if (!Number.isFinite(opening) || opening <= nowMs) {
      return failure("이미 열린 일반예매는 대기 대상에서 제외됩니다.");
    }
    return {opening, label, kind};
  }
  globalThis.nolUpcoming = {inspect};
})();
