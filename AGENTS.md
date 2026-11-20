# mecro-sdk agent guide

`README.md` describes the product. This guide owns the repository map and local verification commands. `docs/` records observations and validation limits. `tasks/lessons.md` records recurring project lessons.

Discovery baseline: `main` at `7ad2c1c`, with local changes, on 2026-11-20 (KST).

## Overview

Chrome Manifest V3 extension for monitoring general ticket-sale openings. Load `extension/` directly as an unpacked extension.

## Repository map

| Work | Start here |
| --- | --- |
| Extension entry points and execution contexts | [extension/AGENTS.md](extension/AGENTS.md), [manifest](extension/manifest.json) |
| Site-specific behavior | [NOL/Interpark provider](extension/providers/nol-interpark/) |
| Local regression coverage | [tools/](tools/) |
| Vendored runtime build and provenance | [tools/ocr-build/README.md](tools/ocr-build/README.md) |
| Runtime observations and fixture limitations | [Booking entry](docs/booking-entry-2026-11-19.md), [Trusted click](docs/trusted-click-2026-11-20.md), [OCR validation](docs/ocr-validation.md) |

## Code map

| Symbol | Definition | Editor-confirmed caller or consumer |
| --- | --- | --- |
| `startBookingWait` | [core/wait.js](extension/core/wait.js) | `providers/nol-interpark/provider.js` initializes the shared wait flow. |
| `matchesBookingTransfer` | [providers/navigation.js](extension/providers/navigation.js) | `background.js` classifies a supported transfer between booking pages. |
| `observedEntry` | [providers/navigation.js](extension/providers/navigation.js) | `background.js` interprets an observed navigation and stores the entry status. |

## Local commands

There is no root package install or extension build. For installed-extension checks, use **Load unpacked** in `chrome://extensions` and select `extension/`. Reload the extension and refresh the relevant tab after editing a content script.

From the repository root:

```sh
node --test tools/*.test.mjs
python3 -m http.server 18770 --bind 127.0.0.1
```

The Node suite covers booking navigation classification and stalled-gate timing. With the local server running, use `http://127.0.0.1:18770/` as the base URL for these fixture paths and check the result printed on the page.

| Fixture | What it tests |
| --- | --- |
| [tools/background-routing-regression.html](tools/background-routing-regression.html) | Separation of offscreen messages and session-state requests with simulated Chrome APIs. |
| [tools/wait-cancellation-regression.html](tools/wait-cancellation-regression.html) | Wait and cancellation behavior against a local DOM. Run with `?case=normal`, `?case=cancel`, `?case=failed-clear`, and `?case=failed-save`. |

Run runtime-specific build and validation commands from the linked build guide and validation notes. The Bun package under `tools/ocr-build/` is scoped to the vendored runtime.

## Workflow and verification

- Track non-trivial work and verification in `tasks/todo.md`. Record the results and remove the completed checklist. Record lessons from user corrections in `tasks/lessons.md`.
- Use the manifest as the source for supported domains, script order, and required permissions.
- Report the observed outcome and test surface. A dispatched click establishes event delivery. Queue or seat entry requires a matching navigation observation.
- Keep generated bundles and third-party notices together. Make changes to a generated bundle at its build source.
