# Changelog

## Unreleased

- Fix: box now persists for previous (historical) messages, not just the live one. Resumed / switched / forked sessions render history before the extension binds, so their thinking was painted with Pi's native renderer; a repaint after the patch lands re-boxes them.
- Fix: turns where the model calls a tool alongside thinking (the common case in agentic sessions) no longer fall back to Pi's native, unboxed thinking renderer. Tool-call content is left for Pi to render elsewhere, as it always was; only the extra bail-out that dropped the whole custom render was removed.

## 0.1.0

- Initial release: render Pi's thinking stream in a fixed-height sliding-window box.
- `/thinking-window <rows>` to set height, `/thinking-window toggle` to flip, `Alt+Shift+B` default shortcut.
- Auto-materializes a `thinkingWindow` config block in `~/.pi/agent/settings.json` (height, enabled, toggleKey).
- Tested against Pi 0.80.6; degrades gracefully to native thinking rendering if Pi internals drift.
