function observePopupImage(connectionName) {
  const port = connectionName ? chrome.runtime.connect({name: connectionName}) : null;
  let previous;
  let snapshot;
  let generation = 0;
  let opening = false;
  let lastFilled;
  const setValue = (input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
  };
  const visible = node => node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
  const scan = () => {
    const images = document.querySelectorAll('[class*="ModalCaptchaText_captchaImage"] img, img[alt="캡챠 이미지"]');
    const image = Array.from(images).find(node => visible(node) && /^data:image\/[^;,]+;base64,/i.test(node.getAttribute("src") || ""));
    const source = image?.getAttribute("src") || "";
    const root = image?.closest('[class*="ModalCaptchaText_layerWrap"], [class*="ModalLayout_innerWrap"]');
    const input = root?.querySelector('input[class*="ModalCaptchaText_captchaInput"]');
    if (source === previous && image === snapshot?.image && input === snapshot?.input) return;
    if (port && lastFilled && lastFilled.input === input && input.value === lastFilled.value) {
      setValue(input, "");
      lastFilled = undefined;
    }
    previous = source;
    snapshot = {image, input, source, value: input?.value, generation: ++generation};
    if (port) port.postMessage({source, generation});
    else if (source && !opening) {
      opening = true;
      chrome.runtime.sendMessage({op: "open-capture"}).then(reply => {
        if (reply?.error) console.error("OCR 자동 시작 실패:", reply.error);
      }, error => console.error("OCR 자동 시작 실패:", error)).finally(() => {opening = false;});
    }
  };
  port?.onMessage.addListener(message => {
    if (message.op !== "fill") return;
    scan();
    const current = snapshot;
    let reason = "";
    if (message.generation !== current.generation || message.source !== current.source || !current.source) reason = "이미지가 변경되어 입력하지 않았습니다.";
    else if (!visible(current.input) || current.input.disabled || current.input.readOnly) reason = "입력 가능한 캡챠 칸을 찾지 못했습니다.";
    else if (current.input.value !== current.value || current.value) reason = "직접 입력한 내용을 유지했습니다.";
    else if (typeof message.text !== "string" || !/^[A-Za-z0-9]+$/.test(message.text)) reason = "입력할 인식 결과가 없습니다.";
    else {
      setValue(current.input, message.text);
      if (current.input.value === message.text) lastFilled = {input: current.input, value: message.text};
      else reason = "페이지가 입력값을 반영하지 않았습니다.";
    }
    port.postMessage({op: "filled", generation: message.generation, reason});
  });
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["src", "class", "style", "hidden", "alt"],
  });
  port?.onDisconnect.addListener(() => observer.disconnect());
  scan();
}
