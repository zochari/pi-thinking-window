## 0.1.4

- Revert: removed the `pi-cursor-sdk`-specific handling from 0.1.3. That provider can emit the same tool call as both a real `toolCall` entry (a proper tool box) and a redundant `thinking`-typed activity trace describing the same call, with no shared identifier between them — so the duplicate can't be reliably detected client-side. Rendering the trace as plain text (0.1.3) just relocated the duplicate from inside the thinking box to a separate line; it didn't remove it. The actual fix belongs upstream in `pi-cursor-sdk` (skip emitting the trace for tools whose real entry is already recorded). The `cursorActivityFix` setting is removed; all thinking content is coalesced and boxed uniformly again, as in 0.1.2.

## 0.1.3

- Fix: when running under the `pi-cursor-sdk` provider, tool/activity traces that it emits as `thinking` blocks (e.g. "Cursor read did not complete: …") are no longer boxed as model reasoning. They render as a neutral status line instead, so tool activity no longer appears inside the thinking box. Detection is scoped to Cursor's single-line "Cursor <activity>: <summary>" fingerprint, so native providers are unaffected. Toggle with the `cursorActivityFix` setting (default on).

## 0.1.2

- Fix: adjacent thinking blocks in a single assistant message are coalesced into one box, matching Pi's native updateContent (and its own test suite). The previous per-entry rendering produced "multiple thinking boxes in a row" whenever the content array carried more than one consecutive thinking entry (which it routinely does).
- Fix: patched updateContent now sets `this.hasToolCalls` like the original, so assistant messages containing tool calls are no longer wrapped in OSC133 shell-integration zones they were never meant to get.
## 0.1.1

- Fix: box now persists for previous (historical) messages, not just the live one. Resumed / switched / forked sessions render history before the extension binds, so their thinking was painted with Pi's native renderer; a repaint after the patch lands re-boxes them.
- Fix: turns where the model calls a tool alongside thinking (the common case in agentic sessions) no longer fall back to Pi's native, unboxed thinking renderer. Tool-call content is left for Pi to render elsewhere, as it always was; only the extra bail-out that dropped the whole custom render was removed.
- Fix: interleaved thinking (thinking, tool call, more thinking, ...) no longer merges every thinking segment in the turn into one box anchored at the first segment. Each segment now gets its own box in original order and freezes once that segment ends, matching Pi's native per-segment rendering; previously a later segment's tokens kept streaming into an earlier, already-answered-looking box after its tool call had already rendered below it.

## 0.1.0

- Initial release: render Pi's thinking stream in a fixed-height sliding-window box.
- `/thinking-window <rows>` to set height, `/thinking-window toggle` to flip, `Alt+Shift+B` default shortcut.
- Auto-materializes a `thinkingWindow` config block in `~/.pi/agent/settings.json` (height, enabled, toggleKey).
- Tested against Pi 0.80.6; degrades gracefully to native thinking rendering if Pi internals drift.
