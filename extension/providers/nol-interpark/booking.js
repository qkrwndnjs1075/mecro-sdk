(() => {
  function findButton() {
    const buttons = [...document.querySelectorAll('button')].filter(button => {
      const style = getComputedStyle(button);
      return /^(?:일반\s*)?예매하기$/.test(button.textContent.trim())
        && button.getClientRects().length > 0
        && style.visibility === 'visible'
        && !button.closest('[inert], [aria-hidden="true"]');
    });
    if (buttons.length !== 1) return null;
    const button = buttons[0];
    return button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true'
      ? null : button;
  }

  globalThis.nolInterparkBooking = { findButton };
})();
