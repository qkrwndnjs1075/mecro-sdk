# Local OCR assets

The recognition engine and preprocessing come from hongshuo-wang/local-captcha-solver,
commit 856f339f95885f002c674a315e752be77f5eedb4, under its MIT source license.
See LICENSE-captcha-helper and https://github.com/hongshuo-wang/local-captcha-solver/tree/856f339f95885f002c674a315e752be77f5eedb4 .

The bundled captcha-ctc.onnx model was trained by that project from the Apache-2.0
PaddleOCR PP-OCRv6 tiny checkpoint. See LICENSE-paddleocr and the upstream model notice:
https://github.com/hongshuo-wang/local-captcha-solver/blob/856f339f95885f002c674a315e752be77f5eedb4/third_party/captcha-ctc-model-NOTICE.md .

Upstream training data attribution: MathCaptcha10k v6 (CC BY 4.0), parsasam/CAPTCHA
Dataset v1 (CC0 1.0), huthayfahodeb/Captcha Dataset v2 (CC0 1.0), and daniilnxy/Math
problem CAPTCHA images v1 (Apache 2.0), plus project-generated samples. Source URLs
and the full lineage are in the upstream training/ppocrv6-captcha/public-datasets.ts
and model card, not claims of accuracy on this application's inputs.

Model SHA-256: bce3e791636f369dd8bbac9b4eee2a0d9515f001b89b422f6d250c33ee6bbc28
Config SHA-256: efebc4c5e6a9de3d3cdf0a58d482a869f801352dd2ab8da73dc6f2baa8f29a5a

ONNX Runtime Web 1.23.2 is bundled from its npm package. Its MIT license and
upstream third-party notices are preserved in LICENSE-onnxruntime and
NOTICE-onnxruntime.txt. The MIT text and third-party notices were taken from
the same pinned local-captcha-solver distribution used for this model.

The generated runtime.js is built from tools/ocr-build. The .mjs loader and
.wasm binary must be updated together with that package, never independently.
