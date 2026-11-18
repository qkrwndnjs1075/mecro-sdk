const store = chrome.storage.session;
let queue = Promise.resolve();
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
chrome.tabs.onRemoved.addListener(id => ordered(() => store.remove([String(id), "capture:" + id])));

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (!sender.tab || sender.frameId !== 0) return;
  const key = String(sender.tab.id);
  ordered(async () => {
    const frame = await chrome.webNavigation.getFrame({tabId: sender.tab.id, frameId: 0});
    if (frame?.documentId !== sender.documentId) throw Error("페이지가 변경됐습니다.");
    if (request.op === "open-capture") {
      const captureKey = "capture:" + key;
      const saved = (await store.get(captureKey))[captureKey];
      const url = chrome.runtime.getURL("capture.html") + "?tab=" + sender.tab.id;
      if (saved) {
        const tabs = await chrome.tabs.query({});
        if (tabs.some(tab => tab.id === saved.id && tab.url === url)) {
          if (saved.documentId !== sender.documentId) {
            await chrome.tabs.reload(saved.id);
            await store.set({[captureKey]: {...saved, documentId: sender.documentId}});
          }
          return {opened: true};
        }
      }
      const capture = await chrome.tabs.create({url, active: false});
      await store.set({[captureKey]: {id: capture.id, documentId: sender.documentId}});
      return {opened: true};
    }
    if (request.op === "save") await store.set({[key]: request.state});
    if (request.op === "clear") await store.remove(key);
    return {state: (await store.get(key))[key] ?? null};
  }).then(respond, error => respond({error: error.message}));
  return true;
});
