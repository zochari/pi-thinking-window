# pi-thinking-window

Render Pi's model **thinking** stream inside a fixed-height box that scrolls
like a sliding window — always showing the newest lines — instead of Pi's native
full-height thinking block.

Works by runtime-patching Pi's internal `AssistantMessageComponent`. Set the box
height with `/thinking-window <rows>` or the `THINKING_WINDOW_HEIGHT` env var
(default 12, min 4). Toggle with `/thinking-window toggle` (or the configured
shortcut).

## Install

```bash
# git (this repo)
pi install git:github.com/zochari/pi-thinking-window@v0.1.0

# npm (after publish)
pi install npm:pi-thinking-window
```

Local testing without installing:

```bash
pi -e .          # ephemeral load
pi install ./    # add this path to settings
```

## Usage

| Command | Effect |
|---|---|
| `/thinking-window` | Show status (on/off + current height) |
| `/thinking-window <rows>` | Set box height (integer ≥ 4) |
| `/thinking-window toggle` | Turn the box on/off |
| `Alt+Shift+B` (default) | Toggle (configurable, see below) |

The box caps at the configured height; once thinking exceeds it, the view keeps
the newest `height` lines so the text appears to scroll as it streams. Short
thinking renders in a snug box instead of a big empty one.

## Configuration

On first load the extension creates a `thinkingWindow` block in Pi's global
`~/.pi/agent/settings.json` (auto-materialized with defaults; unknown keys are
preserved):

```json
{
  "thinkingWindow": {
    "height": 12,            // box ceiling (rows); THINKING_WINDOW_HEIGHT env wins
    "enabled": true,         // render the box on load
    "toggleKey": "alt+shift+b" // toggle shortcut, as a KeyId string
  }
}
```

- `height` — box height in rows (env `THINKING_WINDOW_HEIGHT` overrides).
- `enabled` — whether the box renders on load.
- `toggleKey` — shortcut to toggle; modifiers order-insensitive
  (`"ctrl+shift+t"`, `"f5"`, `"alt+b"` all valid).

## Compatibility

This extension patches Pi internals (`AssistantMessageComponent.prototype.updateContent`
from `dist/modes/interactive/components/assistant-message.js`), so it is
**version-sensitive**. It was built and tested against **Pi 0.80.6**. If a Pi
upgrade changes those internals, the extension degrades gracefully to Pi's
native thinking renderer for that session (with a warning) instead of crashing.

## Credits

Runtime-patch technique adapted from
[crustyhacker/pi-thinking-steps](https://github.com/crustyhacker/pi-thinking-steps)
(MIT).

## License

MIT
