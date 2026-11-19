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
const id = url => new URL(url).pathname.match(/^\/(?:ticket\/products|goods|gates\/ticket)\/([A-Za-z0-9]+)\/?$/)?.[1];
function ordered(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

chrome.webNavigation.onCommitted.addListener(event => {
  if (event.frameId !== 0) return;
  ordered(async () => {
    const key = String(event.tabId);
    const state = (await store.get(key))[key];
    const url = new URL(event.url);
    if (state && state.product !== url.origin + url.pathname) {
      if (state.phase === "handoff" && id(state.product) === id(event.url) && url.hostname === "tickets.interpark.com" && url.pathname.startsWith("/gates/ticket/")) {
        await store.set({[key]: {...state, product: url.origin + url.pathname, phase: "refreshing"}});
      } else await store.remove(key);
    }
  });
});
chrome.webNavigation.onCreatedNavigationTarget.addListener(event => {
  ordered(async () => {
    const source = String(event.sourceTabId);
    const state = (await store.get(source))[source];
    const url = new URL(event.url);
    if (state?.phase === "handoff" && id(state.product) === id(event.url) && url.hostname === "tickets.interpark.com" && url.pathname.startsWith("/gates/ticket/")) {
      await store.set({[String(event.tabId)]: {...state, product: url.origin + url.pathname, phase: "refreshing"}, [source]: {...state, phase: "done"}});
    }
  });
});
chrome.tabs.onRemoved.addListener(id => {
  ordered(() => store.remove([String(id), "capture:" + id]));
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
    if (frame?.documentId !== sender.documentId) throw Error("페이지가 변경됐습니다.");
    if (request.op === "save") await store.set({[key]: request.state});
    if (request.op === "clear") await store.remove(key);
    return {state: (await store.get(key))[key] ?? null};
  }).then(respond, error => respond({error: error.message}));
  return true;
});
