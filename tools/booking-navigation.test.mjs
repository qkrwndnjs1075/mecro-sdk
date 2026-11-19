import assert from "node:assert/strict";
import {test} from "node:test";

test("a booking attempt is confirmed by committed navigation in its own child tab", async () => {
  const handlers = {};
  const event = key => ({addListener(fn) { handlers[key] = fn; }});
  const source = {phase: "handoff", product: "https://nol.yanolja.com/ticket/products/123", attemptId: "first", attemptedAt: Date.now()};
  const states = {1: source, 2: {...source, attemptId: "second"}};
  globalThis.chrome = {
    storage: {session: {
      onChanged: event("change"), get: async key => key === null ? states : {[key]: states[key]},
      set: async updates => Object.assign(states, updates),
      remove: async keys => [].concat(keys).forEach(key => delete states[key]),
    }},
    power: {releaseKeepAwake() {}, requestKeepAwake() {}},
    tabs: {onRemoved: event("removed")},
    webNavigation: {onCommitted: event("commit"), onHistoryStateUpdated: event("history"), onCreatedNavigationTarget: event("target")},
    runtime: {onInstalled: event("install"), onMessage: event("message")},
  };
  await import("../extension/background.js");
  async function emit(type, details) {
    handlers[type](details);
    await new Promise(resolve => setImmediate(resolve));
  }
  const gate = "https://tickets.interpark.com/gates/ticket/123";
  const seat = "https://tickets.interpark.com/onestop/seat";
  await emit("target", {sourceTabId: 1, sourceFrameId: 0, tabId: 3, url: "about:blank"});
  await emit("commit", {tabId: 3, frameId: 0, url: "about:blank"});
  assert.equal(states[1].phase, "handoff");
  await emit("commit", {tabId: 3, frameId: 0, url: gate});
  assert.equal(states[1].phase, "done");
  assert.equal(states[3].phase, "refreshing");
  assert.equal(states[3].product, gate);
  states[3] = {...states[3], phase: "handoff", attemptId: "third", attemptedAt: Date.now()};
  await emit("target", {sourceTabId: 3, sourceFrameId: 0, tabId: 4, url: seat});
  assert.equal(states[3].phase, "handoff");
  await emit("commit", {tabId: 4, frameId: 0, url: seat});
  assert.equal(states[3].phase, "done");
  assert.equal(states[2].phase, "handoff");
});
