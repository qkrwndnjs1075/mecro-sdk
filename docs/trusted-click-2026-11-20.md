# 예매 버튼 신뢰 클릭 (2026-11-20)

사이트의 예매 버튼 핸들러가 `event?.isTrusted === false`인 이벤트를 무시한다. 확장이 `HTMLElement.click()`으로 보내는 합성 클릭은 `isTrusted`가 false라서 버튼이 활성화되어도 화면이 넘어가지 않는다. 페이지 JS로는 `isTrusted`를 바꿀 수 없다. 이 값은 Event 인스턴스의 non-configurable 속성이라 프로토타입 패치로도 덮을 수 없다.

## 구현

- [extension/core/click.js](../extension/core/click.js)가 버튼의 뷰포트 중심 좌표를 계산해 백그라운드에 `{op: "click", x, y}`를 보낸다.
- [extension/background.js](../extension/background.js)가 발신 문서의 `documentId`와 지원 호스트를 확인하고 `chrome.debugger`로 탭에 붙는다. 부착 후 문서가 바뀌지 않았는지 한 번 더 확인한 뒤 `Input.dispatchMouseEvent`를 mouseMoved → mousePressed → mouseReleased 순서로 보낸다. 이 입력은 브라우저가 실제 입력으로 처리하므로 `isTrusted`가 true다. 클릭 직후 detach한다.
- `chrome.debugger.attach`가 실패하면(DevTools가 열려 있는 경우 등) 기존 `element.click()`으로 폴백한다. 이 클릭은 사이트에서 계속 무시될 수 있다.
- 대기 흐름은 [extension/core/wait.js](../extension/core/wait.js)의 `clickButton`이 `mecroTrustedClick`을 우선 사용한다. 헬퍼가 없는 테스트 환경에서는 기존 `click()`을 쓴다.

## 오픈 순간 지연 줄이기

대기열 순번은 클릭 후 사이트가 보내는 요청이 서버에 도착한 순서로 정해지므로, 오픈 시각의 로컬 지연을 줄이는 것이 도움이 된다. 게이트 대기에는 다음 경로를 적용했다.

- 오픈 **3초 전**부터 버튼을 확인한다. 사이트 시계와 로컬 타이머의 초 단위 오차를 흡수하기 위해서다.
- 버튼을 찾는 동안 **25ms 간격**으로 확인한다(시작 5초 이내). 이후에는 100ms 간격으로 늘린다. 기존 200ms보다 늦게 뜬 버튼을 빨리 잡는다.
- `enterBooking` 시작 시 `{op: "prepare"}`로 디버거를 **미리 부착**한다. 클릭 순간에는 attach 왕복 없이 마우스 입력만 보낸다.
- 준비된 부착은 6초 뒤, 취소, `pagehide`, 탐색 시 자동으로 해제한다. 클릭이 오지 않아도 디버거가 계속 붙어 있지 않다.
- 오픈 일정 변경 판정은 5초 여유를 둔다. 초 단위 카운트다운이 3초 남았다고 대기를 끝내지 않는다.

이 최적화는 로컬 고정 지연을 줄이는 것이다. 서버 도착 순서, 네트워크 왕복 시간, 동시 접속자 수가 순번에 더 크게 작용한다.

## 검증

- `node --test tools/*.test.mjs` — CDP 명령 순서, 부착 후 문서 변경 중단, 문서 불일치·비지원 호스트·좌표 오류 거부, attach 실패 시 detach 없음, 준비된 부착 재사용·해제, 콘텐츠 헬퍼의 좌표 계산과 폴백을 검사한다(21개 통과).
- `tools/wait-cancellation-regression.html` — 실제 DOM에서 헬퍼가 클릭 요청을 보내고, 디버거 실패 시 기존 클릭으로 폴백하는 경로를 검사한다. `python3 -m http.server 18770 --bind 127.0.0.1`로 연 뒤 `?case=normal`, `?case=cancel`, `?case=failed-clear`, `?case=failed-save`를 확인한다(4개 통과).
- 준비된 부착은 헤드리스 Chrome에서 실제 `chrome.debugger`로 확인하지 못했다. 단위 테스트는 명령 순서와 해제 경로만 검사한다.

## 한계

- 실제 NOL 오픈에서 자동 클릭 후 화면 이동은 아직 관찰하지 않았다. 이 수정은 `isTrusted` 차단이라는 관찰과 CDP 입력 동작에 근거하며, 대기열·좌석 도착은 별도 탐색 관찰로 확인해야 한다.
- `debugger` 권한이 추가되어 설치 경고가 늘고, 디버거가 붙는 동안 Chrome에 디버깅 안내 표시줄이 나타난다. 오픈 3초 전부터는 이 표시줄이 보일 수 있다.
- 같은 탭에 DevTools가 열려 있거나 다른 확장이 디버거를 붙이고 있으면 attach가 실패한다. 이때는 미리 붙이기도 실패하고 클릭 시점에도 기존 합성 클릭으로 폴백한다.
- CDP 클릭은 실제 사용자 입력으로 취급되므로 팝업 차단 완화도 기대할 수 있지만, 이번 변경만으로 이전 팝업 차단 문제가 해결됐다고 단정하지 않는다.
- 대기열 10만 명 규모에서는 로컬 지연 수십 ms보다 네트워크와 서버 처리 순서의 영향이 크다. 이 경로는 "조금 더 빠르게" 만들 뿐 순번을 보장하지 않는다.
