/**
 * thinking-window — wrap the model's thinking stream in a fixed-height box that
 * scrolls like a sliding window (always showing the newest lines).
 *
 * Works by runtime-patching Pi's internal AssistantMessageComponent (see
 * internal-patch.ts). Set the box height with /thinking-window <rows> or the
 * THINKING_WINDOW_HEIGHT env var (default 12, min 4). Toggle with /thinking-window
 * toggle (or the configured shortcut — see the "thinkingWindow" key in settings.json).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { retainThinkingWindowPatch } from "./internal-patch.ts";
import { parseToggleKey } from "./config.ts";
import {
  getBoxHeight,
  setBoxHeight,
  MIN_BOX_HEIGHT,
  isEnabled,
  toggleEnabled,
} from "./state.ts";

const HIDDEN_LABEL = "Thinking...";

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
export default function (pi: ExtensionAPI) {
  let release: (() => Promise<void>) | undefined;

  const notify = (ctx: ExtensionContext, message: string, level: "info" | "warning") => {
    if (ctx.hasUI) ctx.ui.notify(message, level);
    else if (level === "warning") console.warn(message);
    else console.info(message);
  };

  // Full repaint without printing a notify line. Our boxes ignore the hidden
  // thinking label, so re-setting it is a no-op visually but forces every
  // AssistantMessageComponent to rebuild (via setHiddenThinkingLabel ->
  // updateContent) and requestRender() — which re-renders all thinking windowes
  // with the current height/enabled state.
  const repaint = (ctx: ExtensionContext) => {
    if (ctx.hasUI) ctx.ui.setHiddenThinkingLabel(HIDDEN_LABEL);
  };

  pi.registerCommand("thinking-window", {
    description:
      "Set box height (/thinking-window <rows>), toggle it (/thinking-window toggle), or show status",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        notify(
          ctx,
          `Thinking window: ${isEnabled() ? "on" : "off"}, height ${getBoxHeight()} (/thinking-window <rows>≥${MIN_BOX_HEIGHT} | toggle)`,
          "info",
        );
        return;
      }
      if (trimmed.toLowerCase() === "toggle") {
        const on = toggleEnabled();
        repaint(ctx);
        notify(ctx, `Thinking window ${on ? "on" : "off"}`, "info");
        return;
      }
      const n = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < MIN_BOX_HEIGHT) {
        notify(ctx, `Usage: /thinking-window <rows> (integer ≥ ${MIN_BOX_HEIGHT}) | toggle`, "warning");
        return;
      }
      setBoxHeight(n);
      repaint(ctx);
      notify(ctx, `Thinking window height set to ${getBoxHeight()}`, "info");
    },
  });

  pi.registerShortcut(parseToggleKey(), {
    description: "Thinking window: toggle on/off (configurable via config.json toggleKey)",
    handler: async (ctx) => {
      const on = toggleEnabled();
      repaint(ctx);
      notify(ctx, `Thinking window ${on ? "on" : "off"}`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      release = await retainThinkingWindowPatch();
      if (ctx.hasUI) {
        ctx.ui.setStatus("thinking-window", `box:${getBoxHeight()}${isEnabled() ? "" : " off"}`);
      }
    } catch (error) {
        release = undefined;
        notify(
          ctx,
          `Thinking Window disabled this session (Pi internals incompatible): ${formatError(error)}`,
        "warning",
      );
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus("thinking-window", undefined);
    if (release) {
      const current = release;
      release = undefined;
      try {
        await current();
      } catch (error) {
        notify(
          ctx,
          `Thinking Window cleanup failed: ${formatError(error)}`,
          "warning",
        );
      }
    }
  });
}
