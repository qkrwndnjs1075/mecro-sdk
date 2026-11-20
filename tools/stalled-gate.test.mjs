import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import vm from "node:vm";

const wait = readFileSync(new URL("../extension/core/wait.js", import.meta.url), "utf8");

for (const outcome of ["open", "closed", "loading then open", "loading then closed", "opens in place"]) {
  test(`stalled gate refreshes once: ${outcome}`, async () => {
    const base = Date.UTC(2026, 10, 20);
    let now = 0, saved, receive, reloads = 0, clicks = 0, trustedClicks = 0;
    const timers = new Map();
    const drain = () => new Promise(resolve => setImmediate(resolve));
    class WallClock extends Date { static now() { return base + now; } }
    const location = new URL("https://example.test/gate");
    location.reload = () => { reloads++; };
    const button = new EventTarget();
    button.click = () => { button.dispatchEvent(new Event("click")); };
    button.addEventListener("click", () => { clicks++; });
    async function loadPage() {
      const context = vm.createContext({
        location, URL, Date: WallClock, performance: {now: () => now}, crypto, AbortSignal,
        fetch: async () => new Response(null, {headers: {Date: new Date(base + now).toUTCString()}}),
        addEventListener() {}, clearTimeout: id => timers.delete(id),
        setTimeout(fn, ms) { const id = Symbol(); timers.set(id, {fn, at: now + ms}); return id; },
        chrome: {runtime: {
          onMessage: {addListener(fn) { receive = fn; }},
          sendMessage: async ({op, state}) => {
            if (op === "save") saved = state;
            return {state: saved};
          },
        }},
        mecroTrustedClick: async element => { trustedClicks++; element.click(); },
      });
      vm.runInContext(wait, context);
      context.startBookingWait({
        name: "Fixture", isGate: true,
        inspect: () => ({opening: reloads ? null : base + 1000, countdown: !reloads}),
        isLoading: () => reloads && outcome.startsWith("loading") && now < 75000,
        findButton: () => {
          if (outcome === "opens in place" && now >= 1200) return button;
          return reloads && (outcome === "open" || (outcome === "loading then open" && now >= 75000)) ? button : null;
        },
      });
      await drain();
    }
    async function advance(ms) {
      now += ms;
      for (const [id, task] of [...timers]) {
        if (task.at <= now) { timers.delete(id); task.fn(); }
      }
      await drain();
    }
    async function assertHandoff() {
      const status = await new Promise(resolve => receive({action: "inspect"}, null, resolve));
      assert.equal(saved.phase, "handoff");
      assert.equal(clicks, 1);
      assert.equal(trustedClicks, 1);
      assert.equal(status.active, false);
    }
    await loadPage();
    await new Promise(resolve => receive({action: "start"}, null, resolve));
    await advance(999);
    assert.equal(reloads, 0);
    await advance(1);
    assert.equal(reloads, 0);
    if (outcome === "opens in place") {
      await advance(200);
      await assertHandoff();
      assert.equal(reloads, 0);
      assert.equal(timers.size, 0);
      return;
    }
    await advance(30000);
    assert.equal(reloads, 1);
    assert.equal(saved.phase, "refreshing");
    assert.equal(clicks, 0);
    await loadPage();
    await advance(31000);
    if (outcome.startsWith("loading")) {
      assert.equal(saved.phase, "booking");
      assert.equal(clicks, 0);
      await advance(15000);
      await advance(31000);
    }
    const opensAfterReload = outcome.endsWith("open");
    assert.equal(reloads, 1);
    if (opensAfterReload) await assertHandoff();
    else assert.equal(saved.phase, "done");
    assert.equal(clicks, opensAfterReload ? 1 : 0);
    assert.equal(timers.size, 0);
  });
}
