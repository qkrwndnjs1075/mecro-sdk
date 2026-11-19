import {copyFile, mkdir} from "node:fs/promises";

const output = new URL("../../extension/vendor/ocr/", import.meta.url);
const runtime = new URL("node_modules/onnxruntime-web/", import.meta.url);
await mkdir(output, {recursive: true});
const result = await Bun.build({
  entrypoints: [new URL("runtime.js", import.meta.url).pathname],
  target: "browser", minify: true,
});
if (!result.success) throw new AggregateError(result.logs, "OCR 런타임 빌드 실패");
await Bun.write(new URL("runtime.js", output), result.outputs[0]);
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  await copyFile(new URL("dist/" + name, runtime), new URL(name, output));
}
for (const name of ["LICENSE-onnxruntime", "NOTICE-onnxruntime.txt"]) {
  await copyFile(new URL("licenses/" + name, import.meta.url), new URL(name, output));
}
await copyFile(new URL("upstream/LICENSE", import.meta.url), new URL("LICENSE-captcha-helper", output));
