import {matchesBookingTransfer, observedEntry} from "./providers/navigation.js";

const store = chrome.storage.session;
let queue = Promise.resolve();
let creatingOCR;
async function ensureOCR() {
  if (!creatingOCR) {
    creatingOCR = (async () => {
      const contexts = await chrome.runtime.getContexts({contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL("offscreen.html")]});
      if (!contexts.length) await chrome.offscreen.createDocument({
        url: "offscreen.html", reasons: ["WORKERS"], justification: "팝업 이미지를 탭 활성화 없이 로컬 OCR 워커로 인식합니다.",
      });
    })().finally(() => {creatingOCR = undefined;});
  }
  return creatingOCR;
}
function ordered(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

const clickOrigins = new Set(["https://nol.yanolja.com", "https://tickets.interpark.com"]);
// 오픈 직전에 미리 붙여 두면 클릭 순간의 attach 지연을 없앨 수 있다.
const preparedClicks = new Map();
const preparedTTL = 6000;

async function releaseClick(tabId) {
  const session = preparedClicks.get(tabId);
  if (!session) return;
  preparedClicks.delete(tabId);
  clearTimeout(session.timer);
  await chrome.debugger.detach({tabId}).catch(() => {});
}

async function prepareClick(tabId, documentId) {
  await releaseClick(tabId);
  await chrome.debugger.attach({tabId}, "1.3");
  const session = {documentId, timer: setTimeout(() => void releaseClick(tabId), preparedTTL)};
  session.timer?.unref?.();
  preparedClicks.set(tabId, session);
}

async function trustedClick(tabId, documentId, x, y) {
  const target = {tabId};
  const stale = preparedClicks.get(tabId);
  if (stale && stale.documentId !== documentId) await releaseClick(tabId);
  const prepared = preparedClicks.get(tabId);
  if (prepared) {
    preparedClicks.delete(tabId);
    clearTimeout(prepared.timer);
  } else {
    await chrome.debugger.attach(target, "1.3");
  }
  try {
    // 준비된 세션은 만들 때 확인했고, 메시지 처리기가 발신 문서를 다시 확인한다.
    if (!prepared) {
      const frame = await chrome.webNavigation.getFrame({tabId, frameId: 0});
      if (frame?.documentId !== documentId) throw Error("페이지가 변경됐습니다.");
    }
    const point = {x, y};
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {...point, type: "mouseMoved"});
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {...point, type: "mousePressed", button: "left", buttons: 1, clickCount: 1});
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {...point, type: "mouseReleased", button: "left", buttons: 0, clickCount: 1});
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

function syncWaitPower() {
  return ordered(async () => {
    const states = await store.get(null);
    const waiting = Object.entries(states).some(([key, state]) =>
      /^\d+$/.test(key) && ["waiting", "refreshing", "booking"].includes(state?.phase));
    if (waiting) chrome.power.requestKeepAwake("system");
    else chrome.power.releaseKeepAwake();
  });
}
store.onChanged.addListener(syncWaitPower);
void syncWaitPower();

function handleNavigation(event, allowTransfer) {
  if (event.frameId !== 0) return;
  ordered(async () => {
    await releaseClick(event.tabId);
    const key = String(event.tabId);
    const state = (await store.get(key))[key];
    const url = new URL(event.url);
    const linkKey = "opener:" + key;
    const link = (await store.get(linkKey))[linkKey];
    if (link) {
      const parent = (await store.get(link.source))[link.source];
      const entry = observedEntry(parent, url);
      if (parent?.attemptId !== link.attemptId || (parent.phase !== "handoff" && parent.entryStage !== "queue")) {
        await store.remove(linkKey);
      } else if (entry) {
        await store.set({[link.source]: entry, [key]: {...entry, product: url.origin + url.pathname}});
        if (entry.entryStage !== "queue") await store.remove(linkKey);
        return;
      } else if (matchesBookingTransfer(parent, url)) {
        await store.set({[link.source]: {...parent, phase: "done", message: "예매 대기 화면이 열렸습니다."}, [key]: {...parent, product: url.origin + url.pathname, phase: "refreshing"}});
        await store.remove(linkKey);
        return;
      } else if (parent.entryStage === "queue" || url.href !== "about:blank") {
        await store.remove(linkKey);
      }
    }
    if (state && state.product !== url.origin + url.pathname) {
      const entry = observedEntry(state, url);
      if (entry) {
        await store.set({[key]: {...entry, product: url.origin + url.pathname}});
      } else if (allowTransfer && matchesBookingTransfer(state, url)) {
        await store.set({[key]: {...state, product: url.origin + url.pathname, phase: "refreshing"}});
      } else await store.remove(key);
    }
  });
}
chrome.webNavigation.onCommitted.addListener(event => handleNavigation(event, true));
chrome.webNavigation.onHistoryStateUpdated.addListener(event => handleNavigation(event, false));
chrome.webNavigation.onCreatedNavigationTarget.addListener(event => {
  ordered(async () => {
    const source = String(event.sourceTabId);
    const state = (await store.get(source))[source];
    if (event.sourceFrameId === 0 && state?.phase === "handoff" && state.attemptId) {
      await store.set({["opener:" + event.tabId]: {source, attemptId: state.attemptId}});
    }
  });
});
chrome.tabs.onRemoved.addListener(id => {
  ordered(async () => {
    await releaseClick(id);
    await store.remove([String(id), "capture:" + id, "opener:" + id]);
  });
  chrome.runtime.sendMessage({target: "offscreen-ocr", op: "release-tab", tabId: id}).catch(error => {
    console.debug("OCR 탭 정리:", error instanceof Error ? error.message : String(error));
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  const entry = chrome.runtime.getManifest().content_scripts.find(script => script.js.includes("auto-capture.js"));
  const tabs = await chrome.tabs.query({url: entry.matches});
  const results = await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({
    target: {tabId: tab.id}, files: entry.js,
  })));
  for (const result of results) {
    if (result.status === "rejected") console.error("열린 페이지 OCR 감지 연결 실패:", result.reason);
  }
});

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (request.target === "offscreen-ocr" || !sender.tab || sender.frameId !== 0) return;
  if (request.op === "recognize-captcha") {
    (async () => {
      if (typeof request.source !== "string" || !/^data:image\/[^;,]+;base64,/i.test(request.source)) throw Error("이미지 형식이 올바르지 않습니다.");
      if (typeof request.observerId !== "string" || !Number.isSafeInteger(request.generation) || request.generation < 1) throw Error("이미지 요청 순서가 올바르지 않습니다.");
      const frame = await chrome.webNavigation.getFrame({tabId: sender.tab.id, frameId: 0});
      if (frame?.documentId !== sender.documentId) throw Error("페이지가 변경됐습니다.");
      await ensureOCR();
      const current = await chrome.webNavigation.getFrame({tabId: sender.tab.id, frameId: 0});
      if (current?.documentId !== sender.documentId) throw Error("페이지가 변경됐습니다.");
      return chrome.runtime.sendMessage({target: "offscreen-ocr", key: sender.documentId + ":" + request.observerId, token: request.generation, tabId: sender.tab.id, documentId: sender.documentId, source: request.source});
    })().then(respond, error => respond({error: error instanceof Error ? error.message : String(error)}));
    return true;
  }
  const key = String(sender.tab.id);
  ordered(async () => {
    const frame = await chrome.webNavigation.getFrame({tabId: sender.tab.id, frameId: 0});
    if (request.op === "click") {
      try {
        if (frame?.documentId !== sender.documentId) throw Error("페이지가 변경됐습니다.");
        if (!Number.isFinite(request.x) || !Number.isFinite(request.y)) throw Error("클릭 좌표를 확인할 수 없습니다.");
        if (!clickOrigins.has(new URL(frame.url).origin)) throw Error("지원하지 않는 페이지입니다.");
        await trustedClick(sender.tab.id, sender.documentId, request.x, request.y);
        return {clicked: true};
      } catch (error) {
        await releaseClick(sender.tab.id);
        throw error;
      }
    }
    if (request.op === "prepare") {
      if (frame?.documentId !== sender.documentId) throw Error("페이지가 변경됐습니다.");
      if (!clickOrigins.has(new URL(frame.url).origin)) throw Error("지원하지 않는 페이지입니다.");
      await prepareClick(sender.tab.id, sender.documentId);
      return {prepared: true};
    }
    if (request.op === "release") {
      await releaseClick(sender.tab.id);
      return {released: true};
    }
    if (frame?.documentId !== sender.documentId) throw Error("페이지가 변경됐습니다.");
    if (request.op === "save") {
      const url = new URL(frame.url);
      if (request.state.product !== url.origin + url.pathname) throw Error("공연 페이지가 변경됐습니다.");
      await store.set({[key]: request.state});
    }
    if (request.op === "clear") await store.remove(key);
    return {state: (await store.get(key))[key] ?? null};
  }).then(respond, error => respond({error: error.message}));
  return true;
});
