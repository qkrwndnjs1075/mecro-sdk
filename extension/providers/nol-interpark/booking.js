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

  function isLoading() {
    return [...document.querySelectorAll("main h1")].some(heading =>
      heading.getClientRects().length > 0 && getComputedStyle(heading).visibility === "visible"
      && heading.textContent.replace(/\s+/g, "") === "예매에필요한정보를확인하고있어요");
  }

  globalThis.nolInterparkBooking = { findButton, isLoading };
})();
