import {ort, BrowserPpOcrV6Preprocessor, PpOcrV6Engine, parsePpOcrV6RuntimeConfig} from "./vendor/ocr/runtime.js";

export async function createOCRWorker() {
  const assets = chrome.runtime.getURL("vendor/ocr/");
  ort.env.wasm.wasmPaths = assets;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = "error";
  const response = await fetch(assets + "captcha-ctc.json");
  if (!response.ok) throw Error("OCR 모델 설정을 읽지 못했습니다.");
  const config = parsePpOcrV6RuntimeConfig(await response.json());
  let session;
  const engine = new PpOcrV6Engine({
    async create(modelUrl) {
      session = await ort.InferenceSession.create(modelUrl, {executionProviders: ["wasm"], logSeverityLevel: 3});
      return {
        async run(feeds) {
          const input = Object.values(feeds)[0];
          const outputs = await session.run({[session.inputNames[0]]: new ort.Tensor("float32", input.data, [...input.dims])});
          return Object.fromEntries(Object.entries(outputs).map(([name, output]) => {
            if (!(output.data instanceof Float32Array)) throw Error("OCR 모델 출력 형식이 올바르지 않습니다.");
            return [name, {data: output.data, dims: [...output.dims]}];
          }));
        },
      };
    },
  }, assets + "captcha-ctc.onnx", config.charset, new BrowserPpOcrV6Preprocessor(config.imageShape));
  return {
    async recognize(source) {
      const response = await fetch(source);
      if (!response.ok) throw Error("인식할 이미지를 읽지 못했습니다.");
      const blob = await response.blob();
      const results = await engine.recognize({
        bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type, revision: "",
      }, ["alphanumeric"]);
      const {text, confidence} = results[0];
      return {data: {text, confidence}};
    },
    async terminate() {if (session) await session.release();},
  };
}
