function observePopupImage(connectionName) {
  const port = connectionName ? chrome.runtime.connect({name: connectionName}) : null;
  let previous;
  let snapshot;
  let generation = 0;
  const observerId = crypto.randomUUID();
  let lastFilled;
  let submitted;
  const setValue = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
  };
  const visible = node => node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
  const scan = (force = false) => {
    const images = document.querySelectorAll('[class*="ModalCaptchaText_captchaImage"] img, img[alt="캡챠 이미지"]');
    const image = Array.from(images).find(node => visible(node) && /^data:image\/[^;,]+;base64,/i.test(node.getAttribute("src") || ""));
    const source = image?.getAttribute("src") || "";
    const root = image?.closest('[class*="ModalCaptchaText_layerWrap"], [class*="ModalLayout_innerWrap"]');
    const modal = image?.closest('[class*="ModalLayout_innerWrap"]');
    const input = root?.querySelector('input[class*="ModalCaptchaText_captchaInput"]');
    const error = root?.querySelector('[class*="ModalCaptchaText_captchaError"]');
    const incorrect = Boolean(visible(error) && error.textContent?.trim() === "입력한 문자를 다시 확인해주세요");
    if (submitted && submitted.image === image && submitted.input === input && submitted.source === source && submitted.generation === snapshot?.generation) {
      if (!incorrect) submitted.errorCleared = true;
      else if (submitted.errorCleared && !submitted.refreshRequested) {
        const refresh = root?.querySelector('button[aria-label="새 문자 불러오기"]');
        if (visible(refresh) && !refresh.disabled) {
          submitted.refreshRequested = true;
          refresh.click();
        }
      }
    }
    if (!force && source === previous && image === snapshot?.image && input === snapshot?.input) return;
    if (lastFilled && lastFilled.input === input && input.value === lastFilled.value) {
      setValue(input, "");
      lastFilled = undefined;
    }
    previous = source;
    snapshot = {image, input, source, value: input?.value, generation: ++generation, root, modal};
    if (port) port.postMessage({source, generation});
    else if (source && input && !input.value) {
      const job = {source, generation};
      chrome.runtime.sendMessage({op: "recognize-captcha", source, observerId, generation}).then(reply => {
        if (reply?.error) console.error("OCR 자동 처리 실패:", reply.error);
        else if (reply?.text) applyResult({...job, text: reply.text});
      }, error => console.error("OCR 자동 처리 실패:", error));
    }
  };
  const applyResult = message => {
    scan();
    const current = snapshot;
    let reason = "";
    if (message.generation !== current.generation || message.source !== current.source || !current.source) reason = "이미지가 변경되어 입력하지 않았습니다.";
    else if (!visible(current.input) || current.input.disabled || current.input.readOnly) reason = "입력 가능한 캡챠 칸을 찾지 못했습니다.";
    else if (current.input.value !== current.value || current.value) reason = "직접 입력한 내용을 유지했습니다.";
    else if (typeof message.text !== "string" || !/^[A-Za-z0-9]+$/.test(message.text)) reason = "입력할 인식 결과가 없습니다.";
    else {
      setValue(current.input, message.text);
      if (current.input.value === message.text) {
        lastFilled = {input: current.input, value: message.text};
        if (!port) {
          const submit = current.modal?.querySelector('button.entButtonGlobal');
          if (visible(submit) && !submit.disabled && submit.textContent?.trim() === "입력완료") {
            const error = current.root?.querySelector('[class*="ModalCaptchaText_captchaError"]');
            submitted = {
              image: current.image, input: current.input, source: current.source, generation: current.generation,
              errorCleared: !(visible(error) && error.textContent?.trim() === "입력한 문자를 다시 확인해주세요"),
              refreshRequested: false,
            };
            submit.click();
          }
        }
      } else reason = "페이지가 입력값을 반영하지 않았습니다.";
    }
    port?.postMessage({op: "filled", generation: message.generation, reason});
  };
  port?.onMessage.addListener(message => {
    if (message.op === "fill") applyResult(message);
  });
  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["src", "class", "style", "hidden", "alt"],
  });
  const resume = () => scan(true);
  if (!port) window.addEventListener("pageshow", resume);
  port?.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError;
    observer.disconnect();
    if (error) console.debug("OCR 연결 종료:", error.message);
  });
  scan();
}
