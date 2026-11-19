import {recognizeImage} from "./recognize-image.js";

export function createOCRMessageHandler(createWorker) {
  let worker;
  let queue = Promise.resolve();
  const latest = new Map();
  return (request, sender, respond) => {
    if (request.target !== "offscreen-ocr") return;
    if (request.op === "release-tab") {
      for (const [key, value] of latest) if (value.tabId === request.tabId) latest.delete(key);
      respond({released: true});
      return;
    }
    for (const [key, value] of latest) {
      if (value.tabId === request.tabId && value.documentId !== request.documentId) latest.delete(key);
    }
    if ((latest.get(request.key)?.token ?? 0) >= request.token) {
      respond({stale: true});
      return;
    }
    const entry = {token: request.token, tabId: request.tabId, documentId: request.documentId};
    latest.set(request.key, entry);
    const isCurrent = () => latest.get(request.key) === entry;
    const job = queue.then(async () => {
      if (!isCurrent()) return {stale: true};
      worker ??= await createWorker();
      if (!isCurrent()) return {stale: true};
      const result = await recognizeImage(worker, request.source, isCurrent);
      if (!result || !isCurrent()) return {stale: true};
      const {data, usable} = result;
      return {text: usable ? data.text : ""};
    });
    queue = job.then(() => undefined, async error => {
      console.error("OCR 처리 실패:", error);
      const failed = worker;
      worker = undefined;
      if (failed) {
        try {await failed.terminate();}
        catch (cleanupError) {console.error("OCR 워커 종료 실패:", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));}
      }
    });
    job.then(result => respond(isCurrent() ? result : {stale: true}),
      error => respond(isCurrent() ? {error: error instanceof Error ? error.message : String(error)} : {stale: true}));
    return true;
  };
}
