(() => {
  const visible = element => element.getClientRects().length > 0;
  const calendars = () => [...document.querySelectorAll('.react-calendar')].filter(visible);
  const dates = calendar => [...calendar.querySelectorAll('button.react-calendar__tile abbr[aria-label]')].filter(visible);
  const sessions = () => [...document.querySelectorAll('button[data-is-selected] time[datetime]')].filter(visible);
  const selectedDate = calendar => {
    const selected = dates(calendar).filter(date => date.closest('button').classList.contains('react-calendar__tile--active'));
    return selected.length === 1 ? selected[0].getAttribute('aria-label') : null;
  };

  function read() {
    const found = calendars();
    if (found.length !== 1) return { message: '회차 선택 화면을 확인할 수 없습니다.' };
    const selected = sessions().filter(time => time.closest('button').getAttribute('data-is-selected') === 'true');
    if (selected.length > 1) return { message: '선택한 회차를 구분할 수 없습니다.' };
    const date = selectedDate(found[0]);
    if (!date || selected.length !== 1) return { message: '회차를 선택해 주세요' };
    return { date, time: selected[0].getAttribute('datetime') };
  }

  async function restore({ date, time }, isCurrent) {
    const target = /^(\d{4})년 (\d{1,2})월 (\d{1,2})일$/.exec(date);
    if (!target || !/^\d{2}:\d{2}$/.test(time)) return false;
    const targetMonth = Number(target[1]) * 12 + Number(target[2]);
    const deadline = performance.now() + 15000;
    const initialURL = location.href;
    let nextAction = 0;
    let confirmedAt = null;
    while (performance.now() < deadline && isCurrent() && location.href === initialURL) {
      const found = calendars();
      if (found.length > 1) return false;
      const calendar = found[0];
      if (calendar && performance.now() >= nextAction) {
        const matches = dates(calendar).filter(item => item.getAttribute('aria-label') === date);
        if (matches.length > 1) return false;
        const day = matches[0]?.closest('button');
        if (day && !day.disabled && selectedDate(calendar) !== date) {
          day.click();
          nextAction = performance.now() + 500;
          confirmedAt = null;
        } else if (selectedDate(calendar) === date) {
          const times = sessions().filter(item => item.getAttribute('datetime') === time);
          if (times.length > 1) return false;
          const button = times[0]?.closest('button');
          if (button && !button.disabled) {
            const current = read();
            if (current.date === date && current.time === time) {
              confirmedAt ??= performance.now();
              if (performance.now() - confirmedAt >= 500) return true;
            } else {
              button.click();
              confirmedAt = null;
              nextAction = performance.now() + 300;
            }
          } else confirmedAt = null;
        } else {
          const label = calendar.querySelector('.react-calendar__navigation__label')?.textContent.trim();
          const month = /^(\d{4})\.(\d{1,2})$/.exec(label ?? '');
          if (month) {
            const displayedMonth = Number(month[1]) * 12 + Number(month[2]);
            if (displayedMonth !== targetMonth) {
              const direction = displayedMonth < targetMonth ? 'next' : 'prev';
              const arrow = calendar.querySelector(`.react-calendar__navigation__${direction}-button`);
              if (arrow && !arrow.disabled) {
                arrow.click();
                nextAction = performance.now() + 500;
              }
            }
          }
          confirmedAt = null;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  globalThis.mecroSelection = { read, restore };
})();
