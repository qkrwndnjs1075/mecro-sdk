globalThis.startBookingWait = function startBookingWait(provider) {
  const product = location.origin + location.pathname;
  const gate = provider.isGate;
  let state;
  let timer;
  let generation = 0;
  let busy = false;
  let cancellation;
  let siteClock = null;
  const siteNow = () => siteClock ? siteClock.value + performance.now() - siteClock.at : NaN;

  async function storage(op, value) {
    const reply = await chrome.runtime.sendMessage({op, state: value});
    if (reply.error) throw Error(reply.error);
    return reply.state;
  }
  async function save(value) {
    const previous = state;
    state = value;
    try {
      await storage(value ? "save" : "clear", value);
    } catch (error) {
      if (state === value) state = previous;
      throw error;
    }
  }
  const current = token => token === generation && product === location.origin + location.pathname;
  async function mayContinue(token) {
    if (cancellation) await cancellation.catch(() => {});
    return current(token);
  }
  function cancel() {
    if (!cancellation) {
      cancellation = storage("clear").then(() => {
        generation++;
        clearTimeout(timer);
        state = null;
      }).finally(() => { cancellation = undefined; });
    }
    return cancellation;
  }
  const active = () => state && state.phase !== "done";
  const delayError = "사이트 기준 시각을 확인하지 못했습니다. 다시 시도해 주세요.";

  async function syncClock() {
    const url = new URL(location.href);
    url.searchParams.set("_mecro_clock", crypto.randomUUID());
    const response = await fetch(url, {
      method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    const ageHeader = response.headers.get("Age");
    const age = ageHeader === null ? 0 : /^\d+$/.test(ageHeader) ? Number(ageHeader) : NaN;
    const site = Date.parse(response.headers.get("Date")) + age * 1000;
    if (!response.ok || response.redirected || !Number.isFinite(site) || !Number.isSafeInteger(age)) {
      throw Error(delayError);
    }
    siteClock = {value: site, at: performance.now(), local: Date.now()};
  }
  async function finish(message) {
    await save({...state, phase: "done", message});
  }
  async function enterBooking(token) {
    const {date, time} = state.selection ?? {};
    const sameSelection = () => {
      if (!state.selection) return true;
      const selected = provider.selection.read();
      return selected.date === date && selected.time === time;
    };
    await save({...state, phase: "booking", message: "예매하기 버튼이 열리기를 기다립니다."});
    while (await mayContinue(token)) {
      if (!sameSelection()) {
        await finish("선택한 회차가 변경되어 예매를 중단했습니다.");
        return;
      }
      const button = provider.findButton();
      if (button) {
        const announced = provider.inspect(siteNow());
        if (announced.opening && announced.opening > siteNow()) {
          await finish("일반예매 오픈 일정이 변경되어 대기를 종료했습니다.");
          return;
        }
        await save({...state, phase: gate ? "done" : "handoff", message: gate ? "일반예매 진입을 시도했습니다." : "예매 준비 화면으로 이동합니다."});
        if (!await mayContinue(token)) return;
        if (sameSelection() && provider.findButton() === button) {
          button.click();
        } else {
          await finish("회차 또는 예매 버튼이 변경되어 예매를 중단했습니다.");
        }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  function schedule(deadline, token) {
    const tick = async () => {
      if (!await mayContinue(token)) return;
      try {
        // Some platforms pause the monotonic clock during system sleep.
        if (Math.abs((Date.now() - siteClock.local) - (performance.now() - siteClock.at)) > 2000) {
          await syncClock();
          if (!await mayContinue(token)) return;
          deadline = performance.now() + state.opening - siteNow();
        }
        const remaining = deadline - performance.now();
        if (remaining > 0) {
          timer = setTimeout(tick, Math.min(remaining, 30000));
          return;
        }
        await save({...state, phase: "refreshing", message: gate ? "일반예매 버튼을 기다립니다." : "새로고침 중…"});
        if (await mayContinue(token)) {
          if (gate) await enterBooking(token);
          else location.reload();
        }
      } catch (error) {
        if (!await mayContinue(token)) return;
        if (state.phase === "waiting") {
          timer = setTimeout(tick, 2000);
        } else if (current(token)) {
          await finish(error instanceof Error ? error.message : "대기를 계속할 수 없습니다.");
        }
      }
    };
    tick();
  }
  const loaded = (async () => {
    state = await storage("load");
    if (state && (state.version !== 2 || state.product !== product)) await save(null);
    if (gate && state?.selection) await save({...state, selection: null});
  })();
  async function resume() {
    const token = generation;
    await loaded;
    if (!await mayContinue(token)) return;
    if (!active()) return;
    if (state.phase === "handoff" && !gate) return;
    const waiting = state.phase === "waiting";
    await syncClock();
    if (!await mayContinue(token)) return;
    const deadline = performance.now() + state.opening - siteNow();
    if (waiting) schedule(deadline, token);
    const restored = !state.selection || await provider.selection.restore(state.selection, () => current(token) && !(waiting && state.phase === "refreshing"));
    if (!await mayContinue(token) || (waiting && state.phase === "refreshing")) return;
    if (!restored || !waiting) {
      clearTimeout(timer);
      if (!restored) await finish("원래 회차를 확인할 수 없어 대기를 종료했습니다.");
      else await enterBooking(token);
    }
  }
  const initialGeneration = generation;
  const ready = resume().catch(async () => {
    if (await mayContinue(initialGeneration) && state) await finish(delayError);
  });
  addEventListener("pagehide", () => {
    generation++;
    clearTimeout(timer);
  });
  globalThis.navigation?.addEventListener("currententrychange", () => {
    if (product === location.origin + location.pathname) return;
    generation++;
    clearTimeout(timer);
    state = null;
  });
  addEventListener("pageshow", event => {
    if (event.persisted) state = null;
  });
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    async function handle() {
      await loaded;
      if (state?.phase === "handoff") state = await storage("load");
      if (request.action === "inspect" && (!siteClock || (!active() && state?.phase !== "handoff"))) {
        await syncClock().catch(error => { siteClock = null; throw error; });
      }
      if (product !== location.origin + location.pathname) throw Error("공연 페이지를 다시 열어 주세요.");
      if (request.action === "start") {
        if (active() || busy || cancellation) return;
        await ready;
        if (!active() && !busy) {
          busy = true;
          try {
            const token = ++generation;
            await syncClock();
            if (!await mayContinue(token)) return;
            const details = provider.inspect(siteNow());
            const opening = details.opening;
            if (!opening) throw Error(details.message || "일반예매 오픈 일정을 확인하지 못했습니다.");
            const selection = details.kind === "calendar" ? provider.selection.read() : null;
            if (selection && !selection.date) throw Error(selection.message);
            const deadline = performance.now() + opening - siteNow();
            if (!Number.isFinite(deadline) || (deadline <= performance.now() && !details.countdown)) {
              throw Error("일반예매 오픈 시각이 지났습니다.");
            }
            if (current(token)) {
              await save({version: 2, product, selection, opening, label: details.label, phase: "waiting", message: "일반예매 오픈을 기다립니다."});
              if (await mayContinue(token)) schedule(deadline, token);
            }
          } finally { busy = false; }
        }
      } else if (request.action === "cancel") {
        await cancel();
      }
    }
    handle().then(() => state?.message ?? "", error => error.message).then(message => {
      if (product !== location.origin + location.pathname) {
        respond({siteName: provider.name, active: false, canStart: false, message: "새 공연에서 대기하려면 페이지를 새로고침해 주세요."});
        return;
      }
      const details = provider.inspect(siteNow());
      const saved = active() ? state : null;
      const round = saved?.selection ?? (details.kind === "calendar" ? provider.selection.read() : null);
      respond({siteName: provider.name, serverTime: siteNow(), label: saved?.label ?? details.label, round, opening: saved?.opening ?? details.opening, message: message || details.message, canStart: !active() && !busy && Number.isFinite(siteNow()) && (details.opening > siteNow() || details.countdown === true), active: Boolean(active()) || busy});
    });
    return true;
  });
};
