import { wrapTextWithAnsi, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface ThinkingThemeLike {
  fg(color: string, text: string): string;
  italic(text: string): string;
}

/**
 * Fixed-height (but dynamic) box that renders the thinking stream.
 *
 * The box height is `contentRows + 2` (borders). `contentRows` is the smaller
 * of the configured height (minus borders) and the actual wrapped thinking, so
 * short thinking renders in a snug box instead of a big empty one; once
 * thinking exceeds the configured height the box caps there and the content
 * shows the newest `contentRows` lines — a sliding window anchored to the
 * latest tokens, which is what makes the text appear to scroll as it streams.
 *
 * `height` is injected at construction (the caller reads the live value from
 * shared state), so render() is a pure function of its inputs and the box still
 * reflows on every repaint — the patch rebuilds this component on each
 * `updateContent` with the current height.
 */
export class ThinkingWindowComponent {
  constructor(
    private theme: ThinkingThemeLike,
    private text: string,
    private height: number,
  ) {}

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 4); // "│ " + text + " │"
    const border = (s: string) => this.theme.fg("borderMuted", s);

    const styled = this.text.trim()
      ? this.theme.italic(this.theme.fg("thinkingText", this.text))
      : this.theme.fg("dim", "thinking hidden by provider");
    const wrapped = wrapTextWithAnsi(styled, innerWidth);

    // Dynamic height: shrink to fit short thinking, cap at the configured
    // height (then scroll). `height` is already floored at MIN_BOX_HEIGHT.
    const contentRows = Math.min(Math.max(1, this.height - 2), wrapped.length);

    // Sliding window: keep the newest contentRows lines.
    const tail = wrapped.slice(-contentRows);
    const padTop = Math.max(0, contentRows - tail.length);

    const rows: string[] = [];
    for (let i = 0; i < padTop; i++) {
      rows.push(border("│ ") + " ".repeat(innerWidth) + border(" │"));
    }
    for (const line of tail) {
      const body = truncateToWidth(line, innerWidth);
      const pad = " ".repeat(Math.max(0, innerWidth - visibleWidth(body)));
      rows.push(border("│ ") + body + pad + border(" │"));
    }

    const rule = "─".repeat(Math.max(0, width - 2));
    return [border("┌" + rule + "┐"), ...rows, border("└" + rule + "┘")];
  }
}
