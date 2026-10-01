/**
 * The dev build: nothing costs anything, builds and upgrades finish almost at once, and everything is unlocked from
 * the start (the commander at the top of the Level Road with every tech it brings, every card at its highest level,
 * every engine and drive train owned, every deck open). On when the page says so (the dev build sets
 * `window.IRONCRAWL_DEV`) or the address has `?dev` in it.
 */
export const DEV: boolean = (() => {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { IRONCRAWL_DEV?: boolean };
  return !!w.IRONCRAWL_DEV || /[?&]dev(=|&|$)/.test(window.location?.search ?? '');
})();

/** How much faster builds, upgrades, the forge and the robot workshop run in the dev build. */
export const DEV_BUILD_SPEED = 40;
