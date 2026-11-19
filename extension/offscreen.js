import {createOCRWorker} from "./ocr-worker.js";
import {createOCRMessageHandler} from "./ocr-queue.js";

chrome.runtime.onMessage.addListener(createOCRMessageHandler(createOCRWorker));
