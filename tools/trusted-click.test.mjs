import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import vm from "node:vm";

const click = readFileSync(new URL("../extension/core/click.js", import.meta.url), "utf8");
const handlers = {};
const event = name => ({addListener(fn) { handlers[name] = fn; }});
const states = {};
const calls = [];
let frame = {documentId: "doc-7", url: "https://tickets.interpark.com/gates/ticket/1"};

globalThis.chrome = {
  storage: {session: {
    onChanged: event("change"),
    get: async key => key === null ? states : {[key]: states[key]},
    set: async updates => Object.assign(states, updates),
    remove: async keys => [].concat(keys).forEach(key => delete states[key]),
  }},
  power: {releaseKeepAwake() {}, requestKeepAwake() {}},
  tabs: {onRemoved: event("removed")},
  webNavigation: {
    onCommitted: event("commit"),
    onHistoryStateUpdated: event("history"),
    onCreatedNavigationTarget: event("target"),
    getFrame: async () => frame,
  },
  debugger: {
    attach: async (target, version) => calls.push(["attach", target, version]),
    sendCommand: async (target, method, params) => calls.push(["sendCommand", target, method, params]),
    detach: async target => calls.push(["detach", target]),
  },
  runtime: {onInstalled: event("install"), onMessage: event("message")},
};
await import("../extension/background.js");

const send = (request, tabId = 7) => new Promise(resolve =>
  handlers.message(request, {tab: {id: tabId}, frameId: 0, documentId: "doc-" + tabId}, resolve));

test("a click request dispatches a trusted mouse sequence and detaches", async () => {
  calls.length = 0;
  frame = {documentId: "doc-7", url: "https://tickets.interpark.com/gates/ticket/1"};
  const reply = await send({op: "click", x: 120, y: 40});
  assert.deepEqual(reply, {clicked: true});
  assert.deepEqual(calls, [
    ["attach", {tabId: 7}, "1.3"],
    ["sendCommand", {tabId: 7}, "Input.dispatchMouseEvent", {x: 120, y: 40, type: "mouseMoved"}],
    ["sendCommand", {tabId: 7}, "Input.dispatchMouseEvent", {x: 120, y: 40, type: "mousePressed", button: "left", buttons: 1, clickCount: 1}],
    ["sendCommand", {tabId: 7}, "Input.dispatchMouseEvent", {x: 120, y: 40, type: "mouseReleased", button: "left", buttons: 0, clickCount: 1}],
    ["detach", {tabId: 7}],
  ]);
});

test("a click from a replaced document is rejected before attaching", async () => {
  calls.length = 0;
  frame = {documentId: "other-8", url: "https://tickets.interpark.com/gates/ticket/1"};
  const reply = await send({op: "click", x: 1, y: 2}, 8);
  assert.match(reply.error, /페이지가 변경됐습니다/);
  assert.equal(calls.length, 0);
});

test("a click on an unsupported origin is rejected", async () => {
  calls.length = 0;
  frame = {documentId: "doc-9", url: "https://example.test/gates/ticket/1"};
  const reply = await send({op: "click", x: 1, y: 2}, 9);
  assert.match(reply.error, /지원하지 않는 페이지/);
  assert.equal(calls.length, 0);
});

test("a click with non-finite coordinates is rejected", async () => {
  calls.length = 0;
  frame = {documentId: "doc-10", url: "https://tickets.interpark.com/gates/ticket/1"};
  const reply = await send({op: "click", x: "10", y: 2}, 10);
  assert.match(reply.error, /클릭 좌표/);
  assert.equal(calls.length, 0);
});

test("a click request reports a debugger attach failure without detaching", async () => {
  calls.length = 0;
  frame = {documentId: "doc-11", url: "https://tickets.interpark.com/gates/ticket/1"};
  const attach = chrome.debugger.attach;
  chrome.debugger.attach = async () => { throw Error("Another debugger is already attached"); };
  try {
    const reply = await send({op: "click", x: 1, y: 2}, 11);
    assert.match(reply.error, /Another debugger is already attached/);
    assert.equal(calls.some(([name]) => name === "sendCommand" || name === "detach"), false);
  } finally {
    chrome.debugger.attach = attach;
  }
});

test("a navigation after attach stops the click and detaches", async () => {
  calls.length = 0;
  frame = {documentId: "doc-12", url: "https://tickets.interpark.com/gates/ticket/1"};
  let reads = 0;
  const getFrame = chrome.webNavigation.getFrame;
  chrome.webNavigation.getFrame = async () => ++reads === 1 ? frame : {documentId: "moved", url: frame.url};
  try {
    const reply = await send({op: "click", x: 5, y: 6}, 12);
    assert.match(reply.error, /페이지가 변경됐습니다/);
    assert.deepEqual(calls.map(([name]) => name), ["attach", "detach"]);
  } finally {
    chrome.webNavigation.getFrame = getFrame;
  }
});

test("a prepared click reuses the attachment and skips a second attach", async () => {
  calls.length = 0;
  frame = {documentId: "doc-13", url: "https://tickets.interpark.com/gates/ticket/1"};
  assert.deepEqual(await send({op: "prepare"}, 13), {prepared: true});
  assert.deepEqual(await send({op: "click", x: 3, y: 4}, 13), {clicked: true});
  assert.deepEqual(calls.map(([name]) => name), ["attach", "sendCommand", "sendCommand", "sendCommand", "detach"]);
  assert.deepEqual(calls[1][3], {x: 3, y: 4, type: "mouseMoved"});
});

test("a prepare on an unsupported origin is rejected", async () => {
  calls.length = 0;
  frame = {documentId: "doc-14", url: "https://example.test/gates/ticket/1"};
  const reply = await send({op: "prepare"}, 14);
  assert.match(reply.error, /지원하지 않는 페이지/);
  assert.equal(calls.length, 0);
});

test("a click from a replaced document releases the prepared attachment", async () => {
  calls.length = 0;
  frame = {documentId: "doc-15", url: "https://tickets.interpark.com/gates/ticket/1"};
  assert.deepEqual(await send({op: "prepare"}, 15), {prepared: true});
  frame = {documentId: "moved", url: frame.url};
  const reply = await send({op: "click", x: 1, y: 2}, 15);
  assert.match(reply.error, /페이지가 변경됐습니다/);
  assert.deepEqual(calls.map(([name]) => name), ["attach", "detach"]);
});

test("a release request detaches a prepared attachment", async () => {
  calls.length = 0;
  frame = {documentId: "doc-16", url: "https://tickets.interpark.com/gates/ticket/1"};
  assert.deepEqual(await send({op: "prepare"}, 16), {prepared: true});
  assert.deepEqual(await send({op: "release"}, 16), {released: true});
  assert.deepEqual(calls.map(([name]) => name), ["attach", "detach"]);
});

test("a prepare reports a debugger attach failure without detaching", async () => {
  calls.length = 0;
  frame = {documentId: "doc-17", url: "https://tickets.interpark.com/gates/ticket/1"};
  const attach = chrome.debugger.attach;
  chrome.debugger.attach = async () => { throw Error("Another debugger is already attached"); };
  try {
    const reply = await send({op: "prepare"}, 17);
    assert.match(reply.error, /Another debugger is already attached/);
    assert.equal(calls.some(([name]) => name === "sendCommand" || name === "detach"), false);
  } finally {
    chrome.debugger.attach = attach;
  }
});

test("the content helper requests and releases a prepared attachment", async () => {
  const messages = [];
  const context = vm.createContext({
    chrome: {runtime: {sendMessage: async message => { messages.push(message); return {prepared: true}; }}},
    console, document: {},
  });
  vm.runInContext(click, context);
  assert.equal(await context.mecroPrepareClick(), true);
  context.mecroReleaseClick();
  assert.deepEqual(messages.map(message => ({...message})), [{op: "prepare"}, {op: "release"}]);
});

test("the content helper requests one trusted click at the element center", async () => {
  const messages = [];
  let clicked = 0, scrolled = 0;
  const element = {
    getBoundingClientRect: () => ({left: 100, top: 50, width: 60, height: 10}),
    scrollIntoView: () => { scrolled++; },
    click: () => { clicked++; },
  };
  const context = vm.createContext({
    chrome: {runtime: {sendMessage: async message => { messages.push(message); return {clicked: true}; }}},
    console, document: {},
  });
  vm.runInContext(click, context);
  assert.equal(await context.mecroTrustedClick(element), true);
  assert.equal(scrolled, 1);
  assert.equal(clicked, 0);
  assert.deepEqual(messages.map(message => ({...message})), [{op: "click", x: 130, y: 55}]);
});

test("the content helper falls back to element.click when the debugger click fails", async () => {
  let clicked = 0;
  const element = {
    getBoundingClientRect: () => ({left: 0, top: 0, width: 10, height: 10}),
    scrollIntoView() {},
    click: () => { clicked++; },
  };
  const context = vm.createContext({
    chrome: {runtime: {sendMessage: async () => ({error: "Another debugger is already attached"})}},
    console, document: {},
  });
  vm.runInContext(click, context);
  assert.equal(await context.mecroTrustedClick(element), false);
  assert.equal(clicked, 1);
});

test("the content helper skips the request for a zero-sized element", async () => {
  let clicked = 0, messages = 0;
  const element = {
    getBoundingClientRect: () => ({left: 0, top: 0, width: 0, height: 10}),
    scrollIntoView() {},
    click: () => { clicked++; },
  };
  const context = vm.createContext({
    chrome: {runtime: {sendMessage: async () => { messages++; return {clicked: true}; }}},
    console, document: {},
  });
  vm.runInContext(click, context);
  assert.equal(await context.mecroTrustedClick(element), false);
  assert.equal(messages, 0);
  assert.equal(clicked, 1);
});
