import {createImageReader} from "./capture-ocr.js";
import {createOCRWorker} from "./ocr-worker.js";

let connection;
let currentGeneration;
const readImage = createImageReader(createOCRWorker, ({text, usable, status, source, context}) => {
  document.querySelector("#result").textContent = text;
  document.querySelector("#ocr-status").textContent = status;
  if (usable && connection) connection.postMessage({op: "fill", text, source, generation: context});
});

const status = document.querySelector("#status");
const source = document.querySelector("#source");
const preview = document.querySelector("#preview");
const tabId = Number(new URL(location.href).searchParams.get("tab"));
const connectionName = "popup-image:" + crypto.randomUUID();
let changes = 0;

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== connectionName || port.sender?.tab?.id !== tabId || port.sender.frameId !== 0) return;
  connection = port;
  port.onMessage.addListener(message => {
    if (message.op === "filled") {
      if (message.generation === currentGeneration) document.querySelector("#ocr-status").textContent = message.reason || "자동 입력했습니다. 원본 이미지와 대조해 주세요.";
      return;
    }
    if (typeof message.source !== "string" || (message.source && !/^data:image\/[^;,]+;base64,/i.test(message.source))) return;
    source.value = message.source;
    currentGeneration = message.generation;
    readImage(message.source, message.generation);
    preview.hidden = !message.source;
    if (message.source) {
      preview.src = message.source;
      status.textContent = `이미지 추출 완료 · ${++changes}회 수신`;
    } else {
      preview.removeAttribute("src");
      status.textContent = "팝업 이미지를 기다리는 중…";
    }
  });
  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError;
    if (connection !== port) return;
    connection = undefined;
    readImage("");
    source.value = "";
    preview.hidden = true;
    preview.removeAttribute("src");
    status.textContent = "미리보기 연결이 종료됐습니다. 자동 입력은 원래 페이지에서 별도로 실행됩니다.";
    if (error) console.debug("OCR 연결 종료:", error.message);
  });
});

try {
  await chrome.scripting.executeScript({target: {tabId}, func: observePopupImage, args: [connectionName]});
} catch (error) {
  status.textContent = error instanceof Error ? `이미지 감지를 시작하지 못했습니다: ${error.message}` : "이미지 감지를 시작하지 못했습니다.";
}
