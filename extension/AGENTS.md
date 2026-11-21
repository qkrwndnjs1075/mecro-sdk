# Extension runtime

The action popup, service worker, content scripts and offscreen document run in separate Chrome Manifest V3 contexts.

## Where to look

| Context | Entry point | Responsibility |
| --- | --- | --- |
| Popup | `popup.js` | Sends `inspect`, `start` and `cancel` to frame 0 of the active tab. Shows a saved entry stage if the destination has no booking listener and its URL matches the saved product. |
| Service worker | `background.js` | Serializes booking state and navigation updates in `chrome.storage.session`. Checks the sender's current document before processing state requests. |
| Booking content scripts | `core/click.js`, `core/wait.js` and `providers/nol-interpark/provider.js` | The shared wait loop owns timers, cancellation and resumption. The provider supplies page inspection, selection and button lookup. The click helper asks the service worker for a trusted input event. |
| Offscreen document | `offscreen.html` and `offscreen.js` | Hosts local OCR work independently of the popup. Bundled asset provenance lives in `vendor/ocr/NOTICE.md`. |

## Content script load order

`manifest.json` loads classic scripts in order. On product, goods and gate pages, the NOL helpers share globals in the extension's isolated world.
Keep `core/click.js` before `core/wait.js` so the wait loop can resolve the trusted click helper. Keep the provider entry last. It passes the already-loaded selection, opening and button helpers to `startBookingWait` as soon as it runs.

The separate capture group loads `capture-source.js` before `auto-capture.js`. The install handler reads this group's file list directly from the manifest.

## Wait and navigation invariants

- Anchor the deadline to the site's HTTP `Date` plus `Age`. Advance it with `performance.now()` and resync when wall-clock and monotonic elapsed time diverge after sleep.
- Cancellation clears the stored wait before invalidating the generation and timer. Pending work waits for that clear to settle. A failed clear leaves the original wait active.
- On reload, resume only a matching state version and product (origin plus pathname). A gate drops the previous page's selection.
- Save `handoff` with an `attemptId` before clicking. The click records an attempt. Only a recognized top-frame navigation sets `entryStage` to `queue`, `schedule` or `seat`.
- A handoff click goes through `chrome.debugger` and `Input.dispatchMouseEvent` so the site sees `isTrusted: true`. The content script sends the button's viewport center; the service worker re-checks the sender document and supported origin, attaches, re-checks the document, dispatches mouseMoved, mousePressed and mouseReleased, then detaches. Fall back to `element.click()` only when the debugger path fails.
- A gate handoff prepares the debugger attachment at `enterBooking` and starts checking for the button 3 seconds before the deadline. The service worker reuses that attachment for the click, expires it after 6 seconds, and releases it on cancel, `pagehide` and navigation. Prepared sessions are bound to the sender's `documentId`; a click from a different document detaches the stale session.
- Coordinates are viewport CSS pixels from `getBoundingClientRect()`. Scroll the button into view before measuring. Do not substitute `offsetLeft`/`offsetTop`.
- `providers/nol-interpark/navigation.js` recognizes destination URLs and same-product gate transfers. `providers/navigation.js` applies these rules to the pending state. Child tabs must match the opener's attempt.

## Regression coverage

- [Wait cancellation fixture](../tools/wait-cancellation-regression.html) checks click counts while a clear is pending, after it settles and when saving the handoff fails. It also checks that the trusted click helper is called and falls back when the debugger is unavailable.
- [Booking navigation test](../tools/booking-navigation.test.mjs) checks a gate handoff, unrelated child tabs and queue-to-seat transitions using simulated Chrome events.
- [Trusted click test](../tools/trusted-click.test.mjs) checks CDP command order, sender document and origin rejection, attach failure handling, prepared attachment reuse and release, and the content helper's coordinate, prepare and fallback behavior.
