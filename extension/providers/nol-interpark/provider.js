globalThis.startBookingWait({
  name: "NOL",
  isGate: location.pathname.startsWith("/gates/ticket/"),
  inspect: globalThis.nolUpcoming.inspect,
  selection: globalThis.mecroSelection,
  findButton: globalThis.nolInterparkBooking.findButton,
});
