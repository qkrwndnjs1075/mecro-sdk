# OCR runtime build

Run `bun install --ignore-scripts` and `bun run build` in this directory.
The build emits the browser runtime, matching WASM loader/binary, and runtime
license notices into `extension/vendor/ocr`. Loading the extension does not
require Bun, a server, or an installation step.

The upstream source is pinned to local-captcha-solver commit
`856f339f95885f002c674a315e752be77f5eedb4`. Source files are preserved verbatim;
the application's adapter is `extension/ocr-worker.js`.

The model/config are pinned binary assets in `extension/vendor/ocr` with their
hashes and attribution in `NOTICE.md`. A model update must replace its config,
validate hashes against its model card, and run the original-image and stress
fixtures before use. This build does not download or silently update models.
