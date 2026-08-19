export const mobile = window.matchMedia("(max-width: 767px)").matches;
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const motionScale = reducedMotion ? 0.18 : 1;
export const CAN_Z = mobile ? -5.6 : -6.2;

export function smoothStep(value) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function easeOutBack(value) {
  const c1 = 2.2;
  return 1 + (c1 + 1) * (value - 1) ** 3 + c1 * (value - 1) ** 2;
}
