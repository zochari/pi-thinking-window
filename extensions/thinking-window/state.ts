/**
 * Shared state for the thinking window.
 *
 * - Height is read live by the patch each time it rebuilds a box component (on
 *   every `updateContent`), so changing it reflows every visible box on the
 *   next TUI repaint without rebuilding the assistant message components that
 *   own those boxes.
 * - `enabled` gates the box vs Pi's native thinking rendering.
 *
 * Initial values come from config (see config.ts), with the
 * THINKING_WINDOW_HEIGHT env var still overriding height.
 */
import { getInitialHeight, getInitialEnabled } from "./config.ts";

const MIN_HEIGHT = 4;

let boxHeight = Math.max(MIN_HEIGHT, Math.floor(getInitialHeight()));
let enabled = getInitialEnabled();

export function getBoxHeight(): number {
  return boxHeight;
}

export function setBoxHeight(height: number): void {
  const n = Number.isFinite(height) ? Math.floor(height) : boxHeight;
  boxHeight = Math.max(MIN_HEIGHT, n);
}

export function isEnabled(): boolean {
  return enabled;
}

export function toggleEnabled(): boolean {
  enabled = !enabled;
  return enabled;
}

export const MIN_BOX_HEIGHT = MIN_HEIGHT;
