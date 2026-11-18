import {createImageReader} from "./capture-ocr.js";
import {prepareImage} from "./prepare-image.js";

const assets = chrome.runtime.getURL("vendor/ocr/");
let connection;
let currentGeneration;
const readImage = createImageReader(async () => {
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: assets + "worker.min.js", corePath: assets,
    langPath: assets, workerBlobURL: false,
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });
  } catch (error) {
    await worker.terminate();
    throw error;
  }
  return worker;
}, prepareImage, ({text, status, source, context}) => {
  document.querySelector("#result").textContent = text;
  document.querySelector("#ocr-status").textContent = status;
  if (text && connection) connection.postMessage({op: "fill", text, source, generation: context});
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
    connection = undefined;
    readImage("");
    source.value = "";
    preview.hidden = true;
    preview.removeAttribute("src");
    status.textContent = "원래 탭과 연결이 종료됐습니다. 원래 탭의 확장 메뉴에서 다시 시작해 주세요.";
  });
});

try {
  await chrome.scripting.executeScript({target: {tabId}, func: observePopupImage, args: [connectionName]});
} catch (error) {
  status.textContent = error instanceof Error ? `이미지 감지를 시작하지 못했습니다: ${error.message}` : "이미지 감지를 시작하지 못했습니다.";
}
